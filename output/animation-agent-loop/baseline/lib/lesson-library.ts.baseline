import type { LessonContextRecord } from "@/components/workspace/types";

/** Lesson records remain browser-local and intentionally contain no generated media. */
export const LESSON_LIBRARY_KEY = "imagine-lesson-library-v1";

type StorageLike = Pick<Storage, "getItem" | "setItem">;
export type LibraryWriteResult = { ok: true } | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeLesson(value: unknown): LessonContextRecord | null {
  if (!isRecord(value) || (value.schemaVersion !== 1 && value.schemaVersion !== 2)) {
    return null;
  }
  const required = ["id", "title", "subject", "source", "createdAt", "updatedAt"];
  if (!required.every((key) => typeof value[key] === "string")) {
    return null;
  }
  return {
    schemaVersion: 2,
    id: String(value.id),
    title: String(value.title).trim().slice(0, 160),
    subject: String(value.subject).trim().slice(0, 120),
    source: String(value.source).trim().slice(0, 3600),
    createdAt: String(value.createdAt),
    updatedAt: String(value.updatedAt)
  };
}

export function loadLessonLibrary(storage: StorageLike): LessonContextRecord[] {
  try {
    const raw = storage.getItem(LESSON_LIBRARY_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeLesson)
      .filter((lesson): lesson is LessonContextRecord => Boolean(lesson))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } catch {
    return [];
  }
}

export function saveLessonLibrary(
  storage: StorageLike,
  lessons: LessonContextRecord[]
): LibraryWriteResult {
  try {
    const contexts = lessons.map(({ id, title, subject, source, createdAt, updatedAt }) => ({
      schemaVersion: 2 as const,
      id,
      title: title.trim().slice(0, 160),
      subject: subject.trim().slice(0, 120),
      source: source.trim().slice(0, 3600),
      createdAt,
      updatedAt
    }));
    storage.setItem(LESSON_LIBRARY_KEY, JSON.stringify(contexts));
    return { ok: true };
  } catch (error) {
    const quota = error instanceof DOMException &&
      (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED");
    return {
      ok: false,
      message: quota
        ? "Local lesson storage is full. Delete an older lesson context."
        : "This browser could not save the lesson library."
    };
  }
}

export function upsertLesson(lessons: LessonContextRecord[], lesson: LessonContextRecord) {
  return [lesson, ...lessons.filter((candidate) => candidate.id !== lesson.id)]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function removeLesson(lessons: LessonContextRecord[], lessonId: string) {
  return lessons.filter((lesson) => lesson.id !== lessonId);
}
