import type {
  CompositionBlock,
  GenerateResponse,
  LessonPack,
  LessonStatus
} from "@/components/workspace/types";

export const LESSON_LIBRARY_KEY = "imagine-lesson-library-v1";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export type LibraryWriteResult =
  | { ok: true }
  | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeRecallPhrase(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseRecallCommand(value: string) {
  const match = value.match(
    /^\s*imagine[\s,]+show\s+me[\s,]+(.+?)[.!?]*\s*$/i
  );
  if (!match) {
    return null;
  }

  const phrase = normalizeRecallPhrase(match[1]);
  return phrase || null;
}

export function isVisualBlock(block: CompositionBlock) {
  return (
    block.kind === "diagram" ||
    block.kind === "image" ||
    Boolean(block.visual) ||
    Boolean(block.visualJobId)
  );
}

export function getPreparedVisuals(lesson: LessonPack) {
  return lesson.composition.blocks.filter(isVisualBlock);
}

export function findPreparedVisual(lesson: LessonPack, phrase: string) {
  const normalized = normalizeRecallPhrase(phrase);
  if (!normalized) {
    return null;
  }

  const matches = getPreparedVisuals(lesson).filter((block) =>
    block.recallPhrases.some(
      (candidate) => normalizeRecallPhrase(candidate) === normalized
    )
  );

  return matches.length === 1 ? matches[0] : null;
}

export function getDuplicateRecallPhrases(blocks: CompositionBlock[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  blocks.filter(isVisualBlock).forEach((block) => {
    block.recallPhrases.forEach((phrase) => {
      const normalized = normalizeRecallPhrase(phrase);
      if (!normalized) {
        return;
      }
      if (seen.has(normalized)) {
        duplicates.add(normalized);
      }
      seen.add(normalized);
    });
  });

  return [...duplicates];
}

function normalizeBlock(value: unknown): CompositionBlock | null {
  if (!isRecord(value) || typeof value.blockId !== "string") {
    return null;
  }

  const block = value as unknown as CompositionBlock;
  if (
    typeof block.kind !== "string" ||
    typeof block.title !== "string" ||
    typeof block.body !== "string" ||
    !Array.isArray(block.items) ||
    typeof block.size !== "string"
  ) {
    return null;
  }

  const recallPhrases = Array.isArray(block.recallPhrases)
    ? block.recallPhrases
        .filter((phrase): phrase is string => typeof phrase === "string")
        .map((phrase) => phrase.trim())
        .filter(Boolean)
        .slice(0, 3)
    : [];
  const hadPendingVisual = typeof block.visualJobId === "string";

  return {
    ...block,
    items: block.items.filter((item): item is string => typeof item === "string"),
    recallPhrases,
    visualAlt:
      typeof block.visualAlt === "string"
        ? block.visualAlt
        : block.visual?.alt ?? "",
    visualJobId: null,
    visualFailed:
      block.visualFailed || (hadPendingVisual && !block.visual) || undefined
  };
}

function normalizeComposition(value: unknown): GenerateResponse | null {
  if (!isRecord(value) || !Array.isArray(value.blocks)) {
    return null;
  }

  const composition = value as unknown as GenerateResponse;
  if (
    typeof composition.title !== "string" ||
    typeof composition.layoutMode !== "string" ||
    !isRecord(composition.theme)
  ) {
    return null;
  }

  const blocks = composition.blocks
    .map(normalizeBlock)
    .filter((block): block is CompositionBlock => Boolean(block));
  if (blocks.length === 0) {
    return null;
  }

  return { ...composition, blocks };
}

function normalizeLesson(value: unknown): LessonPack | null {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    return null;
  }

  const composition = normalizeComposition(value.composition);
  if (
    !composition ||
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.subject !== "string" ||
    typeof value.source !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }

  const hasFailedVisual = composition.blocks.some(
    (block) => isVisualBlock(block) && !block.visual
  );
  const status: LessonStatus = hasFailedVisual ? "partial" : "ready";

  return {
    schemaVersion: 1,
    id: value.id,
    title: value.title,
    subject: value.subject,
    source: value.source,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    status,
    composition
  };
}

export function loadLessonLibrary(storage: StorageLike): LessonPack[] {
  try {
    const raw = storage.getItem(LESSON_LIBRARY_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map(normalizeLesson)
      .filter((lesson): lesson is LessonPack => Boolean(lesson))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } catch {
    return [];
  }
}

export function saveLessonLibrary(
  storage: StorageLike,
  lessons: LessonPack[]
): LibraryWriteResult {
  try {
    const stableLessons = lessons.map((lesson) => {
      const blocks = lesson.composition.blocks.map((block) => {
        if (!block.visualJobId) {
          return block;
        }
        return {
          ...block,
          visualJobId: null,
          visualFailed: block.visualFailed || !block.visual || undefined
        };
      });
      return {
        ...lesson,
        status: lesson.status === "generating" ? "partial" : lesson.status,
        composition: { ...lesson.composition, blocks }
      };
    });
    storage.setItem(LESSON_LIBRARY_KEY, JSON.stringify(stableLessons));
    return { ok: true };
  } catch (error) {
    const isQuotaError =
      error instanceof DOMException &&
      (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED");
    return {
      ok: false,
      message: isQuotaError
        ? "Local lesson storage is full. Delete an older lesson or use fewer raster images."
        : "This browser could not save the lesson library."
    };
  }
}

export function upsertLesson(
  lessons: LessonPack[],
  lesson: LessonPack
) {
  return [lesson, ...lessons.filter((candidate) => candidate.id !== lesson.id)].sort(
    (left, right) => right.updatedAt.localeCompare(left.updatedAt)
  );
}

export function removeLesson(lessons: LessonPack[], lessonId: string) {
  return lessons.filter((lesson) => lesson.id !== lessonId);
}

export function withBlockRecallPhrases(
  lesson: LessonPack,
  blockId: string,
  phrases: string[]
): LessonPack {
  const cleaned = phrases
    .map((phrase) => phrase.trim())
    .filter(Boolean)
    .slice(0, 3);
  return {
    ...lesson,
    updatedAt: new Date().toISOString(),
    composition: {
      ...lesson.composition,
      blocks: lesson.composition.blocks.map((block) =>
        block.blockId === blockId
          ? { ...block, recallPhrases: cleaned }
          : block
      )
    }
  };
}
