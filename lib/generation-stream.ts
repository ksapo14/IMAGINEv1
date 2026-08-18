import type { GenerateResponse } from "@/components/workspace/types";

export type GenerationMode = "live" | "prepare";

type StreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "result"; result: GenerateResponse }
  | { type: "done" }
  | { type: "error"; message: string };

type StreamHandlers = {
  onDelta: (delta: string) => void;
  onResult?: (result: GenerateResponse) => void;
};

export function getApiBaseUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, "");
  }

  const apiPort = process.env.NEXT_PUBLIC_API_PORT?.trim() || "8010";
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:${apiPort}`;
  }
  return `http://127.0.0.1:${apiPort}`;
}

export const API_BASE_URL = getApiBaseUrl();

function getApiErrorMessage(problem: unknown) {
  if (!problem || typeof problem !== "object" || !("detail" in problem)) {
    return null;
  }
  const detail = problem.detail;
  if (typeof detail === "string") {
    return detail;
  }
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) =>
        item && typeof item === "object" && "msg" in item
          ? String(item.msg)
          : ""
      )
      .filter(Boolean);
    return messages.length > 0 ? messages.join(" ") : null;
  }
  return null;
}

async function bufferedGeneration(
  userInput: string,
  mode: GenerationMode,
  signal: AbortSignal
) {
  const response = await fetch(`${API_BASE_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userInput, mode }),
    signal
  });
  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as unknown;
    throw new Error(
      getApiErrorMessage(problem) ?? "The generation request could not be completed."
    );
  }
  return (await response.json()) as GenerateResponse;
}

export async function streamGeneration(
  userInput: string,
  handlers: StreamHandlers,
  signal: AbortSignal,
  mode: GenerationMode = "live"
) {
  const response = await fetch(`${API_BASE_URL}/api/generate/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userInput, mode }),
    signal
  });

  if (response.status === 404 || response.status === 405) {
    const fallback = await bufferedGeneration(userInput, mode, signal);
    handlers.onResult?.(fallback);
    return fallback;
  }
  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as unknown;
    throw new Error(
      getApiErrorMessage(problem) ?? "The live generation stream could not start."
    );
  }
  if (!response.body) {
    throw new Error("This browser could not read the live generation stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: GenerateResponse | null = null;

  const handleLine = (line: string) => {
    if (!line.trim()) {
      return;
    }
    let event: StreamEvent;
    try {
      event = JSON.parse(line) as StreamEvent;
    } catch {
      throw new Error("The live generation stream returned malformed data.");
    }

    if (event.type === "text_delta") {
      handlers.onDelta(event.text);
    } else if (event.type === "result") {
      result = event.result;
      handlers.onResult?.(event.result);
    } else if (event.type === "error") {
      throw new Error(event.message || "Live generation failed.");
    }
  };

  try {
    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(handleLine);
      if (chunk.done) {
        break;
      }
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (buffer.trim()) {
    handleLine(buffer);
  }
  if (!result) {
    throw new Error("Live generation ended before a composition was ready.");
  }
  return result;
}

function readStringValue(source: string, marker: string) {
  const markerIndex = source.indexOf(`"${marker}"`);
  if (markerIndex < 0) {
    return "";
  }
  const colonIndex = source.indexOf(":", markerIndex + marker.length + 2);
  const quoteIndex = source.indexOf('"', colonIndex + 1);
  if (colonIndex < 0 || quoteIndex < 0) {
    return "";
  }

  let escaped = false;
  let raw = "";
  for (let index = quoteIndex + 1; index < source.length; index += 1) {
    const character = source[index];
    if (!escaped && character === '"') {
      break;
    }
    raw += character;
    if (character === "\\" && !escaped) {
      escaped = true;
    } else {
      escaped = false;
    }
  }

  try {
    return JSON.parse(`"${raw.replace(/"$/g, "")}"`) as string;
  } catch {
    return raw.replace(/\\n/g, " ").replace(/\\"/g, '"');
  }
}

function readBulletValues(source: string) {
  const markerIndex = source.indexOf('"bullets"');
  if (markerIndex < 0) {
    return [];
  }
  const bracketIndex = source.indexOf("[", markerIndex);
  if (bracketIndex < 0) {
    return [];
  }

  const values: string[] = [];
  let inString = false;
  let escaped = false;
  let raw = "";
  for (let index = bracketIndex + 1; index < source.length; index += 1) {
    const character = source[index];
    if (!inString && character === "]") {
      break;
    }
    if (!inString && character === '"') {
      inString = true;
      raw = "";
      continue;
    }
    if (inString && !escaped && character === '"') {
      values.push(raw.replace(/\\n/g, " ").replace(/\\"/g, '"'));
      inString = false;
      continue;
    }
    if (inString) {
      raw += character;
      if (character === "\\" && !escaped) {
        escaped = true;
      } else {
        escaped = false;
      }
    }
  }
  if (inString && raw) {
    values.push(raw.replace(/\\n/g, " ").replace(/\\"/g, '"'));
  }
  return values.slice(0, 3);
}

export function extractReadableDraft(rawJson: string) {
  const title = readStringValue(rawJson, "title");
  const bullets = readBulletValues(rawJson);
  return [title, ...bullets].filter(Boolean).join(" ");
}
