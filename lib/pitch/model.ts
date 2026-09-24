import { API_BASE_URL } from "../api-base.ts";
import { PITCH_SLIDE_MATCHING_CUES } from "./deck.ts";
import type { PitchDecision, PitchMatchingCues, PitchModelAdapter, PitchModelInput, SlideId } from "./types.ts";

function abortedError() {
  const error = new Error("Pitch model evaluation was cancelled.");
  error.name = "AbortError";
  return error;
}

const SAFE_FAILURE_MESSAGES = {
  function_gemma_runtime_unavailable: "FunctionGemma is not running. Start its server, then try again.",
  function_gemma_auth_rejected: "FunctionGemma rejected its backend credential. Check the backend configuration.",
  function_gemma_configuration: "FunctionGemma is not configured correctly.",
  function_gemma_endpoint_invalid: "FunctionGemma's endpoint is not configured correctly.",
  function_gemma_redirect_blocked: "FunctionGemma redirected the request. Configure its direct endpoint instead.",
  function_gemma_protocol_error: "FunctionGemma does not support the required slide-decision protocol.",
  function_gemma_timeout: "FunctionGemma took too long. The current slide was kept.",
  function_gemma_busy: "FunctionGemma is busy. The current slide was kept.",
  function_gemma_local_python_unavailable: "Local FunctionGemma Python is unavailable. Check the local runtime setup.",
  function_gemma_local_dependency_missing: "Local FunctionGemma is missing Python dependencies.",
  function_gemma_local_cache_missing: "The local FunctionGemma model is not cached yet.",
  function_gemma_local_load_failure: "Local FunctionGemma could not load its model.",
  function_gemma_local_inference_failed: "Local FunctionGemma could not make a decision. The current slide was kept.",
  function_gemma_local_runtime_unavailable: "Local FunctionGemma is restarting. The current slide was kept.",
  function_gemma_upstream_error: "FunctionGemma is temporarily unavailable. The current slide was kept.",
  function_gemma_unavailable: "Slide decisions are unavailable. The current slide was kept."
} as const;

type PitchFailureCode = keyof typeof SAFE_FAILURE_MESSAGES;
const GENERIC_FAILURE_CODE: PitchFailureCode = "function_gemma_unavailable";

/** Browser-safe error: response text is deliberately never trusted or displayed. */
export class PitchModelError extends Error {
  readonly code: PitchFailureCode;

  constructor(code: PitchFailureCode) {
    super(SAFE_FAILURE_MESSAGES[code]);
    this.name = "PitchModelError";
    this.code = code;
  }
}

function errorCode(value: unknown): PitchFailureCode {
  if (!value || typeof value !== "object" || Array.isArray(value)) return GENERIC_FAILURE_CODE;
  const detail = (value as Record<string, unknown>).detail;
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return GENERIC_FAILURE_CODE;
  const code = (detail as Record<string, unknown>).code;
  return typeof code === "string" && Object.hasOwn(SAFE_FAILURE_MESSAGES, code)
    ? code as PitchFailureCode
    : GENERIC_FAILURE_CODE;
}

/** Normalize text before exact cue comparison; substrings never count as matches. */
export function normalizePitchUtterance(value: string) {
  return value.normalize("NFKD").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

function includesTokenSequence(tokens: readonly string[], phrase: string) {
  const phraseTokens = normalizePitchUtterance(phrase).split(" ").filter(Boolean);
  return phraseTokens.length >= 2 && phraseTokens.length <= tokens.length
    && tokens.some((_, start) => phraseTokens.every((token, index) => tokens[start + index] === token));
}

function cueCounts(tokens: readonly string[], tokenSet: ReadonlySet<string>, cues: PitchMatchingCues) {
  const phrases = cues.phrases.reduce((count, phrase) => count + Number(includesTokenSequence(tokens, phrase)), 0);
  const keywords = new Set(cues.keywords.map(normalizePitchUtterance).filter((keyword) => tokenSet.has(keyword))).size;
  return { phrases, keywords };
}

function strongCandidates(input: PitchModelInput) {
  const normalized = normalizePitchUtterance(input.latestUtterance);
  if (!normalized) return [];
  const tokens = normalized.split(" ");
  const tokenSet = new Set(tokens);
  return input.availableSlides.map((slide) => {
    const cues = PITCH_SLIDE_MATCHING_CUES[slide.id];
    if (!cues) return null;
    const { phrases, keywords } = cueCounts(tokens, tokenSet, cues);
    return phrases || keywords >= 2 ? { slideId: slide.id, score: phrases * 4 + keywords } : null;
  }).filter((candidate): candidate is { slideId: SlideId; score: number } => candidate !== null);
}

/** Return only an unambiguous, non-current slide with strong deck-owned evidence. */
export function highConfidencePitchDecision(input: PitchModelInput): PitchDecision | null {
  const candidates = strongCandidates(input);
  if (!candidates.length) return null;
  const highestScore = Math.max(...candidates.map((candidate) => candidate.score));
  const leaders = candidates.filter((candidate) => candidate.score === highestScore);
  return leaders.length === 1 && leaders[0].slideId !== input.currentSlide.id
    ? { action: "goto_slide", slide_id: leaders[0].slideId }
    : null;
}

/** Model moves require the same evidence as a deterministic direct route. */
function modelProposalHasSupport(input: PitchModelInput, slideId: string) {
  const deterministicDecision = highConfidencePitchDecision(input);
  return deterministicDecision?.action === "goto_slide" && deterministicDecision.slide_id === slideId;
}

/** Runtime validation protects the controller from malformed HTTP responses. */
export function isPitchDecision(value: unknown): value is PitchDecision {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.action === "no_action"
    ? Object.keys(candidate).length === 1
    : candidate.action === "goto_slide"
      && typeof candidate.slide_id === "string"
      && candidate.slide_id.trim().length > 0
      && Object.keys(candidate).length === 2;
}

/** Send finalized speech to the backend-owned FunctionGemma decision service. */
export function createFunctionGemmaPitchModelAdapter(fetcher: typeof fetch = fetch): PitchModelAdapter {
  return {
    async evaluate(input: PitchModelInput, { signal }): Promise<PitchDecision> {
      if (signal.aborted) throw abortedError();
      const deterministicDecision = highConfidencePitchDecision(input);
      if (deterministicDecision) return deterministicDecision;
      let response: Response;
      try {
        response = await fetcher(`${API_BASE_URL}/api/pitch/decide`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") throw error;
        throw new PitchModelError("function_gemma_unavailable");
      }
      if (!response.ok) {
        let payload: unknown = null;
        try {
          payload = await response.json();
        } catch {
          // The status code alone is not a safe or actionable browser message.
        }
        throw new PitchModelError(errorCode(payload));
      }
      let decision: unknown;
      try {
        decision = await response.json();
      } catch {
        throw new PitchModelError("function_gemma_unavailable");
      }
      if (!isPitchDecision(decision)) throw new Error("Slide evaluation returned an invalid decision.");
      if (decision.action === "goto_slide" && !input.availableSlides.some((slide) => slide.id === decision.slide_id)) {
        throw new Error("Slide evaluation returned an unavailable slide.");
      }
      if (decision.action === "goto_slide" && !modelProposalHasSupport(input, decision.slide_id)) {
        return { action: "no_action" };
      }
      return decision;
    }
  };
}
