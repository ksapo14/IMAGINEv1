import assert from "node:assert/strict";
import test from "node:test";
import { PitchUtteranceNormalizer } from "../lib/pitch/utterances.ts";
import { DesktopTranscriptionTransport } from "../desktop/src/transcription.ts";

const turn = (transcript, turn_index, event = "EndOfTurn") => ({ type: "TurnInfo", event, transcript, turn_index });
const result = (transcript, start, speech_final = false) => ({ type: "Results", is_final: true, speech_final, start, duration: 1, channel: { alternatives: [{ transcript }] } });

test("Flux evaluates completed turns once and resets deduplication per session", () => {
  const normalizer = new PitchUtteranceNormalizer();
  assert.equal(normalizer.consume(turn("market sizing", 0, "Update")).utterance, undefined);
  assert.equal(normalizer.consume(turn("market sizing", 0)).utterance, "market sizing");
  assert.equal(normalizer.consume(turn("market sizing", 0)).utterance, undefined);
  normalizer.reset();
  assert.equal(normalizer.consume(turn("market sizing", 0)).utterance, "market sizing");
});

test("final fragments combine once and late turn boundaries are ignored", () => {
  const normalizer = new PitchUtteranceNormalizer();
  assert.equal(normalizer.consume({ ...result("interim", 0), is_final: false }).utterance, undefined);
  normalizer.consume(result("our three year", 0));
  assert.equal(normalizer.consume(result("financial projection", 1, true)).utterance, "our three year financial projection");
  assert.equal(normalizer.consume(result("financial projection", 1, true)).utterance, undefined);
  normalizer.consume(result("next topic", 3));
  assert.equal(normalizer.consume({ type: "UtteranceEnd", last_word_end: 2 }), null);
  assert.equal(normalizer.consume({ type: "UtteranceEnd", last_word_end: 4 }).utterance, "next topic");
});

function withDesktopFakes(run, { missingKey = false } = {}) {
  const original = new Map(["window", "navigator", "MediaRecorder"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const calls = [];
  const listeners = new Set();
  const resources = { stoppedTracks: 0, stoppedRecorders: 0, recorder: null };
  const track = { stop: () => { resources.stoppedTracks += 1; } };
  const stream = { getTracks: () => [track] };
  class FakeRecorder {
    static isTypeSupported(value) { return value === "audio/webm;codecs=opus"; }
    state = "inactive";
    ondataavailable = null;
    onerror = null;
    constructor() { resources.recorder = this; }
    start() { this.state = "recording"; }
    stop() { this.state = "inactive"; resources.stoppedRecorders += 1; }
  }
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    __TAURI__: {
      core: { invoke: async (command, args) => {
        calls.push({ command, args });
        if (missingKey && command === "start_transcription") throw "deepgram_key_missing";
      } },
      event: { listen: async (_event, callback) => { listeners.add(callback); return () => listeners.delete(callback); } }
    }
  } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: { getUserMedia: async () => stream } } });
  Object.defineProperty(globalThis, "MediaRecorder", { configurable: true, value: FakeRecorder });
  const emit = (payload) => { for (const listener of listeners) listener({ event: "pitch-transcription", payload }); };
  return Promise.resolve().then(() => run({ calls, emit, resources, listeners })).finally(() => {
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
}

test("desktop microphone sends audio in order and ignores other sessions", async () => withDesktopFakes(async ({ calls, emit, resources, listeners }) => {
  const received = [];
  const transport = new DesktopTranscriptionTransport({
    onStatus: (value) => received.push(["status", value]),
    onTranscript: (value) => received.push(["transcript", value]),
    onUtterance: (value) => received.push(["utterance", value]),
    onError: (value) => received.push(["error", value])
  });
  await transport.start();
  const sessionId = calls.find(({ command }) => command === "start_transcription").args.sessionId;
  emit({ ...turn("ignored", 1), sessionId: "old-session" });
  emit({ ...turn("market size", 1), sessionId });
  assert.deepEqual(received.filter(([name]) => name === "utterance"), [["utterance", "market size"]]);
  resources.recorder.ondataavailable({ data: new Blob([Uint8Array.of(1, 2)]) });
  resources.recorder.ondataavailable({ data: new Blob([Uint8Array.of(3, 4)]) });
  for (let attempts = 0; attempts < 10 && calls.filter(({ command }) => command === "submit_audio").length < 2; attempts += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(calls.filter(({ command }) => command === "submit_audio").map(({ args }) => [args.sequence, args.audio]), [[0, [1, 2]], [1, [3, 4]]]);
  transport.stop();
  assert.equal(resources.stoppedTracks, 1);
  assert.equal(resources.stoppedRecorders, 1);
  assert.equal(listeners.size, 0);
  assert.equal(calls.at(-1).command, "stop_transcription");
}));

test("missing Deepgram key releases microphone and keeps the error safe", async () => withDesktopFakes(async ({ resources }) => {
  const errors = [];
  const transport = new DesktopTranscriptionTransport({ onStatus: () => {}, onTranscript: () => {}, onUtterance: () => {}, onError: (message) => errors.push(message) });
  await transport.start();
  assert.equal(resources.stoppedTracks, 1);
  assert.match(errors[0], /DEEPGRAM_API_KEY/);
}, { missingKey: true }));

test("stop during Deepgram handshake closes a session created after the first stop", async () => withDesktopFakes(async ({ calls, resources, listeners }) => {
  const invoke = globalThis.window.__TAURI__.core.invoke;
  let finishHandshake;
  globalThis.window.__TAURI__.core.invoke = (command, args) => {
    if (command === "start_transcription") {
      calls.push({ command, args });
      return new Promise((resolve) => { finishHandshake = resolve; });
    }
    return invoke(command, args);
  };
  const transport = new DesktopTranscriptionTransport({ onStatus: () => {}, onTranscript: () => {}, onUtterance: () => {}, onError: () => {} });
  const starting = transport.start();
  for (let attempts = 0; attempts < 10 && !finishHandshake; attempts += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(typeof finishHandshake, "function");
  transport.stop();
  finishHandshake();
  await starting;
  const sessionId = calls.find(({ command }) => command === "start_transcription").args.sessionId;
  assert.deepEqual(calls.filter(({ command }) => command === "stop_transcription").map(({ args }) => args.sessionId), [sessionId, sessionId]);
  assert.equal(resources.stoppedTracks, 1);
  assert.equal(resources.stoppedRecorders, 0);
  assert.equal(listeners.size, 0);
}));

test("stop while event subscription is pending releases its late listener", async () => withDesktopFakes(async ({ calls, listeners }) => {
  const listen = globalThis.window.__TAURI__.event.listen;
  let finishSubscription;
  globalThis.window.__TAURI__.event.listen = (event, callback) => new Promise((resolve) => {
    finishSubscription = () => { void listen(event, callback).then(resolve); };
  });
  const transport = new DesktopTranscriptionTransport({ onStatus: () => {}, onTranscript: () => {}, onUtterance: () => {}, onError: () => {} });
  const starting = transport.start();
  assert.equal(typeof finishSubscription, "function");
  transport.stop();
  finishSubscription();
  await starting;
  assert.equal(listeners.size, 0);
  assert.equal(calls.some(({ command }) => command === "start_transcription"), false);
}));
