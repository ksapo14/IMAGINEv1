import { PITCH_DECK, PITCH_DECK_ID, PITCH_DECK_VERSION, PITCH_START_SLIDE_ID, assertValidPitchDeck, getPitchSlide } from "./deck.ts";
import { createFunctionGemmaPitchModelAdapter, isPitchDecision, PitchModelError } from "./model.ts";
import type { PitchDecision, PitchModelAdapter, PitchModelInput, SlideDescriptor, SlideId } from "./types.ts";

export type PitchTranscriptionStatus = "idle" | "connecting" | "listening" | "stopped" | "unavailable" | "error";
export type PitchEvaluationStatus = "idle" | "evaluating" | "applied" | "held" | "error";
export type PitchUtteranceSource = "deepgram" | "simulation";
export type PitchTransitionSource = "manual" | PitchUtteranceSource;

export type PitchOutcome = {
  kind: "idle" | "moved" | "held" | "invalid_decision" | "error" | "cancelled";
  message: string;
  targetSlideId?: SlideId;
  source?: PitchTransitionSource;
};

/** A serializable snapshot, designed for React's useSyncExternalStore. */
export type PitchPresentationState = {
  deckId: string;
  deckVersion: number;
  slides: readonly SlideDescriptor[];
  currentSlideId: SlideId;
  revision: number;
  sessionId: number;
  automaticNavigation: boolean;
  transcriptionStatus: PitchTranscriptionStatus;
  latestTranscript: string;
  evaluationStatus: PitchEvaluationStatus;
  lastOutcome: PitchOutcome;
};

export type PitchControllerOptions = {
  deck?: readonly SlideDescriptor[];
  deckId?: string;
  deckVersion?: number;
  initialSlideId?: SlideId;
  adapter?: PitchModelAdapter;
  timeoutMs?: number;
};

type EvaluationRequest = {
  token: number;
  sessionId: number;
  revision: number;
  source: PitchUtteranceSource;
  controller: AbortController;
};

// Permit a bounded 90-second cold worker load plus response headroom; warm calls reuse it.
const DEFAULT_TIMEOUT_MS = 105_000;
const MAX_TRANSCRIPT_LENGTH = 4000;
const IDLE_OUTCOME: PitchOutcome = { kind: "idle", message: "" };

function cleanTranscript(value: string) {
  return value.trim().slice(0, MAX_TRANSCRIPT_LENGTH);
}

function timeoutError() {
  const error = new Error("Slide evaluation took too long.");
  error.name = "TimeoutError";
  return error;
}

function cancelledError() {
  const error = new Error("Slide evaluation was cancelled.");
  error.name = "AbortError";
  return error;
}

function runWithTimeout(
  adapter: PitchModelAdapter,
  input: PitchModelInput,
  controller: AbortController,
  timeoutMs: number
) {
  return new Promise<PitchDecision>((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const onAbort = () => settle(() => reject(cancelledError()));
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (timeout !== null) clearTimeout(timeout);
      controller.signal.removeEventListener("abort", onAbort);
      callback();
    };
    if (controller.signal.aborted) {
      onAbort();
      return;
    }
    controller.signal.addEventListener("abort", onAbort, { once: true });
    timeout = setTimeout(() => {
      settle(() => reject(timeoutError()));
      controller.abort();
    }, timeoutMs);

    // Defer evaluation so synchronous adapters receive the same timeout cleanup.
    Promise.resolve().then(() => {
      if (controller.signal.aborted) throw cancelledError();
      return adapter.evaluate(input, { signal: controller.signal });
    }).then(
      (decision) => settle(() => resolve(decision)),
      (error: unknown) => settle(() => reject(error))
    );
  });
}

/**
 * Owns the only path that changes slides. Adapters can suggest actions, but
 * malformed, stale, redundant, and unknown targets never reach presentation state.
 */
export class PitchController {
  private readonly adapter: PitchModelAdapter;
  private readonly deck: readonly SlideDescriptor[];
  private readonly timeoutMs: number;
  private readonly listeners = new Set<() => void>();
  private activeRequest: EvaluationRequest | null = null;
  private nextRequestToken = 0;
  private disposed = false;
  private state: PitchPresentationState;

  constructor(options: PitchControllerOptions = {}) {
    this.deck = options.deck ?? PITCH_DECK;
    assertValidPitchDeck(this.deck);
    const initialSlideId = getPitchSlide(options.initialSlideId ?? PITCH_START_SLIDE_ID, this.deck)?.id
      ?? this.deck[0].id;
    this.adapter = options.adapter ?? createFunctionGemmaPitchModelAdapter();
    this.timeoutMs = Math.max(1, Math.floor(options.timeoutMs ?? DEFAULT_TIMEOUT_MS));
    this.state = {
      deckId: options.deckId ?? PITCH_DECK_ID,
      deckVersion: options.deckVersion ?? PITCH_DECK_VERSION,
      slides: this.deck,
      currentSlideId: initialSlideId,
      revision: 0,
      sessionId: 1,
      automaticNavigation: true,
      transcriptionStatus: "idle",
      latestTranscript: "",
      evaluationStatus: "idle",
      lastOutcome: IDLE_OUTCOME
    };

    this.getSnapshot = this.getSnapshot.bind(this);
    this.subscribe = this.subscribe.bind(this);
    this.evaluateUtterance = this.evaluateUtterance.bind(this);
    this.goToSlide = this.goToSlide.bind(this);
    this.goToAdjacent = this.goToAdjacent.bind(this);
    this.setAutomaticNavigation = this.setAutomaticNavigation.bind(this);
    this.setTranscriptionStatus = this.setTranscriptionStatus.bind(this);
    this.setTranscript = this.setTranscript.bind(this);
    this.cancelPendingEvaluation = this.cancelPendingEvaluation.bind(this);
    this.resetSession = this.resetSession.bind(this);
    this.dispose = this.dispose.bind(this);
  }

  getSnapshot() {
    return this.state;
  }

  subscribe(listener: () => void) {
    if (this.disposed) return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Update displayed speech without allowing interim transcript updates to navigate. */
  setTranscript(transcript: string) {
    if (this.disposed) return;
    this.update({ latestTranscript: cleanTranscript(transcript) });
  }

  setTranscriptionStatus(status: PitchTranscriptionStatus) {
    if (this.disposed) return;
    const cancelled = (status === "idle" || status === "stopped" || status === "unavailable" || status === "error")
      && this.cancelActiveRequest((request) => request.source === "deepgram", false);
    this.update(cancelled ? {
      transcriptionStatus: status,
      evaluationStatus: "held",
      lastOutcome: { kind: "cancelled", message: "Microphone capture stopped slide evaluation.", source: "deepgram" }
    } : { transcriptionStatus: status });
  }

  setAutomaticNavigation(enabled: boolean) {
    if (this.disposed) return;
    const cancelled = !enabled && this.cancelActiveRequest((request) => request.source === "deepgram", false);
    this.update(cancelled ? {
      automaticNavigation: enabled,
      evaluationStatus: "held",
      lastOutcome: { kind: "cancelled", message: "Automatic slide navigation was paused.", source: "deepgram" }
    } : { automaticNavigation: enabled });
  }

  /** A typed simulation remains available while automatic microphone navigation is paused. */
  async evaluateUtterance(utterance: string, source: PitchUtteranceSource = "simulation") {
    if (this.disposed) return;
    const latestUtterance = cleanTranscript(utterance);
    this.setTranscript(latestUtterance);
    if (!latestUtterance) {
      this.setEvaluationOutcome("held", { kind: "held", message: "No completed utterance to evaluate.", source });
      return;
    }
    if (source === "deepgram" && !this.state.automaticNavigation) {
      this.setEvaluationOutcome("held", { kind: "held", message: "Automatic navigation is paused.", source });
      return;
    }

    this.cancelActiveRequest(() => true, false);
    const request: EvaluationRequest = {
      token: ++this.nextRequestToken,
      sessionId: this.state.sessionId,
      revision: this.state.revision,
      source,
      controller: new AbortController()
    };
    this.activeRequest = request;
    this.update({ evaluationStatus: "evaluating", lastOutcome: IDLE_OUTCOME });
    const currentSlide = getPitchSlide(this.state.currentSlideId, this.deck);
    if (!currentSlide) {
      this.activeRequest = null;
      this.setEvaluationOutcome("error", { kind: "error", message: "The active slide is unavailable.", source });
      return;
    }

    try {
      const decision = await runWithTimeout(this.adapter, {
        latestUtterance,
        currentSlide,
        availableSlides: this.deck
      }, request.controller, this.timeoutMs);
      if (!this.isCurrentRequest(request)) return;
      this.activeRequest = null;
      this.applyModelDecision(decision, request);
    } catch (error) {
      if (!this.isCurrentRequest(request)) return;
      this.activeRequest = null;
      const message = error instanceof PitchModelError
        ? error.message
        : error instanceof Error && error.name === "TimeoutError"
          ? "Slide evaluation timed out; the current slide was kept."
          : "Slide evaluation failed; the current slide was kept.";
      this.setEvaluationOutcome("error", { kind: "error", message, source });
    }
  }

  goToSlide(slideId: SlideId, source: PitchTransitionSource = "manual") {
    if (this.disposed) return false;
    // Even a manual request for the visible slide rejects a late model result.
    if (source === "manual") this.cancelActiveRequest(() => true, false);
    const target = getPitchSlide(slideId, this.deck);
    if (!target) {
      this.setEvaluationOutcome("held", { kind: "invalid_decision", message: "That slide is not available.", targetSlideId: slideId, source });
      return false;
    }
    if (target.id === this.state.currentSlideId) {
      this.setEvaluationOutcome("held", { kind: "held", message: "That slide is already showing.", targetSlideId: target.id, source });
      return false;
    }
    this.cancelActiveRequest(() => true, false);
    this.update({
      currentSlideId: target.id,
      revision: this.state.revision + 1,
      evaluationStatus: "applied",
      lastOutcome: { kind: "moved", message: `Showing ${target.title}.`, targetSlideId: target.id, source }
    });
    return true;
  }

  goToAdjacent(delta: number, source: PitchTransitionSource = "manual") {
    if (this.disposed) return false;
    if (source === "manual") this.cancelActiveRequest(() => true, false);
    if (!Number.isInteger(delta) || delta === 0) return false;
    const currentIndex = this.deck.findIndex((slide) => slide.id === this.state.currentSlideId);
    const target = this.deck[currentIndex + delta];
    if (!target) {
      this.setEvaluationOutcome("held", { kind: "held", message: "There is no adjacent slide in that direction.", source });
      return false;
    }
    return this.goToSlide(target.id, source);
  }

  /** Public cancellation is useful when microphone capture stops before an adapter settles. */
  cancelPendingEvaluation() {
    if (this.disposed) return false;
    if (!this.cancelActiveRequest(() => true, true)) return false;
    return true;
  }

  resetSession(initialSlideId: SlideId = PITCH_START_SLIDE_ID) {
    if (this.disposed) return;
    this.cancelActiveRequest(() => true, false);
    const initial = getPitchSlide(initialSlideId, this.deck)?.id ?? this.deck[0].id;
    this.update({
      currentSlideId: initial,
      revision: this.state.revision + 1,
      sessionId: this.state.sessionId + 1,
      automaticNavigation: true,
      transcriptionStatus: "idle",
      latestTranscript: "",
      evaluationStatus: "idle",
      lastOutcome: IDLE_OUTCOME
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelActiveRequest(() => true, false);
    this.listeners.clear();
  }

  private applyModelDecision(decision: unknown, request: EvaluationRequest) {
    if (!isPitchDecision(decision)) {
      this.setEvaluationOutcome("held", { kind: "invalid_decision", message: "The slide model returned an invalid action.", source: request.source });
      return;
    }
    if (decision.action === "no_action") {
      this.setEvaluationOutcome("held", { kind: "held", message: "No slide change was needed.", source: request.source });
      return;
    }
    this.goToSlide(decision.slide_id, request.source);
  }

  private isCurrentRequest(request: EvaluationRequest) {
    return !this.disposed
      && this.activeRequest?.token === request.token
      && this.state.sessionId === request.sessionId
      && this.state.revision === request.revision;
  }

  private cancelActiveRequest(predicate: (request: EvaluationRequest) => boolean, reportOutcome: boolean) {
    const request = this.activeRequest;
    if (!request || !predicate(request)) return false;
    this.activeRequest = null;
    request.controller.abort();
    if (reportOutcome) {
      this.setEvaluationOutcome("idle", { kind: "cancelled", message: "Slide evaluation was cancelled.", source: request.source });
    }
    return true;
  }

  private setEvaluationOutcome(evaluationStatus: PitchEvaluationStatus, lastOutcome: PitchOutcome) {
    this.update({ evaluationStatus, lastOutcome });
  }

  private update(changes: Partial<PitchPresentationState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...changes };
    this.listeners.forEach((listener) => listener());
  }
}

export function createPitchController(options: PitchControllerOptions = {}) {
  return new PitchController(options);
}
