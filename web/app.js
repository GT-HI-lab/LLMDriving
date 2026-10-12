"use strict";

const researcherView = document.querySelector("#researcherView");
const participantInstructionView = document.querySelector(
  "#participantInstructionView",
);
const conversationView = document.querySelector("#conversationView");
const participantIdInput = document.querySelector("#participantId");
const modeInputs = Array.from(
  document.querySelectorAll('input[name="assistantMode"]'),
);
const orderInputs = Array.from(
  document.querySelectorAll('input[name="taskOrder"]'),
);
const orderOneLabel = document.querySelector("#orderOneLabel");
const orderTwoLabel = document.querySelector("#orderTwoLabel");
const researcherTestModeInput = document.querySelector("#researcherTestMode");
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
const taskProgressElement = document.querySelector("#taskProgress");
const preparationStatusElement = document.querySelector("#preparationStatus");
const conversationInstruction = document.querySelector(
  "#conversationInstruction",
);
const conversationTaskProgress = document.querySelector(
  "#conversationTaskProgress",
);
const conversationInstructionHeading = document.querySelector(
  "#conversationInstructionHeading",
);
const conversationInstructionBody = document.querySelector(
  "#conversationInstructionBody",
);
const researcherResults = document.querySelector("#researcherResults");
const savedFilesSummary = document.querySelector("#savedFilesSummary");
const transcriptElement = document.querySelector("#transcript");
const eventLogElement = document.querySelector("#eventLog");
const voiceOrb = document.querySelector("#voiceOrb");
const preparationOrb = document.querySelector("#preparationOrb");
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
let remoteMediaStream = null;
let activeParticipantId = "";
let activeAssistantMode = "";
let activeOrderId = "";
let activeTaskSequence = [];
let activeTaskIndex = 0;
let activeTaskId = "";
let activeModeProfile = null;
let activeTaskProfile = null;
let activeResearcherTestMode = false;
let activePreparationSkipped = false;
let sessionWasEstablished = false;
let isStopping = false;
let isPreparationSession = false;
let transitionPlaybackPending = false;
let preparationTimerId = null;
let preparationStartedAt = null;
let preparationReadyAt = null;
let taskTransitionTiming = null;
let savedTaskSummaries = [];
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
let conversationEndedAtMilliseconds = null;
let pacingTimerId = null;
let lastConversationActivityAt = 0;
let endingStage = "exploring";
let endingAnswerAfterBatch = 0;
let pendingEndingPlayback = new Map();
let completedAudioResponses = new Set();
let audioPlaybackEndedAt = new Map();
let cancelledAudioResponses = new Set();
let responseControls = new Map();
let issuedResponseControl = null;
let pendingControlledResponse = null;
let closingAuthorized = false;
let closingResponseId = null;
let closingReason = null;
let closingPreviousStage = "exploring";
let closingAcknowledgment = "";
let closingAcknowledgmentDelivered = false;
let acknowledgmentRetryCount = 0;
let affectiveFollowupCount = 0;
let pendingAffectiveFollowupResponseId = null;
let countedFollowupResponses = new Set();
let countedFollowupQuestions = new Set();
let leavesCandidateOffered = false;
let leavesWrapupChoiceDelivered = false;
let listeningRepair = null;
let repairSpeech = new Map();
let deliveredAssistantText = "";
let responseSpeech = new Map();
let finishedResponses = new Set();
let closingRetryCount = 0;
let closingRecoveryHandled = new Set();
let handledStudyCalls = new Set();
let currentControlItemId = null;
let controlItemSequence = 0;
let unclearAnswerItemIds = new Set();

const STUDY_PROGRESS_TOOL = {
  type: "function",
  name: "study_progress",
  description: "Silently request a study stage transition after the participant has answered. Never accompany this call with speech. The browser validates and issues the next response.",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["check_answered", "finish", "stop", "repair_needed"] },
      reason: { type: "string", enum: ["completed", "participant_stop", "discomfort"] },
      evidence: { type: "string", description: "Brief evidence in the latest participant reply that this step is complete or they want to stop; a yes to sharing more is NOT completion." },
      acknowledgment: { type: "string", description: "Required for finish/stop: a non-empty response of at most 40 words. Respond specifically to additional substantive sharing after the final invitation; generic thanks alone is insufficient for that content. If nothing more to add, a brief Okay is sufficient in either condition. In Affective, do not summarize the memory or add a retrospective reflection after no/nothing else. The fixed Affective closing already thanks them for sharing. For stop, briefly respect the boundary. No question or closing phrase. Empty allowed only for check_answered/repair_needed." },
    },
    required: ["action", "reason", "evidence", "acknowledgment"],
    additionalProperties: false,
  },
};
let pacingHoldSent = false;
let pacingReleaseSent = false;
let pacingConvergenceSent = false;
let pacingFinalizationSent = false;
let pacingMaximumSent = false;
let finalClosingDelivered = false;
let finalClosingPlaybackPending = false;
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

function currentTaskPosition() {
  return activeTaskIndex + 1;
}

function currentExactClosing() {
  if (!studyConfig || !studyConfig.closings) return "";
  if (activeAssistantMode === "affective") return studyConfig.affective_closing;
  return currentTaskPosition() === 1
    ? studyConfig.closings.task_one
    : studyConfig.closings.task_two;
}

function clearPreparationTimer() {
  if (preparationTimerId !== null) {
    window.clearTimeout(preparationTimerId);
    preparationTimerId = null;
  }
}

function beginPreparationWindow(trigger) {
  clearPreparationTimer();
  const seconds = Number(studyConfig && studyConfig.preparation_seconds) || 60;
  preparationStartedAt = new Date().toISOString();
  preparationReadyAt = null;
  activePreparationSkipped = activeResearcherTestMode;
  startButton.disabled = true;
  startButton.textContent = "Take a moment to think";
  preparationStatusElement.textContent =
    "Take one minute to think before you begin.";

  if (activeResearcherTestMode) {
    preparationReadyAt = new Date().toISOString();
    startButton.disabled = false;
    startButton.textContent = "Start conversation with Buzz";
    preparationStatusElement.textContent =
      "Researcher test mode: start when you are ready.";
  } else {
    preparationTimerId = window.setTimeout(() => {
      preparationTimerId = null;
      preparationReadyAt = new Date().toISOString();
      startButton.disabled = false;
      startButton.textContent = "Start conversation with Buzz";
      preparationStatusElement.textContent =
        "When you are ready, start the conversation with Buzz.";
    }, seconds * 1000);
  }
  if (eventRecords.length) {
    recordEvent("preparation_started", {
      trigger,
      configured_seconds: seconds,
      required_seconds: activeResearcherTestMode ? 0 : seconds,
      researcher_test_mode: activeResearcherTestMode,
      skipped: activePreparationSkipped,
      task_id: activeTaskId,
      task_position: currentTaskPosition(),
    });
  }
}

function updateTaskOrderOptions() {
  if (!studyConfig) return;
  const assistantMode = selectedValue(modeInputs) || "cognitive";
  const modeProfile = studyConfig.modes[assistantMode];
  const orders = (modeProfile && modeProfile.orders) || [];
  if (orders.length !== 2) return;
  orderOneLabel.textContent = orders[0].label;
  orderTwoLabel.textContent = orders[1].label;
}

function selectActiveTask(taskIndex) {
  activeTaskIndex = taskIndex;
  activeTaskId = activeTaskSequence[activeTaskIndex] || "";
  activeTaskProfile = studyConfig && studyConfig.tasks[activeTaskId];
  if (!activeTaskProfile) {
    throw new Error("The selected task configuration is unavailable.");
  }
}

function renderActiveTaskPreparation() {
  const instruction = activeTaskProfile.participant_instruction;
  const progressText =
    "Activity " + currentTaskPosition() + " of " + activeTaskSequence.length;
  taskProgressElement.textContent = progressText;
  conversationTaskProgress.textContent = progressText;
  participantInstructionHeading.textContent = instruction.title;
  renderInstructionBody(participantInstructionBody, instruction);
  conversationInstructionHeading.textContent = instruction.title;
  renderInstructionBody(conversationInstructionBody, instruction, true);
  backButton.hidden = currentTaskPosition() !== 1;
  conversationInstruction.hidden = false;
  showView(participantInstructionView);
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
  for (const input of modeInputs) input.disabled = disabled;
  for (const input of orderInputs) input.disabled = disabled;
  researcherTestModeInput.disabled = disabled;
}

function hideConversationInstruction(trigger, itemId) {
  participantInstructionPending = false;
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
  cancelledAudioResponses.add(activeResponseId);
  pendingEndingPlayback.delete(activeResponseId);
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
  if (closingAuthorized) {
    closingAuthorized = false;
    closingResponseId = null;
    closingReason = null;
    closingAcknowledgment = "";
    closingAcknowledgmentDelivered = false;
    finalClosingDelivered = false;
    finalClosingPlaybackPending = false;
    endingStage = closingPreviousStage;
    pendingControlledResponse = null;
    recordEvent("closing_reopened_for_continuation", { ending_stage: endingStage });
  }
  const restoredItemCount =
    requeueActiveParticipantRequestsForContinuation();
  if (activeParticipantResponseRequests.length && participantResponseBatchCount > 0) {
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
    Math.floor(((conversationEndedAtMilliseconds || Date.now()) - topicStartedAtMilliseconds) / 1000),
  );
}

function effectivePacingConfig() {
  const base = (studyConfig && studyConfig.pacing) || {};
  const overrides =
    base.condition_overrides &&
    base.condition_overrides[activeAssistantMode];
  const { condition_overrides: _conditionOverrides, ...defaults } = base;
  return overrides ? { ...defaults, ...overrides } : defaults;
}

function clearPacingTimer() {
  if (pacingTimerId !== null) window.clearTimeout(pacingTimerId);
  pacingTimerId = null;
}

function resetEndingController() {
  clearPacingTimer();
  conversationEndedAtMilliseconds = null;
  lastConversationActivityAt = Date.now();
  endingStage = "exploring";
  endingAnswerAfterBatch = 0;
  pendingEndingPlayback.clear();
  completedAudioResponses.clear();
  audioPlaybackEndedAt.clear();
  cancelledAudioResponses.clear();
  responseControls.clear();
  issuedResponseControl = null;
  pendingControlledResponse = null;
  closingAuthorized = false;
  closingResponseId = null;
  closingReason = null;
  closingPreviousStage = "exploring";
  closingAcknowledgment = "";
  closingAcknowledgmentDelivered = false;
  acknowledgmentRetryCount = 0;
  affectiveFollowupCount = 0;
  pendingAffectiveFollowupResponseId = null;
  countedFollowupResponses.clear();
  countedFollowupQuestions.clear();
  leavesCandidateOffered = false;
  leavesWrapupChoiceDelivered = false;
  listeningRepair = null;
  deliveredAssistantText = "";
  responseSpeech.clear();
  finishedResponses.clear();
  closingRetryCount = 0;
  closingRecoveryHandled.clear();
  repairSpeech.clear();
  handledStudyCalls.clear();
  currentControlItemId = null;
  controlItemSequence = 0;
  unclearAnswerItemIds.clear();
}

function startConversationClock() {
  if (topicStartedAtMilliseconds !== null || isPreparationSession || transitionPlaybackPending) return;
  topicStartedAtMilliseconds = Date.now();
  lastConversationActivityAt = Date.now();
  recordEvent("topic_discussion_started", { clock_basis: "task_opening_audio_started" });
  pacingTick();
}

function pacingTick() {
  clearPacingTimer();
  if (isStopping || topicStartedAtMilliseconds === null || conversationEndedAtMilliseconds !== null) return;
  sendPacingControlIfNeeded();
  // A natural idle pause may start the final invitation, but never answer it.
  if (endingStage === "need_check" && !listeningRepair && !participantResponseBlockers().length &&
      !queuedParticipantResponses.length && Date.now() - lastConversationActivityAt >= 8000) {
    requestControlledResponse("ending_check");
  }
  pacingTimerId = window.setTimeout(pacingTick, 1000);
}

function sendHiddenControl(text) {
  // Keep only the current stage instruction; stale system messages conflicted
  // with closing authorization in the October 4 pilots.
  if (currentControlItemId) {
    dataChannel.send(JSON.stringify({ type: "conversation.item.delete", item_id: currentControlItemId }));
  }
  currentControlItemId = "study_control_" + (++controlItemSequence);
  dataChannel.send(JSON.stringify({
    type: "conversation.item.create",
    item: { id: currentControlItemId, type: "message", role: "system", content: [{ type: "input_text", text }] },
  }));
}

function sendPacingControlIfNeeded() {
  const pacing = effectivePacingConfig();
  if (!dataChannel || dataChannel.readyState !== "open" || topicStartedAtMilliseconds === null) return;
  const elapsedSeconds = pacingElapsedSeconds();
  if (elapsedSeconds >= pacing.finalization_elapsed_seconds && endingStage === "exploring" &&
      affectiveFollowupsReady()) {
    endingStage = "need_check";
  }
  let state;
  if (elapsedSeconds >= pacing.maximum_elapsed_seconds && !pacingMaximumSent) {
    pacingMaximumSent = true;
    state = "upper_bound_reached";
  } else if (elapsedSeconds >= pacing.finalization_elapsed_seconds && !pacingFinalizationSent) {
    pacingFinalizationSent = true;
    pacingReleaseSent = true;
    state = "finalization_required";
  } else if (elapsedSeconds >= pacing.convergence_elapsed_seconds && !pacingConvergenceSent) {
    pacingConvergenceSent = true;
    state = "convergence_required";
  } else if (!pacingHoldSent) {
    pacingHoldSent = true;
    state = "exploration_required";
  }
  if (!state) return;
  recordEvent("study_pacing_control_sent", {
    state, elapsed_seconds: elapsedSeconds, response_batch: participantResponseBatchCount,
    minimum_elapsed_seconds: pacing.minimum_synthesis_elapsed_seconds,
    minimum_response_batches: pacing.minimum_response_batches,
    convergence_elapsed_seconds: pacing.convergence_elapsed_seconds,
    finalization_elapsed_seconds: pacing.finalization_elapsed_seconds,
    maximum_elapsed_seconds: pacing.maximum_elapsed_seconds,
    ending_stage: endingStage,
    overrun_reason: state === "upper_bound_reached"
      ? (speechInProgress ? "participant_speaking" : pendingTranscriptionItemIds.size
        ? "transcription_pending" : assistantAudioPlaying ? "assistant_playback" : endingStage)
      : null,
  });
  // The timer only changes local state; the latest instruction is sent immediately
  // before a response, never by forcing a response during speech/transcription.
}

function affectiveFollowupsReady() {
  const minimum = studyConfig && studyConfig.affective_followups
    ? studyConfig.affective_followups.minimum : 2;
  return activeAssistantMode !== "affective" ||
    (affectiveFollowupCount >= minimum && pendingAffectiveFollowupResponseId === null);
}

// Playback is essential: generated/cancelled speech never counts. These rules
// conservatively recognize questions; prompt fidelity still needs live review.
function commitAffectiveFollowupPlayback(responseId) {
  const control = responseControls.get(responseId);
  if (activeAssistantMode !== "affective" || !control || control.kind !== "participant_reply" ||
      control.repairBatch !== null || control.stage !== "exploring" ||
      countedFollowupResponses.has(responseId) || cancelledAudioResponses.has(responseId) ||
      !completedAudioResponses.has(responseId) || !responseSpeech.has(responseId)) return;
  const text = responseSpeech.get(responseId);
  const normalized = normalizeSpeech(text);
  const scripted = [studyConfig.affective_final_check, studyConfig.cognitive_completeness_check,
    currentExactClosing()].filter(Boolean).some(s => normalized.includes(normalizeSpeech(s)));
  if (scripted || (!/[?]/.test(text) && !/\btell me more about\b/.test(normalized)) ||
      /\b(?:repeat|say that again|what do you mean|did you say|is that what you|did i understand|want to stop|want to skip|need a break|anything else)\b/.test(normalized)) return;
  const questions = (text.match(/[^.!?]*\?/g) || [text]).map(normalizeSpeech).join(" ");
  if (countedFollowupQuestions.has(questions)) return;
  countedFollowupResponses.add(responseId);
  countedFollowupQuestions.add(questions);
  affectiveFollowupCount += 1;
  pendingAffectiveFollowupResponseId = responseId;
  recordEvent("affective_followup_playback_completed", {
    response_id: responseId, followup_count: affectiveFollowupCount,
    recognition: "delivered_question_excluding_scripted_and_repair_turns",
  });
}

function validClosingAcknowledgment(text) {
  return typeof text === "string" && text.trim().length > 0 && countWords(text) <= 40 &&
    !/[?]/.test(text) &&
    !normalizeSpeech(text).includes(normalizeSpeech(currentExactClosing()));
}

function commitClosingAcknowledgmentPlayback(responseId) {
  if (closingAuthorized && responseId === closingResponseId && closingAcknowledgment &&
      completedAudioResponses.has(responseId) && !cancelledAudioResponses.has(responseId) &&
      responseSpeech.has(responseId) &&
      normalizeSpeech(responseSpeech.get(responseId)).startsWith(normalizeSpeech(closingAcknowledgment))) {
    closingAcknowledgmentDelivered = true;
  }
}

// Detection starts a conservative listening hold; it never decides that an
// answer was delivered or resolved. Playback + a later participant turn do that.
function requiresListeningRepair(text) {
  const raw = String(text || "");
  const normalized = normalizeSpeech(raw);
  return /[?]/.test(raw) ||
    /^(?:wait\b|so (?:you|you're|you are)|(?:why|how|what|when|where|could|can|would|should|does|do|is|are)\b)/.test(normalized) ||
    /\b(?:not answering|didn't answer|did not answer|haven't answered|not listening|are you listening|doesn't work|does not work|don't understand|do not understand|confused|repeat|say that again|let me think|need more time|hold on|you missed|you misunderstood)\b/.test(normalized);
}

function beginListeningRepair(itemIds, batch, source) {
  listeningRepair = { itemIds: [...itemIds], batch, source, playbackResponseId: null };
  pendingControlledResponse = null;
  recordEvent("listening_repair_required", { participant_item_ids: itemIds, response_batch: batch, source, ending_stage: endingStage });
}

function acceptedHelpOffer(text) {
  const answer = normalizeSpeech(text);
  const offer = normalizeSpeech(deliveredAssistantText);
  return /\b(?:yes|yeah|yep|sure|okay|ok|please|go ahead|sounds good)\b/.test(answer) &&
    !/\b(?:no|not|don't|do not|stop|bye)\b/.test(answer) &&
    /\b(?:i can|we can|shall i|would you like me to|want me to|let me)\b/.test(offer) &&
    /\b(?:help|explain|simplify|smooth|rewrite|rephrase|show|demonstrate|fold|make|put|give|adjust)\b/.test(offer);
}

function commitDeliveredSpeech(responseId) {
  if (completedAudioResponses.has(responseId) && !cancelledAudioResponses.has(responseId) &&
      responseSpeech.has(responseId)) {
    deliveredAssistantText = responseSpeech.get(responseId);
    const choice = studyConfig && studyConfig.leaves_wrapup_choice_question;
    if (activeTaskId === "leaves" && !leavesWrapupChoiceDelivered && choice &&
        normalizeSpeech(deliveredAssistantText).includes(normalizeSpeech(choice))) {
      leavesWrapupChoiceDelivered = true;
      recordEvent("leaves_wrapup_choice_playback_completed", { response_id: responseId });
    }
    commitAffectiveFollowupPlayback(responseId);
    commitClosingAcknowledgmentPlayback(responseId);
  }
}

function updateListeningRepair(requests) {
  const ids = requests.map(r => r.itemId);
  const text = ids.map(id => (transcriptItems.get(id) || {}).text || "").join(" ");
  if (ids.some(id => unclearAnswerItemIds.has(id))) {
    beginListeningRepair(ids, participantResponseBatchCount, "unclear_short_answer");
  } else if (acceptedHelpOffer(text)) {
    beginListeningRepair(ids, participantResponseBatchCount, "accepted_assistant_offer");
  } else if (requiresListeningRepair(text)) {
    beginListeningRepair(ids, participantResponseBatchCount, "participant_question_or_feedback");
  } else if (listeningRepair && listeningRepair.playbackResponseId &&
             participantResponseBatchCount > listeningRepair.batch) {
    recordEvent("listening_repair_followup_received", {
      repair_response_id: listeningRepair.playbackResponseId,
      participant_item_ids: ids,
    });
    // This only releases the mechanical hold. The model must still determine
    // whether the latest reply resolves the question before requesting progress.
    listeningRepair = null;
  }
}

function commitRepairPlayback(responseId) {
  const receipt = repairSpeech.get(responseId);
  if (!listeningRepair || !receipt || receipt.batch !== listeningRepair.batch ||
      cancelledAudioResponses.has(responseId) || !completedAudioResponses.has(responseId)) return;
  listeningRepair.playbackResponseId = responseId;
  recordEvent("listening_repair_playback_completed", { response_id: responseId, repair_batch: receipt.batch });
  repairSpeech.delete(responseId);
}

function leavesWrapupControlText() {
  const common = "Once conceptual questions are resolved, return to building the explanation for the seven-year-old. " +
    "I understand the concept does not mean they chose a child-ready explanation. If they already gave or " +
    "endorsed a sufficient child explanation, or decline this step, no further exercise is needed. " +
    "If they already requested an example, fulfil that request without asking them to choose again. ";
  return common + (leavesWrapupChoiceDelivered
    ? "The example-or-explain choice has already finished playing. Do not routinely repeat it; a requested repeat is allowed. Do not append a rehearsal invitation. "
    : "Otherwise offer these two paths once at wrap-up before giving an unsolicited final example, then wait: " +
      JSON.stringify(studyConfig.leaves_wrapup_choice_question) + " ") +
    "Follow their choice: give a concise example using established ideas, or wait for their own explanation " +
    "and help refine its order, child-understandable words, and causal links. A bare yes is ambiguous between " +
    "the two paths: clarify which they prefer. If they decline both, move on without providing an unwanted " +
    "example. Do not add science by default, force a full rehearsal, or assume approval.";
}

function endingControlText() {
  const elapsed = pacingElapsedSeconds();
  const check = activeAssistantMode === "affective"
    ? studyConfig.affective_final_check : studyConfig.cognitive_completeness_check;
  const beforeCheck = activeAssistantMode === "affective"
    ? "Give their last meaningful answer a natural, specific empathetic response before the invitation. " +
      "For a rich or difficult answer, usually use two brief connected sentences recognizing concrete " +
      "circumstances and their stated experience, not an emotion-word echo. A reflection-only turn is " +
      "allowed: wait for them, then invite sharing when appropriate. Do not repeat an already adequate " +
      "reflection, invent relief/recovery from an action, or add another exploratory question to fill time. " +
      "Respond to their latest sharing; do not summarize the whole memory as an ending step. "
    : activeTaskId === "leaves"
      ? "Before the check, make sure the explanation connects autumn's shorter daylight/cooler conditions, " +
        "changing leaf food-making activity, reduced replacement/breakdown of the green material, and " +
        "visible yellow/orange colors. If a link is missing, help connect it aloud first. A short okay " +
        "or green fades alone does not make an incomplete explanation sufficient. Keep the first support " +
        "response a starting clue, not a complete child-ready answer, even after a long opening. " +
        leavesWrapupControlText() + " "
      : "Acknowledge the latest meaningful reply before the final check, including uncertainty. ";
  const closingResponse = activeAssistantMode === "affective"
    ? "For finish, respond specifically to any additional content shared after the invitation. If they have " +
      "nothing more to add, use a brief Okay before the fixed closing, which thanks them for sharing. Do not " +
      "summarize the memory or add a required retrospective reflection after a decline. Do not repeat a " +
      "previous reflection or duplicate the fixed closing's thanks in the acknowledgment. For stop, respect the boundary briefly. "
    : "Respond to substantive content specifically; if nothing more, Okay is enough. ";
  const common = "[STUDY ENDING CONTROL] Stage: " + endingStage +
    ". Never say the exact closing or a substitute farewell. Use study_progress silently instead; " +
    "do not speak in the same response as a tool call. Stop/discomfort requests override all stages. " +
    "Listening takes priority over every ending stage. If the latest reply asks a question, corrects you, " +
    "or says you did not listen, answer the specific question aloud first and stay at this stage. " +
    "Never claim a repair has happened in a silent tool call. Use repair_needed if a listening hold is needed. " +
    "A yes to your help offer requires you to deliver that help aloud, not finish. " +
    beforeCheck +
    "Every finish/stop call MUST include a short acknowledgment of the latest participant reply, " +
    "at most 40 words. " + closingResponse +
    "It will play with the closing, without another required participant turn. Never leave it empty. " +
    "Do not suggest pausing as a routine ending. Never mention the browser, tool, or waiting for the next step. ";
  if (listeningRepair && listeningRepair.source === "unclear_short_answer") return common +
    "The short reply to your question was unclear. Ask them briefly to repeat their answer. " +
    "Do not interpret it as yes/no or approval. Do not change topic or close.";
  if (listeningRepair) return common +
    "LISTENING HOLD: Fulfil any accepted help offer, answer the latest unresolved question or address the specific complaint now, " +
    "using the conversation history to recover the question you missed. A brief apology alone is not repair. " +
    "Do not ask the completeness check, final rehearsal, or item confirmation; do not call check_answered or finish. " +
    "After the actual answer, wait for the participant without routinely offering further help. " +
    "If they only need time, acknowledge and wait. If they request a repeat, repeat the requested content. " +
    "The four/five-minute clock cannot override this hold.";
  if (endingStage === "need_check") return common +
    "Only when the latest question/concern and the response requirements above are addressed, ask this question, then wait. " +
    "If explanatory support or an empathetic response is still needed, deliver it first. A response-only turn " +
    "may precede the question; wait for the participant and stay here rather than rushing the invitation: " + JSON.stringify(check);
  if (endingStage === "waiting_check") return common + (activeAssistantMode === "affective"
    ? "The sharing invitation has finished playing. Wait for their answer. If they have nothing to add, call finish with a brief Okay; no summary or retrospective reflection is required. If they add content, respond to that content specifically before closing, using the acknowledgment field when appropriate. Do not assume completion from a pause or the clock. The fixed closing thanks them for sharing. A bare yes means they want to share: invite them to continue and wait. If they ask for a repeat or time, help and wait; do not finish. Do not ask new exploratory questions."
    : activeTaskId === "leaves"
      ? "The final completeness check has finished playing. If nothing remains to address, call finish. Fulfil any accepted offer or answer a new question first. If they only report understanding the concept and the child-explanation application above has not happened, follow the example-or-explain choice guidance above and wait; do not claim they are satisfied with an explanation. Do not automatically request a full rehearsal or another check."
      : "The completeness check has finished playing. If there is a question or revision, call repair_needed or answer aloud and wait for a subsequent participant reply. Only when the latest reply actually resolves the check, call check_answered. Do not skip to farewell or request a full rehearsal yet. A repeat/time request does not complete this step.");
  if (endingStage === "need_final") return common + (activeTaskId === "leaves"
    ? "Only with no unresolved question or listening complaint, follow the example-or-explain guidance above and wait; do not force a full rehearsal."
    : "Read exactly the participant's three current canonical item names: To confirm, your final three items are [A], [B], and [C]. Is that right? Then wait. Do not guess missing or uncertain choices; clarify first.");
  if (endingStage === "waiting_final") return common + (activeTaskId === "leaves"
    ? "Follow their selected example-or-explain path. If they explain, respond briefly and include a short factual correction if needed. If they decline, respect that without providing a replacement example or requiring approval. A bare yes to the two-path question requires clarification; do not assume a path or finish."
    : "Only call finish after clear confirmation of the last three items read aloud. If they change an item, restate and reconfirm exactly three. If they ask a question, answer without assuming confirmation. Do not guarantee survival.");
  if (!affectiveFollowupsReady()) return common +
    "AFFECTIVE FOLLOW-UP: " + affectiveFollowupCount + " follow-ups have finished playing. " +
    "For each memory ask at least two substantive follow-ups, usually aim for three, grounded in their story. " +
    "Do not ask the final sharing invitation yet. Respond to their latest answer and continue one useful " +
    "follow-up at a time; never repeat a resolved question to fill a count. The clock is only a target, " +
    "with no fixed overrun cap. Clear refusal/discomfort overrides this minimum at any time. " +
    "A short reply or I don't know alone is not refusal.";
  if (elapsed >= effectivePacingConfig().minimum_synthesis_elapsed_seconds) return common +
    "ENDING WINDOW (target 4–5 minutes): If the topic is sufficiently explored and no request remains, " +
    "respond to the latest answer as described above, then ask this final question once and wait, " +
    "or first use a response-only turn and wait if that better receives what they shared: " + JSON.stringify(check) +
    " Otherwise continue a useful exchange. A long opening story should still receive meaningful engagement. " +
    "Do not fill time, reopen resolved choices, suggest a routine, or offer to stay quiet. " +
    "For Leaves, any useful example or invited rehearsal belongs before this check.";
  return common + "[STUDY PACING CONTROL] " + elapsed +
    " seconds since opening. Continue a useful, non-redundant exchange; do not ask the final check yet. " +
    "Do not announce completion or offer to wait silently. Respond to what they said, not a checklist. " +
    (activeAssistantMode === "affective" ? "Listen without advice or composing messages for them." : "Support reasoning without repeated teach-back.");
}

function currentStudyProgressTool() {
  const tool = JSON.parse(JSON.stringify(STUDY_PROGRESS_TOOL));
  tool.parameters.properties.action.enum = activeTaskId === "island"
    ? ["check_answered", "finish", "stop", "repair_needed"]
    : ["finish", "stop", "repair_needed"];
  return tool;
}

function makeResponseControl(requests, kind) {
  return { stage: endingStage, batch: participantResponseBatchCount,
    itemIds: requests.map((r) => r.itemId), kind, repairBatch: listeningRepair ? listeningRepair.batch : null };
}

function requestControlledResponse(kind, text, sourceControl) {
  if (isStopping || !dataChannel || dataChannel.readyState !== "open") return;
  if (participantResponseBlockers().length || queuedParticipantResponses.length) {
    pendingControlledResponse = { kind, text, sourceControl };
    return;
  }
  pendingControlledResponse = null;
  issuedResponseControl = sourceControl
    ? { ...sourceControl, kind } : makeResponseControl([], kind);
  responseInProgress = true;
  activeResponseKind = "conversation";
  activeParticipantResponseRequests = [];
  const response = { output_modalities: ["audio"], tools: [], tool_choice: "none",
    metadata: { response_kind: "conversation", controller_kind: kind } };
  if (kind === "closing") {
    // Empty input deliberately removes previous conversation/control messages.
    // Keep output in the conversation for existing logging/playback handlers.
    response.input = [];
    response.instructions = programmedSpeechInstructions(text);
  } else if (kind === "closing_acknowledgment") {
    response.tools = [currentStudyProgressTool()];
    response.tool_choice = "auto";
    sendHiddenControl(endingControlText() +
      " Your previous transition had an empty or invalid acknowledgment. Without speaking or asking " +
      "another question, call study_progress again with the same finish/stop intent, a valid reason, " +
      "and an acknowledgment following the mode-specific guidance above. In Affective finish, respond to " +
      "additional content if any; after no/nothing else, use a brief Okay without recapping the memory. Keep it under 40 words, " +
      "without a question or the exact closing phrase. Do not infer a new participant answer.");
  } else {
    sendHiddenControl(endingControlText());
  }
  dataChannel.send(JSON.stringify({ type: "response.create", response }));
  lastConversationActivityAt = Date.now();
  recordEvent("controlled_response_requested", { kind, ending_stage: endingStage });
}

function drainControlledResponse() {
  if (!pendingControlledResponse || participantResponseBlockers().length || queuedParticipantResponses.length) return;
  const next = pendingControlledResponse;
  requestControlledResponse(next.kind, next.text, next.sourceControl);
}

function commitEndingPlayback(responseId) {
  if (cancelledAudioResponses.has(responseId) || !completedAudioResponses.has(responseId) || !pendingEndingPlayback.has(responseId)) return;
  const stage = pendingEndingPlayback.get(responseId);
  pendingEndingPlayback.delete(responseId);
  if (stage === "waiting_candidate") {
    leavesCandidateOffered = true;
    endingStage = "waiting_final";
  } else {
    endingStage = stage;
    if (stage === "waiting_final") leavesCandidateOffered = false;
  }
  endingAnswerAfterBatch = participantResponseBatchCount;
  recordEvent("ending_question_playback_completed", { response_id: responseId, ending_stage: stage });
}

function handleStudyProgress(call, control) {
  if (!call.call_id || handledStudyCalls.has(call.call_id)) return;
  handledStudyCalls.add(call.call_id);
  let args = {};
  try { args = JSON.parse(call.arguments); } catch (_) { /* rejected below */ }
  const freshAnswer = control && control.itemIds.length > 0 &&
    control.batch > endingAnswerAfterBatch && control.stage === endingStage;
  const answerText = control ? normalizeSpeech(control.itemIds.map((id) =>
    (transcriptItems.get(id) || {}).text || "").join(" ")) : "";
  const needsMoreTimeOrRepair = /\b(?:could you repeat|can you repeat|please repeat|say that again|what are you asking|what do you mean|give me a moment|give me a minute|hold on|let me think|can i think|i need more time)\b/.test(answerText);
  const bareYesNeedsContent = /^(?:yes|yeah|yep|sure|yes please|i would|i would like to|yes i would|yes i do|yes i can try)$/.test(answerText) &&
    (activeAssistantMode === "affective" || (activeTaskId === "leaves" && !leavesCandidateOffered));
  const valid = ["check_answered", "finish", "stop", "repair_needed"].includes(args.action) &&
    typeof args.evidence === "string" && args.evidence.trim() &&
    typeof args.acknowledgment === "string";
  const interrupted = speechInProgress || pendingTranscriptionItemIds.size || queuedParticipantResponses.length;
  let accepted = false;
  let acknowledgmentRequired = false;
  if (valid && args.action === "repair_needed" && control && control.itemIds.length && !interrupted) {
    beginListeningRepair(control.itemIds, control.batch, "model_requested");
    dataChannel.send(JSON.stringify({ type: "conversation.item.create", item: {
      type: "function_call_output", call_id: call.call_id,
      output: JSON.stringify({ accepted: true, instruction: "Answer the unresolved question aloud; remain at the same ending stage." }),
    } }));
    pendingControlledResponse = { kind: "listening_repair" };
    recordEvent("study_progress_decision", { action: args.action, accepted: true, ending_stage: endingStage });
    return;
  }
  if (valid && !interrupted && !closingAuthorized) {
    if (args.action === "stop" && control && control.itemIds.length &&
        ["participant_stop", "discomfort"].includes(args.reason)) {
      accepted = true;
      closingReason = args.reason;
    } else if (!listeningRepair && freshAnswer && answerText && !needsMoreTimeOrRepair &&
               !(args.action === "finish" && bareYesNeedsContent) && args.reason === "completed" &&
               (pacingElapsedSeconds() >= effectivePacingConfig().minimum_synthesis_elapsed_seconds ||
                endingStage === "waiting_check" || endingStage === "waiting_final")) {
      if (args.action === "check_answered" && activeTaskId === "island" && endingStage === "waiting_check") {
        accepted = true;
        endingStage = "need_final";
      } else if (args.action === "finish" &&
        (((activeAssistantMode === "affective" || activeTaskId === "leaves") && endingStage === "waiting_check") ||
         (activeAssistantMode === "cognitive" && endingStage === "waiting_final"))) {
        accepted = true;
        closingReason = "completed";
      }
    }
  }
  if (accepted && ["finish", "stop"].includes(args.action) &&
      !validClosingAcknowledgment(args.acknowledgment)) {
    accepted = false;
    acknowledgmentRequired = true;
  }
  dataChannel.send(JSON.stringify({ type: "conversation.item.create", item: {
    type: "function_call_output", call_id: call.call_id,
    output: JSON.stringify({ accepted, stage: endingStage,
      instruction: accepted ? "Wait for the browser-controlled response." : acknowledgmentRequired
        ? "Do not close yet. Regenerate a short content acknowledgment; the participant need not answer again."
        : "Do not close. Follow the current stage and latest participant speech." }),
  } }));
  recordEvent("study_progress_decision", { action: args.action, accepted,
    reason: args.reason, evidence: args.evidence, ending_stage: endingStage,
    blocked_by_listening_repair: Boolean(listeningRepair),
    acknowledgment_required: acknowledgmentRequired });
  if (!accepted) {
    if (acknowledgmentRequired && !interrupted) {
      acknowledgmentRetryCount += 1;
      if (acknowledgmentRetryCount <= 2) {
        pendingControlledResponse = { kind: "closing_acknowledgment", sourceControl: control };
      } else {
        recordEvent("failure", { stage: "closing_acknowledgment_generation" });
        closingReason = "closing_acknowledgment_failed";
        conversationEndedAtMilliseconds = Date.now();
        clearPacingTimer();
        void stopSession({ manualStop: false, advanceToNextTask: false,
          participantFinalStatus: "Please return the device to the researcher." });
      }
    } else if (!interrupted) pendingControlledResponse = { kind: "ending_repair" };
    return;
  }
  if (args.action === "check_answered") {
    pendingControlledResponse = { kind: "task_final" };
    return;
  }
  closingPreviousStage = endingStage;
  acknowledgmentRetryCount = 0;
  closingAuthorized = true;
  endingStage = "closing";
  closingAcknowledgment = args.acknowledgment.trim();
  closingAcknowledgmentDelivered = false;
  if (activeAssistantMode === "affective" && !affectiveFollowupsReady() && args.reason === "completed") {
    recordEvent("affective_followup_shortfall", { followup_count: affectiveFollowupCount,
      reason: "already_delivered_final_invitation_honored_without_repeating" });
  }
  pendingControlledResponse = { kind: "closing", text:
    closingAcknowledgment + " " + currentExactClosing() };
}

// Retry only after generation and playback settle, regardless of event order.
function recoverMissingClosing(responseId) {
  if (!closingAuthorized || finalClosingDelivered || isStopping ||
      responseId !== closingResponseId || closingRecoveryHandled.has(responseId) ||
      !finishedResponses.has(responseId) || !completedAudioResponses.has(responseId) ||
      !responseSpeech.has(responseId) || cancelledAudioResponses.has(responseId)) return;
  closingRecoveryHandled.add(responseId);
  if (closingRetryCount < 1) {
    closingRetryCount += 1;
    recordEvent("closing_exact_phrase_retry", { response_id: responseId });
    recordEvent("closing_delivery_retry", { acknowledgment_delivered: closingAcknowledgmentDelivered });
    pendingControlledResponse = { kind: "closing", text:
      (closingAcknowledgmentDelivered ? "" : closingAcknowledgment + " ") + currentExactClosing() };
    drainControlledResponse();
  } else {
    closingReason = "closing_delivery_failed";
    conversationEndedAtMilliseconds = Date.now();
    clearPacingTimer();
    setMicrophoneEnabled(false);
    recordEvent("failure", { stage: "closing_delivery", response_id: responseId });
    void stopSession({ manualStop: false, advanceToNextTask: false,
      participantFinalStatus: "Please return the device to the researcher." });
  }
}

function completeAuthorizedClosing(responseId) {
  if (!closingAuthorized || !finalClosingDelivered || !closingAcknowledgmentDelivered || responseId !== closingResponseId ||
      !completedAudioResponses.has(responseId) || isStopping) return false;
  finalClosingPlaybackPending = false;
  conversationEndedAtMilliseconds = audioPlaybackEndedAt.get(responseId) ?? Date.now();
  clearPacingTimer();
  setMicrophoneEnabled(false);
  recordEvent("automatic_stop_after_exact_closing", {
    response_id: responseId, task_id: activeTaskId, task_position: currentTaskPosition(),
    reason: closingReason, elapsed_seconds: pacingElapsedSeconds(),
  });
  void stopSession({ manualStop: false,
    advanceToNextTask: currentTaskPosition() === 1 && closingReason === "completed",
    nextTaskNotBeforeMilliseconds: conversationEndedAtMilliseconds + taskTransitionPauseMilliseconds(),
    participantFinalStatus: currentTaskPosition() === 1 && closingReason === "completed"
      ? "Preparing the next activity…" : "Conversation complete. Please return the device to the researcher.",
  });
  return true;
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
  const responseKind = "conversation";
  participantResponseBatchCount += 1;
  if (pendingAffectiveFollowupResponseId !== null) {
    recordEvent("affective_followup_reply_received", {
      response_id: pendingAffectiveFollowupResponseId, participant_item_ids: itemIds,
    });
    pendingAffectiveFollowupResponseId = null;
  }
  sendPacingControlIfNeeded();
  pendingControlledResponse = null;
  updateListeningRepair(requests);
  sendHiddenControl(endingControlText());
  issuedResponseControl = makeResponseControl(requests, "participant_reply");
  hideConversationInstruction(
    "clear_coalesced_transcription",
    latestRequest.itemId,
  );
  responseInProgress = true;
  activeResponseKind = responseKind;
  activeParticipantResponseRequests = requests.map((request) => ({
    ...request,
  }));
  const responsePayload = {
    tools: [currentStudyProgressTool()],
    tool_choice: "auto",
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
  dataChannel.send(
    JSON.stringify({
      type: "response.create",
      response: responsePayload,
    }),
  );
  diagnosticLog(
    itemIds.length > 1
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
      lastConversationActivityAt = Date.now();
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
      lastConversationActivityAt = Date.now();
      if (!isStopping) setStatus("Buzz is thinking…");
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
      let ignoreReason = classifyUnusableTranscript(rawTranscript);
      const expectingAnswer = /[?]/.test(deliveredAssistantText) ||
        /\b(?:if you|i can help|we can|would you like)\b/i.test(deliveredAssistantText);
      if (ignoreReason === "filler_or_unclear_fragment" && expectingAnswer &&
          /[^\x00-\x7F]/.test(rawTranscript)) {
        unclearAnswerItemIds.add(event.item_id);
        ignoreReason = null;
        recordEvent("unclear_short_answer_requires_clarification", { item_id: event.item_id });
      }
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
      const incompleteTranscript =
        isClearlyIncompleteTranscript(rawTranscript);
      requestParticipantResponse(
        event.item_id,
        "clear_transcription",
        "conversation",
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
      if (activeResponseId && issuedResponseControl) {
        responseControls.set(activeResponseId, issuedResponseControl);
        if (issuedResponseControl.kind === "closing") closingResponseId = activeResponseId;
        issuedResponseControl = null;
      }
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
      responseSpeech.set(event.response_id, transcript);
      commitDeliveredSpeech(event.response_id);
      const normalizedTranscript = normalizeSpeech(transcript);
      const usedExactClosing = normalizedTranscript.includes(
        normalizeSpeech(currentExactClosing()),
      );
      const cancelledForContinuation =
        continuationResponseCancelPending &&
        event.response_id === continuationCancelResponseId;
      const control = responseControls.get(event.response_id);
      if (!openingInProgress && !cancelledForContinuation) {
        const scriptedEnding = [studyConfig.affective_final_check, studyConfig.cognitive_completeness_check,
          studyConfig.leaves_rehearsal_question, "To confirm, your final three items are", currentExactClosing()]
          .filter(Boolean).some(text => normalizedTranscript.includes(normalizeSpeech(text)));
        const repairInput = listeningRepair ? listeningRepair.itemIds.map(id =>
          (transcriptItems.get(id) || {}).text || "").join(" ") : "";
        const requestedRepeat = /repeat|say that again/i.test(repairInput);
        const repeatTarget = endingStage === "waiting_check"
          ? (activeAssistantMode === "affective" ? studyConfig.affective_final_check : studyConfig.cognitive_completeness_check)
          : endingStage === "waiting_final" ? studyConfig.leaves_rehearsal_question : null;
        const validRepeat = requestedRepeat && repeatTarget &&
          normalizedTranscript.includes(normalizeSpeech(repeatTarget));
        if (control && control.repairBatch !== null && (!scriptedEnding || validRepeat) && countWords(transcript) >= 4) {
          repairSpeech.set(event.response_id, { batch: control.repairBatch });
          commitRepairPlayback(event.response_id);
        }
        const check = activeAssistantMode === "affective"
          ? studyConfig.affective_final_check : studyConfig.cognitive_completeness_check;
        if (!listeningRepair && control && ["exploring", "need_check"].includes(control.stage) && check &&
            normalizedTranscript.includes(normalizeSpeech(check))) {
          pendingEndingPlayback.set(event.response_id, "waiting_check");
          if (pacingElapsedSeconds() < effectivePacingConfig().minimum_synthesis_elapsed_seconds) {
            recordEvent("early_final_check", { response_id: event.response_id, elapsed_seconds: pacingElapsedSeconds() });
          }
        }
        const finalQuestion = activeTaskId === "leaves"
          ? studyConfig.leaves_wrapup_choice_question : "To confirm, your final three items are";
        if (!listeningRepair && control && ["need_final", "waiting_final"].includes(control.stage) && finalQuestion &&
            normalizedTranscript.includes(normalizeSpeech(finalQuestion))) {
          pendingEndingPlayback.set(event.response_id, "waiting_final");
        }
        if (!listeningRepair && control && control.stage === "waiting_final" && activeTaskId === "leaves" &&
            normalizedTranscript.includes(normalizeSpeech("Would you like to keep that explanation or change it?"))) {
          pendingEndingPlayback.set(event.response_id, "waiting_candidate");
        }
        commitEndingPlayback(event.response_id);
        const acknowledgmentAvailable = closingAcknowledgmentDelivered ||
          (closingAcknowledgment && normalizedTranscript.startsWith(normalizeSpeech(closingAcknowledgment)));
        if (usedExactClosing && acknowledgmentAvailable && control && control.kind === "closing" && closingAuthorized &&
            normalizedTranscript.endsWith(normalizeSpeech(currentExactClosing()))) {
          finalClosingDelivered = true;
          finalClosingPlaybackPending = true;
          closingResponseId = event.response_id;
          recordEvent("final_closing_delivered", {
            response_id: event.response_id, item_id: event.item_id, task_position: currentTaskPosition(),
          });
          completeAuthorizedClosing(event.response_id);
        } else if (usedExactClosing) {
          recordEvent("failure", { stage: closingAuthorized && control && control.kind === "closing"
            ? "closing_acknowledgment_missing" : "unauthorized_closing", response_id: event.response_id });
        }
      }
      recoverMissingClosing(event.response_id);
      recordEvent("assistant_transcription_completed", {
        response_id: event.response_id,
        item_id: event.item_id,
        output_index: event.output_index,
        content_index: event.content_index,
        word_count: countWords(transcript),
        opening: openingInProgress,
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
      finishedResponses.add(response.id);
      responseInProgress = false;
      const completedControl = responseControls.get(response.id);
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
        diagnosticLog("Buzz completed generation of the programmed message.");
        recordEvent("programmed_message_generation_completed", {
          kind: transitionPlaybackPending ? "transition" : "task_opening",
        });
      } else {
        if (!isStopping) setStatus("Connected. You can continue speaking.");
        diagnosticLog("Assistant response completed.");
      }
      if (!cancelledForContinuation && response.status === "completed") {
        for (const item of response.output || []) {
          if (item.type === "function_call" && item.name === "study_progress") {
            handleStudyProgress(item, completedControl);
          }
        }
      }
      recoverMissingClosing(response.id);
      scheduleQueuedParticipantResponse("assistant_response_completed");
      drainControlledResponse();
      break;
    }
    case "output_audio_buffer.started":
      assistantAudioPlaying = true;
      if (transitionPlaybackPending && taskTransitionTiming) {
        const startedAt = Date.now();
        taskTransitionTiming.audio_started_at = new Date(startedAt).toISOString();
        taskTransitionTiming.actual_gap_seconds =
          (startedAt - taskTransitionTiming.previous_closing_ended_at_ms) / 1000;
      }
      if (openingPlaybackPending && !transitionPlaybackPending) startConversationClock();
      lastConversationActivityAt = Date.now();
      if (
        (speechInProgress || pendingTranscriptionItemIds.size || continuationResponseCancelPending) &&
        !openingPlaybackPending
      ) {
        if (dataChannel && dataChannel.readyState === "open") {
          cancelledAudioResponses.add(event.response_id);
          pendingEndingPlayback.delete(event.response_id);
          if (closingAuthorized && event.response_id === closingResponseId) {
            closingAuthorized = false;
            closingResponseId = null;
            closingReason = null;
            closingAcknowledgment = "";
            closingAcknowledgmentDelivered = false;
            finalClosingDelivered = false;
            finalClosingPlaybackPending = false;
            endingStage = closingPreviousStage;
            pendingControlledResponse = null;
            recordEvent("closing_reopened_for_continuation", { ending_stage: endingStage });
          }
          dataChannel.send(JSON.stringify({ type: "output_audio_buffer.clear" }));
        }
        setMicrophoneEnabled(true);
        voiceOrb.classList.add("idle");
        preparationOrb.classList.add("idle");
        recordEvent("output_audio_buffer_started", {
          response_id: event.response_id,
          microphone_enabled: true,
          cleared_for_participant_continuation: true,
        });
        break;
      }
      setMicrophoneEnabled(false);
      voiceOrb.classList.remove("idle");
      preparationOrb.classList.remove("idle");
      recordEvent(event.type.replace(/\./g, "_"), {
        response_id: event.response_id,
        microphone_enabled: false,
      });
      break;
    case "output_audio_buffer.stopped":
    case "output_audio_buffer.cleared":
      assistantAudioPlaying = false;
      lastConversationActivityAt = Date.now();
      if (event.type === "output_audio_buffer.cleared") {
        cancelledAudioResponses.add(event.response_id);
        pendingEndingPlayback.delete(event.response_id);
      }
      if (event.type === "output_audio_buffer.stopped") {
        completedAudioResponses.add(event.response_id);
        if (!audioPlaybackEndedAt.has(event.response_id)) {
          audioPlaybackEndedAt.set(event.response_id, Date.now());
        }
        commitDeliveredSpeech(event.response_id);
        commitRepairPlayback(event.response_id);
        commitEndingPlayback(event.response_id);
        if (completeAuthorizedClosing(event.response_id)) break;
        recoverMissingClosing(event.response_id);
      }
      const shouldAutoEndAfterClosing = closingAuthorized && event.response_id === closingResponseId;
      const completedTransition =
        transitionPlaybackPending &&
        openingPlaybackPending &&
        event.type === "output_audio_buffer.stopped";
      if (
        !isStopping &&
        !shouldAutoEndAfterClosing &&
        !completedTransition &&
        !isPreparationSession
      ) {
        setMicrophoneEnabled(true);
      }
      voiceOrb.classList.add("idle");
      preparationOrb.classList.add("idle");
      recordEvent(event.type.replace(/\./g, "_"), {
        response_id: event.response_id,
        microphone_enabled:
          !isStopping &&
          !shouldAutoEndAfterClosing &&
          !completedTransition &&
          !isPreparationSession,
      });
      if (openingPlaybackPending) {
        openingPlaybackPending = false;
        if (completedTransition) {
          transitionPlaybackPending = false;
          setMicrophoneEnabled(false);
          diagnosticLog("Buzz completed the activity transition.");
          recordEvent("second_task_transition_completed", {
            playback_event: event.type,
          });
          beginPreparationWindow("spoken_transition_completed");
        } else {
          isPreparationSession = false;
          if (!isStopping) {
            setMicrophoneEnabled(true);
            setStatus("Connected. You can begin speaking.");
            hideParticipantStatus();
          }
          diagnosticLog("Buzz completed the task opening.");
          recordEvent("task_opening_completed", {
            playback_event: event.type,
          });
        }
      } else if (!isStopping) {
        setStatus("Connected. You can continue speaking.");
      }
      scheduleQueuedParticipantResponse("assistant_audio_playback_ended");
      drainControlledResponse();
      break;
    case "error":
      clearPacingTimer();
      pendingControlledResponse = null;
      responseInProgress = false;
      activeResponseId = null;
      activeResponseKind = null;
      activeParticipantResponseRequests = [];
      continuationResponseCancelPending = false;
      continuationCancelResponseId = null;
      assistantAudioPlaying = false;
      finalClosingPlaybackPending = false;
      if (!isStopping) setMicrophoneEnabled(true);
      voiceOrb.classList.add("idle");
      preparationOrb.classList.add("idle");
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

function programmedSpeechInstructions(text) {
  // Per-response instructions replace the session instructions. Include the
  // same delivery profile here so scripted speech keeps Buzz's common voice.
  return studyConfig.voice_delivery_instructions +
    "\n\nSay exactly this and nothing else: " + JSON.stringify(text);
}

function taskTransitionPauseMilliseconds() {
  return Math.max(3, Number(studyConfig.task_transition_pause_seconds) || 3) * 1000;
}

async function requestTransitionWhenReady(notBeforeMilliseconds) {
  const channel = dataChannel;
  const deadline = Number.isFinite(notBeforeMilliseconds)
    ? notBeforeMilliseconds : Date.now() + taskTransitionPauseMilliseconds();
  const stillReady = () => channel && channel === dataChannel &&
    channel.readyState === "open" && isPreparationSession && !isStopping;
  // Saving and reconnecting count toward the gap. Wait only for what remains.
  while (stillReady() && Date.now() < deadline) {
    await new Promise(resolve => window.setTimeout(resolve, deadline - Date.now()));
  }
  if (!stillReady()) return false;
  taskTransitionTiming = {
    minimum_pause_seconds: taskTransitionPauseMilliseconds() / 1000,
    previous_closing_ended_at_ms: deadline - taskTransitionPauseMilliseconds(),
    transition_not_before: new Date(deadline).toISOString(),
    requested_at: new Date().toISOString(),
    audio_started_at: null,
    actual_gap_seconds: null,
  };
  recordEvent("second_task_transition_pause_completed", { ...taskTransitionTiming });
  requestTransitionMessage();
  return true;
}

function requestProgrammedMessage(text, kind) {
  if (openingRequested || !dataChannel || dataChannel.readyState !== "open") {
    return;
  }
  issuedResponseControl = null;
  openingRequested = true;
  openingInProgress = true;
  openingPlaybackPending = true;
  responseInProgress = true;
  activeResponseKind = "opening";
  activeParticipantResponseRequests = [];
  setStatus(
    kind === "transition"
      ? "Buzz is moving to the next activity…"
      : "Buzz is opening the conversation…",
  );
  dataChannel.send(
    JSON.stringify({
      type: "response.create",
      response: {
        input: [],
        output_modalities: ["audio"],
        metadata: {
          trigger:
            kind === "transition"
              ? "programmed_task_transition"
              : "programmed_task_opening",
          programmed_message_kind: kind,
        },
        instructions: programmedSpeechInstructions(text),
      },
    }),
  );
  diagnosticLog("Requested the programmed " + kind + ".");
  recordEvent("programmed_message_requested", {
    kind,
    text,
  });
}

function requestTaskOpening() {
  const text =
    currentTaskPosition() === 1
      ? activeTaskProfile.opening_first
      : activeTaskProfile.opening_later;
  requestProgrammedMessage(text, "task_opening");
}

function requestTransitionMessage() {
  transitionPlaybackPending = true;
  requestProgrammedMessage(studyConfig.transition, "transition");
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
      "X-Assistant-Mode": activeAssistantMode,
      "X-Task-ID": activeTaskId,
      "X-Task-Position": String(currentTaskPosition()),
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
    "Condition: " + activeModeProfile.label,
    "Task: " + activeTaskProfile.label,
    "Task Position: " + currentTaskPosition() + " of 2",
    "Task Order: " + activeOrderId,
    "Prompt Version: " + studyConfig.prompt_version,
    "Turn Controller Version: " + studyConfig.controller_version,
    "Assistant Name: " + studyConfig.assistant.name,
    "Researcher Test Mode: " + (activeResearcherTestMode ? "Yes" : "No"),
    "Session Started: " + sessionStartedAt,
    "Session Ended: " + sessionEndedAt,
    "Preparation Started: " + preparationStartedAt,
    "Preparation Ready: " + preparationReadyAt,
    "Preparation Skipped: " + (activePreparationSkipped ? "Yes" : "No"),
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
    .replace(/[.!?,;:]+/g, "")
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
    normalizeSpeech(currentExactClosing()),
  );
  const startedMilliseconds = Date.parse(sessionStartedAt);
  const endedMilliseconds = Date.parse(sessionEndedAt);
  const durationMilliseconds =
    Number.isFinite(startedMilliseconds) && Number.isFinite(endedMilliseconds)
      ? Math.max(0, endedMilliseconds - startedMilliseconds)
      : null;

  return {
    schema_version: "1.1",
    prompt_version: studyConfig.prompt_version,
    controller_version: studyConfig.controller_version,
    participant_id: activeParticipantId,
    condition: {
      id: activeAssistantMode,
      label: activeModeProfile.label,
    },
    task: {
      id: activeTaskId,
      label: activeTaskProfile.label,
      position: currentTaskPosition(),
      order_id: activeOrderId,
      order: activeTaskSequence.slice(),
    },
    assistant: {
      name: studyConfig.assistant.name,
      voice: studyConfig.assistant.voice,
      speed: studyConfig.assistant.speed,
    },
    study_run: {
      researcher_test_mode: activeResearcherTestMode,
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
      configured: effectivePacingConfig(),
      topic_started_at:
        topicStartedAtMilliseconds === null
          ? null
          : new Date(topicStartedAtMilliseconds).toISOString(),
      elapsed_seconds_at_end: pacingElapsedSeconds(),
      clock_basis: "task_opening_audio_started",
      ending_stage: endingStage,
      closing_reason: closingReason,
      closing_authorized: closingAuthorized,
      listening_repair_pending: Boolean(listeningRepair),
      leaves_wrapup_choice_delivered: leavesWrapupChoiceDelivered,
      overrun_seconds: Math.max(0, pacingElapsedSeconds() - effectivePacingConfig().maximum_elapsed_seconds),
      response_batches: participantResponseBatchCount,
      exploration_hold_sent: pacingHoldSent,
      synthesis_release_sent: pacingReleaseSent,
      convergence_control_sent: pacingConvergenceSent,
      finalization_control_sent: pacingFinalizationSent,
      upper_bound_control_sent: pacingMaximumSent,
    },
    preparation: {
      configured_seconds: studyConfig.preparation_seconds,
      required_seconds: activePreparationSkipped
        ? 0
        : studyConfig.preparation_seconds,
      researcher_test_mode: activeResearcherTestMode,
      skipped: activePreparationSkipped,
      started_at: preparationStartedAt,
      ready_at: preparationReadyAt,
      transition_before_preparation:
        currentTaskPosition() === 2 ? studyConfig.transition : null,
      transition_timing: cloneForStudyLog(taskTransitionTiming),
    },
    session: {
      started_at: sessionStartedAt,
      ended_at: sessionEndedAt,
      duration_ms: durationMilliseconds,
      manual_stop: manualStopRequested,
      established: sessionWasEstablished,
      programmed_opening:
        currentTaskPosition() === 1
          ? activeTaskProfile.opening_first
          : activeTaskProfile.opening_later,
      exact_closing: currentExactClosing(),
      exact_closing_detected: exactClosingDetected,
      controller_final_closing_delivered: finalClosingDelivered,
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

function appendInstructionSegments(element, segments) {
  for (const segment of Array.isArray(segments) ? segments : []) {
    if (!segment || typeof segment.text !== "string") continue;
    const child = document.createElement(segment.bold ? "strong" : "span");
    child.textContent = segment.text;
    element.append(child);
  }
}

function renderInstructionBody(element, instruction, duringConversation = false) {
  element.replaceChildren();
  const blocks = instruction && instruction.blocks;
  if (!Array.isArray(blocks)) {
    element.textContent = String((instruction && instruction.body) || "");
    return;
  }

  for (const block of blocks) {
    if (!block || typeof block.type !== "string") continue;
    if (duringConversation && (block.type === "timing" || block.preparation_only)) {
      continue;
    }
    if (block.type === "list") {
      const list = document.createElement("ul");
      list.className = "instruction-list";
      if (block.layout === "two_columns") {
        list.classList.add("island-items");
      }
      for (const item of Array.isArray(block.items) ? block.items : []) {
        const listItem = document.createElement("li");
        listItem.textContent = String(item);
        list.append(listItem);
      }
      element.append(list);
      continue;
    }

    const paragraph = document.createElement("p");
    paragraph.className = "instruction-block";
    if (block.type === "label") {
      paragraph.className += " instruction-label";
      paragraph.textContent = String(block.text || "");
    } else {
      if (block.type === "question") {
        paragraph.className += " instruction-question";
      } else if (block.type === "timing") {
        paragraph.className += " instruction-timing";
      }
      appendInstructionSegments(paragraph, block.segments);
    }
    element.append(paragraph);
  }
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
  if (!assistantMode || !studyConfig.modes[assistantMode]) {
    setupStatusElement.textContent = "Select the assigned condition.";
    return;
  }
  const orderSelection = selectedValue(orderInputs);
  const orderIndex = orderSelection === "order_2" ? 1 : 0;
  const modeProfile = studyConfig.modes[assistantMode];
  const orderProfile = modeProfile.orders[orderIndex];
  if (!orderProfile || !Array.isArray(orderProfile.tasks)) {
    setupStatusElement.textContent = "Select a valid task order.";
    return;
  }

  activeParticipantId = participantId;
  activeAssistantMode = assistantMode;
  activeModeProfile = modeProfile;
  activeOrderId = orderProfile.id;
  activeTaskSequence = orderProfile.tasks.slice();
  activeResearcherTestMode = Boolean(researcherTestModeInput.checked);
  activePreparationSkipped = false;
  savedTaskSummaries = [];
  latestSaveSummary = "";
  selectActiveTask(0);
  setSetupControlsDisabled(true);
  renderActiveTaskPreparation();
  beginPreparationWindow("first_task_preparation");
  setupStatusElement.textContent = activeResearcherTestMode
    ? "Researcher test mode prepared; the one-minute wait will be skipped."
    : "Participant view prepared.";
}

function backToResearcherSetup() {
  clearPreparationTimer();
  setSetupControlsDisabled(false);
  showView(researcherView);
  setupStatusElement.textContent = "Session configuration is ready.";
}

async function startPreparedConversation() {
  if (
    !sessionWasEstablished ||
    !microphoneStream ||
    !dataChannel ||
    dataChannel.readyState !== "open"
  ) {
    preparationStatusElement.textContent =
      "The next activity is not connected. Please return the device to the researcher.";
    startButton.disabled = true;
    return;
  }

  clearConversationDisplay();
  isPreparationSession = false;
  transitionPlaybackPending = false;
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
  resetEndingController();
  topicStartedAtMilliseconds = null;
  participantResponseBatchCount = 0;
  pacingHoldSent = false;
  pacingReleaseSent = false;
  pacingConvergenceSent = false;
  pacingFinalizationSent = false;
  pacingMaximumSent = false;
  finalClosingDelivered = false;
  finalClosingPlaybackPending = false;
  participantInstructionPending = true;
  manualStopRequested = false;
  sessionStartedAt = new Date().toISOString();
  sessionEndedAt = null;

  startButton.disabled = true;
  stopButton.hidden = false;
  stopButton.disabled = true;
  returnButton.hidden = true;
  voiceOrb.classList.add("idle");
  conversationInstruction.hidden = false;
  showView(conversationView);
  showParticipantStatus("Starting…");
  setStatus("Preparing the recording…");
  setRecordingStatus("Preparing the recording…");
  recordEvent("prepared_session_conversation_start_requested", {
    condition: activeAssistantMode,
    task_id: activeTaskId,
    task_position: currentTaskPosition(),
    researcher_test_mode: activeResearcherTestMode,
    preparation_skipped: activePreparationSkipped,
    preparation_started_at: preparationStartedAt,
    preparation_ready_at: preparationReadyAt,
    latest_applied_session: latestAppliedSessionSettings,
  });

  try {
    setMicrophoneEnabled(false);
    await startRecording(microphoneStream);
    attachRemoteRecordingStream(remoteMediaStream);
    stopButton.disabled = false;
    requestTaskOpening();
  } catch (error) {
    const message = error.message || String(error);
    diagnosticLog(message);
    recordEvent("failure", {
      stage: "prepared_conversation_start",
      message,
    });
    await stopSession({
      saveRecording: false,
      finalStatus: "Connection failed: " + message,
      participantFinalStatus:
        "Unable to start. Please return the device to the researcher.",
      manualStop: false,
      advanceToNextTask: false,
    });
  }
}

async function startSession(options) {
  const settings = options || {};
  const preparationOnly = settings.preparationOnly === true;
  if (
    !studyConfig ||
    !activeParticipantId ||
    !activeAssistantMode ||
    !activeTaskId
  ) {
    backToResearcherSetup();
    setupStatusElement.textContent = "Prepare the participant view again.";
    return;
  }

  sessionWasEstablished = false;
  taskTransitionTiming = null;
  isStopping = false;
  isPreparationSession = preparationOnly;
  transitionPlaybackPending = false;
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
  resetEndingController();
  topicStartedAtMilliseconds = null;
  participantResponseBatchCount = 0;
  pacingHoldSent = false;
  pacingReleaseSent = false;
  pacingConvergenceSent = false;
  pacingFinalizationSent = false;
  pacingMaximumSent = false;
  finalClosingDelivered = false;
  finalClosingPlaybackPending = false;
  participantInstructionPending = !preparationOnly;
  manualStopRequested = false;
  sessionStartedAt = preparationOnly ? null : new Date().toISOString();
  sessionEndedAt = null;
  latestAppliedSessionSettings = null;
  clearConversationDisplay();
  setSetupControlsDisabled(true);
  startButton.disabled = true;
  stopButton.hidden = false;
  stopButton.disabled = preparationOnly;
  returnButton.hidden = true;
  voiceOrb.classList.add("idle");
  conversationInstruction.hidden = false;
  if (!preparationOnly) {
    showView(conversationView);
    showParticipantStatus("Starting…");
  }
  setStatus("Requesting microphone access…");
  setRecordingStatus(
    preparationOnly
      ? "Preparing the next activity."
      : "Preparing the recording…",
  );
  recordEvent("session_start_requested", {
    condition: activeAssistantMode,
    task_id: activeTaskId,
    task_position: currentTaskPosition(),
    preparation_only: preparationOnly,
    researcher_test_mode: activeResearcherTestMode,
    preparation_skipped: activePreparationSkipped,
    prompt_version: studyConfig.prompt_version,
    controller_version: studyConfig.controller_version,
  });
  diagnosticLog(
    "Starting " +
      activeTaskProfile.label +
      " / " +
      activeModeProfile.label +
      (preparationOnly ? " preparation session." : " conversation session."),
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
    if (!preparationOnly) {
      await startRecording(microphoneStream);
    }

    setStatus("Connecting to Buzz…");
    peerConnection = new RTCPeerConnection();
    peerConnection.addEventListener("connectionstatechange", () => {
      const connectionState = peerConnection
        ? peerConnection.connectionState
        : "closed";
      diagnosticLog("WebRTC: " + connectionState);
      recordEvent("webrtc_connection_state", { state: connectionState });
      if (isStopping) return;
      if (connectionState === "connected" && !openingRequested) {
        setStatus(
          preparationOnly
            ? "Connected. Preparing the activity transition…"
            : "Connected. Preparing Buzz’s question…",
        );
      } else if (["failed", "disconnected"].includes(connectionState)) {
        setStatus("Connection interrupted. Please end the conversation.");
        showParticipantStatus(
          "Connection interrupted. Please return the device to the researcher.",
        );
      }
    });

    peerConnection.addEventListener("track", async (event) => {
      remoteMediaStream =
        event.streams[0] || new MediaStream([event.track]);
      remoteAudio.srcObject = remoteMediaStream;
      attachRemoteRecordingStream(remoteMediaStream);
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
    dataChannel.addEventListener("open", async () => {
      diagnosticLog("Realtime data channel opened.");
      recordEvent("data_channel_opened");
      if (!isStopping) {
        if (preparationOnly) {
          await requestTransitionWhenReady(settings.nextTaskNotBeforeMilliseconds);
        } else {
          requestTaskOpening();
        }
      }
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
        "X-Task-ID": activeTaskId,
        "X-Task-Position": String(currentTaskPosition()),
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
    stopButton.disabled = preparationOnly;
    recordEvent("session_established", {
      preparation_only: preparationOnly,
    });
  } catch (error) {
    const message = error.message || String(error);
    diagnosticLog(message);
    recordEvent("failure", { stage: "session_start", message });
    if (preparationOnly) {
      preparationStatusElement.textContent =
        "Unable to prepare the next activity. Please return the device to the researcher.";
    }
    await stopSession({
      saveRecording: false,
      finalStatus: "Connection failed: " + message,
      participantFinalStatus:
        "Unable to start. Please return the device to the researcher.",
      manualStop: false,
      advanceToNextTask: false,
    });
  }
}

async function prepareNextTask(nextTaskNotBeforeMilliseconds) {
  selectActiveTask(1);
  preparationStartedAt = null;
  preparationReadyAt = null;
  renderActiveTaskPreparation();
  preparationStatusElement.textContent =
    "Buzz is moving to the next activity.";
  startButton.disabled = true;
  startButton.textContent = "Preparing next activity";
  await startSession({ preparationOnly: true, nextTaskNotBeforeMilliseconds });
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
  const advanceToNextTask = settings.advanceToNextTask === true;
  const nextTaskNotBeforeMilliseconds = settings.nextTaskNotBeforeMilliseconds;

  if (isStopping) return;
  isStopping = true;
  clearPacingTimer();
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
  let currentTaskSaveSummary = "";

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
    requested_next_task: advanceToNextTask,
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
  remoteMediaStream = null;
  dataChannel = null;
  peerConnection = null;
  microphoneStream = null;
  startButton.disabled = false;
  stopButton.hidden = true;
  returnButton.hidden = false;
  voiceOrb.classList.add("idle");

  if (audioResult && textResult && eventResult) {
    currentTaskSaveSummary =
      "Activity " +
      currentTaskPosition() +
      " (" +
      activeTaskProfile.label +
      "): Audio_Record/" +
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
    currentTaskSaveSummary =
      "Activity " +
      currentTaskPosition() +
      " (" +
      activeTaskProfile.label +
      "): saved Audio_Record/" +
      audioResult.filename +
      "; failed: " +
      failedParts.join(", ");
    setRecordingStatus("Audio saved, but one or more logs failed.");
    setStatus("Conversation ended with a partial save.");
    showParticipantStatus(
      "Conversation ended. Please return the device to the researcher.",
    );
  } else if (audioError) {
    currentTaskSaveSummary =
      "Conversation files were not saved: " +
      (audioError.message || String(audioError));
    setRecordingStatus("Conversation files were not saved.");
    setStatus("Conversation ended, but the recording could not be saved.");
    showParticipantStatus(
      "Saving was incomplete. Please return the device to the researcher.",
    );
  } else if (!shouldSave) {
    currentTaskSaveSummary = "No conversation files were saved.";
    setStatus(finalStatus);
    setRecordingStatus("No recording was saved.");
    showParticipantStatus(participantFinalStatus);
  }

  if (shouldSave && currentTaskSaveSummary) {
    latestSaveSummary = currentTaskSaveSummary;
    savedTaskSummaries.push(currentTaskSaveSummary);
  }

  sessionWasEstablished = false;
  isPreparationSession = false;
  transitionPlaybackPending = false;
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
  resetEndingController();
  topicStartedAtMilliseconds = null;
  participantResponseBatchCount = 0;
  pacingHoldSent = false;
  pacingReleaseSent = false;
  pacingConvergenceSent = false;
  pacingFinalizationSent = false;
  pacingMaximumSent = false;
  finalClosingDelivered = false;
  finalClosingPlaybackPending = false;
  participantInstructionPending = false;
  latestAppliedSessionSettings = null;
  isStopping = false;

  const completeSave = Boolean(audioResult && textResult && eventResult);
  if (advanceToNextTask && completeSave && activeTaskIndex === 0) {
    await prepareNextTask(nextTaskNotBeforeMilliseconds);
  } else {
    setSetupControlsDisabled(false);
  }
}

function returnToResearcherSetup() {
  const combinedSummary = savedTaskSummaries.length
    ? savedTaskSummaries.join("\n")
    : latestSaveSummary;
  savedFilesSummary.textContent = combinedSummary;
  researcherResults.hidden = !combinedSummary;
  setupStatusElement.textContent = combinedSummary
    ? "Review the saved tasks below or configure the next participant."
    : "Session configuration is ready.";
  showView(researcherView);
}

function releaseMediaImmediately() {
  clearPreparationTimer();
  if (dataChannel) dataChannel.close();
  if (peerConnection) peerConnection.close();
  if (microphoneStream) {
    for (const track of microphoneStream.getTracks()) track.stop();
  }
  remoteMediaStream = null;
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
      !config.modes.cognitive ||
      !config.modes.affective ||
      !config.tasks ||
      !config.tasks.leaves ||
      !config.tasks.island ||
      !config.tasks.positive ||
      !config.tasks.negative ||
      !Object.values(config.tasks).every(
        (task) =>
          task.participant_instruction &&
          typeof task.participant_instruction.title === "string" &&
          Array.isArray(task.participant_instruction.blocks),
      ) ||
      !Number.isFinite(config.preparation_seconds) ||
      !Number.isFinite(config.task_transition_pause_seconds) ||
      config.task_transition_pause_seconds < 3 ||
      typeof config.voice_delivery_instructions !== "string" ||
      !config.voice_delivery_instructions.trim() ||
      typeof config.transition !== "string" ||
      !config.transition.trim() ||
      !config.closings ||
      typeof config.closings.task_one !== "string" ||
      typeof config.closings.task_two !== "string" ||
      typeof config.affective_final_check !== "string" ||
      typeof config.affective_closing !== "string" ||
      !config.affective_closing.trim() ||
      typeof config.cognitive_completeness_check !== "string" ||
      typeof config.leaves_rehearsal_question !== "string" ||
      typeof config.leaves_wrapup_choice_question !== "string" ||
      !config.leaves_wrapup_choice_question.trim() ||
      !config.pacing ||
      !Number.isFinite(config.pacing.minimum_synthesis_elapsed_seconds) ||
      !Number.isFinite(config.pacing.minimum_response_batches) ||
      !Number.isFinite(config.pacing.convergence_elapsed_seconds) ||
      !Number.isFinite(config.pacing.finalization_elapsed_seconds) ||
      !Number.isFinite(config.pacing.maximum_elapsed_seconds) ||
      !config.pacing.condition_overrides ||
      !config.pacing.condition_overrides.affective ||
      !Number.isFinite(
        config.pacing.condition_overrides.affective
          .minimum_synthesis_elapsed_seconds,
      ) ||
      !Number.isFinite(
        config.pacing.condition_overrides.affective.minimum_response_batches,
      )
    ) {
      throw new Error("The study configuration is incomplete.");
    }
    studyConfig = config;
    updateTaskOrderOptions();
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
for (const input of modeInputs) {
  input.addEventListener("change", updateTaskOrderOptions);
}
prepareButton.addEventListener("click", prepareParticipantView);
backButton.addEventListener("click", backToResearcherSetup);
startButton.addEventListener("click", () => {
  clearPreparationTimer();
  if (currentTaskPosition() === 2 && sessionWasEstablished) {
    void startPreparedConversation();
  } else {
    void startSession();
  }
});
stopButton.addEventListener("click", () => {
  void stopSession({ manualStop: true, advanceToNextTask: false });
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
