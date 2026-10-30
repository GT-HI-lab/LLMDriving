import base64
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
import wave

import export_voice_sentences as exporter


PCM = b"\x00\x00" * 240


def speech_events(sentence, status="completed", audio=PCM):
    return [
        {"type": "response.output_audio.delta",
         "delta": base64.b64encode(audio[:240]).decode("ascii")},
        {"type": "response.output_audio.delta",
         "delta": base64.b64encode(audio[240:]).decode("ascii")},
        {"type": "response.done", "response": {
            "status": status,
            "output": [{"content": [{"type": "output_audio", "transcript": sentence}]}],
        }},
    ]


class FakeConnection:
    def __init__(self, events):
        self.events = iter(events)
        self.sent = []
        self.closed = False

    def send(self, message):
        self.sent.append(json.loads(message))

    def recv(self):
        event = next(self.events, None)
        return json.dumps(event) if event else ""

    def close(self):
        self.closed = True


class ExportVoiceSentencesTests(unittest.TestCase):
    def test_reuses_configured_voice_and_speed(self):
        connection = FakeConnection([
            {"type": "session.created"}, {"type": "session.updated"},
        ])
        exporter.configure_session(
            connection, SimpleNamespace(model="configured-model", voice="cedar")
        )
        session = connection.sent[0]["session"]
        self.assertEqual(session["model"], "configured-model")
        self.assertEqual(session["audio"]["output"]["voice"], "cedar")
        self.assertEqual(session["audio"]["output"]["speed"], exporter.SHARED_SPEED)
        self.assertIsNone(session["audio"]["input"]["turn_detection"])

    def test_combines_audio_chunks_and_uses_independent_sentence_context(self):
        sentence = exporter.SENTENCES[0][1]
        transcript = "All set. I'll drive us home carefully!"
        connection = FakeConnection(speech_events(transcript))
        self.assertEqual(exporter.synthesize_sentence(connection, sentence), PCM)
        response = connection.sent[0]["response"]
        self.assertEqual(response["conversation"], "none")
        self.assertEqual(response["input"], [])
        self.assertIn(sentence, response["instructions"])
        self.assertIn(exporter.SHARED_VOICE_DELIVERY_INSTRUCTIONS, response["instructions"])

    def test_rejects_incomplete_changed_or_empty_responses(self):
        sentence = exporter.SENTENCES[0][1]
        cases = [
            speech_events(sentence, status="incomplete"),
            speech_events("I'll drive us home carefully."),
            speech_events(sentence, audio=b""),
            speech_events(sentence, audio=b"\x00"),
            [{"type": "error", "error": {"message": "Rate limit reached"}}],
            [],
        ]
        for events in cases:
            with self.subTest(events=events):
                with self.assertRaises(RuntimeError):
                    exporter.synthesize_sentence(FakeConnection(events), sentence)

    def test_wav_is_readable_and_existing_files_are_protected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sentence.wav"
            exporter.save_wav(path, PCM)
            with wave.open(str(path), "rb") as audio:
                self.assertEqual(audio.getnchannels(), 1)
                self.assertEqual(audio.getsampwidth(), 2)
                self.assertEqual(audio.getframerate(), 24000)
                self.assertEqual(audio.getnframes(), 240)
                self.assertEqual(audio.readframes(240), PCM)
            with self.assertRaises(FileExistsError):
                exporter.save_wav(path, b"\x01\x00")
            exporter.save_wav(path, b"\x01\x00", overwrite=True)
            with wave.open(str(path), "rb") as audio:
                self.assertEqual(audio.readframes(1), b"\x01\x00")

    def test_exports_all_ten_and_rerun_skips_api_calls(self):
        events = [{"type": "session.updated"}]
        for _, sentence in exporter.SENTENCES:
            events.extend(speech_events(sentence))
        connection = FakeConnection(events)
        websocket = SimpleNamespace(
            create_connection=Mock(return_value=connection),
            WebSocketException=OSError,
        )
        settings = SimpleNamespace(
            api_key="test-key", api_key_is_configured=True,
            model="configured-model", voice="marin",
        )
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict("sys.modules", {"websocket": websocket}), \
                    patch.object(exporter, "load_env_file"), \
                    patch.object(exporter.Settings, "from_environment", return_value=settings), \
                    patch("builtins.print"):
                self.assertEqual(exporter.main(["--output-dir", directory]), 0)
                self.assertEqual(exporter.main(["--output-dir", directory]), 0)
            self.assertEqual(len(list(Path(directory).glob("*.wav"))), 10)
            websocket.create_connection.assert_called_once()
            self.assertTrue(connection.closed)


if __name__ == "__main__":
    unittest.main()
