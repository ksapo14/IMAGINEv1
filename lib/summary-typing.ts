/** A readable chat-like pace that still keeps a full four-bullet summary bounded. */
export const SUMMARY_TYPING_GRAPHEMES_PER_SECOND = 50;
export const SUMMARY_TYPING_MIN_DURATION_SECONDS = 0.16;
export const SUMMARY_TYPING_MAX_DURATION_SECONDS = 9.6;

export type SummaryTypingFrame = {
  index: number;
  text: string;
};

export type SummaryTypingPlan = {
  frames: Array<{ index: number; graphemes: string[] }>;
  totalGraphemes: number;
  durationSeconds: number;
};

/** Split user-facing text without breaking emoji, combining marks, or other grapheme clusters. */
export function splitGraphemes(text: string) {
  if (typeof Intl.Segmenter === "function") {
    return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), ({ segment }) => segment);
  }
  return Array.from(text);
}

/** Return only the bullet positions whose displayed text is new or changed. */
export function getChangedSummaryBulletIndexes(previousBullets: string[] | undefined, nextBullets: string[]) {
  return nextBullets.flatMap((bullet, index) => previousBullets?.[index] === bullet ? [] : [index]);
}

/** Build one sequential stream so later bullets wait until earlier changed bullets finish. */
export function createSummaryTypingPlan(bullets: string[], changedIndexes: number[]): SummaryTypingPlan {
  const uniqueIndexes = [...new Set(changedIndexes)]
    .filter((index) => Number.isInteger(index) && index >= 0 && index < bullets.length)
    .sort((first, second) => first - second);
  const frames = uniqueIndexes.map((index) => ({ index, graphemes: splitGraphemes(bullets[index]) }));
  const totalGraphemes = frames.reduce((total, frame) => total + frame.graphemes.length, 0);
  const durationSeconds = totalGraphemes === 0
    ? 0
    : Math.min(
      SUMMARY_TYPING_MAX_DURATION_SECONDS,
      Math.max(SUMMARY_TYPING_MIN_DURATION_SECONDS, totalGraphemes / SUMMARY_TYPING_GRAPHEMES_PER_SECOND)
    );
  return { frames, totalGraphemes, durationSeconds };
}

/** Render a safe text-only frame at a precise point in the shared bullet stream. */
export function renderSummaryTypingFrame(plan: SummaryTypingPlan, visibleGraphemes: number): SummaryTypingFrame[] {
  let remaining = Math.max(0, Math.min(plan.totalGraphemes, Math.floor(visibleGraphemes)));
  return plan.frames.map((frame) => {
    const visible = Math.min(frame.graphemes.length, remaining);
    remaining -= visible;
    return { index: frame.index, text: frame.graphemes.slice(0, visible).join("") };
  });
}

/** Keep cancellation explicit so a cleaned-up animation never writes stale text into a later view. */
export function createSummaryTypingSession(plan: SummaryTypingPlan) {
  let cancelled = false;
  return {
    plan,
    render(visibleGraphemes: number) {
      return cancelled ? [] : renderSummaryTypingFrame(plan, visibleGraphemes);
    },
    complete() {
      return cancelled ? [] : renderSummaryTypingFrame(plan, plan.totalGraphemes);
    },
    cancel() {
      cancelled = true;
    }
  };
}
