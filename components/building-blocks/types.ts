export type BlockData = {
  type: "block";
  id: string;
  heading: string;
  description: string;
};

export type RoundData = {
  type: "round";
  id: string;
  heading: string;
  description: string;
};

export type BlockLineData = {
  type: "blockLine";
  id: string;
  blocks: BlockData[];
};

export type TreeNodeData = {
  id: string;
  heading: string;
  description: string;
  children: TreeNodeData[];
};

type DiagramBase = {
  version: 3;
  title: string;
  description: string;
};

export type FlowchartData = DiagramBase & {
  type: "flowchart";
  lines: BlockLineData[];
};

export type TreeData = DiagramBase & {
  type: "tree";
  root: TreeNodeData;
};

export type VennRegionData = {
  heading: string;
  items: string[];
};

export type VennDiagramData = DiagramBase & {
  type: "vennDiagram";
  left: VennRegionData;
  right: VennRegionData;
  similar: VennRegionData;
};

export type PiePortionData = {
  heading: string;
  proportion: number;
};

export type PieChartData = DiagramBase & {
  type: "pieChart";
  portions: PiePortionData[];
};

export type MindMapData = DiagramBase & {
  type: "mindMap";
  center: RoundData;
  surrounding: RoundData[];
};

export type BuildingBlockDiagramData =
  | FlowchartData
  | TreeData
  | VennDiagramData
  | PieChartData
  | MindMapData;

export type DiagramMotion = "subtle" | "none";
