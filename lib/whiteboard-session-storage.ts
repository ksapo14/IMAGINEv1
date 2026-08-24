import type {
  BoardPlacement,
  ContentMode,
  RecentTurn,
  StickScene,
  WhiteboardScene,
  WhiteboardState
} from "@/components/workspace/types";

/** Board sessions use a separate store so lesson context records stay small and stable. */
export const WHITEBOARD_SESSION_STORAGE_KEY = "imagine-whiteboard-sessions-v1";
export const WHITEBOARD_SESSION_SCHEMA_VERSION = 4;

export type DashboardTab = "prepare" | "library" | "live";

export type WhiteboardSession = {
  lessonId: string;
  board: WhiteboardState;
  recentTurns: RecentTurn[];
  turnSequence: number;
  updatedAt: string;
};

export type WhiteboardSessionStore = {
  activeTab: DashboardTab;
  selectedLessonId: string;
  sessions: WhiteboardSession[];
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;
type SessionReadResult = { ok: true; value: WhiteboardSessionStore } | { ok: false; value: WhiteboardSessionStore; message: string };
export type SessionWriteResult = { ok: true } | { ok: false; message: string };

const tabs = new Set<DashboardTab>(["prepare", "library", "live"]);
const actions = new Set(["hold", "create", "update"]);
const entityTypes = new Set(["stickFigure", "circle", "rectangle"]);
const poses = new Set(["neutral", "pointing", "walking", "holding", "raisedArms"]);
const facings = new Set(["left", "right", "front"]);
const directions = new Set(["forward", "backward", "both", "none"]);
const contentModes = new Set<ContentMode>(["visual", "notes", "diagram"]);
const presentationFootprints = new Set(["8x5", "12x6", "16x7", "24x10"]);
const presentationFootprintOrder = ["8x5", "12x6", "16x7", "24x10"];
const maximumBoardScenes = 48;
const maximumBoardPages = maximumBoardScenes;

function minimumFootprintIndex(modes: ContentMode[]) {
  return modes.length === 3 || (modes.includes("visual") && modes.includes("diagram"))
    ? 3
    : modes.length === 2 || modes.includes("diagram") || modes[0] === "visual"
      ? 1
      : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isInteger(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function isBoundedString(value: unknown, maximum: number, required = false): value is string {
  return typeof value === "string" && value.length <= maximum && (!required || value.trim().length > 0);
}

function isSafeIdentifier(value: unknown, maximum: number): value is string {
  return isBoundedString(value, maximum, true) && /^[a-zA-Z0-9_-]+$/.test(value);
}

/** Legacy notes gain bullets from summary sentences, never from retired keywords. */
function summarySentences(summary: string) {
  return (summary.match(/[^.!?]+[.!?]?/g) ?? [summary])
    .map((sentence) => sentence.trim().slice(0, 120).trim())
    .filter(Boolean)
    .slice(0, 4);
}

function normalizePlacement(value: unknown, allowLegacy = false): BoardPlacement | null {
  if (!isRecord(value)) return null;
  const { page, column, row, width, height } = value;
  if (
    !isInteger(page, 1, maximumBoardPages) || !isInteger(column, 0, 23) || !isInteger(row, 0, 13)
    || !isInteger(width, 1, 24) || !isInteger(height, 1, 14)
    || column + width > 24 || row + height > 14
    || (!allowLegacy && !presentationFootprints.has(`${width}x${height}`))
  ) return null;
  return { page, column, row, width, height };
}

function stickEntitiesOverlap(first: StickScene["entities"][number], second: StickScene["entities"][number]) {
  return !(
    first.x + first.width <= second.x || second.x + second.width <= first.x
    || first.y + first.height <= second.y || second.y + second.height <= first.y
  );
}

/** Mirror the server allocator's one-cell gutter between reserved board regions. */
function boardPlacementsConflict(first: BoardPlacement, second: BoardPlacement) {
  if (first.page !== second.page) return false;
  return !(
    first.column + first.width < second.column || second.column + second.width < first.column
    || first.row + first.height < second.row || second.row + second.height < first.row
  );
}

/** Validate the trusted renderer's fixed vocabulary before restored data reaches React. */
function normalizeStickScene(value: unknown): StickScene | null {
  if (!isRecord(value) || value.version !== 1 || value.columns !== 12 || value.rows !== 8) return null;
  if (!Array.isArray(value.entities) || value.entities.length < 1 || value.entities.length > 6 || !Array.isArray(value.connections) || value.connections.length > 6) return null;

  const entityIds = new Set<string>();
  const entities = [] as StickScene["entities"];
  for (const candidate of value.entities) {
    if (!isRecord(candidate)) return null;
    const { id, type, x, y, width, height, label, pose, facing } = candidate;
    if (
      !isSafeIdentifier(id, 40) || entityIds.has(id) || !entityTypes.has(String(type))
      || !isInteger(x, 0, 11) || !isInteger(y, 0, 7)
      || !isInteger(width, 1, 12) || !isInteger(height, 1, 8)
      || x + width > 12 || y + height > 8 || !isBoundedString(label, 32)
      || !poses.has(String(pose)) || !facings.has(String(facing))
    ) return null;
    const entity = { id, type: type as StickScene["entities"][number]["type"], x, y, width, height, label, pose: pose as StickScene["entities"][number]["pose"], facing: facing as StickScene["entities"][number]["facing"] };
    if (entities.some((placed) => stickEntitiesOverlap(entity, placed))) return null;
    entityIds.add(id);
    entities.push(entity);
  }

  const connectionIds = new Set<string>();
  const connections = [] as StickScene["connections"];
  for (const candidate of value.connections) {
    if (!isRecord(candidate)) return null;
    const { id, fromId, toId, label, direction } = candidate;
    if (
      !isSafeIdentifier(id, 40) || connectionIds.has(id)
      || !isSafeIdentifier(fromId, 40) || !isSafeIdentifier(toId, 40)
      || fromId === toId || !entityIds.has(fromId) || !entityIds.has(toId)
      || !isBoundedString(label, 28) || !directions.has(String(direction))
    ) return null;
    connectionIds.add(id);
    connections.push({ id, fromId, toId, label, direction: direction as StickScene["connections"][number]["direction"] });
  }
  return { version: 1, columns: 12, rows: 8, entities, connections };
}

function normalizeScene(value: unknown, sourceSchema: 1 | 2 | 3 | 4): WhiteboardScene | null {
  if (!isRecord(value)) return null;
  const placement = normalizePlacement(value.placement, sourceSchema === 1);
  const modes = sourceSchema === 1
    ? ["visual", "notes", "diagram"] as ContentMode[]
    : Array.isArray(value.contentModes)
      && value.contentModes.length >= 1
      && value.contentModes.length <= 3
      && value.contentModes.every((mode) => contentModes.has(mode as ContentMode))
      && new Set(value.contentModes).size === value.contentModes.length
      ? value.contentModes as ContentMode[]
      : null;
  if (!modes) return null;
  const rawRenderMode = value.renderMode === "structured" || value.renderMode === "generatedAsset"
    ? value.renderMode
    : null;
  // Older structured visual-only scenes depended on the removed stock drawing.
  // Restore them as a clear unavailable generated visual instead of inventing art.
  const renderMode = sourceSchema < 4
    && rawRenderMode === "structured"
    && modes.includes("visual")
    && (modes.includes("diagram") || !normalizeStickScene(value.stickScene))
      ? "generatedAsset" as const
      : rawRenderMode;
  const needsStickScene = modes.includes("diagram") || (
    modes.includes("visual") && renderMode === "structured"
  );
  const stickScene = needsStickScene ? normalizeStickScene(value.stickScene) : null;
  const headingMode = sourceSchema < 4
    ? "show" as const
    : value.headingMode === "show" || value.headingMode === "inheritPrimary"
      ? value.headingMode
      : null;
  const summary = isBoundedString(value.summary, 320, true) ? value.summary : null;
  const legacy = sourceSchema < 3;
  const rawBullets = Array.isArray(value.summaryBullets) ? value.summaryBullets : [];
  const summaryBullets = legacy && summary
    ? modes.includes("notes") ? summarySentences(summary) : []
    : rawBullets.length <= 4
      && rawBullets.every((bullet) => isBoundedString(bullet, 120, true) && bullet === bullet.trim())
      ? rawBullets as string[]
      : null;
  const requiredFootprintIndex = minimumFootprintIndex(modes);
  const placementFootprintIndex = placement
    ? presentationFootprintOrder.indexOf(`${placement.width}x${placement.height}`)
    : -1;
  if (
    !isSafeIdentifier(value.sceneId, 80) || !isBoundedString(value.conceptKey, 80, true)
    || !/^[a-z0-9_-]+$/.test(value.conceptKey) || !isBoundedString(value.title, 100, true)
    || !summary || !summaryBullets || !placement || !headingMode || !renderMode
    || (modes.includes("notes") ? summaryBullets.length < 1 : summaryBullets.length !== 0)
    || (sourceSchema === 4 && placementFootprintIndex < requiredFootprintIndex)
    || (needsStickScene && !stickScene)
    || (!needsStickScene && value.stickScene != null)
    || (!modes.includes("visual") && renderMode !== "structured")
    || (modes.includes("visual") && modes.includes("diagram") && renderMode !== "generatedAsset")
  ) return null;
  return {
    sceneId: value.sceneId,
    conceptKey: value.conceptKey,
    title: value.title,
    headingMode,
    summaryBullets,
    summary,
    contentModes: modes,
    placement,
    stickScene,
    renderMode,
    generatedAsset: null,
    visualJobId: null,
    visualFailed: value.renderMode === "generatedAsset"
  };
}

function normalizeBoard(value: unknown, sourceSchema: 1 | 2 | 3 | 4): WhiteboardState | null {
  if (!isRecord(value) || value.columns !== 24 || value.rows !== 14) return null;
  if (!isInteger(value.version, 0) || !isInteger(value.currentPage, 1, maximumBoardPages) || !Array.isArray(value.scenes) || value.scenes.length > maximumBoardScenes) return null;
  const scenes = value.scenes.map((scene) => normalizeScene(scene, sourceSchema));
  if (scenes.some((scene) => !scene)) return null;
  let validScenes = scenes as WhiteboardScene[];
  let currentPage = value.currentPage;
  const needsFootprintMigration = sourceSchema < 4 && validScenes.some((scene) => (
    presentationFootprintOrder.indexOf(`${scene.placement.width}x${scene.placement.height}`)
    < minimumFootprintIndex(scene.contentModes)
  ));
  if (sourceSchema === 1 || needsFootprintMigration) {
    const currentIndex = validScenes.findIndex((scene) => scene.placement.page === value.currentPage);
    // Promote only when required, then isolate migrated reservations so a
    // larger footprint cannot collide with a retained legacy neighbor.
    validScenes = validScenes.map((scene, index) => ({
      ...scene,
      placement: (() => {
        const oldIndex = presentationFootprintOrder.indexOf(`${scene.placement.width}x${scene.placement.height}`);
        const footprint = presentationFootprintOrder[Math.max(oldIndex, minimumFootprintIndex(scene.contentModes), 0)];
        const [width, height] = footprint.split("x").map(Number);
        return { page: index + 1, column: 0, row: 0, width, height };
      })()
    }));
    currentPage = currentIndex >= 0 ? currentIndex + 1 : 1;
  }
  const sceneIds = new Set(validScenes.map((scene) => scene.sceneId));
  const conceptKeys = new Set(validScenes.map((scene) => scene.conceptKey));
  const maximumPage = Math.max(1, ...validScenes.map((scene) => scene.placement.page));
  const hasPlacementConflict = validScenes.some((scene, index) => (
    validScenes.slice(index + 1).some((candidate) => boardPlacementsConflict(scene.placement, candidate.placement))
  ));
  if (
    sceneIds.size !== validScenes.length || conceptKeys.size !== validScenes.length
    || value.version < validScenes.length || currentPage > maximumPage || hasPlacementConflict
    || (validScenes.length > 0 && validScenes[0].headingMode !== "show")
  ) return null;
  return { version: value.version, currentPage, columns: 24, rows: 14, scenes: validScenes };
}

function normalizeRecentTurns(value: unknown, turnSequence: number): RecentTurn[] | null {
  if (!Array.isArray(value) || value.length > 6) return null;
  const sequences = new Set<number>();
  let characterCount = 0;
  const turns = [] as RecentTurn[];
  for (const candidate of value) {
    if (!isRecord(candidate)) return null;
    const { action, conceptKey, summary, userInput } = candidate;
    if (
      !isInteger(candidate.turnSequence, 0, turnSequence) || sequences.has(candidate.turnSequence)
      || !actions.has(String(action)) || !isBoundedString(userInput, 2400)
      || !isBoundedString(conceptKey, 80) || !isBoundedString(summary, 320)
    ) return null;
    characterCount += userInput.length + conceptKey.length + summary.length;
    if (characterCount > 2400) return null;
    sequences.add(candidate.turnSequence);
    turns.push({ turnSequence: candidate.turnSequence, userInput, action: action as RecentTurn["action"], conceptKey, summary });
  }
  return turns;
}

function normalizeSession(value: unknown, knownLessonIds: Set<string>, sourceSchema: 1 | 2 | 3 | 4): WhiteboardSession | null {
  if (!isRecord(value) || value.schemaVersion !== sourceSchema) return null;
  if (typeof value.lessonId !== "string" || (value.lessonId !== "" && !knownLessonIds.has(value.lessonId))) return null;
  if (!isInteger(value.turnSequence, 0) || !isBoundedString(value.updatedAt, 40, true) || Number.isNaN(Date.parse(value.updatedAt))) return null;
  const board = normalizeBoard(value.board, sourceSchema);
  const recentTurns = normalizeRecentTurns(value.recentTurns, value.turnSequence);
  if (
    !board || !recentTurns || board.version > value.turnSequence
    || (board.scenes.length === 0 && board.version !== 0)
  ) return null;
  return { lessonId: value.lessonId, board, recentTurns, turnSequence: value.turnSequence, updatedAt: value.updatedAt };
}

export function createEmptyWhiteboardSession(lessonId: string, updatedAt = new Date().toISOString()): WhiteboardSession {
  return { lessonId, board: { version: 0, currentPage: 1, columns: 24, rows: 14, scenes: [] }, recentTurns: [], turnSequence: 0, updatedAt };
}

/** Load valid siblings independently so one damaged lesson never erases another. */
export function loadWhiteboardSessionStore(storage: StorageLike, lessonIds: string[]): SessionReadResult {
  const fallback: WhiteboardSessionStore = { activeTab: "prepare", selectedLessonId: lessonIds[0] ?? "", sessions: [] };
  try {
    const raw = storage.getItem(WHITEBOARD_SESSION_STORAGE_KEY);
    if (!raw) return { ok: true, value: fallback };
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || ![1, 2, 3, 4].includes(Number(parsed.schemaVersion))) {
      return { ok: false, value: fallback, message: "Saved whiteboard sessions use an unsupported format." };
    }
    const sourceSchema = parsed.schemaVersion as 1 | 2 | 3 | 4;
    const knownLessonIds = new Set(lessonIds);
    const rawSessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];
    const sessions: WhiteboardSession[] = [];
    const retainedIds = new Set<string>();
    let discarded = !Array.isArray(parsed.sessions);
    for (const candidate of rawSessions) {
      const session = normalizeSession(candidate, knownLessonIds, sourceSchema);
      if (!session || retainedIds.has(session.lessonId)) {
        discarded = true;
        continue;
      }
      retainedIds.add(session.lessonId);
      sessions.push(session);
    }
    const navigation = isRecord(parsed.navigation) ? parsed.navigation : {};
    const activeTab = tabs.has(navigation.activeTab as DashboardTab) ? navigation.activeTab as DashboardTab : "prepare";
    const selectedLessonId = typeof navigation.selectedLessonId === "string"
      && (navigation.selectedLessonId === "" || knownLessonIds.has(navigation.selectedLessonId))
      ? navigation.selectedLessonId : lessonIds[0] ?? "";
    discarded ||= activeTab !== navigation.activeTab || selectedLessonId !== navigation.selectedLessonId;
    const value = { activeTab, selectedLessonId, sessions };
    return discarded
      ? { ok: false, value, message: "Some saved whiteboard data was invalid and was safely ignored." }
      : sourceSchema < WHITEBOARD_SESSION_SCHEMA_VERSION
        ? { ok: false, value, message: "Saved whiteboards were upgraded to the current board format." }
        : { ok: true, value };
  } catch {
    return { ok: false, value: fallback, message: "Saved whiteboard sessions could not be read." };
  }
}

function durableSession(session: WhiteboardSession) {
  return {
    schemaVersion: WHITEBOARD_SESSION_SCHEMA_VERSION,
    lessonId: session.lessonId,
    board: {
      ...session.board,
      scenes: session.board.scenes.map((scene) => {
        const {
          generatedAsset: _asset,
          visualJobId: _job,
          keywords: _legacyKeywords,
          ...structuredScene
        } = scene as WhiteboardScene & { keywords?: unknown };
        return structuredScene;
      })
    },
    recentTurns: session.recentTurns,
    turnSequence: session.turnSequence,
    updatedAt: session.updatedAt
  };
}

/** Persist only structured scene data; generated images and pending jobs remain memory-only. */
export function saveWhiteboardSessionStore(storage: StorageLike, value: WhiteboardSessionStore): SessionWriteResult {
  try {
    storage.setItem(WHITEBOARD_SESSION_STORAGE_KEY, JSON.stringify({
      schemaVersion: WHITEBOARD_SESSION_SCHEMA_VERSION,
      navigation: { activeTab: value.activeTab, selectedLessonId: value.selectedLessonId },
      sessions: value.sessions.map(durableSession)
    }));
    return { ok: true };
  } catch (error) {
    const quota = error instanceof DOMException && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED");
    return { ok: false, message: quota ? "Local whiteboard storage is full. Your board remains open in this tab." : "This browser could not save whiteboard sessions. Your board remains open in this tab." };
  }
}
