/** Shared transport and UI types for the cumulative live whiteboard. */
export type SpeechStatus = "idle" | "connecting" | "listening";
export type WhiteboardAction = "create" | "update";
export type BoardStrategy = "integrate" | "reset";
export type RecentTurnAction = WhiteboardAction | "hold";
export type ContentMode = "visual" | "notes" | "diagram";
export type HeadingMode = "show" | "inheritPrimary";

export type LessonContext = {
  title: string;
  subject: string;
  source: string;
};

export type LessonContextRecord = LessonContext & {
  schemaVersion: 2;
  id: string;
  createdAt: string;
  updatedAt: string;
};

export type RecentTurn = {
  turnSequence: number;
  userInput: string;
  action: RecentTurnAction;
  conceptKey: string;
  summary: string;
};

export type ConceptMemory = {
  conceptKey: string;
  title: string;
  summary: string;
  sceneId: string;
};

export type BoardPlacement = {
  page: number;
  column: number;
  row: number;
  width: number;
  height: number;
};

export type BoardSceneDigest = {
  sceneId: string;
  conceptKey: string;
  title: string;
  headingMode: HeadingMode;
  contentModes: ContentMode[];
  placement: BoardPlacement;
};

export type BoardDigest = {
  version: number;
  currentPage: number;
  columns: 24;
  rows: 14;
  scenes: BoardSceneDigest[];
};

export type StickEntity = {
  id: string;
  type: "stickFigure" | "circle" | "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  pose: "neutral" | "pointing" | "walking" | "holding" | "raisedArms";
  facing: "left" | "right" | "front";
};

export type StickConnection = {
  id: string;
  fromId: string;
  toId: string;
  label: string;
  direction: "forward" | "backward" | "both" | "none";
};

export type StickScene = {
  version: 1;
  columns: 12;
  rows: 8;
  entities: StickEntity[];
  connections: StickConnection[];
};

export type GeneratedAsset = {
  dataUrl: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  alt: string;
};

export type GenerateRequest = {
  userInput: string;
  mode: "live";
  turnSequence: number;
  lessonContext: LessonContext;
  recentTurns: RecentTurn[];
  concepts: ConceptMemory[];
  board: BoardDigest;
};

export type WhiteboardDecision = {
  boardVersion: number;
  turnSequence: number;
  boardStrategy: BoardStrategy;
  action: WhiteboardAction;
  conceptKey: string;
  title: string;
  headingMode: HeadingMode;
  summaryBullets: string[];
  summary: string;
  contentModes: ContentMode[];
  confidence: number;
  sceneId: string;
  targetSceneId: string | null;
  requestedFootprint: "small" | "medium" | "wide" | "full";
  placement: BoardPlacement;
  stickScene: StickScene | null;
  renderMode: "structured" | "generatedAsset";
  generatedAsset: GeneratedAsset | null;
  visualJobId: string | null;
  warning: string | null;
};

export type VisualJobResponse = {
  status: "pending" | "complete" | "failed";
  sceneId: string;
  generatedAsset: GeneratedAsset | null;
  warning: string | null;
};

export type WhiteboardScene = {
  sceneId: string;
  conceptKey: string;
  title: string;
  headingMode: HeadingMode;
  summaryBullets: string[];
  summary: string;
  contentModes: ContentMode[];
  placement: BoardPlacement;
  stickScene: StickScene | null;
  renderMode: "structured" | "generatedAsset";
  generatedAsset: GeneratedAsset | null;
  visualJobId: string | null;
  visualFailed?: boolean;
};

export type WhiteboardState = {
  version: number;
  currentPage: number;
  columns: 24;
  rows: 14;
  scenes: WhiteboardScene[];
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
  channel?: { alternatives?: Array<{ transcript?: string }> };
};

export type DeepgramStatusResponse = {
  configured: boolean;
  apiKeyStatus: "not_checked" | "missing" | "valid" | "invalid" | "unreachable" | "error";
  apiKeyMessage: string;
};

export type GenerateResponse = WhiteboardDecision;
