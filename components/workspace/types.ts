import type { BuildingBlockDiagramData } from "@/components/building-blocks";

export type SpeechStatus = "idle" | "connecting" | "listening";

export type LayoutMode =
  | "textDominant"
  | "visualDominant"
  | "balanced"
  | "sequence"
  | "comparison";

export type ThemePalette = "slate" | "sage" | "ember" | "indigo" | "mono";
export type ThemeDensity = "compact" | "comfortable" | "spacious";
export type ThemeMotion = "subtle" | "none";

export type BlockKind =
  | "heading"
  | "notes"
  | "callout"
  | "diagram"
  | "image"
  | "comparison"
  | "timeline";

export type BlockSize = "compact" | "medium" | "large" | "wide";

export type GeneratedVisual =
  | {
      kind: "diagram";
      alt: string;
      diagram: BuildingBlockDiagramData;
    }
  | {
      kind: "generated";
      dataUrl: string;
      mimeType: string;
      alt: string;
    };

export type CompositionTheme = {
  palette: ThemePalette;
  density: ThemeDensity;
  motion: ThemeMotion;
};

export type CompositionBlock = {
  blockId: string;
  kind: BlockKind;
  title: string;
  body: string;
  items: string[];
  size: BlockSize;
  recallPhrases: string[];
  visual: GeneratedVisual | null;
  visualJobId: string | null;
  visualAlt: string;
  visualFailed?: boolean;
};

export type GenerateResponse = {
  title: string;
  layoutMode: LayoutMode;
  theme: CompositionTheme;
  blocks: CompositionBlock[];
  warning: string | null;
};

export type VisualJobResponse = {
  status: "pending" | "complete" | "failed";
  blockId: string;
  visual: GeneratedVisual | null;
  warning: string | null;
};

export type LessonStatus = "generating" | "ready" | "partial";

export type LessonPack = {
  schemaVersion: 1;
  id: string;
  title: string;
  subject: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  status: LessonStatus;
  composition: GenerateResponse;
};

export type DeepgramMessage = {
  type?: string;
  status?: string;
  message?: string;
  description?: string;
  code?: string;
  event?: string;
  transcript?: string;
  speech_final?: boolean;
  channel?: {
    alternatives?: Array<{
      transcript?: string;
    }>;
  };
};

export type DeepgramStatusResponse = {
  configured: boolean;
  apiKeyStatus:
    | "not_checked"
    | "missing"
    | "valid"
    | "invalid"
    | "unreachable"
    | "error";
  apiKeyMessage: string;
};
