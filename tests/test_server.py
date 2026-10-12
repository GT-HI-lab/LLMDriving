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
    AFFECTIVE_CLOSING,
    AFFECTIVE_FINAL_CHECK,
    AFFECTIVE_FINALIZATION_ELAPSED_SECONDS,
    AFFECTIVE_MINIMUM_RESPONSE_BATCHES,
    AFFECTIVE_MINIMUM_SYNTHESIS_ELAPSED_SECONDS,
    ASSISTANT_MODES,
    COGNITIVE_COMPLETENESS_CHECK,
    CONTROLLER_VERSION,
    DESERT_ISLAND_ITEMS,
    FINALIZATION_ELAPSED_SECONDS,
    LEAVES_REHEARSAL_QUESTION,
    LEAVES_WRAPUP_CHOICE_QUESTION,
    MAXIMUM_CONVERSATION_ELAPSED_SECONDS,
    PREPARATION_SECONDS,
    PROMPT_VERSION,
    SHARED_VOICE_DELIVERY_INSTRUCTIONS,
    SECOND_TASK_TRANSITION,
    TASK_TRANSITION_PAUSE_SECONDS,
    TASKS,
    TASK_ONE_CLOSING,
    TASK_TWO_CLOSING,
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

    def event_payload(
        self,
        participant_id="P001",
        condition="cognitive",
        task_id="leaves",
        position=1,
    ):
        return {
            "schema_version": "1.1",
            "prompt_version": PROMPT_VERSION,
            "participant_id": participant_id,
            "condition": {"id": condition, "label": condition.title()},
            "task": {
                "id": task_id,
                "label": TASKS[task_id]["label"],
                "position": position,
            },
            "events": [],
            "turns": [],
        }

    def test_placeholder_key_is_not_configured(self):
        settings = self.make_settings(api_key="YOUR_OPENAI_API_KEY_HERE")
        self.assertFalse(settings.api_key_is_configured)

    def test_session_config_uses_shared_voice_and_research_vad(self):
        assignments = (
            ("cognitive", "leaves"),
            ("cognitive", "island"),
            ("affective", "positive"),
            ("affective", "negative"),
        )
        for condition, task_id in assignments:
            for position in (1, 2):
                with self.subTest(
                    condition=condition,
                    task=task_id,
                    position=position,
                ):
                    payload = json.loads(
                        server.build_session_config(
                            self.make_settings(),
                            condition,
                            task_id,
                            position,
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
                    self.assertNotIn("temperature", payload)
                    self.assertIn("# Context before support", payload["instructions"])
                    self.assertIn("Ask at most one main question", payload["instructions"])
                    self.assertIn(SHARED_VOICE_DELIVERY_INSTRUCTIONS, payload["instructions"])
                    self.assertIn("[STUDY PACING CONTROL]", payload["instructions"])
                    closing = (
                        AFFECTIVE_CLOSING if condition == "affective" else
                        TASK_ONE_CLOSING if position == 1 else TASK_TWO_CLOSING
                    )
                    self.assertIn(closing, payload["instructions"])

    def test_prompt_modules_encode_approved_task_behavior(self):
        leaves = build_instructions("cognitive", "leaves", 1)
        island = build_instructions("cognitive", "island", 2)
        positive = build_instructions("affective", "positive", 1)
        negative = build_instructions("affective", "negative", 2)

        self.assertIn(COGNITIVE_COMPLETENESS_CHECK, leaves)
        self.assertIn(LEAVES_REHEARSAL_QUESTION, leaves)
        self.assertIn("short, accurate science idea", leaves)
        self.assertIn("Chlorophyll makes leaves look green", leaves)
        self.assertIn("anthocyanins", leaves)
        self.assertIn("Do not quiz them before helping", leaves)
        self.assertIn('do not use "chlorophyll," "pigment," or', leaves)
        self.assertIn("Add at most one new science", leaves)
        self.assertIn("unload the scientific answer", leaves)

        for item in DESERT_ISLAND_ITEMS:
            self.assertIn("- " + item, island)
        self.assertEqual(len(DESERT_ISLAND_ITEMS), 23)
        self.assertIn("must choose exactly", island)
        self.assertIn('say, "To confirm, your final', island)
        self.assertIn("Do not invent an item", island)
        self.assertIn("desert island for five days", island)
        self.assertIn("clothing and drinking water", island)
        self.assertIn("food is not provided", island)
        self.assertIn("remains an allowed choice because food is not provided", island)
        self.assertIn("A suggestion is never a selection", island)
        self.assertIn("Never silently guess", island)

        self.assertIn("usually aim for three", positive)
        self.assertIn(AFFECTIVE_FINAL_CHECK, positive)
        self.assertIn("study_progress", positive)
        self.assertIn("four to five minutes", positive)
        self.assertIn("at least two substantive", positive)
        self.assertIn("clear refusal", positive)
        self.assertIn("finalized child-ready answer", leaves)
        self.assertIn("example is allowed even early", leaves)
        self.assertIn("For every finish or stop call", positive)
        self.assertIn("Sound like an attentive conversation partner", positive)
        self.assertIn("Do not name an abstract theme", positive)
        self.assertIn("Do not ask the Cognitive completeness question", positive)
        self.assertNotIn(COGNITIVE_COMPLETENESS_CHECK, positive)
        self.assertIn("specific positive memory", positive)
        self.assertIn("negative but manageable memory", negative)
        self.assertIn("Do not require a lesson, silver lining", negative)
        self.assertIn("do not probe", negative)

    def test_public_config_has_two_conditions_two_orders_and_exact_speech(self):
        config = public_study_config()
        self.assertEqual(config["prompt_version"], PROMPT_VERSION)
        self.assertEqual(config["controller_version"], CONTROLLER_VERSION)
        self.assertEqual(
            config["assistant"],
            {"name": "Buzz", "voice": "marin", "speed": 1.0},
        )
        self.assertEqual(config["preparation_seconds"], PREPARATION_SECONDS)
        self.assertEqual(config["task_transition_pause_seconds"], TASK_TRANSITION_PAUSE_SECONDS)
        self.assertEqual(TASK_TRANSITION_PAUSE_SECONDS, 3)
        self.assertEqual(config["voice_delivery_instructions"], SHARED_VOICE_DELIVERY_INSTRUCTIONS)
        self.assertEqual(config["transition"], SECOND_TASK_TRANSITION)
        self.assertEqual(config["affective_closing"], AFFECTIVE_CLOSING)
        self.assertEqual(config["leaves_wrapup_choice_question"], LEAVES_WRAPUP_CHOICE_QUESTION)
        self.assertEqual(
            config["closings"],
            {"task_one": TASK_ONE_CLOSING, "task_two": TASK_TWO_CLOSING},
        )
        self.assertEqual(set(config["modes"]), {"cognitive", "affective"})
        self.assertNotIn("neutral", config["modes"])
        self.assertEqual(
            [order["tasks"] for order in config["modes"]["cognitive"]["orders"]],
            [("leaves", "island"), ("island", "leaves")],
        )
        self.assertEqual(
            [order["tasks"] for order in config["modes"]["affective"]["orders"]],
            [("positive", "negative"), ("negative", "positive")],
        )
        self.assertEqual(
            config["tasks"]["positive"]["opening_first"],
            "Hello, I'm Buzz. What positive memory would you like to share?",
        )
        self.assertEqual(
            config["tasks"]["negative"]["opening_first"],
            "Hello, I'm Buzz. What negative memory would you like to share?",
        )
        self.assertEqual(
            config["tasks"]["positive"]["opening_later"],
            "What positive memory would you like to share?",
        )
        for task_id in ("positive", "negative", "leaves", "island"):
            instruction = config["tasks"][task_id]["participant_instruction"]
            self.assertIsInstance(instruction["blocks"], tuple)
            self.assertTrue(
                any(block["type"] == "list" for block in instruction["blocks"])
            )
            timings = [
                block
                for block in instruction["blocks"]
                if block["type"] == "timing"
            ]
            self.assertEqual(len(timings), 2)
        positive_blocks = config["tasks"]["positive"][
            "participant_instruction"
        ]["blocks"]
        positive_text = json.dumps(positive_blocks)
        self.assertIn("happy, pleased, or joyful", positive_text)
        self.assertIn('"bold": true', positive_text)
        negative_text = json.dumps(
            config["tasks"]["negative"]["participant_instruction"]["blocks"]
        )
        self.assertIn("unhappy, disappointed, or frustrated", negative_text)
        island_text = json.dumps(
            config["tasks"]["island"]["participant_instruction"]["blocks"]
        )
        self.assertIn("five days", island_text)
        self.assertIn("clothing and drinking water", island_text)
        self.assertNotIn("Nomi", json.dumps(config))
        public_json = json.dumps(config)
        # Participants use a printed list; item options stay in the agent prompt.
        self.assertIn("printed item list", island_text)
        self.assertNotIn("Available items and quantities", island_text)
        self.assertFalse(any(
            block.get("layout") == "two_columns"
            for block in config["tasks"]["island"]["participant_instruction"]["blocks"]
        ))
        for item in DESERT_ISLAND_ITEMS:
            self.assertNotIn(item, island_text)
        self.assertNotIn("First-aid kit", public_json)
        self.assertEqual(config["affective_followups"], {"minimum": 2, "target": 3})
        self.assertNotIn("route_instructions", public_json)
        self.assertNotIn("# Cognitive condition objective", public_json)

    def test_pacing_and_turn_controller_are_short_task_specific(self):
        config = public_study_config()
        self.assertEqual(
            config["pacing"]["finalization_elapsed_seconds"],
            FINALIZATION_ELAPSED_SECONDS,
        )
        self.assertEqual(
            config["pacing"]["maximum_elapsed_seconds"],
            MAXIMUM_CONVERSATION_ELAPSED_SECONDS,
        )
        affective_pacing = config["pacing"]["condition_overrides"]["affective"]
        self.assertEqual(
            affective_pacing["minimum_synthesis_elapsed_seconds"],
            AFFECTIVE_MINIMUM_SYNTHESIS_ELAPSED_SECONDS,
        )
        self.assertEqual(
            affective_pacing["minimum_response_batches"],
            AFFECTIVE_MINIMUM_RESPONSE_BATCHES,
        )
        self.assertEqual(
            affective_pacing["finalization_elapsed_seconds"],
            AFFECTIVE_FINALIZATION_ELAPSED_SECONDS,
        )
        self.assertEqual(config["pacing"]["maximum_elapsed_seconds"], 300)
        self.assertEqual(config["pacing"]["minimum_synthesis_elapsed_seconds"], 180)
        self.assertEqual(config["pacing"]["finalization_elapsed_seconds"], 270)
        self.assertEqual(config["pacing"]["convergence_elapsed_seconds"], 180)
        for key, value in affective_pacing.items():
            self.assertEqual(value, config["pacing"][key])
        self.assertEqual(TASK_ONE_CLOSING, "That completes our conversation. Thank you!")
        self.assertEqual(TASK_TWO_CLOSING, TASK_ONE_CLOSING)
        for task in config["tasks"].values():
            timings = [b for b in task["participant_instruction"]["blocks"] if b["type"] == "timing"]
            self.assertEqual(timings[1]["segments"][0]["text"], "4–5 minutes")
            self.assertEqual(timings[0]["segments"][0]["text"], "1 minute")
        self.assertEqual(
            config["realtime"]["response_trigger"],
            TURN_CONTROLLER_SETTINGS["response_trigger"],
        )
        self.assertTrue(config["realtime"]["pending_transcription_barrier"])
        self.assertEqual(config["realtime"]["continuation_grace_ms"], 0)
        self.assertEqual(
            config["realtime"]["incomplete_transcript_grace_ms"], 300
        )
        self.assertTrue(
            config["realtime"]["cancel_pre_playback_response_on_continuation"]
        )

    def test_invalid_condition_task_pair_and_position_are_rejected(self):
        self.assertFalse(server.assistant_mode_is_valid("neutral"))
        with self.assertRaisesRegex(ValueError, "Unsupported assistant mode"):
            server.build_session_config(
                self.make_settings(), "neutral", "leaves", 1
            )
        with self.assertRaisesRegex(ValueError, "Unsupported task"):
            server.build_session_config(
                self.make_settings(), "cognitive", "unsupported", 1
            )
        with self.assertRaisesRegex(
            ValueError, "Task does not belong to assistant mode"
        ):
            server.build_session_config(
                self.make_settings(), "cognitive", "positive", 1
            )
        with self.assertRaisesRegex(ValueError, "Task position must be 1 or 2"):
            server.build_session_config(
                self.make_settings(), "cognitive", "leaves", 3
            )

    def test_html_uses_buzz_two_conditions_and_condition_blind_participant_view(self):
        html = (server.STATIC_DIR / "index.html").read_text(encoding="utf-8")
        instruction_section = html.split(
            'id="participantInstructionView"', 1
        )[1].split('id="conversationView"', 1)[0]
        conversation_section = html.split('id="conversationView"', 1)[1]

        self.assertIn('name="assistantMode" value="cognitive"', html)
        self.assertIn('name="assistantMode" value="affective"', html)
        self.assertNotIn('value="neutral"', html)
        self.assertNotIn("Nomi", html)
        self.assertIn('name="taskOrder"', html)
        self.assertIn('id="preparationStatus"', html)
        self.assertIn('id="preparationOrb"', html)
        self.assertIn('id="researcherTestMode"', html)
        self.assertIn("Researcher test mode", html)
        self.assertIn("Take a moment to think", html)
        for condition_label in ("Cognitive", "Affective", "Neutral"):
            self.assertNotIn(condition_label, instruction_section)
            self.assertNotIn(condition_label, conversation_section)

    def test_browser_source_has_preparation_transition_and_task_file_metadata(self):
        script = (server.STATIC_DIR / "app.js").read_text(encoding="utf-8")
        self.assertIn("function beginPreparationWindow", script)
        self.assertIn("activeResearcherTestMode", script)
        self.assertIn("effectivePacingConfig", script)
        self.assertIn("researcher_test_mode", script)
        self.assertIn('startButton.textContent = "Take a moment to think"', script)
        self.assertIn(
            'startButton.textContent = "Start conversation with Buzz"', script
        )
        self.assertIn("requestTransitionMessage", script)
        self.assertIn('kind === "transition"', script)
        self.assertIn("spoken_transition_completed", script)
        self.assertIn("startPreparedConversation", script)
        self.assertIn('"X-Task-ID": activeTaskId', script)
        self.assertIn('"X-Task-Position": String(currentTaskPosition())', script)
        self.assertIn("automatic_stop_after_exact_closing", script)
        self.assertNotIn("post_closing_farewell", script)
        self.assertNotIn("automatic_stop_after_farewell", script)
        self.assertIn('state = "finalization_required"', script)
        self.assertIn("pacingFinalizationSent", script)

    def test_css_uses_official_georgia_tech_palette(self):
        css = (server.STATIC_DIR / "styles.css").read_text(encoding="utf-8")
        self.assertIn("--gt-gold: #b39051", css)
        self.assertIn("--gt-dark-gold: #8f713d", css)
        self.assertIn("--gt-buzz: #eaaa00", css)
        self.assertIn("--gt-navy: #051e39", css)
        self.assertIn("linear-gradient(145deg, var(--gt-buzz)", css)
        self.assertIn(".test-mode-control", css)
        self.assertIn(".instruction-timing", css)

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

    def test_participant_id_and_recording_stem_validation(self):
        for participant_id in ("P001", "study_12", "participant-9"):
            self.assertTrue(server.participant_id_is_valid(participant_id))
        for participant_id in ("", "has space", "../escape", "참가자1"):
            self.assertFalse(server.participant_id_is_valid(participant_id))

        valid = (
            "260925_P001_cognitive_leaves_T1",
            "260925_study_12_affective_negative_T2_02",
        )
        invalid = (
            "260925_P001",
            "260925_P001_neutral_leaves_T1",
            "260925_P001_cognitive_positive_T1",
            "260925_P001_cognitive_leaves_T3",
            "../../escape",
        )
        for stem in valid:
            self.assertTrue(server.recording_stem_is_valid(stem))
        for stem in invalid:
            self.assertFalse(server.recording_stem_is_valid(stem))

    def test_recording_extensions(self):
        self.assertEqual(server.recording_extension("audio/webm;codecs=opus"), ".webm")
        self.assertEqual(server.recording_extension("audio/mp4"), ".m4a")
        self.assertEqual(server.recording_extension("audio/ogg"), ".ogg")
        self.assertIsNone(server.recording_extension("video/webm"))

    def test_recording_path_includes_condition_task_position_and_avoids_collisions(self):
        recorded_at = datetime(2026, 9, 25, 12, 0, 0)
        with tempfile.TemporaryDirectory() as root:
            root_path = Path(root)
            audio = root_path / "Audio_Record"
            text = root_path / "Txt_Log"
            events = root_path / "Event_Log"
            audio.mkdir()
            text.mkdir()
            events.mkdir()

            first = server.next_recording_path(
                audio,
                "P001",
                "cognitive",
                "leaves",
                1,
                ".webm",
                recorded_at,
                text,
                events,
            )
            self.assertEqual(
                first.name, "260925_P001_cognitive_leaves_T1.webm"
            )
            (text / "260925_P001_cognitive_leaves_T1.txt").write_text("used")
            second = server.next_recording_path(
                audio,
                "P001",
                "cognitive",
                "leaves",
                1,
                ".webm",
                recorded_at,
                text,
                events,
            )
            self.assertEqual(
                second.name, "260925_P001_cognitive_leaves_T1_02.webm"
            )

    def test_store_recording_streams_bytes_and_uses_final_filename(self):
        payload = b"voice-data"
        with tempfile.TemporaryDirectory() as directory:
            path = server.store_recording(
                BytesIO(payload),
                len(payload),
                Path(directory),
                "P004",
                "affective",
                "positive",
                1,
                ".webm",
                datetime(2026, 9, 25),
            )
            self.assertEqual(
                path.name, "260925_P004_affective_positive_T1.webm"
            )
            self.assertEqual(path.read_bytes(), payload)

    def test_store_recording_rejects_incomplete_upload(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(OSError, "disconnected"):
                server.store_recording(
                    BytesIO(b"short"),
                    10,
                    Path(directory),
                    "P004",
                    "cognitive",
                    "island",
                    2,
                    ".webm",
                )
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_text_log_is_idempotent_but_does_not_overwrite(self):
        first = b"Buzz: First version.\n"
        second = b"Buzz: Different version.\n"
        stem = "260925_P006_affective_negative_T2"
        with tempfile.TemporaryDirectory() as directory:
            transcript_directory = Path(directory)
            server.store_text_log(
                BytesIO(first), len(first), transcript_directory, stem
            )
            same_path = server.store_text_log(
                BytesIO(first), len(first), transcript_directory, stem
            )
            self.assertEqual(same_path.read_bytes(), first)
            with self.assertRaisesRegex(FileExistsError, "different text log"):
                server.store_text_log(
                    BytesIO(second), len(second), transcript_directory, stem
                )

    def test_store_text_log_rejects_invalid_utf8(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(UnicodeDecodeError):
                server.store_text_log(
                    BytesIO(b"\xff\xfe"),
                    2,
                    Path(directory),
                    "260925_P007_cognitive_island_T1",
                )
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_store_event_log_validates_metadata_and_is_idempotent(self):
        payload = json.dumps(self.event_payload(), indent=2).encode("utf-8")
        stem = "260925_P001_cognitive_leaves_T1"
        with tempfile.TemporaryDirectory() as directory:
            event_directory = Path(directory)
            path = server.store_event_log(
                BytesIO(payload), len(payload), event_directory, stem
            )
            self.assertEqual(path.name, stem + ".json")
            same_path = server.store_event_log(
                BytesIO(payload), len(payload), event_directory, stem
            )
            self.assertEqual(same_path.read_bytes(), payload)

    def test_store_event_log_rejects_invalid_or_mismatched_payloads(self):
        mismatched_task = self.event_payload(task_id="island")
        wrong_schema = self.event_payload()
        wrong_schema["schema_version"] = "1.0"
        invalid_payloads = (
            b"not-json",
            b"[]",
            json.dumps(wrong_schema).encode("utf-8"),
            json.dumps(self.event_payload(participant_id="../escape")).encode(
                "utf-8"
            ),
            json.dumps(mismatched_task).encode("utf-8"),
        )
        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                with tempfile.TemporaryDirectory() as directory:
                    with self.assertRaises((json.JSONDecodeError, ValueError)):
                        server.store_event_log(
                            BytesIO(payload),
                            len(payload),
                            Path(directory),
                            "260925_P001_cognitive_leaves_T1",
                        )
                    self.assertEqual(list(Path(directory).iterdir()), [])


if __name__ == "__main__":
    unittest.main()
