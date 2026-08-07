import assert from "node:assert/strict";
import test from "node:test";
import {
  LESSON_LIBRARY_KEY,
  findPreparedVisual,
  getDuplicateRecallPhrases,
  loadLessonLibrary,
  normalizeRecallPhrase,
  parseRecallCommand,
  saveLessonLibrary
} from "../lib/lesson-library.ts";
import {
  extractReadableDraft,
  streamGeneration
} from "../lib/generation-stream.ts";

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, value);
  }
}

const visualBlock = {
  blockId: "diagram-1",
  kind: "diagram",
  title: "Energy cycle",
  body: "",
  items: [],
  size: "wide",
  recallPhrases: ["energy cycle", "ATP flow"],
  visual: {
    kind: "diagram",
    alt: "Energy cycle",
    diagram: {
      version: 3,
      type: "flowchart",
      title: "Energy cycle",
      description: "",
      lines: [
        {
          type: "blockLine",
          id: "line-1",
          blocks: [
            {
              type: "block",
              id: "b1",
              heading: "Glucose",
              description: "Stores energy."
            }
          ]
        }
      ]
    }
  },
  visualJobId: null
};

function lesson(overrides = {}) {
  return {
    schemaVersion: 1,
    id: "lesson-1",
    title: "Cellular respiration",
    subject: "Biology",
    source: "Explain how cells make ATP.",
    createdAt: "2026-08-07T12:00:00.000Z",
    updatedAt: "2026-08-07T12:00:00.000Z",
    status: "ready",
    composition: {
      title: "Cellular respiration",
      layoutMode: "visualDominant",
      theme: { palette: "sage", density: "comfortable", motion: "subtle" },
      blocks: [visualBlock],
      warning: null
    },
    ...overrides
  };
}

test("recall requires a complete anchored command", () => {
  assert.equal(parseRecallCommand("Imagine, show me energy cycle."), "energy cycle");
  assert.equal(parseRecallCommand("IMAGINE show me   ATP flow"), "atp flow");
  assert.equal(parseRecallCommand("please imagine show me energy cycle"), null);
  assert.equal(parseRecallCommand("imagine energy cycle"), null);
  assert.equal(parseRecallCommand("imagine show"), null);
});

test("prepared visual lookup is exact after safe normalization", () => {
  const prepared = lesson();
  assert.equal(findPreparedVisual(prepared, "Energy   Cycle")?.blockId, "diagram-1");
  assert.equal(findPreparedVisual(prepared, "energy"), null);
  assert.equal(normalizeRecallPhrase("  ATP FLOW?!  "), "atp flow");
});

test("duplicate phrases are rejected across prepared visuals", () => {
  const duplicate = {
    ...visualBlock,
    blockId: "diagram-2",
    recallPhrases: ["ATP flow"]
  };
  assert.deepEqual(
    getDuplicateRecallPhrases([visualBlock, duplicate]),
    ["atp flow"]
  );
});

test("lesson library survives reload and ignores corrupt storage", () => {
  const storage = new MemoryStorage();
  const prepared = lesson();
  assert.deepEqual(saveLessonLibrary(storage, [prepared]), { ok: true });
  assert.equal(loadLessonLibrary(storage)[0]?.title, "Cellular respiration");

  storage.setItem(LESSON_LIBRARY_KEY, "{broken-json");
  assert.deepEqual(loadLessonLibrary(storage), []);
});

test("pending visual jobs are not restored after reload", () => {
  const storage = new MemoryStorage();
  const pending = lesson({
    status: "generating",
    composition: {
      ...lesson().composition,
      blocks: [
        {
          ...visualBlock,
          visual: null,
          visualJobId: "ephemeral-job"
        }
      ]
    }
  });
  saveLessonLibrary(storage, [pending]);
  assert.equal(storage.getItem(LESSON_LIBRARY_KEY).includes("ephemeral-job"), false);
  const restored = loadLessonLibrary(storage)[0];
  assert.equal(restored.composition.blocks[0].visualJobId, null);
  assert.equal(restored.composition.blocks[0].visualFailed, true);
  assert.equal(restored.status, "partial");
});

test("partial structured notes become readable while streaming", () => {
  const partial =
    '{"title":"Cell energy","bullets":["Mitochondria convert stored';
  assert.equal(
    extractReadableDraft(partial),
    "Cell energy Mitochondria convert stored"
  );
});

test("NDJSON generation stream handles split chunks in order", async () => {
  const encoder = new TextEncoder();
  const responseResult = lesson().composition;
  const payload = [
    JSON.stringify({ type: "text_delta", text: '{"title":"Cell' }) + "\n",
    JSON.stringify({ type: "text_delta", text: ' energy"}' }) + "\n",
    JSON.stringify({ type: "result", result: responseResult }) + "\n",
    JSON.stringify({ type: "done" }) + "\n"
  ].join("");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(payload.slice(0, 37)));
          controller.enqueue(encoder.encode(payload.slice(37)));
          controller.close();
        }
      }),
      { status: 200, headers: { "Content-Type": "application/x-ndjson" } }
    );

  try {
    const deltas = [];
    const result = await streamGeneration(
      "Explain ATP",
      { onDelta: (delta) => deltas.push(delta) },
      new AbortController().signal
    );
    assert.deepEqual(deltas, ['{"title":"Cell', ' energy"}']);
    assert.equal(result.title, "Cellular respiration");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
