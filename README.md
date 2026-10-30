# Buzz Realtime Voice Study

Current release: **v20.1**, October 25, 2026.
Prompt: `pilot-2026-10-25-v18`; controller: `turn-control-2026-10-25-v20`.

## Run

Use the existing `.env` and start `python3 server.py`. The default local URL is
http://127.0.0.1:8000. Restart the server and hard-refresh all participant
browsers after installing this release. Do not replace the existing API key,
recordings, transcripts or event logs. See `.env.example` for settings.
An iPad requires the existing trusted HTTPS setup; localhost HTTP is for the
same computer only.

Python 3.8+ and a browser supporting WebRTC, Web Audio, MediaRecorder and HTML
dialog are required. Voice remains marin, speed 1.0, English output, low reasoning
effort and semantic VAD. This release does not change the Realtime model.

## Researcher workflow

Enter a participant ID, choose Cognitive or Affective, and choose task order.

| Condition | Order 1 | Order 2 |
| --- | --- | --- |
| Cognitive | North Pole → Deserted Island | Deserted Island → North Pole |
| Affective | Positive → Negative | Negative → Positive |

Researcher test mode is off by default. It skips preparation waiting and shows
the manual End activity button. Normal participant sessions do not expose that
button. Returning to setup from either preparation or completion requires PIN
**7890**, also displayed on the researcher setup screen. This is an
accidental-navigation guard in the browser, not account authentication.
The conversation and completion screens have a quiet text link back to setup.
Returning during a conversation first saves the current task and closes its
connection, without advancing to the next task.

1. Each task has a 60-second private preparation period and a disabled Start
   button showing the remaining time. Recording is off during preparation.
2. Start conversation with Buzz begins the task and recording.
3. Buzz's exact closing must finish playing before the audio, transcript and
   event log save.
4. After Activity 1 saves successfully, a new independent session says
   “Let's move to the next activity.” At least three seconds separate the
   previous closing audio and the transition request.
5. Activity 2 has its own preparation period and Start button. Its opening
   asks the task question without another self-introduction.
6. Activity 2 saves and ends on the completion screen.

The live screen order is Buzz → voice animation → status → activity instructions.
The status is “Buzz is listening”, “Buzz is thinking” or “Buzz is speaking”.
It appears in bold inside a rounded rectangular chip.
The recording notice appears directly below the 4–5 minute preparation guidance,
left aligned and at the same text size.

## Cognitive scenarios

Both tasks ask for exactly three choices from the same **24-item printed list**.
The rescue team knows the participant's location and arrives in **three days**.
Appropriate clothing and drinking water are supplied; food and shelter are not.

- Deserted Island: a warm environment.
- North Pole: a cold environment with snow and ice.

The instructions, helper questions, quantities and procedure otherwise match.
The participant first selects three items and explains their reasoning. Buzz
explores one relevant tradeoff at a time, without deciding for them. Normal
completion requires the Cognitive completeness check and a spoken confirmation
of the final three items. Suggestions are not selections. There is no official
ranking or guaranteed survival outcome.

The list retains 5 cans of Canned beans. Portable stove with fuel counts as one
choice; Metal cooking pot is separate. The canonical insect-repellent label is
**Bug spray**. Tent, Insulated sleeping mat, Portable stove with fuel and Metal
cooking pot replace Magnifying glass, Hammock, Blanket and Radio respectively;
Bug spray fills the 24th slot. Machete and Sunscreen remain.

North Pole uses task ID `north_pole`, never `leaves`. New filenames and order
IDs use that ID. Existing historical Leaves logs remain untouched. The filename
parser recognizes legacy filenames, but Leaves cannot start a new session.

## Affective conversations and participant-led ending

Positive and Negative share the same ending policy. Buzz listens to the
participant's own experience and uses specific, brief reflections without
advice, emotion menus or repeated summaries.

The ordinary target remains 4–5 minutes. Three minutes opens an optional ending
window; 4:30 prompts convergence, and five minutes is a soft target that cannot
interrupt speech. Ordinary Affective progression includes at least two
substantive follow-ups and a one-time final invitation.

A clear contextual “I'm good” after an invitation to continue, “nothing else to
share”, or an explicit request to finish the current activity can end it before
three minutes. Buzz calls `finish` with reason `participant_done`, gives a brief
acknowledgment and the exact closing, without another confirmation or recap.
This bypasses ordinary duration/follow-up/final-question requirements. A
Cognitive participant-led early ending does not imply that final choices were
confirmed. The event log distinguishes it from ordinary `completed`.

The model interprets context and the browser rejects empty or ambiguous
completion evidence. Silence, a bare OK/yes, an uncertain or short answer alone
must not terminate an activity. Outstanding questions/accepted help still take
priority. Explicit study/session stop or discomfort uses `stop` and never
automatically advances. Activity-only completion may advance after all files save.

## Saved files and versions

Each task produces separate Audio_Record, Txt_Log and Event_Log files. Recordings may instead be m4a or ogg
depending on browser support. Metadata includes prompt/controller versions,
condition, task, order position, test-mode use and closing reason. Existing
files are not overwritten; suffixes avoid collisions.

`assistant_modes.py` is the configuration and prompt source of truth.
`Agent.md` describes the current protocol. `UPDATE_NOTES.txt` records this
release and its baseline. Superseded documents are preserved under docs/history.

## Export driving sentences

`export_voice_sentences.py` exports the five starting and five ending driving
sentences using the existing `.env` API key, Realtime model, voice, speed and
shared voice delivery instructions. It does not need the web server running.

```sh
python -m pip install websocket-client
python export_voice_sentences.py
```

Files are saved as `output/starting_01.wav` through `starting_05.wav` and
`output/ending_01.wav` through `ending_05.wav` (mono, 16-bit, 24 kHz).
Existing files are skipped. Use `--overwrite` to regenerate them or
`--output-dir PATH` to choose another folder. Generation uses the paid API.

## Checks

```sh
python3 -m unittest discover -s tests
node tests/test_turn_controller.js
```

The optional real-browser checks require Playwright and installed Chrome:

```sh
APP_PORT=8765 python3 server.py
# In another terminal:
node tests/test_ui.cjs
```

They use synthetic audio events, not a live API call or microphone recording.
A live voice pilot remains necessary to evaluate generated wording and latency.
