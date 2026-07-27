import {
  Flowchart,
  MindMap,
  PieChart,
  Tree,
  VennDiagram
} from "./diagrams";
import type { BuildingBlockDiagramData, DiagramMotion } from "./types";

export function DiagramRenderer({
  diagram,
  alt,
  motion = "subtle"
}: {
  diagram: BuildingBlockDiagramData;
  alt: string;
  motion?: DiagramMotion;
}) {
  return (
    <div className="h-full" aria-label={alt}>
      {diagram.type === "flowchart" ? (
        <Flowchart data={diagram} motion={motion} />
      ) : diagram.type === "tree" ? (
        <Tree data={diagram} motion={motion} />
      ) : diagram.type === "vennDiagram" ? (
        <VennDiagram data={diagram} motion={motion} />
      ) : diagram.type === "pieChart" ? (
        <PieChart data={diagram} motion={motion} />
      ) : (
        <MindMap data={diagram} motion={motion} />
      )}
    </div>
  );
}
