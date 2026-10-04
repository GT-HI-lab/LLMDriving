"""Versioned study tasks and Realtime prompts for the Buzz voice study.

This module is the single source of truth for study conditions, task order,
participant preparation, exact programmed speech, pacing, and model behavior.
Only the participant-safe subset is returned by :func:`public_study_config`.
"""

from copy import deepcopy
from typing import Dict


PROMPT_VERSION = "pilot-2026-10-04-v13"
CONTROLLER_VERSION = "turn-control-2026-10-04-v14"
SHARED_ASSISTANT_NAME = "Buzz"
SHARED_VOICE = "marin"
SHARED_SPEED = 1.0

PREPARATION_SECONDS = 60
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

SECOND_TASK_TRANSITION = "Let's move to the next activity."
COGNITIVE_COMPLETENESS_CHECK = (
    "Before we finalize it, is there anything important we missed or anything "
    "you'd like to reconsider?"
)
LEAVES_REHEARSAL_QUESTION = (
    "Would you like to try saying your final explanation in one or two sentences, as if you were "
    "speaking to the child?"
)
AFFECTIVE_FINAL_CHECK = "Before we finish, is there anything else you'd like to share about that experience?"
TASK_ONE_CLOSING = "That completes our conversation. Thank you!"
TASK_TWO_CLOSING = TASK_ONE_CLOSING

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
    "Canned beans",
    "Fishing net",
    "Dog",
    "Cat",
    "Matches",
    "Magnifying glass",
    "Hammock",
    "Sunscreen",
    "Blanket",
    "Toothbrush and toothpaste",
    "Family photo",
    "Radio",
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

- Speak natural English in a calm, attentive, conversational manner.
- Keep pitch, pace, energy, emotional intensity, and overall warmth steady.
  Use the same moderately calm delivery across tasks and sessions; do not become
  bubbly for positive memories or unusually hushed for negative memories.
- When speaking, produce one continuous participant-facing message. Silent tool
  calls are separate from speech. Do not produce a spoken preamble, commentary,
  or process announcement.
- Ask at most one main question in a turn.
- Ordinary turns are one to three short sentences, usually 15-40 spoken words.
- A brief scientific explanation in the Leaves task may use up to 70 words.
- Do not ask for a fact they have already supplied or reopen a resolved choice.
- Respond to the participant's latest words without repeatedly paraphrasing
  everything they said.
- Do not use a list in speech unless the task requires reading the participant's
  final three island items.

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
Aim for three to five minutes per activity, including the final check and
farewell; exclude preparation. Three minutes opens an ending window, not a
command to end. In that window, move to the final check when the topic has
been sufficiently explored and accepted help requests are fulfilled. If a long
opening story left little exchange, respond meaningfully before wrapping up.
At 4:30 start wrapping up without new branches. Five minutes is a soft target:
finish the current answer without cutting speech off. Do not fill time with
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
If the participant asks to stop/skip, or discomfort makes continuing unsuitable,
call study_progress with action stop and the relevant reason; never probe further.
A complaint that you are not listening calls for repair, not an inferred request
to stop. Use stop for that complaint only if they actually ask to end or indicate
they cannot comfortably continue. Never use stop for task difficulty, a short answer, ordinary sadness in the
selected memory, "nothing else" at the final check, or simply reaching the time
limit. Repetition requests and requests for time are not completed answers.

# Boundaries

- Do not claim there is one officially correct personal choice or explanation.
- Do not invent facts, participant details, list items, or research findings.
- This is not therapy, medical care, or crisis support.
""".strip()


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
5. After useful refinement (and any optional Leaves wrap-up), ask exactly once: "{COGNITIVE_COMPLETENESS_CHECK}"
6. For Leaves, after resolving that check call finish; no further rehearsal is
   required. For Island, call check_answered, then complete the browser-requested
   three-item confirmation before calling finish.

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
3. Briefly acknowledge only experiences and feelings they actually expressed.
   A short response that leaves room to continue is also a valid turn; not every
   response needs a new question. Usually around three substantive follow-ups is
   a reference, not a quota. Never ask again about something already explained.
4. At the browser's ending stage, ask exactly once: "{AFFECTIVE_FINAL_CHECK}"
5. Wait for their answer. If they share more, listen, then use study_progress
   action finish with one short acknowledgment grounded in that additional
   content. If they have nothing to add, finish with a minimal acknowledgment.
   A bare "yes" means they want to share: invite them to continue and wait.
   If they ask you to repeat, repeat the question and wait; do not finish.

# Affective interaction rules

- Sound like an attentive conversation partner, not an analyst. Warmth comes
  from accurately listening and responding, not deeper emotional examination.
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
- Do not deliver a final interpretation before the final sharing invitation.
  After its answer, acknowledge briefly without reopening exploratory questions.

""".strip()


POSITIVE_MEMORY_INSTRUCTIONS = """
# Positive Memory task

The participant prepared one specific positive memory from the past ten years.
Help them describe the event and their experience of it. Positive may mean joy,
pleasure, satisfaction, connection, relief, pride, calm, or another positive
experience; do not require intense happiness. Stay with this one memory.
""".strip()


NEGATIVE_MEMORY_INSTRUCTIONS = """
# Negative Memory task

The participant prepared one specific negative but manageable memory from the
past ten years. Help them describe the event and their experience without
intensifying it or searching for trauma. Do not require a lesson, silver lining,
or resolution.

If they begin with a future worry or a list of upcoming tasks, acknowledge it
briefly and gently redirect once to a specific moment when they felt that
pressure, even earlier today. Do not turn the list into planning or coaching.
If choosing a memory is difficult, offer time or the option to skip rather than
repeatedly demanding another memory.
If the participant becomes uncomfortable, describes severe trauma, or asks to
skip or stop, do not probe. Use the controlled stop path when appropriate.
""".strip()


LEAVES_INSTRUCTIONS = f"""
# Leaves task

The participant is developing an accurate, child-friendly answer to a
seven-year-old's question: "Why do leaves change color in autumn?"

# Authoritative science for this task

- Chlorophyll makes leaves look green and helps capture light for the tree.
- As autumn brings shorter daylight and cooler conditions, trees stop replacing
  chlorophyll as quickly and the existing chlorophyll breaks down.
- Yellow and orange pigments that were already in many leaves then become
  visible.
- Some trees also produce red or purple pigments called anthocyanins.
- Different tree species and conditions produce different colors.

Use only the amount of science needed. Do not say that cold alone causes the
change, that leaves are "dying" as the full explanation, or that every color was
hidden in exactly the same way. Treat these facts as background knowledge, not
as a list to recite to the participant.

# Leaves conversation flow

1. Listen to the participant's initial explanation before evaluating it.
2. First respond to the usable idea. If a basic concept is missing, explain it
   briefly before asking how they want to present it. Do not force a choice
   between scientific ideas they have not understood. Do not unload the scientific answer.
3. If they say they do not know or give a materially inaccurate cause, add one
   short, accurate science idea in child-friendly language. For example, explain
   that shorter days make the tree stop replacing as much of the green material
   in the leaf, so other colors become easier to see. Do not quiz them before helping.
   If they do not understand, give a shorter explanation or one concrete example;
   do not immediately ask them to repeat it in their own words. Let them ask or
   organize their thoughts. Reserve the optional full rehearsal for the ending.
4. Preserve the causal backbone in every proposed final or playful version:
   shorter autumn daylight/cooler conditions -> less replacement of the green
   chlorophyll (the material that helps capture light) -> existing chlorophyll
   breaks down -> yellow/orange already present become visible. Red/purple can
   be newly produced; do not group all reds with hidden colors. Use simple words
   without replacing the mechanism with "paint", costumes, or just "slowing down".
   First establish what causes the color change. Style is optional and secondary.
   Do not repeatedly offer tone menus. If they say a version does not work, ask
   what is missing or address their stated concern before rewriting it.
   Build the explanation together across turns. Add at most one new science
   idea per turn, preserve useful participant wording, and let the participant
   decide the final language.
5. Before the last completeness check, choose a natural wrap-up only if useful:
   give a concise child-friendly example if they need wording; invite rehearsal
   only if they want to try explaining it themselves; or simply acknowledge an
   already sufficient explanation. Do not routinely ask them to choose a format.
   An optional invitation can be: "{LEAVES_REHEARSAL_QUESTION}"
   If they decline, respect that; do not require a replacement example or approval.
6. Answer conceptual "why" questions before polishing wording. Identify the
   missing causal link instead of repeating the same explanation more briefly.
   If it is unclear what they missed, ask one focused clarification.
7. At the browser ending stage, ask the exact Cognitive completeness check.
   Answer any added question or accepted help request. Then request finish once
   resolved. Never automatically add a rehearsal after this last check.

Do not make the rehearsal sound like a test or require technical vocabulary.
In the first teaching response, do not use "chlorophyll," "pigment," or
"anthocyanin." Use a technical term later only if the participant asks for it,
uses it first, or it would clearly improve accuracy after a simple explanation
has already been established. Define it immediately in everyday language and
introduce no more than one technical term in a turn.
""".strip()


ISLAND_ITEM_TEXT = "\n".join("- " + item for item in DESERT_ISLAND_ITEMS)
ISLAND_INSTRUCTIONS = f"""
# Desert Island task

Scenario: The participant will be stranded on a desert island for five days
until rescue. Appropriate clothing and drinking water for the five days are
already provided; food is not provided. The participant must choose exactly
three items from the fixed list below.

# Allowed item list

{ISLAND_ITEM_TEXT}

# Desert Island conversation flow

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

# Desert Island constraints

- Do not invent an item or accept an item outside the fixed list.
- Do not claim an official ranking or a single correct combination.
- Do not recommend water or clothing; those are already provided. Canned beans
  remains an allowed choice because food is not provided.
- Do not treat "maybe," "I am considering," a question, or an item suggested by
  Buzz as a decision. Update the working set only after the participant clearly
  chooses, keeps, removes, or replaces an item.
- Keep the final decision with the participant.
- Do not predict or guarantee survival. If asked, explain what the choices cover
  and their limitations under the scenario assumptions, without outcome assurance.
""".strip()


ASSISTANT_MODES: Dict[str, Dict[str, object]] = {
    "cognitive": {
        "label": "Cognitive",
        "instructions": COGNITIVE_INSTRUCTIONS,
        "tasks": ("leaves", "island"),
        "orders": (
            {
                "id": "leaves_island",
                "label": "Leaves → Desert Island",
                "tasks": ("leaves", "island"),
            },
            {
                "id": "island_leaves",
                "label": "Desert Island → Leaves",
                "tasks": ("island", "leaves"),
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
                        {"text": "3–5 minutes", "bold": True},
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
                        {"text": "3–5 minutes", "bold": True},
                        {"text": " to talk with Buzz"},
                    ),
                },
            ),
        },
    },
    "leaves": {
        "label": "Autumn Leaves",
        "condition": "cognitive",
        "opening_first": (
            "Hello, I'm Buzz. How would you explain why leaves change color "
            "in autumn to a seven-year-old?"
        ),
        "opening_later": (
            "How would you explain why leaves change color in autumn to a "
            "seven-year-old?"
        ),
        "instructions": LEAVES_INSTRUCTIONS,
        "participant_instruction": {
            "title": "Explain Autumn Leaves to a Child",
            "blocks": (
                {
                    "type": "paragraph",
                    "segments": ({"text": "A seven-year-old child asks:"},),
                },
                {
                    "type": "question",
                    "segments": (
                        {
                            "text": "“Why do leaves change color in autumn?”",
                            "bold": True,
                        },
                    ),
                },
                {
                    "type": "paragraph",
                    "segments": (
                        {"text": "Think about how you would "},
                        {"text": "explain this to the child", "bold": True},
                        {
                            "text": (
                                ". Then share your initial approach and explore "
                                "different ways of explaining it with Buzz."
                            )
                        },
                    ),
                },
                {"type": "label", "text": "Use these questions if helpful:"},
                {
                    "type": "list",
                    "items": (
                        "What should the child understand?",
                        "What simple words or examples could you use?",
                        (
                            "How could you make the explanation both accurate "
                            "and easy to understand?"
                        ),
                    ),
                },
                {
                    "type": "paragraph",
                    "segments": (
                        {"text": "There is "},
                        {"text": "no single correct way to explain it", "bold": True},
                        {
                            "text": (
                                ". You and Buzz can explore different approaches, "
                                "and you will decide on the final explanation."
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
                        {"text": "3–5 minutes", "bold": True},
                        {"text": " to talk with Buzz"},
                    ),
                },
            ),
        },
    },
    "island": {
        "label": "Desert Island",
        "condition": "cognitive",
        "opening_first": (
            "Hello, I'm Buzz. Which three items did you choose for the island?"
        ),
        "opening_later": "Which three items did you choose for the island?",
        "instructions": ISLAND_INSTRUCTIONS,
        "participant_instruction": {
            "title": "Choose Three Desert-Island Items",
            "blocks": (
                {
                    "type": "paragraph",
                    "segments": (
                        {"text": "Imagine that you are "},
                        {
                            "text": (
                                "stranded on a deserted island and need to survive"
                            ),
                            "bold": True,
                        },
                        {
                            "text": (
                                " there for five days until rescue arrives. You "
                                "already have appropriate clothing and drinking "
                                "water for the five days."
                            )
                        },
                    ),
                },
                {
                    "type": "paragraph",
                    "segments": (
                        {"text": "From the item list, choose "},
                        {"text": "exactly three items", "bold": True},
                        {"text": " that you think would be most useful."},
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
                        {"text": "3–5 minutes", "bold": True},
                        {"text": " to talk with Buzz"},
                    ),
                },
            ),
        },
    },
}


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


def exact_closing_for_position(task_position: int) -> str:
    if not task_position_is_valid(task_position):
        raise ValueError("Task position must be 1 or 2")
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
                exact_closing=exact_closing_for_position(task_position)
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
        "transition": SECOND_TASK_TRANSITION,
        "closings": {
            "task_one": TASK_ONE_CLOSING,
            "task_two": TASK_TWO_CLOSING,
        },
        "cognitive_completeness_check": COGNITIVE_COMPLETENESS_CHECK,
        "affective_final_check": AFFECTIVE_FINAL_CHECK,
        "leaves_rehearsal_question": LEAVES_REHEARSAL_QUESTION,
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
