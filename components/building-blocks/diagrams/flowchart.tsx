import { BlockLine } from "../components";
import type { DiagramMotion, FlowchartData } from "../types";
import { DiagramFrame } from "./diagram-frame";

export function Flowchart({
  data,
  motion = "subtle"
}: {
  data: FlowchartData;
  motion?: DiagramMotion;
}) {
  return (
    <DiagramFrame
      title={data.title}
      description={data.description}
      label="Flowchart"
      motion={motion}
    >
      <div className="grid min-w-max gap-5">
        {data.lines.map((line) => (
          <div
            key={line.id}
            className="rounded-2xl border border-[var(--line)] bg-[color-mix(in_srgb,var(--canvas-soft)_45%,transparent)] p-4"
          >
            <BlockLine data={line} />
          </div>
        ))}
      </div>
    </DiagramFrame>
  );
}
