/** The small Deepgram message subset Pitch Mode needs for completed speech turns. */
export type DeepgramBoundaryMessage = {
  type?: string;
  event?: string;
  status?: string;
  message?: string;
  description?: string;
  code?: string;
  transcript?: string;
  speech_final?: boolean;
  is_final?: boolean;
  utterance_id?: string;
  turn_id?: string;
  turn_index?: string | number;
  start?: string | number;
  duration?: string | number;
  last_word_end?: number;
  metadata?: { request_id?: string; utterance_id?: string };
  channel?: { alternatives?: Array<{ transcript?: string }> };
};

export type NormalizedSpeechEvent = { transcript: string; utterance?: string };

const MAX_REMEMBERED_IDS = 100;
const FALLBACK_DEDUP_MS = 1500;

function cleanTranscript(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function getTranscript(message: DeepgramBoundaryMessage) {
  return cleanTranscript(message.transcript) || cleanTranscript(message.channel?.alternatives?.[0]?.transcript);
}

function getProviderId(message: DeepgramBoundaryMessage) {
  const explicitId = cleanTranscript(message.utterance_id)
    || cleanTranscript(message.turn_id)
    || cleanTranscript(message.metadata?.utterance_id);
  if (explicitId) return explicitId;
  return message.turn_index === undefined || message.turn_index === null ? "" : `turn:${String(message.turn_index)}`;
}

function getSegmentId(message: DeepgramBoundaryMessage, transcript: string) {
  if (message.start === undefined && message.duration === undefined) return "";
  return `${String(message.start ?? "")}~${String(message.duration ?? "")}~${transcript.toLowerCase()}`;
}

/**
 * Combines finalized legacy Results segments and emits each completed turn once.
 * The instance belongs to one websocket session, so a reconnect starts cleanly.
 */
export class PitchUtteranceNormalizer {
  private finalizedSegments: string[] = [];
  private delivered = new Set<string>();
  private segmentIds = new Set<string>();
  private fallbackDelivered = new Map<string, number>();
  private lastFlushedEnd = -1;
  private pendingEnd = -1;
  private readonly now: () => number;

  constructor(now: () => number = Date.now) { this.now = now; }

  reset() {
    this.finalizedSegments = [];
    this.delivered.clear();
    this.segmentIds.clear();
    this.fallbackDelivered.clear();
    this.lastFlushedEnd = -1;
    this.pendingEnd = -1;
  }

  consume(message: DeepgramBoundaryMessage | null | undefined): NormalizedSpeechEvent | null {
    if (!message || typeof message !== "object" || Array.isArray(message)) return null;
    if (message.type === "TurnInfo" && message.event === "StartOfTurn") this.fallbackDelivered.clear();
    const transcript = getTranscript(message);
    const isResults = message.type === "Results";
    const isTurnBoundary = message.type === "TurnInfo" && message.event === "EndOfTurn";
    const isBoundary = isTurnBoundary || (isResults && message.speech_final === true) || message.type === "UtteranceEnd";

    // An old UtteranceEnd can arrive after a new Results segment. Do not flush
    // that newer segment at the previous turn's boundary.
    if (message.type === "UtteranceEnd" && typeof message.last_word_end === "number"
      && message.last_word_end <= this.lastFlushedEnd) return null;

    if (isResults && (message.is_final === true || message.speech_final === true) && transcript) {
      const segmentId = getSegmentId(message, transcript);
      if (!segmentId || !this.segmentIds.has(segmentId)) {
        this.finalizedSegments.push(transcript);
        if (segmentId) this.remember(this.segmentIds, segmentId);
        if (typeof message.start === "number" && typeof message.duration === "number") {
          this.pendingEnd = Math.max(this.pendingEnd, message.start + message.duration);
        }
      }
    }
    if (!isBoundary) return transcript ? { transcript } : null;

    // Flux includes a completed turn on EndOfTurn. Legacy Results needs its final
    // fragments combined; do not append the speech_final fragment a second time.
    const assembled = cleanTranscript(isTurnBoundary && transcript ? transcript : this.finalizedSegments.join(" "));
    this.finalizedSegments = [];
    this.lastFlushedEnd = Math.max(this.lastFlushedEnd, this.pendingEnd);
    this.pendingEnd = -1;
    if (!assembled) return transcript ? { transcript } : null;

    const providerId = getProviderId(message);
    const fallbackKey = assembled.toLowerCase();
    const now = this.now();
    this.pruneFallbacks(now);
    if ((providerId && this.delivered.has(providerId)) || (!providerId && this.fallbackDelivered.has(fallbackKey))) {
      return { transcript: assembled };
    }
    if (providerId) this.remember(this.delivered, providerId);
    else {
      this.fallbackDelivered.set(fallbackKey, now);
      if (this.fallbackDelivered.size > MAX_REMEMBERED_IDS) this.fallbackDelivered.delete(this.fallbackDelivered.keys().next().value as string);
    }
    return { transcript: assembled, utterance: assembled };
  }

  private remember(set: Set<string>, value: string) {
    set.add(value);
    if (set.size > MAX_REMEMBERED_IDS) set.delete(set.values().next().value as string);
  }

  private pruneFallbacks(now: number) {
    for (const [value, createdAt] of this.fallbackDelivered) {
      if (now - createdAt > FALLBACK_DEDUP_MS) this.fallbackDelivered.delete(value);
    }
  }
}
