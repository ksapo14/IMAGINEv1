/** A stable identifier lets models and renderers refer to slides without position-based routing. */
export type SlideId = string;

/** The model receives this portable summary rather than React, audio, or SVG data. */
export type SlideDescriptor = {
  id: SlideId;
  title: string;
  description: string;
};

export type PitchModelInput = {
  latestUtterance: string;
  currentSlide: SlideDescriptor;
  availableSlides: readonly SlideDescriptor[];
};

/** Model output is intentionally limited to one safe navigation proposal. */
export type PitchDecision =
  | { action: "goto_slide"; slide_id: SlideId }
  | { action: "no_action" };

/** Deck-owned evidence for conservative automatic navigation. */
export type PitchMatchingCues = {
  phrases: readonly string[];
  keywords: readonly string[];
};

export type PitchSlideDefinition = SlideDescriptor & {
  matching: PitchMatchingCues;
};

/** FunctionGemma and test adapters implement this interface without changing the UI. */
export interface PitchModelAdapter {
  evaluate(input: PitchModelInput, options: { signal: AbortSignal }): Promise<PitchDecision>;
}
