import assert from "node:assert/strict";
import test from "node:test";
import { FRONTEND_ONLY_NOTICE, isFrontendOnlyDeployment } from "../lib/deployment-mode.ts";
import { LESSON_LIBRARY_KEY, loadLessonLibrary, saveLessonLibrary } from "../lib/lesson-library.ts";
import { streamGeneration, validateGenerateResponse } from "../lib/generation-stream.ts";
import { consumeWakeCommand, dequeueLiveTurn, enqueueLiveTurn, IDLE_WAKE_COMMAND_STATE, isDuplicateFinalizedSpeech } from "../lib/live-session.ts";
import { createSummaryTypingPlan, createSummaryTypingSession, getChangedSummaryBulletIndexes, renderSummaryTypingFrame } from "../lib/summary-typing.ts";
import { appendRecentTurn, applyBoardDecision, cancelRemovedVisualJobs, cancelSupersededVisualJob, EMPTY_WHITEBOARD, getBoardDigest, getConceptMemory, MAX_BOARD_SCENES, patchGeneratedAsset, sceneOwnsVisualJob, settlePendingVisualJobs, shouldAnimateDiagramNotesExpansion } from "../lib/whiteboard-session.ts";
import { createEmptyWhiteboardSession, loadWhiteboardSessionStore, saveWhiteboardSessionStore, WHITEBOARD_SESSION_SCHEMA_VERSION, WHITEBOARD_SESSION_STORAGE_KEY } from "../lib/whiteboard-session-storage.ts";
import { getSiteOrigin } from "../lib/site-origin.ts";
import { resolveVercelFrontendOnly } from "../scripts/vercel-build.mjs";

async function withDeploymentEnv(values, callback) {
  const names = ["NEXT_PUBLIC_FRONTEND_ONLY", "NEXT_PUBLIC_VERCEL_ENV", "NEXT_PUBLIC_SITE_URL", "VERCEL_PROJECT_PRODUCTION_URL", "IMAGINE_VERCEL_BUILD", "VERCEL"];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) {
      if (values[name] === undefined) delete process.env[name];
      else process.env[name] = values[name];
    }
    return await callback();
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
}

test("summary typing reveals changed Unicode bullets sequentially at the bounded reading pace", () => {
  const bullets = ["Stable bullet.", "A 👩🏽‍🔬 joins e\u0301nergy.", "Third bullet."];
  const changedIndexes = getChangedSummaryBulletIndexes(
    ["Stable bullet.", "Older wording.", "Third bullet."],
    bullets
  );
  const plan = createSummaryTypingPlan(bullets, changedIndexes);

  assert.deepEqual(changedIndexes, [1]);
  assert.equal(plan.frames.length, 1);
  assert.equal(plan.frames[0].graphemes.includes("👩🏽‍🔬"), true);
  assert.equal(plan.frames[0].graphemes.includes("é"), true);
  assert.ok(plan.durationSeconds >= 0.16);
  assert.ok(plan.durationSeconds <= 9.6);
  assert.deepEqual(renderSummaryTypingFrame(plan, 2), [{ index: 1, text: "A " }]);
  assert.deepEqual(renderSummaryTypingFrame(plan, plan.totalGraphemes), [{ index: 1, text: bullets[1] }]);

  const multiBulletPlan = createSummaryTypingPlan(["🙂 first", "second"], [1, 0]);
  const firstBulletLength = multiBulletPlan.frames[0].graphemes.length;
  assert.deepEqual(renderSummaryTypingFrame(multiBulletPlan, firstBulletLength + 1), [
    { index: 0, text: "🙂 first" },
    { index: 1, text: "s" }
  ]);
});

test("summary typing sessions cancel stale writes and a new revision starts cleanly", () => {
  const plan = createSummaryTypingPlan(["First", "Second"], [0, 1]);
  const session = createSummaryTypingSession(plan);
  assert.deepEqual(session.render(2), [
    { index: 0, text: "Fi" },
    { index: 1, text: "" }
  ]);
  assert.deepEqual(session.complete(), [
    { index: 0, text: "First" },
    { index: 1, text: "Second" }
  ]);
  session.cancel();
  assert.deepEqual(session.render(plan.totalGraphemes), []);

  const nextRevision = createSummaryTypingSession(plan);
  assert.deepEqual(nextRevision.render(1), [
    { index: 0, text: "F" },
    { index: 1, text: "" }
  ]);
});

const stickScene = {
  version: 1,
  columns: 12,
  rows: 8,
  entities: [{ id: "cell", type: "circle", x: 1, y: 1, width: 3, height: 3, label: "Cell", pose: "neutral", facing: "front" }],
  connections: []
};

function decision(overrides = {}) {
  const result = {
    boardVersion: 1,
    turnSequence: 1,
    boardStrategy: "integrate",
    action: "create",
    mergeBehavior: "replace",
    conceptKey: "cell-energy",
    title: "Cell energy",
    headingMode: "show",
    summaryBullets: ["Cells store usable energy in ATP."],
    summary: "Cells store usable energy in ATP.",
    contentModes: ["visual", "notes", "diagram"],
    confidence: 0.9,
    sceneId: "scene-1",
    targetSceneId: null,
    requestedFootprint: "full",
    placement: { page: 1, column: 0, row: 0, width: 24, height: 10 },
    stickScene,
    renderMode: "generatedAsset",
    generatedAsset: null,
    visualJobId: "job-default",
    warning: null,
    ...overrides
  };
  if (!("summaryBullets" in overrides) && Array.isArray(result.contentModes) && !result.contentModes.includes("notes")) {
    result.summaryBullets = [];
  }
  if (!("stickScene" in overrides) && Array.isArray(result.contentModes) && !result.contentModes.includes("visual")) {
    result.stickScene = null;
  }
  return result;
}

function request() {
  return {
    userInput: "Explain ATP",
    mode: "live",
    turnSequence: 1,
    lessonContext: { title: "Respiration", subject: "Biology", source: "Teach ATP." },
    recentTurns: [],
    concepts: [],
    board: getBoardDigest(EMPTY_WHITEBOARD)
  };
}

test("schema v1 lessons migrate to context-only schema v2", () => {
  const storage = new MemoryStorage();
  storage.setItem(LESSON_LIBRARY_KEY, JSON.stringify([{
    schemaVersion: 1,
    id: "lesson-1",
    title: "Cellular respiration",
    subject: "Biology",
    source: "Explain ATP.",
    createdAt: "2026-08-07T12:00:00.000Z",
    updatedAt: "2026-08-08T12:00:00.000Z",
    status: "generating",
    composition: { blocks: [{ visualJobId: "job", visual: { dataUrl: "data:image/png;base64,abc" } }] }
  }]));
  const [restored] = loadLessonLibrary(storage);
  assert.equal(restored.schemaVersion, 2);
  assert.equal(restored.title, "Cellular respiration");
  assert.equal("composition" in restored, false);
  assert.equal(JSON.stringify(restored).includes("base64"), false);
});

test("schema v2 contexts survive reload while corrupt storage is ignored", () => {
  const storage = new MemoryStorage();
  const context = { schemaVersion: 2, id: "lesson-2", title: "Forces", subject: "Physics", source: "Newton's laws", createdAt: "2026-08-09", updatedAt: "2026-08-09" };
  assert.deepEqual(saveLessonLibrary(storage, [context]), { ok: true });
  assert.deepEqual(loadLessonLibrary(storage), [context]);
  storage.setItem(LESSON_LIBRARY_KEY, "{broken");
  assert.deepEqual(loadLessonLibrary(storage), []);
});

test("whiteboard sessions round-trip independently for lessons and no-context", () => {
  const storage = new MemoryStorage();
  const pendingBoard = applyBoardDecision(EMPTY_WHITEBOARD, decision({
    visualJobId: "job-memory-only",
    renderMode: "generatedAsset",
  }));
  const firstBoard = {
    ...pendingBoard,
    scenes: pendingBoard.scenes.map((scene) => ({
      ...scene,
      keywords: ["legacy-only"],
      generatedAsset: { dataUrl: "data:image/png;base64,abc", mimeType: "image/png", alt: "ATP" }
    }))
  };
  const first = {
    lessonId: "lesson-a",
    board: { ...firstBoard, currentPage: 1 },
    recentTurns: [
      { turnSequence: 6, userInput: "Let us begin", action: "hold", conceptKey: "", summary: "" },
      { turnSequence: 7, userInput: "Explain ATP", action: "create", conceptKey: "cell-energy", summary: "ATP stores energy." }
    ],
    turnSequence: 9,
    updatedAt: "2026-08-21T12:00:00.000Z"
  };
  const noContext = createEmptyWhiteboardSession("", "2026-08-21T12:01:00.000Z");

  assert.deepEqual(saveWhiteboardSessionStore(storage, {
    activeTab: "live", selectedLessonId: "lesson-a", sessions: [first, noContext]
  }), { ok: true });
  const durableJson = storage.getItem(WHITEBOARD_SESSION_STORAGE_KEY);
  assert.equal(durableJson.includes("dataUrl"), false);
  assert.equal(durableJson.includes("visualJobId"), false);
  assert.equal(durableJson.includes("keywords"), false);

  const restored = loadWhiteboardSessionStore(storage, ["lesson-a", "lesson-b"]);
  assert.equal(restored.ok, true);
  assert.equal(restored.value.activeTab, "live");
  assert.equal(restored.value.selectedLessonId, "lesson-a");
  assert.deepEqual(restored.value.sessions.map((session) => session.lessonId), ["lesson-a", ""]);
  assert.equal(restored.value.sessions[0].board.version, 1);
  assert.equal(restored.value.sessions[0].turnSequence, 9);
  assert.equal(restored.value.sessions[0].recentTurns[0].action, "hold");
  assert.equal(restored.value.sessions[0].recentTurns[1].turnSequence, 7);
  assert.equal(restored.value.sessions[0].board.scenes[0].generatedAsset, null);
  assert.equal(restored.value.sessions[0].board.scenes[0].visualJobId, null);
  assert.equal(restored.value.sessions[0].board.scenes[0].renderMode, "generatedAsset");
  assert.equal(restored.value.sessions[0].board.scenes[0].visualFailed, false);
  assert.deepEqual(restored.value.sessions[0].board.scenes[0].stickScene, stickScene);
  assert.equal(WHITEBOARD_SESSION_SCHEMA_VERSION, 5);
});

test("schema v4 removes diagram fallbacks while preserving combined visual content", () => {
  const storage = new MemoryStorage();
  const structuredDiagram = decision({
    contentModes: ["diagram"],
    renderMode: "structured",
    generatedAsset: null,
    visualJobId: null,
    stickScene,
    requestedFootprint: "medium",
    placement: { page: 1, column: 0, row: 0, width: 12, height: 6 }
  });
  const structuredNotesDiagram = decision({
    sceneId: "scene-2",
    conceptKey: "cell-notes-diagram",
    contentModes: ["notes", "diagram"],
    renderMode: "structured",
    generatedAsset: null,
    visualJobId: null,
    stickScene,
    requestedFootprint: "medium",
    placement: { page: 2, column: 0, row: 0, width: 12, height: 6 }
  });
  const generatedDiagram = decision({
    sceneId: "scene-3",
    conceptKey: "cell-generated-diagram",
    contentModes: ["diagram"],
    visualJobId: "diagram-job",
    stickScene,
    requestedFootprint: "medium",
    placement: { page: 3, column: 0, row: 0, width: 12, height: 6 }
  });
  const combined = decision({
    sceneId: "scene-4",
    conceptKey: "cell-combined",
    contentModes: ["visual", "diagram"],
    summaryBullets: [],
    requestedFootprint: "full",
    placement: { page: 4, column: 0, row: 0, width: 24, height: 10 }
  });
  storage.setItem(WHITEBOARD_SESSION_STORAGE_KEY, JSON.stringify({
    schemaVersion: 4,
    navigation: { activeTab: "live", selectedLessonId: "lesson-a" },
    sessions: [{
      schemaVersion: 4,
      lessonId: "lesson-a",
      board: {
        version: 4,
        currentPage: 4,
        columns: 24,
        rows: 14,
        scenes: [structuredDiagram, structuredNotesDiagram, generatedDiagram, combined]
      },
      recentTurns: [],
      turnSequence: 4,
      updatedAt: "2026-08-21T12:00:00.000Z"
    }]
  }));

  const restored = loadWhiteboardSessionStore(storage, ["lesson-a"]);
  assert.equal(restored.ok, false);
  assert.deepEqual(
    restored.value.sessions[0].board.scenes.map((scene) => scene.renderMode),
    ["generatedAsset", "generatedAsset", "generatedAsset", "generatedAsset"]
  );
  for (const diagram of restored.value.sessions[0].board.scenes.slice(0, 3)) {
    assert.equal(diagram.stickScene, null);
    assert.equal(diagram.generatedAsset, null);
    assert.equal(diagram.visualJobId, null);
    assert.equal(diagram.visualFailed, false);
  }
  assert.deepEqual(restored.value.sessions[0].board.scenes[3].stickScene, stickScene);
});

test("whiteboard schema v1 migrates every scene to all three presentation modes", () => {
  const storage = new MemoryStorage();
  const legacyScene = structuredClone(decision());
  delete legacyScene.contentModes;
  delete legacyScene.summaryBullets;
  legacyScene.keywords = ["ATP"];
  legacyScene.placement = { page: 3, column: 0, row: 0, width: 8, height: 6 };
  const legacySession = {
    schemaVersion: 1,
    lessonId: "lesson-a",
    board: { version: 1, currentPage: 3, columns: 24, rows: 14, scenes: [legacyScene] },
    recentTurns: [],
    turnSequence: 1,
    updatedAt: "2026-08-21T12:00:00.000Z"
  };
  storage.setItem(WHITEBOARD_SESSION_STORAGE_KEY, JSON.stringify({
    schemaVersion: 1,
    navigation: { activeTab: "live", selectedLessonId: "lesson-a" },
    sessions: [legacySession]
  }));

  const restored = loadWhiteboardSessionStore(storage, ["lesson-a"]);
  assert.equal(restored.ok, false);
  const scene = restored.value.sessions[0].board.scenes[0];
  assert.deepEqual(scene.contentModes, ["visual", "notes", "diagram"]);
  assert.deepEqual(scene.placement, { page: 1, column: 0, row: 0, width: 24, height: 10 });
  assert.equal(scene.summary, legacyScene.summary);
  assert.deepEqual(scene.summaryBullets, [legacyScene.summary]);
  assert.equal("keywords" in scene, false);
  assert.deepEqual(scene.stickScene, stickScene);
});

test("whiteboard schema v1 migrates multiple same-page scenes without loss", () => {
  const storage = new MemoryStorage();
  const first = structuredClone(decision());
  delete first.contentModes;
  delete first.summaryBullets;
  first.keywords = ["first legacy keyword"];
  first.placement = { page: 1, column: 0, row: 0, width: 8, height: 6 };
  const second = {
    ...structuredClone(first),
    sceneId: "scene-2",
    conceptKey: "cell-respiration",
    title: "Cell respiration",
    summary: "Cells release usable energy from nutrients.",
    placement: { page: 1, column: 9, row: 0, width: 8, height: 6 }
  };
  const legacySession = {
    schemaVersion: 1,
    lessonId: "lesson-a",
    board: { version: 2, currentPage: 1, columns: 24, rows: 14, scenes: [first, second] },
    recentTurns: [],
    turnSequence: 2,
    updatedAt: "2026-08-21T12:00:00.000Z"
  };
  storage.setItem(WHITEBOARD_SESSION_STORAGE_KEY, JSON.stringify({
    schemaVersion: 1,
    navigation: { activeTab: "live", selectedLessonId: "lesson-a" },
    sessions: [legacySession]
  }));

  const restored = loadWhiteboardSessionStore(storage, ["lesson-a"]);
  assert.equal(restored.ok, false);
  const board = restored.value.sessions[0].board;
  assert.equal(board.scenes.length, 2);
  assert.equal(board.currentPage, 1);
  assert.deepEqual(board.scenes.map((scene) => scene.placement), [
    { page: 1, column: 0, row: 0, width: 24, height: 10 },
    { page: 2, column: 0, row: 0, width: 24, height: 10 }
  ]);
  assert.deepEqual(board.scenes.map((scene) => scene.summaryBullets), [
    [first.summary],
    [second.summary]
  ]);
});

test("whiteboard schema v2 derives bullets only for notes and preserves placements", () => {
  const storage = new MemoryStorage();
  const notes = decision({
    contentModes: ["notes"],
    requestedFootprint: "small",
    placement: { page: 2, column: 4, row: 3, width: 8, height: 5 },
    stickScene: null,
    renderMode: "structured",
    visualJobId: null
  });
  delete notes.summaryBullets;
  notes.keywords = ["retired keyword"];
  const diagram = decision({
    sceneId: "scene-2",
    conceptKey: "cell-diagram",
    contentModes: ["diagram"],
    requestedFootprint: "medium",
    placement: { page: 3, column: 2, row: 1, width: 12, height: 6 },
    renderMode: "structured",
    visualJobId: null
  });
  delete diagram.summaryBullets;
  diagram.keywords = ["unused"];
  const session = {
    schemaVersion: 2,
    lessonId: "lesson-a",
    board: { version: 2, currentPage: 2, columns: 24, rows: 14, scenes: [notes, diagram] },
    recentTurns: [],
    turnSequence: 2,
    updatedAt: "2026-08-21T12:00:00.000Z"
  };
  storage.setItem(WHITEBOARD_SESSION_STORAGE_KEY, JSON.stringify({
    schemaVersion: 2,
    navigation: { activeTab: "live", selectedLessonId: "lesson-a" },
    sessions: [session]
  }));

  const restored = loadWhiteboardSessionStore(storage, ["lesson-a"]);
  assert.equal(restored.ok, false);
  assert.deepEqual(restored.value.sessions[0].board.scenes[0].placement, notes.placement);
  assert.deepEqual(restored.value.sessions[0].board.scenes[0].summaryBullets, [notes.summary]);
  assert.deepEqual(restored.value.sessions[0].board.scenes[1].summaryBullets, []);
  assert.equal(JSON.stringify(restored.value).includes("keywords"), false);
});

test("whiteboard schema v3 migrates legacy headings to show", () => {
  const storage = new MemoryStorage();
  const legacyScene = decision({
    requestedFootprint: "wide",
    placement: { page: 1, column: 0, row: 0, width: 16, height: 7 }
  });
  delete legacyScene.headingMode;
  const session = {
    schemaVersion: 3,
    lessonId: "lesson-a",
    board: { version: 1, currentPage: 1, columns: 24, rows: 14, scenes: [legacyScene] },
    recentTurns: [],
    turnSequence: 1,
    updatedAt: "2026-08-21T12:00:00.000Z"
  };
  storage.setItem(WHITEBOARD_SESSION_STORAGE_KEY, JSON.stringify({
    schemaVersion: 3,
    navigation: { activeTab: "live", selectedLessonId: "lesson-a" },
    sessions: [session]
  }));

  const restored = loadWhiteboardSessionStore(storage, ["lesson-a"]);
  assert.equal(restored.ok, false);
  assert.equal(restored.value.sessions[0].board.scenes[0].headingMode, "show");
  assert.deepEqual(restored.value.sessions[0].board.scenes[0].placement, {
    page: 1, column: 0, row: 0, width: 24, height: 10
  });
});

test("invalid session siblings and navigation are ignored without cross-attaching boards", () => {
  const storage = new MemoryStorage();
  const valid = {
    ...createEmptyWhiteboardSession("lesson-a", "2026-08-21T12:00:00.000Z"),
    board: applyBoardDecision(EMPTY_WHITEBOARD, decision()),
    turnSequence: 1
  };
  saveWhiteboardSessionStore(storage, {
    activeTab: "library", selectedLessonId: "lesson-a", sessions: [valid]
  });
  const raw = JSON.parse(storage.getItem(WHITEBOARD_SESSION_STORAGE_KEY));
  raw.navigation = { activeTab: "unknown", selectedLessonId: "deleted-lesson" };
  raw.sessions.push({ ...raw.sessions[0], lessonId: "lesson-b", board: { ...raw.sessions[0].board, columns: 12 } });
  raw.sessions.push({ ...raw.sessions[0], lessonId: "deleted-lesson" });
  storage.setItem(WHITEBOARD_SESSION_STORAGE_KEY, JSON.stringify(raw));

  const restored = loadWhiteboardSessionStore(storage, ["lesson-a", "lesson-b"]);
  assert.equal(restored.ok, false);
  assert.equal(restored.value.activeTab, "prepare");
  assert.equal(restored.value.selectedLessonId, "lesson-a");
  assert.deepEqual(restored.value.sessions.map((session) => session.lessonId), ["lesson-a"]);
  assert.equal(restored.value.sessions[0].board.scenes[0].sceneId, "scene-1");
});

test("semantically invalid sessions are rejected while their valid sibling survives", () => {
  const validBoard = applyBoardDecision(EMPTY_WHITEBOARD, decision());
  const validSibling = {
    ...createEmptyWhiteboardSession("lesson-a", "2026-08-21T12:00:00.000Z"),
    board: validBoard,
    turnSequence: 1
  };
  const invalidBase = {
    ...createEmptyWhiteboardSession("lesson-b", "2026-08-21T12:01:00.000Z"),
    board: {
      ...structuredClone(validBoard),
      scenes: [{ ...structuredClone(validBoard.scenes[0]), sceneId: "scene-b", conceptKey: "concept-b" }]
    },
    turnSequence: 1
  };
  const corruptions = {
    "empty diagram": (session) => { session.board.scenes[0].stickScene.entities = []; },
    "duplicate content mode": (session) => { session.board.scenes[0].contentModes = ["notes", "notes"]; },
    "diagram omitted with retained scene": (session) => { session.board.scenes[0].contentModes = ["notes"]; },
    "diagram selected without scene": (session) => { session.board.scenes[0].stickScene = null; },
    "undersized all-mode placement": (session) => {
      session.board.scenes[0].placement = { page: 1, column: 0, row: 0, width: 8, height: 5 };
    },
    "empty scene identity": (session) => { session.board.scenes[0].sceneId = ""; },
    "empty concept identity": (session) => { session.board.scenes[0].conceptKey = ""; },
    "empty title": (session) => { session.board.scenes[0].title = ""; },
    "empty summary": (session) => { session.board.scenes[0].summary = ""; },
    "empty notes bullets": (session) => { session.board.scenes[0].summaryBullets = []; },
    "overlapping diagram entities": (session) => {
      session.board.scenes[0].stickScene.entities.push({
        ...session.board.scenes[0].stickScene.entities[0], id: "overlap"
      });
    },
    "dangling diagram connection": (session) => {
      session.board.scenes[0].stickScene.connections.push({
        id: "dangling", fromId: "cell", toId: "missing", label: "bad", direction: "forward"
      });
    },
    "conflicting board placements": (session) => {
      session.board.version = 2;
      session.board.scenes.push({
        ...structuredClone(session.board.scenes[0]), sceneId: "scene-b-2", conceptKey: "concept-b-2"
      });
    },
    "page above board lifetime bound": (session) => {
      session.board.currentPage = 49;
      session.board.scenes[0].placement.page = 49;
    },
    "board version ahead of turn sequence": (session) => {
      session.board.version = 99;
      session.turnSequence = 1;
    },
    "positive board version without scenes": (session) => {
      session.board.version = 1;
      session.board.scenes = [];
      session.turnSequence = 1;
    }
  };

  for (const [name, corrupt] of Object.entries(corruptions)) {
    const storage = new MemoryStorage();
    const invalid = structuredClone(invalidBase);
    corrupt(invalid);
    saveWhiteboardSessionStore(storage, {
      activeTab: "live", selectedLessonId: "lesson-a", sessions: [validSibling, invalid]
    });
    const restored = loadWhiteboardSessionStore(storage, ["lesson-a", "lesson-b"]);
    assert.equal(restored.ok, false, name);
    assert.deepEqual(restored.value.sessions.map((session) => session.lessonId), ["lesson-a"], name);
  }
});

test("switching away and back settles an orphaned image job as failed", () => {
  const pendingBoard = applyBoardDecision(EMPTY_WHITEBOARD, decision({
    renderMode: "generatedAsset", visualJobId: "job-pending"
  }));
  const settledBoard = settlePendingVisualJobs(pendingBoard);
  const cache = new Map([
    ["lesson-a", { ...createEmptyWhiteboardSession("lesson-a"), board: settledBoard }],
    ["lesson-b", createEmptyWhiteboardSession("lesson-b")]
  ]);

  const restoredAfterSwitch = cache.get("lesson-a").board.scenes[0];
  assert.equal(restoredAfterSwitch.visualJobId, null);
  assert.equal(restoredAfterSwitch.generatedAsset, null);
  assert.equal(restoredAfterSwitch.visualFailed, true);
  assert.equal(sceneOwnsVisualJob(cache.get("lesson-a").board, "scene-1", "job-pending"), false);
});

test("session write failure reports a warning without changing the supplied memory", () => {
  const session = createEmptyWhiteboardSession("lesson-a");
  const before = structuredClone(session);
  const failingStorage = { getItem() { return null; }, setItem() { throw new Error("blocked"); } };
  const result = saveWhiteboardSessionStore(failingStorage, {
    activeTab: "live", selectedLessonId: "lesson-a", sessions: [session]
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /remains open/i);
  assert.deepEqual(session, before);
});

test("busy live turns preserve FIFO and coalesce beyond two waiters", () => {
  const queue = [];
  enqueueLiveTurn(queue, { input: "first", sequence: 1 });
  enqueueLiveTurn(queue, { input: "second", sequence: 2 });
  enqueueLiveTurn(queue, { input: "third", sequence: 3 });
  assert.equal(queue.length, 2);
  assert.deepEqual(dequeueLiveTurn(queue), { input: "first", sequence: 1 });
  assert.deepEqual(dequeueLiveTurn(queue), { input: "second third", sequence: 3 });
});

test("coalesced turns stay within the request bound and retain latest sequence", () => {
  const queue = [{ input: "first", sequence: 1 }, { input: "x".repeat(3998), sequence: 2 }];
  enqueueLiveTurn(queue, { input: "latest", sequence: 9 });
  assert.equal(queue[1].input.length, 4000);
  assert.equal(queue[1].input.endsWith("latest"), true);
  assert.equal(queue[1].sequence, 9);
});

test("duplicate finalized speech is suppressed only inside the short window", () => {
  const previous = { transcript: "Cell energy", at: 1000 };
  assert.equal(isDuplicateFinalizedSpeech(previous, " cell ENERGY ", 2200), true);
  assert.equal(isDuplicateFinalizedSpeech(previous, "Cell energy", 2600), false);
});

test("ambient finalized speech never becomes a teaching command", () => {
  const result = consumeWakeCommand(IDLE_WAKE_COMMAND_STATE, "Today we will discuss gravity.", 1000);
  assert.equal(result.command, null);
  assert.deepEqual(result.state, IDLE_WAKE_COMMAND_STATE);
});

test("wake phrase is case and punctuation tolerant without matching substrings", () => {
  const result = consumeWakeCommand(IDLE_WAKE_COMMAND_STATE, "HEY, IMAGINE! explain gravity", 1000);
  assert.equal(result.command, "explain gravity");
  assert.equal(result.state.phase, "idle");

  assert.equal(
    consumeWakeCommand(IDLE_WAKE_COMMAND_STATE, "hey imagined a planet", 1000).command,
    null
  );
});

test("wake-only activation consumes exactly one next finalized command", () => {
  const armed = consumeWakeCommand(IDLE_WAKE_COMMAND_STATE, "Hey Imagine", 1000);
  assert.equal(armed.state.phase, "armed");
  assert.equal(armed.state.expiresAt, 9000);

  const command = consumeWakeCommand(armed.state, "compare mass and weight", 2000);
  assert.equal(command.command, "compare mass and weight");
  assert.equal(command.state.phase, "idle");
  assert.equal(consumeWakeCommand(command.state, "ambient follow-up", 2100).command, null);
});

test("split wake finals work within eight seconds and expire afterward", () => {
  const heardHey = consumeWakeCommand(IDLE_WAKE_COMMAND_STATE, "hey", 1000);
  assert.equal(heardHey.state.phase, "heardHey");

  const command = consumeWakeCommand(heardHey.state, "Imagine — show the orbit", 8999);
  assert.equal(command.command, "show the orbit");

  const expired = consumeWakeCommand(heardHey.state, "imagine show the orbit", 9001);
  assert.equal(expired.command, null);
  assert.equal(expired.state.phase, "idle");
});

test("frontend-only deployment policy honors explicit values and Vercel fallback", async () => {
  await withDeploymentEnv({}, () => assert.equal(isFrontendOnlyDeployment(), false));
  await withDeploymentEnv({ NEXT_PUBLIC_FRONTEND_ONLY: " true " }, () => assert.equal(isFrontendOnlyDeployment(), true));
  await withDeploymentEnv({ NEXT_PUBLIC_FRONTEND_ONLY: "false", NEXT_PUBLIC_VERCEL_ENV: "production" }, () => assert.equal(isFrontendOnlyDeployment(), false));
  await withDeploymentEnv({ NEXT_PUBLIC_FRONTEND_ONLY: "invalid", NEXT_PUBLIC_VERCEL_ENV: " preview " }, () => assert.equal(isFrontendOnlyDeployment(), true));
  await withDeploymentEnv({ NEXT_PUBLIC_FRONTEND_ONLY: " ", NEXT_PUBLIC_VERCEL_ENV: " " }, () => assert.equal(isFrontendOnlyDeployment(), false));
});

test("Vercel build mode defaults safely and preserves an explicit false", () => {
  assert.equal(resolveVercelFrontendOnly(undefined), "true");
  assert.equal(resolveVercelFrontendOnly(""), "true");
  assert.equal(resolveVercelFrontendOnly("invalid"), "true");
  assert.equal(resolveVercelFrontendOnly(" true "), "true");
  assert.equal(resolveVercelFrontendOnly(" false "), "false");
});

test("Next output stays standalone except for native Vercel builds", async () => {
  const importConfig = (scenario) => import(`../next.config.mjs?scenario=${scenario}`);
  await withDeploymentEnv({}, async () => {
    assert.equal((await importConfig("local")).default.output, "standalone");
  });
  await withDeploymentEnv({ IMAGINE_VERCEL_BUILD: "1" }, async () => {
    assert.equal("output" in (await importConfig("wrapper")).default, false);
  });
  await withDeploymentEnv({ VERCEL: "1" }, async () => {
    assert.equal("output" in (await importConfig("vercel")).default, false);
  });
});

test("frontend-only streaming fails with the shared notice before fetch", async () => {
  await withDeploymentEnv({ NEXT_PUBLIC_FRONTEND_ONLY: "true" }, async () => {
    const originalFetch = globalThis.fetch;
    let fetchCount = 0;
    globalThis.fetch = async () => {
      fetchCount += 1;
      throw new Error("fetch must not run");
    };
    try {
      await assert.rejects(
        streamGeneration(request(), {}, new AbortController().signal),
        (error) => error instanceof Error && error.message === FRONTEND_ONLY_NOTICE
      );
      assert.equal(fetchCount, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("site origin prefers public configuration, then HTTPS Vercel, then localhost", async () => {
  await withDeploymentEnv({
    NEXT_PUBLIC_SITE_URL: " https://www.example.com/// ",
    VERCEL_PROJECT_PRODUCTION_URL: "ignored.vercel.app"
  }, () => assert.equal(getSiteOrigin(), "https://www.example.com"));
  await withDeploymentEnv({
    VERCEL_PROJECT_PRODUCTION_URL: "imagine.example.vercel.app///"
  }, () => assert.equal(getSiteOrigin(), "https://imagine.example.vercel.app"));
  await withDeploymentEnv({}, () => assert.equal(getSiteOrigin(), "http://localhost:3000"));
});

test("atomic NDJSON sends the complete context and requires done", async () => {
  const encoder = new TextEncoder();
  const payload = `${JSON.stringify({ type: "result", result: decision() })}\n${JSON.stringify({ type: "done" })}\n`;
  const originalFetch = globalThis.fetch;
  let body;
  globalThis.fetch = async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(encoder.encode(payload.slice(0, 31)));
      controller.enqueue(encoder.encode(payload.slice(31)));
      controller.close();
    } }), { status: 200, headers: { "Content-Type": "application/x-ndjson" } });
  };
  try {
    const result = await streamGeneration(request(), {}, new AbortController().signal);
    assert.equal(result.sceneId, "scene-1");
    assert.deepEqual(body, request());
  } finally { globalThis.fetch = originalFetch; }
});

test("stream falls back to the buffered endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return urls.length === 1
      ? new Response(null, { status: 404 })
      : Response.json(decision());
  };
  try {
    assert.equal((await streamGeneration(request(), {}, new AbortController().signal)).action, "create");
    assert.equal(urls[0].endsWith("/api/generate/stream"), true);
    assert.equal(urls[1].endsWith("/api/generate"), true);
  } finally { globalThis.fetch = originalFetch; }
});

test("stream validation rejects conditional mode and footprint violations", () => {
  assert.throws(
    () => validateGenerateResponse(decision({ contentModes: ["notes", "notes"] })),
    /content modes/i
  );
  assert.throws(
    () => validateGenerateResponse(decision({ contentModes: ["notes"], stickScene })),
    /StickScene dependency/i
  );
  assert.throws(
    () => validateGenerateResponse(decision({
      contentModes: ["diagram"], requestedFootprint: "small",
      placement: { page: 1, column: 0, row: 0, width: 8, height: 5 }
    })),
    /undersized/i
  );
  assert.throws(
    () => validateGenerateResponse(decision({ contentModes: ["notes"], stickScene: null, renderMode: "generatedAsset", visualJobId: "job" })),
    /visual dependency/i
  );
});

test("stream validation accepts generated diagrams and preserves visual-only rendering", () => {
  for (const contentModes of [["diagram"], ["notes", "diagram"]]) {
    const validated = validateGenerateResponse(decision({ contentModes }));
    assert.equal(validated.renderMode, "generatedAsset");
    assert.equal(validated.stickScene, null);
    assert.equal(validated.visualJobId, "job-default");
  }

  assert.deepEqual(validateGenerateResponse(decision({
    contentModes: ["visual", "diagram"], summaryBullets: []
  })).stickScene, stickScene);

  const generatedAsset = {
    dataUrl: "data:image/png;base64,YWJj",
    mimeType: "image/png",
    alt: "Cell energy diagram"
  };
  assert.deepEqual(validateGenerateResponse(decision({
    contentModes: ["diagram"], generatedAsset, visualJobId: null
  })).generatedAsset, generatedAsset);

  assert.equal(validateGenerateResponse(decision({
    contentModes: ["visual"],
    requestedFootprint: "medium",
    placement: { page: 1, column: 0, row: 0, width: 12, height: 6 },
    stickScene: null
  })).renderMode, "generatedAsset");
  assert.equal(validateGenerateResponse(decision({
    contentModes: ["visual"],
    requestedFootprint: "medium",
    placement: { page: 1, column: 0, row: 0, width: 12, height: 6 },
    renderMode: "structured",
    generatedAsset: null,
    visualJobId: null
  })).renderMode, "structured");

  assert.throws(() => validateGenerateResponse(decision({
    contentModes: ["diagram"], renderMode: "structured", visualJobId: null
  })), /diagram render mode/i);
  assert.throws(() => validateGenerateResponse(decision({
    contentModes: ["diagram"], stickScene
  })), /StickScene dependency/i);
  assert.throws(() => validateGenerateResponse(decision({
    contentModes: ["diagram"], generatedAsset
  })), /incomplete generated visual/i);
  assert.throws(() => validateGenerateResponse(decision({
    contentModes: ["diagram"], visualJobId: null
  })), /incomplete generated visual/i);
});

test("stream validation rejects the removed hold response action", () => {
  assert.throws(() => validateGenerateResponse(decision({ action: "hold" })), /invalid decision/i);
});

test("stream validation rejects unknown strategies and contradictory resets", () => {
  assert.throws(() => validateGenerateResponse(decision({ boardStrategy: "archive" })), /invalid decision/i);
  assert.throws(() => validateGenerateResponse(decision({
    boardStrategy: "reset", action: "update", sceneId: "scene-1", targetSceneId: "scene-1"
  })), /reset decision/i);
  assert.throws(() => validateGenerateResponse(decision({
    boardStrategy: "reset", placement: { page: 2, column: 0, row: 0, width: 24, height: 10 }
  })), /reset decision/i);
});

test("direct session mutation rejects adversarial scene decisions", () => {
  const invalidDecisions = {
    "unknown mode": decision({ contentModes: ["bogus"] }),
    "duplicate mode": decision({ contentModes: ["notes", "notes"] }),
    "empty modes": decision({ contentModes: [] }),
    "empty concept": decision({ conceptKey: "" }),
    "empty title": decision({ title: " " }),
    "empty summary": decision({ summary: "" }),
    "empty notes bullets": decision({ summaryBullets: [] }),
    "notes bullets without notes": decision({ contentModes: ["diagram"], summaryBullets: ["Unselected."] }),
    "oversized notes bullet": decision({ summaryBullets: ["x".repeat(121)] }),
    "invalid confidence": decision({ confidence: 2 }),
    "first scene inherits heading": decision({ headingMode: "inheritPrimary" }),
    "missing diagram": decision({ stickScene: null }),
    "unselected diagram": decision({ contentModes: ["notes"], stickScene, requestedFootprint: "small", placement: { page: 1, column: 0, row: 0, width: 8, height: 5 } }),
    "invalid diagram": decision({ stickScene: { ...stickScene, entities: [{ ...stickScene.entities[0], type: "triangle" }] } }),
    "unapproved render mode": decision({ renderMode: "html" }),
    "incomplete generated visual": decision({ renderMode: "generatedAsset", visualJobId: null }),
    "wrong preset dimensions": decision({ placement: { page: 1, column: 0, row: 0, width: 15, height: 7 } }),
    "out of bounds placement": decision({ placement: { page: 1, column: 12, row: 0, width: 16, height: 7 } }),
    "undersized all-mode scene": decision({ requestedFootprint: "small", placement: { page: 1, column: 0, row: 0, width: 8, height: 5 } }),
    "CREATE with target": decision({ targetSceneId: "scene-1" })
  };
  for (const [name, invalid] of Object.entries(invalidDecisions)) {
    assert.equal(applyBoardDecision(EMPTY_WHITEBOARD, invalid), null, name);
  }
  assert.deepEqual(EMPTY_WHITEBOARD.scenes, []);

  const created = applyBoardDecision(EMPTY_WHITEBOARD, decision());
  assert.equal(applyBoardDecision(created, decision({
    action: "update", boardVersion: 2, turnSequence: 2,
    sceneId: "replacement-id", targetSceneId: "scene-1"
  })), null);
});

test("CREATE accumulates and UPDATE applies authoritative validated placement", () => {
  const created = applyBoardDecision(EMPTY_WHITEBOARD, decision());
  assert.ok(created);
  const updated = applyBoardDecision(created, decision({
    boardVersion: 2,
    turnSequence: 2,
    action: "update",
    sceneId: "scene-1",
    targetSceneId: "scene-1",
    title: "ATP cycle",
    placement: { page: 4, column: 0, row: 0, width: 24, height: 10 }
  }));
  assert.ok(updated);
  assert.equal(updated.scenes.length, 1);
  assert.equal(updated.scenes[0].sceneId, "scene-1");
  assert.deepEqual(updated.scenes[0].placement, { page: 4, column: 0, row: 0, width: 24, height: 10 });
  assert.equal(updated.currentPage, 4);
  assert.equal(updated.scenes[0].title, "ATP cycle");
});

test("EXPAND preserves every retained diagram state and emits one transient animation", () => {
  const pending = applyBoardDecision(EMPTY_WHITEBOARD, decision({
    contentModes: ["diagram"],
    summaryBullets: [],
    requestedFootprint: "medium",
    placement: { page: 1, column: 0, row: 0, width: 12, height: 6 },
    stickScene: null,
    visualJobId: "job-retained"
  }));
  const asset = { dataUrl: "data:image/png;base64,YWJjZA==", mimeType: "image/png", alt: "ATP diagram" };
  const ready = patchGeneratedAsset(pending, "scene-1", "job-retained", asset);
  const failed = settlePendingVisualJobs(pending);
  const unavailable = {
    ...pending,
    scenes: pending.scenes.map((scene) => ({ ...scene, visualJobId: null, visualFailed: false }))
  };
  const states = [pending, ready, failed, unavailable];

  for (const prior of states) {
    const expansion = decision({
      action: "update",
      mergeBehavior: "expand",
      boardVersion: 2,
      turnSequence: 2,
      sceneId: "scene-1",
      targetSceneId: "scene-1",
      contentModes: ["diagram", "notes"],
      summaryBullets: ["Cells use ATP as transferable chemical energy."],
      requestedFootprint: "medium",
      placement: { page: 1, column: 0, row: 0, width: 12, height: 6 },
      stickScene: null,
      visualJobId: null,
      generatedAsset: null
    });
    assert.doesNotThrow(() => validateGenerateResponse(expansion));
    const expanded = applyBoardDecision(prior, expansion);
    assert.ok(expanded);
    assert.deepEqual(expanded.scenes[0].contentModes, ["diagram", "notes"]);
    assert.equal(expanded.scenes[0].generatedAsset, prior.scenes[0].generatedAsset);
    assert.equal(expanded.scenes[0].visualJobId, prior.scenes[0].visualJobId);
    assert.equal(expanded.scenes[0].visualFailed, prior.scenes[0].visualFailed);
    assert.equal(expanded.currentPage, prior.currentPage);
    assert.deepEqual(expanded.scenes[0].placement, prior.scenes[0].placement);
    assert.equal(
      shouldAnimateDiagramNotesExpansion(prior.scenes[0], expanded.scenes[0], expansion),
      true
    );
    if (prior === pending) {
      // A diagram that finishes after its summary keeps both panes and the page.
      const completed = patchGeneratedAsset(expanded, "scene-1", "job-retained", asset);
      assert.ok(completed);
      assert.deepEqual(completed.scenes[0].contentModes, ["diagram", "notes"]);
      assert.deepEqual(completed.scenes[0].summaryBullets, expansion.summaryBullets);
      assert.equal(completed.scenes[0].generatedAsset, asset);
      assert.equal(completed.currentPage, expanded.currentPage);
      assert.equal(shouldAnimateDiagramNotesExpansion(expanded.scenes[0], completed.scenes[0], expansion), false);
    }
  }

  const sameMode = decision({
    action: "update", mergeBehavior: "expand", boardVersion: 2,
    sceneId: "scene-1", targetSceneId: "scene-1",
    contentModes: ["diagram"], summaryBullets: [], requestedFootprint: "medium",
    placement: { page: 1, column: 0, row: 0, width: 12, height: 6 }, stickScene: null,
    generatedAsset: null, visualJobId: null
  });
  assert.equal(applyBoardDecision(pending, sameMode), null);
  assert.equal(applyBoardDecision(pending, { ...sameMode, contentModes: ["notes", "diagram"], summaryBullets: ["New."] }), null);
  assert.equal(applyBoardDecision(pending, { ...sameMode, contentModes: ["diagram", "notes"], summaryBullets: ["New."], visualJobId: "job-new" }), null);
});

test("cross-mode EXPAND markers preserve retained notes and structured visuals", () => {
  const notesBoard = applyBoardDecision(EMPTY_WHITEBOARD, decision({
    contentModes: ["notes"],
    requestedFootprint: "small",
    placement: { page: 1, column: 0, row: 0, width: 8, height: 5 },
    stickScene: null,
    renderMode: "structured",
    generatedAsset: null,
    visualJobId: null
  }));
  const notesToDiagram = decision({
    action: "update", mergeBehavior: "expand", boardVersion: 2,
    sceneId: "scene-1", targetSceneId: "scene-1",
    contentModes: ["notes", "diagram"], summaryBullets: [],
    requestedFootprint: "medium",
    placement: { page: 1, column: 0, row: 0, width: 12, height: 6 },
    stickScene: null, renderMode: "generatedAsset",
    generatedAsset: null, visualJobId: "job-new-diagram"
  });
  const expandedNotes = applyBoardDecision(notesBoard, notesToDiagram);
  assert.ok(expandedNotes);
  assert.deepEqual(expandedNotes.scenes[0].summaryBullets, notesBoard.scenes[0].summaryBullets);
  assert.equal(expandedNotes.scenes[0].visualJobId, "job-new-diagram");
  assert.equal(applyBoardDecision(notesBoard, {
    ...notesToDiagram, summaryBullets: ["A rewritten retained note."]
  }), null);

  const visualBoard = applyBoardDecision(EMPTY_WHITEBOARD, decision({
    contentModes: ["visual"], summaryBullets: [],
    requestedFootprint: "medium",
    placement: { page: 1, column: 0, row: 0, width: 12, height: 6 },
    renderMode: "structured", generatedAsset: null, visualJobId: null
  }));
  const visualToNotes = decision({
    action: "update", mergeBehavior: "expand", boardVersion: 2,
    sceneId: "scene-1", targetSceneId: "scene-1",
    contentModes: ["visual", "notes"], summaryBullets: ["ATP transfers usable energy."],
    requestedFootprint: "medium",
    placement: { page: 1, column: 0, row: 0, width: 12, height: 6 },
    stickScene: null, renderMode: "structured", generatedAsset: null, visualJobId: null
  });
  const expandedVisualNotes = applyBoardDecision(visualBoard, visualToNotes);
  assert.ok(expandedVisualNotes);
  assert.equal(expandedVisualNotes.scenes[0].stickScene, visualBoard.scenes[0].stickScene);

  const visualToDiagram = {
    ...visualToNotes,
    contentModes: ["visual", "diagram"],
    summaryBullets: [],
    requestedFootprint: "full",
    placement: { page: 1, column: 0, row: 0, width: 24, height: 10 },
    renderMode: "generatedAsset",
    visualJobId: "job-visual-diagram"
  };
  const expandedVisualDiagram = applyBoardDecision(visualBoard, visualToDiagram);
  assert.ok(expandedVisualDiagram);
  assert.equal(expandedVisualDiagram.scenes[0].stickScene, visualBoard.scenes[0].stickScene);
  assert.equal(expandedVisualDiagram.scenes[0].visualJobId, "job-visual-diagram");
  assert.equal(applyBoardDecision(visualBoard, {
    ...visualToDiagram, stickScene
  }), null);
});

test("the board sends all 48 occupied scenes, rejects another CREATE, and still permits UPDATE", () => {
  const created = applyBoardDecision(EMPTY_WHITEBOARD, decision());
  const fullBoard = {
    ...created,
    version: MAX_BOARD_SCENES,
    scenes: Array.from({ length: MAX_BOARD_SCENES }, (_, index) => ({
      ...created.scenes[0],
      sceneId: `scene-${index + 1}`,
      conceptKey: `concept-${index + 1}`,
      placement: { page: index + 1, column: 0, row: 0, width: 24, height: 10 }
    }))
  };

  const digest = getBoardDigest(fullBoard);
  assert.equal(digest.scenes.length, MAX_BOARD_SCENES);
  assert.equal(digest.scenes.at(-1).sceneId, `scene-${MAX_BOARD_SCENES}`);
  assert.equal(applyBoardDecision(fullBoard, decision({ boardVersion: 49, sceneId: "scene-49" })), null);

  const updated = applyBoardDecision(fullBoard, decision({
    action: "update",
    boardVersion: 49,
    sceneId: "scene-48",
    targetSceneId: "scene-48",
    conceptKey: "concept-48",
    title: "Updated final scene",
    placement: { page: 48, column: 0, row: 0, width: 24, height: 10 }
  }));
  assert.ok(updated);
  assert.equal(updated.scenes.length, MAX_BOARD_SCENES);
  assert.equal(updated.scenes.at(-1).sceneId, "scene-48");
  assert.equal(updated.scenes.at(-1).title, "Updated final scene");
});

test("RESET atomically replaces a full board, resets memory, and aborts removed image jobs", () => {
  const created = applyBoardDecision(EMPTY_WHITEBOARD, decision({
    visualJobId: "job-old", renderMode: "generatedAsset"
  }));
  const fullBoard = {
    ...created,
    version: MAX_BOARD_SCENES,
    scenes: Array.from({ length: MAX_BOARD_SCENES }, (_, index) => ({
      ...created.scenes[0],
      sceneId: `old-${index + 1}`,
      conceptKey: `old-concept-${index + 1}`,
      visualJobId: index === 0 ? "job-old" : null,
      placement: { page: index + 1, column: 0, row: 0, width: 16, height: 7 }
    }))
  };
  const resetDecision = decision({
    boardStrategy: "reset",
    boardVersion: MAX_BOARD_SCENES + 1,
    turnSequence: MAX_BOARD_SCENES + 1,
    sceneId: "new-car-board",
    conceptKey: "car-functions",
    title: "How a car functions"
  });
  const resetBoard = applyBoardDecision(fullBoard, resetDecision);
  assert.ok(resetBoard);
  assert.equal(resetBoard.version, MAX_BOARD_SCENES + 1);
  assert.equal(resetBoard.currentPage, 1);
  assert.deepEqual(resetBoard.scenes.map((scene) => scene.sceneId), ["new-car-board"]);

  const history = appendRecentTurn([
    { turnSequence: 48, userInput: "Skeletal system", action: "create", conceptKey: "skeletal-system", summary: "Bones." }
  ], resetDecision, "How does a car work?");
  assert.deepEqual(history.map((turn) => turn.conceptKey), ["car-functions"]);

  const controller = new AbortController();
  const controllers = new Map([["job-old", controller]]);
  cancelRemovedVisualJobs(fullBoard, resetBoard, controllers);
  assert.equal(controller.signal.aborted, true);
  assert.equal(controllers.has("job-old"), false);
});

test("UPDATE transfers image-job ownership and cancels the obsolete poll", () => {
  const created = applyBoardDecision(EMPTY_WHITEBOARD, decision({ visualJobId: "job-old", renderMode: "generatedAsset" }));
  const updated = applyBoardDecision(created, decision({
    action: "update",
    boardVersion: 2,
    sceneId: "scene-1",
    targetSceneId: "scene-1",
    visualJobId: "job-new",
    renderMode: "generatedAsset"
  }));
  const oldController = new AbortController();
  const controllers = new Map([["job-old", oldController]]);

  assert.equal(sceneOwnsVisualJob(created, "scene-1", "job-old"), true);
  assert.equal(sceneOwnsVisualJob(updated, "scene-1", "job-old"), false);
  assert.equal(sceneOwnsVisualJob(updated, "scene-1", "job-new"), true);
  cancelSupersededVisualJob(created, updated, "scene-1", controllers);
  assert.equal(oldController.signal.aborted, true);
  assert.equal(controllers.has("job-old"), false);
});

test("stale versions do not mutate the board", () => {
  const created = applyBoardDecision(EMPTY_WHITEBOARD, decision());
  assert.equal(applyBoardDecision(created, decision({ boardVersion: 4 })), null);
});

test("recent memory is bounded and only the expected image job can settle", () => {
  let turns = [];
  for (let index = 1; index <= 8; index += 1) turns = appendRecentTurn(turns, decision({ turnSequence: index }), `turn ${index}`);
  assert.equal(turns.length, 6);
  const created = applyBoardDecision(EMPTY_WHITEBOARD, decision({ visualJobId: "job-1", renderMode: "generatedAsset" }));
  const [concept] = getConceptMemory(created);
  assert.deepEqual(concept, {
    conceptKey: "cell-energy",
    title: "Cell energy",
    summary: "Cells store usable energy in ATP.",
    sceneId: "scene-1"
  });
  const asset = { dataUrl: "data:image/png;base64,abc", mimeType: "image/png", alt: "ATP" };
  const patched = patchGeneratedAsset(created, "scene-1", "job-1", asset);
  assert.deepEqual(patched.scenes[0].placement, created.scenes[0].placement);
  assert.equal(patched.scenes[0].title, created.scenes[0].title);
  assert.equal(patched.scenes[0].generatedAsset.alt, "ATP");

  const newer = applyBoardDecision(created, decision({
    action: "update", boardVersion: 2, turnSequence: 2,
    sceneId: "scene-1", targetSceneId: "scene-1", visualJobId: "job-2"
  }));
  const ignored = patchGeneratedAsset(newer, "scene-1", "job-1", asset);
  assert.equal(ignored, newer);
  assert.equal(ignored.scenes[0].visualJobId, "job-2");
  assert.equal(ignored.scenes[0].generatedAsset, null);
});
