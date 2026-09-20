import assert from "node:assert/strict";
import test from "node:test";

import { PitchController } from "../lib/pitch/controller.ts";
import { PITCH_DECK, PITCH_SLIDES, assertValidPitchDeck, validatePitchRendererIds } from "../lib/pitch/deck.ts";
import { createMockPitchModelAdapter, normalizePitchUtterance } from "../lib/pitch/model.ts";
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

test("mock adapter targets distinctive full phrases and avoids weak, ambiguous, or substring matches", async () => {
  const adapter = createMockPitchModelAdapter();
  const evaluate = (current, utterance) => adapter.evaluate(mockInput(current, utterance), { signal: new AbortController().signal });

  assert.deepEqual(await evaluate("open", "Our private-school market across North Carolina"), { action: "goto_slide", slide_id: "tam" });
  assert.deepEqual(await evaluate("open", "The teacher next door brings us into the next classroom"), { action: "goto_slide", slide_id: "gtm" });
  assert.deepEqual(await evaluate("open", "Here is our three-year financial projection"), { action: "goto_slide", slide_id: "financials" });
  assert.deepEqual(await evaluate("tam", "Our private-school market across North Carolina"), { action: "no_action" });
  assert.deepEqual(await evaluate("open", "thanks"), { action: "no_action" });
  assert.deepEqual(await evaluate("open", "private school marketing"), { action: "no_action" });
  assert.equal(normalizePitchUtterance("  North—Carolina!  "), "north carolina");

  const tiedAdapter = createMockPitchModelAdapter({
    open: { phrases: [], keywords: [] },
    tam: { phrases: ["shared market phrase"], keywords: [] },
    gtm: { phrases: ["shared market phrase"], keywords: [] }
  });
  assert.deepEqual(await tiedAdapter.evaluate(mockInput("open", "shared market phrase"), { signal: new AbortController().signal }), { action: "no_action" });

  const reordered = [...PITCH_DECK].reverse();
  assert.deepEqual(await adapter.evaluate({ ...mockInput("open", "three year financial projection"), availableSlides: reordered }, { signal: new AbortController().signal }), { action: "goto_slide", slide_id: "financials" });
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
  timeoutController.dispose();
  throwController.dispose();
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
