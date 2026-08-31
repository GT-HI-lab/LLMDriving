"use strict";

const researcherView = document.querySelector("#researcherView");
const participantInstructionView = document.querySelector(
  "#participantInstructionView",
);
const conversationView = document.querySelector("#conversationView");
const participantIdInput = document.querySelector("#participantId");
const scenarioInputs = Array.from(
  document.querySelectorAll('input[name="conversationScenario"]'),
);
const modeInputs = Array.from(
  document.querySelectorAll('input[name="assistantMode"]'),
);
const prepareButton = document.querySelector("#prepareButton");
const startButton = document.querySelector("#startButton");
const backButton = document.querySelector("#backButton");
const stopButton = document.querySelector("#stopButton");
const returnButton = document.querySelector("#returnButton");
const setupStatusElement = document.querySelector("#setupStatus");
const statusElement = document.querySelector("#status");
const recordingStatusElement = document.querySelector("#recordingStatus");
const participantInstructionHeading = document.querySelector(
  "#participantInstructionHeading",
);
const participantInstructionBody = document.querySelector(
  "#participantInstructionBody",
);
const participantStarter = document.querySelector("#participantStarter");
const conversationInstruction = document.querySelector(
  "#conversationInstruction",
);
const conversationInstructionHeading = document.querySelector(
  "#conversationInstructionHeading",
);
const conversationInstructionBody = document.querySelector(
  "#conversationInstructionBody",
);
const conversationStarter = document.querySelector("#conversationStarter");
const researcherResults = document.querySelector("#researcherResults");
const savedFilesSummary = document.querySelector("#savedFilesSummary");
const transcriptElement = document.querySelector("#transcript");
const eventLogElement = document.querySelector("#eventLog");
const voiceOrb = document.querySelector("#voiceOrb");
const remoteAudio = document.querySelector("#remoteAudio");

const participantIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const transcriptItems = new Map();
const responseRequestedItemIds = new Set();
const pendingTranscriptionItemIds = new Set();
const RESPONSE_GRACE_MS = 0;
const INCOMPLETE_TRANSCRIPT_GRACE_MS = 300;
const ENGLISH_FILLER_WORDS = new Set([
  "ah",
  "erm",
  "hm",
  "hmm",
  "mm",
  "mmm",
  "oh",
  "uh",
  "um",
]);

let studyConfig = null;
let peerConnection = null;
let dataChannel = null;
let microphoneStream = null;
let audioContext = null;
let recordingDestination = null;
let microphoneRecordingSource = null;
let remoteRecordingSource = null;
let mediaRecorder = null;
let recordingChunks = [];
let recordingMimeType = "";
let activeParticipantId = "";
let activeAssistantMode = "";
let activeScenario = "";
let activeModeProfile = null;
let activeScenarioProfile = null;
let sessionWasEstablished = false;
let isStopping = false;
let openingRequested = false;
let openingInProgress = false;
let openingPlaybackPending = false;
let responseInProgress = false;
let activeResponseId = null;
let activeResponseKind = null;
let activeParticipantResponseRequests = [];
let continuationResponseCancelPending = false;
let continuationCancelResponseId = null;
let continuationCancelSequence = 0;
let queuedParticipantResponses = [];
let speechInProgress = false;
let assistantAudioPlaying = false;
let responseGraceTimer = null;
let topicStartedAtMilliseconds = null;
let participantResponseBatchCount = 0;
let pacingHoldSent = false;
let pacingReleaseSent = false;
let pacingConvergenceSent = false;
let pacingClosureGateSent = false;
let pacingMaximumSent = false;
let lastAssistantTurnHadClosureGate = false;
let finalClosingDelivered = false;
let farewellPlaybackPending = false;
let postClosingFarewellDelivered = false;
let participantInstructionPending = false;
let sessionStartedAt = null;
let sessionEndedAt = null;
let manualStopRequested = false;
let eventRecords = [];
let latestSaveSummary = "";
let latestAppliedSessionSettings = null;

function showView(view) {
  researcherView.hidden = view !== researcherView;
  participantInstructionView.hidden = view !== participantInstructionView;
  conversationView.hidden = view !== conversationView;
  window.scrollTo({ top: 0, behavior: "auto" });
}

function setStatus(message) {
  statusElement.dataset.technicalStatus = message;
}

function showParticipantStatus(message) {
  statusElement.textContent = message;
  statusElement.hidden = false;
}

function hideParticipantStatus() {
  statusElement.hidden = true;
}

function setRecordingStatus(message) {
  recordingStatusElement.textContent = message;
}

function diagnosticLog(message) {
  const time = new Date().toLocaleTimeString();
  eventLogElement.textContent += "[" + time + "] " + message + "\n";
  eventLogElement.scrollTop = eventLogElement.scrollHeight;
}

function recordEvent(type, details) {
  const entry = {
    at: new Date().toISOString(),
    type,
  };
  for (const [key, value] of Object.entries(details || {})) {
    if (value !== undefined) entry[key] = value;
  }
  eventRecords.push(entry);
}

function clearConversationDisplay() {
  transcriptItems.clear();
  responseRequestedItemIds.clear();
  pendingTranscriptionItemIds.clear();
  activeParticipantResponseRequests = [];
  queuedParticipantResponses = [];
  transcriptElement.replaceChildren();
  eventLogElement.textContent = "";
  eventRecords = [];
}

function setSetupControlsDisabled(disabled) {
  participantIdInput.disabled = disabled;
  for (const input of scenarioInputs) input.disabled = disabled;
  for (const input of modeInputs) input.disabled = disabled;
}

function hideConversationInstruction(trigger, itemId) {
  if (!participantInstructionPending) return;
  participantInstructionPending = false;
  conversationInstruction.hidden = true;
  recordEvent("participant_instruction_hidden", {
    trigger,
    item_id: itemId,
  });
}

function setMicrophoneEnabled(enabled) {
  if (!microphoneStream) return;
  for (const track of microphoneStream.getAudioTracks()) {
    track.enabled = enabled;
  }
}

function cloneForStudyLog(value) {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return null;
  }
}

function summarizeAppliedSessionSettings(session) {
  const source = session || {};
  const audio = source.audio || {};
  const input = audio.input || {};
  const output = audio.output || {};
  return {
    id: source.id || null,
    type: source.type || null,
    model: source.model || null,
    output_modalities: cloneForStudyLog(source.output_modalities),
    reasoning_effort:
      source.reasoning && source.reasoning.effort !== undefined
        ? source.reasoning.effort
        : null,
    audio_input: {
      noise_reduction: cloneForStudyLog(input.noise_reduction),
      transcription: cloneForStudyLog(input.transcription),
      turn_detection: cloneForStudyLog(input.turn_detection),
    },
    audio_output: {
      voice: output.voice || null,
      speed: output.speed === undefined ? null : output.speed,
    },
  };
}

function markTranscriptionPending(itemId, source) {
  if (!itemId || pendingTranscriptionItemIds.has(itemId)) return;
  pendingTranscriptionItemIds.add(itemId);
  recordEvent("participant_transcription_pending", {
    item_id: itemId,
    source,
    pending_item_count: pendingTranscriptionItemIds.size,
  });
}

function resolvePendingTranscription(itemId, outcome) {
  if (!itemId) return;
  const wasPending = pendingTranscriptionItemIds.delete(itemId);
  recordEvent("participant_transcription_resolved", {
    item_id: itemId,
    outcome,
    was_pending: wasPending,
    pending_item_count: pendingTranscriptionItemIds.size,
  });
}

function ensureTranscriptItem(itemId, role, previousItemId) {
  if (!itemId || !["user", "assistant"].includes(role)) return null;

  const existing = transcriptItems.get(itemId);
  if (existing) {
    if (previousItemId !== undefined) existing.previousItemId = previousItemId;
    positionTranscriptItem(existing);
    return existing;
  }

  const wrapper = document.createElement("p");
  wrapper.className = "message " + role;
  wrapper.dataset.itemId = itemId;

  const label = document.createElement("strong");
  label.textContent =
    role === "user" ? "Participant" : studyConfig.assistant.name;

  const content = document.createElement("span");
  content.className = "pending";
  content.textContent = role === "user" ? "Transcribing…" : "Responding…";
  wrapper.append(label, content);

  const record = {
    itemId,
    role,
    previousItemId,
    timestamp: new Date().toISOString(),
    element: wrapper,
    contentElement: content,
    text: "",
    pending: true,
    ignored: false,
    ignoreReason: null,
  };
  transcriptItems.set(itemId, record);
  positionTranscriptItem(record);

  for (const candidate of transcriptItems.values()) {
    if (candidate.previousItemId === itemId) positionTranscriptItem(candidate);
  }
  return record;
}

function positionTranscriptItem(record) {
  const previous = record.previousItemId
    ? transcriptItems.get(record.previousItemId)
    : null;

  if (previous && previous.element.isConnected) {
    let insertionPoint = previous.element;
    let sibling = insertionPoint.nextElementSibling;
    while (sibling) {
      const siblingRecord = transcriptItems.get(sibling.dataset.itemId);
      if (
        !siblingRecord ||
        siblingRecord.previousItemId !== record.previousItemId ||
        siblingRecord.timestamp > record.timestamp
      ) {
        break;
      }
      insertionPoint = sibling;
      sibling = sibling.nextElementSibling;
    }
    insertionPoint.after(record.element);
  } else if (record.previousItemId === null) {
    transcriptElement.prepend(record.element);
  } else if (!record.element.isConnected) {
    transcriptElement.append(record.element);
  }
}

function setTranscriptText(record, text, append) {
  if (!record || (!append && !text)) return;
  if (append) {
    if (record.pending) record.text = "";
    record.text += text;
  } else {
    record.text = text;
  }
  record.pending = false;
  record.contentElement.classList.remove("pending");
  record.contentElement.textContent = record.text;
}

function extractConversationItemText(item) {
  if (!Array.isArray(item && item.content)) return "";
  return item.content
    .map((part) => part.transcript || part.text || "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

function countWords(text) {
  const normalized = String(text || "").trim();
  return normalized ? normalized.split(/\s+/).length : 0;
}

function classifyUnusableTranscript(text) {
  const normalized = String(text || "").trim().toLowerCase();
  if (!/[\p{L}\p{N}]/u.test(normalized)) return "no_transcribed_speech";

  const englishTokens = normalized.match(/[a-z]+(?:'[a-z]+)?/g) || [];
  const nonEnglishOrNumericContent = normalized.replace(
    /[a-z\s\p{P}\p{S}]/gu,
    "",
  );
  const lettersAndNumbers = Array.from(
    normalized.replace(/[\s\p{P}\p{S}]/gu, ""),
  );
  const containsAsciiLetterOrNumber = /[a-z0-9]/.test(normalized);
  if (
    englishTokens.length &&
    !nonEnglishOrNumericContent &&
    englishTokens.every((token) => ENGLISH_FILLER_WORDS.has(token))
  ) {
    return "filler_or_unclear_fragment";
  }
  if (!containsAsciiLetterOrNumber && lettersAndNumbers.length <= 2) {
    return "filler_or_unclear_fragment";
  }
  return null;
}

function hasMeaningfulTranscript(text) {
  return classifyUnusableTranscript(text) === null;
}

function isClearlyIncompleteTranscript(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;
  if (/(?:\.{2,}|…)\s*$/.test(raw)) return true;

  const normalized = normalizeSpeech(raw)
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /(?:\b(?:and|but|or|because|so|if|when|while|although|unless)|\bdepends on|\b(?:was|were|am|'m) (?:gonna|going to)|\btrying to)$/.test(
    normalized,
  );
}

function isBriefPostClosingAcknowledgment(text) {
  const normalized = normalizeSpeech(text)
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return new Set([
    "alright",
    "all right",
    "bay",
    "bye",
    "bye bye",
    "goodbye",
    "ok",
    "ok bye",
    "okay",
    "okay bay",
    "okay bye",
    "see you",
    "see you later",
    "sounds good",
    "take care",
    "thank you",
    "thank you bye",
    "thanks",
    "thanks bye",
  ]).has(normalized);
}

function deleteIgnoredParticipantItem(itemId, reason) {
  if (!itemId || !dataChannel || dataChannel.readyState !== "open") return;
  dataChannel.send(
    JSON.stringify({
      type: "conversation.item.delete",
      item_id: itemId,
    }),
  );
  recordEvent("participant_item_delete_requested", {
    item_id: itemId,
    reason,
  });
}

function cancelResponseGraceTimer(reason) {
  if (responseGraceTimer === null) return;
  window.clearTimeout(responseGraceTimer);
  responseGraceTimer = null;
  recordEvent("assistant_response_grace_cancelled", { reason });
}

function requeueActiveParticipantRequestsForContinuation() {
  const queuedIds = new Set(
    queuedParticipantResponses.map((request) => request.itemId),
  );
  const restored = activeParticipantResponseRequests.filter(
    (request) => !queuedIds.has(request.itemId),
  );
  if (restored.length) {
    queuedParticipantResponses = restored.concat(queuedParticipantResponses);
  }
  return restored.length;
}

function sendContinuationResponseCancel() {
  if (
    !continuationResponseCancelPending ||
    !activeResponseId ||
    !dataChannel ||
    dataChannel.readyState !== "open"
  ) {
    return;
  }
  continuationCancelResponseId = activeResponseId;
  continuationCancelSequence += 1;
  const eventId = "continuation-cancel-" + continuationCancelSequence;
  dataChannel.send(
    JSON.stringify({
      type: "response.cancel",
      event_id: eventId,
      response_id: activeResponseId,
    }),
  );
  recordEvent("assistant_response_cancel_requested_for_continuation", {
    response_id: activeResponseId,
    event_id: eventId,
    restored_item_count: activeParticipantResponseRequests.length,
  });
}

function cancelPrePlaybackResponseForContinuation(participantItemId) {
  if (
    !responseInProgress ||
    assistantAudioPlaying ||
    openingInProgress ||
    openingPlaybackPending ||
    activeResponseKind !== "conversation" ||
    continuationResponseCancelPending
  ) {
    return false;
  }

  continuationResponseCancelPending = true;
  const restoredItemCount =
    requeueActiveParticipantRequestsForContinuation();
  if (participantResponseBatchCount > 0) {
    participantResponseBatchCount -= 1;
  }
  recordEvent("assistant_response_cancel_pending_for_continuation", {
    participant_item_id: participantItemId,
    response_id: activeResponseId,
    restored_item_count: restoredItemCount,
  });
  sendContinuationResponseCancel();
  return true;
}

function removeCancelledAssistantItem(itemId) {
  const record = transcriptItems.get(itemId);
  if (!record || record.role !== "assistant") return;
  if (record.element && typeof record.element.remove === "function") {
    record.element.remove();
  }
  transcriptItems.delete(itemId);
}

function participantResponseBlockers() {
  const blockers = [];
  if (responseInProgress) blockers.push("response_in_progress");
  if (openingInProgress) blockers.push("opening_generation_in_progress");
  if (openingPlaybackPending) blockers.push("opening_playback_pending");
  if (speechInProgress) blockers.push("participant_speaking");
  if (pendingTranscriptionItemIds.size) {
    blockers.push("participant_transcription_pending");
  }
  if (assistantAudioPlaying) blockers.push("assistant_audio_playing");
  if (isStopping) blockers.push("session_stopping");
  return blockers;
}

function pacingElapsedSeconds() {
  if (topicStartedAtMilliseconds === null) return 0;
  return Math.max(
    0,
    Math.floor((Date.now() - topicStartedAtMilliseconds) / 1000),
  );
}

function sendPacingControlIfNeeded() {
  const pacing = studyConfig && studyConfig.pacing;
  if (!pacing || !dataChannel || dataChannel.readyState !== "open") return;

  const elapsedSeconds = pacingElapsedSeconds();
  const releaseEligible =
    elapsedSeconds >= pacing.minimum_synthesis_elapsed_seconds &&
    participantResponseBatchCount >= pacing.minimum_response_batches;
  let state = null;
  let message = "";

  if (elapsedSeconds >= pacing.maximum_elapsed_seconds) {
    if (!pacingMaximumSent) {
      pacingMaximumSent = true;
      state = "upper_bound_reached";
      message =
        "[STUDY PACING CONTROL] The study upper bound has been reached. Do " +
        "not ask another exploratory question or open a new topic, category, " +
        "or planning branch. If the participant has clearly confirmed there " +
        "is nothing else to adjust, use the short confirmed-close structure " +
        "now. Otherwise, give or update only the best concise synthesis " +
        "supported by the conversation and ask exactly: " +
        JSON.stringify(studyConfig.closure_gate) +
        " If the participant requests an adjustment, address only that point " +
        "without repeating the gate in the same response. Ask the gate in a " +
        "later response only after that point has been substantively addressed. " +
        "Never use the gate in consecutive assistant responses or close before " +
        "participant confirmation.";
    }
  } else if (elapsedSeconds >= pacing.closure_gate_elapsed_seconds) {
    if (!pacingClosureGateSent) {
      pacingClosureGateSent = true;
      state = "closure_gate_required";
      message =
        "[STUDY PACING CONTROL] The closure window has been reached. Do not " +
        "open another exploratory branch. In this response, give the endpoint " +
        "synthesis once if it has not yet been given, then ask exactly: " +
        JSON.stringify(studyConfig.closure_gate) +
        " If the participant requests an adjustment or more help, address or " +
        "clarify only that point without repeating the gate in the same response. " +
        "Continue a bounded follow-up and ask the gate again only in a later " +
        "response after the request has been addressed. Do not repeat a full " +
        "summary after confirmation or use the gate in consecutive responses.";
    }
  } else if (elapsedSeconds >= pacing.convergence_elapsed_seconds) {
    if (!pacingConvergenceSent) {
      pacingConvergenceSent = true;
      state = "convergence_required";
      message =
        "[STUDY PACING CONTROL] The convergence window has begun. Do not " +
        "open a new topic or category. Ask at most one final high-value " +
        "question only if essential route-specific evidence is still missing; " +
        "otherwise move to the provisional synthesis and participant-controlled " +
        "closure gate. Do not repeat material already established.";
    }
  } else if (releaseEligible) {
    if (!pacingReleaseSent) {
      pacingReleaseSent = true;
      state = "synthesis_permitted";
      message =
        "[STUDY PACING CONTROL] The minimum exploration floor has now been met. " +
        "A provisional synthesis is permitted only after the assigned route's " +
        "scenario-specific endpoint evidence is genuinely complete. Continue " +
        "exploring if important evidence or a real trade-off remains unclear.";
    }
  } else if (!pacingHoldSent) {
    pacingHoldSent = true;
    state = "exploration_required";
    message =
      "[STUDY PACING CONTROL] Remain in exploration. Do not offer an " +
      "endpoint synthesis, decision rule, closure gate, or closing yet, unless " +
      "the participant explicitly asks to stop or says goodbye.";
  }

  if (!message) return;
  dataChannel.send(
    JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "system",
        content: [{ type: "input_text", text: message }],
      },
    }),
  );
  recordEvent("study_pacing_control_sent", {
    state,
    elapsed_seconds: elapsedSeconds,
    response_batch: participantResponseBatchCount,
    minimum_elapsed_seconds: pacing.minimum_synthesis_elapsed_seconds,
    minimum_response_batches: pacing.minimum_response_batches,
    convergence_elapsed_seconds: pacing.convergence_elapsed_seconds,
    closure_gate_elapsed_seconds: pacing.closure_gate_elapsed_seconds,
    maximum_elapsed_seconds: pacing.maximum_elapsed_seconds,
  });
}

function sendClosureFollowupControlIfNeeded() {
  if (
    !lastAssistantTurnHadClosureGate ||
    finalClosingDelivered ||
    !dataChannel ||
    dataChannel.readyState !== "open"
  ) {
    return;
  }
  dataChannel.send(
    JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "system",
        content: [
          {
            type: "input_text",
            text:
              "[CLOSURE FOLLOW-UP CONTROL] The immediately preceding assistant " +
              "turn ended with the closure gate. If the participant clearly " +
              "confirms that the synthesis fits and nothing else remains, use " +
              "the short confirmed close. If the participant requests a " +
              "correction, another consideration, or more help, address or " +
              "clarify that request without using the closure gate in this " +
              "response. Ask the gate again only in a later assistant response " +
              "after the requested point has been substantively addressed.",
          },
        ],
      },
    }),
  );
  recordEvent("closure_followup_control_sent");
}

function sendParticipantResponseRequest(requests) {
  if (
    !Array.isArray(requests) ||
    !requests.length ||
    isStopping ||
    !dataChannel ||
    dataChannel.readyState !== "open"
  ) {
    return;
  }

  const itemIds = requests.map((request) => request.itemId);
  const latestRequest = requests[requests.length - 1];
  const isPostClosingFarewell = requests.every(
    (request) => request.responseKind === "post_closing_farewell",
  );
  const responseKind = isPostClosingFarewell
    ? "post_closing_farewell"
    : "conversation";
  if (!isPostClosingFarewell) {
    participantResponseBatchCount += 1;
    sendPacingControlIfNeeded();
    sendClosureFollowupControlIfNeeded();
  }
  hideConversationInstruction(
    "clear_coalesced_transcription",
    latestRequest.itemId,
  );
  responseInProgress = true;
  activeResponseKind = responseKind;
  activeParticipantResponseRequests = requests.map((request) => ({
    ...request,
  }));
  farewellPlaybackPending = isPostClosingFarewell;
  const responsePayload = {
    output_modalities: ["audio"],
    metadata: {
      trigger: latestRequest.trigger,
      response_kind: responseKind,
      participant_item_id: latestRequest.itemId,
      participant_item_ids: itemIds.join(","),
      coalesced_item_count: String(itemIds.length),
      response_batch: String(participantResponseBatchCount),
    },
  };
  if (isPostClosingFarewell) {
    responsePayload.instructions =
      "Say exactly " +
      JSON.stringify(studyConfig.post_closing_farewell) +
      " and nothing else.";
  }
  dataChannel.send(
    JSON.stringify({
      type: "response.create",
      response: responsePayload,
    }),
  );
  diagnosticLog(
    isPostClosingFarewell
      ? "Requested the fixed post-closing response: " +
        JSON.stringify(studyConfig.post_closing_farewell)
      : itemIds.length > 1
      ? "Requested one response after coalescing " +
          itemIds.length +
          " participant speech chunks."
      : "Requested a response after clear participant speech.",
  );
  recordEvent("assistant_response_requested", {
    participant_item_id: latestRequest.itemId,
    participant_item_ids: itemIds,
    coalesced_item_count: itemIds.length,
    trigger: latestRequest.trigger,
    response_kind: responseKind,
    response_batch: participantResponseBatchCount,
    pacing_elapsed_seconds: pacingElapsedSeconds(),
  });
  if (isPostClosingFarewell) {
    recordEvent("post_closing_farewell_requested", {
      participant_item_id: latestRequest.itemId,
    });
  }
}

function requestParticipantResponse(
  itemId,
  trigger,
  responseKind,
  incompleteTranscript,
) {
  if (!itemId || responseRequestedItemIds.has(itemId) || isStopping) return;
  responseRequestedItemIds.add(itemId);
  const request = {
    itemId,
    trigger,
    responseKind: responseKind || "conversation",
    incompleteTranscript: incompleteTranscript === true,
  };
  queuedParticipantResponses.push(request);
  recordEvent("assistant_response_queued", {
    participant_item_id: itemId,
    trigger,
    response_kind: request.responseKind,
    incomplete_transcript: request.incompleteTranscript,
    active_response_id: activeResponseId,
    blockers: participantResponseBlockers(),
    queued_item_count: queuedParticipantResponses.length,
  });
  scheduleQueuedParticipantResponse("usable_transcription_completed");
}

function scheduleQueuedParticipantResponse(trigger) {
  cancelResponseGraceTimer("rescheduled");
  if (!queuedParticipantResponses.length) return;

  const blockers = participantResponseBlockers();
  if (blockers.length) {
    recordEvent("assistant_response_waiting", {
      trigger,
      blockers,
      queued_item_count: queuedParticipantResponses.length,
    });
    return;
  }

  const latestRequest = queuedParticipantResponses.at(-1);
  const graceMs =
    latestRequest && latestRequest.incompleteTranscript
      ? INCOMPLETE_TRANSCRIPT_GRACE_MS
      : RESPONSE_GRACE_MS;

  if (graceMs <= 0) {
    recordEvent("assistant_response_released_immediately", {
      trigger,
      queued_item_count: queuedParticipantResponses.length,
    });
    drainQueuedParticipantResponses("zero_grace_release");
    return;
  }

  responseGraceTimer = window.setTimeout(() => {
    responseGraceTimer = null;
    drainQueuedParticipantResponses("grace_elapsed");
  }, graceMs);
  recordEvent("assistant_response_grace_started", {
    trigger,
    grace_ms: graceMs,
    conditional_incomplete_transcript:
      Boolean(latestRequest && latestRequest.incompleteTranscript),
    queued_item_count: queuedParticipantResponses.length,
  });
}

function drainQueuedParticipantResponses(trigger) {
  const blockers = participantResponseBlockers();
  if (!queuedParticipantResponses.length || blockers.length) {
    if (queuedParticipantResponses.length) {
      recordEvent("assistant_response_waiting", {
        trigger: trigger || "response_release",
        blockers,
        queued_item_count: queuedParticipantResponses.length,
      });
    }
    return;
  }
  const requests = queuedParticipantResponses.splice(0);
  sendParticipantResponseRequest(requests);
}

function handleConversationItemAdded(event) {
  const item = event.item;
  if (
    !item ||
    item.type !== "message" ||
    !["user", "assistant"].includes(item.role)
  ) {
    return;
  }
  const record = ensureTranscriptItem(
    item.id,
    item.role,
    event.previous_item_id,
  );
  const text = extractConversationItemText(item);
  if (text) setTranscriptText(record, text, false);
}

function handleRealtimeEvent(event) {
  switch (event.type) {
    case "session.created":
    case "session.updated": {
      latestAppliedSessionSettings = summarizeAppliedSessionSettings(
        event.session,
      );
      diagnosticLog(event.type);
      recordEvent(event.type.replace(".", "_"), {
        applied_session: latestAppliedSessionSettings,
      });
      break;
    }
    case "conversation.item.added":
    case "conversation.item.created":
      handleConversationItemAdded(event);
      break;
    case "conversation.item.done": {
      const item = event.item;
      const record = transcriptItems.get(item && item.id);
      const text = extractConversationItemText(item);
      if (record && text) setTranscriptText(record, text, false);
      break;
    }
    case "input_audio_buffer.speech_started":
      markTranscriptionPending(event.item_id, "speech_started");
      speechInProgress = true;
      cancelResponseGraceTimer("participant_speech_started");
      const cancelledPrePlaybackResponse =
        cancelPrePlaybackResponseForContinuation(event.item_id);
      if (!isStopping) setStatus("Listening…");
      recordEvent("participant_speech_started", {
        item_id: event.item_id,
        audio_start_ms: event.audio_start_ms,
        assistant_response_in_progress: responseInProgress,
        assistant_audio_playing: assistantAudioPlaying,
        active_response_id: activeResponseId,
        pre_playback_response_cancelled: cancelledPrePlaybackResponse,
      });
      break;
    case "input_audio_buffer.speech_stopped":
      speechInProgress = false;
      if (!isStopping) setStatus("Nomi is thinking…");
      recordEvent("participant_speech_stopped", {
        item_id: event.item_id,
        audio_end_ms: event.audio_end_ms,
      });
      scheduleQueuedParticipantResponse("participant_speech_stopped");
      break;
    case "input_audio_buffer.committed":
      markTranscriptionPending(event.item_id, "input_audio_buffer_committed");
      ensureTranscriptItem(event.item_id, "user", event.previous_item_id);
      recordEvent("participant_turn_committed", {
        item_id: event.item_id,
        pending_transcription_count: pendingTranscriptionItemIds.size,
      });
      break;
    case "conversation.item.input_audio_transcription.completed": {
      resolvePendingTranscription(event.item_id, "completed");
      const record = ensureTranscriptItem(event.item_id, "user", undefined);
      const rawTranscript = String(event.transcript || "").trim();
      const transcript = rawTranscript || "[No speech detected]";
      const ignoreReason = classifyUnusableTranscript(rawTranscript);
      setTranscriptText(record, transcript, false);
      recordEvent("participant_transcription_completed", {
        item_id: event.item_id,
        word_count: countWords(transcript),
        usable_speech: ignoreReason === null,
        ignore_reason: ignoreReason,
      });
      if (ignoreReason) {
        if (record) {
          record.ignored = true;
          record.ignoreReason = ignoreReason;
        }
        diagnosticLog(
          ignoreReason === "no_transcribed_speech"
            ? "Ignored a VAD turn because no participant speech was transcribed."
            : "Ignored a VAD turn containing only a filler or unclear fragment.",
        );
        recordEvent("participant_turn_ignored", {
          item_id: event.item_id,
          reason: ignoreReason,
        });
        deleteIgnoredParticipantItem(event.item_id, ignoreReason);
        if (!isStopping) setStatus("Connected. You can continue speaking.");
        scheduleQueuedParticipantResponse("ignored_followup_transcription");
        break;
      }
      if (topicStartedAtMilliseconds === null) {
        topicStartedAtMilliseconds = Date.now();
        recordEvent("topic_discussion_started", {
          participant_item_id: event.item_id,
        });
      }
      const responseKind =
        finalClosingDelivered &&
        isBriefPostClosingAcknowledgment(rawTranscript)
          ? "post_closing_farewell"
          : "conversation";
      const incompleteTranscript =
        responseKind === "conversation" &&
        isClearlyIncompleteTranscript(rawTranscript);
      requestParticipantResponse(
        event.item_id,
        responseKind === "post_closing_farewell"
          ? "brief_post_closing_acknowledgment"
          : "clear_transcription",
        responseKind,
        incompleteTranscript,
      );
      break;
    }
    case "conversation.item.input_audio_transcription.failed": {
      resolvePendingTranscription(event.item_id, "failed");
      const record = ensureTranscriptItem(event.item_id, "user", undefined);
      setTranscriptText(record, "[Transcription unavailable]", false);
      diagnosticLog(
        "Input transcription failed; the voice conversation can continue.",
      );
      recordEvent("failure", {
        stage: "input_transcription",
        item_id: event.item_id,
        message: event.error && event.error.message,
      });
      requestParticipantResponse(
        event.item_id,
        "input_transcription_failure_fallback",
      );
      break;
    }
    case "conversation.item.deleted":
      if (pendingTranscriptionItemIds.has(event.item_id)) {
        resolvePendingTranscription(event.item_id, "item_deleted");
      }
      recordEvent("conversation_item_deleted", { item_id: event.item_id });
      break;
    case "conversation.item.truncated":
      recordEvent("assistant_item_truncated", {
        item_id: event.item_id,
        content_index: event.content_index,
        audio_end_ms: event.audio_end_ms,
      });
      break;
    case "response.created":
      responseInProgress = true;
      activeResponseId = event.response && event.response.id;
      if (!activeResponseKind) {
        activeResponseKind = openingInProgress
          ? "opening"
          : event.response && event.response.metadata
          ? event.response.metadata.response_kind || "conversation"
          : "conversation";
      }
      if (continuationResponseCancelPending) {
        sendContinuationResponseCancel();
      }
      diagnosticLog("response.created");
      recordEvent("assistant_response_created", {
        response_id: activeResponseId,
        metadata: event.response && event.response.metadata,
        opening: openingInProgress,
      });
      break;
    case "response.output_item.added": {
      const item = event.item || {};
      recordEvent("assistant_output_item_added", {
        response_id: event.response_id,
        item_id: item.id,
        output_index: event.output_index,
        item_type: item.type,
        phase: item.phase || null,
      });
      break;
    }
    case "response.output_audio.done":
      recordEvent("assistant_output_audio_completed", {
        response_id: event.response_id,
        item_id: event.item_id,
        output_index: event.output_index,
        content_index: event.content_index,
      });
      break;
    case "response.output_audio_transcript.delta": {
      const record = ensureTranscriptItem(
        event.item_id,
        "assistant",
        undefined,
      );
      setTranscriptText(record, event.delta || "", true);
      break;
    }
    case "response.output_audio_transcript.done": {
      const record = ensureTranscriptItem(
        event.item_id,
        "assistant",
        undefined,
      );
      const transcript =
        event.transcript || (record && record.text) || "[No transcript]";
      setTranscriptText(record, transcript, false);
      const normalizedTranscript = normalizeSpeech(transcript);
      const usedClosureGate = normalizedTranscript.includes(
        normalizeSpeech(studyConfig.closure_gate),
      );
      const usedExactClosing = normalizedTranscript.includes(
        normalizeSpeech(studyConfig.exact_closing),
      );
      const cancelledForContinuation =
        continuationResponseCancelPending &&
        event.response_id === continuationCancelResponseId;
      if (!openingInProgress && !cancelledForContinuation) {
        lastAssistantTurnHadClosureGate = usedClosureGate;
        if (usedExactClosing && !finalClosingDelivered) {
          finalClosingDelivered = true;
          recordEvent("final_closing_delivered", {
            response_id: event.response_id,
            item_id: event.item_id,
          });
        }
        if (
          farewellPlaybackPending &&
          normalizedTranscript ===
            normalizeSpeech(studyConfig.post_closing_farewell)
        ) {
          postClosingFarewellDelivered = true;
          recordEvent("post_closing_farewell_delivered", {
            response_id: event.response_id,
            item_id: event.item_id,
          });
        }
      }
      recordEvent("assistant_transcription_completed", {
        response_id: event.response_id,
        item_id: event.item_id,
        output_index: event.output_index,
        content_index: event.content_index,
        word_count: countWords(transcript),
        opening: openingInProgress,
        closure_gate_used: usedClosureGate,
        exact_closing_used: usedExactClosing,
        cancelled_for_continuation: cancelledForContinuation,
      });
      break;
    }
    case "response.done": {
      const response = event.response || {};
      const outputItems = Array.isArray(response.output)
        ? response.output.map((item, index) => ({
            output_index: index,
            item_id: item.id,
            item_type: item.type,
            phase: item.phase || null,
          }))
        : [];
      const cancelledForContinuation =
        continuationResponseCancelPending &&
        (!continuationCancelResponseId ||
          response.id === continuationCancelResponseId);
      responseInProgress = false;
      recordEvent("assistant_response_completed", {
        response_id: response.id,
        status: response.status,
        metadata: response.metadata,
        output_item_count: outputItems.length,
        output_items: outputItems,
        opening: openingInProgress,
        cancelled_for_continuation: cancelledForContinuation,
      });
      if (cancelledForContinuation) {
        for (const outputItem of outputItems) {
          removeCancelledAssistantItem(outputItem.item_id);
          if (dataChannel && dataChannel.readyState === "open") {
            dataChannel.send(
              JSON.stringify({
                type: "conversation.item.delete",
                item_id: outputItem.item_id,
              }),
            );
          }
        }
        recordEvent("assistant_response_cancelled_for_continuation", {
          response_id: response.id,
          server_status: response.status,
          removed_output_item_count: outputItems.length,
          queued_item_count: queuedParticipantResponses.length,
        });
      }
      activeResponseId = null;
      activeResponseKind = null;
      activeParticipantResponseRequests = [];
      continuationResponseCancelPending = false;
      continuationCancelResponseId = null;
      if (openingInProgress) {
        openingInProgress = false;
        diagnosticLog("Nomi completed generation of the opening message.");
        recordEvent("opening_generation_completed");
      } else {
        if (!isStopping) setStatus("Connected. You can continue speaking.");
        diagnosticLog("Assistant response completed.");
      }
      scheduleQueuedParticipantResponse("assistant_response_completed");
      break;
    }
    case "output_audio_buffer.started":
      assistantAudioPlaying = true;
      if (
        continuationResponseCancelPending &&
        (!continuationCancelResponseId ||
          event.response_id === continuationCancelResponseId)
      ) {
        if (dataChannel && dataChannel.readyState === "open") {
          dataChannel.send(JSON.stringify({ type: "output_audio_buffer.clear" }));
        }
        setMicrophoneEnabled(true);
        voiceOrb.classList.add("idle");
        recordEvent("output_audio_buffer_started", {
          response_id: event.response_id,
          microphone_enabled: true,
          cleared_for_participant_continuation: true,
        });
        break;
      }
      setMicrophoneEnabled(false);
      voiceOrb.classList.remove("idle");
      recordEvent(event.type.replace(/\./g, "_"), {
        response_id: event.response_id,
        microphone_enabled: false,
      });
      break;
    case "output_audio_buffer.stopped":
    case "output_audio_buffer.cleared":
      assistantAudioPlaying = false;
      const shouldAutoEndAfterFarewell =
        farewellPlaybackPending &&
        event.type === "output_audio_buffer.stopped";
      if (!isStopping && !shouldAutoEndAfterFarewell) {
        setMicrophoneEnabled(true);
      }
      voiceOrb.classList.add("idle");
      recordEvent(event.type.replace(/\./g, "_"), {
        response_id: event.response_id,
        microphone_enabled: !isStopping && !shouldAutoEndAfterFarewell,
      });
      if (shouldAutoEndAfterFarewell) {
        farewellPlaybackPending = false;
        setMicrophoneEnabled(false);
        recordEvent("automatic_stop_after_farewell", {
          response_id: event.response_id,
          farewell_transcript_confirmed: postClosingFarewellDelivered,
        });
        void stopSession({ manualStop: false });
        break;
      }
      if (openingPlaybackPending) {
        openingPlaybackPending = false;
        if (!isStopping) {
          setStatus("Connected. You can begin speaking.");
          hideParticipantStatus();
        }
        diagnosticLog("Nomi completed the opening message.");
        recordEvent("opening_completed", {
          playback_event: event.type,
        });
      } else if (!isStopping) {
        setStatus("Connected. You can continue speaking.");
      }
      scheduleQueuedParticipantResponse("assistant_audio_playback_ended");
      break;
    case "error":
      responseInProgress = false;
      activeResponseId = null;
      activeResponseKind = null;
      activeParticipantResponseRequests = [];
      continuationResponseCancelPending = false;
      continuationCancelResponseId = null;
      assistantAudioPlaying = false;
      farewellPlaybackPending = false;
      if (!isStopping) setMicrophoneEnabled(true);
      voiceOrb.classList.add("idle");
      if (openingInProgress || openingPlaybackPending) {
        openingInProgress = false;
        openingPlaybackPending = false;
      }
      if (!isStopping) {
        setStatus("The conversation encountered a connection error.");
        showParticipantStatus(
          "Connection error. Please return the device to the researcher.",
        );
      }
      diagnosticLog(
        "OpenAI error: " +
          ((event.error && event.error.message) || "Unknown error"),
      );
      recordEvent("failure", {
        stage: "realtime",
        code: event.error && event.error.code,
        message: event.error && event.error.message,
      });
      break;
    default:
      if (
        event.type &&
        (event.type.startsWith("input_audio_buffer.") ||
          (event.type.startsWith("response.") &&
            !event.type.includes(".delta")))
      ) {
        diagnosticLog(event.type);
      }
  }
}

function requestOpeningMessage() {
  if (openingRequested || !dataChannel || dataChannel.readyState !== "open") {
    return;
  }
  openingRequested = true;
  openingInProgress = true;
  openingPlaybackPending = true;
  responseInProgress = true;
  activeResponseKind = "opening";
  activeParticipantResponseRequests = [];
  setStatus("Nomi is opening the conversation…");
  dataChannel.send(
    JSON.stringify({
      type: "response.create",
      response: {
        input: [],
        output_modalities: ["audio"],
        metadata: { trigger: "programmed_opening" },
        instructions:
          "Say exactly this and nothing else: " +
          JSON.stringify(activeScenarioProfile.opening),
      },
    }),
  );
  diagnosticLog("Requested the programmed scenario opening.");
  recordEvent("opening_requested", {
    text: activeScenarioProfile.opening,
  });
}

function waitForIceGatheringComplete(pc) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const onStateChange = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", onStateChange);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", onStateChange);
  });
}

function chooseRecordingMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

async function startRecording(stream) {
  if (!window.MediaRecorder) {
    throw new Error("This browser does not support MediaRecorder.");
  }
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error("This browser does not support Web Audio recording.");
  }

  recordingMimeType = chooseRecordingMimeType();
  if (!recordingMimeType) {
    throw new Error(
      "This browser does not support a compatible audio recording format.",
    );
  }

  audioContext = new AudioContextClass();
  await audioContext.resume();
  recordingDestination = audioContext.createMediaStreamDestination();
  microphoneRecordingSource = audioContext.createMediaStreamSource(stream);
  microphoneRecordingSource.connect(recordingDestination);

  recordingChunks = [];
  mediaRecorder = new MediaRecorder(recordingDestination.stream, {
    mimeType: recordingMimeType,
  });
  mediaRecorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) recordingChunks.push(event.data);
  });
  mediaRecorder.start(1000);
  setRecordingStatus("Recording in progress.");
  diagnosticLog(
    "Recording started (" + (mediaRecorder.mimeType || recordingMimeType) + ").",
  );
  recordEvent("recording_started", {
    mime_type: mediaRecorder.mimeType || recordingMimeType,
  });
}

function attachRemoteRecordingStream(stream) {
  if (
    !audioContext ||
    !recordingDestination ||
    !stream ||
    !stream.getAudioTracks().length
  ) {
    return;
  }
  if (remoteRecordingSource) remoteRecordingSource.disconnect();
  remoteRecordingSource = audioContext.createMediaStreamSource(stream);
  remoteRecordingSource.connect(recordingDestination);
  diagnosticLog("Assistant audio added to the recording mix.");
  recordEvent("assistant_audio_mixed");
}

async function stopMediaRecorder() {
  const recorder = mediaRecorder;
  if (!recorder) return null;

  if (recorder.state !== "inactive") {
    await new Promise((resolve, reject) => {
      recorder.addEventListener("stop", resolve, { once: true });
      recorder.addEventListener(
        "error",
        (event) =>
          reject(
            new Error(
              (event.error && event.error.message) || "MediaRecorder failed.",
            ),
          ),
        { once: true },
      );
      recorder.stop();
    });
  }

  const mimeType = recorder.mimeType || recordingMimeType;
  return new Blob(recordingChunks, { type: mimeType });
}

async function cleanUpRecordingGraph() {
  if (microphoneRecordingSource) microphoneRecordingSource.disconnect();
  if (remoteRecordingSource) remoteRecordingSource.disconnect();
  microphoneRecordingSource = null;
  remoteRecordingSource = null;
  recordingDestination = null;
  mediaRecorder = null;
  recordingChunks = [];
  recordingMimeType = "";
  if (audioContext && audioContext.state !== "closed") {
    await audioContext.close();
  }
  audioContext = null;
}

async function finishRecording(saveRecording) {
  let recordingBlob = null;
  try {
    recordingBlob = await stopMediaRecorder();
  } finally {
    await cleanUpRecordingGraph();
  }

  if (!saveRecording) {
    setRecordingStatus("No recording was saved.");
    return null;
  }
  if (!recordingBlob || !recordingBlob.size) {
    throw new Error("The browser produced an empty recording.");
  }

  setRecordingStatus("Saving the conversation…");
  const response = await fetch("/recordings", {
    method: "POST",
    headers: {
      "Content-Type": recordingBlob.type,
      "X-Participant-ID": activeParticipantId,
    },
    body: recordingBlob,
  });
  const responseBody = await response.text();
  let result = {};
  try {
    result = JSON.parse(responseBody);
  } catch (_) {
    result = {};
  }
  if (!response.ok) {
    throw new Error(
      result.error ||
        "Recording upload failed (HTTP " + response.status + ").",
    );
  }

  diagnosticLog(
    "Recording saved as " +
      result.filename +
      " (" +
      result.bytes +
      " bytes).",
  );
  recordEvent("audio_saved", {
    filename: result.filename,
    bytes: result.bytes,
  });
  return result;
}

function orderedTranscriptRecords() {
  return Array.from(transcriptElement.querySelectorAll(".message"))
    .map((element) => transcriptItems.get(element.dataset.itemId))
    .filter(Boolean);
}

function buildTextLog(recordingResult) {
  const lines = [
    "Participant ID: " + activeParticipantId,
    "Scenario: " + activeScenarioProfile.label,
    "Conversation Route: " + activeModeProfile.label,
    "Prompt Version: " + studyConfig.prompt_version,
    "Turn Controller Version: " + studyConfig.controller_version,
    "Assistant Name: " + studyConfig.assistant.name,
    "Session Started: " + sessionStartedAt,
    "Session Ended: " + sessionEndedAt,
    "Audio File: " + recordingResult.filename,
    "",
    "Conversation",
    "============",
  ];

  for (const record of orderedTranscriptRecords()) {
    const speaker =
      record.role === "user" ? "Participant" : studyConfig.assistant.name;
    const fallback =
      record.role === "user"
        ? "[Transcription unavailable]"
        : "[Transcript unavailable]";
    lines.push(
      "",
      "[" +
        record.timestamp +
        "] " +
        speaker +
        ": " +
        (record.text.trim() || fallback),
    );
  }
  return lines.join("\n") + "\n";
}

async function saveTextLog(recordingResult) {
  const response = await fetch("/transcripts", {
    method: "POST",
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Recording-Stem": recordingResult.recording_stem,
    },
    body: buildTextLog(recordingResult),
  });
  const responseBody = await response.text();
  let result = {};
  try {
    result = JSON.parse(responseBody);
  } catch (_) {
    result = {};
  }
  if (!response.ok) {
    throw new Error(
      result.error || "Text log upload failed (HTTP " + response.status + ").",
    );
  }
  diagnosticLog(
    "Text log saved as " +
      result.filename +
      " (" +
      result.bytes +
      " bytes).",
  );
  recordEvent("transcript_saved", {
    filename: result.filename,
    bytes: result.bytes,
  });
  return result;
}

function normalizeSpeech(text) {
  return String(text || "")
    .replace(/’/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildEventLog(recordingResult, textResult) {
  const turns = orderedTranscriptRecords().map((record, index) => ({
    index: index + 1,
    item_id: record.itemId,
    role: record.role,
    speaker:
      record.role === "user" ? "Participant" : studyConfig.assistant.name,
    at: record.timestamp,
    text: record.text.trim(),
    transcript_pending: record.pending,
    ignored: record.ignored,
    ignore_reason: record.ignoreReason,
    word_count: countWords(record.text),
  }));
  const assistantText = turns
    .filter((turn) => turn.role === "assistant")
    .map((turn) => turn.text)
    .join(" ");
  const exactClosingDetected = normalizeSpeech(assistantText).includes(
    normalizeSpeech(studyConfig.exact_closing),
  );
  const closureGateDetected = normalizeSpeech(assistantText).includes(
    normalizeSpeech(studyConfig.closure_gate),
  );
  const startedMilliseconds = Date.parse(sessionStartedAt);
  const endedMilliseconds = Date.parse(sessionEndedAt);
  const durationMilliseconds =
    Number.isFinite(startedMilliseconds) && Number.isFinite(endedMilliseconds)
      ? Math.max(0, endedMilliseconds - startedMilliseconds)
      : null;

  return {
    schema_version: "1.0",
    prompt_version: studyConfig.prompt_version,
    controller_version: studyConfig.controller_version,
    participant_id: activeParticipantId,
    scenario: {
      id: activeScenario,
      label: activeScenarioProfile.label,
    },
    route: {
      id: activeAssistantMode,
      label: activeModeProfile.label,
    },
    assistant: {
      name: studyConfig.assistant.name,
      voice: studyConfig.assistant.voice,
      speed: studyConfig.assistant.speed,
    },
    realtime: {
      model: studyConfig.model,
      controller_version: studyConfig.controller_version,
      reasoning_effort: studyConfig.realtime.reasoning_effort,
      noise_reduction: studyConfig.realtime.noise_reduction,
      response_trigger: studyConfig.realtime.response_trigger,
      pending_transcription_barrier:
        studyConfig.realtime.pending_transcription_barrier,
      microphone_policy: studyConfig.realtime.microphone_policy,
      continuation_grace_ms: studyConfig.realtime.continuation_grace_ms,
      incomplete_transcript_grace_ms:
        studyConfig.realtime.incomplete_transcript_grace_ms,
      cancel_pre_playback_response_on_continuation:
        studyConfig.realtime.cancel_pre_playback_response_on_continuation,
      turn_detection: studyConfig.turn_detection,
      latest_applied_session: latestAppliedSessionSettings,
    },
    pacing: {
      configured: studyConfig.pacing,
      topic_started_at:
        topicStartedAtMilliseconds === null
          ? null
          : new Date(topicStartedAtMilliseconds).toISOString(),
      elapsed_seconds_at_end: pacingElapsedSeconds(),
      response_batches: participantResponseBatchCount,
      exploration_hold_sent: pacingHoldSent,
      synthesis_release_sent: pacingReleaseSent,
      convergence_control_sent: pacingConvergenceSent,
      closure_gate_control_sent: pacingClosureGateSent,
      upper_bound_control_sent: pacingMaximumSent,
    },
    session: {
      started_at: sessionStartedAt,
      ended_at: sessionEndedAt,
      duration_ms: durationMilliseconds,
      manual_stop: manualStopRequested,
      established: sessionWasEstablished,
      programmed_opening: activeScenarioProfile.opening,
      closure_gate: studyConfig.closure_gate,
      closure_gate_detected: closureGateDetected,
      exact_closing: studyConfig.exact_closing,
      exact_closing_detected: exactClosingDetected,
      post_closing_farewell: studyConfig.post_closing_farewell,
      controller_final_closing_delivered: finalClosingDelivered,
      post_closing_farewell_delivered: postClosingFarewellDelivered,
    },
    artifacts: {
      audio_filename: recordingResult.filename,
      transcript_filename: textResult ? textResult.filename : null,
    },
    events: eventRecords.slice(),
    turns,
    failures: eventRecords.filter((entry) => entry.type === "failure"),
  };
}

async function saveEventLog(recordingResult, textResult) {
  const payload = buildEventLog(recordingResult, textResult);
  const response = await fetch("/event-logs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Recording-Stem": recordingResult.recording_stem,
    },
    body: JSON.stringify(payload, null, 2) + "\n",
  });
  const responseBody = await response.text();
  let result = {};
  try {
    result = JSON.parse(responseBody);
  } catch (_) {
    result = {};
  }
  if (!response.ok) {
    throw new Error(
      result.error || "Event log upload failed (HTTP " + response.status + ").",
    );
  }
  diagnosticLog(
    "Event log saved as " +
      result.filename +
      " (" +
      result.bytes +
      " bytes).",
  );
  return result;
}

async function waitForConversationToSettle(timeoutMilliseconds) {
  const timeout = timeoutMilliseconds || 8000;
  const startedAt = Date.now();
  let idleSince = null;
  while (Date.now() - startedAt < timeout) {
    const transcriptPending = Array.from(transcriptItems.values()).some(
      (record) => record.pending,
    );
    const isIdle =
      !speechInProgress &&
      !responseInProgress &&
      !assistantAudioPlaying &&
      !openingPlaybackPending &&
      responseGraceTimer === null &&
      !queuedParticipantResponses.length &&
      pendingTranscriptionItemIds.size === 0 &&
      !transcriptPending;
    if (isIdle) {
      if (idleSince === null) idleSince = Date.now();
      if (Date.now() - idleSince >= 500) return true;
    } else {
      idleSince = null;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
  diagnosticLog(
    "Timed out while waiting for final Realtime events; saving available text.",
  );
  recordEvent("failure", {
    stage: "settle_timeout",
    message: "Final asynchronous events did not settle within eight seconds.",
  });
  return false;
}

function validateParticipantId() {
  const participantId = participantIdInput.value.trim();
  if (!participantIdPattern.test(participantId)) {
    participantIdInput.setCustomValidity(
      "Use 1–64 English letters, numbers, underscores, or hyphens. Start with a letter or number.",
    );
    participantIdInput.reportValidity();
    participantIdInput.focus();
    return null;
  }
  participantIdInput.setCustomValidity("");
  return participantId;
}

function renderInstructionBody(element, instruction) {
  const body = String((instruction && instruction.body) || "");
  const emphasis = String((instruction && instruction.emphasis) || "");
  if (!emphasis || !body.includes(emphasis)) {
    element.textContent = body;
    return;
  }

  const emphasisStart = body.indexOf(emphasis);
  const before = document.createElement("span");
  before.textContent = body.slice(0, emphasisStart);
  const strong = document.createElement("strong");
  strong.textContent = emphasis;
  const after = document.createElement("span");
  after.textContent = body.slice(emphasisStart + emphasis.length);
  element.replaceChildren(before, strong, after);
}

function selectedValue(inputs) {
  const selected = inputs.find((input) => input.checked);
  return selected ? selected.value : null;
}

function prepareParticipantView() {
  if (!studyConfig) return;
  const participantId = validateParticipantId();
  if (!participantId) return;

  const assistantMode = selectedValue(modeInputs);
  const scenario = selectedValue(scenarioInputs);
  if (!assistantMode || !studyConfig.modes[assistantMode]) {
    setupStatusElement.textContent = "Select a conversation route.";
    return;
  }
  if (!scenario || !studyConfig.scenarios[scenario]) {
    setupStatusElement.textContent = "Select a scenario.";
    return;
  }

  activeParticipantId = participantId;
  activeAssistantMode = assistantMode;
  activeScenario = scenario;
  activeModeProfile = studyConfig.modes[assistantMode];
  activeScenarioProfile = studyConfig.scenarios[scenario];
  const instruction =
    activeScenarioProfile.participant_instructions[activeAssistantMode];

  participantInstructionHeading.textContent = instruction.title;
  renderInstructionBody(participantInstructionBody, instruction);
  participantStarter.textContent = instruction.starter || "";
  participantStarter.hidden = !instruction.starter;
  conversationInstructionHeading.textContent = instruction.title;
  renderInstructionBody(conversationInstructionBody, instruction);
  conversationStarter.textContent = instruction.starter || "";
  conversationStarter.hidden = !instruction.starter;
  setupStatusElement.textContent = "Participant view prepared.";
  showView(participantInstructionView);
}

function backToResearcherSetup() {
  showView(researcherView);
  setupStatusElement.textContent = "Session configuration is ready.";
}

async function startSession() {
  if (
    !studyConfig ||
    !activeParticipantId ||
    !activeAssistantMode ||
    !activeScenario
  ) {
    backToResearcherSetup();
    setupStatusElement.textContent = "Prepare the participant view again.";
    return;
  }

  sessionWasEstablished = false;
  isStopping = false;
  openingRequested = false;
  openingInProgress = false;
  openingPlaybackPending = false;
  responseInProgress = false;
  activeResponseId = null;
  activeResponseKind = null;
  activeParticipantResponseRequests = [];
  continuationResponseCancelPending = false;
  continuationCancelResponseId = null;
  continuationCancelSequence = 0;
  queuedParticipantResponses = [];
  responseRequestedItemIds.clear();
  pendingTranscriptionItemIds.clear();
  speechInProgress = false;
  assistantAudioPlaying = false;
  cancelResponseGraceTimer("session_reset");
  topicStartedAtMilliseconds = null;
  participantResponseBatchCount = 0;
  pacingHoldSent = false;
  pacingReleaseSent = false;
  pacingConvergenceSent = false;
  pacingClosureGateSent = false;
  pacingMaximumSent = false;
  lastAssistantTurnHadClosureGate = false;
  finalClosingDelivered = false;
  farewellPlaybackPending = false;
  postClosingFarewellDelivered = false;
  participantInstructionPending = true;
  manualStopRequested = false;
  sessionStartedAt = new Date().toISOString();
  sessionEndedAt = null;
  latestSaveSummary = "";
  latestAppliedSessionSettings = null;
  clearConversationDisplay();
  setSetupControlsDisabled(true);
  startButton.disabled = true;
  stopButton.hidden = false;
  stopButton.disabled = true;
  returnButton.hidden = true;
  voiceOrb.classList.add("idle");
  conversationInstruction.hidden = false;
  showView(conversationView);
  showParticipantStatus("Starting…");
  setStatus("Requesting microphone access…");
  setRecordingStatus("Preparing the recording…");
  recordEvent("session_start_requested", {
    scenario: activeScenario,
    route: activeAssistantMode,
    prompt_version: studyConfig.prompt_version,
    controller_version: studyConfig.controller_version,
  });
  diagnosticLog(
    "Starting " +
      activeScenarioProfile.label +
      " / " +
      activeModeProfile.label +
      " session.",
  );

  try {
    if (
      !window.isSecureContext ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      throw new Error(
        "This page is not a secure context. Use localhost on this computer or trusted HTTPS on iPad.",
      );
    }

    microphoneStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    setMicrophoneEnabled(false);
    await startRecording(microphoneStream);

    setStatus("Connecting to Nomi…");
    peerConnection = new RTCPeerConnection();
    peerConnection.addEventListener("connectionstatechange", () => {
      const connectionState = peerConnection
        ? peerConnection.connectionState
        : "closed";
      diagnosticLog("WebRTC: " + connectionState);
      recordEvent("webrtc_connection_state", { state: connectionState });
      if (isStopping) return;
      if (connectionState === "connected" && !openingRequested) {
        setStatus("Connected. Preparing Nomi’s greeting…");
      } else if (["failed", "disconnected"].includes(connectionState)) {
        setStatus("Connection interrupted. Please end the conversation.");
        showParticipantStatus(
          "Connection interrupted. Please return the device to the researcher.",
        );
      }
    });

    peerConnection.addEventListener("track", async (event) => {
      const remoteStream =
        event.streams[0] || new MediaStream([event.track]);
      remoteAudio.srcObject = remoteStream;
      attachRemoteRecordingStream(remoteStream);
      try {
        await remoteAudio.play();
      } catch (error) {
        diagnosticLog("Audio autoplay failed: " + error.message);
        recordEvent("failure", {
          stage: "audio_autoplay",
          message: error.message,
        });
      }
    });

    for (const track of microphoneStream.getAudioTracks()) {
      peerConnection.addTrack(track, microphoneStream);
    }

    dataChannel = peerConnection.createDataChannel("oai-events");
    dataChannel.addEventListener("open", () => {
      diagnosticLog("Realtime data channel opened.");
      recordEvent("data_channel_opened");
      if (!isStopping) requestOpeningMessage();
    });
    dataChannel.addEventListener("close", () => {
      diagnosticLog("Realtime data channel closed.");
      recordEvent("data_channel_closed");
    });
    dataChannel.addEventListener("message", (message) => {
      try {
        handleRealtimeEvent(JSON.parse(message.data));
      } catch (error) {
        diagnosticLog("Could not parse a server event: " + error.message);
        recordEvent("failure", {
          stage: "event_parse",
          message: error.message,
        });
      }
    });

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await waitForIceGatheringComplete(peerConnection);

    const response = await fetch("/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/sdp",
        "X-Assistant-Mode": activeAssistantMode,
        "X-Conversation-Scenario": activeScenario,
      },
      body: peerConnection.localDescription.sdp,
    });
    const responseBody = await response.text();
    if (!response.ok) {
      let message = responseBody;
      try {
        message = JSON.parse(responseBody).error || responseBody;
      } catch (_) {
        // Preserve the plain-text response.
      }
      throw new Error(
        message || "Session setup failed (HTTP " + response.status + ").",
      );
    }

    await peerConnection.setRemoteDescription({
      type: "answer",
      sdp: responseBody,
    });
    sessionWasEstablished = true;
    stopButton.disabled = false;
    recordEvent("session_established");
  } catch (error) {
    const message = error.message || String(error);
    diagnosticLog(message);
    recordEvent("failure", { stage: "session_start", message });
    await stopSession({
      saveRecording: false,
      finalStatus: "Connection failed: " + message,
      participantFinalStatus:
        "Unable to start. Please return the device to the researcher.",
      manualStop: false,
    });
  }
}

async function stopSession(options) {
  const settings = options || {};
  const saveRecording =
    settings.saveRecording === undefined ? true : settings.saveRecording;
  const finalStatus = settings.finalStatus || "Conversation complete.";
  const participantFinalStatus =
    settings.participantFinalStatus ||
    "Conversation complete. Please return the device to the researcher.";
  const manualStop =
    settings.manualStop === undefined ? false : settings.manualStop;

  if (isStopping) return;
  isStopping = true;
  manualStopRequested = manualStop;
  startButton.disabled = true;
  stopButton.disabled = true;
  returnButton.hidden = true;
  participantInstructionPending = false;
  conversationInstruction.hidden = true;
  const discardedQueuedItems = queuedParticipantResponses.length;
  queuedParticipantResponses = [];
  cancelResponseGraceTimer("session_stopping");

  if (manualStop) {
    recordEvent("manual_stop_requested", {
      discarded_queued_participant_items: discardedQueuedItems,
    });
  }
  const shouldSave = saveRecording && sessionWasEstablished;
  let audioResult = null;
  let textResult = null;
  let eventResult = null;
  let audioError = null;
  let textError = null;
  let eventError = null;

  setMicrophoneEnabled(false);
  if (shouldSave) {
    showParticipantStatus("Saving conversation…");
    setStatus("Finishing the current turn and saving…");
    setRecordingStatus("Please keep this page open.");
    await waitForConversationToSettle(8000);
  }

  sessionEndedAt = new Date().toISOString();
  recordEvent("session_ended", {
    manual_stop: manualStopRequested,
    will_save: shouldSave,
  });

  try {
    audioResult = await finishRecording(shouldSave);
  } catch (error) {
    audioError = error;
    diagnosticLog(
      "Audio recording save failed: " + (error.message || String(error)),
    );
    recordEvent("failure", {
      stage: "audio_save",
      message: error.message || String(error),
    });
  }

  if (audioResult) {
    try {
      textResult = await saveTextLog(audioResult);
    } catch (error) {
      textError = error;
      diagnosticLog(
        "Text log save failed: " + (error.message || String(error)),
      );
      recordEvent("failure", {
        stage: "transcript_save",
        message: error.message || String(error),
      });
    }

    try {
      eventResult = await saveEventLog(audioResult, textResult);
    } catch (error) {
      eventError = error;
      diagnosticLog(
        "Event log save failed: " + (error.message || String(error)),
      );
    }
  }

  if (dataChannel) dataChannel.close();
  if (peerConnection) peerConnection.close();
  if (microphoneStream) {
    for (const track of microphoneStream.getTracks()) track.stop();
  }
  remoteAudio.srcObject = null;
  dataChannel = null;
  peerConnection = null;
  microphoneStream = null;
  setSetupControlsDisabled(false);
  startButton.disabled = false;
  stopButton.hidden = true;
  returnButton.hidden = false;
  voiceOrb.classList.add("idle");

  if (audioResult && textResult && eventResult) {
    latestSaveSummary =
      "Audio_Record/" +
      audioResult.filename +
      ", Txt_Log/" +
      textResult.filename +
      ", Event_Log/" +
      eventResult.filename;
    setRecordingStatus("Audio, transcript, and study log saved.");
    setStatus(finalStatus);
    showParticipantStatus(participantFinalStatus);
  } else if (audioResult) {
    const failedParts = [];
    if (textError) failedParts.push("transcript");
    if (eventError) failedParts.push("study log");
    latestSaveSummary =
      "Saved Audio_Record/" +
      audioResult.filename +
      "; failed: " +
      failedParts.join(", ");
    setRecordingStatus("Audio saved, but one or more logs failed.");
    setStatus("Conversation ended with a partial save.");
    showParticipantStatus(
      "Conversation ended. Please return the device to the researcher.",
    );
  } else if (audioError) {
    latestSaveSummary =
      "Conversation files were not saved: " +
      (audioError.message || String(audioError));
    setRecordingStatus("Conversation files were not saved.");
    setStatus("Conversation ended, but the recording could not be saved.");
    showParticipantStatus(
      "Saving was incomplete. Please return the device to the researcher.",
    );
  } else if (!shouldSave) {
    latestSaveSummary = "No conversation files were saved.";
    setStatus(finalStatus);
    setRecordingStatus("No recording was saved.");
    showParticipantStatus(participantFinalStatus);
  }

  sessionWasEstablished = false;
  openingInProgress = false;
  openingPlaybackPending = false;
  responseInProgress = false;
  activeResponseId = null;
  activeResponseKind = null;
  activeParticipantResponseRequests = [];
  continuationResponseCancelPending = false;
  continuationCancelResponseId = null;
  queuedParticipantResponses = [];
  responseRequestedItemIds.clear();
  pendingTranscriptionItemIds.clear();
  speechInProgress = false;
  assistantAudioPlaying = false;
  cancelResponseGraceTimer("session_finished");
  topicStartedAtMilliseconds = null;
  participantResponseBatchCount = 0;
  pacingHoldSent = false;
  pacingReleaseSent = false;
  pacingConvergenceSent = false;
  pacingClosureGateSent = false;
  pacingMaximumSent = false;
  lastAssistantTurnHadClosureGate = false;
  finalClosingDelivered = false;
  farewellPlaybackPending = false;
  postClosingFarewellDelivered = false;
  participantInstructionPending = false;
  latestAppliedSessionSettings = null;
  isStopping = false;
}

function returnToResearcherSetup() {
  savedFilesSummary.textContent = latestSaveSummary;
  researcherResults.hidden = !latestSaveSummary;
  setupStatusElement.textContent = latestSaveSummary
    ? "Review the saved session below or configure the next participant."
    : "Session configuration is ready.";
  showView(researcherView);
}

function releaseMediaImmediately() {
  if (dataChannel) dataChannel.close();
  if (peerConnection) peerConnection.close();
  if (microphoneStream) {
    for (const track of microphoneStream.getTracks()) track.stop();
  }
}

async function loadStudyConfig() {
  try {
    const response = await fetch("/study-config", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(
        "Study configuration request failed (HTTP " + response.status + ").",
      );
    }
    const config = await response.json();
    if (
      !config ||
      !config.assistant ||
      !config.modes ||
      !config.pacing ||
      !Number.isFinite(config.pacing.minimum_synthesis_elapsed_seconds) ||
      !Number.isFinite(config.pacing.minimum_response_batches) ||
      !Number.isFinite(config.pacing.convergence_elapsed_seconds) ||
      !Number.isFinite(config.pacing.closure_gate_elapsed_seconds) ||
      !Number.isFinite(config.pacing.maximum_elapsed_seconds) ||
      typeof config.closure_gate !== "string" ||
      !config.closure_gate.trim() ||
      typeof config.exact_closing !== "string" ||
      !config.exact_closing.trim() ||
      !config.scenarios ||
      !config.scenarios.trip ||
      !config.scenarios.end_of_day
    ) {
      throw new Error("The study configuration is incomplete.");
    }
    studyConfig = config;
    prepareButton.disabled = false;
    prepareButton.textContent = "Prepare participant view";
    setupStatusElement.textContent =
      "Ready · " +
      config.assistant.name +
      " · " +
      config.assistant.voice +
      " · prompt " +
      config.prompt_version;
  } catch (error) {
    prepareButton.disabled = true;
    prepareButton.textContent = "Configuration unavailable";
    setupStatusElement.textContent =
      "Could not load the local study configuration: " +
      (error.message || String(error));
  }
}

participantIdInput.addEventListener("input", () => {
  participantIdInput.setCustomValidity("");
});
prepareButton.addEventListener("click", prepareParticipantView);
backButton.addEventListener("click", backToResearcherSetup);
startButton.addEventListener("click", startSession);
stopButton.addEventListener("click", () => {
  stopSession({ manualStop: true });
});
returnButton.addEventListener("click", returnToResearcherSetup);
window.addEventListener("beforeunload", (event) => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    event.preventDefault();
    event.returnValue = "";
  }
});
window.addEventListener("pagehide", releaseMediaImmediately);

loadStudyConfig();
