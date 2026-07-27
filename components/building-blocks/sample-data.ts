import type {
  BlockData,
  BlockLineData,
  FlowchartData,
  MindMapData,
  PieChartData,
  RoundData,
  TreeData,
  VennDiagramData
} from "./types";

export const blockSample: BlockData = {
  type: "block",
  id: "cell-input",
  heading: "Glucose enters",
  description: "A six-carbon sugar begins cellular respiration."
};

export const roundSample: RoundData = {
  type: "round",
  id: "atp-center",
  heading: "ATP",
  description: "Usable chemical energy for the cell."
};

export const blockLineSample: BlockLineData = {
  type: "blockLine",
  id: "energy-line",
  blocks: [
    blockSample,
    {
      type: "block",
      id: "glycolysis",
      heading: "Glycolysis",
      description: "Glucose splits into two pyruvate molecules."
    },
    {
      type: "block",
      id: "atp-output",
      heading: "ATP released",
      description: "A small amount of energy becomes available."
    }
  ]
};

export const flowchartSample: FlowchartData = {
  version: 3,
  type: "flowchart",
  title: "Cellular respiration",
  description: "Two ordered pathways shown as separate block lines.",
  lines: [
    blockLineSample,
    {
      type: "blockLine",
      id: "oxygen-line",
      blocks: [
        {
          type: "block",
          id: "oxygen-input",
          heading: "Oxygen arrives",
          description: "Oxygen accepts electrons at the final stage."
        },
        {
          type: "block",
          id: "electron-chain",
          heading: "Electron transport",
          description: "A proton gradient forms across the membrane."
        },
        {
          type: "block",
          id: "water-output",
          heading: "Water forms",
          description: "Oxygen combines with electrons and hydrogen."
        }
      ]
    }
  ]
};

export const treeSample: TreeData = {
  version: 3,
  type: "tree",
  title: "Types of matter",
  description: "A root concept branches into nested classifications.",
  root: {
    id: "matter",
    heading: "Matter",
    description: "Anything with mass and volume.",
    children: [
      {
        id: "pure-substances",
        heading: "Pure substances",
        description: "A fixed chemical composition.",
        children: [
          {
            id: "elements",
            heading: "Elements",
            description: "One kind of atom.",
            children: []
          },
          {
            id: "compounds",
            heading: "Compounds",
            description: "Elements chemically joined.",
            children: []
          }
        ]
      },
      {
        id: "mixtures",
        heading: "Mixtures",
        description: "Substances physically combined.",
        children: [
          {
            id: "homogeneous",
            heading: "Homogeneous",
            description: "Uniform throughout.",
            children: []
          },
          {
            id: "heterogeneous",
            heading: "Heterogeneous",
            description: "Composition varies by region.",
            children: []
          }
        ]
      }
    ]
  }
};

export const vennSample: VennDiagramData = {
  version: 3,
  type: "vennDiagram",
  title: "Plant and animal cells",
  description: "Unique traits sit outside the overlap; shared traits sit inside it.",
  left: {
    heading: "Plant cells",
    items: ["Cell wall", "Chloroplasts", "Large central vacuole"]
  },
  right: {
    heading: "Animal cells",
    items: ["Centrioles", "Lysosomes", "Flexible membrane"]
  },
  similar: {
    heading: "Both",
    items: ["Nucleus", "Mitochondria", "Cytoplasm"]
  }
};

export const pieSample: PieChartData = {
  version: 3,
  type: "pieChart",
  title: "Atmospheric composition",
  description: "Example proportions total exactly 100 percent.",
  portions: [
    { heading: "Nitrogen", proportion: 78 },
    { heading: "Oxygen", proportion: 21 },
    { heading: "Other gases", proportion: 1 }
  ]
};

export const mindMapSample: MindMapData = {
  version: 3,
  type: "mindMap",
  title: "Research planning",
  description: "Related topics surround one central concept.",
  center: {
    type: "round",
    id: "research",
    heading: "Research question",
    description: "The inquiry that guides the project."
  },
  surrounding: [
    {
      type: "round",
      id: "sources",
      heading: "Sources",
      description: "Evidence to inspect."
    },
    {
      type: "round",
      id: "method",
      heading: "Method",
      description: "How evidence is gathered."
    },
    {
      type: "round",
      id: "variables",
      heading: "Variables",
      description: "Factors that may change."
    },
    {
      type: "round",
      id: "analysis",
      heading: "Analysis",
      description: "How findings are interpreted."
    },
    {
      type: "round",
      id: "limits",
      heading: "Limits",
      description: "Boundaries of the conclusion."
    }
  ]
};
