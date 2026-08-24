import { StickScene } from "@/components/workspace/stick-scene";
import type { StickScene as StickSceneData } from "@/components/workspace/types";

/** Static examples share the same bounded scene vocabulary as the live board. */
export const lessonContextScene: StickSceneData = {
  version: 1,
  columns: 12,
  rows: 8,
  entities: [
    { id: "lesson", type: "rectangle", x: 0.8, y: 2, width: 3, height: 2, label: "Lesson context", pose: "neutral", facing: "front" },
    { id: "speech", type: "stickFigure", x: 4.7, y: 1.4, width: 2, height: 3.4, label: "Final speech", pose: "pointing", facing: "right" },
    { id: "board", type: "rectangle", x: 8.2, y: 2, width: 3, height: 2, label: "Live board", pose: "neutral", facing: "front" }
  ],
  connections: [
    { id: "lesson-speech", fromId: "lesson", toId: "speech", label: "guides", direction: "forward" },
    { id: "speech-board", fromId: "speech", toId: "board", label: "directs", direction: "forward" }
  ]
};

export const createScene: StickSceneData = {
  version: 1,
  columns: 12,
  rows: 8,
  entities: [
    { id: "glucose", type: "circle", x: 0.7, y: 2.2, width: 2, height: 2, label: "Glucose", pose: "neutral", facing: "front" },
    { id: "cell", type: "stickFigure", x: 4.8, y: 1.2, width: 2, height: 3.8, label: "Cell", pose: "holding", facing: "front" },
    { id: "atp", type: "rectangle", x: 9, y: 2.2, width: 2, height: 2, label: "ATP", pose: "neutral", facing: "front" }
  ],
  connections: [
    { id: "glucose-cell", fromId: "glucose", toId: "cell", label: "energy", direction: "forward" },
    { id: "cell-atp", fromId: "cell", toId: "atp", label: "releases", direction: "forward" }
  ]
};

export const updateScene: StickSceneData = {
  version: 1,
  columns: 12,
  rows: 8,
  entities: [
    { id: "teacher", type: "stickFigure", x: 0.8, y: 1.1, width: 2, height: 4, label: "Educator", pose: "pointing", facing: "right" },
    { id: "respiration", type: "rectangle", x: 4, y: 1.7, width: 3.2, height: 2.4, label: "Respiration", pose: "neutral", facing: "front" },
    { id: "oxygen", type: "circle", x: 9, y: 0.6, width: 1.7, height: 1.7, label: "Oxygen", pose: "neutral", facing: "front" },
    { id: "atp", type: "circle", x: 9, y: 4, width: 1.7, height: 1.7, label: "ATP", pose: "neutral", facing: "front" }
  ],
  connections: [
    { id: "teacher-process", fromId: "teacher", toId: "respiration", label: "explains", direction: "forward" },
    { id: "oxygen-process", fromId: "oxygen", toId: "respiration", label: "input", direction: "backward" },
    { id: "process-atp", fromId: "respiration", toId: "atp", label: "output", direction: "forward" }
  ]
};

export const cumulativeBoardScene: StickSceneData = {
  version: 1,
  columns: 12,
  rows: 8,
  entities: [
    { id: "first", type: "rectangle", x: 0.7, y: 1, width: 3, height: 2, label: "Earlier idea", pose: "neutral", facing: "front" },
    { id: "second", type: "rectangle", x: 4.5, y: 3.8, width: 3, height: 2, label: "Updated idea", pose: "neutral", facing: "front" },
    { id: "third", type: "rectangle", x: 8.3, y: 1, width: 3, height: 2, label: "New idea", pose: "neutral", facing: "front" }
  ],
  connections: [
    { id: "first-second", fromId: "first", toId: "second", label: "connects", direction: "forward" },
    { id: "second-third", fromId: "second", toId: "third", label: "extends", direction: "forward" }
  ]
};

export const pilotReviewScene: StickSceneData = {
  version: 1,
  columns: 12,
  rows: 8,
  entities: [
    { id: "educator", type: "stickFigure", x: 0.7, y: 1.4, width: 2, height: 3.6, label: "Educator", pose: "neutral", facing: "right" },
    { id: "review", type: "rectangle", x: 4.4, y: 2, width: 3.2, height: 2, label: "Pilot review", pose: "neutral", facing: "front" },
    { id: "school", type: "stickFigure", x: 9.2, y: 1.4, width: 2, height: 3.6, label: "School", pose: "neutral", facing: "left" }
  ],
  connections: [
    { id: "educator-review", fromId: "educator", toId: "review", label: "experience", direction: "forward" },
    { id: "school-review", fromId: "school", toId: "review", label: "evidence", direction: "forward" }
  ]
};

/** Render an illustrative, non-live preview without model-authored markup. */
export function MarketingScenePreview({
  scene,
  alt,
  compact = false,
  parallax = false
}: {
  scene: StickSceneData;
  alt: string;
  compact?: boolean;
  parallax?: boolean;
}) {
  return (
    <div
      className={`marketing-diagram-preview ${compact ? "is-compact" : ""}`}
      data-parallax-media={parallax ? "" : undefined}
    >
      <div className="marketing-diagram-preview-canvas">
        <StickScene scene={scene} label={alt} />
      </div>
    </div>
  );
}
