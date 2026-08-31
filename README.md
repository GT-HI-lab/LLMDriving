# Nomi Realtime Voice Pilot

This local study application runs low-latency speech-to-speech conversations
through the OpenAI Realtime API. It implements two scenarios—**Trip** and
**End-of-Day**—with **Cognitive** and **Affective** conversation routes. A
Neutral route remains available in researcher setup for possible later use.

Every route intentionally uses the same assistant identity and speech baseline:

- name: **Nomi**
- voice: **marin**
- speed: **1.00**

The browser records the mixed participant-and-assistant audio. When the
researcher selects **End conversation**, the server saves the audio, ordered
timestamped transcript, and lightweight JSON study event log locally.

## Requirements

- Python 3.8 or later
- a current browser with WebRTC, Web Audio, and MediaRecorder support
- an OpenAI API key with access to the configured Realtime model
- participant consent before recording

The Python server has no third-party dependencies.

## Start the application

1. Copy `.env.example` to `.env`.
2. Replace `YOUR_OPENAI_API_KEY_HERE` with the real API key.
3. Start the server:

   ```bash
   python3 server.py
   ```

4. Open <http://127.0.0.1:8000> on the computer running the server.

Stop the server with `Ctrl+C`.

## Two-stage study interface

### 1. Researcher setup

The researcher:

1. enters the Participant ID;
2. selects Trip or End-of-Day;
3. selects Cognitive or Affective (Neutral is retained but reserved);
4. selects **Prepare participant view**.

Recording consent is handled through the approved study procedure outside this
interface. The participant screen still displays a recording notice before the
conversation begins.

### 2. Participant view

The participant sees only Nomi, the assigned task preparation, and minimal
start/save/completion messages. Route names, selectors, prompt versions,
transcripts, recording state, and connection diagnostics are not shown.

- **Trip:** every route uses the same participant context, starter, and opening.
  The participant reads the displayed starter after Nomi asks what they would
  like to discuss.
- **End-of-Day:** the instruction screen asks the participant to prepare a
  route-appropriate topic. Nomi asks the same opening question in every route,
  and the participant introduces the topic naturally in their own words.

The assigned preparation remains visible while Nomi opens the conversation. It
is hidden when the participant's first clear, non-filler speech turn has been
coalesced and is ready for a response, so noise or a filler fragment cannot hide
it.

The researcher can select **End conversation** at any time. After the normal
final closing, a brief participant acknowledgment or farewell triggers Nomi's
fixed “Okay, bye.” response and automatic saving when that audio finishes. The target
is a natural 7–10-minute conversation.

After saving completes, select **Return to researcher setup** to see exact file
names, the transcript, and connection diagnostics.

## Study configuration

The complete behavior specification is in `Agent.md`. The executable,
versioned prompt modules and participant-facing scenario configuration are in
`assistant_modes.py`.

Current prompt version:

```text
pilot-2026-08-31-v7
```

Current browser turn-controller version:

```text
turn-control-2026-08-31-v8
```

### Programmed openings

| Scenario | Opening shared across routes |
| --- | --- |
| Trip | “Hi, I’m Nomi. It’s good to talk with you. What would you like to talk about today?” |
| End-of-Day | “Hi, I’m Nomi. It’s good to talk with you. How has your day been?” |

The browser requests the opening separately and keeps the microphone muted until
the opening audio has actually finished playing. The three bars in Nomi's
conversation orb remain still while waiting or listening and animate only while
Nomi's output audio is playing.

### Response budgets

| Turn | Prompt target |
| --- | --- |
| Regular exploration | 20–35 spoken English words |
| Closure proposal | 35–50-word provisional synthesis, then the exact gate |
| Confirmed close | “All right,” one 12–25-word takeaway sentence, then the exact closing |

These are model instructions rather than hard truncation. Validate adherence in
pilot transcripts.

### Realtime session settings

```text
reasoning.effort: low
audio.input.noise_reduction.type: far_field
audio.input.turn_detection.type: semantic_vad
audio.input.turn_detection.eagerness: medium
audio.input.turn_detection.create_response: false
audio.input.turn_detection.interrupt_response: false
browser response trigger: clear, coalesced input transcription
pending-transcription barrier: enabled
microphone policy: muted while Nomi audio is playing
continuation grace window: 0 ms
clearly-incomplete transcript grace: 300 ms, conditional only
pre-playback continuation: cancel the pending response and merge the new speech
synthesis floor: 420 seconds
convergence control: 420 seconds
closure-gate control: 510 seconds
no-new-exploration upper bound: 600 seconds
```

### How Nomi decides when to respond

- All routes use the same configured voice and speed.
- Semantic VAD identifies likely speech boundaries, but it does not
  automatically interrupt Nomi or create a response.
- The browser waits for transcription and ignores no-speech or filler-only
  items.
- Every started or committed participant speech item blocks a response until
  its transcription completes or fails.
- Nomi does not start another response while the participant is speaking,
  transcription is pending, or Nomi audio is playing.
- The normal fixed continuation delay is **0 ms**.
- A transcript that clearly ends unfinished—such as “but…,” “because…,” or “it
  depends on…”—gets a conditional **300 ms** continuation window.
- If the participant continues during that window, the speech chunks are
  merged into one turn.
- If a response was requested but Nomi audio has not started, new participant
  speech cancels that response and is merged into one replacement response.
- If transcription fails, the application retains the audio item rather than
  silently discarding a potentially valid turn.

### Current interruption policy

- The browser mutes the participant microphone while Nomi audio is playing and
  re-enables it when playback stops or is cleared.
- This **half-duplex** policy reduces the chance that speaker echo is mistaken
  for participant speech and truncates Nomi.
- The trade-off is that participants cannot reliably interrupt Nomi while she
  is speaking. This remains an open pilot-design decision.

### Study pacing controls

- **Before 7:00:** endpoint synthesis and closing are blocked.
- **At 7:00:** Nomi begins converging and should not open a new topic or
  preference category.
- **At 8:30:** the next eligible response should give the endpoint synthesis and
  use the shared closure gate.
- **At 10:00:** Nomi cannot open another exploratory branch.
- These are conversation controls, not an automatic timer that ends the
  session. Nomi must still wait for participant confirmation before closing.

### Participant-controlled closing

- Nomi presents one provisional synthesis and asks: “Does that fit well enough
  to wrap up, or is there anything you’d still like to adjust or think
  through?”
- If the participant requests a correction or more help, Nomi addresses that
  point before asking the gate again in a later turn.
- The gate cannot appear in consecutive Nomi turns.
- If the participant confirms there is nothing else, Nomi says “All right,”
  gives one concise takeaway, and ends with: “Thanks for talking this through
  with me. We can talk again later if you’d like.”
- Nomi does not repeat the full synthesis after confirmation.
- If the participant then gives a brief acknowledgment or farewell, Nomi says
  exactly “Okay, bye.” and the application saves and ends the session after
  playback.

### Route behavior summary

- **Cognitive Trip:** map the main criteria, contribute two supported trip
  directions and a real trade-off, and avoid requiring a ranked priority or
  tie-breaker. Discuss budget only after the participant introduces it; leave it
  unresolved if the participant does not know.
- **Cognitive End-of-Day:** when the desired result is unclear, ask once near
  the beginning what would be useful to figure out. Use that answer to choose
  an overall map, comparison, plan, or focused deep dive.
- **Affective Trip:** use no more than two nonconsecutive category-focused
  questions, avoid forced prioritization, and deepen one participant-supported
  meaning or experiential tension.
- **Affective End-of-Day:** articulate both sides of ambivalence before action,
  do not repackage rejected advice as a smaller version, and reconnect advice
  to meaning after at most two consecutive advice turns.
- No individual adjective such as “lovely” is required or prohibited.
  Experiential language must be supported by the participant's own details.

### Pilot audio setup

- Headphones are useful for diagnosing whether speaker echo is producing false
  VAD turns, but they do not replace the application safeguards.
- Use one consistent audio setup across study sessions and record which setup
  was used.

## Conversation files and why they are collected

At the end of a session, the application saves three matched research
artifacts. Each serves a different purpose:

| File | What it contains | Why it is collected |
| --- | --- | --- |
| Mixed audio | Participant and Nomi audio in one recording | Verify what was actually audible, including pauses, overlap, recognition errors, and voice changes |
| Text transcript | Human-readable timestamped conversation | Review content and code route fidelity, repetition, usefulness, advice, and closing behavior |
| JSON event log | Transcript turns plus technical timestamps and controller state | Diagnose latency, interruptions, missing turns, pacing, failures, and whether the assigned condition ran as intended |

The server creates these directories as needed:

```text
Audio_Record/
Txt_Log/
Event_Log/
```

All three files share the same server-issued basename:

```text
Audio_Record/260823_P001.webm
Txt_Log/260823_P001.txt
Event_Log/260823_P001.json
```

Safari commonly records MP4 audio as `.m4a`; Chromium-based browsers commonly
record WebM. If the same Participant ID is used more than once on a date, the
server adds `_02`, `_03`, and so on without overwriting prior data. Collision
checks cover all supported audio extensions plus paired text and JSON logs.

These files are raw research data rather than outcome measures by themselves.
They support pilot diagnosis, manipulation-fidelity coding, and decisions about
whether a session should be retained or flagged for a technical problem.

### Mixed audio recording

The audio file contains:

- the participant's microphone audio;
- Nomi's played audio;
- both streams mixed into one compressed recording.

Use the audio to:

- verify the words that were actually spoken when automatic transcription is
  wrong;
- inspect long silences, overlap, interruption, echo, or background noise;
- check sudden changes in Nomi's voice delivery;
- confirm whether a transcript-only problem was audible to the participant.

The application does not currently create separate participant-only and
Nomi-only audio tracks.

### Text transcript

The text file includes:

- Participant ID;
- scenario and conversation route;
- prompt version and assistant name;
- session start and end timestamps;
- audio filename;
- ordered participant and Nomi turns with timestamps.

Use the text transcript to:

- read and qualitatively code the conversation without replaying the full
  recording;
- compare Cognitive and Affective route behavior;
- identify repeated questions, forced choices, unsupported interpretations,
  advice patterns, summaries, and closing language;
- quote or annotate turns during internal pilot review.

Participant speech is automatically transcribed and can contain errors. The
browser preserves turn order as accurately as possible while asynchronous
transcriptions arrive, and waits briefly for late events before saving. When
the text and audio disagree, use the audio to verify the participant's words.

### JSON technical event log

The browser keeps a small event array in memory and uploads it once, after the
audio and transcript save attempts. It does not call a model for logging, so
logging itself adds no model latency during the live conversation.

The JSON file contains:

- **Condition and version:** participant ID, scenario, route, prompt version,
  controller version, model, voice, and speed.
- **Applied session settings:** configured VAD and transcription settings plus
  the settings reported back by the actual Realtime session.
- **Session summary:** start, end, duration, manual or automatic stop, programmed
  opening, response-batch count, and paired filenames.
- **Conversation turns:** participant and Nomi text, timestamps, word counts,
  ignored-turn status, and transcription-pending status.
- **Turn-taking events:** speech start/stop, transcription completion or
  failure, queued or merged item IDs, response request/creation/completion, and
  audio playback start/stop/clear.
- **Controller state:** response blockers, conditional 300 ms waiting,
  cancel-and-merge events, microphone state, and pacing controls.
- **Ending checks:** whether the closure gate, exact closing, and final “Okay,
  bye.” were detected.
- **Failures:** connection, transcription, response, saving, or final-event
  timeout errors recorded during the session.

Use the JSON event log to answer technical questions such as:

- How long passed between `participant_speech_stopped`, transcription
  completion, the response request, and `output_audio_buffer_started`?
- Did Nomi wait because transcription was pending, the participant was still
  speaking, or earlier Nomi audio was still playing?
- Was a response cancelled and merged because the participant continued?
- Did a response or audio buffer fail, clear, or truncate?
- Which 7:00, 8:30, or 10:00 pacing control was active when Nomi summarized?
- Did the participant request more help after the closure gate, and did Nomi
  close anyway?

The JSON file repeats the conversation text so transcript turns can be aligned
with technical events. It should therefore be protected like the audio and text
transcript, not treated as anonymous system telemetry.

### Data that is not saved in these artifacts

- the OpenAI API key;
- the full private route prompt text—the prompt version is saved instead;
- raw WebRTC packets;
- a separate participant-only or Nomi-only audio track.

Use a pseudonymous Participant ID and follow the approved consent, access,
retention, and deletion procedure because audio and transcript text may contain
identifiable or sensitive information.

## Health and safe study configuration

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/study-config
```

`/health` reports whether an API key is configured but never returns it.
`/study-config` returns only the browser-safe participant configuration and
runtime settings, not the private route prompts.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | safe placeholder | Server-only OpenAI API key |
| `OPENAI_REALTIME_MODEL` | `gpt-realtime-2.1` | Realtime model |
| `OPENAI_REALTIME_VOICE` | `marin` | Shared voice for every route |
| `OPENAI_TRANSCRIPTION_MODEL` | `gpt-4o-mini-transcribe` | Participant transcription |
| `OPENAI_INPUT_LANGUAGE` | `en` | Input transcription language hint |
| `OPENAI_SAFETY_IDENTIFIER` | `local-demo-user` | Stable local safety identifier |
| `APP_HOST` | `127.0.0.1` | Local bind address |
| `APP_PORT` | `8000` | Local server port |
| `TLS_CERT_FILE` / `TLS_KEY_FILE` | empty | Optional HTTPS certificate and key |
| `SSL_CERT_FILE` | system default | Optional Python CA bundle |

Older per-mode voice variables may remain in an existing `.env`, but this
version intentionally reads only `OPENAI_REALTIME_VOICE` so the experimental
routes cannot drift to different voices.

## iPad access

iPad Safari requires a trusted HTTPS origin for microphone access over a local
network. Configure:

```dotenv
APP_HOST=0.0.0.0
TLS_CERT_FILE=/absolute/path/to/dev-cert.pem
TLS_KEY_FILE=/absolute/path/to/dev-key.pem
```

The certificate must cover the computer’s LAN IP address or `.local` hostname,
and its issuing certificate authority must be trusted on the iPad.

## Python CA certificate troubleshooting

If the server reports `CERTIFICATE_VERIFY_FAILED` on a Python.org macOS
installation, run its bundled certificate installer, for example:

```bash
"/Applications/Python 3.8/Install Certificates.command"
```

Alternatively, set `SSL_CERT_FILE` to a valid CA bundle in `.env`.

## Security and data handling

- The permanent OpenAI API key stays in the Python server.
- `.env`, recordings, transcripts, and event logs should remain excluded from
  Git.
- Participant IDs are filename-safe and validated before storage.
- Participant IDs accept 1–64 ASCII letters, numbers, underscores, or hyphens
  and must begin with a letter or number; spaces, path separators, and non-ASCII
  characters are rejected.
- Audio uploads are limited to 512 MB; text and JSON logs are limited to 5 MB.
- Files are written through temporary files and different existing content is
  never overwritten.
- JSON logs must be UTF-8, parse as the supported schema, and contain a valid
  Participant ID.
- The demo has no user authentication. Bind to `0.0.0.0` only on a trusted
  network.
- Apply the approved retention, access-control, and deletion protocol for study
  data.

A production multi-user deployment would additionally require authentication,
rate limits, audit controls, storage access control, and cost controls.

## Tests

```bash
python3 -m unittest discover -s tests -v
node tests/test_turn_controller.js
node --check web/app.js
```

The regression suite covers prompt composition, shared voice settings, scenario
configuration, VAD and response-gating configuration, pacing controls, filename
validation, collision handling, safe audio/text/JSON storage, conditional
incomplete-turn waiting, and pre-playback cancel-and-merge.

## Project structure

```text
.
├── .env.example
├── Agent.md
├── README.md
├── assistant_modes.py
├── assistant_modes_update.py   # compatibility import shim
├── server.py
├── tests/
│   ├── test_server.py
│   └── test_turn_controller.js
└── web/
    ├── index.html
    ├── app.js
    └── styles.css
```
