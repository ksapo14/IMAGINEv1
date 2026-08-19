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
import {
  beginsWithImagineCommand,
  dequeueLiveTurn,
  enqueueLiveTurn,
  isDuplicateFinalizedSpeech
} from "../lib/live-session.ts";
import { deriveCompositionSummary } from "../lib/composition-summary.ts";

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

test("composition summaries prefer items and use readable fallbacks", () => {
  const blocks = [
    {
      ...visualBlock,
      items: [" Glucose enters glycolysis. ", "ATP stores usable energy."]
    },
    {
      ...visualBlock,
      blockId: "notes-1",
      title: "Cellular respiration",
      body: " Oxygen supports the final stage. ",
      items: []
    },
    {
      ...visualBlock,
      blockId: "heading-1",
      title: " Energy transfer ",
      body: "",
      items: []
    },
    {
      ...visualBlock,
      blockId: "duplicate-1",
      items: ["ATP stores usable energy."],
      body: "",
      title: ""
    }
  ];

  assert.deepEqual(deriveCompositionSummary(blocks), [
    "Glucose enters glycolysis.",
    "ATP stores usable energy.",
    "Oxygen supports the final stage.",
    "Energy transfer"
  ]);
});

test("composition summaries omit empty blocks", () => {
  assert.deepEqual(
    deriveCompositionSummary([
      { ...visualBlock, title: " ", body: " ", items: [" "] }
    ]),
    []
  );
});

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

test("only whole-word imagine invocations bypass live generation", () => {
  assert.equal(beginsWithImagineCommand("Imagine show me energy cycle"), true);
  assert.equal(beginsWithImagineCommand(" imagine something else"), true);
  assert.equal(beginsWithImagineCommand("imagination supports learning"), false);
});

test("busy live turns retain FIFO order", () => {
  const queue = [];
  enqueueLiveTurn(queue, { input: "first", sequence: 1 });
  enqueueLiveTurn(queue, { input: "second", sequence: 2 });
  assert.deepEqual(dequeueLiveTurn(queue), { input: "first", sequence: 1 });
  assert.deepEqual(dequeueLiveTurn(queue), { input: "second", sequence: 2 });
  assert.equal(dequeueLiveTurn(queue), null);
});

test("duplicate finalized speech is suppressed only inside the short window", () => {
  const previous = { transcript: "Cell energy", at: 1000 };
  assert.equal(isDuplicateFinalizedSpeech(previous, " cell ENERGY ", 2200), true);
  assert.equal(isDuplicateFinalizedSpeech(previous, "Cell energy", 2600), false);
  assert.equal(isDuplicateFinalizedSpeech(previous, "ATP cycle", 1100), false);
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
  let requestBody = null;
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(payload.slice(0, 37)));
          controller.enqueue(encoder.encode(payload.slice(37)));
          controller.close();
        }
      }),
      { status: 200, headers: { "Content-Type": "application/x-ndjson" } }
    );
  };

  try {
    const deltas = [];
    const result = await streamGeneration(
      "Explain ATP",
      { onDelta: (delta) => deltas.push(delta) },
      new AbortController().signal
    );
    assert.deepEqual(deltas, ['{"title":"Cell', ' energy"}']);
    assert.equal(result.title, "Cellular respiration");
    assert.deepEqual(requestBody, { userInput: "Explain ATP", mode: "live" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("prepare generation sends the explicit mode", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = null;
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return new Response(
      `${JSON.stringify({ type: "result", result: lesson().composition })}\n` +
        `${JSON.stringify({ type: "done" })}\n`,
      { status: 200, headers: { "Content-Type": "application/x-ndjson" } }
    );
  };

  try {
    await streamGeneration(
      "Prepare ATP",
      { onDelta: () => assert.fail("prepare should not stream prose") },
      new AbortController().signal,
      "prepare"
    );
    assert.deepEqual(requestBody, {
      userInput: "Prepare ATP",
      mode: "prepare"
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
