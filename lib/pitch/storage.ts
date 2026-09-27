import { PITCH_DECK, PITCH_DECK_ID, PITCH_DECK_VERSION, PITCH_START_SLIDE_ID } from "./deck.ts";
import type { SlideDescriptor, SlideId } from "./types.ts";

export const PITCH_PRESENTATION_STORAGE_KEY = "imagine-pitch-presentation-v1";
export const PITCH_PRESENTATION_STORAGE_SCHEMA_VERSION = 1;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export type PitchStorageConfig = {
  deckId?: string;
  deckVersion?: number;
  slides?: readonly SlideDescriptor[];
  fallbackSlideId?: SlideId;
};

export type PitchStorageResult = { ok: true } | { ok: false; message: string };

type StoredPitchPresentation = {
  schemaVersion: number;
  deckId: string;
  deckVersion: number;
  currentSlideId: SlideId;
};

function defaults(config: PitchStorageConfig) {
  const slides = config.slides ?? PITCH_DECK;
  return {
    deckId: config.deckId ?? PITCH_DECK_ID,
    deckVersion: config.deckVersion ?? PITCH_DECK_VERSION,
    slides,
    fallbackSlideId: config.fallbackSlideId ?? PITCH_START_SLIDE_ID
  };
}

/** Restore only the current semantic slide for this exact deck version. */
export function loadPitchPresentation(storage: StorageLike | null | undefined, config: PitchStorageConfig = {}) {
  const { deckId, deckVersion, slides, fallbackSlideId } = defaults(config);
  const fallback = slides.some((slide) => slide.id === fallbackSlideId) ? fallbackSlideId : slides[0]?.id;
  if (!storage || !fallback) return fallback ?? "";
  try {
    const raw = storage.getItem(PITCH_PRESENTATION_STORAGE_KEY);
    const saved = raw ? JSON.parse(raw) as unknown : null;
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return fallback;
    const value = saved as Partial<StoredPitchPresentation>;
    return value.schemaVersion === PITCH_PRESENTATION_STORAGE_SCHEMA_VERSION
      && value.deckId === deckId
      && value.deckVersion === deckVersion
      && typeof value.currentSlideId === "string"
      && slides.some((slide) => slide.id === value.currentSlideId)
      ? value.currentSlideId
      : fallback;
  } catch {
    return fallback;
  }
}

/** Save only durable deck identity and slide selection; transcripts never enter storage. */
export function savePitchPresentation(
  storage: StorageLike | null | undefined,
  currentSlideId: SlideId,
  config: PitchStorageConfig = {}
): PitchStorageResult {
  const { deckId, deckVersion, slides } = defaults(config);
  if (!storage) return { ok: false, message: "This browser cannot save presentation state." };
  if (!slides.some((slide) => slide.id === currentSlideId)) {
    return { ok: false, message: "That slide is not part of this presentation." };
  }
  try {
    storage.setItem(PITCH_PRESENTATION_STORAGE_KEY, JSON.stringify({
      schemaVersion: PITCH_PRESENTATION_STORAGE_SCHEMA_VERSION,
      deckId,
      deckVersion,
      currentSlideId
    } satisfies StoredPitchPresentation));
    return { ok: true };
  } catch {
    return { ok: false, message: "This browser could not save presentation state." };
  }
}
