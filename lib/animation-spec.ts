import type { AnimationSpec } from "@/components/workspace/types";

const templates = new Set(["sequence", "flow", "cycle", "comparison", "motion"]);
const actions = new Set(["appear", "move", "rotate", "highlight", "trace"]);
const relationshipDirections = new Set(["forward", "backward", "both", "none"]);
const moveDirections = new Set(["up", "down", "left", "right"]);
const rotateDirections = new Set(["clockwise", "counterclockwise"]);
const distances = new Set(["short", "medium", "long"]);
const animationCuePattern = /\b(?:animations?|animate(?:d)?|in\s+motion)\b/gi;
const clauseBoundaryPattern = /[.!?;,:\n]|\b(?:but|however|yet|except|although|though|whereas|while|then)\b|\binstead\b(?!\s+of)|\brather\b(?!\s+than)/i;
const negationPattern = /(?:\b(?:no|not|without|avoid|avoiding|skip|omit|exclude)\b|\bdo\s+not\b|\bdon['’]?t\b|\binstead\s+of\b|\brather\s+than\b)/i;
const nonExclusiveNegationPattern = /\bnot\s+(?:just|only)\b/gi;
const removalVerbPattern = /\b(?:remove|delete|drop)\b/gi;
const clearVerbPattern = /\bclear\b/gi;
const positiveModeVerbPattern = /\b(?:add|append|include|show|use|create|make|give|provide|keep|retain)\b/gi;

export type AnimationPoint = { x: number; y: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isBoundedString(value: unknown, maximum: number, required = false): value is string {
  return typeof value === "string" && value.length <= maximum && (!required || value.trim().length > 0);
}

function isSafeIdentifier(value: unknown, maximum: number): value is string {
  return isBoundedString(value, maximum, true) && /^[a-zA-Z0-9_-]+$/.test(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}

function latestMatchStart(pattern: RegExp, value: string) {
  const matches = [...value.matchAll(pattern)];
  return matches.length ? matches.at(-1)!.index ?? -1 : -1;
}

/** Keep the immediate loader's bounded negation rules aligned with the server. */
function latestClearRemoval(localPrefix: string) {
  const clearStart = latestMatchStart(clearVerbPattern, localPrefix);
  if (clearStart < 0) return -1;
  const clearEnd = clearStart + 5;
  const before = localPrefix.slice(0, clearStart);
  const after = localPrefix.slice(clearEnd);
  const hasPositiveVerb = latestMatchStart(positiveModeVerbPattern, before) >= 0;
  const hasObjectDeterminer = /^\s+(?:(?:the|this|that|all|existing|current|previous|last)\s+)+$/i.test(after);
  return hasPositiveVerb && !hasObjectDeterminer ? -1 : clearStart;
}

function animationCueIsNegated(text: string, cueStart: number) {
  const localPrefix = text.slice(0, cueStart).split(clauseBoundaryPattern).at(-1) ?? "";
  if (negationPattern.test(localPrefix.replace(nonExclusiveNegationPattern, ""))) return true;
  return Math.max(latestMatchStart(removalVerbPattern, localPrefix), latestClearRemoval(localPrefix))
    > latestMatchStart(positiveModeVerbPattern, localPrefix);
}

/**
 * Decide whether to show the local SVG loader while the server owns final intent.
 * This mirrors the server's explicit cue, clause, negation, and removal behavior.
 */
export function requestsAnimation(input: string) {
  const text = input.slice(0, 4000);
  let hasPositiveCue = false;
  let hasNegatedCue = false;
  for (const match of text.matchAll(animationCuePattern)) {
    if (animationCueIsNegated(text, match.index ?? 0)) hasNegatedCue = true;
    else hasPositiveCue = true;
  }
  return hasPositiveCue && !hasNegatedCue;
}

/** Frontend-only deployments use local icons and labeled SVG fallbacks only. */
export function shouldResolveRemoteAnimationAssets(frontendOnly: boolean, remoteTerms: readonly string[]) {
  return !frontendOnly && remoteTerms.length > 0;
}

/** Combine every lifecycle pause condition before letting a GSAP timeline play. */
export function shouldPlayAnimation(
  inViewport: boolean,
  documentVisible: boolean,
  reducedMotion: boolean,
  manuallyPaused: boolean,
) {
  return inViewport && documentVisible && !reducedMotion && !manuallyPaused;
}

function compactGrid(count: number, snake = false): AnimationPoint[] {
  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / 3);
    const rawColumn = index % 3;
    const column = snake && row % 2 ? 2 - rawColumn : rawColumn;
    return { x: 20 + column * 30, y: 32 + row * 36 };
  });
}

/** Place up to six 16-unit objects without overlap inside the 100-unit SVG canvas. */
export function animationObjectPositions(template: AnimationSpec["template"], count: number): AnimationPoint[] {
  if (count <= 1) return [{ x: 50, y: 50 }];
  const linear = Array.from({ length: count }, (_, index) => ({ x: 16 + index * (68 / (count - 1)), y: 50 }));
  if (template === "cycle") return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
    return { x: 50 + Math.cos(angle) * 32, y: 50 + Math.sin(angle) * 30 };
  });
  if (template === "comparison") {
    const rows = Math.ceil(count / 2);
    const startY = rows === 1 ? 50 : rows === 2 ? 32 : 22;
    const gapY = rows === 1 ? 0 : rows === 2 ? 36 : 28;
    return Array.from({ length: count }, (_, index) => ({ x: index % 2 ? 72 : 28, y: startY + Math.floor(index / 2) * gapY }));
  }
  if (count > 4) return compactGrid(count, template === "sequence");
  if (template === "motion") return linear.map((point, index) => ({ ...point, y: index % 2 ? 62 : 38 }));
  if (template === "sequence") return linear.map((point, index) => ({ ...point, y: index % 2 ? 62 : 38 }));
  return linear;
}

/** Keep directed GSAP movement inside the icon and label-safe drawing margins. */
export function clampAnimationMove(
  point: AnimationPoint,
  direction: "up" | "down" | "left" | "right",
  distance: "short" | "medium" | "long",
) {
  const amount = distance === "long" ? 20 : distance === "medium" ? 13 : 7;
  const requested = {
    x: direction === "left" ? -amount : direction === "right" ? amount : 0,
    y: direction === "up" ? -amount : direction === "down" ? amount : 0,
  };
  return {
    x: Math.max(12 - point.x, Math.min(88 - point.x, requested.x)),
    y: Math.max(12 - point.y, Math.min(84 - point.y, requested.y)),
  };
}

/** Validate a declarative animation recipe before it reaches the SVG renderer. */
export function isValidAnimationSpec(value: unknown): value is AnimationSpec {
  if (!isRecord(value) || !hasOnlyKeys(value, ["version", "template", "objects", "relationships", "steps"])
    || value.version !== 1 || !templates.has(String(value.template))) return false;
  if (!Array.isArray(value.objects) || !Array.isArray(value.relationships) || !Array.isArray(value.steps)) return false;
  if (!value.objects.length || value.objects.length > 6 || value.relationships.length > 6 || !value.steps.length || value.steps.length > 6) return false;

  const objectIds = new Set<string>();
  for (const object of value.objects) {
    if (!isRecord(object) || !hasOnlyKeys(object, ["id", "assetKey", "label"])
      || !isSafeIdentifier(object.id, 40) || objectIds.has(object.id)
      || !isBoundedString(object.assetKey, 48, true) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(object.assetKey)
      || !isBoundedString(object.label, 32, true) || object.label !== object.label.trim()) return false;
    objectIds.add(object.id);
  }

  const relationshipIds = new Set<string>();
  for (const relationship of value.relationships) {
    if (!isRecord(relationship) || !hasOnlyKeys(relationship, ["id", "fromId", "toId", "label", "direction"])
      || !isSafeIdentifier(relationship.id, 40) || relationshipIds.has(relationship.id) || objectIds.has(relationship.id)
      || !isSafeIdentifier(relationship.fromId, 40) || !isSafeIdentifier(relationship.toId, 40)
      || relationship.fromId === relationship.toId || !objectIds.has(relationship.fromId) || !objectIds.has(relationship.toId)
      || !isBoundedString(relationship.label, 28) || relationship.label !== relationship.label.trim()
      || !relationshipDirections.has(String(relationship.direction))) return false;
    relationshipIds.add(relationship.id);
  }

  for (const step of value.steps) {
    if (!isRecord(step) || !hasOnlyKeys(step, ["action", "targetId", "direction", "distance"])
      || !actions.has(String(step.action)) || !isSafeIdentifier(step.targetId, 40)) return false;
    const direction = step.direction;
    const distance = step.distance;
    if (step.action === "move") {
      if (!objectIds.has(step.targetId) || !moveDirections.has(String(direction)) || !distances.has(String(distance))) return false;
    } else if (step.action === "rotate") {
      if (!objectIds.has(step.targetId) || !rotateDirections.has(String(direction)) || (distance !== undefined && distance !== null)) return false;
    } else if (step.action === "trace") {
      if (!relationshipIds.has(step.targetId) || (direction !== undefined && direction !== null) || (distance !== undefined && distance !== null)) return false;
    } else if (!objectIds.has(step.targetId) || (direction !== undefined && direction !== null) || (distance !== undefined && distance !== null)) {
      return false;
    }
  }
  return true;
}
