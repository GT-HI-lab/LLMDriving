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
    assistant: { name: "Buzz", voice: "marin", speed: 1 },
    prompt_version: "pilot-2026-10-04-v13",
    controller_version: "turn-control-2026-10-04-v14",
    preparation_seconds: 60,
    transition: "Let's move to the next activity.",
    closings: {
      task_one: "That completes our conversation. Thank you!",
      task_two: "That completes our conversation. Thank you!",
    },
    affective_final_check: "Before we finish, is there anything else you'd like to share about that experience?",
    cognitive_completeness_check: "Before we finalize it, is there anything important we missed or anything you'd like to reconsider?",
    leaves_rehearsal_question: "Would you like to try saying your final explanation in one or two sentences, as if you were speaking to the child?",
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
  assert.equal(
    firstOpening.response.instructions,
    'Say exactly this and nothing else: "Hello, I\'m Buzz. How would you explain why leaves change color in autumn to a seven-year-old?"',
  );

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
  assert.equal(
    secondOpening.response.instructions,
    'Say exactly this and nothing else: "Which three items did you choose for the island?"',
  );
  assert.equal(secondOpening.response.instructions.includes("Hello"), false);

  openingRequested = false;
  openingInProgress = false;
  openingPlaybackPending = false;
  responseInProgress = false;
  requestTransitionMessage();
  const transitionCreate = sentEvents
    .filter((event) => event.type === "response.create")
    .at(-1);
  assert.equal(
    transitionCreate.response.instructions,
    'Say exactly this and nothing else: "Let\'s move to the next activity."',
  );
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
  function freshTask(mode = "affective", task = "positive", elapsed = 275) {
    resetEndingController();
    clearPreparationTimer();
    clearConversationDisplay();
    topicStartedAtMilliseconds = elapsed === null ? null : Date.now() - elapsed * 1000;
    activeAssistantMode = mode;
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
  function play(text, id = beginResponse(), transcriptAfterPlayback = false) {
    const transcript = { type: "response.output_audio_transcript.done", response_id: id,
      item_id: "a-" + id, transcript: text };
    if (!transcriptAfterPlayback) handleRealtimeEvent(transcript);
    handleRealtimeEvent({ type: "output_audio_buffer.started", response_id: id });
    handleRealtimeEvent({ type: "output_audio_buffer.stopped", response_id: id });
    if (transcriptAfterPlayback) handleRealtimeEvent(transcript);
    handleRealtimeEvent({ type: "response.done", response: { id, status: "completed", output: [] } });
    return id;
  }
  function tool(action, acknowledgment = "", reason = "completed") {
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
  play("You enjoyed sharing that time with your friend. That completes our conversation. Thank you.", undefined, true);
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

  // Leaves finishes after its last check; there is no mandatory rehearsal.
  freshTask("cognitive", "leaves");
  askCheck();
  user("Nothing else.");
  tool("finish");
  assert.equal(closingAuthorized, true);
  play(currentExactClosing());
  assert.equal(automaticStopOptions.advanceToNextTask, true);

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
        output: { voice: "marin", speed: 1 },
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
