"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class FakeElement {
  constructor() {
    this.children = [];
    this.className = "";
    this.dataset = {};
    this.hidden = false;
    this.disabled = false;
    this.textContent = "";
    this.value = "";
    this.checked = false;
    this.isConnected = false;
    this._classes = new Set();
    this.classList = {
      add: (...names) => {
        for (const name of names) this._classes.add(name);
      },
      remove: (...names) => {
        for (const name of names) this._classes.delete(name);
      },
      contains: (name) => this._classes.has(name),
    };
  }

  addEventListener() {}
  setCustomValidity() {}
  reportValidity() {}
  focus() {}
  scrollTo() {}

  append(...elements) {
    for (const element of elements) {
      element.isConnected = true;
      this.children.push(element);
    }
  }

  prepend(element) {
    element.isConnected = true;
    this.children.unshift(element);
  }

  after() {}
  remove() {
    this.isConnected = false;
  }

  replaceChildren(...elements) {
    this.children = [];
    this.append(...elements);
  }

  querySelectorAll() {
    return this.children;
  }

  get nextElementSibling() {
    return null;
  }
}

const elements = new Map();
const document = {
  querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, new FakeElement());
    return elements.get(selector);
  },
  querySelectorAll() {
    return [];
  },
  createElement() {
    return new FakeElement();
  },
};

const context = {
  assert,
  console,
  document,
  fetch: () => new Promise(() => {}),
  MediaStream: class {},
  navigator: {},
  process,
  setTimeout,
  clearTimeout,
};
context.window = {
  addEventListener() {},
  clearTimeout,
  setTimeout,
  scrollTo() {},
};
vm.createContext(context);

const appPath = path.join(__dirname, "..", "web", "app.js");
const appSource = fs.readFileSync(appPath, "utf8");
const harness = String.raw`
(async () => {
  studyConfig = {
    assistant: { name: "Buzz", voice: "marin", speed: 1.0 },
    prompt_version: "pilot-2026-10-11-v17",
    controller_version: "turn-control-2026-10-11-v18",
    preparation_seconds: 60,
    task_transition_pause_seconds: 3,
    voice_delivery_instructions: "Speak natural English in a calm, attentive, conversational manner. Speak at a slightly slower, unhurried pace. Keep pitch, pace, energy, and warmth steady across tasks.",
    transition: "Let's move to the next activity.",
    closings: {
      task_one: "That completes our conversation. Thank you!",
      task_two: "That completes our conversation. Thank you!",
    },
    affective_final_check: "Before we finish, is there anything else you'd like to share about that experience?",
    affective_closing: "That completes our conversation. Thank you for sharing with me.",
    affective_followups: { minimum: 2, target: 3 },
    cognitive_completeness_check: "Before we finalize it, is there anything important we missed or anything you'd like to reconsider?",
    leaves_rehearsal_question: "Would you like to try saying your final explanation in one or two sentences, as if you were speaking to the child?",
    leaves_wrapup_choice_question: "Would you like me to give an example based on what we've discussed, or would you like to try explaining it as if I were the child?",
    pacing: {
      minimum_synthesis_elapsed_seconds: 180,
      minimum_response_batches: 0,
      convergence_elapsed_seconds: 180,
      finalization_elapsed_seconds: 270,
      maximum_elapsed_seconds: 300,
      condition_overrides: {
        affective: {
          minimum_synthesis_elapsed_seconds: 180,
          minimum_response_batches: 0,
          convergence_elapsed_seconds: 180,
          finalization_elapsed_seconds: 270,
          maximum_elapsed_seconds: 300,
        },
      },
    },
    realtime: {
      reasoning_effort: "low",
      noise_reduction: "far_field",
      response_trigger: "after_clear_coalesced_input_transcription",
      pending_transcription_barrier: true,
      microphone_policy: "muted_during_assistant_audio_playback_and_preparation",
      continuation_grace_ms: 0,
      incomplete_transcript_grace_ms: 300,
      cancel_pre_playback_response_on_continuation: true,
    },
    turn_detection: {
      type: "semantic_vad",
      eagerness: "medium",
      create_response: false,
      interrupt_response: false,
    },
    modes: {
      cognitive: { label: "Cognitive", orders: [] },
      affective: { label: "Affective", orders: [] },
    },
    tasks: {},
  };
  activeParticipantId = "PTEST";
  activeAssistantMode = "cognitive";
  activeModeProfile = { label: "Cognitive" };
  activeOrderId = "leaves_island";
  activeTaskSequence = ["leaves", "island"];
  activeTaskIndex = 0;
  activeTaskId = "leaves";
  activeTaskProfile = {
    label: "Autumn Leaves",
    opening_first:
      "Hello, I'm Buzz. How would you explain why leaves change color in autumn to a seven-year-old?",
    opening_later:
      "How would you explain why leaves change color in autumn to a seven-year-old?",
    participant_instruction: {
      title: "Leaves",
      blocks: [
        {
          type: "paragraph",
          segments: [
            { text: "Think " },
            { text: "first", bold: true },
            { text: "." },
          ],
        },
        { type: "list", items: ["Use simple words."] },
      ],
    },
  };
  sessionStartedAt = new Date().toISOString();

  renderInstructionBody(
    participantInstructionBody,
    activeTaskProfile.participant_instruction,
  );
  assert.equal(participantInstructionBody.children.length, 2);
  assert.equal(participantInstructionBody.children[0].children.length, 3);
  assert.equal(
    participantInstructionBody.children[0].children[1].textContent,
    "first",
  );
  assert.equal(
    participantInstructionBody.children[1].children[0].textContent,
    "Use simple words.",
  );

  const sentEvents = [];
  dataChannel = {
    readyState: "open",
    send(payload) {
      sentEvents.push(JSON.parse(payload));
    },
  };

  const microphoneTrack = { enabled: true };
  microphoneStream = {
    getAudioTracks() {
      return [microphoneTrack];
    },
  };
  voiceOrb.classList.add("idle");
  preparationOrb.classList.add("idle");

  handleRealtimeEvent({
    type: "input_audio_buffer.speech_started",
    item_id: "item-1",
    audio_start_ms: 100,
  });
  handleRealtimeEvent({
    type: "input_audio_buffer.speech_stopped",
    item_id: "item-1",
    audio_end_ms: 1000,
  });
  handleRealtimeEvent({
    type: "input_audio_buffer.committed",
    item_id: "item-1",
    previous_item_id: null,
  });
  handleRealtimeEvent({
    type: "input_audio_buffer.speech_started",
    item_id: "item-2",
    audio_start_ms: 1090,
  });
  handleRealtimeEvent({
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "item-1",
    transcript: "I think the green color goes away.",
  });
  handleRealtimeEvent({
    type: "input_audio_buffer.speech_stopped",
    item_id: "item-2",
    audio_end_ms: 2200,
  });
  handleRealtimeEvent({
    type: "input_audio_buffer.committed",
    item_id: "item-2",
    previous_item_id: "item-1",
  });

  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(
    sentEvents.filter((event) => event.type === "response.create").length,
    0,
    "a response must not start while a later transcription is pending",
  );

  handleRealtimeEvent({
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "item-2",
    transcript: "Then yellow underneath becomes visible.",
  });
  const responseCreates = sentEvents.filter(
    (event) => event.type === "response.create",
  );
  assert.equal(responseCreates.length, 1);
  assert.equal(responseCreates[0].response.metadata.coalesced_item_count, "2");
  assert.equal(pendingTranscriptionItemIds.size, 0);

  handleRealtimeEvent({
    type: "response.created",
    response: {
      id: "response-1",
      metadata: { response_kind: "conversation" },
    },
  });
  const sentBeforeContinuation = sentEvents.length;
  handleRealtimeEvent({
    type: "input_audio_buffer.speech_started",
    item_id: "item-3",
    audio_start_ms: 2300,
  });
  assert.equal(
    sentEvents.slice(sentBeforeContinuation).some(
      (event) =>
        event.type === "response.cancel" &&
        event.response_id === "response-1",
    ),
    true,
  );
  handleRealtimeEvent({
    type: "input_audio_buffer.speech_stopped",
    item_id: "item-3",
    audio_end_ms: 3000,
  });
  handleRealtimeEvent({
    type: "input_audio_buffer.committed",
    item_id: "item-3",
    previous_item_id: "item-2",
  });
  handleRealtimeEvent({
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "item-3",
    transcript: "I am not sure why that happens.",
  });
  handleRealtimeEvent({
    type: "response.done",
    response: {
      id: "response-1",
      status: "cancelled",
      metadata: { response_kind: "conversation" },
      output: [],
    },
  });
  assert.equal(
    sentEvents
      .filter((event) => event.type === "response.create")
      .at(-1).response.metadata.coalesced_item_count,
    "3",
  );

  handleRealtimeEvent({
    type: "response.created",
    response: {
      id: "response-2",
      metadata: { response_kind: "conversation" },
    },
  });
  handleRealtimeEvent({
    type: "output_audio_buffer.started",
    response_id: "response-2",
  });
  assert.equal(microphoneTrack.enabled, false);
  assert.equal(voiceOrb.classList.contains("idle"), false);
  handleRealtimeEvent({
    type: "output_audio_buffer.stopped",
    response_id: "response-2",
  });
  assert.equal(microphoneTrack.enabled, true);
  assert.equal(voiceOrb.classList.contains("idle"), true);
  handleRealtimeEvent({
    type: "response.done",
    response: {
      id: "response-2",
      status: "completed",
      metadata: { response_kind: "conversation" },
      output: [],
    },
  });

  responseInProgress = false;
  activeResponseKind = null;
  activeParticipantResponseRequests = [];
  queuedParticipantResponses = [];
  assert.equal(isClearlyIncompleteTranscript("It depends on..."), true);
  assert.equal(isClearlyIncompleteTranscript("It depends on the tree."), false);

  openingRequested = false;
  openingInProgress = false;
  openingPlaybackPending = false;
  responseInProgress = false;
  requestTaskOpening();
  const firstOpening = sentEvents
    .filter((event) => event.type === "response.create")
    .at(-1);
  assert.equal(firstOpening.response.input.length, 0);
  assert.equal(firstOpening.response.instructions.endsWith(
    'Say exactly this and nothing else: "Hello, I\'m Buzz. How would you explain why leaves change color in autumn to a seven-year-old?"',
  ), true);

  openingRequested = false;
  openingInProgress = false;
  openingPlaybackPending = false;
  responseInProgress = false;
  activeTaskIndex = 1;
  activeTaskId = "island";
  activeTaskProfile = {
    label: "Desert Island",
    opening_first: "Hello, I'm Buzz. Which three items did you choose for the island?",
    opening_later: "Which three items did you choose for the island?",
    participant_instruction: {
      title: "Island",
      blocks: [{ type: "paragraph", segments: [{ text: "Pick three." }] }],
    },
  };
  requestTaskOpening();
  const secondOpening = sentEvents
    .filter((event) => event.type === "response.create")
    .at(-1);
  assert.equal(secondOpening.response.instructions.endsWith(
    'Say exactly this and nothing else: "Which three items did you choose for the island?"',
  ), true);
  assert.equal(secondOpening.response.instructions.includes("Hello"), false);

  openingRequested = false;
  openingInProgress = false;
  openingPlaybackPending = false;
  responseInProgress = false;
  requestTransitionMessage();
  const transitionCreate = sentEvents
    .filter((event) => event.type === "response.create")
    .at(-1);
  assert.equal(transitionCreate.response.instructions.endsWith(
    'Say exactly this and nothing else: "Let\'s move to the next activity."',
  ), true);
  for (const request of [firstOpening, secondOpening, transitionCreate]) {
    assert.equal(request.response.instructions.startsWith(studyConfig.voice_delivery_instructions + "\n\n"), true);
  }
  handleRealtimeEvent({
    type: "output_audio_buffer.started",
    response_id: "transition-response",
  });
  assert.equal(preparationOrb.classList.contains("idle"), false);
  handleRealtimeEvent({
    type: "output_audio_buffer.stopped",
    response_id: "transition-response",
  });
  assert.equal(startButton.disabled, true);
  assert.equal(startButton.textContent, "Take a moment to think");
  assert.equal(preparationOrb.classList.contains("idle"), true);
  clearPreparationTimer();

  activeResearcherTestMode = true;
  beginPreparationWindow("researcher_test");
  assert.equal(startButton.disabled, false);
  assert.equal(startButton.textContent, "Start conversation with Buzz");
  assert.equal(activePreparationSkipped, true);
  assert.equal(preparationTimerId, null);
  assert.equal(
    preparationStatusElement.textContent,
    "Researcher test mode: start when you are ready.",
  );
  activeResearcherTestMode = false;

  const originalStopSession = stopSession;
  let automaticStopOptions = null;
  stopSession = async (options) => { automaticStopOptions = options; isStopping = true; };
  let sequence = 0;
  function freshTask(mode = "affective", task = "positive", elapsed = 275, followups = 2) {
    resetEndingController();
    clearPreparationTimer();
    clearConversationDisplay();
    topicStartedAtMilliseconds = elapsed === null ? null : Date.now() - elapsed * 1000;
    activeAssistantMode = mode;
    // Ending-only fixtures stand for a memory with prior exploration. Counting
    // cases explicitly start at zero and exercise actual playback below.
    affectiveFollowupCount = mode === "affective" ? followups : 0;
    activeTaskId = task;
    activeTaskIndex = 0;
    activeTaskProfile = { label: task, opening_first: "Hello, I'm Buzz. Tell me about it." };
    openingRequested = false;
    openingInProgress = false;
    openingPlaybackPending = false;
    transitionPlaybackPending = false;
    isPreparationSession = false;
    isStopping = false;
    responseInProgress = false;
    speechInProgress = false;
    assistantAudioPlaying = false;
    activeResponseId = null;
    activeResponseKind = null;
    continuationResponseCancelPending = false;
    continuationCancelResponseId = null;
    participantResponseBatchCount = 0;
    pacingHoldSent = pacingReleaseSent = pacingConvergenceSent = pacingFinalizationSent = pacingMaximumSent = false;
    finalClosingDelivered = finalClosingPlaybackPending = false;
    automaticStopOptions = null;
    sentEvents.length = 0;
  }
  function user(text) {
    const id = "u-" + (++sequence);
    handleRealtimeEvent({ type: "input_audio_buffer.speech_started", item_id: id });
    handleRealtimeEvent({ type: "input_audio_buffer.speech_stopped", item_id: id });
    handleRealtimeEvent({ type: "conversation.item.input_audio_transcription.completed", item_id: id, transcript: text });
    return id;
  }
  function beginResponse() {
    const id = "r-" + (++sequence);
    handleRealtimeEvent({ type: "response.created", response: { id, metadata: { response_kind: "conversation" } } });
    return id;
  }
  function play(text, id = beginResponse(), transcriptAfterPlayback = false, includeAcknowledgment = true) {
    if (includeAcknowledgment && text === currentExactClosing() && closingAuthorized &&
        closingAcknowledgment && !closingAcknowledgmentDelivered) {
      text = closingAcknowledgment + " " + text;
    }
    const transcript = { type: "response.output_audio_transcript.done", response_id: id,
      item_id: "a-" + id, transcript: text };
    if (!transcriptAfterPlayback) handleRealtimeEvent(transcript);
    handleRealtimeEvent({ type: "output_audio_buffer.started", response_id: id });
    handleRealtimeEvent({ type: "output_audio_buffer.stopped", response_id: id });
    if (transcriptAfterPlayback) handleRealtimeEvent(transcript);
    handleRealtimeEvent({ type: "response.done", response: { id, status: "completed", output: [] } });
    return id;
  }
  function tool(action, acknowledgment = "Okay.", reason = "completed") {
    const id = beginResponse();
    handleRealtimeEvent({ type: "response.done", response: { id, status: "completed", output: [{
      type: "function_call", name: "study_progress", call_id: "call-" + id,
      arguments: JSON.stringify({ action, reason, evidence: "Latest participant reply", acknowledgment }),
    }] } });
    return id;
  }
  function askCheck() {
    sendPacingControlIfNeeded();
    requestControlledResponse("ending_check");
    play(activeAssistantMode === "affective" ? studyConfig.affective_final_check : studyConfig.cognitive_completeness_check);
    assert.equal(endingStage, "waiting_check");
    assert.equal(microphoneTrack.enabled, true);
  }

  // Even past the target, two delivered follow-ups precede the ordinary final
  // invitation. The opening, final check, repeats and repairs are not a quota.
  freshTask("affective", "positive", 360, 0);
  sendPacingControlIfNeeded();
  assert.equal(endingStage, "exploring");
  assert.equal(endingControlText().includes("at least two substantive follow-ups"), true);
  assert.equal(automaticStopOptions, null);
  user("My sister came to my graduation.");
  play("What stood out about having your sister there?");
  assert.equal(affectiveFollowupCount, 1);
  sendPacingControlIfNeeded();
  assert.equal(endingStage, "exploring");
  user("We celebrated afterwards.");
  play("Which part of the celebration do you remember most?");
  assert.equal(affectiveFollowupCount, 2);
  sendPacingControlIfNeeded();
  assert.equal(endingStage, "exploring", "the last follow-up still needs an answer");
  user("We shared a meal together.");
  sendPacingControlIfNeeded();
  assert.equal(endingStage, "need_check");
  askCheck();
  assert.equal(affectiveFollowupCount, 2);

  // Cancelled/unplayed questions and listening repairs never count.
  freshTask("affective", "positive", 60, 0);
  user("My sister came to my graduation.");
  const cancelledFollowup = beginResponse();
  handleRealtimeEvent({ type: "response.output_audio_transcript.done", response_id: cancelledFollowup,
    item_id: "cancelled-followup", transcript: "What stood out about that day?" });
  assert.equal(affectiveFollowupCount, 0);
  handleRealtimeEvent({ type: "output_audio_buffer.cleared", response_id: cancelledFollowup });
  handleRealtimeEvent({ type: "output_audio_buffer.stopped", response_id: cancelledFollowup });
  handleRealtimeEvent({ type: "response.done", response: { id: cancelledFollowup, status: "completed", output: [] } });
  assert.equal(affectiveFollowupCount, 0);
  user("Could you repeat that?");
  play("What stood out about that day?");
  assert.equal(affectiveFollowupCount, 0);

  // Explicit boundaries override both elapsed time and missing follow-ups.
  freshTask("affective", "negative", 20, 0);
  user("I don't want to talk about this. Please stop.");
  tool("stop", "Of course. You do not need to continue.", "participant_stop");
  assert.equal(closingAuthorized, true);
  play(currentExactClosing());
  assert.equal(automaticStopOptions.advanceToNextTask, false);

  // Empty/oversized acknowledgments are regenerated from the same reply,
  // without requiring another participant turn or closing with no response.
  for (const invalidAck of ["", "word ".repeat(41), "Would you like to say more?"]) {
    freshTask(); askCheck();
    user("My friend stayed with me and I felt less alone.");
    tool("finish", invalidAck);
    assert.equal(closingAuthorized, false);
    assert.equal(automaticStopOptions, null);
    const retry = sentEvents.filter(e => e.type === "response.create").at(-1);
    assert.equal(retry.response.metadata.controller_kind, "closing_acknowledgment");
    assert.equal(retry.response.tools[0].name, "study_progress");
    const batch = participantResponseBatchCount;
    tool("finish", "Your friend's support helped you feel less alone.");
    assert.equal(participantResponseBatchCount, batch);
    assert.equal(closingAuthorized, true);
    play(currentExactClosing());
    assert.notEqual(automaticStopOptions, null);
  }

  // Gratitude words must not silently remove a content-grounded response.
  freshTask(); askCheck(); user("I felt thankful my friend stayed with me.");
  tool("finish", "You felt thankful that your friend stayed with you.");
  assert.equal(closingAuthorized, true);
  assert.equal(sentEvents.filter(e => e.type === "response.create").at(-1).response.instructions.includes("thankful"), true);
  play(currentExactClosing());
  assert.equal(closingAcknowledgmentDelivered, true);

  // Hearing the fixed farewell alone cannot prove the acknowledgment played.
  freshTask(); askCheck(); user("My friend stayed with me.");
  tool("finish", "Your friend's presence mattered to you.");
  play(currentExactClosing(), undefined, false, false);
  assert.equal(automaticStopOptions, null);
  assert.equal(closingAcknowledgmentDelivered, false);
  assert.equal(closingRetryCount, 1);
  assert.equal(sentEvents.filter(e => e.type === "response.create").at(-1).response.instructions.includes("presence mattered"), true);
  play(currentExactClosing());
  assert.notEqual(automaticStopOptions, null);

  // Clock begins at opening audio, not transcription; preparation/transition excluded.
  freshTask("affective", "positive", null);
  isPreparationSession = true;
  transitionPlaybackPending = true;
  startConversationClock();
  assert.equal(topicStartedAtMilliseconds, null);
  isPreparationSession = false;
  transitionPlaybackPending = false;
  requestTaskOpening();
  play(activeTaskProfile.opening_first);
  assert.notEqual(topicStartedAtMilliseconds, null);
  clearPacingTimer();
  const clockStart = topicStartedAtMilliseconds;
  user("Here is my memory.");
  assert.equal(topicStartedAtMilliseconds, clockStart);
  play("What happened next?");

  // Both conditions have the same floor, convergence and soft upper bound.
  for (const mode of ["affective", "cognitive"]) {
    freshTask(mode, mode === "affective" ? "positive" : "island", 179);
    sendPacingControlIfNeeded();
    assert.equal(endingStage, "exploring");
    topicStartedAtMilliseconds = Date.now() - 180000;
    sendPacingControlIfNeeded();
    assert.equal(pacingConvergenceSent, true);
    assert.equal(endingStage, "exploring");
    topicStartedAtMilliseconds = Date.now() - 270000;
    sendPacingControlIfNeeded();
    assert.equal(endingStage, "need_check");
    assert.equal(effectivePacingConfig().minimum_synthesis_elapsed_seconds, 180);
  }

  // A model farewell alone cannot authorize auto-save or skip the final question.
  freshTask("affective", "positive", 100);
  user("It was a good day.");
  play(currentExactClosing());
  assert.equal(finalClosingDelivered, false);
  assert.equal(automaticStopOptions, null);
  user("That is all.");
  tool("finish");
  assert.equal(closingAuthorized, false);
  assert.equal(automaticStopOptions, null);

  // Final invitation must finish playing before a participant answer can qualify.
  freshTask();
  sendPacingControlIfNeeded();
  requestControlledResponse("ending_check");
  const checkId = beginResponse();
  handleRealtimeEvent({ type: "response.output_audio_transcript.done", response_id: checkId,
    item_id: "check", transcript: studyConfig.affective_final_check });
  assert.equal(endingStage, "need_check");
  handleRealtimeEvent({ type: "output_audio_buffer.started", response_id: checkId });
  assert.equal(microphoneTrack.enabled, false);
  handleRealtimeEvent({ type: "output_audio_buffer.stopped", response_id: checkId });
  handleRealtimeEvent({ type: "response.done", response: { id: checkId, status: "completed", output: [] } });
  assert.equal(endingStage, "waiting_check");
  assert.equal(microphoneTrack.enabled, true);
  topicStartedAtMilliseconds = Date.now() - 305000;
  pacingTick();
  clearPacingTimer();
  assert.equal(automaticStopOptions, null, "silence at five minutes is not an answer");
  assert.equal(endingStage, "waiting_check");

  // Bare yes and repair requests cannot be mistaken for a completed sharing answer.
  user("Yes.");
  tool("finish");
  assert.equal(closingAuthorized, false);
  play("Go ahead, I'm listening.");
  user("Could you repeat that?");
  tool("finish");
  assert.equal(closingAuthorized, false);
  play(studyConfig.affective_final_check);
  user("I also enjoyed being there with my friend.");
  tool("finish", "You enjoyed sharing that time with your friend.");
  assert.equal(closingAuthorized, true);
  assert.equal(automaticStopOptions, null, "tool approval alone must not stop recording");
  const closingRequest = sentEvents.filter(e => e.type === "response.create").at(-1);
  assert.equal(closingRequest.response.tools.length, 0);
  assert.equal(closingRequest.response.instructions.includes(currentExactClosing()), true);
  assert.equal(closingRequest.response.instructions.startsWith(studyConfig.voice_delivery_instructions + "\n\n"), true);
  play("You enjoyed sharing that time with your friend. " + currentExactClosing(), undefined, true);
  assert.equal(automaticStopOptions.advanceToNextTask, true);
  assert.equal(microphoneTrack.enabled, false);
  assert.equal(pacingTimerId, null);
  assert.equal(closingReason, "completed");

  // No additional content is a valid answer; no new exploration is required.
  freshTask();
  askCheck();
  user("No, nothing else.");
  tool("finish");
  assert.equal(closingAuthorized, true);

  // Both memory tasks honor a final decline without an added recap. Specific
  // empathy happens when sharing is received, and the fixed closing gives thanks.
  for (const task of ["positive", "negative"]) {
    freshTask("affective", task);
    user(task === "positive" ? "My friend made that day special."
      : "I kept thinking about the work all day, and eating left me uncomfortable.");
    play(task === "positive" ? "Having your friend there meant a lot to you."
      : "The pressure kept coming back all day. Then feeling uncomfortable after eating added another difficulty.");
    assert.equal(endingStage, "need_check");
    assert.equal(affectiveFollowupCount, 2, "a reflection is not another follow-up");
    assert.equal(closingAuthorized, false);
    askCheck();
    user("Could you repeat that?");
    tool("finish", "Okay.");
    assert.equal(closingAuthorized, false);
    play(studyConfig.affective_final_check);
    user("No, nothing else.");
    tool("finish", "Okay.");
    assert.equal(closingAuthorized, true);
    const declineClosing = sentEvents.filter(e => e.type === "response.create").at(-1);
    assert.deepEqual(declineClosing.response.input, []);
    assert.equal(declineClosing.response.instructions.endsWith(
      'Say exactly this and nothing else: "Okay. That completes our conversation. Thank you for sharing with me."'), true);
    play(currentExactClosing(), undefined, true);
    assert.equal(closingAcknowledgmentDelivered, true);
    assert.equal(automaticStopOptions.advanceToNextTask, true);
  }

  // Additional negative sharing still needs its specific response to play;
  // receiving the fixed thanks alone cannot substitute for that response.
  freshTask("affective", "negative");
  askCheck();
  user("One more thing: my friend stayed with me, and that mattered.");
  const additionalAck = "Your friend's presence mattered while you were having a difficult time.";
  tool("finish", additionalAck);
  play(currentExactClosing(), undefined, false, false);
  assert.equal(automaticStopOptions, null);
  assert.equal(closingAcknowledgmentDelivered, false);
  play(additionalAck + " " + currentExactClosing());
  assert.equal(automaticStopOptions.advanceToNextTask, true);

  // Cognitive may not skip its final confirmation, even after the check.
  freshTask("cognitive", "island");
  askCheck();
  user("No changes.");
  tool("finish");
  assert.equal(closingAuthorized, false);
  play("We can keep those choices.");
  user("Yes, those are my choices.");
  tool("check_answered");
  assert.equal(endingStage, "need_final");
  play("To confirm, your final three items are Matches, Machete, and Dog. Is that right?");
  assert.equal(endingStage, "waiting_final");
  user("Actually replace Dog with Rope.");
  play("To confirm, your final three items are Matches, Machete, and Rope. Is that right?");
  assert.equal(endingStage, "waiting_final");
  user("Yes.");
  tool("finish");
  assert.equal(closingAuthorized, true);
  play(currentExactClosing());
  assert.equal(automaticStopOptions.advanceToNextTask, true);

  // A previously refined child explanation can finish after the last check;
  // there is no mandatory full rehearsal.
  freshTask("cognitive", "leaves");
  askCheck();
  user("Nothing else.");
  tool("finish");
  assert.equal(closingAuthorized, true);
  play(currentExactClosing());
  assert.equal(automaticStopOptions.advanceToNextTask, true);

  // The wrap-up choice counts only after real playback, not generation or
  // cancelled speech; its receipt prevents another routine choice invitation.
  freshTask("cognitive", "leaves", 100);
  user("I think I understand the concept.");
  const cancelledChoice = beginResponse();
  handleRealtimeEvent({ type: "response.output_audio_transcript.done", response_id: cancelledChoice,
    item_id: "unplayed-choice", transcript: studyConfig.leaves_wrapup_choice_question });
  assert.equal(leavesWrapupChoiceDelivered, false);
  handleRealtimeEvent({ type: "output_audio_buffer.cleared", response_id: cancelledChoice });
  handleRealtimeEvent({ type: "output_audio_buffer.stopped", response_id: cancelledChoice });
  handleRealtimeEvent({ type: "response.done", response: { id: cancelledChoice, status: "completed", output: [] } });
  assert.equal(leavesWrapupChoiceDelivered, false);
  user("What would you suggest?");
  play(studyConfig.leaves_wrapup_choice_question);
  assert.equal(leavesWrapupChoiceDelivered, true);
  assert.equal(leavesWrapupControlText().includes("The example-or-explain choice has already finished playing"), true);
  user("Yes.");
  tool("finish");
  assert.equal(closingAuthorized, false, "bare yes cannot silently choose a path or close");
  play("Would you prefer an example, or to explain it yourself?");
  user("An example, please.");
  play("When autumn days become shorter, the leaf makes less green material. The green fades, and yellow and orange can show.");
  assert.equal(leavesWrapupChoiceDelivered, true);
  freshTask("cognitive", "leaves", 100);
  assert.equal(leavesWrapupChoiceDelivered, false, "new tasks clear the choice receipt");

  // Accepted rewrite is still owed, including a multiword agreement.
  freshTask("cognitive", "leaves");
  askCheck();
  user("Could you help me phrase it?");
  play("If you'd like, I can help smooth that into a shorter final version.");
  user("Mmm, sure, yeah.");
  assert.notEqual(listeningRepair, null);
  tool("finish");
  assert.equal(closingAuthorized, false);
  play("In autumn, the tree replaces less green material. As it fades, yellow and orange show through; some leaves also make red.");
  user("That works, nothing else.");
  assert.equal(listeningRepair, null);
  tool("finish");
  assert.equal(closingAuthorized, true);

  // Missing closing phrase retries once, including reversed transcript/playback order.
  for (const lateTranscript of [false, true]) {
    freshTask(); askCheck(); user("No more."); tool("finish");
    play("Thanks for sharing that experience.", undefined, lateTranscript);
    assert.equal(automaticStopOptions, null);
    assert.equal(closingRetryCount, 1);
    assert.equal(sentEvents.filter(e => e.type === "response.create").at(-1).response.instructions.includes(currentExactClosing()), true);
    play(currentExactClosing());
    assert.equal(automaticStopOptions.advanceToNextTask, true);
  }
  // Repeated omission saves as an error and does not launch the next activity.
  freshTask(); askCheck(); user("No more."); tool("finish");
  play("Thanks for sharing."); play("Thanks again.");
  assert.equal(automaticStopOptions.advanceToNextTask, false);
  assert.equal(closingReason, "closing_delivery_failed");

  freshTask("cognitive", "leaves", 100);
  user("The leaves change color.");
  const latePlayback = beginResponse();
  speechInProgress = true;
  handleRealtimeEvent({ type: "output_audio_buffer.started", response_id: latePlayback });
  assert.equal(sentEvents.at(-1).type, "output_audio_buffer.clear");
  assert.equal(microphoneTrack.enabled, true);
  assert.equal(cancelledAudioResponses.has(latePlayback), true);

  // Generation can finish before late playback starts: continuation reopens closure.
  freshTask(); askCheck(); user("No more."); tool("finish");
  const lateClose = beginResponse();
  handleRealtimeEvent({ type: "response.done", response: { id: lateClose, status: "completed", output: [] } });
  speechInProgress = true;
  handleRealtimeEvent({ type: "output_audio_buffer.started", response_id: lateClose });
  assert.equal(closingAuthorized, false);
  assert.equal(endingStage, "waiting_check");
  assert.equal(microphoneTrack.enabled, true);

  // 3:00 permits a natural check; does not force one.
  freshTask("cognitive", "island", 193);
  user("I will keep the dog.");
  assert.equal(endingStage, "exploring");
  assert.equal(endingControlText().includes("ENDING WINDOW"), true);
  play(studyConfig.cognitive_completeness_check);
  assert.equal(endingStage, "waiting_check");
  user("No, that is all."); tool("check_answered");
  assert.equal(endingStage, "need_final");
  play("To confirm, your final three items are Matches, Machete, and Dog. Is that right?");
  user("Yes."); tool("finish");
  assert.equal(closingAuthorized, true);
  assert.deepEqual(sentEvents.filter(e => e.type === "response.create").at(-1).response.input, []);
  play(currentExactClosing());
  assert.equal(automaticStopOptions.advanceToNextTask, true);

  // An already-heard early check is honoured and logged, not repeated.
  freshTask("affective", "positive", 170);
  user("That is everything."); play(studyConfig.affective_final_check);
  assert.equal(endingStage, "waiting_check");
  user("No more."); tool("finish");
  assert.equal(closingAuthorized, true);
  assert.equal(eventRecords.some(e => e.type === "early_final_check"), true);

  // Affective tool schema excludes Island-only progression. Unclear answer
  // gets a clarification, never an invented yes/no or silent deletion.
  freshTask("affective", "negative", 200);
  assert.equal(currentStudyProgressTool().parameters.properties.action.enum.includes("check_answered"), false);
  user("I felt uncomfortable."); play("What part felt uncomfortable?");
  const previousControlId = currentControlItemId;
  user("嗯,呀。");
  assert.equal(listeningRepair.source, "unclear_short_answer");
  assert.equal(endingControlText().includes("repeat their answer"), true);
  assert.equal(sentEvents.some(e => e.type === "conversation.item.delete" && e.item_id === previousControlId), true);
  tool("finish"); assert.equal(closingAuthorized, false);
  play("Could you repeat your answer? I didn't catch that.");
  user("It was the expensive gift.");
  assert.equal(listeningRepair, null);

  // A long final reply remains uninterrupted past five minutes.
  freshTask();
  askCheck();
  speechInProgress = true;
  topicStartedAtMilliseconds = Date.now() - 310000;
  const countBeforeLongReply = sentEvents.filter(e => e.type === "response.create").length;
  pacingTick();
  clearPacingTimer();
  assert.equal(sentEvents.filter(e => e.type === "response.create").length, countBeforeLongReply);
  assert.equal(automaticStopOptions, null);
  speechInProgress = false;
  user("That is everything I wanted to share.");
  tool("finish");
  play(currentExactClosing());
  assert.notEqual(automaticStopOptions, null);

  // Explicit stop bypasses the floor and never advances automatically to task two.
  freshTask("affective", "negative", 30);
  user("I want to stop now.");
  tool("stop", "Of course.", "participant_stop");
  assert.equal(closingAuthorized, true);
  play("Of course. " + currentExactClosing());
  assert.equal(automaticStopOptions.advanceToNextTask, false);
  assert.equal(closingReason, "participant_stop");

  // Continuation before closing playback cancels the close and reopens answer waiting.
  freshTask();
  askCheck();
  user("Nothing else.");
  tool("finish");
  const cancelledCloseId = beginResponse();
  handleRealtimeEvent({ type: "input_audio_buffer.speech_started", item_id: "extra" });
  assert.equal(closingAuthorized, false);
  assert.equal(endingStage, "waiting_check");
  handleRealtimeEvent({ type: "input_audio_buffer.speech_stopped", item_id: "extra" });
  handleRealtimeEvent({ type: "conversation.item.input_audio_transcription.completed", item_id: "extra", transcript: "Actually I also enjoyed the music." });
  handleRealtimeEvent({ type: "response.done", response: { id: cancelledCloseId, status: "cancelled", output: [] } });
  tool("finish", "You enjoyed the music too.");
  assert.equal(closingAuthorized, true);

  // A cancelled question does not become delivered when a late stopped event arrives.
  freshTask();
  sendPacingControlIfNeeded();
  requestControlledResponse("ending_check");
  const cancelledQuestion = beginResponse();
  handleRealtimeEvent({ type: "response.output_audio_transcript.done", response_id: cancelledQuestion,
    item_id: "cancelled-check", transcript: studyConfig.affective_final_check });
  handleRealtimeEvent({ type: "output_audio_buffer.cleared", response_id: cancelledQuestion });
  handleRealtimeEvent({ type: "output_audio_buffer.stopped", response_id: cancelledQuestion });
  assert.equal(endingStage, "need_check");

  // Busy transcription is a barrier for timer-driven final checks as well.
  freshTask();
  lastConversationActivityAt = Date.now() - 20000;
  pendingTranscriptionItemIds.add("still-transcribing");
  pacingTick();
  clearPacingTimer();
  assert.equal(sentEvents.some(e => e.type === "response.create"), false);
  pendingTranscriptionItemIds.clear();
  pacingTick();
  clearPacingTimer();
  assert.equal(sentEvents.filter(e => e.type === "response.create").length, 1);
  assert.equal(sentEvents.at(-1).response.metadata.controller_kind, "ending_check");

  // Regression: a mechanism question crossing 4:00 takes priority over the check.
  freshTask("cognitive", "leaves", 280);
  user("Wait, so you're saying cold weather signals trees are slowing down, and that's why red and orange color show up?");
  assert.notEqual(listeningRepair, null);
  assert.equal(endingStage, "need_check");
  assert.equal(sentEvents.filter(e => e.type === "conversation.item.create").at(-1).item.content[0].text.includes("LISTENING HOLD"), true);
  tool("check_answered");
  assert.equal(endingStage, "need_check");
  assert.equal(closingAuthorized, false);
  // A disobedient scripted ending is not evidence of a delivered repair.
  play(studyConfig.cognitive_completeness_check);
  assert.equal(endingStage, "need_check");
  assert.equal(listeningRepair.playbackResponseId, null);
  user("Wait, I just asked a question and you're not answering my question and just like you're ending?");
  tool("check_answered");
  assert.equal(endingStage, "need_check");
  play("You're right, I missed your question. Shorter days reduce replacement of the green material; it breaks down and reveals yellow and orange. Some trees make red separately.");
  assert.notEqual(listeningRepair.playbackResponseId, null);
  // Playback alone is not permission to proceed; silence cannot clear this hold.
  lastConversationActivityAt = Date.now() - 20000;
  const responseCountDuringHold = sentEvents.filter(e => e.type === "response.create").length;
  pacingTick(); clearPacingTimer();
  assert.equal(sentEvents.filter(e => e.type === "response.create").length, responseCountDuringHold);
  user("Okay, now I understand.");
  assert.equal(listeningRepair, null);
  play(studyConfig.cognitive_completeness_check);
  assert.equal(endingStage, "waiting_check");

  // Regression: the exact v10 false claim must not advance waiting_check.
  user("Wait, I just asked a question and you're not answering my question and just like you're ending?");
  const falseClaimId = beginResponse();
  handleRealtimeEvent({ type: "response.done", response: { id: falseClaimId, status: "completed", output: [{
    type: "function_call", name: "study_progress", call_id: "false-claim",
    arguments: JSON.stringify({ action: "check_answered", reason: "completed",
      evidence: "They clarified the idea and raised a question; after a concise explanation, the completeness check step is resolved.", acknowledgment: "" }),
  }] } });
  assert.equal(endingStage, "waiting_check");
  assert.equal(eventRecords.filter(e => e.type === "study_progress_decision").at(-1).accepted, false);
  assert.equal(sentEvents.filter(e => e.type === "response.create").at(-1).response.metadata.controller_kind, "ending_repair");
  play("Sorry, I missed your question about why the colors appear. The green material breaks down, revealing yellow and orange already in the leaf.");
  user("That answers it, nothing else.");
  play("Your explanation now includes the fading green and the other colors.");
  user("Oh my God, are you listening?");
  tool("finish");
  assert.equal(closingAuthorized, false);
  assert.equal(endingStage, "waiting_check");
  assert.equal(endingControlText().includes("apology alone is not repair"), true);

  // Semantic fallback: the model can request a hold even without a matched phrase.
  freshTask("cognitive", "leaves");
  askCheck();
  user("The green part still seems mysterious to me.");
  tool("repair_needed");
  assert.notEqual(listeningRepair, null);
  assert.equal(endingStage, "waiting_check");
  const pendingRepairId = beginResponse();
  handleRealtimeEvent({ type: "response.output_audio_transcript.done", response_id: pendingRepairId,
    item_id: "pending-repair", transcript: "The green material captures sunlight. In autumn it breaks down faster than the tree replaces it." });
  assert.equal(listeningRepair.playbackResponseId, null, "transcript alone is not delivered speech");
  handleRealtimeEvent({ type: "output_audio_buffer.started", response_id: pendingRepairId });
  handleRealtimeEvent({ type: "output_audio_buffer.cleared", response_id: pendingRepairId });
  handleRealtimeEvent({ type: "output_audio_buffer.stopped", response_id: pendingRepairId });
  assert.equal(listeningRepair.playbackResponseId, null, "cancelled audio is not a delivered repair");

  // New tasks clear all timers, permissions and question receipts.
  freshTask("affective", "negative", null);
  assert.equal(endingStage, "exploring");
  assert.equal(closingAuthorized, false);
  assert.equal(pendingEndingPlayback.size, 0);
  assert.equal(responseControls.size, 0);
  assert.equal(pacingTimerId, null);
  assert.equal(topicStartedAtMilliseconds, null);
  assert.equal(listeningRepair, null);
  assert.equal(repairSpeech.size, 0);
  // A late transcript must not shift the gap's origin from audio completion.
  const originalDateNow = Date.now;
  let fakeNow = 1000000;
  Date.now = () => fakeNow;
  try {
    freshTask("cognitive", "leaves");
    askCheck(); user("Nothing else."); tool("finish");
    const finalId = beginResponse();
    handleRealtimeEvent({ type: "response.done", response: { id: finalId, status: "completed", output: [] } });
    assert.equal(automaticStopOptions, null, "generation alone is not playback completion");
    fakeNow += 200;
    handleRealtimeEvent({ type: "output_audio_buffer.started", response_id: finalId });
    fakeNow += 800;
    handleRealtimeEvent({ type: "output_audio_buffer.stopped", response_id: finalId });
    const audioEndedAt = fakeNow;
    assert.equal(automaticStopOptions, null, "closing transcript has not yet arrived");
    fakeNow += 400;
    handleRealtimeEvent({ type: "response.output_audio_transcript.done", response_id: finalId,
      item_id: "late-closing-transcript", transcript: closingAcknowledgment + " " + currentExactClosing() });
    assert.equal(automaticStopOptions.nextTaskNotBeforeMilliseconds, audioEndedAt + 3000);
    assert.equal(conversationEndedAtMilliseconds, audioEndedAt);
  } finally {
    Date.now = originalDateNow;
    clearPacingTimer();
  }

  // Both conditions and researcher-test settings use the same playback gap.
  // Saving/reconnection consume that gap; they never start a new 3-second wait.
  const originalWindowSetTimeout = window.setTimeout;
  try {
    Date.now = () => fakeNow;
    for (const mode of ["cognitive", "affective"]) {
      for (const testMode of [false, true]) {
        for (const connectionDelay of [0, 900, 3500]) {
          const timers = [];
          window.setTimeout = (callback, delay) => { timers.push({ callback, delay }); return timers.length; };
          activeAssistantMode = mode;
          activeResearcherTestMode = testMode;
          isPreparationSession = true;
          isStopping = false;
          openingRequested = openingInProgress = openingPlaybackPending = false;
          transitionPlaybackPending = false;
          responseInProgress = false;
          sentEvents.length = 0;
          const previousEnd = 2000000;
          const deadline = previousEnd + 3000;
          fakeNow = previousEnd + connectionDelay;
          const transition = requestTransitionWhenReady(deadline);
          if (connectionDelay < 3000) {
            assert.equal(timers[0].delay, 3000 - connectionDelay);
            assert.equal(sentEvents.some(e => e.type === "response.create"), false);
            // An early timer wake must wait again, rather than speaking early.
            fakeNow = deadline - 1;
            timers[0].callback();
            await Promise.resolve();
            assert.equal(timers.at(-1).delay, 1);
            assert.equal(sentEvents.some(e => e.type === "response.create"), false);
            fakeNow = deadline;
            timers.at(-1).callback();
          } else {
            assert.equal(timers.length, 0, "no added wait after slow reconnect");
          }
          assert.equal(await transition, true);
          assert.equal(sentEvents.filter(e => e.type === "response.create").length, 1);
          assert.equal(taskTransitionTiming.previous_closing_ended_at_ms, previousEnd);
          handleRealtimeEvent({ type: "output_audio_buffer.started", response_id: "timed-transition" });
          assert.equal(taskTransitionTiming.actual_gap_seconds >= 3, true);
          assistantAudioPlaying = false;
        }
      }
    }

    // A pending transition cannot speak into a replaced/disconnected session.
    const timers = [];
    window.setTimeout = (callback, delay) => { timers.push({ callback, delay }); return timers.length; };
    isPreparationSession = true;
    isStopping = false;
    openingRequested = false;
    sentEvents.length = 0;
    fakeNow = 3000000;
    const cancelledTransition = requestTransitionWhenReady(fakeNow + 3000);
    const previousChannel = dataChannel;
    dataChannel = { readyState: "closed" };
    fakeNow += 3000;
    timers[0].callback();
    assert.equal(await cancelledTransition, false);
    assert.equal(sentEvents.some(e => e.type === "response.create"), false);
    dataChannel = previousChannel;
  } finally {
    Date.now = originalDateNow;
    window.setTimeout = originalWindowSetTimeout;
    activeResearcherTestMode = false;
    isPreparationSession = false;
    isStopping = false;
    assistantAudioPlaying = false;
  }
  stopSession = originalStopSession;

  handleRealtimeEvent({
    type: "session.updated",
    session: {
      id: "session-1",
      type: "realtime",
      model: "gpt-realtime-2.1",
      output_modalities: ["audio"],
      reasoning: { effort: "low" },
      audio: {
        input: {
          noise_reduction: { type: "far_field" },
          transcription: { model: "gpt-4o-mini-transcribe" },
          turn_detection: {
            type: "semantic_vad",
            eagerness: "medium",
            create_response: false,
            interrupt_response: false,
          },
        },
        output: { voice: "marin", speed: 1.0 },
      },
    },
  });
  assert.equal(
    latestAppliedSessionSettings.audio_input.turn_detection.create_response,
    false,
  );

  console.log("Buzz turn-controller and task-flow test passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`;

vm.runInContext(appSource + "\n" + harness, context, {
  filename: "app-with-turn-controller-test.js",
});
