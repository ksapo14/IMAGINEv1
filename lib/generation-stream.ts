import type { GenerateRequest, GenerateResponse } from "@/components/workspace/types";
import { FRONTEND_ONLY_NOTICE, isFrontendOnlyDeployment } from "./deployment-mode.ts";
export { API_BASE_URL, getApiBaseUrl } from "./api-base.ts";
import { API_BASE_URL } from "./api-base.ts";

type StreamEvent =
  | { type: "result"; result: unknown }
  | { type: "done" }
  | { type: "error"; message?: string };

type StreamHandlers = { onResult?: (result: GenerateResponse) => void };

const contentModeNames = new Set(["visual", "notes", "diagram"]);
const footprints = {
  small: [8, 5],
  medium: [12, 6],
  wide: [16, 7],
  full: [24, 10]
} as const;
const entityTypes = new Set(["stickFigure", "circle", "rectangle"]);
const poses = new Set(["neutral", "pointing", "walking", "holding", "raisedArms"]);
const facings = new Set(["left", "right", "front"]);
const directions = new Set(["forward", "backward", "both", "none"]);
const imageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isBoundedString(value: unknown, maximum: number, required = false): value is string {
  return typeof value === "string" && value.length <= maximum && (!required || value.trim().length > 0);
}

function isSafeIdentifier(value: unknown, maximum: number, lowercase = false): value is string {
  if (!isBoundedString(value, maximum, true)) return false;
  return (lowercase ? /^[a-z0-9_-]+$/ : /^[a-zA-Z0-9_-]+$/).test(value);
}

function isInteger(value: unknown, minimum: number, maximum: number) {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function rectanglesOverlap(first: Record<string, unknown>, second: Record<string, unknown>) {
  return !(
    Number(first.x) + Number(first.width) <= Number(second.x)
    || Number(second.x) + Number(second.width) <= Number(first.x)
    || Number(first.y) + Number(first.height) <= Number(second.y)
    || Number(second.y) + Number(second.height) <= Number(first.y)
  );
}

/** The renderer accepts only the complete server-packed StickScene vocabulary. */
function isValidStickScene(value: unknown) {
  if (!isRecord(value) || value.version !== 1 || value.columns !== 12 || value.rows !== 8) return false;
  if (!Array.isArray(value.entities) || !value.entities.length || value.entities.length > 6) return false;
  if (!Array.isArray(value.connections) || value.connections.length > 6) return false;
  const entityIds = new Set<string>();
  const entities: Record<string, unknown>[] = [];
  for (const entity of value.entities) {
    if (!isRecord(entity)) return false;
    if (
      !isSafeIdentifier(entity.id, 40) || entityIds.has(entity.id)
      || !entityTypes.has(String(entity.type))
      || !isInteger(entity.x, 0, 11) || !isInteger(entity.y, 0, 7)
      || !isInteger(entity.width, 1, 12) || !isInteger(entity.height, 1, 8)
      || Number(entity.x) + Number(entity.width) > 12
      || Number(entity.y) + Number(entity.height) > 8
      || !isBoundedString(entity.label, 32)
      || !poses.has(String(entity.pose)) || !facings.has(String(entity.facing))
      || entities.some((placed) => rectanglesOverlap(entity, placed))
    ) return false;
    entityIds.add(entity.id);
    entities.push(entity);
  }
  const connectionIds = new Set<string>();
  for (const connection of value.connections) {
    if (!isRecord(connection)) return false;
    if (
      !isSafeIdentifier(connection.id, 40) || connectionIds.has(connection.id)
      || !isSafeIdentifier(connection.fromId, 40) || !isSafeIdentifier(connection.toId, 40)
      || connection.fromId === connection.toId
      || !entityIds.has(connection.fromId) || !entityIds.has(connection.toId)
      || !isBoundedString(connection.label, 28)
      || !directions.has(String(connection.direction))
    ) return false;
    connectionIds.add(connection.id);
  }
  return true;
}

function isValidGeneratedAsset(value: unknown) {
  if (!isRecord(value) || !imageMimeTypes.has(String(value.mimeType))) return false;
  if (!isBoundedString(value.dataUrl, 20_000_100, true)) return false;
  const prefix = `data:${value.mimeType};base64,`;
  const payload = value.dataUrl.startsWith(prefix) ? value.dataUrl.slice(prefix.length) : "";
  return payload.length > 0
    && payload.length % 4 === 0
    && /^[A-Za-z0-9+/]+={0,2}$/.test(payload)
    && isBoundedString(value.alt, 320, true)
    && Boolean(value.alt.trim());
}

/** Validate semantic dependencies before untrusted streamed JSON reaches session state. */
export function validateGenerateResponse(value: unknown): GenerateResponse {
  if (
    !isRecord(value)
    || !["integrate", "reset"].includes(String(value.boardStrategy))
    || !["create", "update"].includes(String(value.action))
    || !["replace", "expand"].includes(String(value.mergeBehavior))
  ) {
    throw new Error("The live generation stream returned an invalid decision.");
  }
  if (
    !isInteger(value.boardVersion, 0, Number.MAX_SAFE_INTEGER)
    || !isInteger(value.turnSequence, 0, Number.MAX_SAFE_INTEGER)
    || typeof value.confidence !== "number" || !Number.isFinite(value.confidence)
    || value.confidence < 0 || value.confidence > 1
    || (value.warning !== null && !isBoundedString(value.warning, 360))
  ) throw new Error("The live generation stream returned invalid decision metadata.");
  const modes: unknown[] = Array.isArray(value.contentModes) ? value.contentModes : [];
  const validModes = Array.isArray(value.contentModes) && modes.length <= 3
    && modes.every((mode) => typeof mode === "string" && contentModeNames.has(mode))
    && new Set(modes).size === modes.length;
  if (!validModes) throw new Error("The live generation stream returned invalid content modes.");
  const summaryBullets = Array.isArray(value.summaryBullets) ? value.summaryBullets : [];
  const validSummaryBullets = summaryBullets.length <= 4 && summaryBullets.every((bullet) => (
    isBoundedString(bullet, 120, true) && bullet === bullet.trim()
  ));
  const hasNotes = modes.includes("notes");
  const retainedNotesMarker = value.mergeBehavior === "expand"
    && value.action === "update"
    && hasNotes
    && summaryBullets.length === 0;
  if (
    modes.length === 0
    || !isSafeIdentifier(value.sceneId, 80)
    || !isSafeIdentifier(value.conceptKey, 80, true)
    || !isBoundedString(value.title, 100, true)
    || !["show", "inheritPrimary"].includes(String(value.headingMode))
    || !isBoundedString(value.summary, 320, true)
    || !validSummaryBullets
    || (hasNotes ? summaryBullets.length === 0 && !retainedNotesMarker : summaryBullets.length !== 0)
  ) throw new Error("The live generation stream returned incomplete scene content.");
  if (
    value.action === "create" && value.targetSceneId !== null
    || value.action === "update" && (
      !isSafeIdentifier(value.targetSceneId, 80) || value.targetSceneId !== value.sceneId
    )
  ) throw new Error("The live generation stream returned invalid scene identity.");
  if (
    value.action === "create" && value.mergeBehavior !== "replace"
    || value.mergeBehavior === "expand" && (
      value.action !== "update" || value.boardStrategy !== "integrate"
    )
  ) throw new Error("The live generation stream returned an invalid merge behavior.");

  const placement = value.placement;
  const footprint = value.requestedFootprint;
  if (!isRecord(placement) || typeof footprint !== "string" || !(footprint in footprints)) {
    throw new Error("The live generation stream returned invalid placement data.");
  }
  const [width, height] = footprints[footprint as keyof typeof footprints];
  if (
    placement.width !== width || placement.height !== height
    || !Number.isSafeInteger(placement.page) || Number(placement.page) < 1 || Number(placement.page) > 48
    || !Number.isSafeInteger(placement.column) || Number(placement.column) < 0
    || !Number.isSafeInteger(placement.row) || Number(placement.row) < 0
    || Number(placement.column) + width > 24 || Number(placement.row) + height > 14
  ) throw new Error("The live generation stream returned invalid placement data.");
  if (
    value.boardStrategy === "reset"
    && (
      value.action !== "create" || value.targetSceneId !== null
      || placement.page !== 1 || value.headingMode !== "show"
    )
  ) throw new Error("The live generation stream returned an invalid reset decision.");
  const hasVisual = modes.includes("visual");
  const hasDiagram = modes.includes("diagram");
  const minimum = modes.length === 3 || (hasVisual && hasDiagram)
    ? "full"
    : modes.length === 2 || hasDiagram || (modes.length === 1 && hasVisual)
      ? "medium"
      : "small";
  const order = ["small", "medium", "wide", "full"];
  if (order.indexOf(footprint) < order.indexOf(minimum)) {
    throw new Error("The live generation stream returned an undersized scene.");
  }
  const scene = value.stickScene;
  const hasValidStickScene = isValidStickScene(scene);
  const needsStickScene = hasVisual && (hasDiagram || value.renderMode === "structured");
  const retainedVisualMarker = value.mergeBehavior === "expand"
    && value.action === "update"
    && needsStickScene
    && scene === null;
  if (needsStickScene ? !hasValidStickScene && !retainedVisualMarker : scene !== null) {
    throw new Error("The live generation stream returned an invalid StickScene dependency.");
  }
  const canGenerateAsset = hasVisual || hasDiagram;
  if (!canGenerateAsset && (value.renderMode !== "structured" || value.generatedAsset !== null || value.visualJobId !== null)) {
    throw new Error("The live generation stream returned an invalid visual dependency.");
  }
  if (
    hasVisual && !hasDiagram
    && value.renderMode !== "structured"
    && value.renderMode !== "generatedAsset"
  ) throw new Error("The live generation stream returned an invalid render mode.");
  if (canGenerateAsset && value.renderMode === "structured" && (value.generatedAsset !== null || value.visualJobId !== null)) {
    throw new Error("The live generation stream returned an invalid visual dependency.");
  }
  if (hasDiagram && value.renderMode !== "generatedAsset") {
    throw new Error("The live generation stream returned an invalid diagram render mode.");
  }
  if (value.generatedAsset !== null && !isValidGeneratedAsset(value.generatedAsset)) {
    throw new Error("The live generation stream returned an invalid generated asset.");
  }
  if (value.visualJobId !== null && !isSafeIdentifier(value.visualJobId, 80)) {
    throw new Error("The live generation stream returned an invalid visual job.");
  }
  const preservationMarker = value.mergeBehavior === "expand"
    && value.action === "update"
    && hasDiagram
    && value.renderMode === "generatedAsset"
    && value.generatedAsset === null
    && value.visualJobId === null;
  if (
    value.renderMode === "generatedAsset"
    && Boolean(value.generatedAsset) === Boolean(value.visualJobId)
    && !preservationMarker
  ) {
    throw new Error("The live generation stream returned an incomplete generated visual.");
  }
  return value as GenerateResponse;
}

/** Avoid reflecting provider URLs, credentials, or oversized diagnostics into the UI. */
function sanitizeMessage(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const clean = value
    .replace(/https?:\/\/\S+/gi, "the provider")
    .replace(/(?:api[_-]?key|key|token)\s*[=:]\s*\S+/gi, "credential [redacted]")
    .replace(/AIza[\w-]+/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
  return clean || fallback;
}

async function responseError(response: Response, fallback: string) {
  const problem = (await response.json().catch(() => null)) as unknown;
  if (problem && typeof problem === "object" && "detail" in problem) {
    const detail = (problem as { detail?: unknown }).detail;
    if (typeof detail === "string") return sanitizeMessage(detail, fallback);
    if (Array.isArray(detail)) {
      const joined = detail
        .map((item) => item && typeof item === "object" && "msg" in item ? String(item.msg) : "")
        .filter(Boolean)
        .join(" ");
      return sanitizeMessage(joined, fallback);
    }
  }
  return fallback;
}

async function bufferedGeneration(request: GenerateRequest, signal: AbortSignal) {
  const response = await fetch(`${API_BASE_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal
  });
  if (!response.ok) {
    throw new Error(await responseError(response, "The generation request could not be completed."));
  }
  return validateGenerateResponse(await response.json());
}

/** Consume atomic NDJSON decisions and require the server's explicit done marker. */
export async function streamGeneration(
  request: GenerateRequest,
  handlers: StreamHandlers,
  signal: AbortSignal
) {
  if (isFrontendOnlyDeployment()) throw new Error(FRONTEND_ONLY_NOTICE);

  const response = await fetch(`${API_BASE_URL}/api/generate/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal
  });
  if (response.status === 404 || response.status === 405) {
    const fallback = await bufferedGeneration(request, signal);
    handlers.onResult?.(fallback);
    return fallback;
  }
  if (!response.ok) {
    throw new Error(await responseError(response, "The live generation stream could not start."));
  }
  if (!response.body) throw new Error("This browser could not read the live generation stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: GenerateResponse | null = null;
  let done = false;

  const handleLine = (line: string) => {
    if (!line.trim()) return;
    let event: StreamEvent;
    try {
      event = JSON.parse(line) as StreamEvent;
    } catch {
      throw new Error("The live generation stream returned malformed data.");
    }
    if (event.type === "result") {
      result = validateGenerateResponse(event.result);
      handlers.onResult?.(result);
    } else if (event.type === "done") {
      done = true;
    } else if (event.type === "error") {
      throw new Error(sanitizeMessage(event.message, "Live generation failed."));
    }
  };

  try {
    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(handleLine);
      if (chunk.done) break;
    }
    if (buffer.trim()) handleLine(buffer);
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }

  if (!result || !done) throw new Error("Live generation ended before a board decision was ready.");
  return result;
}
