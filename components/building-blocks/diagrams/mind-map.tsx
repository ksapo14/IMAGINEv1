import type { CSSProperties } from "react";
import { Round } from "../components";
import type { DiagramMotion, MindMapData } from "../types";
import { DiagramFrame } from "./diagram-frame";

export function MindMap({
  data,
  motion = "subtle"
}: {
  data: MindMapData;
  motion?: DiagramMotion;
}) {
  const count = data.surrounding.length;

  return (
    <DiagramFrame
      title={data.title}
      description={data.description}
      label="Mind map"
      motion={motion}
    >
      <div className="relative mx-auto h-[39rem] min-w-[46rem] max-w-5xl">
        <div className="absolute left-1/2 top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 [&_article]:border-[var(--signal)] [&_article]:bg-[color-mix(in_srgb,var(--signal)_12%,var(--canvas-soft))]">
          <Round data={data.center} />
        </div>
        {data.surrounding.map((node, index) => {
          const angle = (360 / count) * index - 90;
          const radians = (angle * Math.PI) / 180;
          const x = 50 + Math.cos(radians) * 39;
          const y = 50 + Math.sin(radians) * 38;
          const lineStyle = {
            width: "39%",
            transform: `rotate(${angle}deg)`
          } as CSSProperties;
          const nodeStyle = { left: `${x}%`, top: `${y}%` } as CSSProperties;

          return (
            <div key={node.id}>
              <span
                className="absolute left-1/2 top-1/2 h-px origin-left bg-[var(--line-strong)]"
                style={lineStyle}
                aria-hidden="true"
              />
              <div
                className="absolute z-[1] -translate-x-1/2 -translate-y-1/2 [&_article]:w-36"
                style={nodeStyle}
              >
                <Round data={node} />
              </div>
            </div>
          );
        })}
      </div>
    </DiagramFrame>
  );
}
