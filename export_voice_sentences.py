#!/usr/bin/env python3
"""Export the ten driving sentences with Buzz's configured Realtime voice.

Install the only extra dependency: python -m pip install websocket-client
Run: python export_voice_sentences.py

Reads the existing .env and assistant_modes.py settings. Saves starting_01.wav
through starting_05.wav and ending_01.wav through ending_05.wav in output/.
Existing files are skipped; use --overwrite to regenerate them.

Realtime audio protocol:
https://developers.openai.com/api/docs/guides/realtime-conversations
"""

import argparse
import base64
from contextlib import closing
import json
from pathlib import Path
import re
import ssl
import sys
import wave

from assistant_modes import (
    GLOBAL_REALTIME_SETTINGS,
    SHARED_SPEED,
    SHARED_VOICE_DELIVERY_INSTRUCTIONS,
)
from server import PROJECT_ROOT, Settings, load_env_file
from urllib.parse import urlencode


SAMPLE_RATE = 24000
SENTENCES = (
    ("starting_01.wav", "Hi, this is Nomi. All set—I’ll drive us home carefully."),
    ("starting_02.wav", "Hi, this is Nomi. Ready when you are—I’ll take us home carefully."),
    ("starting_03.wav", "Hi, this is Nomi. Let’s head home—I’ll handle the drive carefully."),
    ("starting_04.wav", "Hi, this is Nomi. I’m ready—I’ll drive us home with care."),
    ("starting_05.wav", "Hi, this is Nomi. All ready—I’ll take us home with care."),
    ("ending_01.wav", "We’ve arrived. I’m glad we traveled together."),
    ("ending_02.wav", "We’re here. I enjoyed traveling with you."),
    ("ending_03.wav", "We’ve arrived. I’m glad we shared the ride."),
    ("ending_04.wav", "We’re home. I enjoyed making the trip together."),
    ("ending_05.wav", "We’ve arrived. It was nice traveling with you."),
)


def receive_event(connection):
    message = connection.recv()
    if not message:
        raise RuntimeError("The Realtime connection closed before completion.")
    event = json.loads(message)
    if event.get("type") == "error":
        raise RuntimeError(event.get("error", {}).get("message", "Realtime API error"))
    return event


def configure_session(connection, settings):
    """Use the study's model, voice, speed and delivery without its task prompts."""
    connection.send(json.dumps({
        "type": "session.update",
        "session": {
            "type": "realtime",
            "model": settings.model,
            "output_modalities": ["audio"],
            "reasoning": {"effort": GLOBAL_REALTIME_SETTINGS["reasoning_effort"]},
            "audio": {
                "input": {"turn_detection": None},
                "output": {
                    "format": {"type": "audio/pcm", "rate": SAMPLE_RATE},
                    "voice": settings.voice,
                    "speed": SHARED_SPEED,
                },
            },
        },
    }))
    while receive_event(connection).get("type") != "session.updated":
        pass


def synthesize_sentence(connection, sentence):
    """Collect a complete PCM response and check its transcript before saving."""
    connection.send(json.dumps({
        "type": "response.create",
        "response": {
            "conversation": "none",
            "input": [],
            "output_modalities": ["audio"],
            "instructions": (
                SHARED_VOICE_DELIVERY_INSTRUCTIONS
                + "\nRead the following sentence verbatim, exactly once. "
                "Say only this sentence, with no introduction, explanation, "
                "additional words, or sound effects. Preserve contractions.\n"
                + sentence
            ),
        },
    }))
    audio = bytearray()
    while True:
        event = receive_event(connection)
        if event.get("type") == "response.output_audio.delta":
            audio.extend(base64.b64decode(event["delta"], validate=True))
        elif event.get("type") == "response.done":
            response = event["response"]
            if response.get("status") != "completed":
                raise RuntimeError("Speech generation did not complete: {}".format(
                    response.get("status_details") or response.get("status")
                ))
            transcript = " ".join(
                part.get("transcript", "")
                for item in response.get("output", [])
                for part in item.get("content", [])
            )
            # Ignore punctuation/case differences, but reject changed words.
            if re.findall(r"[a-z0-9]+", transcript.casefold()) != re.findall(
                r"[a-z0-9]+", sentence.casefold()
            ):
                raise RuntimeError(
                    "Generated transcript differs from the requested sentence: {!r}".format(
                        transcript
                    )
                )
            if not audio or len(audio) % 2:
                raise RuntimeError("The API returned empty or invalid 16-bit PCM audio.")
            return bytes(audio)


def save_wav(path, audio, overwrite=False):
    """Write real mono, 16-bit, 24 kHz WAV audio with a finalized header."""
    with path.open("wb" if overwrite else "xb") as destination:
        with wave.open(destination, "wb") as recording:
            recording.setnchannels(1)
            recording.setsampwidth(2)
            recording.setframerate(SAMPLE_RATE)
            recording.writeframes(audio)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir", type=Path, default=PROJECT_ROOT / "output",
        help="Destination folder (default: this project's output folder).",
    )
    parser.add_argument(
        "--overwrite", action="store_true", help="Regenerate existing WAV files."
    )
    args = parser.parse_args(argv)
    pending = [
        (args.output_dir / filename, sentence)
        for filename, sentence in SENTENCES
        if args.overwrite or not (args.output_dir / filename).exists()
    ]
    if not pending:
        print("All ten WAV files already exist. Use --overwrite to regenerate.")
        return 0

    try:
        import websocket
    except ImportError:
        print("Install the dependency: python -m pip install websocket-client", file=sys.stderr)
        return 1

    try:
        load_env_file(PROJECT_ROOT / ".env")
        settings = Settings.from_environment()
        if not settings.api_key_is_configured:
            raise ValueError("Set OPENAI_API_KEY in the project's .env file first.")
        args.output_dir.mkdir(parents=True, exist_ok=True)
        url = "wss://api.openai.com/v1/realtime?" + urlencode({"model": settings.model})
        print("Using model={}, voice={}, speed={}".format(
            settings.model, settings.voice, SHARED_SPEED
        ), flush=True)
        with closing(websocket.create_connection(
            url,
            header={"Authorization": "Bearer " + settings.api_key},
            timeout=60,
            sslopt={"context": ssl.create_default_context()},
        )) as connection:
            configure_session(connection, settings)
            for path, sentence in pending:
                print("Generating {}...".format(path.name), flush=True)
                audio = synthesize_sentence(connection, sentence)
                save_wav(path, audio, overwrite=args.overwrite)
                print("Saved {}".format(path), flush=True)
    except (OSError, ValueError, RuntimeError, websocket.WebSocketException) as exc:
        print("Export failed: {}".format(exc), file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\nExport stopped. Rerun to generate the remaining files.", file=sys.stderr)
        return 130

    print("Done. All ten sentence WAV files are in {}".format(args.output_dir.resolve()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
