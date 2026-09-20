import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { mountPitchDeckArt } from '../components/pitch/deck/deck-art.js';
import { PITCH_DECK } from '../lib/pitch/deck.ts';

// Exercise the actual JSX and drawing routines without a browser or new DOM dependency.
// Geometry is deliberately approximate; visual fidelity still needs browser review.
const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../components/pitch/deck/pitch-deck-slide.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source.replace('function SlideMarkup(', 'export function SlideMarkup('), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
}).outputText;
const moduleExports = {};
new Function('require', 'exports', compiled)(name => {
  if (name.endsWith('.css')) return { default: {} };
  if (name === './deck-art.js') return { mountPitchDeckArt };
  return require(name);
}, moduleExports);

class Element {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.parentNode = null; this.style = {}; this.dataset = {}; this.attributes = {};
    this.classList = {
      contains: value => (this.className || '').split(/\s+/).includes(value),
      add: value => { if (!this.classList.contains(value)) this.className = `${this.className || ''} ${value}`.trim(); },
      remove: value => { this.className = (this.className || '').split(/\s+/).filter(v => v !== value).join(' '); },
      toggle: (value, active) => { const next = active ?? !this.classList.contains(value); this.classList[next ? 'add' : 'remove'](value); }
    };
  }
  setAttribute(key, value) { this.attributes[key] = String(value); if (key === 'class') this.className = value; if (key === 'id') this.id = value; }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  append(...children) { children.forEach(child => this.appendChild(child)); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); this.parentNode = null; }
  set innerHTML(html) {
    this.children = [];
    for (const match of html.matchAll(/<([a-z0-9]+)\b([^>]*)>/gi)) {
      const child = new Element(match[1]);
      for (const attr of match[2].matchAll(/([\w-]+)="([^"]*)"/g)) child.setAttribute(attr[1], attr[2]);
      this.appendChild(child);
    }
  }
  querySelectorAll(selector) {
    const matches = element => selector.startsWith('#') ? element.id === selector.slice(1)
      : selector.startsWith('.') ? selector.slice(1).split('.').every(value => element.classList.contains(value))
      : element.tagName === selector;
    return this.children.flatMap(child => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  getTotalLength() { return 100; }
  getPointAtLength(length) { return { x: length, y: length }; }
  getBoundingClientRect() { return { width: 100, height: 100 }; }
}

function render(element) {
  const node = new Element(element.type);
  for (const [key, value] of Object.entries(element.props)) {
    if (key === 'ref') { value.current = node; continue; }
    if (key === 'children') continue;
    if (key === 'style') Object.assign(node.style, value);
    else if (key === 'className') node.className = value;
    else if (key.startsWith('data-')) node.dataset[key.slice(5)] = value;
    else node.setAttribute(key, value);
  }
  for (const child of [element.props.children].flat(Infinity)) {
    if (child && typeof child === 'object') node.appendChild(render(child));
    else if (child !== undefined && child !== null) node.textContent = (node.textContent || '') + child;
  }
  return node;
}

function environment(reduced, run) {
  const originals = new Map();
  const pending = new Map(); let sequence = 0; let time = 0;
  const schedule = (callback, delay = 16, interval = false) => { const id = ++sequence; pending.set(id, { callback, at: time + delay, delay, interval }); return id; };
  const globals = {
    window: { matchMedia: () => ({ matches: reduced }) },
    document: { createElement: tag => new Element(tag), createElementNS: (_, tag) => new Element(tag) },
    performance: { now: () => time },
    setTimeout: schedule, clearTimeout: id => pending.delete(id),
    setInterval: (callback, delay) => schedule(callback, delay, true), clearInterval: id => pending.delete(id),
    requestAnimationFrame: callback => schedule(callback), cancelAnimationFrame: id => pending.delete(id)
  };
  for (const [key, value] of Object.entries(globals)) { originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); }
  const advance = duration => {
    const end = time + duration; let calls = 0;
    while (true) {
      const next = [...pending].filter(([, job]) => job.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      assert.ok(++calls < 50000, 'animation scheduling must remain bounded');
      const [id, job] = next; pending.delete(id); time = job.at;
      if (job.interval) pending.set(id, { ...job, at: time + job.delay });
      job.callback(time);
    }
    time = end;
  };
  try { run({ pending, advance }); }
  finally { for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } }
}

for (const reduced of [false, true]) {
  test(`all native slides mount and clean up (${reduced ? 'reduced motion' : 'animated'})`, () => environment(reduced, ({ pending, advance }) => {
    assert.deepEqual([...moduleExports.DECK_RENDERER_IDS], PITCH_DECK.map(slide => slide.id));
    for (const { id } of PITCH_DECK) {
      const ref = { current: null };
      const root = render(moduleExports.SlideMarkup({ slideId: id, rootRef: ref }));
      assert.equal(ref.current, root, `${id}: drawing root must be mounted`);
      assert.equal(root.classList.contains('on'), true, `${id}: slide must be visible`);
      const cleanup = mountPitchDeckArt(root, id);
      advance(20000);
      if (reduced) assert.equal(pending.size, 0, `${id}: reduced motion must not repeat`);
      if (id === 'tam') {
        root.querySelector('#tam-expand').onclick();
        root.querySelectorAll('.tam-tab')[1].onclick();
        advance(2000);
        assert.equal(root._m.mode, 'school');
        assert.equal(root._m.stage, 1);
        assert.ok(root.querySelector('#tam-num').textContent);
      }
      if (id === 'hall') {
        // Let each subject animate before switching, then verify that detached
        // artwork stops changing instead of accumulating perpetual frame chains.
        const snapshot = node => JSON.stringify([node.attributes, node.style, node.children.map(snapshot)]);
        for (const button of root.querySelectorAll('button')) {
          const oldHost = root._hall.host;
          button.onclick();
          advance(4000);
          const before = snapshot(oldHost);
          advance(200);
          assert.equal(snapshot(oldHost), before, 'previous subject must stop animating');
        }
      }
      const staleCallbacks = [...pending.values()].map(job => job.callback);
      cleanup();
      assert.equal(pending.size, 0, `${id}: cleanup cancels all animation work`);
      for (const callback of staleCallbacks) callback(999999);
      assert.equal(pending.size, 0, `${id}: stale callbacks cannot restart work`);
      assert.ok(root.querySelectorAll('button').every(button => button.onclick === null));
    }
  }));
}
