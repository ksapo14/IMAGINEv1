import { useId } from "react";
import type { StickEntity, StickScene as StickSceneData } from "@/components/workspace/types";

export type ScenePalette = {
  ink: string;
  accent: string;
  surface: string;
  softFill: string;
  shadow: string;
};

const OUTLINE_PALETTE: ScenePalette = {
  ink: "#171717",
  accent: "#404040",
  surface: "#ffffff",
  softFill: "transparent",
  shadow: "transparent"
};

/** Keep all trusted scenes inside the same monochrome outline language. */
export function getScenePalette(_key: string) {
  return OUTLINE_PALETTE;
}

function center(entity: StickEntity) {
  return { x: entity.x + entity.width / 2, y: entity.y + entity.height / 2 };
}

function Figure({ entity }: { entity: StickEntity }) {
  const cx = entity.x + entity.width / 2;
  const headY = entity.y + entity.height * 0.2;
  const torsoTop = entity.y + entity.height * 0.38;
  const torsoBottom = entity.y + entity.height * 0.68;
  const direction = entity.facing === "left" ? -1 : entity.facing === "right" ? 1 : 0;
  const armReach = entity.width * 0.38;
  const legReach = entity.width * 0.28;
  const raised = entity.pose === "raisedArms";
  const walking = entity.pose === "walking";
  const pointing = entity.pose === "pointing";
  const holding = entity.pose === "holding";
  const leftHand = raised ? torsoTop - entity.height * 0.2 : torsoTop + entity.height * 0.18;
  const rightHand = pointing
    ? torsoTop
    : raised ? torsoTop - entity.height * 0.2 : torsoTop + entity.height * 0.18;
  const rightReach = pointing ? armReach * (direction || 1) * 1.45 : armReach;

  return (
    <g>
      <circle cx={cx} cy={headY} r={Math.min(entity.width, entity.height) * 0.13} />
      <line x1={cx} y1={torsoTop} x2={cx} y2={torsoBottom} />
      <line x1={cx} y1={torsoTop + entity.height * 0.05} x2={cx - armReach} y2={leftHand} />
      <line x1={cx} y1={torsoTop + entity.height * 0.05} x2={cx + rightReach} y2={rightHand} />
      <line x1={cx} y1={torsoBottom} x2={cx - (walking ? legReach * 1.5 : legReach)} y2={entity.y + entity.height * 0.94} />
      <line x1={cx} y1={torsoBottom} x2={cx + (walking ? legReach * 1.5 : legReach)} y2={entity.y + entity.height * 0.94} />
      {holding ? <rect x={cx - entity.width * 0.2} y={torsoTop + entity.height * 0.08} width={entity.width * 0.4} height={entity.height * 0.18} /> : null}
    </g>
  );
}

/** Render the bounded scene vocabulary; no model-authored markup enters the DOM. */
export function StickScene({
  scene,
  label,
  palette,
  showConnections = true
}: {
  scene: StickSceneData;
  label: string;
  palette?: ScenePalette;
  showConnections?: boolean;
}) {
  // React supplies a stable per-instance value; sanitizing it keeps SVG fragment IDs selector-safe.
  const markerId = `stick-arrow-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const entities = new Map(scene.entities.map((entity) => [entity.id, entity]));
  const colors = palette ?? { ink: "currentColor", accent: "currentColor", surface: "white", softFill: "white", shadow: "transparent" };
  return (
    <svg
      viewBox="0 0 12 8"
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMid meet"
      className="h-full min-h-32 w-full"
      style={{ color: colors.ink }}
    >
      <defs>
        <marker id={markerId} markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
          <path d="M0,0 L5,2.5 L0,5" fill="none" stroke="currentColor" strokeWidth="0.7" />
        </marker>
      </defs>
      <g fill="none" stroke={colors.ink} strokeWidth="0.11" strokeLinecap="round" strokeLinejoin="round">
        {showConnections ? scene.connections.map((connection) => {
          const from = entities.get(connection.fromId);
          const to = entities.get(connection.toId);
          if (!from || !to) return null;
          const start = center(from);
          const end = center(to);
          return (
            <g key={connection.id} stroke={colors.accent}>
              <line
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                markerEnd={connection.direction === "forward" || connection.direction === "both" ? `url(#${markerId})` : undefined}
                markerStart={connection.direction === "backward" || connection.direction === "both" ? `url(#${markerId})` : undefined}
              />
              {connection.label ? <text x={(start.x + end.x) / 2} y={(start.y + end.y) / 2 - 0.16} textAnchor="middle" fill={colors.ink} stroke={colors.surface} strokeWidth="0.12" paintOrder="stroke" fontSize="0.42" fontWeight="650">{connection.label}</text> : null}
            </g>
          );
        }) : null}
        {scene.entities.map((entity) => {
          return (
            <g key={entity.id}>
              {entity.type === "stickFigure" ? <Figure entity={entity} /> : null}
              {entity.type === "circle" ? <ellipse cx={entity.x + entity.width / 2} cy={entity.y + entity.height / 2} rx={entity.width / 2} ry={entity.height / 2} /> : null}
              {entity.type === "rectangle" ? <rect x={entity.x} y={entity.y} width={entity.width} height={entity.height} rx="0.12" /> : null}
              {entity.label ? <text x={entity.x + entity.width / 2} y={Math.min(7.78, entity.y + entity.height + 0.42)} textAnchor="middle" fill={colors.ink} stroke={colors.surface} strokeWidth="0.12" paintOrder="stroke" fontSize="0.44" fontWeight="650">{entity.label}</text> : null}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
