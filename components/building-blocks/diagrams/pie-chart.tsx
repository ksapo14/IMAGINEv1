import type { CSSProperties } from "react";
import type { DiagramMotion, PieChartData } from "../types";
import { DiagramFrame } from "./diagram-frame";

const portionColors = [
  "#9acb56",
  "#5f8f78",
  "#d0a85f",
  "#7188c7",
  "#b86f62",
  "#8f7eb3",
  "#6797a0",
  "#b08b68"
];

function pieBackground(data: PieChartData) {
  let start = 0;
  const stops = data.portions.map((portion, index) => {
    const end = start + portion.proportion;
    const stop = `${portionColors[index % portionColors.length]} ${start}% ${end}%`;
    start = end;
    return stop;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

export function PieChart({
  data,
  motion = "subtle"
}: {
  data: PieChartData;
  motion?: DiagramMotion;
}) {
  const chartStyle = { background: pieBackground(data) } as CSSProperties;

  return (
    <DiagramFrame
      title={data.title}
      description={data.description}
      label="Pie chart"
      motion={motion}
    >
      <div className="grid items-center gap-8 md:grid-cols-[minmax(17rem,0.9fr)_minmax(15rem,1.1fr)]">
        <div
          className="diagram-enter mx-auto aspect-square w-full max-w-80 rounded-full border-[10px] border-[var(--canvas-surface)] shadow-[0_18px_50px_var(--shadow)]"
          style={chartStyle}
          role="img"
          aria-label={data.portions
            .map((portion) => `${portion.heading}: ${portion.proportion}%`)
            .join(", ")}
        />
        <ol className="m-0 grid list-none gap-3 p-0">
          {data.portions.map((portion, index) => (
            <li
              key={`${portion.heading}-${index}`}
              className="diagram-enter grid grid-cols-[0.8rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--canvas-soft)] px-4 py-3"
            >
              <span
                className="aspect-square rounded-sm"
                style={{ backgroundColor: portionColors[index % portionColors.length] }}
                aria-hidden="true"
              />
              <span className="text-sm font-medium">{portion.heading}</span>
              <strong className="font-mono text-sm font-semibold tabular-nums">
                {portion.proportion}%
              </strong>
            </li>
          ))}
        </ol>
      </div>
    </DiagramFrame>
  );
}
