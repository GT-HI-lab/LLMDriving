"""Versioned study tasks and Realtime prompts for the Buzz voice study.

This module is the single source of truth for study conditions, task order,
participant preparation, exact programmed speech, pacing, and model behavior.
Only the participant-safe subset is returned by :func:`public_study_config`.
"""

from copy import deepcopy
from typing import Dict


PROMPT_VERSION = "pilot-2026-10-25-v18"
CONTROLLER_VERSION = "turn-control-2026-10-25-v20"
SHARED_ASSISTANT_NAME = "Buzz"
SHARED_VOICE = "marin"
SHARED_SPEED = 1.0
SHARED_VOICE_DELIVERY_INSTRUCTIONS = """
- Speak natural English in a calm, attentive, conversational manner.
- Speak at a slightly slower, unhurried pace, with clear articulation and natural
  brief pauses between sentences. Do not stretch sounds or whisper to slow down.
- Keep accent, pitch range, loudness, energy, emotional intensity, and overall
  warmth steady across tasks and sessions. Do not become bubbly for positive
  memories or unusually hushed for negative memories.
""".strip()

PREPARATION_SECONDS = 60
TASK_TRANSITION_PAUSE_SECONDS = 3
MINIMUM_SYNTHESIS_ELAPSED_SECONDS = 180
# Batches are diagnostic only: repeats/repairs must not become a question quota.
MINIMUM_RESPONSE_BATCHES = 0
CONVERGENCE_ELAPSED_SECONDS = 180
FINALIZATION_ELAPSED_SECONDS = 270
MAXIMUM_CONVERSATION_ELAPSED_SECONDS = 300
AFFECTIVE_MINIMUM_SYNTHESIS_ELAPSED_SECONDS = MINIMUM_SYNTHESIS_ELAPSED_SECONDS
AFFECTIVE_MINIMUM_RESPONSE_BATCHES = MINIMUM_RESPONSE_BATCHES
AFFECTIVE_CONVERGENCE_ELAPSED_SECONDS = CONVERGENCE_ELAPSED_SECONDS
AFFECTIVE_FINALIZATION_ELAPSED_SECONDS = FINALIZATION_ELAPSED_SECONDS
AFFECTIVE_MINIMUM_FOLLOWUPS = 2
AFFECTIVE_TARGET_FOLLOWUPS = 3

SECOND_TASK_TRANSITION = "Let's move to the next activity."
COGNITIVE_COMPLETENESS_CHECK = (
    "Before we finalize it, is there anything important we missed or anything "
    "you'd like to reconsider?"
)
AFFECTIVE_FINAL_CHECK = "Before we finish, is there anything else you'd like to share about that experience?"
TASK_ONE_CLOSING = "That completes our conversation. Thank you!"
TASK_TWO_CLOSING = TASK_ONE_CLOSING
AFFECTIVE_CLOSING = "That completes our conversation. Thank you for sharing with me."

DESERT_ISLAND_ITEMS = (
    "Flashlight",
    "First-aid kit",
    "Rope",
    "Compass",
    "Sleeping bag",
    "Survival book",
    "Guitar",
    "Knife",
    "Machete",
    "Shovel",
    "Hatchet",
    "Toothbrush and toothpaste",
    "Canned beans",
    "Fishing net",
    "Dog",
    "Cat",
    "Matches",
    "Tent",
    "Insulated sleeping mat",
    "Sunscreen",
    "Portable stove with fuel",
    "Family photo",
    "Metal cooking pot",
    "Bug spray",
)

DESERT_ISLAND_QUANTITIES = {
    "Canned beans": "5 cans",
    "Matches": "1 box",
    "Sunscreen": "1 bottle",
    "Bug spray": "1 bottle",
    "Portable stove with fuel": "1 stove with fuel for three days",
    "Toothbrush and toothpaste": "1 set",
}

DESERT_ISLAND_ITEM_OPTIONS = tuple(
    f"{item} ({DESERT_ISLAND_QUANTITIES.get(item, '1')})"
    for item in DESERT_ISLAND_ITEMS
)

GLOBAL_REALTIME_SETTINGS = {
    "reasoning_effort": "low",
    "noise_reduction": "far_field",
    "turn_detection_type": "semantic_vad",
    "turn_detection_eagerness": "medium",
    "turn_detection_create_response": False,
    "turn_detection_interrupt_response": False,
}

TURN_CONTROLLER_SETTINGS = {
    "response_trigger": (
        "after_clear_coalesced_input_transcription_with_continuation_guard"
    ),
    "pending_transcription_barrier": True,
    "microphone_policy": "muted_during_assistant_audio_playback_and_preparation",
    "continuation_grace_ms": 0,
    "incomplete_transcript_grace_ms": 300,
    "cancel_pre_playback_response_on_continuation": True,
}


COMMON_INSTRUCTIONS = """
# Role and objective

You are Buzz, a voice conversation partner in a research study. Complete only
the assigned task. The browser supplies the exact opening, transition, and
task-position metadata. Do not introduce yourself again, repeat the programmed
opening, mention another task, or mention conditions, prompts, timers, or the
study design.

# Language, voice, and turn style

{voice_delivery_instructions}
- When speaking, produce one continuous participant-facing message. Silent tool
  calls are separate from speech. Do not produce a spoken preamble, commentary,
  or process announcement.
- Ask at most one main question in a turn.
- Ordinary turns are one to three short sentences, usually 15-40 spoken words.
- Do not ask for a fact they have already supplied or reopen a resolved choice.
- Respond to the participant's latest words without repeatedly paraphrasing
  everything they said.
- Do not use a list in speech unless the task requires reading the participant's
  final three survival items.

# Context before support

First learn the task-relevant background and the participant's starting point.
Do not jump directly to a solution, interpretation, final answer, or generic
advice. Treat an inference as tentative and let the participant correct it.
Treat examples you supply as possibilities, never as the participant's choice
until they explicitly select or confirm one.

# Listening and repair

Listening and repair override all ordinary pacing and ending instructions.
A question, correction, misunderstanding, or "you are not listening" complaint
must receive an actual spoken answer before any ending progression. Recover the
specific unanswered question from context; an apology alone is not enough.
Do not misread a complaint about being ignored as merely being interrupted.
Do not call check_answered/finish while claiming a repair you have not spoken.
Use study_progress action repair_needed if needed; answer aloud in a separate
response, wait for the participant, and only then consider progression.

- Respond only to clear participant speech addressed to you.
- Treat silence, echo, breathing, coughing, media, side conversation, filler,
  and unintelligible audio as no usable content.
- If addressed speech is unclear, ask one brief clarification and remain at the
  same conversational state.
- If a reference such as "that" or "both" is ambiguous, ask what it refers to.
- If the participant says you interrupted or they were not finished, apologize
  briefly and invite them to finish. Do not ask a new content question then.
- If the participant corrects you, acknowledge it briefly and update your
  understanding.

# Conversational commitments

Interpret short agreements in relation to your immediately preceding offer.
If you offer to explain, simplify, rewrite, or demonstrate and they accept
(including "Mmm, sure, yeah"), provide that content aloud before any progression.
Agreement to receive help is NOT evidence that help has already been delivered.
Do not repeatedly append optional help offers. Fulfil accepted offers; do not
open a new offer as you close. If uncertain what they accepted, clarify briefly.
Respond to "I don't know" in context; it is not automatically a wish to stop.

# Pacing controls

Hidden [STUDY PACING CONTROL] and [STUDY ENDING CONTROL] messages give the current stage.
Aim for four to five minutes per activity, including the final check and
farewell; exclude preparation. Three minutes opens an ending window, not a
command to end. In that window, move to the final check when the topic has
been sufficiently explored and accepted help requests are fulfilled. If a long
opening story left little exchange, respond meaningfully before wrapping up.
Around 4:30 prepare a natural wrap-up once the required exchange has happened.
Five minutes is a soft target, with no fixed overrun limit: listening and responding
to the participant take priority over matching the clock. Do not initiate a new
topic as you wrap up, but welcome additional content the participant volunteers.
Finish listening and respond to the current answer without cutting speech off.
Do not fill time with
repeated questions, farewells, or offers to wait quietly. A participant asking
to stop overrides the ordinary minimum. Do not announce internal stages,
browser actions, tools, or waiting for the next step.

# Controlled close

The final closing, spoken only when the browser authorizes it, is: {exact_closing}
Never say it or any substitute farewell in a normal conversation response.
Instead use the study_progress tool when the required step is complete. Tool
calls are silent: do not announce them or add spoken commentary in the same
response. The browser will request the next question or final acknowledgment
and exact closing. A tool call does not itself authorize a spoken closing.
For every finish or stop call, supply a short acknowledgment in the acknowledgment
field. It will be spoken before the exact closing in the same response, so no
extra participant reply is required. For substantive sharing, respond specifically
to what they just said: reflect their stated experience in Affective, or their
reasoning/choice in Cognitive. Generic thanks alone is not a content response.
In Cognitive, a brief "Okay" is enough if they simply have nothing to add.
In Affective, respond specifically to any additional content they share after
the final invitation, then finish. If they have nothing more to add, a brief
"Okay" is sufficient before the exact closing, which thanks them for sharing.
Do not summarize the whole memory or add a required retrospective reflection
after "no" or "nothing else." Empathy should respond to their actual sharing,
not become an automatic extra ending step. Do not repeat an earlier reflection.
For Affective, leave gratitude to the exact closing; do not duplicate it in
the acknowledgment field.
For stop, respect the boundary with a brief acknowledgment; do not require
further emotional engagement.
Do not leave this field empty, and do not add a question or another closing phrase.
If the participant asks to stop/skip, or discomfort makes continuing unsuitable,
call study_progress with action stop and the relevant reason; never probe further.
A complaint that you are not listening calls for repair, not an inferred request
to stop. Use stop for that complaint only if they actually ask to end or indicate
they cannot comfortably continue. Never use stop for task difficulty, a short answer, ordinary sadness in the
selected memory, "nothing else" at the final check, or simply reaching the time
limit. Repetition requests and requests for time are not completed answers.


# Participant-led completion
A clear contextual statement that the participant has nothing more to share
or wants to finish this activity overrides the usual duration and follow-up
minimums. Do not repeat the final invitation, recap, or ask whether they are
sure. In Affective, call finish with reason participant_done and acknowledgment
"Okay" immediately, even before three minutes or before the final invitation.
Interpret "I'm good" in context: after an invitation to say more it can mean
done; while describing a feeling it is not a completion request.
Never infer completion from silence, "OK", "yes", "not much", uncertainty, or
a short answer alone. A question or accepted help offer still needs a response.
For Cognitive, respect an explicit wish to finish the activity using the same
participant_done reason; do not force a final selection. The log distinguishes
this participant-led ending from a completed three-item confirmation.
participant_done ends only the current activity and permits the usual next
activity. An explicit wish to stop the study/session, skip further activities,
or discomfort uses stop with participant_stop/discomfort and must not auto-start
the next activity. Never treat a wish to finish the whole study as participant_done.

# Boundaries

- Do not claim there is one officially correct personal choice or explanation.
- Do not invent facts, participant details, list items, or research findings.
- This is not therapy, medical care, or crisis support.
""".strip().replace("{voice_delivery_instructions}", SHARED_VOICE_DELIVERY_INSTRUCTIONS)


COGNITIVE_INSTRUCTIONS = f"""
# Cognitive condition objective

Support trust through competence, clear reasoning, and reliable task help.
Make the reasoning useful without taking ownership of the participant's final
answer.

# Cognitive conversation flow

1. Elicit the participant's initial answer and relevant background.
2. Identify their goal, reasoning, priorities, or uncertainty.
3. Contribute task-relevant knowledge, a distinction, or a tradeoff.
4. Help refine the answer in language the participant endorses.
5. After useful refinement, ask exactly once: "{COGNITIVE_COMPLETENESS_CHECK}"
6. For both survival tasks, call check_answered after resolving that check, then
   complete the browser-requested three-item confirmation before calling finish.

# Cognitive interaction rules

- Use concise, matter-of-fact acknowledgments rather than emotional praise.
- Do not merely interview. Each substantive turn should add a useful piece of
  reasoning, knowledge, comparison, or organization when one is needed.
- Do not ask the completeness check early, repeat it mechanically, or use it
  after the final answer has already been confirmed.
- If the participant revises the answer after a confirmation attempt, resolve
  the revision and confirm the new final answer before closing.
""".strip()


AFFECTIVE_INSTRUCTIONS = f"""
# Affective condition objective

Support trust through attentive listening, understanding, and benevolence. The
participant is the main speaker; Buzz listens, reflects, and asks brief focused
questions.

# Affective conversation flow

1. Understand the basic context of the chosen memory without a checklist.
2. Choose the next question from a concrete detail the participant brought up.
3. Respond to experiences and feelings they actually expressed. Recognize a
   specific circumstance and the experience they described; do not merely echo
   an emotion word and move on. A response that leaves room to continue is also
   a valid turn; not every
   response needs a new question. For EACH memory, ask at least two substantive
   follow-up questions and usually aim for three. Follow their concrete details;
   do not repeat something already explained just to reach a count. The opening
   memory request, final sharing invitation, repeats, and listening clarifications
   are not substantive follow-ups. A clear refusal, wish not to continue, or
   discomfort overrides this minimum even well before the target time. Do not
   probe after that boundary. A short answer, uncertainty, or ordinary sadness
   alone is not a refusal.
4. Before the final invitation, give the last meaningful answer a natural,
   content-specific response. For a rich or difficult answer, usually use two
   brief, connected sentences: recognize the concrete circumstances and the
   participant's stated experience. Do not rush from "That sounds hard" or a
   single paraphrase into the ending question. A reflection-only turn is allowed;
   wait for the participant, then invite additional sharing when appropriate.
   If you have already responded adequately, do not repeat the same reflection.
   Do not insert a summary of the memory as an ending step.
   Unless the participant has clearly said they are done, at the browser's ending stage, ask exactly once: "{AFFECTIVE_FINAL_CHECK}"
5. Wait for their answer. If they share more, listen, then use study_progress
   action finish with one short acknowledgment grounded in that additional
   content. Additional sharing may continue beyond the target time; do not infer
   completion merely from the clock or a brief pause. If they have nothing to add,
   finish with a brief acknowledgment such as "Okay" and the browser's exact
   closing, which thanks them for sharing. Do not summarize the memory or add a
   required retrospective empathetic response after a decline. If they share
   new content, respond to that specific content before closing; do not replace
   this response with generic thanks or a recap of the earlier conversation.
   A bare "yes" means they want to share: invite them to continue and wait.
   If they ask you to repeat, repeat the question and wait; do not finish.

# Affective interaction rules

- Sound like an attentive conversation partner, not an analyst. Warmth comes
  from accurately listening and responding, not deeper emotional examination.
  Use concrete details to show why you understood their expressed experience;
  additional words alone do not make a response empathetic.
- Once the context is clear, follow a personally salient detail instead of
  repeatedly asking what happened next. Do not ask them to repeat facts they
  already supplied. Use an open question, not a menu of suggested feelings.
- Do not require finer emotion labels, force-choice emotional categories, causal
  explanations of feelings, or an interpretation of what the memory means now.
- Ask about bodily sensations only if the participant introduced them or a brief
  clarification is genuinely necessary to understand what they already said.
  Do not use body-versus-mind or calm-versus-energized questions as a default.
- Do not name an abstract theme such as authenticity, identity, resilience, or
  growth unless the participant used it. Do not diagnose, moralize, evaluate
  character, or announce the cause or the "real" meaning of a feeling.
- Keep reflections short and plain. Avoid poetic reframing, emotional menus,
  exaggerated intimacy, generic reassurance, and repeated praise.
  Short does not mean an emotion-word echo: a relevant second sentence is
  appropriate when the participant has shared something significant.
- In Negative Memory, do not turn the story into writing a reply to someone,
  rehearsing boundaries, or choosing an action. "That is my concern" is not a
  request for a script. Reflect the stated uncertainty or experience instead.
- Do not give advice, solve a problem, rank priorities, suggest schedules or
  workouts, set completion criteria, or steer toward an action plan. Do not
  impose a silver lining or require a lesson or resolution.
- Do not ask the Cognitive completeness question. The final invitation here is
  permission to share more, not an evaluation of completeness or correctness.
- Never suggest "pause here", "pause there", or taking a break as a routine
  ending. Offer a break only in response to a participant's boundary or discomfort.
- Before the final invitation, briefly respond to the latest meaningful answer,
  including uncertainty such as "Honestly, I don't know." Do not skip the answer
  to your own question because the ending stage has arrived. Do not require
  resolution or add another exploratory question just to fill time.
- Grounded empathy before the invitation is welcome; a final interpretation of
  what the memory "really means" is not. After the invitation's answer, recognize
  their substantive experience without reopening exploratory questions.

""".strip()


POSITIVE_MEMORY_INSTRUCTIONS = """
# Positive Memory task

The participant prepared one specific positive memory from the past ten years.
Help them describe the event and their experience of it. Positive may mean joy,
pleasure, satisfaction, connection, relief, pride, calm, or another positive
experience; do not require intense happiness. Stay with this one memory.
If they describe a moving or especially welcome moment, recognize the detail
that made it feel that way in their account, not just the feeling label. If they
were glad they attended despite nearly missing it, respond to both parts without
inventing a life lesson or immediately asking them to categorize their mood.
""".strip()


NEGATIVE_MEMORY_INSTRUCTIONS = """
# Negative Memory task

The participant prepared one specific negative but manageable memory from the
past ten years. Help them describe the event and their experience without
intensifying it or searching for trauma. Do not require a lesson, silver lining,
or resolution.
Recognize the burden they actually described, including compounded difficulties
when relevant. For example, if feeling unable to start work was followed by
physical discomfort, respond to both rather than only saying "That was hard."
Starting a task later does not establish that they felt better or that the
deadline provided helpful structure. Do not turn an action into a recovery
story, praise their strength, or infer relief unless they expressed it.

If they begin with a future worry or a list of upcoming tasks, acknowledge it
briefly and gently redirect once to a specific moment when they felt that
pressure, even earlier today. Do not turn the list into planning or coaching.
If choosing a memory is difficult, offer time or the option to skip rather than
repeatedly demanding another memory.
If the participant becomes uncomfortable, describes severe trauma, or asks to
skip or stop, do not probe. Use the controlled stop path when appropriate.
""".strip()


ISLAND_ITEM_TEXT = "\n".join(
    "- " + item for item in DESERT_ISLAND_ITEM_OPTIONS
)
ISLAND_INSTRUCTIONS = f"""
# Deserted Island task

Scenario: The participant will be stranded on a deserted island in a warm
environment for three days until rescue. The rescue team knows their location
and will arrive after three days. Appropriate clothing and drinking water for
the three days are already provided; food and shelter are not provided. The participant must choose exactly
three items from the fixed list below.

# Allowed item list

Choose exactly three different entries from the list. Each entry counts as
one choice. Choosing Canned beans provides all five cans as one choice.
The listed quantities are fixed; do not assume additional supplies.

{ISLAND_ITEM_TEXT}

# Deserted Island conversation flow

1. Capture the participant's initial three choices. If a spoken item is unclear,
   does not confidently match one canonical list item, or could match multiple
   items, ask the participant to clarify it. Never silently guess or convert it
   to the nearest item. If they name fewer or more than three, or use an item
   outside the list, resolve that before proceeding.
2. After the three choices are clear, first ask about the participant's reasons,
   priorities, or point of uncertainty. Do not introduce an alternative or
   critique before hearing why they chose the items.
3. Explore how the items would help and what the participant is weighing. Sound
   collaborative: build on their reasoning rather than delivering a ranking.
4. After understanding their reasoning, surface one useful limitation, overlap,
   missed tradeoff, or alternative from the allowed list. Discuss one decision
   point at a time and let the participant decide whether to revise anything.
5. If the participant asks for a recommendation, offer one or at most two
   relevant options with short reasons, then ask which option, if any, they
   actually want to choose. A suggestion is never a selection.
6. At the browser ending stage, ask the exact Cognitive completeness check.
7. Resolve any requested reconsideration and call action check_answered.
   When the browser requests the final step, say, "To confirm, your final
   three items are [A], [B], and [C]. Is that right?" using exactly three
   canonical item names from the list.
8. Request action finish only after the participant clearly confirms those three. If they
   change an item, restate the updated set of exactly three and confirm again.

# Deserted Island constraints

- Do not invent an item or accept an item outside the fixed list.
- Do not claim an official ranking or a single correct combination.
- Do not recommend water or clothing; those are already provided. Canned beans
  remains an allowed choice because food and shelter are not provided.
- Do not treat "maybe," "I am considering," a question, or an item suggested by
  Buzz as a decision. Update the working set only after the participant clearly
  chooses, keeps, removes, or replaces an item.
- Keep the final decision with the participant.
- Tent provides shelter; an insulated sleeping mat provides ground insulation;
  a sleeping bag provides body insulation. Do not imply they are interchangeable.
- Portable stove with fuel is one choice; Metal cooking pot is a separate choice.
  Canned beans means five cans even though the scenario lasts three days.
- Bug spray is the canonical name for insect repellent. Confirm ambiguous item
  references, but recognize an unambiguous everyday synonym.
- Rescue already knows the location. Do not invent a requirement to find rescue
  or contact it, or promise that a selected item changes the rescue schedule.
- Do not invent weather changes, supplied food, or supplied shelter.
- Do not predict or guarantee survival. If asked, explain what the choices cover
  and their limitations under the scenario assumptions, without outcome assurance.
""".strip()

# Both tasks share one protocol and item list; only the setting differs.
NORTH_POLE_INSTRUCTIONS = ISLAND_INSTRUCTIONS.replace(
    "Deserted Island", "North Pole"
).replace(
    "on a deserted island in a warm\nenvironment",
    "at the North Pole in a cold environment with snow and ice",
)

ASSISTANT_MODES: Dict[str, Dict[str, object]] = {
    "cognitive": {
        "label": "Cognitive",
        "instructions": COGNITIVE_INSTRUCTIONS,
        "tasks": ("north_pole", "island"),
        "orders": (
            {
                "id": "north_pole_island",
                "label": "North Pole → Deserted Island",
                "tasks": ("north_pole", "island"),
            },
            {
                "id": "island_north_pole",
                "label": "Deserted Island → North Pole",
                "tasks": ("island", "north_pole"),
            },
        ),
    },
    "affective": {
        "label": "Affective",
        "instructions": AFFECTIVE_INSTRUCTIONS,
        "tasks": ("positive", "negative"),
        "orders": (
            {
                "id": "positive_negative",
                "label": "Positive → Negative",
                "tasks": ("positive", "negative"),
            },
            {
                "id": "negative_positive",
                "label": "Negative → Positive",
                "tasks": ("negative", "positive"),
            },
        ),
    },
}


TASKS: Dict[str, Dict[str, object]] = {
    "positive": {
        "label": "Positive Memory",
        "condition": "affective",
        "opening_first": (
            "Hello, I'm Buzz. What positive memory would you like to share?"
        ),
        "opening_later": "What positive memory would you like to share?",
        "instructions": POSITIVE_MEMORY_INSTRUCTIONS,
        "participant_instruction": {
            "title": "Share a Positive Memory",
            "blocks": (
                {
                    "type": "paragraph",
                    "segments": (
                        {"text": "Think of "},
                        {"text": "one specific event", "bold": True},
                        {"text": " from the past ten years that made you feel "},
                        {"text": "happy, pleased, or joyful", "bold": True},
                        {"text": "."},
                    ),
                },
                {
                    "type": "paragraph",
                    "segments": (
                        {"text": "Try to remember the experience as clearly as you can."},
                    ),
                },
                {"type": "label", "text": "Use these questions if helpful:"},
                {
                    "type": "list",
                    "items": (
                        "Where and when did it happen?",
                        "Who was involved?",
                        "What happened?",
                        "How did you feel about the experience?",
                    ),
                },
                {
                    "type": "timing",
                    "segments": (
                        {"text": "1 minute", "bold": True},
                        {"text": " to think"},
                    ),
                },
                {
                    "type": "timing",
                    "segments": (
                        {"text": "4–5 minutes", "bold": True},
                        {"text": " to talk with Buzz"},
                    ),
                },
            ),
        },
    },
    "negative": {
        "label": "Negative Memory",
        "condition": "affective",
        "opening_first": (
            "Hello, I'm Buzz. What negative memory would you like to share?"
        ),
        "opening_later": "What negative memory would you like to share?",
        "instructions": NEGATIVE_MEMORY_INSTRUCTIONS,
        "participant_instruction": {
            "title": "Share a Negative Memory",
            "blocks": (
                {
                    "type": "paragraph",
                    "segments": (
                        {"text": "Think of "},
                        {"text": "one specific event", "bold": True},
                        {"text": " from the past ten years that made you feel "},
                        {
                            "text": "unhappy, disappointed, or frustrated",
                            "bold": True,
                        },
                        {"text": "."},
                    ),
                },
                {
                    "type": "paragraph",
                    "segments": (
                        {
                            "text": (
                                "Choose an experience that you feel comfortable "
                                "sharing. Please do not choose a traumatic or highly "
                                "sensitive experience."
                            )
                        },
                    ),
                },
                {"type": "label", "text": "Use these questions if helpful:"},
                {
                    "type": "list",
                    "items": (
                        "Where and when did it happen?",
                        "Who was involved?",
                        "What happened?",
                        "How did you feel about the experience?",
                    ),
                },
                {
                    "type": "timing",
                    "segments": (
                        {"text": "1 minute", "bold": True},
                        {"text": " to think"},
                    ),
                },
                {
                    "type": "timing",
                    "segments": (
                        {"text": "4–5 minutes", "bold": True},
                        {"text": " to talk with Buzz"},
                    ),
                },
            ),
        },
    },
    "island": {
        "label": "Deserted Island",
        "condition": "cognitive",
        "opening_first": (
            "Hello, I'm Buzz. Which three items did you choose for the island?"
        ),
        "opening_later": "Which three items did you choose for the island?",
        "instructions": ISLAND_INSTRUCTIONS,
        "participant_instruction": {
            "title": "Choose Three Items for a Deserted Island",
            "blocks": (
                {
                    "type": "paragraph",
                    "segments": (
                        {"text": "Imagine that you are "},
                        {
                            "text": (
                                "stranded on a deserted island in a warm environment"
                            ),
                            "bold": True,
                        },
                        {
                            "text": (
                                ". The rescue team knows your location and will arrive "
                                "in three days. You already have appropriate clothing "
                                "and drinking water for the three days. "
                                "Food and shelter are not provided."
                            )
                        },
                    ),
                },
                {
                    "type": "paragraph",
                    "segments": (
                        {"text": "From the printed item list, choose "},
                        {"text": "exactly three items", "bold": True},
                        {"text": " that you think would be most useful."},
                    ),
                },
                {
                    "type": "paragraph",
                    "segments": (
                        {
                            "text": (
                                "Choose three different options. Each option counts as "
                                "one choice; canned beans includes all five cans."
                            )
                        },
                    ),
                },
                {
                    "type": "paragraph",
                    "segments": (
                        {
                            "text": (
                                "You may consider survival and safety, comfort, "
                                "or entertainment, and decide what matters most to you."
                            )
                        },
                    ),
                },
                {"type": "label", "text": "Use these questions if helpful:"},
                {
                    "type": "list",
                    "items": (
                        "What is most important to you in this situation?",
                        "How would each item help you?",
                        "What are the benefits and limitations of your choices?",
                        "Would any of your items serve similar purposes?",
                    ),
                },
                {
                    "type": "paragraph",
                    "preparation_only": True,
                    "segments": (
                        {
                            "text": (
                                "There is no official ranking or single correct "
                                "combination. Share your initial three choices with "
                                "Buzz, discuss the trade-offs, and make your final "
                                "selection."
                            )
                        },
                    ),
                },
                {
                    "type": "timing",
                    "segments": (
                        {"text": "1 minute", "bold": True},
                        {"text": " to think"},
                    ),
                },
                {
                    "type": "timing",
                    "segments": (
                        {"text": "4–5 minutes", "bold": True},
                        {"text": " to talk with Buzz"},
                    ),
                },
            ),
        },
    },
}


# Copy the approved card, preserving wording, emphasis, quantities and timing.
TASKS["north_pole"] = deepcopy(TASKS["island"])
TASKS["north_pole"].update(
    label="North Pole",
    opening_first="Hello, I'm Buzz. Which three items did you choose for the North Pole?",
    opening_later="Which three items did you choose for the North Pole?",
    instructions=NORTH_POLE_INSTRUCTIONS,
)
TASKS["north_pole"]["participant_instruction"]["title"] = "Choose Three Items for the North Pole"
for block in TASKS["north_pole"]["participant_instruction"]["blocks"]:
    for segment in block.get("segments", ()):
        segment["text"] = segment["text"].replace(
            "on a deserted island in a warm environment",
            "at the North Pole in a cold environment with snow and ice",
        )



def assistant_mode_is_valid(assistant_mode: str) -> bool:
    """Return whether a study condition identifier is supported."""
    return assistant_mode in ASSISTANT_MODES


def task_is_valid(task_id: str) -> bool:
    """Return whether a task identifier is supported."""
    return task_id in TASKS


def task_matches_mode(assistant_mode: str, task_id: str) -> bool:
    """Return whether a task belongs to the selected study condition."""
    return (
        assistant_mode_is_valid(assistant_mode)
        and task_is_valid(task_id)
        and TASKS[task_id]["condition"] == assistant_mode
    )


def task_position_is_valid(task_position: int) -> bool:
    return task_position in (1, 2)


def exact_closing_for_position(task_position: int, assistant_mode: str = "cognitive") -> str:
    if not task_position_is_valid(task_position):
        raise ValueError("Task position must be 1 or 2")
    if assistant_mode == "affective":
        return AFFECTIVE_CLOSING
    return TASK_ONE_CLOSING if task_position == 1 else TASK_TWO_CLOSING


def build_instructions(
    assistant_mode: str,
    task_id: str,
    task_position: int,
) -> str:
    """Compose shared, condition, task, and position-specific prompt modules."""
    if not assistant_mode_is_valid(assistant_mode):
        raise ValueError("Unsupported assistant mode")
    if not task_is_valid(task_id):
        raise ValueError("Unsupported task")
    if not task_matches_mode(assistant_mode, task_id):
        raise ValueError("Task does not belong to assistant mode")
    if not task_position_is_valid(task_position):
        raise ValueError("Task position must be 1 or 2")

    position_context = (
        "# Task position\n\nThis is the first of two tasks. Introduce no later "
        "task; the application handles the transition after saving."
        if task_position == 1
        else "# Task position\n\nThis is the second and final task. The participant "
        "already heard the transition and completed the browser-managed "
        "preparation step. Do not introduce yourself or repeat the transition."
    )
    return "\n\n".join(
        (
            COMMON_INSTRUCTIONS.format(
                exact_closing=exact_closing_for_position(task_position, assistant_mode)
            ),
            position_context,
            str(ASSISTANT_MODES[assistant_mode]["instructions"]),
            str(TASKS[task_id]["instructions"]),
        )
    )


def public_study_config() -> Dict[str, object]:
    """Return the safe configuration needed by the two-stage browser UI."""
    public_modes = {}
    for mode_id, profile in ASSISTANT_MODES.items():
        public_modes[mode_id] = {
            "label": profile["label"],
            "orders": deepcopy(profile["orders"]),
        }

    public_tasks = {}
    for task_id, profile in TASKS.items():
        public_tasks[task_id] = {
            "label": profile["label"],
            "condition": profile["condition"],
            "opening_first": profile["opening_first"],
            "opening_later": profile["opening_later"],
            "participant_instruction": deepcopy(
                profile["participant_instruction"]
            ),
        }

    return {
        "prompt_version": PROMPT_VERSION,
        "controller_version": CONTROLLER_VERSION,
        "assistant": {
            "name": SHARED_ASSISTANT_NAME,
            "voice": SHARED_VOICE,
            "speed": SHARED_SPEED,
        },
        "preparation_seconds": PREPARATION_SECONDS,
        "task_transition_pause_seconds": TASK_TRANSITION_PAUSE_SECONDS,
        "voice_delivery_instructions": SHARED_VOICE_DELIVERY_INSTRUCTIONS,
        "transition": SECOND_TASK_TRANSITION,
        "closings": {
            "task_one": TASK_ONE_CLOSING,
            "task_two": TASK_TWO_CLOSING,
        },
        "cognitive_completeness_check": COGNITIVE_COMPLETENESS_CHECK,
        "affective_final_check": AFFECTIVE_FINAL_CHECK,
        "affective_closing": AFFECTIVE_CLOSING,
        "affective_followups": {
            "minimum": AFFECTIVE_MINIMUM_FOLLOWUPS,
            "target": AFFECTIVE_TARGET_FOLLOWUPS,
        },
        "turn_detection": {
            "type": GLOBAL_REALTIME_SETTINGS["turn_detection_type"],
            "eagerness": GLOBAL_REALTIME_SETTINGS["turn_detection_eagerness"],
            "create_response": GLOBAL_REALTIME_SETTINGS[
                "turn_detection_create_response"
            ],
            "interrupt_response": GLOBAL_REALTIME_SETTINGS[
                "turn_detection_interrupt_response"
            ],
        },
        "realtime": {
            "reasoning_effort": GLOBAL_REALTIME_SETTINGS["reasoning_effort"],
            "noise_reduction": GLOBAL_REALTIME_SETTINGS["noise_reduction"],
            **deepcopy(TURN_CONTROLLER_SETTINGS),
        },
        "pacing": {
            "minimum_synthesis_elapsed_seconds": (
                MINIMUM_SYNTHESIS_ELAPSED_SECONDS
            ),
            "minimum_response_batches": MINIMUM_RESPONSE_BATCHES,
            "convergence_elapsed_seconds": CONVERGENCE_ELAPSED_SECONDS,
            "finalization_elapsed_seconds": FINALIZATION_ELAPSED_SECONDS,
            "maximum_elapsed_seconds": MAXIMUM_CONVERSATION_ELAPSED_SECONDS,
            "condition_overrides": {
                "affective": {
                    "minimum_synthesis_elapsed_seconds": (
                        AFFECTIVE_MINIMUM_SYNTHESIS_ELAPSED_SECONDS
                    ),
                    "minimum_response_batches": (
                        AFFECTIVE_MINIMUM_RESPONSE_BATCHES
                    ),
                    "convergence_elapsed_seconds": (
                        AFFECTIVE_CONVERGENCE_ELAPSED_SECONDS
                    ),
                    "finalization_elapsed_seconds": (
                        AFFECTIVE_FINALIZATION_ELAPSED_SECONDS
                    ),
                    "maximum_elapsed_seconds": (
                        MAXIMUM_CONVERSATION_ELAPSED_SECONDS
                    ),
                }
            },
        },
        "modes": public_modes,
        "tasks": public_tasks,
    }
