import { PITCH_SLIDES } from "./deck.ts";
import type { PitchDecision, PitchMatchingCues, PitchModelAdapter, PitchModelInput, SlideId } from "./types.ts";

/** Matching cues are deck-owned and deliberately separate from transition safety. */
export const PITCH_SLIDE_MATCHING_CUES: Readonly<Record<SlideId, PitchMatchingCues>> = Object.fromEntries(
  PITCH_SLIDES.map((slide) => [slide.id, slide.matching])
);

function abortedError() {
  const error = new Error("Pitch model evaluation was cancelled.");
  error.name = "AbortError";
  return error;
}

/** Normalize ordinary transcript differences without turning substrings into matches. */
export function normalizePitchUtterance(value: string) {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Match a cue as complete normalized tokens, never as part of a larger word. */
function includesTokenSequence(tokens: readonly string[], phrase: string) {
  const phraseTokens = normalizePitchUtterance(phrase).split(" ").filter(Boolean);
  if (phraseTokens.length < 2 || phraseTokens.length > tokens.length) return false;
  return tokens.some((_, start) => phraseTokens.every((token, index) => tokens[start + index] === token));
}

function countPhraseMatches(tokens: readonly string[], phrases: readonly string[]) {
  return phrases.reduce((count, phrase) => count + Number(includesTokenSequence(tokens, phrase)), 0);
}

function countKeywordMatches(tokens: ReadonlySet<string>, keywords: readonly string[]) {
  return new Set(keywords.map(normalizePitchUtterance).filter((keyword) => tokens.has(keyword))).size;
}

type Candidate = { slideId: SlideId; score: number; qualifies: boolean };

function scoreCandidate(tokens: readonly string[], tokenSet: ReadonlySet<string>, slideId: SlideId, cues: PitchMatchingCues): Candidate {
  const phrases = countPhraseMatches(tokens, cues.phrases);
  const keywords = countKeywordMatches(tokenSet, cues.keywords);
  return {
    slideId,
    score: phrases * 4 + keywords,
    qualifies: phrases >= 1 || keywords >= 2
  };
}

/**
 * A transparent lexical adapter keeps Pitch Mode testable before a fine-tuned
 * FunctionGemma endpoint is available. It never decides navigation by itself.
 */
export function createMockPitchModelAdapter(
  cues: Readonly<Record<SlideId, PitchMatchingCues>> = PITCH_SLIDE_MATCHING_CUES
): PitchModelAdapter {
  return {
    async evaluate(input, { signal }) {
      if (signal.aborted) throw abortedError();
      const utterance = normalizePitchUtterance(input.latestUtterance);
      if (!utterance) return { action: "no_action" };

      const utteranceTokens = utterance.split(" ");
      const tokenSet = new Set(utteranceTokens);
      const candidates = input.availableSlides
        .map((slide) => cues[slide.id] && scoreCandidate(utteranceTokens, tokenSet, slide.id, cues[slide.id]))
        .filter((candidate): candidate is Candidate => Boolean(candidate && candidate.qualifies));
      if (!candidates.length) return { action: "no_action" };

      const highestScore = Math.max(...candidates.map((candidate) => candidate.score));
      const leaders = candidates.filter((candidate) => candidate.score === highestScore);
      if (leaders.length !== 1 || leaders[0].slideId === input.currentSlide.id) {
        return { action: "no_action" };
      }
      if (signal.aborted) throw abortedError();
      return { action: "goto_slide", slide_id: leaders[0].slideId };
    }
  };
}

/** Runtime validation protects the controller from future HTTP adapter responses. */
export function isPitchDecision(value: unknown): value is PitchDecision {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.action === "no_action"
    || (candidate.action === "goto_slide" && typeof candidate.slide_id === "string" && candidate.slide_id.trim().length > 0);
}
