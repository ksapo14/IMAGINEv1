import assert from 'node:assert/strict';
import test from 'node:test';
import { PitchUtteranceNormalizer } from '../lib/pitch/utterances.ts';
import { PitchTranscriptionTransport, createBrowserTranscriptionDependencies } from '../components/pitch/transcription-transport.ts';

const turn = (transcript, turn_index, event = 'EndOfTurn') => ({ type: 'TurnInfo', event, transcript, turn_index });
const result = (transcript, start, speech_final = false) => ({ type: 'Results', is_final: true, speech_final, start, duration: 1, channel: { alternatives: [{ transcript }] } });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('Flux evaluates only completed turns and scopes identities to the session', () => {
  const n = new PitchUtteranceNormalizer();
  assert.equal(n.consume(turn('market sizing', 0, 'Update')).utterance, undefined);
  assert.equal(n.consume(turn('market sizing', 0)).utterance, 'market sizing');
  assert.equal(n.consume(turn('market sizing', 0)).utterance, undefined);
  assert.equal(n.consume(turn('market sizing', 1)).utterance, 'market sizing');
  assert.equal(n.consume(turn('  ', 2)), null);
  assert.equal(n.consume(null), null);
  n.reset();
  assert.equal(n.consume(turn('market sizing', 0)).utterance, 'market sizing');
});

test('Results combine final fragments once and reject late boundaries', () => {
  const n = new PitchUtteranceNormalizer();
  assert.equal(n.consume({ ...result('interim', 0), is_final: false }).utterance, undefined);
  n.consume(result('our three year', 0));
  n.consume(result('our three year', 0));
  assert.equal(n.consume(result('financial projection', 1, true)).utterance, 'our three year financial projection');
  assert.equal(n.consume(result('financial projection', 1, true)).utterance, undefined);
  n.consume(result('next topic', 3));
  assert.equal(n.consume({ type: 'UtteranceEnd', last_word_end: 2 }), null);
  assert.equal(n.consume({ type: 'UtteranceEnd', last_word_end: 4 }).utterance, 'next topic');
  assert.equal(n.consume({ type: 'UtteranceEnd', last_word_end: 4 }), null);
  n.consume(result('final buffered words', 5));
  assert.equal(n.consume(result('', 6, true)).utterance, 'final buffered words');
});

test('identity-free dedup is short and resets on a new turn', () => {
  let now = 0;
  const n = new PitchUtteranceNormalizer(() => now);
  assert.equal(n.consume(turn('same words')).utterance, 'same words');
  assert.equal(n.consume(turn('same words')).utterance, undefined);
  now = 1501;
  assert.equal(n.consume(turn('same words')).utterance, 'same words');
  n.consume(turn('', undefined, 'StartOfTurn'));
  assert.equal(n.consume(turn('same words')).utterance, 'same words');
});

function harness(overrides = {}) {
  const events = { status: [], transcript: [], utterance: [], error: [] };
  const resources = { tracksStopped: 0, recorderStopped: 0, recorderStarts: 0, sockets: [], timers: new Map() };
  const stream = { getTracks: () => [{ stop: () => resources.tracksStopped++ }] };
  const recorder = { state: 'inactive', ondataavailable: null, onerror: null,
    start() { resources.recorderStarts++; this.state = 'recording'; },
    stop() { resources.recorderStopped++; this.state = 'inactive'; } };
  const dependencies = {
    fetchStatus: async () => ({ configured: true, apiKeyStatus: 'valid', apiKeyMessage: '' }),
    getUserMedia: async () => stream,
    createWebSocket: () => { const socket = { readyState: 1, sent: [], closed: 0,
      send(data) { this.sent.push(data); }, close() { this.closed++; this.readyState = 3; } };
      resources.sockets.push(socket); return socket; },
    createRecorder: () => recorder,
    setTimeout: (fn) => { const id = resources.timers.size + 1; resources.timers.set(id, fn); return id; },
    clearTimeout: (id) => resources.timers.delete(id), ...overrides
  };
  const transport = new PitchTranscriptionTransport(Object.fromEntries(Object.keys(events).map(key => ['on' + key[0].toUpperCase() + key.slice(1), value => events[key].push(value)])), dependencies);
  const message = (data, socket = resources.sockets.at(-1)) => socket.onmessage?.({ data: JSON.stringify(data) });
  return { transport, resources, events, recorder, stream, message };
}

test('fake microphone streams once, ignores stale callbacks, and releases every resource', async () => {
  const h = harness();
  await h.transport.start();
  h.message({ type: 'Status', status: 'connected' });
  h.message({ type: 'Status', status: 'connected' });
  assert.equal(h.resources.recorderStarts, 1);
  assert.equal(h.resources.timers.size, 0);
  const socket = h.resources.sockets[0];
  socket.onmessage({ data: 'invalid json' });
  h.message(null);
  h.message(turn('interim', 1, 'Update'));
  assert.deepEqual(h.events.utterance, []);
  h.message(turn('financial projection', 1));
  h.message(turn('financial projection', 1));
  assert.deepEqual(h.events.utterance, ['financial projection']);
  const lateMessage = socket.onmessage;
  const audio = deferred();
  h.recorder.ondataavailable({ data: { size: 5, arrayBuffer: () => audio.promise } });
  h.transport.stop();
  audio.resolve(new ArrayBuffer(5));
  await Promise.resolve();
  lateMessage({ data: JSON.stringify(turn('late message', 2)) });
  assert.equal(h.resources.tracksStopped, 1);
  assert.equal(h.resources.recorderStopped, 1);
  assert.equal(socket.closed, 1);
  assert.deepEqual(socket.sent, ['__stop__']);
  assert.equal(h.events.utterance.length, 1);
  assert.deepEqual(h.events.status, ['connecting', 'listening', 'idle']);
});

test('stop during pending permission releases the late stream without opening a socket', async () => {
  const permission = deferred();
  const h = harness({ getUserMedia: () => permission.promise });
  const starting = h.transport.start();
  await Promise.resolve();
  h.transport.stop();
  permission.resolve(h.stream);
  await starting;
  assert.equal(h.resources.tracksStopped, 1);
  assert.equal(h.resources.sockets.length, 0);
});

test('superseded status checks cannot start capture', async () => {
  const status = deferred();
  const h = harness({ fetchStatus: () => status.promise });
  const starting = h.transport.start();
  h.transport.stop();
  status.resolve({ configured: true, apiKeyStatus: 'valid' });
  await starting;
  assert.equal(h.resources.sockets.length, 0);
  assert.equal(h.resources.tracksStopped, 0);
});

test('timeout, socket errors and recorder failure clean up without throwing', async () => {
  for (const failure of ['timeout', 'socket', 'recorder']) {
    const h = harness(failure === 'recorder' ? { createRecorder: () => { throw new Error('recorder failed'); } } : {});
    await h.transport.start();
    if (failure === 'timeout') [...h.resources.timers.values()][0]();
    if (failure === 'socket') h.resources.sockets[0].onerror({});
    if (failure === 'recorder') h.message({ type: 'Status', status: 'connected' });
    assert.equal(h.resources.tracksStopped, 1);
    assert.equal(h.resources.sockets[0].closed, 1);
    assert.equal(h.resources.timers.size, 0);
    assert.equal(h.events.error.length, 1);
    assert.equal(h.events.status.at(-1), 'error');
  }
});

test('socket close still executes when sending stop throws', async () => {
  const h = harness();
  await h.transport.start();
  h.resources.sockets[0].send = () => { throw new Error('closed'); };
  h.transport.stop();
  assert.equal(h.resources.sockets[0].closed, 1);
  assert.equal(h.resources.tracksStopped, 1);
});

test('frontend-only policy rejects microphone before any fetch', async () => {
  const original = process.env.NEXT_PUBLIC_FRONTEND_ONLY;
  process.env.NEXT_PUBLIC_FRONTEND_ONLY = 'true';
  try { await assert.rejects(createBrowserTranscriptionDependencies().fetchStatus(), /frontend-only/); }
  finally { if (original === undefined) delete process.env.NEXT_PUBLIC_FRONTEND_ONLY; else process.env.NEXT_PUBLIC_FRONTEND_ONLY = original; }
});
