import assert from "node:assert/strict";
import test from "node:test";

import { PitchController } from "../lib/pitch/controller.ts";
import { PITCH_DECK, PITCH_SLIDES, assertValidPitchDeck, validatePitchRendererIds } from "../lib/pitch/deck.ts";
import { createFunctionGemmaPitchModelAdapter, highConfidencePitchDecision, isPitchDecision, PitchModelError } from "../lib/pitch/model.ts";
import {
  PITCH_PRESENTATION_STORAGE_KEY,
  loadPitchPresentation,
  savePitchPresentation
} from "../lib/pitch/storage.ts";

const mockInput = (currentSlideId = "open", utterance = "") => ({
  latestUtterance: utterance,
  currentSlide: PITCH_DECK.find((slide) => slide.id === currentSlideId),
  availableSlides: PITCH_DECK
});

function deferredAdapter() {
  const pending = [];
  const adapter = {
    // Intentionally ignores AbortSignal to test the controller's stale-result guard.
    evaluate: () => new Promise((resolve) => { pending.push(resolve); })
  };
  return {
    adapter,
    resolveAt: (index, decision) => pending[index](decision),
    get count() { return pending.length; }
  };
}

test("deck metadata preserves all semantic slide IDs and renderer validation", () => {
  assert.deepEqual(PITCH_DECK.map((slide) => slide.id), [
    "open", "anecdote", "problem", "hall", "whynow", "product", "demo", "value", "competition",
    "gtm", "tam", "model", "financials", "whyus", "supports", "roadmap", "vision", "ask"
  ]);
  assert.equal(new Set(PITCH_DECK.map((slide) => slide.id)).size, 18);
  assert.ok(PITCH_DECK.every((slide) => slide.title && slide.description));
  assert.equal(validatePitchRendererIds(PITCH_DECK.map((slide) => slide.id)), true);
  assert.equal(validatePitchRendererIds(PITCH_DECK.slice(1).map((slide) => slide.id)), false);
  assert.equal(PITCH_SLIDES.length, PITCH_DECK.length);
});

test("FunctionGemma adapter posts finalized input, forwards cancellation, and validates decisions", async () => {
  const calls = [];
  const adapter = createFunctionGemmaPitchModelAdapter(async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ action: "goto_slide", slide_id: "tam" }));
  });
  const signal = new AbortController().signal;
  assert.deepEqual(await adapter.evaluate(mockInput("open", "Tell me about market size."), { signal }), { action: "no_action" });
  assert.match(calls[0].url, /\/api\/pitch\/decide$/);
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.signal, signal);
  assert.equal(JSON.parse(calls[0].options.body).latestUtterance, "Tell me about market size.");

  const unavailable = createFunctionGemmaPitchModelAdapter(async () => new Response(JSON.stringify({ action: "goto_slide", slide_id: "missing" })));
  await assert.rejects(unavailable.evaluate(mockInput(), { signal: new AbortController().signal }), /unavailable slide/);
  const malformed = createFunctionGemmaPitchModelAdapter(async () => new Response(JSON.stringify({ action: "no_action", extra: true })));
  await assert.rejects(malformed.evaluate(mockInput(), { signal: new AbortController().signal }), /invalid decision/);
  const refused = createFunctionGemmaPitchModelAdapter(async () => new Response(JSON.stringify({
    detail: { code: "function_gemma_runtime_unavailable", message: "PRIVATE provider detail must never reach the browser." }
  }), { status: 503 }));
  await assert.rejects(refused.evaluate(mockInput(), { signal: new AbortController().signal }), (error) => {
    assert.equal(error.code, "function_gemma_runtime_unavailable");
    assert.match(error.message, /FunctionGemma is not running/);
    assert.doesNotMatch(error.message, /PRIVATE/);
    return true;
  });
  const hostile = createFunctionGemmaPitchModelAdapter(async () => new Response(JSON.stringify({
    detail: { code: "unknown_code", message: "PRIVATE provider detail" }
  }), { status: 502 }));
  await assert.rejects(hostile.evaluate(mockInput(), { signal: new AbortController().signal }), (error) => {
    assert.equal(error.code, "function_gemma_unavailable");
    assert.doesNotMatch(error.message, /PRIVATE/);
    return true;
  });
  const transportFailure = createFunctionGemmaPitchModelAdapter(async () => { throw new Error("PRIVATE http://private-user:private-pass@example.test"); });
  await assert.rejects(transportFailure.evaluate(mockInput(), { signal: new AbortController().signal }), (error) => {
    assert.equal(error.code, "function_gemma_unavailable");
    assert.doesNotMatch(error.message, /PRIVATE/);
    return true;
  });
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(adapter.evaluate(mockInput(), { signal: aborted.signal }), { name: "AbortError" });
  assert.equal(isPitchDecision({ action: "no_action" }), true);
  assert.equal(isPitchDecision({ action: "goto_slide", slide_id: "tam" }), true);
  assert.equal(isPitchDecision({ action: "no_action", slide_id: "tam" }), false);
});

test("conservative quality guard routes only strong cues and holds unsupported model moves", async () => {
  assert.deepEqual(highConfidencePitchDecision(mockInput("open", "Let's discuss the private school market.")), { action: "goto_slide", slide_id: "tam" });
  assert.equal(highConfidencePitchDecision(mockInput("tam", "Let's discuss the private school market.")), null);
  assert.equal(highConfidencePitchDecision(mockInput("open", "marketing is hard")), null);
  assert.equal(highConfidencePitchDecision(mockInput("open", "beta testing and venture introductions")), null);

  let calls = 0;
  const adapter = createFunctionGemmaPitchModelAdapter(async () => {
    calls += 1;
    return new Response(JSON.stringify({ action: "goto_slide", slide_id: "tam" }));
  });
  assert.deepEqual(await adapter.evaluate(mockInput("open", "teacher preparation"), { signal: new AbortController().signal }), { action: "no_action" });
  assert.equal(calls, 1);
  assert.deepEqual(await adapter.evaluate(mockInput("open", "market"), { signal: new AbortController().signal }), { action: "no_action" });
  assert.equal(calls, 2);
  assert.deepEqual(await adapter.evaluate(mockInput("open", "beta testing and venture introductions"), { signal: new AbortController().signal }), { action: "no_action" });
  assert.equal(calls, 3);
  assert.deepEqual(await adapter.evaluate(mockInput("tam", "private school market"), { signal: new AbortController().signal }), { action: "no_action" });
  assert.equal(calls, 4);

  const direct = createFunctionGemmaPitchModelAdapter(async () => {
    throw new Error("strong matches must not invoke FunctionGemma");
  });
  assert.deepEqual(await direct.evaluate(mockInput("open", "private school market"), { signal: new AbortController().signal }), { action: "goto_slide", slide_id: "tam" });
});

test("deck validation rejects duplicate and incomplete semantic metadata", () => {
  assert.throws(() => assertValidPitchDeck([
    { id: "open", title: "Open", description: "An opening slide." },
    { id: "open", title: "Duplicate", description: "A duplicate slide." }
  ]));
  assert.throws(() => assertValidPitchDeck([{ id: "valid", title: "", description: "Missing a title." }]));
});

test("controller applies only valid targets and keeps the slide for invalid or redundant decisions", async () => {
  const decisions = [
    { action: "goto_slide", slide_id: "missing" },
    { action: "goto_slide", slide_id: "open" },
    { action: "wrong_action" },
    { action: "no_action" }
  ];
  const controller = new PitchController({
    adapter: { evaluate: async () => decisions.shift() }
  });

  for (let index = 0; index < 4; index += 1) await controller.evaluateUtterance(`turn ${index}`);
  assert.equal(controller.getSnapshot().currentSlideId, "open");
  assert.equal(controller.getSnapshot().evaluationStatus, "held");
  assert.equal(controller.goToSlide("tam"), true);
  const revision = controller.getSnapshot().revision;
  assert.equal(controller.goToSlide("tam"), false);
  assert.equal(controller.getSnapshot().revision, revision);
  controller.dispose();
});

test("latest evaluation wins while manual navigation invalidates late model results", async () => {
  const pending = deferredAdapter();
  const controller = new PitchController({ adapter: pending.adapter });
  const first = controller.evaluateUtterance("first");
  await Promise.resolve();
  assert.equal(pending.count, 1);
  assert.equal(controller.getSnapshot().evaluationStatus, "evaluating");
  assert.equal(controller.goToSlide("open"), false);
  pending.resolveAt(0, { action: "goto_slide", slide_id: "tam" });
  await first;
  assert.equal(controller.getSnapshot().currentSlideId, "open");

  const replacement = deferredAdapter();
  const latest = new PitchController({ adapter: replacement.adapter });
  const older = latest.evaluateUtterance("old");
  await Promise.resolve();
  const newer = latest.evaluateUtterance("new");
  await Promise.resolve();
  assert.equal(replacement.count, 2);
  replacement.resolveAt(1, { action: "goto_slide", slide_id: "tam" });
  await newer;
  assert.equal(latest.getSnapshot().currentSlideId, "tam");
  replacement.resolveAt(0, { action: "goto_slide", slide_id: "competition" });
  await older;
  assert.equal(latest.getSnapshot().currentSlideId, "tam");
  controller.dispose();
  latest.dispose();
});

test("Deepgram evaluation pauses and stops safely while typed simulation remains available", async () => {
  const controller = new PitchController({
    adapter: { evaluate: async () => ({ action: "goto_slide", slide_id: "tam" }) }
  });
  controller.setAutomaticNavigation(false);
  await controller.evaluateUtterance("private school market north carolina", "deepgram");
  assert.equal(controller.getSnapshot().currentSlideId, "open");
  await controller.evaluateUtterance("private school market north carolina", "simulation");
  assert.equal(controller.getSnapshot().currentSlideId, "tam");
  controller.setTranscriptionStatus("listening");
  controller.setTranscriptionStatus("idle");
  assert.equal(controller.getSnapshot().transcriptionStatus, "idle");
  controller.resetSession("open");
  assert.equal(controller.getSnapshot().latestTranscript, "");
  assert.equal(controller.getSnapshot().sessionId, 2);
  controller.dispose();
});

test("in-flight evaluations are cancelled by pause, microphone stop, reset, and disposal", async () => {
  const actions = [
    (controller) => controller.setAutomaticNavigation(false),
    (controller) => controller.setTranscriptionStatus("idle"),
    (controller) => controller.resetSession("open"),
    (controller) => controller.dispose()
  ];

  for (const action of actions) {
    const pending = deferredAdapter();
    const controller = new PitchController({ adapter: pending.adapter });
    const evaluation = controller.evaluateUtterance("private school market", "deepgram");
    await Promise.resolve();
    assert.equal(pending.count, 1);
    action(controller);
    await evaluation;
    pending.resolveAt(0, { action: "goto_slide", slide_id: "tam" });
    assert.equal(controller.getSnapshot().currentSlideId, "open");
    if (controller.getSnapshot().transcriptionStatus !== "idle") controller.dispose();
  }
});

test("timeouts and model errors keep the visible slide", async () => {
  const timeoutController = new PitchController({
    adapter: { evaluate: () => new Promise(() => {}) },
    timeoutMs: 10
  });
  await timeoutController.evaluateUtterance("private school market");
  assert.equal(timeoutController.getSnapshot().currentSlideId, "open");
  assert.equal(timeoutController.getSnapshot().evaluationStatus, "error");

  const throwController = new PitchController({
    adapter: { evaluate: () => { throw new Error("adapter unavailable"); } }
  });
  await throwController.evaluateUtterance("private school market");
  assert.equal(throwController.getSnapshot().currentSlideId, "open");
  assert.equal(throwController.getSnapshot().evaluationStatus, "error");
  const runtimeController = new PitchController({
    adapter: { evaluate: () => { throw new PitchModelError("function_gemma_runtime_unavailable"); } }
  });
  await runtimeController.evaluateUtterance("private school market");
  assert.equal(runtimeController.getSnapshot().currentSlideId, "open");
  assert.match(runtimeController.getSnapshot().lastOutcome.message, /FunctionGemma is not running/);
  timeoutController.dispose();
  throwController.dispose();
  runtimeController.dispose();
});

test("presentation storage restores only a valid slide from this deck version", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
  assert.equal(savePitchPresentation(storage, "tam").ok, true);
  assert.equal(loadPitchPresentation(storage), "tam");
  values.set(PITCH_PRESENTATION_STORAGE_KEY, "not json");
  assert.equal(loadPitchPresentation(storage), "open");
  values.set(PITCH_PRESENTATION_STORAGE_KEY, JSON.stringify({
    schemaVersion: 1,
    deckId: "imagineer-pitch-carl",
    deckVersion: 1,
    currentSlideId: "removed-slide",
    latestTranscript: "must not be read"
  }));
  assert.equal(loadPitchPresentation(storage), "open");
  assert.equal(savePitchPresentation(null, "open").ok, false);

  values.set(PITCH_PRESENTATION_STORAGE_KEY, JSON.stringify({
    schemaVersion: 1,
    deckId: "imagineer-pitch-carl",
    deckVersion: 2,
    currentSlideId: "tam"
  }));
  assert.equal(loadPitchPresentation(storage), "open");
  const brokenStorage = {
    getItem: () => { throw new Error("read blocked"); },
    setItem: () => { throw new Error("write blocked"); }
  };
  assert.equal(loadPitchPresentation(brokenStorage), "open");
  assert.equal(savePitchPresentation(brokenStorage, "open").ok, false);
});
