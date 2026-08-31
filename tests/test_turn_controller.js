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
    assistant: { name: "Nomi", voice: "marin", speed: 1 },
    controller_version: "turn-control-2026-08-31-v8",
    closure_gate:
      "Does that fit well enough to wrap up, or is there anything you'd still like to adjust or think through?",
    exact_closing:
      "Thanks for talking this through with me. We can talk again later if you'd like.",
    post_closing_farewell: "Okay, bye.",
    pacing: {
      minimum_synthesis_elapsed_seconds: 420,
      minimum_response_batches: 8,
      convergence_elapsed_seconds: 420,
      closure_gate_elapsed_seconds: 510,
      maximum_elapsed_seconds: 600,
    },
    realtime: {
      reasoning_effort: "low",
      noise_reduction: "far_field",
      response_trigger: "after_clear_coalesced_input_transcription",
      pending_transcription_barrier: true,
      microphone_policy: "muted_during_assistant_audio_playback",
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
  };
  activeScenarioProfile = { label: "Trip", opening: "Opening" };
  activeModeProfile = { label: "Cognitive" };
  activeParticipantId = "PTEST";
  activeAssistantMode = "cognitive";
  activeScenario = "trip";
  sessionStartedAt = new Date().toISOString();

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
    transcript: "I want a place where I can rest.",
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
    "a response must not start while the second transcription is pending",
  );

  handleRealtimeEvent({
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "item-2",
    transcript: "But I mean resting while doing enjoyable things.",
  });

  const responseCreates = sentEvents.filter(
    (event) => event.type === "response.create",
  );
  assert.equal(responseCreates.length, 1);
  assert.equal(responseCreates[0].response.metadata.coalesced_item_count, "2");
  assert.equal(pendingTranscriptionItemIds.size, 0);
  assert.equal(
    eventRecords.some(
      (event) => event.type === "assistant_response_released_immediately",
    ),
    true,
  );
  assert.equal(
    eventRecords.some(
      (event) => event.type === "assistant_response_grace_started",
    ),
    false,
  );

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
  const continuationEvents = sentEvents.slice(sentBeforeContinuation);
  assert.equal(
    continuationEvents.some(
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
    transcript: "And I want to keep the schedule flexible.",
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
  const replacementCreate = sentEvents
    .filter((event) => event.type === "response.create")
    .at(-1);
  assert.equal(replacementCreate.response.metadata.coalesced_item_count, "3");
  assert.equal(
    eventRecords.some(
      (event) =>
        event.type === "assistant_response_cancelled_for_continuation",
    ),
    true,
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

  const createsBeforeIncompleteTurn = sentEvents.filter(
    (event) => event.type === "response.create",
  ).length;
  handleRealtimeEvent({
    type: "input_audio_buffer.speech_started",
    item_id: "item-incomplete-1",
    audio_start_ms: 4000,
  });
  handleRealtimeEvent({
    type: "input_audio_buffer.speech_stopped",
    item_id: "item-incomplete-1",
    audio_end_ms: 4500,
  });
  handleRealtimeEvent({
    type: "input_audio_buffer.committed",
    item_id: "item-incomplete-1",
    previous_item_id: "item-3",
  });
  handleRealtimeEvent({
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "item-incomplete-1",
    transcript: "It depends on...",
  });
  assert.equal(isClearlyIncompleteTranscript("It depends on..."), true);
  assert.equal(isClearlyIncompleteTranscript("It depends on the weather."), false);
  assert.equal(
    sentEvents.filter((event) => event.type === "response.create").length,
    createsBeforeIncompleteTurn,
  );
  assert.equal(
    eventRecords.some(
      (event) =>
        event.type === "assistant_response_grace_started" &&
        event.grace_ms === 300 &&
        event.conditional_incomplete_transcript,
    ),
    true,
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
  handleRealtimeEvent({
    type: "input_audio_buffer.speech_started",
    item_id: "item-incomplete-2",
    audio_start_ms: 4600,
  });
  handleRealtimeEvent({
    type: "input_audio_buffer.speech_stopped",
    item_id: "item-incomplete-2",
    audio_end_ms: 5200,
  });
  handleRealtimeEvent({
    type: "input_audio_buffer.committed",
    item_id: "item-incomplete-2",
    previous_item_id: "item-incomplete-1",
  });
  handleRealtimeEvent({
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "item-incomplete-2",
    transcript: "Who is coming with me.",
  });
  const incompleteReplacement = sentEvents
    .filter((event) => event.type === "response.create")
    .at(-1);
  assert.equal(incompleteReplacement.response.metadata.coalesced_item_count, "2");

  responseInProgress = false;
  activeResponseKind = null;
  activeParticipantResponseRequests = [];

  assert.equal(isBriefPostClosingAcknowledgment("Okay, bye."), true);
  assert.equal(isBriefPostClosingAcknowledgment("Bay."), true);
  assert.equal(
    isBriefPostClosingAcknowledgment("Okay, but I have another question."),
    false,
  );

  responseInProgress = false;
  lastAssistantTurnHadClosureGate = true;
  finalClosingDelivered = false;
  const sentBeforeClosureFollowup = sentEvents.length;
  sendParticipantResponseRequest([
    {
      itemId: "closure-adjustment-item",
      trigger: "clear_transcription",
      responseKind: "conversation",
    },
  ]);
  const closureFollowupEvents = sentEvents.slice(sentBeforeClosureFollowup);
  assert.equal(
    closureFollowupEvents.some(
      (event) =>
        event.type === "conversation.item.create" &&
        event.item.content[0].text.includes("[CLOSURE FOLLOW-UP CONTROL]"),
    ),
    true,
  );

  responseInProgress = false;
  lastAssistantTurnHadClosureGate = false;
  finalClosingDelivered = true;
  handleRealtimeEvent({
    type: "input_audio_buffer.speech_started",
    item_id: "item-farewell",
    audio_start_ms: 3000,
  });
  handleRealtimeEvent({
    type: "input_audio_buffer.speech_stopped",
    item_id: "item-farewell",
    audio_end_ms: 3500,
  });
  handleRealtimeEvent({
    type: "input_audio_buffer.committed",
    item_id: "item-farewell",
    previous_item_id: "item-2",
  });
  handleRealtimeEvent({
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "item-farewell",
    transcript: "Okay, bye.",
  });
  const farewellCreate = sentEvents
    .filter((event) => event.type === "response.create")
    .at(-1);
  assert.equal(
    farewellCreate.response.metadata.response_kind,
    "post_closing_farewell",
  );
  assert.equal(
    farewellCreate.response.instructions,
    'Say exactly "Okay, bye." and nothing else.',
  );
  assert.equal(farewellPlaybackPending, true);

  handleRealtimeEvent({
    type: "response.output_audio_transcript.done",
    response_id: "farewell-response",
    item_id: "farewell-item",
    transcript: "Okay, bye.",
  });
  handleRealtimeEvent({
    type: "response.done",
    response: {
      id: "farewell-response",
      status: "completed",
      metadata: { response_kind: "post_closing_farewell" },
      output: [],
    },
  });
  const originalStopSession = stopSession;
  let automaticStopOptions = null;
  stopSession = async (options) => {
    automaticStopOptions = options;
  };
  handleRealtimeEvent({
    type: "output_audio_buffer.started",
    response_id: "farewell-response",
  });
  handleRealtimeEvent({
    type: "output_audio_buffer.stopped",
    response_id: "farewell-response",
  });
  await Promise.resolve();
  assert.deepEqual(automaticStopOptions, { manualStop: false });
  assert.equal(postClosingFarewellDelivered, true);
  assert.equal(
    eventRecords.some(
      (event) => event.type === "automatic_stop_after_farewell",
    ),
    true,
  );
  stopSession = originalStopSession;

  const emphasizedInstruction = {
    body: "Before. Think of one practical task. After.",
    emphasis: "Think of one practical task.",
  };
  const renderedInstruction = document.createElement("p");
  renderInstructionBody(renderedInstruction, emphasizedInstruction);
  assert.equal(renderedInstruction.children.length, 3);
  assert.equal(renderedInstruction.children[1].textContent, emphasizedInstruction.emphasis);

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
  assert.equal(
    latestAppliedSessionSettings.audio_input.turn_detection.interrupt_response,
    false,
  );

  topicStartedAtMilliseconds = Date.now() - 421000;
  sendPacingControlIfNeeded();
  topicStartedAtMilliseconds = Date.now() - 511000;
  sendPacingControlIfNeeded();
  topicStartedAtMilliseconds = Date.now() - 601000;
  sendPacingControlIfNeeded();
  const pacingStates = eventRecords
    .filter((event) => event.type === "study_pacing_control_sent")
    .map((event) => event.state);
  assert.equal(pacingStates.includes("convergence_required"), true);
  assert.equal(pacingStates.includes("closure_gate_required"), true);
  assert.equal(pacingStates.includes("upper_bound_reached"), true);

  console.log("turn-controller event-order test passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`;

vm.runInContext(appSource + "\n" + harness, context, {
  filename: "app-with-turn-controller-test.js",
});
