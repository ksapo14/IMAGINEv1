import type {
  BoardDigest,
  ConceptMemory,
  GenerateResponse,
  GeneratedAsset,
  RecentTurn,
  WhiteboardScene,
  WhiteboardState
} from "@/components/workspace/types";
import { validateGenerateResponse } from "./generation-stream.ts";

/** The backend board contract accepts at most 48 cumulative scenes. */
export const MAX_BOARD_SCENES = 48;

export const EMPTY_WHITEBOARD: WhiteboardState = {
  version: 0,
  currentPage: 1,
  columns: 24,
  rows: 14,
  scenes: []
};

export function getBoardDigest(board: WhiteboardState): BoardDigest {
  return {
    version: board.version,
    currentPage: board.currentPage,
    columns: 24,
    rows: 14,
    scenes: board.scenes.map(({ sceneId, conceptKey, title, headingMode, contentModes, placement }) => ({
      sceneId,
      conceptKey,
      title,
      headingMode,
      contentModes,
      placement
    }))
  };
}

export function getConceptMemory(board: WhiteboardState): ConceptMemory[] {
  return board.scenes.slice(-24).map(({ conceptKey, title, summary, sceneId }) => ({
    conceptKey,
    title,
    summary,
    sceneId
  }));
}

export function appendRecentTurn(turns: RecentTurn[], decision: GenerateResponse, userInput: string) {
  const turn = {
    turnSequence: decision.turnSequence,
    userInput: userInput.slice(0, 2400),
    action: decision.action,
    conceptKey: decision.conceptKey,
    summary: decision.summary
  };
  const next = decision.boardStrategy === "reset" ? [turn] : [...turns, turn];
  const bounded = next.slice(-6);
  while (bounded.reduce((total, turn) => total + turn.userInput.length + turn.conceptKey.length + turn.summary.length, 0) > 2400) {
    bounded.shift();
  }
  return bounded;
}

function placementsConflict(first: WhiteboardScene["placement"], second: WhiteboardScene["placement"]) {
  if (first.page !== second.page) return false;
  return !(
    first.column + first.width < second.column || second.column + second.width < first.column
    || first.row + first.height < second.row || second.row + second.height < first.row
  );
}

/** Apply only a monotonic, collision-free atomic decision from the server. */
export function applyBoardDecision(board: WhiteboardState, decision: GenerateResponse) {
  try {
    decision = validateGenerateResponse(decision);
  } catch {
    return null;
  }
  if (decision.boardVersion !== board.version + 1) {
    return null;
  }

  const scene: WhiteboardScene = {
    sceneId: decision.sceneId,
    conceptKey: decision.conceptKey,
    title: decision.title,
    headingMode: decision.headingMode,
    summaryBullets: [...decision.summaryBullets],
    summary: decision.summary,
    contentModes: [...decision.contentModes],
    placement: decision.placement,
    stickScene: decision.stickScene,
    renderMode: decision.renderMode,
    generatedAsset: decision.generatedAsset,
    visualJobId: decision.visualJobId
  };

  if (decision.boardStrategy === "reset") {
    return {
      ...board,
      version: decision.boardVersion,
      currentPage: 1,
      scenes: [scene]
    };
  }

  if (decision.action === "create") {
    if (board.scenes.length === 0 && scene.headingMode !== "show") return null;
    if (board.scenes.length >= MAX_BOARD_SCENES) return null;
    if (board.scenes.some((candidate) => candidate.sceneId === scene.sceneId)) return null;
    if (board.scenes.some((candidate) => placementsConflict(candidate.placement, scene.placement))) return null;
    return {
      ...board,
      version: decision.boardVersion,
      currentPage: scene.placement.page,
      scenes: [...board.scenes, scene]
    };
  }

  const targetId = decision.targetSceneId ?? decision.sceneId;
  const index = board.scenes.findIndex((candidate) => candidate.sceneId === targetId);
  if (index < 0) return null;
  const previous = board.scenes[index];
  if (decision.conceptKey !== previous.conceptKey) return null;
  if (decision.headingMode !== previous.headingMode) return null;
  if (board.scenes.some((candidate, candidateIndex) => (
    candidateIndex !== index && placementsConflict(candidate.placement, scene.placement)
  ))) return null;
  const scenes = [...board.scenes];
  scenes[index] = { ...scene, sceneId: previous.sceneId };
  return { ...board, version: decision.boardVersion, currentPage: scene.placement.page, scenes };
}

/** Confirm that a scene still points to the optional image job being polled. */
export function sceneOwnsVisualJob(board: WhiteboardState, sceneId: string, jobId: string) {
  return board.scenes.some((scene) => scene.sceneId === sceneId && scene.visualJobId === jobId);
}

/** Cancelled image work restores as a complete structured scene, never a permanent spinner. */
export function settlePendingVisualJobs(board: WhiteboardState) {
  if (!board.scenes.some((scene) => Boolean(scene.visualJobId))) return board;
  return {
    ...board,
    scenes: board.scenes.map((scene) => scene.visualJobId
      ? { ...scene, generatedAsset: null, visualJobId: null, visualFailed: true }
      : scene)
  };
}

/** Stop a previous image job when an accepted UPDATE assigns a different job. */
export function cancelSupersededVisualJob(
  previousBoard: WhiteboardState,
  nextBoard: WhiteboardState,
  sceneId: string,
  controllers: Map<string, AbortController>
) {
  const previousJobId = previousBoard.scenes.find((scene) => scene.sceneId === sceneId)?.visualJobId;
  const nextJobId = nextBoard.scenes.find((scene) => scene.sceneId === sceneId)?.visualJobId;
  if (!previousJobId || previousJobId === nextJobId) return;
  controllers.get(previousJobId)?.abort();
  controllers.delete(previousJobId);
}

/** Abort image polls owned by scenes removed in an accepted board reset. */
export function cancelRemovedVisualJobs(
  previousBoard: WhiteboardState,
  nextBoard: WhiteboardState,
  controllers: Map<string, AbortController>
) {
  const retainedSceneIds = new Set(nextBoard.scenes.map((scene) => scene.sceneId));
  previousBoard.scenes.forEach((scene) => {
    if (!scene.visualJobId || retainedSceneIds.has(scene.sceneId)) return;
    controllers.get(scene.visualJobId)?.abort();
    controllers.delete(scene.visualJobId);
  });
}

/** Optional image completion cannot alter scene identity, copy, structure, or placement. */
export function patchGeneratedAsset(
  board: WhiteboardState,
  sceneId: string,
  asset: GeneratedAsset | null,
  failed = false
) {
  if (!board.scenes.some((scene) => scene.sceneId === sceneId)) return board;
  return {
    ...board,
    scenes: board.scenes.map((scene) => scene.sceneId === sceneId
      ? { ...scene, generatedAsset: asset, visualJobId: null, visualFailed: failed }
      : scene)
  };
}
