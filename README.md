# Buzz Realtime Voice Study

This local research application runs two short, task-specific speech-to-speech
conversations through the OpenAI Realtime API. It supports two between-subject
conditions:

- **Cognitive:** Autumn Leaves and Desert Island
- **Affective:** Positive Memory and Negative Memory

The researcher selects one of two counterbalanced task orders. Each task has a
private one-minute preparation period followed by an approximately four- to
five-minute conversation with Buzz.

The no-agent control condition is intentionally not implemented as a Neutral
voice-agent route. Participants assigned to that condition should follow the
separate no-agent study procedure.

## Shared configuration

- assistant name: **Buzz**
- voice: **marin**
- speed: **1.0**; the shared delivery prompt requests a slightly slower natural pace
- model default: **gpt-realtime-2.1**
- input transcription default: **gpt-4o-mini-transcribe**
- language: English
- reasoning effort: low
- participant microphone muted during Buzz speech and task preparation

Prompt version: `pilot-2026-10-11-v17`

Turn-controller version: `turn-control-2026-10-11-v18`

## Start the application

Requirements:

- Python 3.8 or later
- a current browser with WebRTC, Web Audio, and MediaRecorder support
- an OpenAI API key with access to the configured Realtime model
- participant consent handled through the approved study procedure

Run locally:

1. Copy `.env.example` to `.env`.
2. Replace `YOUR_OPENAI_API_KEY_HERE` with the real key.
3. Start the server:

   ```bash
   python3 server.py
   ```

4. Open <http://127.0.0.1:8000> on the same computer.

Stop the server with `Ctrl+C`.

## Researcher workflow

The researcher enters a Participant ID, selects the assigned condition, and
selects the counterbalanced task order.

| Condition | Order 1 | Order 2 |
| --- | --- | --- |
| Cognitive | Leaves → Desert Island | Desert Island → Leaves |
| Affective | Positive → Negative | Negative → Positive |

For repeated researcher-only testing, **Researcher test mode** may be enabled
before preparing the participant view. It skips the one-minute wait for both
activities; in Activity 2, the start button becomes available only after the
spoken transition finishes. The option is off by default and its use is stored
in the transcript and event-log metadata. Leave it off for participant runs.

The participant screen does not show condition labels, prompt versions,
transcripts, connection details, or file paths.

## Participant and session flow

### Activity 1

1. The task card appears.
2. The start button remains disabled for 60 seconds. No numeric countdown is
   displayed.
3. The participant selects **Start conversation with Buzz**.
4. A new Realtime session and mixed-audio recording begin.
5. Buzz introduces itself and asks the exact task question.
6. After Buzz delivers the exact closing, the browser ends and saves the task.

### Activity 2

1. After all Activity 1 files save, a new Realtime session is created.
2. Buzz says exactly: “Let’s move to the next activity.” Its request waits until
   at least three seconds after Activity 1's closing audio actually stops.
   Saving and reconnecting count toward this gap; a connection taking longer
   than three seconds does not add another wait. Researcher test mode uses the
   same gap.
3. The next task card remains on screen for a new 60-second private preparation
   period. The microphone stays muted and this interval is not recorded.
4. The participant selects **Start conversation with Buzz**.
5. Recording begins and Buzz asks only the task-specific question; it does not
   introduce itself or repeat the transition.
6. After the exact final closing, the task ends and saves automatically.

Each task therefore has its own Realtime context and its own audio, transcript,
and event-log files. Content from Activity 1 is not supplied to the Activity 2
model session.

## Exact programmed speech

| Task | Activity 1 opening | Activity 2 question |
| --- | --- | --- |
| Positive Memory | “Hello, I’m Buzz. What positive memory would you like to share?” | “What positive memory would you like to share?” |
| Negative Memory | “Hello, I’m Buzz. What negative memory would you like to share?” | “What negative memory would you like to share?” |
| Autumn Leaves | “Hello, I’m Buzz. How would you explain why leaves change color in autumn to a seven-year-old?” | “How would you explain why leaves change color in autumn to a seven-year-old?” |
| Desert Island | “Hello, I’m Buzz. Which three items did you choose for the island?” | “Which three items did you choose for the island?” |

Exact closings:

- Cognitive, either activity: “That completes our conversation. Thank you!”
- Affective, either activity: “That completes our conversation. Thank you for sharing with me.”

The old post-closing “Okay, bye.” exchange has been removed. Saving begins when
the exact closing finishes playing.

## Preparation cards

Each task card mirrors the study script structure: a title, full task text,
optional helper questions, bold emphasis, and the **1 minute** / **4–5
minutes** timing guidance.

- **Positive Memory:** one specific event from the past ten years associated
  with feeling happy, pleased, or joyful.
- **Negative Memory:** one specific event associated with feeling unhappy,
  disappointed, or frustrated, plus the non-traumatic and comfort boundary.
- **Autumn Leaves:** the child’s exact question, helper prompts for accurate and
  simple language, and the reminder that there is no single correct wording.
- **Desert Island:** exactly three choices from the fixed list for five days;
  appropriate clothing and drinking water are provided, but food is not.
  `Canned beans` remains in the allowed list. The item options are included
  in the participant-facing preparation card configuration.

## Prompt architecture

`assistant_modes.py` is the executable source of truth. Prompts use short,
labeled modules instead of one undifferentiated instruction block:

1. shared identity, voice, listening, and context-first rules;
2. task-position rules and the exact closing;
3. Cognitive or Affective condition behavior;
4. task-specific facts, state flow, confirmation, and safety rules.

The Cognitive flow is:

```text
initial answer and context
→ reasoning or knowledge support
→ refinement (optional Leaves example or rehearsal)
→ missing/reconsideration check
→ Island only: final three-item confirmation
→ exact close
```

The Affective flow is:

```text
memory context
→ concrete detail or moment
→ participant-described experience and grounded empathetic response
→ final invitation to share more
→ wait for the participant’s answer
→ response to any additional content, or a brief acknowledgment of no more to add
→ exact close with thanks for sharing
```

The explicit “anything important we missed” check is Cognitive-only. Affective
tasks instead ask once: “Before we finish, is there anything else you'd like to
share about that experience?” Buzz waits for the answer before acknowledging
and closing. Each memory uses at least two substantive follow-ups, usually aiming for three.
Clear refusal or discomfort overrides the minimum at any time.
Short listening responses without questions are allowed. Buzz uses the
participant’s own everyday framing and avoids
psychological labels, moral evaluation, poetic reframing, advice, or imposed
meaning.
An emotionally significant answer receives a specific response before the
final invitation, usually two brief connected sentences. A reflection-only turn
is allowed. Do not add a summary of the memory as an ending step. If the
participant shares more after the invitation, respond to that content
specifically. If they have nothing more, a brief “Okay” and the exact closing
with thanks are sufficient; no retrospective reflection is required. Starting work or taking another action does not establish relief or
recovery unless the participant says so.

Leaves uses progressive disclosure rather than an immediate science lecture.
Buzz first engages the participant’s usable idea, adds at most one new science
idea in a normal support turn in child-friendly language, and does not use technical terms in
the first teaching response. Island likewise begins with clarification and the
participant’s reasoning before any tradeoff or alternative. A Buzz suggestion
never becomes a selected item without an explicit participant choice. Leaves
avoids repeated teach-back when the participant is confused. Before the last
check it returns from conceptual questions to building an explanation for the
seven-year-old: help with what to explain first, understandable words, and
causal links. An already supplied/endorsed child explanation or an explicit
decline needs no repeated exercise. At wrap-up it offers once whether Buzz
should give an example based on the discussion or the participant would like
to explain as if Buzz were the child. It waits for the choice, follows the
chosen path, and clarifies a bare yes. Existing explicit example requests are
fulfilled without another choice, and no full rehearsal is appended. No rehearsal follows the final check automatically. Island never guarantees
survival. Affective follows the participant's concrete story without imposing
emotional categories or bodily questions; future worries are gently redirected
once to a specific experienced moment, without scheduling or coaching.

Leaves support must connect the autumn conditions, the green material's role
in making food, reduced replacement/breakdown, and visible yellow/orange colors.
“Green fades, so other colors show” alone is not the expected final explanation.
Buzz proactively fills a missing link for a passive participant; short agreements
do not justify repeating the same fact or switching to wording menus. A requested
or needed complete example can combine established ideas in up to 70 words after
the first support response. Depth comes from connected reasoning, not a turn quota.

Island participants use the printed item list. The on-screen task card retains
the scenario, choose-three instructions, and optional guiding questions, but no
item-option list. The agent still receives all 23 canonical options and quantities.

## Timing controls

Both conditions use the same clock and policy. Timing starts at Buzz's first
opening audio, ends after its closing audio, and excludes preparation, task
transition and connection setup. It includes the participant's initial answer,
pauses, final check, final answer and farewell.

- 3:00: ending becomes eligible if content is sufficiently explored; do not force
  a check or fill a turn quota. Respond meaningfully to long opening stories.
- Around 4:30: prepare a wrap-up once required exchanges have happened.
  Affective tasks wait for at least two delivered follow-ups and the latest answer.
  The browser excludes opening/final questions, repetitions, cancelled speech and
  recognized listening repairs from its conservative question counter. Live
  review remains necessary to judge substantive relevance.
- 5:00: soft target, not an audio cutoff. Wait for speech and required answers;
  record any overrun and the state at the target in the event log. There is no
  fixed overrun cap; welcome additional participant sharing and respond to it.

The clock updates independently of participant turns, but never starts a response
while speech, transcription or playback is pending. An idle pause of eight
seconds can initiate the final invitation after 4:30. Silence is never treated
as a final answer. Stop/discomfort requests override the minimum and end without
automatically starting the next task.

Ending stages track question playback and a subsequent participant reply. The
model calls a silent `study_progress` function; the browser validates the stage
before requesting a separate closing response. Affective waits for additional
sharing or a decline; Leaves can finish after its check, while Island still
requires three-item confirmation. Obvious repeat/time requests and a bare yes to sharing
or rehearsal cannot authorize a finish. A spoken closing without authorization
is logged as a failure rather than automatically saving. Semantic interpretation
and compliance of streamed speech still need a live voice pilot; offline tests
do not establish conversational quality or trust effects.

Questions and listening complaints take priority over every ending stage.
The controller places a listening hold for detected questions/corrections;
`study_progress` action `repair_needed` also allows the model to request one
without a phrase match. A normal progression call cannot clear this hold.
An actual repair response must finish playing (not merely be transcribed or
claimed in a tool call), followed by a later participant reply without another
detected question/complaint. The model must still judge whether the substance
is resolved. Silence and an elapsed timer never release the hold. Playback
proves delivery, not the semantic quality of the answer; live pilots remain
necessary. Leaves rewrites must preserve the cause of the color change rather
than substituting decorative metaphors or repeated style choices.

## Realtime turn controller

```text
reasoning.effort: low
audio.input.noise_reduction.type: far_field
audio.input.turn_detection.type: semantic_vad
audio.input.turn_detection.eagerness: medium
audio.input.turn_detection.create_response: false
audio.input.turn_detection.interrupt_response: false
browser response trigger: clear, coalesced input transcription
pending-transcription barrier: enabled
microphone policy: muted during Buzz speech and preparation
continuation grace: 0 ms normally; 300 ms for clearly incomplete speech
```

The browser ignores empty and filler-only speech events. It waits for every
started or committed speech item to finish transcription before requesting a
response. If the participant continues speaking after response generation
starts but before Buzz audio begins, the pending response is cancelled and the
speech chunks are coalesced into one replacement response.

## Saved files

The delivery archive contains empty `Audio_Record/`, `Txt_Log/` and `Event_Log/`
folders. The existing server creates missing folders when saving; prior test
outputs and actual secrets are excluded from delivery, not deleted at source.

Each task saves three matching artifacts:

| Directory | Content |
| --- | --- |
| `Audio_Record/` | mixed participant and Buzz audio |
| `Txt_Log/` | timestamped readable transcript and task metadata |
| `Event_Log/` | JSON turns, timing, session settings, controller events, and failures |

Filenames include date, participant, condition, task, and task position:

```text
Audio_Record/260925_P001_cognitive_leaves_T1.webm
Txt_Log/260925_P001_cognitive_leaves_T1.txt
Event_Log/260925_P001_cognitive_leaves_T1.json

Audio_Record/260925_P001_cognitive_island_T2.webm
Txt_Log/260925_P001_cognitive_island_T2.txt
Event_Log/260925_P001_cognitive_island_T2.json
```

Safari may produce `.m4a`; Chromium-based browsers commonly produce `.webm`.
When a matching basename already exists, the server appends `_02`, `_03`, and
so on without overwriting existing data.

## Visual design

The participant UI uses an abstract circular Buzz voice animation rather than
the former character image. Its palette uses Georgia Tech Gold (`#B39051`),
Buzz Yellow (`#EAAA00`), Navy (`#051E39`), Dark Gold (`#8F713D`), and White.
Navy text is used on yellow/gold controls for accessible contrast.

## Tests

Run all local regression checks:

```bash
python -m unittest discover -s tests -v
node tests/test_turn_controller.js
```

The tests cover prompt composition, structured task cards and bold content,
exact wording, condition/task validation, counterbalancing, condition-specific
timing controls, normal and researcher-test preparation, task transition, turn
coalescing, microphone muting, automatic exact-close saving, filename metadata,
collision protection, and event-log validation.

## Earlier v12 fixes retained

Prompt v13 / controller v14. Clear-transcript grace remains **0ms**, with the
existing 300ms incomplete-fragment grace unchanged. Voice marin and speed 0.95 remain.

Test these cases in Researcher Test Mode:

- Leaves: accept an offered rewrite with “Mmm, sure, yeah.” Buzz must deliver it.
- Leaves: an adequate explanation plus “nothing else” at the final check must
  close without forced rehearsal. A requested rehearsal remains available.
- Affective: “Honestly, I don't know” receives a grounded response before the
  final invitation; no routine “we can pause here” suggestion.
- Resume speaking at a sentence boundary. Known continuation at playback start
  clears the buffer; this cannot guarantee inaudibility if detection arrives late.
- An omitted exact closing retries once. A second omission saves an error and
  asks the participant to return the device; no automatic next task in this case.

Offline controller regressions cover accepted offers, optional Leaves ending,
closing retries/event order and continuation gating. Python server tests also run.
No live API/audio test has been performed for this version. Evaluate tone, latency,
explanation quality and both task orders before using it with participants.


## v14 pilot history

Prompt v14 / controller v15 supersede the earlier pacing and follow-up guidance.
Every finish/stop transition requires a non-empty acknowledgment of up to 40
words. Empty or invalid text triggers a context-aware retry without another
participant answer. Gratitude words are allowed. The browser also checks that
the planned acknowledgment was delivered before saving a normal closing.

Leaves begins with one starting concept or clue, never a finalized child-ready
answer in the first support response. A complete example may be offered early
after that first response when requested or needed, then adapted together.
The participant's own summary is the default, without a required performance.

The final sharing invitation remains open. Participant additions receive a
grounded response before the exact closing. Timers never substitute for an
answer. Live voice pilots must still assess listening quality, groundedness and
the intended trust contrast; offline tests do not establish these outcomes.
The exact closing uses empty input context; stage instructions are replaced, not
accumulated. Early heard checks are honoured and logged. Normal first-task
completion prepares Activity 2; stop/skip and error sessions do not advance.

## v17 pilot handoff

Prompt v17 / controller v18 add a one-time Leaves example-or-explain choice.
Its playback receipt is tracked, so later ending controls do not repeat it.
An accepted example is delivered; a participant choosing to explain gets time
to speak. Both paths and the choice itself can be declined.

In both Affective tasks, give a final invitation, wait, and respond specifically
if new content is shared. If there is nothing more, use a brief acknowledgment
and the exact closing with thanks for sharing. Do not add a full-memory summary
or a required retrospective reflection after the decline. This supersedes the
older v15/v16 post-decline reflection rule. Responding empathetically to the
participant's actual sharing remains part of the conversation.

Replace assistant_modes.py and web/app.js together, restart the server, and
hard-reload the browser. Python server/config tests and JavaScript regressions
pass. Tests cover both memory tasks, a repeated final invitation, new sharing,
required response delivery, cancelled Leaves-choice playback, and the existing
three-second transition gap. Live model quality still requires a voice pilot.

## v16 pilot history

Prompt v16 / controller v17 retain v15's Affective empathy, follow-up minimum,
printed Island list, listening priority, and closing safeguards. They add:

- Leaves explicitly returns to child-explanation building after conceptual
  questions. “I understand the concept” is not assumed to endorse a final
  explanation. Buzz works from the participant's idea, asks one practical
  guiding question and waits, or supplies an example to adapt when stuck.
  A full rehearsal is optional and a refusal is respected.
- All responses use one shared delivery profile, including opening, transition,
  and closing responses whose instructions override the session instructions.
  Audio speed is 1.0; slower speech is requested in the profile. Voice remains
  marin, subject to the existing OPENAI_REALTIME_VOICE environment override.
- Task 2's transition is requested only after the first closing playback end
  plus at least three seconds. Late transcripts do not reset that deadline.
  The JSON log records the transition playback gap under
  preparation.transition_timing.actual_gap_seconds.

Replace assistant_modes.py and web/app.js together, restart the server, and
hard-reload the browser. Python server/config tests and offline controller
regressions pass, including the gap in both conditions and both researcher-test
settings, early timer wakes, slow reconnects, and a replaced session.
These checks cannot verify generated speech quality or the model's actual
child-explanation guidance; compare those in a live pilot.

## v15 pilot history

Prompt v15 / controller v16 address the four October 11 v14 pilot transcripts.
Leaves now has an explicit explanatory-depth expectation and proactive support
for short answers. Affective prompts and per-turn ending controls require grounded
empathy before the invitation and after a final decline. Negative memories must
not be reframed as recovery just because the participant took an action. Island's
item options are removed from the task card; the printed list and internal agent
constraints remain authoritative.

Install `assistant_modes.py` and `web/app.js` together, restart `server.py`, and
hard-reload the browser before a new session. Voice, model, follow-up targets,
timing policy and closing-delivery safeguards remain as in v14. Offline checks
verify configuration and controller behavior; they do not verify the model's
scientific explanation or the quality of spoken empathy.

Check these in the next live pilot:

- Leaves: answer briefly or say “I don't know.” The first support response is a
  starting clue, and later support supplies the missing causal connections
  without waiting for repeated “why” requests or forcing teach-back.
- Island: no option list appears in preparation or conversation; the agent
  still confirms exactly three items from the printed canonical list.
- Positive: a moving final detail gets a specific empathetic response before
  the invitation, without a forced menu of emotions.
- Negative: difficulty receives context-specific empathy without assumed
  relief; “nothing else,” including after a repeat, gets a grounded acknowledgment.

Scientific background checked against NPS and Harvard Forest:

- https://www.nps.gov/romo/learn/nature/learn-about-fall-colors.htm
- https://www.nps.gov/articles/why-do-leaves-change-in-the-fall.htm
- https://harvardforest.fas.harvard.edu/education-opportunities/classic-outreach-resources/autumn-foliage-color/leaf-science/leaf-process/
