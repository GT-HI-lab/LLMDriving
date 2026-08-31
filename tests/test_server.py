import json
import os
import tempfile
import unittest
from datetime import datetime
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

import server
from assistant_modes import (
    ASSISTANT_MODES,
    CLOSURE_GATE,
    CLOSURE_GATE_ELAPSED_SECONDS,
    CONVERGENCE_ELAPSED_SECONDS,
    CONTROLLER_VERSION,
    EXACT_CLOSING,
    MAXIMUM_CONVERSATION_ELAPSED_SECONDS,
    MINIMUM_RESPONSE_BATCHES,
    MINIMUM_SYNTHESIS_ELAPSED_SECONDS,
    POST_CLOSING_FAREWELL,
    PROMPT_VERSION,
    SCENARIOS,
    TURN_CONTROLLER_SETTINGS,
    build_instructions,
    public_study_config,
)


class ServerTests(unittest.TestCase):
    def make_settings(self, **overrides):
        values = dict(
            api_key="test-key",
            model="gpt-realtime-2.1",
            voice="marin",
            transcription_model="gpt-4o-mini-transcribe",
            input_language="en",
            safety_identifier="local-demo-user",
            host="127.0.0.1",
            port=8000,
            tls_cert_file=None,
            tls_key_file=None,
        )
        values.update(overrides)
        return server.Settings(**values)

    def event_payload(self, participant_id="P001"):
        return {
            "schema_version": "1.0",
            "prompt_version": PROMPT_VERSION,
            "participant_id": participant_id,
            "scenario": {"id": "trip", "label": "Trip"},
            "route": {"id": "cognitive", "label": "Cognitive"},
            "events": [],
            "turns": [],
        }

    def test_placeholder_key_is_not_configured(self):
        settings = self.make_settings(api_key="YOUR_OPENAI_API_KEY_HERE")
        self.assertFalse(settings.api_key_is_configured)

    def test_session_config_uses_shared_voice_and_research_vad(self):
        for scenario in ("trip", "end_of_day"):
            for mode_name in ("cognitive", "neutral", "affective"):
                with self.subTest(scenario=scenario, mode=mode_name):
                    payload = json.loads(
                        server.build_session_config(
                            self.make_settings(), mode_name, scenario
                        )
                    )
                    self.assertEqual(payload["type"], "realtime")
                    self.assertEqual(payload["model"], "gpt-realtime-2.1")
                    self.assertEqual(payload["output_modalities"], ["audio"])
                    self.assertEqual(payload["audio"]["output"]["voice"], "marin")
                    self.assertEqual(payload["audio"]["output"]["speed"], 1.0)
                    self.assertEqual(payload["reasoning"]["effort"], "low")
                    self.assertEqual(
                        payload["audio"]["input"]["noise_reduction"]["type"],
                        "far_field",
                    )
                    self.assertNotIn("temperature", payload)
                    self.assertEqual(
                        payload["audio"]["input"]["transcription"]["language"],
                        "en",
                    )
                    self.assertEqual(
                        payload["audio"]["input"]["turn_detection"],
                        {
                            "type": "semantic_vad",
                            "eagerness": "medium",
                            "create_response": False,
                            "interrupt_response": False,
                        },
                    )
                    self.assertIn("Regular exploration turns: 20-35", payload["instructions"])
                    self.assertIn("Confirmed close:", payload["instructions"])
                    self.assertIn("Do not repeat the full", payload["instructions"])
                    self.assertIn("[STUDY PACING CONTROL]", payload["instructions"])
                    self.assertIn("one continuous assistant message", payload["instructions"])
                    self.assertIn("no usable content", payload["instructions"])
                    self.assertIn("Listening repair overrides", payload["instructions"])
                    self.assertIn("voice or tone changed", payload["instructions"])
                    self.assertIn("vocal register", payload["instructions"])
                    self.assertIn(CLOSURE_GATE, payload["instructions"])
                    self.assertIn(EXACT_CLOSING, payload["instructions"])
                    self.assertIn(POST_CLOSING_FAREWELL, payload["instructions"])

    def test_route_and_scenario_prompts_are_composed(self):
        cognitive_trip = build_instructions("cognitive", "trip")
        affective_trip = build_instructions("affective", "trip")
        cognitive_day = build_instructions("cognitive", "end_of_day")
        affective_day = build_instructions("affective", "end_of_day")

        self.assertIn("Decision Brief", cognitive_trip)
        self.assertIn("Experience Portrait", affective_trip)
        self.assertIn("deciding which days to exercise", cognitive_day)
        self.assertIn("raises a practical task", affective_day)
        self.assertIn("Gentle-option rule", affective_trip)
        self.assertNotIn("Gentle-option rule", cognitive_trip)
        self.assertIn("not necessarily three", cognitive_trip)
        self.assertIn("three-night trip", cognitive_trip)
        self.assertIn("What matters most to you", cognitive_trip)
        self.assertIn("at least three relevant criteria", cognitive_trip)
        self.assertIn("options that you introduced", cognitive_trip)
        self.assertIn("restorative-versus-lively binary", cognitive_trip)
        self.assertIn("Move through four functions", cognitive_trip)
        self.assertIn("Move through four functions", affective_trip)
        self.assertIn("Use breadth before depth", cognitive_trip)
        self.assertIn("two plausible broad trip structures", cognitive_trip)
        self.assertIn("Budget may be explored only after", cognitive_trip)
        self.assertIn("Do not require a ranked", cognitive_trip)
        self.assertIn("remaining uncertainty as valid answers", cognitive_trip)
        self.assertIn("Do not merely interview", cognitive_trip)
        self.assertIn("prioritize trip features", affective_trip)
        self.assertIn("allocate time between features", affective_trip)
        self.assertIn("Do not march sequentially", affective_trip)
        self.assertIn("no more than two category-focused questions", affective_trip)
        self.assertIn("Never ask category-focused questions in two", affective_trip)
        self.assertIn("the next substantive question must explore why", affective_trip)
        self.assertIn('"priority," "must-have," "tie-breaker,"', affective_trip)
        self.assertIn("those belong to the cognitive route", affective_trip)
        self.assertIn("warm or curious rhythm", affective_trip)
        self.assertIn("examine at least one alternative", cognitive_day)
        self.assertIn("map the main task categories", cognitive_day)
        self.assertIn("determine what useful result", cognitive_day)
        self.assertIn("choose breadth or depth on the participant", cognitive_day)
        self.assertIn("what part is still lingering", affective_day)
        self.assertIn("After no more than two consecutive advice", affective_day)
        self.assertIn("must reconnect the practical", affective_day)
        self.assertIn("do not repackage the", affective_day)
        self.assertIn("mixed desire, ambivalence", affective_day)
        self.assertIn(CLOSURE_GATE, cognitive_trip)
        self.assertIn("Do not repeat the full synthesis", cognitive_day)

    def test_public_config_drives_condition_blind_participant_view(self):
        config = public_study_config()
        self.assertEqual(config["prompt_version"], PROMPT_VERSION)
        self.assertEqual(config["controller_version"], CONTROLLER_VERSION)
        self.assertEqual(
            config["assistant"],
            {"name": "Nomi", "voice": "marin", "speed": 1.0},
        )
        self.assertEqual(
            config["turn_detection"],
            {
                "type": "semantic_vad",
                "eagerness": "medium",
                "create_response": False,
                "interrupt_response": False,
            },
        )
        self.assertEqual(
            config["pacing"],
            {
                "minimum_synthesis_elapsed_seconds": (
                    MINIMUM_SYNTHESIS_ELAPSED_SECONDS
                ),
                "minimum_response_batches": MINIMUM_RESPONSE_BATCHES,
                "convergence_elapsed_seconds": CONVERGENCE_ELAPSED_SECONDS,
                "closure_gate_elapsed_seconds": CLOSURE_GATE_ELAPSED_SECONDS,
                "maximum_elapsed_seconds": (
                    MAXIMUM_CONVERSATION_ELAPSED_SECONDS
                ),
            },
        )
        self.assertEqual(config["closure_gate"], CLOSURE_GATE)
        self.assertEqual(config["exact_closing"], EXACT_CLOSING)
        self.assertEqual(
            config["post_closing_farewell"], POST_CLOSING_FAREWELL
        )
        self.assertEqual(
            config["scenarios"]["trip"]["opening"],
            (
                "Hi, I'm Nomi. It's good to talk with you. "
                "What would you like to talk about today?"
            ),
        )
        self.assertEqual(
            config["scenarios"]["end_of_day"]["opening"],
            "Hi, I'm Nomi. It's good to talk with you. How has your day been?",
        )
        trip_instructions = config["scenarios"]["trip"][
            "participant_instructions"
        ]
        starters = {
            trip_instructions[mode]["starter"] for mode in trip_instructions
        }
        bodies = {trip_instructions[mode]["body"] for mode in trip_instructions}
        titles = {trip_instructions[mode]["title"] for mode in trip_instructions}
        self.assertEqual(
            starters,
            {
                "I have three free days for a getaway. Help me decide what kind "
                "of trip would suit me best."
            },
        )
        self.assertEqual(len(bodies), 1)
        self.assertEqual(titles, {"Trip Preferences"})
        self.assertNotIn("route_instructions", config["scenarios"]["trip"])
        self.assertNotIn("instructions", config["modes"]["cognitive"])

    def test_end_of_day_preparation_is_route_specific_and_natural(self):
        instructions = public_study_config()["scenarios"]["end_of_day"][
            "participant_instructions"
        ]
        cognitive = instructions["cognitive"]
        affective = instructions["affective"]

        self.assertEqual(cognitive["title"], "End of Day")
        self.assertEqual(affective["title"], "End of Day")
        self.assertIn("practical task, decision, or plan", cognitive["body"])
        self.assertEqual(
            cognitive["emphasis"],
            "Think of one practical task, decision, or plan from today or the "
            "coming week that you would genuinely like help thinking through",
        )
        self.assertIn(cognitive["emphasis"], cognitive["body"])
        self.assertIn("recent experience or concern", affective["body"])
        self.assertEqual(
            affective["emphasis"],
            "Think of a recent experience or concern that has stayed on your "
            "mind—perhaps something that left you uncertain, tense, "
            "disappointed, or with mixed feelings",
        )
        self.assertIn(affective["emphasis"], affective["body"])
        self.assertIn("feel comfortable discussing", affective["body"])
        self.assertNotIn("low-stakes", affective["body"])
        self.assertNotIn("major issue", affective["body"])

    def test_neutral_route_remains_available(self):
        self.assertIn("neutral", ASSISTANT_MODES)
        for scenario in SCENARIOS.values():
            self.assertIn("neutral", scenario["route_instructions"])
            self.assertIn("neutral", scenario["participant_instructions"])

    def test_two_stage_html_keeps_condition_labels_out_of_participant_sections(self):
        html = (server.STATIC_DIR / "index.html").read_text(encoding="utf-8")
        instruction_section = html.split(
            'id="participantInstructionView"', 1
        )[1].split('id="conversationView"', 1)[0]
        conversation_section = html.split('id="conversationView"', 1)[1]

        for condition_label in ("Cognitive", "Affective", "Neutral"):
            self.assertNotIn(condition_label, instruction_section)
            self.assertNotIn(condition_label, conversation_section)
        self.assertIn('id="researcherView"', html)
        self.assertIn('id="participantInstructionView"', html)
        self.assertIn('id="conversationView"', html)
        self.assertIn('id="conversationInstruction"', html)
        self.assertIn('class="voice-orb static-orb"', html)
        self.assertIn('id="voiceOrb" class="voice-orb idle"', html)
        self.assertNotIn('class="step-strip"', html)
        self.assertNotIn("<small>", html)
        self.assertNotIn('id="consentConfirmed"', html)

    def test_participant_instruction_lifecycle_and_minimal_status_copy(self):
        script = (server.STATIC_DIR / "app.js").read_text(encoding="utf-8")
        self.assertIn(
            '"clear_coalesced_transcription",',
            script,
        )
        self.assertNotIn(
            'hideConversationInstruction("speech_stopped", event.item_id)',
            script,
        )
        self.assertIn('showParticipantStatus("Starting…")', script)
        self.assertIn('showParticipantStatus("Saving conversation…")', script)
        self.assertIn(
            "Conversation complete. Please return the device to the researcher.",
            script,
        )

    def test_browser_gates_responses_on_transcribed_speech_and_logs_output_items(self):
        script = (server.STATIC_DIR / "app.js").read_text(encoding="utf-8")
        self.assertIn("function hasMeaningfulTranscript", script)
        self.assertIn("function classifyUnusableTranscript", script)
        self.assertIn('"participant_turn_ignored"', script)
        self.assertIn('type: "conversation.item.delete"', script)
        self.assertIn("requestParticipantResponse(", script)
        self.assertIn("function drainQueuedParticipantResponses", script)
        self.assertIn("RESPONSE_GRACE_MS = 0", script)
        self.assertIn("INCOMPLETE_TRANSCRIPT_GRACE_MS = 300", script)
        self.assertIn("function isClearlyIncompleteTranscript", script)
        self.assertIn("function cancelPrePlaybackResponseForContinuation", script)
        self.assertIn('type: "response.cancel"', script)
        self.assertIn("assistant_response_cancelled_for_continuation", script)
        self.assertIn("assistant_response_released_immediately", script)
        self.assertIn('blockers.push("participant_speaking")', script)
        self.assertIn('blockers.push("assistant_audio_playing")', script)
        self.assertIn("openingPlaybackPending", script)
        self.assertIn("sendPacingControlIfNeeded", script)
        self.assertIn('role: "system"', script)
        self.assertIn('"assistant_response_requested"', script)
        self.assertIn('"assistant_output_item_added"', script)
        self.assertIn("output_item_count", script)
        self.assertIn("assistant_response_in_progress", script)
        self.assertIn("const pendingTranscriptionItemIds = new Set()", script)
        self.assertIn(
            'blockers.push("participant_transcription_pending")', script
        )
        self.assertIn(
            'markTranscriptionPending(event.item_id, "speech_started")',
            script,
        )
        self.assertIn(
            'resolvePendingTranscription(event.item_id, "completed")',
            script,
        )
        self.assertIn("pendingTranscriptionItemIds.size === 0", script)

        audio_started_handler = script.split(
            'case "output_audio_buffer.started":', 1
        )[1].split('case "output_audio_buffer.stopped":', 1)[0]
        self.assertIn("setMicrophoneEnabled(false)", audio_started_handler)

        audio_ended_handler = script.split(
            'case "output_audio_buffer.stopped":', 1
        )[1].split('case "error":', 1)[0]
        self.assertIn("setMicrophoneEnabled(true)", audio_ended_handler)

        self.assertIn("summarizeAppliedSessionSettings", script)
        self.assertIn("applied_session: latestAppliedSessionSettings", script)
        self.assertIn("latest_applied_session", script)
        self.assertIn("controller_version: studyConfig.controller_version", script)
        self.assertIn('voiceOrb.classList.remove("idle")', audio_started_handler)
        self.assertIn('voiceOrb.classList.add("idle")', audio_ended_handler)
        self.assertIn("pacingConvergenceSent", script)
        self.assertIn("pacingClosureGateSent", script)
        self.assertIn("pacingMaximumSent", script)
        self.assertIn('state = "convergence_required"', script)
        self.assertIn('state = "closure_gate_required"', script)
        self.assertIn('state = "upper_bound_reached"', script)
        self.assertIn("closure_gate_detected", script)
        self.assertIn("function isBriefPostClosingAcknowledgment", script)
        self.assertIn("studyConfig.post_closing_farewell", script)
        self.assertIn("automatic_stop_after_farewell", script)
        self.assertIn("closure_followup_control_sent", script)
        self.assertIn("renderInstructionBody", script)

    def test_public_config_describes_turn_controller_safeguards(self):
        config = public_study_config()
        self.assertEqual(
            config["realtime"]["response_trigger"],
            TURN_CONTROLLER_SETTINGS["response_trigger"],
        )
        self.assertTrue(config["realtime"]["pending_transcription_barrier"])
        self.assertEqual(
            config["realtime"]["microphone_policy"],
            "muted_during_assistant_audio_playback",
        )
        self.assertEqual(config["realtime"]["continuation_grace_ms"], 0)
        self.assertEqual(
            config["realtime"]["incomplete_transcript_grace_ms"], 300
        )
        self.assertTrue(
            config["realtime"][
                "cancel_pre_playback_response_on_continuation"
            ]
        )

    def test_invalid_mode_and_scenario_are_rejected(self):
        self.assertFalse(server.assistant_mode_is_valid("unsupported"))
        with self.assertRaisesRegex(ValueError, "Unsupported assistant mode"):
            server.build_session_config(
                self.make_settings(), "unsupported", "trip"
            )
        with self.assertRaisesRegex(ValueError, "Unsupported scenario"):
            server.build_session_config(
                self.make_settings(), "cognitive", "unsupported"
            )

    def test_multipart_contains_both_fields_and_closing_boundary(self):
        body = server.encode_multipart(
            {"sdp": "v=0\r\n", "session": "{}"}, "test-boundary"
        )
        self.assertIn(b'name="sdp"', body)
        self.assertIn(b'name="session"', body)
        self.assertTrue(body.endswith(b"--test-boundary--\r\n"))

    def test_env_file_does_not_override_existing_environment(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env"
            path.write_text("EXAMPLE_SETTING=from-file\n", encoding="utf-8")
            with patch.dict(
                os.environ, {"EXAMPLE_SETTING": "from-shell"}, clear=False
            ):
                server.load_env_file(path)
                self.assertEqual(os.environ["EXAMPLE_SETTING"], "from-shell")

    def test_participant_id_validation(self):
        for participant_id in ("P001", "study_12", "participant-9"):
            with self.subTest(participant_id=participant_id):
                self.assertTrue(server.participant_id_is_valid(participant_id))
        for participant_id in (
            "",
            "has space",
            "../escape",
            "참가자1",
            "a" * 65,
        ):
            with self.subTest(participant_id=participant_id):
                self.assertFalse(server.participant_id_is_valid(participant_id))

    def test_recording_extensions(self):
        self.assertEqual(server.recording_extension("audio/webm;codecs=opus"), ".webm")
        self.assertEqual(server.recording_extension("audio/mp4"), ".m4a")
        self.assertEqual(server.recording_extension("audio/ogg; codecs=opus"), ".ogg")
        self.assertIsNone(server.recording_extension("application/octet-stream"))

    def test_recording_stem_validation(self):
        for recording_stem in ("260721_P001", "260721_study_12_02"):
            with self.subTest(recording_stem=recording_stem):
                self.assertTrue(server.recording_stem_is_valid(recording_stem))
        for recording_stem in ("", "260721 has-space", "../../escape", "20260721_P1"):
            with self.subTest(recording_stem=recording_stem):
                self.assertFalse(server.recording_stem_is_valid(recording_stem))

    def test_recording_path_uses_date_participant_and_collision_suffix(self):
        recorded_at = datetime(2026, 7, 21, 10, 30)
        with tempfile.TemporaryDirectory() as directory:
            recording_directory = Path(directory)
            first = server.next_recording_path(
                recording_directory, "P001", ".webm", recorded_at
            )
            self.assertEqual(first.name, "260721_P001.webm")
            first.touch()
            second = server.next_recording_path(
                recording_directory, "P001", ".webm", recorded_at
            )
            self.assertEqual(second.name, "260721_P001_02.webm")

    def test_recording_path_avoids_audio_text_and_event_collisions(self):
        recorded_at = datetime(2026, 7, 21, 10, 30)
        with tempfile.TemporaryDirectory() as audio_directory:
            with tempfile.TemporaryDirectory() as text_directory:
                with tempfile.TemporaryDirectory() as event_directory:
                    audio_path = Path(audio_directory)
                    text_path = Path(text_directory)
                    event_path = Path(event_directory)
                    (audio_path / "260721_P002.m4a").touch()
                    (text_path / "260721_P002_02.txt").touch()
                    (event_path / "260721_P002_03.json").touch()
                    candidate = server.next_recording_path(
                        audio_path,
                        "P002",
                        ".webm",
                        recorded_at,
                        text_path,
                        event_path,
                    )
                    self.assertEqual(candidate.name, "260721_P002_04.webm")

    def test_store_recording_streams_bytes_and_uses_final_filename(self):
        recorded_at = datetime(2026, 7, 21, 10, 30)
        audio = b"test-audio-bytes"
        with tempfile.TemporaryDirectory() as directory:
            path = server.store_recording(
                BytesIO(audio),
                len(audio),
                Path(directory),
                "P003",
                ".webm",
                recorded_at,
            )
            self.assertEqual(path.name, "260721_P003.webm")
            self.assertEqual(path.read_bytes(), audio)
            self.assertEqual(list(Path(directory).glob("*.tmp")), [])

    def test_store_recording_rejects_an_incomplete_upload(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(OSError, "disconnected"):
                server.store_recording(
                    BytesIO(b"short"),
                    10,
                    Path(directory),
                    "P004",
                    ".webm",
                )
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_store_text_log_uses_recording_stem_and_utf8(self):
        transcript = "Participant: Hello.\nNomi: Hello.\n".encode("utf-8")
        with tempfile.TemporaryDirectory() as directory:
            path = server.store_text_log(
                BytesIO(transcript),
                len(transcript),
                Path(directory),
                "260721_P005_02",
            )
            self.assertEqual(path.name, "260721_P005_02.txt")
            self.assertEqual(path.read_bytes(), transcript)

    def test_text_log_is_idempotent_but_does_not_overwrite(self):
        first = b"Nomi: First version.\n"
        second = b"Nomi: Different version.\n"
        with tempfile.TemporaryDirectory() as directory:
            transcript_directory = Path(directory)
            server.store_text_log(
                BytesIO(first), len(first), transcript_directory, "260721_P006"
            )
            same_path = server.store_text_log(
                BytesIO(first), len(first), transcript_directory, "260721_P006"
            )
            self.assertEqual(same_path.read_bytes(), first)
            with self.assertRaisesRegex(FileExistsError, "different text log"):
                server.store_text_log(
                    BytesIO(second),
                    len(second),
                    transcript_directory,
                    "260721_P006",
                )

    def test_store_text_log_rejects_invalid_utf8(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(UnicodeDecodeError):
                server.store_text_log(
                    BytesIO(b"\xff\xfe"),
                    2,
                    Path(directory),
                    "260721_P007",
                )
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_store_event_log_validates_json_and_is_idempotent(self):
        payload = json.dumps(self.event_payload(), indent=2).encode("utf-8")
        with tempfile.TemporaryDirectory() as directory:
            event_directory = Path(directory)
            path = server.store_event_log(
                BytesIO(payload),
                len(payload),
                event_directory,
                "260721_P001",
            )
            self.assertEqual(path.name, "260721_P001.json")
            same_path = server.store_event_log(
                BytesIO(payload),
                len(payload),
                event_directory,
                "260721_P001",
            )
            self.assertEqual(same_path.read_bytes(), payload)

            different_payload = self.event_payload()
            different_payload["scenario"] = {
                "id": "end_of_day",
                "label": "End-of-Day",
            }
            different = json.dumps(different_payload).encode("utf-8")
            with self.assertRaisesRegex(FileExistsError, "different event log"):
                server.store_event_log(
                    BytesIO(different),
                    len(different),
                    event_directory,
                    "260721_P001",
                )

    def test_store_event_log_rejects_invalid_payloads(self):
        invalid_payloads = (
            b"not-json",
            b"[]",
            json.dumps(
                {
                    "schema_version": "2.0",
                    "participant_id": "P001",
                }
            ).encode("utf-8"),
            json.dumps(
                {
                    "schema_version": "1.0",
                    "participant_id": "../escape",
                }
            ).encode("utf-8"),
            json.dumps(
                {
                    "schema_version": "1.0",
                    "participant_id": "P999",
                }
            ).encode("utf-8"),
        )
        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                with tempfile.TemporaryDirectory() as directory:
                    with self.assertRaises(
                        (json.JSONDecodeError, ValueError)
                    ):
                        server.store_event_log(
                            BytesIO(payload),
                            len(payload),
                            Path(directory),
                            "260721_P001",
                        )
                    self.assertEqual(list(Path(directory).iterdir()), [])


if __name__ == "__main__":
    unittest.main()
