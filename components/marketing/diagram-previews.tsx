import { DiagramRenderer } from "@/components/building-blocks";
import type { BuildingBlockDiagramData } from "@/components/building-blocks";

export const prepareDiagram: BuildingBlockDiagramData = {
  version: 3,
  type: "flowchart",
  title: "Cellular energy sequence",
  description: "A prepared process visual for the lesson.",
  lines: [
    {
      type: "blockLine",
      id: "prepared-energy-line",
      blocks: [
        {
          type: "block",
          id: "prepared-glucose",
          heading: "Glucose",
          description: "Stored chemical energy"
        },
        {
          type: "block",
          id: "prepared-respiration",
          heading: "Cellular respiration",
          description: "Energy is transferred"
        },
        {
          type: "block",
          id: "prepared-atp",
          heading: "ATP",
          description: "Usable cellular energy"
        }
      ]
    }
  ]
};

export const liveDiagram: BuildingBlockDiagramData = {
  version: 3,
  type: "mindMap",
  title: "Live explanation map",
  description: "Finalized speech organized around the current idea.",
  center: {
    type: "round",
    id: "live-center",
    heading: "Cellular respiration",
    description: "The idea being explained"
  },
  surrounding: [
    {
      type: "round",
      id: "live-input",
      heading: "Inputs",
      description: "Glucose and oxygen"
    },
    {
      type: "round",
      id: "live-location",
      heading: "Location",
      description: "Across the cell"
    },
    {
      type: "round",
      id: "live-output",
      heading: "Output",
      description: "ATP for cellular work"
    }
  ]
};

export const recallDiagram: BuildingBlockDiagramData = {
  version: 3,
  type: "tree",
  title: "Stored lesson visual",
  description: "Recalled locally by its exact prepared phrase.",
  root: {
    id: "recall-root",
    heading: "Cellular energy",
    description: "Prepared diagram",
    children: [
      {
        id: "recall-input",
        heading: "Inputs",
        description: "Glucose and oxygen",
        children: []
      },
      {
        id: "recall-process",
        heading: "Process",
        description: "Respiration stages",
        children: []
      },
      {
        id: "recall-output",
        heading: "Outputs",
        description: "ATP, water, carbon dioxide",
        children: []
      }
    ]
  }
};

export const educatorControlDiagram: BuildingBlockDiagramData = {
  version: 3,
  type: "flowchart",
  title: "Educator-controlled canvas",
  description: "Ordinary speech and exact recall remain distinct actions.",
  lines: [
    {
      type: "blockLine",
      id: "educator-live-line",
      blocks: [
        {
          type: "block",
          id: "educator-speech",
          heading: "Finalized speech",
          description: "The explanation continues"
        },
        {
          type: "block",
          id: "educator-live",
          heading: "Live canvas",
          description: "Notes and useful visuals"
        }
      ]
    },
    {
      type: "blockLine",
      id: "educator-recall-line",
      blocks: [
        {
          type: "block",
          id: "educator-command",
          heading: "Exact Imagine command",
          description: "The educator chooses the moment"
        },
        {
          type: "block",
          id: "educator-stored",
          heading: "Stored diagram",
          description: "Revealed without generation"
        }
      ]
    }
  ]
};

export const pilotDiagram: BuildingBlockDiagramData = {
  version: 3,
  type: "mindMap",
  title: "Pilot review",
  description: "The measures considered together during a school pilot.",
  center: {
    type: "round",
    id: "pilot-center",
    heading: "Pilot review",
    description: "School context"
  },
  surrounding: [
    {
      type: "round",
      id: "pilot-prep",
      heading: "Prep effort",
      description: "Before the lesson"
    },
    {
      type: "round",
      id: "pilot-usability",
      heading: "Usability",
      description: "Educator experience"
    },
    {
      type: "round",
      id: "pilot-recall",
      heading: "Recall",
      description: "Prepared phrase reliability"
    },
    {
      type: "round",
      id: "pilot-continuity",
      heading: "Continuity",
      description: "Lesson flow"
    },
    {
      type: "round",
      id: "pilot-signal",
      heading: "Local signal",
      description: "Selected by the school"
    }
  ]
};

export function MarketingDiagramPreview({
  diagram,
  alt,
  compact = false,
  parallax = false
}: {
  diagram: BuildingBlockDiagramData;
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
        <DiagramRenderer diagram={diagram} alt={alt} motion="none" />
      </div>
    </div>
  );
}
