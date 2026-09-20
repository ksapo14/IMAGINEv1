"use client";
import { LOGO, USMAP, PEOPLE } from './artwork.js';

/**
 * Source-preserving artwork adapter. React owns each slide's static structure;
 * this scoped runtime owns only its empty SVG/art placeholders and local controls.
 * No document-wide router, model calls, network requests, or external assets.
 */
export function mountPitchDeckArt(root, slideId) {
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const NS = 'http://www.w3.org/2000/svg';

/* ---------- tiny helpers ---------- */
const $  = (s, r = root) => r.querySelector(s);
const $$ = (s, r = root) => [...r.querySelectorAll(s)];

function mk(tag, attrs = {}, parent = null) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) {
    if (k === 'class') e.setAttribute('class', attrs[k]);
    else if (k === 'text') e.textContent = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  if (parent) parent.appendChild(e);
  return e;
}

function txt(parent, x, y, s, o = {}) {
  return mk('text', {
    x, y, text: s,
    'font-size': o.size || 13,
    'font-weight': o.weight || 400,
    'text-anchor': o.anchor || 'start',
    'letter-spacing': o.ls != null ? o.ls : '0',
    fill: o.fill || '#000',
    'font-family': "'Poppins',Helvetica,Arial,sans-serif",
    opacity: o.opacity != null ? o.opacity : 1,
  }, parent);
}

/* cubic-bezier sampler so the travelling pen tracks the CSS timing exactly */
function bez(x1, y1, x2, y2) {
  const A = (a, b) => 1 - 3 * b + 3 * a, B = (a, b) => 3 * b - 6 * a, C = a => 3 * a;
  const cal = (t, a, b) => ((A(a, b) * t + B(a, b)) * t + C(a)) * t;
  const slope = (t, a, b) => 3 * A(a, b) * t * t + 2 * B(a, b) * t + C(a);
  return (x) => {
    let t = x;
    for (let i = 0; i < 5; i++) {
      const s = slope(t, x1, x2);
      if (s === 0) break;
      t -= (cal(t, x1, x2) - x) / s;
    }
    return cal(t, y1, y2);
  };
}
const EASE = bez(.33, 0, .12, 1);
const CSS_EASE = 'cubic-bezier(.33,0,.12,1)';

/* ---------- lifecycle bookkeeping ---------- */
// Only pending handles are retained; long-running animations have bounded bookkeeping.
let active = true;
const timers = new Set(), intervals = new Set(), frames = new Set();
const settledFrames = new Set();
const after = (ms, fn) => {
  if (!active) return;
  if (reduceMotion) { fn(); return; }
  const id = setTimeout(() => { timers.delete(id); if (active) fn(); }, ms);
  timers.add(id);
};
const every = (ms, fn) => {
  if (active && !reduceMotion) intervals.add(setInterval(() => { if (active) fn(); }, ms));
};
const raf = (fn) => {
  if (!active) return 0;
  if (reduceMotion) {
    // Draw one still frame of looping artwork, with recursive scheduling suppressed.
    if (!settledFrames.has(fn)) { settledFrames.add(fn); fn(performance.now()); }
    return 0;
  }
  const id = requestAnimationFrame((time) => { frames.delete(id); if (active) fn(time); });
  frames.add(id);
  return id;
};
function clearAll() {
  active = false;
  timers.forEach(clearTimeout);
  intervals.forEach(clearInterval);
  frames.forEach(cancelAnimationFrame);
  timers.clear(); intervals.clear(); frames.clear(); settledFrames.clear();
  root.querySelectorAll('button').forEach(button => { button.onclick = null; });
}

/* ---------- the draw primitive ---------- */
function draw(path, { dur = 900, delay = 0, pen = false, keep = true } = {}) {
  if (reduceMotion) { path.style.strokeDashoffset = '0'; path.style.opacity = keep ? '1' : '0'; return; }
  let len;
  try { len = path.getTotalLength(); } catch (e) { len = 0; }
  if (!len) { path.style.opacity = 1; return; }
  path.style.strokeDasharray = len;
  path.style.strokeDashoffset = len;
  path.style.transition = 'none';
  path.getBoundingClientRect();
  after(delay, () => {
    path.style.transition = `stroke-dashoffset ${dur}ms ${CSS_EASE}`;
    path.style.strokeDashoffset = 0;
    if (!keep) after(dur + 40, () => { path.style.transition = 'opacity .5s'; path.style.opacity = 0; });
  });
  if (pen) penAlong(path, dur, delay, len);
}

function penAlong(path, dur, delay, len) {
  if (reduceMotion) return;
  const dot = mk('circle', { r: 3.4, class: 'pen' }, path.parentNode);
  dot.style.opacity = '0';
  after(delay, () => {
    dot.style.opacity = '1';
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const p = path.getPointAtLength(EASE(k) * len);
      dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y);
      if (k < 1) raf(step);
      else { dot.style.transition = 'opacity .35s'; dot.style.opacity = '0'; after(500, () => dot.remove()); }
    };
    raf(step);
  });
}

/* draw a whole group of paths with a stagger */
function drawAll(paths, { dur = 800, delay = 0, stagger = 70, pen = -1 } = {}) {
  paths.forEach((p, i) => draw(p, { dur, delay: delay + i * stagger, pen: i === pen }));
  return delay + paths.length * stagger + dur;
}

/* count a number up. `guard` lets a later call cancel an earlier one. */
function countTo(el, to, dur, fmt, guard) {
  if (reduceMotion) { el.textContent = fmt(to); return; }
  const mine = guard ? guard() : null;
  const t0 = performance.now();
  const step = (t) => {
    if (guard && guard() !== mine) return;     // superseded
    const k = Math.min(1, (t - t0) / dur);
    el.textContent = fmt(to * EASE(k));
    if (k < 1) raf(step); else el.textContent = fmt(to);
  };
  raf(step);
}

/* a dot that loops along a path forever */
function orbit(path, dur, r = 3) {
  const len = path.getTotalLength();
  const dot = mk('circle', { r, class: 'pen' }, path.parentNode);
  const t0 = performance.now();
  const step = (t) => {
    const k = ((t - t0) % dur) / dur;
    const p = path.getPointAtLength(k * len);
    dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y);
    raf(step);
  };
  raf(step);
  return dot;
}

/* re-draw a path on a loop, so the slide never goes static */
function loopDraw(path, dur, gap) {
  if (reduceMotion) { path.style.strokeDashoffset = '0'; return; }
  const len = path.getTotalLength();
  path.style.strokeDasharray = len;
  const run = () => {
    path.style.transition = 'none';
    path.style.strokeDashoffset = len;
    path.getBoundingClientRect();
    path.style.transition = `stroke-dashoffset ${dur}ms ${CSS_EASE}`;
    path.style.strokeDashoffset = 0;
  };
  run(); every(dur + gap, run);
}

/* let a drawn outline fill itself in once the stroke has closed */
function fillAfter(p, color, delay, dur = 620) {
  p.style.fill = color;
  p.style.fillOpacity = '0';
  after(delay, () => {
    p.style.transition = `fill-opacity ${dur}ms ease`;
    p.style.fillOpacity = '1';
  });
}

/* hand a dashed outline back its dash pattern after it has been drawn on,
   then march it so a placeholder always reads as unfinished */
function marchAfter(paths, endMs, pattern = '5 5', speed = .3) {
  after(endMs, () => {
    paths.forEach(p => {
      p.style.transition = 'none';
      p.style.strokeDasharray = pattern;
      p.style.strokeDashoffset = '0';
    });
    let o = 0;
    const step = () => { o -= speed; paths.forEach(p => p.style.strokeDashoffset = o); raf(step); };
    raf(step);
  });
}

/* rounded-rect path string */
function rr(x, y, w, h, r) {
  return `M${x + r},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h - r}`
       + `A${r},${r} 0 0 1 ${x + w - r},${y + h}H${x + r}A${r},${r} 0 0 1 ${x},${y + h - r}`
       + `V${y + r}A${r},${r} 0 0 1 ${x + r},${y}Z`;
}
/* arrow with a small head */
function arrow(g, x1, y1, x2, y2, cls = 's s-thin') {
  const p = mk('path', { class: cls, d: `M${x1},${y1}L${x2},${y2}` }, g);
  const a = Math.atan2(y2 - y1, x2 - x1), L = 7;
  const h = mk('path', {
    class: cls,
    d: `M${x2 - L * Math.cos(a - .38)},${y2 - L * Math.sin(a - .38)}L${x2},${y2}`
     + `L${x2 - L * Math.cos(a + .38)},${y2 - L * Math.sin(a + .38)}`,
  }, g);
  return [p, h];
}

/* ---------- logo ---------- */
/* LOGO.mark / .word / .tag are exact traced outlines of the supplied artwork.
   Each group is filled by ONE path using fill-rule="evenodd", so the counters
   inside a, g and e stay open instead of being filled in.                    */
function buildLogo(svg, { parts = ['mark', 'word', 'tag'] } = {}) {
  svg.innerHTML = '';
  const solo = parts.length === 1;
  const out = { stroke: [], fill: [] };
  parts.forEach(key => {
    const part = LOGO[key];
    const [ox, oy] = solo ? [0, 0] : part.off;
    const g = mk('g', { transform: `translate(${ox},${oy})` }, svg);
    // the ink
    out.fill.push(mk('path', { d: part.d.join(''), class: 'fillink', 'fill-rule': 'evenodd' }, g));
    // outlines, kept separate only so each shape can be drawn in sequence
    part.d.forEach(d => out.stroke.push(mk('path', { d, class: 's s-thin' }, g)));
  });
  return out;
}

/* draw the logo: outline first, then let the ink fill in behind it */
function playLogo(parts, { delay = 0, dur = 620, stagger = 46 } = {}) {
  parts.stroke.forEach((p, i) => draw(p, { dur, delay: delay + i * stagger }));
  const end = delay + parts.stroke.length * stagger + dur;
  parts.fill.forEach((f, i) => after(end - 260 + i * 30, () => f.classList.add('in')));
  after(end + 60, () => parts.stroke.forEach(p => {
    p.style.transition = 'opacity .55s ease'; p.style.opacity = '0';
  }));
  return end + 500;
}

/* ============================================================
   SLIDES
   ============================================================ */
const SLIDES = {};

/* ---------------------------------------------------- 1. OPEN --------- */
SLIDES.open = {
  title: 'Imagineer',
  build(sec) {
    const hero = $('#logo-hero', sec);
    hero.setAttribute('viewBox', `-10 -10 ${LOGO._box[0] + 20} ${LOGO._box[1] + 20}`);
    sec._logo = buildLogo(hero);
  },
  play(sec) {
    playLogo(sec._logo, { delay: 200 });
  },
};

function loopOnce(path, dur, delay) {
  const len = path.getTotalLength();
  after(delay, () => {
    path.style.transition = 'none';
    path.style.strokeDasharray = len; path.style.strokeDashoffset = len;
    path.getBoundingClientRect();
    path.style.transition = `stroke-dashoffset ${dur}ms ${CSS_EASE}`;
    path.style.strokeDashoffset = 0;
  });
}



/* ==========================================================
   AP BIO — a real electron transport chain. Membrane, four
   complexes, ATP synthase. Electrons ride the chain, protons
   get pumped up and fall back through the rotor.
   ========================================================== */
SLIDES.anecdote = {
  title: 'AP Biology',
  build(sec) {
    const g = $('#etc-art', sec); g.innerHTML = '';
    const S = sec._etc = { draw: [], texts: [], rotor: null };
    const T = (x, y, str, o) => { const e = txt(g, x, y, str, o); e.style.opacity = '0';
                                  e.style.transition = 'opacity .5s ease'; S.texts.push(e); return e; };

    const TOP = 150, BOT = 236;                 // the bilayer
    const L = 30, R = 1226;

    // --- phospholipids, head and two tails, both leaflets
    const lipids = mk('g', {}, g);
    for (let x = L + 8; x < R; x += 17) {
      [[TOP, 1], [BOT, -1]].forEach(([y, dir]) => {
        const c = mk('circle', { cx: x, cy: y, r: 5, class: 's s-hair' }, lipids);
        c.style.fill = '#F4F2EC';
        mk('path', { class: 's s-hair',
          d: `M${x - 2},${y + dir * 5}l-1.5,${dir * 13}M${x + 2},${y + dir * 5}l1.5,${dir * 13}` }, lipids);
      });
    }
    S.lipids = lipids;
    lipids.style.opacity = '0';
    lipids.style.transition = 'opacity .9s ease';

    T(L, 44, 'INTERMEMBRANE SPACE', { size: 11, weight: 500, ls: '.2em', fill: '#8F8B80' });
    T(L, 344, 'MITOCHONDRIAL MATRIX', { size: 11, weight: 500, ls: '.2em', fill: '#8F8B80' });

    // --- the four complexes plus the synthase
    const cplx = (x, w, label, sub) => {
      const p = mk('path', { class: 's', d: rr(x, TOP - 26, w, (BOT - TOP) + 52, 9) }, g);
      p.style.strokeWidth = '2.2'; p._fill = '#E7E3DA';
      S.draw.push(p);
      T(x + w / 2, 200, label, { size: 21, weight: 500, anchor: 'middle' });
      if (sub) T(x + w / 2, 276, sub, { size: 11.5, anchor: 'middle', fill: '#8F8B80' });
      return p;
    };
    cplx(96, 128, 'I', 'NADH dehydrogenase');
    cplx(330, 96, 'II', 'succinate');
    cplx(520, 128, 'III', 'cytochrome bc\u2081');
    cplx(760, 128, 'IV', 'cytochrome c oxidase');

    // ATP synthase: a stalk through the membrane and a rotor head in the matrix
    const AX = 1020;
    const stalk = mk('path', { class: 's', d: rr(AX - 26, TOP - 20, 52, (BOT - TOP) + 40, 7) }, g);
    stalk.style.strokeWidth = '2.2'; stalk._fill = '#E7E3DA'; S.draw.push(stalk);
    S.shaft = mk('path', { class: 's', d: `M${AX},${BOT + 20}v34` }, g);
    S.shaft.style.strokeWidth = '2.2'; S.draw.push(S.shaft);
    S.rotor = mk('g', {}, g);
    const knob = mk('path', { class: 's', d: `M${AX - 54},${BOT + 54}a54,42 0 0 1 108,0Z` }, S.rotor);
    knob.style.strokeWidth = '2.4'; knob._fill = '#F1EEE7'; S.draw.push(knob);
    // spokes on the rotor face; sliding them sideways reads as spin without
    // tumbling the whole head, which a rotation transform would do
    S.spokes = [];
    for (let i = -2; i <= 2; i++) {
      const sp = mk('path', { class: 's s-hair', d: `M${AX + i * 18},${BOT + 56}v34` }, S.rotor);
      sp._phase = (i + 2) / 5;
      S.draw.push(sp); S.spokes.push(sp);
    }
    S.AX = AX; S.BOT = BOT;
    T(AX, 348, 'ATP synthase', { size: 13, anchor: 'middle', fill: '#8F8B80' });

    // --- the electron route, used as a rail for the moving charges
    S.eRail = mk('path', {
      class: 's s-hair',
      d: `M56,300C80,300 110,272 160,246C186,232 214,218 250,214`
       + `C300,208 330,206 378,212C430,218 470,220 520,214`
       + `C560,209 572,196 584,178C596,160 620,150 660,148`
       + `C700,146 740,152 790,176C830,194 848,226 872,262C892,292 910,300 940,302`,
    }, g);
    S.eRail.style.opacity = '0';
    S.electrons = [0, .26, .52, .78].map(p => {
      const c = mk('circle', { r: 5.6, fill: '#1C1C1C', cx: -40, cy: -40 }, g);
      c._p = p; c.style.opacity = '0'; c.style.transition = 'opacity .5s';
      return c;
    });
    T(24, 316, 'NADH', { size: 13.5, weight: 500 });
    T(944, 316, 'H\u2082O', { size: 13.5, weight: 500 });
    T(880, 340, 'O\u2082 + 4H\u207a', { size: 11.5, fill: '#8F8B80' });

    // --- proton pumps: up through I, III, IV; back down through the synthase
    S.pumps = [];
    [160, 584, 824].forEach((x, i) => {
      const rail = mk('path', { class: 's s-hair', d: `M${x},${BOT + 46}C${x},${BOT} ${x},${TOP} ${x},${TOP - 62}` }, g);
      rail.style.opacity = '0';
      const ions = [0, .5].map(p => {
        const t = txt(g, -40, -40, 'H\u207a', { size: 13, weight: 500, anchor: 'middle' });
        t._p = (p + i * .2) % 1; t.style.opacity = '0';
        return t;
      });
      S.pumps.push({ rail, ions, up: true });
    });
    const down = mk('path', { class: 's s-hair', d: `M${AX},${TOP - 62}C${AX},${TOP} ${AX},${BOT} ${AX},${BOT + 30}` }, g);
    down.style.opacity = '0';
    S.pumps.push({
      rail: down,
      ions: [0.25].map(p => { const t = txt(g, -40, -40, 'H\u207a', { size: 13, weight: 500, anchor: 'middle' });
                              t._p = p; t.style.opacity = '0'; return t; }),
      up: false,
    });

    // a thin gradient of protons already pumped
    S.cloud = [];
    T(AX + 76, BOT + 96, 'ADP + P\u1d62  \u2192  ATP', { size: 14, weight: 500 });
  },

  play(sec) {
    const S = sec._etc;
    after(200, () => S.lipids.style.opacity = '1');
    S.draw.forEach((p, i) => {
      draw(p, { dur: 620, delay: 420 + i * 90 });
      if (p._fill) fillAfter(p, p._fill, 900 + i * 90);
    });
    S.texts.forEach((t, i) => after(600 + i * 90, () => t.style.opacity = '1'));
    S.pumps.forEach(pm => pm.ions.forEach(t => after(2000, () => t.style.opacity = '1')));
    S.electrons.forEach(c => after(1800, () => c.style.opacity = '1'));

    const eLen = S.eRail.getTotalLength();
    const pLens = S.pumps.map(pm => pm.rail.getTotalLength());
    const t0 = performance.now();
    const tick = (now) => {
      const el = (now - t0) / 1000;
      S.electrons.forEach(c => {
        const p = (c._p + el * 0.075) % 1;
        const pt = S.eRail.getPointAtLength(p * eLen);
        c.setAttribute('cx', pt.x.toFixed(1)); c.setAttribute('cy', pt.y.toFixed(1));
      });
      S.pumps.forEach((pm, i) => {
        pm.ions.forEach(t => {
          const raw = (t._p + el * (pm.up ? 0.13 : 0.17)) % 1;
          const p = pm.up ? 1 - raw : raw;
          const pt = pm.rail.getPointAtLength(p * pLens[i]);
          t.setAttribute('x', pt.x.toFixed(1)); t.setAttribute('y', pt.y.toFixed(1));
        });
      });
      // the head stays put; its spokes sweep across as protons fall through
      S.spokes.forEach(sp => {
        const a = ((sp._phase + el * 0.22) % 1) * Math.PI * 2;
        const x = S.AX + Math.sin(a) * 42;
        const vis = Math.cos(a) > 0 ? 0.9 : 0.25;
        sp.setAttribute('d', `M${x.toFixed(1)},${S.BOT + 56}v34`);
        sp.style.opacity = vis;
      });
      raf(tick);
    };
    raf(tick);
  },
};



/* --------------------------------------------- 3. THE PROBLEM --------- */
SLIDES.problem = {
  title: 'The problem',
  build(sec) {
    const rows = $('#pb-rows', sec); rows.innerHTML = '';
    sec._glyphs = [];
    const items = [
      ['The ideas that matter are invisible',
       (g) => [mk('path', { class: 's', d: 'M8,28c10-14 23-20 30-20s20,6 30,20c-10,14-23,20-30,20S18,42 8,28Z' }, g),
               mk('circle', { cx: 38, cy: 28, r: 8, class: 's' }, g),
               mk('path', { class: 's', d: 'M12,50L64,6' }, g)]],
      ['Five hours a week building slides',
       (g) => [mk('circle', { cx: 38, cy: 28, r: 21, class: 's' }, g),
               mk('path', { class: 's', d: 'M38,14v14l10,9' }, g)]],
      ['\u201cWait, what does that look like?\u201d',
       (g) => [mk('path', { class: 's', d: rr(10, 10, 56, 38, 7) }, g),
               mk('path', { class: 's', d: 'M25,48l-5,12 15-12' }, g)]],
    ];
    items.forEach(([h, glyph]) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:32px;align-items:center';
      const holder = document.createElement('div');
      holder.style.cssText = 'flex:none;width:92px';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 76 60');
      svg.style.cssText = 'width:92px;height:72px';
      holder.appendChild(svg);
      sec._glyphs.push(glyph(mk('g', {}, svg)));
      const t = document.createElement('div');
      t.innerHTML = `<h3 class="rv" style="font-size:34px;font-weight:400;letter-spacing:-.02em">${h}</h3>`;
      row.append(holder, t); rows.appendChild(row);
    });
  },
  play(sec) {
    sec._glyphs.forEach((set, i) => drawAll(set, { dur: 560, delay: 240 + i * 320, stagger: 140 }));
  },
};

/* ==========================================================
   THE ROOM — a lecture hall with the board running. The logo
   lands first, then the board cycles through real diagrams:
   chemistry, physics, math, biology. Click a tab to jump.
   ========================================================== */
const BX0 = 368, BY0 = 10, BX1 = 888, BY1 = 270;      // the board
const IX0 = BX0 + 28, IX1 = BX1 - 28, IY0 = BY0 + 24, IY1 = BY1 - 24;
const ICX = (IX0 + IX1) / 2, ICY = (IY0 + IY1) / 2;
const LEDGE = 282, CX = 628;                          // stage floor, room centre
const HALF0 = 294, HALF1 = 720;                       // the hall opens toward you
const halfAt = y => HALF0 + (y - LEDGE) / (530 - LEDGE) * (HALF1 - HALF0);

/* a repeatable wobble so the crowd is not a grid */
function jit(n) { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); }

function hallRoom(g) {
  const slow = [], quick = [];

  mk('path', { d: rr(BX0, BY0, BX1 - BX0, BY1 - BY0, 5), fill: '#fff' }, g);
  slow.push(mk('path', { class: 's', d: rr(BX0, BY0, BX1 - BX0, BY1 - BY0, 5) }, g));
  slow.push(mk('path', { class: 's s-thin', d: `M${CX - HALF0},${LEDGE}H${CX + HALF0}` }, g));
  quick.push(mk('path', { class: 's s-thin s-stone', d: `M${CX - HALF0},${LEDGE}L${CX - HALF1},530` }, g));
  quick.push(mk('path', { class: 's s-thin s-stone', d: `M${CX + HALF0},${LEDGE}L${CX + HALF1},530` }, g));

  // the person doing the talking, on the stage, turned toward the board
  const P = mk('g', { transform: `translate(222,${LEDGE - 3}) scale(1.44)` }, g);
  // head, neck and torso as one closed outline so nothing reads as a gap
  slow.push(mk('path', {
    class: 's',
    d: 'M-10,-108c0-7 4-13 10-13s10,6 10,13c0,5-1,9-3,12c-1,2-2,3-3,4'
     + 'l0,5c9,1 15,5 18,12c3,8 3,18 2,27l-2,21h-44l-2-21c-1-9-1-19 2-27'
     + 'c3-7 9-11 18-12l0-5c-1-1-2-2-3-4C-9,-99-10,-103-10,-108Z',
  }, P));
  slow.push(mk('path', { class: 's s-thin', d: 'M-6,-90L0,-78L6,-90' }, P));               // collar
  // arm up at the board, shoulder through to a hand
  slow.push(mk('path', {
    class: 's',
    d: 'M15,-89c8,0 16,-4 23,-11c6,-6 11,-13 15,-20l6,4c-4,8-10,16-17,23'
     + 'c-8,8-17,13-26,13Z',
  }, P));
  slow.push(mk('circle', { cx: 61, cy: -121, r: 5, class: 's' }, P));
  // the other arm, hanging with a slight bend
  slow.push(mk('path', {
    class: 's',
    d: 'M-18,-86c-7,7-11,16-11,26c0,6 1,11 3,16l-7,2c-2-6-3-12-3-18'
     + 'c0-12 4-22 12-30Z',
  }, P));
  slow.push(mk('circle', { cx: -29, cy: -40, r: 4.4, class: 's' }, P));
  // legs, joined to the waist and closed at the shoe
  slow.push(mk('path', { class: 's', d: 'M-21,-29h19l-1,29h-15Z' }, P));
  slow.push(mk('path', { class: 's', d: 'M2,-29h19l-3,29h-15Z' }, P));
  slow.push(mk('path', { class: 's s-thin', d: 'M-22,0h13M9,0h13' }, P));                  // shoes
  quick.push(mk('path', { class: 's s-thin s-stone', d: 'M-32,2h64' }, P));

  // the hall: rows falling toward you, each one wider and closer than the last
  [352, 386, 426, 474, 530].forEach((y, ri) => {
    const W = halfAt(y), k = W / halfAt(352);
    const r = 6.0 * k, bow = 9 * k, n = 16;
    const yAt = t => y + bow * (4 * t - 4 * t * t - 1);
    for (let i = 0; i < n; i++) {
      const t = (i + .5) / n;
      const x = CX + (t - .5) * 2 * W + (jit(ri * 31 + i) - .5) * r * 2.2;
      if (x < -50 || x > 1306) continue;
      const base = yAt(t) - 4, lean = (jit(ri * 17 + i) - .5) * r * .8;
      const hy = base - r - 12 * k + (jit(ri * 7 + i * 3) - .5) * 5 * k;
      quick.push(mk('circle', { cx: x + lean, cy: hy, r, class: 's s-thin s-stone' }, g));
      quick.push(mk('path', {
        class: 's s-thin s-stone',
        d: `M${x - r * 2.2},${base}c${r * .5},${-r * 1.6} ${r * 1.4},${-r * 2.2} `
         + `${r * 2.2 + lean},${-r * 2.2}c${r * .8},0 ${r * 1.7},${r * .6} ${r * 2.2 - lean},${r * 2.2}`,
      }, g));
      if (jit(ri * 53 + i * 11) > .90) {                     // a hand goes up
        const sx = x + r * 1.7, sy = base - r * 1.5;
        const hx = x + r * 2.6, hy = base - r * 5.0;
        quick.push(mk('path', {
          class: 's s-thin s-stone',
          d: `M${sx},${sy}C${sx + r * .9},${sy - r * 1.2} ${hx - r * .3},${hy + r * 1.6} ${hx},${hy}`,
        }, g));
        quick.push(mk('circle', { cx: hx, cy: hy - r * .4, r: r * .42, class: 's s-thin s-stone' }, g));
      }
    }
    // the desk in front of them, curved the way a lecture hall row is
    slow.push(mk('path', {
      class: 's s-thin',
      d: `M${CX - W},${y - bow}Q${CX},${y + bow} ${CX + W},${y - bow}`,
    }, g));
  });

  return { slow, quick };
}

/* ---------- what goes up on the board ---------- */
const BOARD = [
  {
    key: 'chem', label: 'Chemistry',
    build(g) {
      const out = [], R = 62, cy = ICY;
      const ring = (cx, hot) => {
        const pt = k => [cx + R * Math.cos(k * Math.PI / 3 - Math.PI / 2),
                         cy + R * Math.sin(k * Math.PI / 3 - Math.PI / 2)];
        const v = [0, 1, 2, 3, 4, 5].map(pt);
        v.forEach((p, i) => {
          const q = v[(i + 1) % 6];
          out.push(mk('path', { class: 's', d: `M${p[0]},${p[1]}L${q[0]},${q[1]}` }, g));
        });
        hot.forEach(i => {                       // the second line of a double bond
          const p = v[i], q = v[(i + 1) % 6];
          const mx = (p[0] + q[0]) / 2 - cx, my = (p[1] + q[1]) / 2 - cy;
          const L = Math.hypot(mx, my), k = 11 / L;
          out.push(mk('path', {
            class: 's s-thin',
            d: `M${p[0] - mx * k},${p[1] - my * k}L${q[0] - mx * k},${q[1] - my * k}`,
          }, g));
        });
        const c = mk('circle', { cx, cy, r: R * .44, class: 's s-thin s-stone' }, g);
        c.style.opacity = '0';
        return c;
      };
      const LX = IX0 + 96, RX = IX1 - 96;
      const cA = ring(LX, [0, 2, 4]);
      const cB = ring(RX, [1, 3, 5]);

      // the double-headed arrow that says these are the same molecule
      const y = cy, x1 = LX + R + 22, x2 = RX - R - 22;
      out.push(mk('path', { class: 's', d: `M${x1},${y}H${x2}` }, g));
      out.push(mk('path', { class: 's', d: `M${x1 + 11},${y - 6}L${x1},${y}L${x1 + 11},${y + 6}` }, g));
      out.push(mk('path', { class: 's', d: `M${x2 - 11},${y - 6}L${x2},${y}L${x2 - 11},${y + 6}` }, g));

      const lb = txt(g, IX1 - 6, IY0 + 22, 'resonance', { size: 17, anchor: 'end', fill: '#5E5B55' });
      const sub = txt(g, (LX + RX) / 2, y - 16, 'neither, and both', { size: 14, anchor: 'middle', fill: '#5E5B55' });
      lb.style.opacity = sub.style.opacity = '0';

      return {
        paths: out,
        late: [lb, sub, cA, cB],
        live(isCurrent) {                         // the delocalised ring breathes
          let t = 0;
          const step = () => {
            if (!isCurrent()) return;
            t += .016;
            const r = R * (.44 + Math.sin(t) * .028);
            cA.setAttribute('r', r); cB.setAttribute('r', r);
            raf(step);
          };
          raf(step);
        },
      };
    },
  },
  {
    key: 'phys', label: 'Physics',
    build(g) {
      const x0 = IX0 + 26, y0 = IY1 - 26, W = 400, H = 176, out = [];
      const yAt = x => y0 - 4 * H * ((x - x0) / W) * (1 - (x - x0) / W);
      out.push(mk('path', { class: 's s-thin', d: `M${IX0},${y0}H${IX1 - 10}` }, g));
      let d = `M${x0},${y0}`;
      for (let i = 1; i <= 60; i++) { const x = x0 + W * i / 60; d += `L${x},${yAt(x)}`; }
      const arc = mk('path', { class: 's', d }, g);
      out.push(arc);
      // velocity broken into its components at three points along the flight
      [.14, .5, .86].forEach(t => {
        const x = x0 + W * t, y = yAt(x);
        const vx = 46, vy = -46 * (1 - 2 * t) * (4 * H / W) / 2.4;
        arrow(g, x, y, x + vx, y).forEach(p => out.push(p));
        if (Math.abs(vy) > 6) arrow(g, x, y, x, y + vy).forEach(p => out.push(p));
        out.push(mk('path', { class: 's s-thin s-stone', d: `M${x},${y}L${x + vx},${y + vy}` }, g));
      });
      const a = mk('path', { class: 's s-thin s-stone', d: `M${x0 + 34},${y0}A34,34 0 0 0 ${x0 + 26},${y0 - 22}` }, g);
      out.push(a);
      const th = txt(g, x0 + 44, y0 - 9, '45°', { size: 15, fill: '#5E5B55' });
      const lb = txt(g, IX1 - 6, IY0 + 22, 'projectile motion', { size: 17, anchor: 'end', fill: '#5E5B55' });
      th.style.opacity = lb.style.opacity = '0';
      return {
        paths: out,
        late: [th, lb],
        live(isCurrent) {                          // and a ball actually flies it
          const ball = mk('circle', { r: 6, class: 'pen' }, g);
          const t0 = performance.now();
          const step = (t) => {
            if (!isCurrent()) return;
            const k = ((t - t0) % 2400) / 2400;
            const x = x0 + W * k;
            ball.setAttribute('cx', x); ball.setAttribute('cy', yAt(x));
            ball.style.opacity = k > .97 ? 0 : 1;
            raf(step);
          };
          raf(step);
        },
      };
    },
  },
  {
    key: 'math', label: 'Math',
    build(g) {
      const cx = IX0 + 92, cy = ICY, R = 72, W = 268, out = [];
      out.push(mk('circle', { cx, cy, r: R, class: 's' }, g));
      out.push(mk('path', { class: 's s-thin s-stone', d: `M${cx - R - 14},${cy}H${cx + R + 14}` }, g));
      out.push(mk('path', { class: 's s-thin s-stone', d: `M${cx},${cy - R - 14}V${cy + R + 14}` }, g));
      const ax = cx + R + 40;
      out.push(mk('path', { class: 's s-thin s-stone', d: `M${ax},${cy}H${ax + W}` }, g));
      let d = `M${ax},${cy}`;
      for (let i = 1; i <= 90; i++) {
        const k = i / 90;
        d += `L${ax + W * k},${cy - R * Math.sin(k * Math.PI * 2)}`;
      }
      out.push(mk('path', { class: 's', d }, g));
      const lb = txt(g, IX1 - 6, IY0 + 22, 'y = sin x', { size: 17, anchor: 'end', fill: '#5E5B55' });
      lb.style.opacity = '0';
      return {
        paths: out,
        late: [lb],
        live(isCurrent) {     // the radius turns and the height it casts is the curve
          const ray = mk('path', { class: 's s-thin' }, g);
          const tie = mk('path', { class: 's s-thin s-stone', 'stroke-dasharray': '3 4' }, g);
          const d1 = mk('circle', { r: 4.6, class: 'pen' }, g);
          const d2 = mk('circle', { r: 4.6, class: 'pen' }, g);
          const t0 = performance.now();
          const step = (t) => {
            if (!isCurrent()) return;
            const k = ((t - t0) % 4200) / 4200, a = k * Math.PI * 2;
            const px = cx + R * Math.cos(a), py = cy - R * Math.sin(a);
            const qx = ax + W * k, qy = cy - R * Math.sin(a);
            ray.setAttribute('d', `M${cx},${cy}L${px},${py}`);
            tie.setAttribute('d', `M${px},${py}H${qx}`);
            d1.setAttribute('cx', px); d1.setAttribute('cy', py);
            d2.setAttribute('cx', qx); d2.setAttribute('cy', qy);
            raf(step);
          };
          raf(step);
        },
      };
    },
  },
  {
    key: 'bio', label: 'Biology',
    build(g) {
      const x0 = IX0 + 44, W = IX1 - IX0 - 130, cy = ICY, A = 62, out = [];
      const turns = 1.55;
      const yA = k => cy + A * Math.sin(k * Math.PI * 2 * turns);
      const yB = k => cy + A * Math.sin(k * Math.PI * 2 * turns + Math.PI);
      const strand = (f) => {
        let d = `M${x0},${f(0)}`;
        for (let i = 1; i <= 110; i++) { const k = i / 110; d += `L${x0 + W * k},${f(k)}`; }
        return mk('path', { class: 's', d }, g);
      };
      out.push(strand(yA)); out.push(strand(yB));
      const pairs = ['AT', 'GC', 'CG', 'TA', 'AT', 'GC', 'TA', 'CG', 'GC'];
      const rungs = [], labs = [];
      pairs.forEach((p, i) => {
        const k = (i + .6) / (pairs.length + .2), x = x0 + W * k;
        const a = yA(k), b = yB(k);
        rungs.push(mk('path', { class: 's s-thin', d: `M${x},${a}L${x},${b}` }, g));
        if (i % 2 === 0) {
          const t = txt(g, x, cy + A + 30, p[0] + '–' + p[1], { size: 14, anchor: 'middle', fill: '#5E5B55' });
          t.style.opacity = '0'; labs.push(t);
        }
      });
      rungs.forEach(r => out.push(r));
      const lb = txt(g, IX1 - 6, IY0 + 22, 'base pairing', { size: 17, anchor: 'end', fill: '#5E5B55' });
      lb.style.opacity = '0'; labs.push(lb);
      return {
        paths: out,
        late: labs,
        live(isCurrent) {                          // the helix turns
          const t0 = performance.now();
          const step = (t) => {
            if (!isCurrent()) return;
            const ph = (t - t0) / 1900;
            rungs.forEach((r, i) => {
              const k = (i + .6) / (pairs.length + .2), x = x0 + W * k;
              const a = cy + A * Math.sin(k * Math.PI * 2 * turns + ph);
              const b = cy + A * Math.sin(k * Math.PI * 2 * turns + ph + Math.PI);
              r.setAttribute('d', `M${x},${a}L${x},${b}`);
              r.style.strokeWidth = (.6 + Math.abs(a - b) / (A * 2) * 1.1).toFixed(2);
            });
            out[0].setAttribute('d', pathFor(k => cy + A * Math.sin(k * Math.PI * 2 * turns + ph)));
            out[1].setAttribute('d', pathFor(k => cy + A * Math.sin(k * Math.PI * 2 * turns + ph + Math.PI)));
            raf(step);
          };
          const pathFor = (f) => {
            let d = `M${x0},${f(0)}`;
            for (let i = 1; i <= 110; i++) { const k = i / 110; d += `L${x0 + W * k},${f(k)}`; }
            return d;
          };
          raf(step);
        },
      };
    },
  },
];

SLIDES.hall = {
  title: 'The room',
  build(sec) {
    const art = $('#hall-art', sec); art.innerHTML = '';
    const S = sec._hall = { turn: 0, host: null };

    const room = hallRoom(mk('g', {}, art));
    S.room = room;

    // the logo goes up on the board first
    const lg = mk('g', {}, art);
    const k = 0.40, w = 900 * k, h = 557 * k;
    lg.setAttribute('transform', `translate(${ICX - w / 2 - 177 * k},${ICY - h / 2}) scale(${k})`);
    S.logo = buildLogo(lg, { parts: ['mark', 'word'] });
    S.logoG = lg;

    S.stage = mk('g', {}, art);         // diagrams land here, one at a time

    const tabs = $('#hall-tabs', sec); tabs.innerHTML = '';
    S.tabs = BOARD.map((b, i) => {
      const t = document.createElement('button');
      t.className = 'tam-tab'; t.textContent = b.label;
      t.onclick = () => S.run(i);
      tabs.appendChild(t);
      return t;
    });
  },

  play(sec) {
    const S = sec._hall;
    drawAll(S.room.slow, { dur: 760, delay: 160, stagger: 52 });
    drawAll(S.room.quick, { dur: 420, delay: 420, stagger: 7 });

    const logoEnd = playLogo(S.logo, { delay: 1150, dur: 480, stagger: 34 });

    S.run = (i) => {
      S.turn++;
      const mine = S.turn;
      S.tabs.forEach((t, n) => t.classList.toggle('on', n === i));

      if (S.logoG && S.logoG.style.opacity !== '0') {
        S.logoG.style.transition = 'opacity .55s ease';
        S.logoG.style.opacity = '0';
      }
      const old = S.host;
      if (old) {
        old.style.transition = 'opacity .45s ease';
        old.style.opacity = '0';
        after(520, () => old.remove());
      }

      const g = mk('g', {}, S.stage);
      S.host = g;
      const r = BOARD[i].build(g);
      const end = drawAll(r.paths, { dur: 620, stagger: 26 });
      (r.late || []).forEach((t, n) => after(end - 120 + n * 130, () => {
        t.style.transition = 'opacity .5s ease'; t.style.opacity = '1';
      }));
      if (r.live) after(end - 40, () => { if (S.turn === mine) r.live(() => S.turn === mine); });

      if (!reduceMotion) after(5400, () => { if (S.turn === mine) S.run((i + 1) % BOARD.length); });
    };

    after(logoEnd + 900, () => S.run(0));
  },
};

/* ---------------------------------------------------- 4. DEMO --------- */
SLIDES.demo = {
  title: 'See it work',
  build(sec) {
    const g = $('#demo-art', sec);
    g.setAttribute('viewBox', '0 0 1440 810'); g.innerHTML = '';
    const S = sec._d = { rays: [], arcs: [] };
    const cx = 720, cy = 400;
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2 - Math.PI / 2;
      const r0 = 236 + (i % 3) * 16, r1 = r0 + 46 + (i % 4) * 24;
      S.rays.push(mk('path', {
        class: 's s-hair',
        d: `M${cx + r0 * Math.cos(a)},${cy + r0 * Math.sin(a)}L${cx + r1 * Math.cos(a)},${cy + r1 * Math.sin(a)}`,
      }, g));
    }
    [290, 330, 372].forEach((r, i) => {
      const sweep = 1.1 + i * .5, start = i * 2.2;
      const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start);
      const x2 = cx + r * Math.cos(start + sweep), y2 = cy + r * Math.sin(start + sweep);
      S.arcs.push(mk('path', {
        class: 's ' + (i === 1 ? 's-thin' : 's-hair'),
        d: `M${x1},${y1}A${r},${r} 0 0 1 ${x2},${y2}`,
      }, g));
    });
    S.under = mk('path', { class: 's', d: 'M520,556c62,-16 340,-16 400,2' }, g);
  },
  play(sec) {
    const S = sec._d;
    drawAll(S.rays, { dur: 520, stagger: 26 });
    drawAll(S.arcs, { dur: 1400, delay: 500, stagger: 200 });
    draw(S.under, { dur: 700, delay: 1500 });
    after(2000, () => {
      S.arcs.forEach((a, i) => loopDraw(a, 1800, 1400 + i * 300));
      every(2600, () => S.rays.forEach((r, i) => loopOnce(r, 520, i * 26)));
      // arcs rotate around the headline
      S.arcs.forEach((a, i) => {
        a.style.transformOrigin = '720px 400px';
        let ang = 0; const sp = (i % 2 ? -1 : 1) * (.05 + i * .02);
        const spin = () => { ang += sp; a.style.transform = `rotate(${ang}deg)`; raf(spin); };
        raf(spin);
      });
    });
  },
};

/* -------------------------------------------------- 5. WHY US --------- */
SLIDES.whyus = {
  title: 'Why us',
  build(sec) {
    const g = $('#team-art', sec); g.innerHTML = '';
    const S = sec._t = { rings: [], names: [], links: [] };
    const people = [
      [140, 96, 'V', 'Vivaan Grover', 'CHIEF EXECUTIVE'],
      [412, 96, 'J', 'Jackson Bizzell', 'CHIEF FINANCIAL'],
      [276, 252, 'K', 'Krish Sapovadia', 'CHIEF TECHNICAL'],
    ];
    people.forEach(([x, y, ini, name, role]) => {
      S.rings.push(mk('circle', { cx: x, cy: y, r: 44, class: 's' }, g));
      const a = txt(g, x, y + 10, ini, { size: 30, weight: 500, anchor: 'middle' });
      const b = txt(g, x, y + 68, name, { size: 17, weight: 500, anchor: 'middle' });
      const c = txt(g, x, y + 87, role, { size: 11, weight: 400, anchor: 'middle', fill: '#8F8B80', ls: '.18em' });
      [a, b, c].forEach(t => { t.style.opacity = '0'; t.style.transition = 'opacity .5s ease'; S.names.push(t); });
    });
    S.tri = mk('path', { class: 's s-thin', d: 'M184,96H368M383,129L305,219M247,219L169,129' }, g);
    // invisible spine: the travelling dot runs the whole loop, through each person
    S.triLoop = mk('path', { class: 's s-hair', d: 'M184,96H368L383,129L305,219L247,219L169,129Z' }, g);
    S.triLoop.style.opacity = '0';
    // the school
    S.drop = mk('path', { class: 's s-hair s-dash', d: 'M276,352v26' }, g);
    S.roof = mk('path', { class: 's', d: 'M212,412L276,378L340,412' }, g);
    S.bldg = mk('path', { class: 's', d: 'M224,412v54h104v-54M266,466v-28h20v28' }, g);
    S.win  = [
      mk('path', { class: 's s-thin', d: rr(240, 424, 24, 20, 2) }, g),
      mk('path', { class: 's s-thin', d: rr(288, 424, 24, 20, 2) }, g),
    ];
    S.cap = txt(g, 276, 496, 'All three at NCSSM, Durham', {
      size: 12, anchor: 'middle', fill: '#8F8B80',
    });
    S.cap.style.opacity = '0'; S.cap.style.transition = 'opacity .6s ease';
  },
  play(sec) {
    const S = sec._t;
    drawAll(S.rings, { dur: 760, stagger: 220 });
    S.rings.forEach((c, i) => fillAfter(c, '#F1EEE7', 880 + i * 220));
    S.names.forEach((t, i) => after(900 + i * 90, () => t.style.opacity = '1'));
    draw(S.tri, { dur: 900, delay: 1200 });
    drawAll([S.drop, S.roof, S.bldg, ...S.win], { dur: 460, delay: 1900, stagger: 120 });
    fillAfter(S.bldg, '#F6F4EF', 2500);
    after(2700, () => S.cap.style.opacity = '1');
  },
};
function blink(el, ms) {
  el.style.transition = 'opacity .5s ease';
  let on = true; every(ms, () => { on = !on; el.style.opacity = on ? '1' : '.18'; });
}

/* ============================================================
   NEW SECTIONS — every figure below comes from the CFO model.
   EDIT HERE: the numbers are gathered at the top of each block.
   ============================================================ */

const money = (v) =>
  v >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B'
: v >= 100e6 ? '$' + Math.round(v / 1e6) + 'M'
: v >= 1e6 ? '$' + (v / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M'
: v >= 1e3 ? '$' + Math.round(v / 1e3) + 'k'
: '$' + Math.round(v);
const commas = (n) => Math.round(n).toLocaleString('en-US');

/* ------------------------------------------------ 4. PRODUCT & MOAT --- */
SLIDES.product = {
  title: 'Product',
  build(sec) {
    const g = $('#pipe-art', sec); g.innerHTML = '';
    const S = sec._pd = { boxes: [], arrows: [], texts: [] };
    const T = (x, y, str, o) => { const e = txt(g, x, y, str, o); e.style.opacity = '0';
                                  e.style.transition = 'opacity .5s ease'; S.texts.push(e); return e; };

    const box = (x, y, w, h, { fill, bold, dashed } = {}) => {
      const p = mk('path', { class: 's' + (dashed ? ' s-dash' : ''), d: rr(x, y, w, h, 5) }, g);
      p.style.strokeWidth = bold ? '2.2' : '1.4';
      if (dashed) { p.style.stroke = '#8F8B80'; p._dashed = true; }
      p._fill = fill;
      S.boxes.push(p);
      return p;
    };

    const MID = 150, W = 196, H = 84;
    // the two agents, and what the teacher gives them
    const main = [
      [0,   'Teacher speaks', ''],
      [252, 'Instruction agent', 'decides what to make'],
      [504, 'Creation agent', 'makes it'],
    ];
    main.forEach(([x, a, b], i) => {
      box(x, MID - H / 2, W, H, { fill: i ? '#E7E3DA' : '#F6F4EF', bold: i > 0 });
      T(x + W / 2, MID + (b ? -4 : 6), a, { size: 16, weight: 500, anchor: 'middle' });
      if (b) T(x + W / 2, MID + 20, b, { size: 12.5, anchor: 'middle', fill: '#8F8B80' });
      if (i) S.arrows.push(arrow(g, x - 56 + 6, MID, x - 6, MID, 's s-thin'));
    });

    // three things the creation agent can produce
    const BX = 770, BW = 180, BH = 54;
    const rows = [[36, 'Text', false], [123, 'Images', false], [210, 'Live diagrams', true]];
    rows.forEach(([y, label, soon]) => {
      box(BX, y, BW, BH, { fill: soon ? null : '#F6F4EF', dashed: soon });
      T(BX + BW / 2, y + BH / 2 + 5, label, { size: 15.5, weight: soon ? 400 : 500,
                                              anchor: 'middle', fill: soon ? '#8F8B80' : '#000' });
      S.arrows.push(arrow(g, 700 + 8, MID, BX - 8, y + BH / 2, 's s-hair'));
      S.arrows.push(arrow(g, BX + BW + 8, y + BH / 2, 1046 - 8, MID, 's s-hair'));
    });
    T(BX + BW / 2, 210 + BH + 20, 'in development', { size: 12, anchor: 'middle', fill: '#8F8B80' });

    // and where it all lands
    box(1046, MID - H / 2, 210, H, { fill: '#E7E3DA', bold: true });
    T(1046 + 105, MID + 6, 'Class display', { size: 16, weight: 500, anchor: 'middle' });

    const cols = $('#moat-cols', sec); cols.innerHTML = '';
    [['One agent decides, one agent makes', 'The instruction agent picks the moment and the form'],
     ['Three ways to answer', 'Text and images today, live diagrams next'],
     ['Running on Gemini', 'Which is why cost per class hour is knowable']
    ].forEach(([h, p]) => {
      const d = document.createElement('div');
      d.style.cssText = 'flex:1';
      d.innerHTML = `<h3 class="rv" style="font-size:20px">${h}</h3>`
                  + `<p class="rv" style="color:var(--stone);margin-top:6px;font-size:15px">${p}</p>`;
      cols.appendChild(d);
    });
  },
  play(sec) {
    const S = sec._pd;
    S.boxes.forEach((b, i) => {
      draw(b, { dur: 560, delay: 140 + i * 150 });
      if (b._fill) fillAfter(b, b._fill, 720 + i * 150);
      // a not-yet-built output stays visibly dashed once its outline lands
      if (b._dashed) after(760 + i * 150, () => {
        b.style.transition = 'none';
        b.style.strokeDasharray = '7 6';
        b.style.strokeDashoffset = '0';
      });
    });
    S.arrows.forEach((pair, i) => drawAll(pair, { dur: 260, delay: 420 + i * 110, stagger: 55 }));
    S.texts.forEach((t, i) => after(560 + i * 80, () => t.style.opacity = '1'));
  },
};

/* --------------------------------------------------- 6. MARKET -------- */
/* EDIT HERE — the four expand stages, one set per pricing basis.
   `shade` names the per-state field the choropleth reads.              */
const TAM_MODES = {
  teacher: {
    label: 'Per teacher', unit: '$1,200 per teacher per year',
    stages: [
      { view: 'schools', layers: ['nc'], dots: true, shade: null, num: 1389600,
        tag: 'THE EIGHT SCHOOLS', label: 'Where we start',
        sub: 'Eight schools. 1,158 faculty. Triangle and Charlotte.' },
      { view: 'nc', layers: ['nc'], dots: true, shade: null, num: 16194000,
        tag: 'NORTH CAROLINA', label: 'One state',
        sub: '703 private schools. 13,495 teachers. All eight targets sit inside NCAIS.' },
      { view: 'us', layers: ['us'], dots: false, shade: 'priv', num: 579081600,
        tag: 'UNITED STATES', label: 'Conservative floor',
        sub: '29,728 private schools. 482,568 teachers. No district RFP to survive.' },
      { view: 'us', layers: ['us'], dots: false, shade: 'all', num: 4520000000,
        tag: 'EVERY SEGMENT', label: 'Ceiling',
        sub: 'Public K–12, 3.2M teachers. Higher ed, 3,717 sites. Tutoring, 10,323 centres.' },
    ],
  },
  school: {
    label: 'Per school', unit: 'School Pro at $9,600 a year',
    stages: [
      { view: 'schools', layers: ['nc'], dots: true, shade: null, num: 76800,
        tag: 'THE EIGHT SCHOOLS', label: 'Where we start',
        sub: 'Eight contracts at School Pro. These eight average 145 faculty, so most would land on Campus \u2014 this is the floor.' },
      { view: 'nc', layers: ['nc'], dots: true, shade: null, num: 6748800,
        tag: 'NORTH CAROLINA', label: 'One state',
        sub: '703 private schools. One contract each, not one licence per teacher.' },
      { view: 'us', layers: ['us'], dots: false, shade: 'privS', num: 285388800,
        tag: 'UNITED STATES', label: 'Conservative floor',
        sub: '29,728 private schools. Fewer contracts, bigger ones, and they renew.' },
      { view: 'us', layers: ['us'], dots: false, shade: 'allS', num: 1308892800,
        tag: 'EVERY SEGMENT', label: 'Ceiling',
        sub: '99,388 public schools. 3,717 higher-ed sites. 10,323 tutoring centres.' },
    ],
  },
};
const TAM_SRC = 'NCES PSS 2021–22 · CCD 2022–23 · IPEDS · Census CBP. '
              + 'Map shades the contiguous states.';

SLIDES.tam = {
  title: 'Market',
  build(sec) {
    const svg = $('#map', sec); svg.innerHTML = '';
    const S = sec._m = { stage: -1, shown: {}, k: 1, token: 0, mode: 'teacher' };
    S.cam = mk('g', {}, svg);
    S.gUS = mk('g', {}, S.cam);
    S.gCty = mk('g', {}, S.cam);
    S.gNC = mk('g', {}, S.cam);
    S.gDots = mk('g', {}, S.cam);

    S.us = USMAP.states.map(st => {
      const p = mk('path', { class: 's s-hair', d: st.d }, S.gUS);
      p._priv = st.priv; p._all = st.all; p._privS = st.privS || 0;
      p._allS = st.allS || 0; p._c = st.c;
      p.style.opacity = '0'; p.style.fill = 'none';
      p.style.transition = 'fill .8s ease, opacity .5s ease';
      return p;
    });
    S.cty = USMAP.counties.map(d => {
      const p = mk('path', { class: 's s-hair', d }, S.gCty);
      p.style.opacity = '0'; p.style.fill = 'none';
      return p;
    });
    S.nc = [mk('path', { class: 's', d: USMAP.nc }, S.gNC)];
    S.nc[0].style.opacity = '0'; S.nc[0].style.fill = 'none';

    S.dots = USMAP.schools.map(s => {
      const c = mk('circle', { cx: s.x, cy: s.y, r: 0, fill: '#000' }, S.gDots);
      c._s = s;
      c.style.transition = 'opacity .5s ease';
      c.style.opacity = '0';
      return c;
    });
    // the first target gets a ring and a name
    const da = USMAP.schools[0];
    S.ring = mk('circle', { cx: da.x, cy: da.y, r: 4, class: 's s-thin' }, S.gDots);
    S.ring.style.opacity = '0';
    S.label = txt(S.gDots, da.x, da.y, 'Durham Academy', { size: 13, weight: 500 });
    S.label.style.opacity = '0';
    S.label.style.transition = 'opacity .5s ease';
  },

  play(sec) {
    const S = sec._m;
    const numEl = $('#tam-num', sec), labEl = $('#tam-label', sec), subEl = $('#tam-sub', sec),
          tagEl = $('#tam-stage', sec), srcEl = $('#tam-src', sec), btn = $('#tam-expand', sec);

    const camera = (box, ms) => {
      const [x0, y0, x1, y1] = box, pad = 26;
      const k = Math.min((USMAP.w - pad * 2) / (x1 - x0), (USMAP.h - pad * 2) / (y1 - y0));
      const tx = USMAP.w / 2 - k * (x0 + x1) / 2, ty = USMAP.h / 2 - k * (y0 + y1) / 2;
      S.cam.style.transition = ms ? `transform ${ms}ms cubic-bezier(.62,.02,.2,1)` : 'none';
      S.cam.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`;
      S.k = k;
      return k;
    };

    // grayscale choropleth. BOTH stages are scaled against the all-segment
    // maximum, so widening the market visibly floods the map instead of just
    // reshuffling which state is darkest.
    // both stages of a basis scale against that basis's own maximum, so widening
    // the market floods the map instead of reshuffling which state is darkest
    const MAXOF = { priv: 'all', all: 'all', privS: 'allS', allS: 'allS' };
    const maxFor = f => Math.max(...S.us.map(p => p['_' + MAXOF[f]] || 0));
    const shade = (field) => {
      const mx = maxFor(field) || 1;
      S.us.forEach(p => {
        const t = Math.sqrt((p['_' + field] || 0) / mx);
        const l = Math.round(242 - t * 214);          // 242 (pale) -> 28 (near black)
        p.style.fill = `rgb(${l},${l},${l})`;
        p.style.stroke = '#FFFFFF';
        p.style.strokeWidth = '0.9';
      });
    };
    const unshade = () => S.us.forEach(p => {
      p.style.fill = 'none'; p.style.stroke = ''; p.style.strokeWidth = '';
    });

    const stagesNow = () => TAM_MODES[S.mode].stages;

    const setStage = (i, animate = true) => {
      const st = stagesNow()[i];
      if (!st || i === S.stage) return;
      const first = S.stage < 0, prev = S.stage;
      S.stage = i;
      const token = ++S.token;

      tagEl.textContent = st.tag;
      labEl.textContent = st.label;
      subEl.textContent = st.sub;
      srcEl.textContent = TAM_MODES[S.mode].unit + '. ' + TAM_SRC;
      [labEl, subEl, srcEl].forEach(el => {
        el.style.transition = 'none'; el.style.opacity = '0';
        raf(() => { el.style.transition = 'opacity .55s ease'; el.style.opacity = '1'; });
      });
      countTo(numEl, st.num, 1200, money, () => S.token);
      btn.innerHTML = i === stagesNow().length - 1
        ? 'Start over <span>&#8635;</span>' : 'Expand <span>&rarr;</span>';

      const ms = first ? 0 : [0, 1300, 1600, 900][i];
      const k = camera(USMAP.views[st.view], ms);

      // dots and rings must not grow with the zoom
      S.dots.forEach(d => d.setAttribute('r', (4.2 + Math.sqrt(d._s.f) / 2.4) / k));
      S.ring.setAttribute('r', (4.2 + Math.sqrt(USMAP.schools[0].f) / 2.4 + 6) / k);
      // the name must not grow with the zoom either
      const da2 = USMAP.schools[0];
      S.label.setAttribute('font-size', 13 / k);
      S.label.setAttribute('x', da2.x + 14 / k);
      S.label.setAttribute('y', da2.y - 12 / k);

      const reveal = (set, name, lead, per, stag) => {
        if (S.shown[name]) { set.forEach(p => p.style.opacity = name === 'us' ? '1' : (name === 'cty' ? '.55' : '1')); return; }
        S.shown[name] = true;
        set.forEach((p, n) => {
          after(lead + n * stag, () => {
            if (S.token !== token) return;
            p.style.opacity = name === 'cty' ? '.55' : '1';
          });
          draw(p, { dur: per, delay: lead + n * stag });
        });
      };

      if (st.layers.includes('nc')) {
        reveal(S.cty, 'cty', 260, 700, 9);
        reveal(S.nc, 'nc', 200, 1900);
      } else {
        S.cty.forEach(p => p.style.opacity = '0');
        S.nc.forEach(p => p.style.opacity = '0');
      }
      if (st.layers.includes('us')) {
        reveal(S.us, 'us', Math.max(0, ms - 700), 700, 20);
      } else {
        S.us.forEach(p => p.style.opacity = '0');
      }

      if (st.shade) after(first ? 0 : 400, () => { if (S.token === token) shade(st.shade); });
      else unshade();

      S.dots.forEach(d => d.style.opacity = st.dots ? '1' : '0');
      S.ring.style.opacity = st.dots ? '1' : '0';
      S.label.style.opacity = st.dots ? '1' : '0';
    };

    setStage(0, false);
    btn.onclick = () => setStage((S.stage + 1) % stagesNow().length);

    // switching the basis redraws the same stage on the other set of numbers
    $$('.tam-tab', sec).forEach(tab => {
      tab.onclick = () => {
        if (tab.dataset.mode === S.mode) return;
        $$('.tam-tab', sec).forEach(t => t.classList.toggle('on', t === tab));
        const at = Math.max(S.stage, 0);
        S.mode = tab.dataset.mode;
        S.stage = -1;
        setStage(at, false);
      };
    });

    // the first target keeps a pulse on it while we're zoomed in
    let t = 0;
    const beat = () => {
      t += .035;
      if (S.stage <= 1) {
        const base = (3 + Math.sqrt(USMAP.schools[0].f) / 3.2 + 5) / S.k;
        S.ring.setAttribute('r', base + Math.sin(t) * base * .22);
      }
      raf(beat);
    };
    raf(beat);
  },
};

/* ------------------------------------------- 7. BUSINESS MODEL -------- */
/* EDIT HERE — the plans, and what serving one costs.
   Teacher Pro is the way in; School Pro is the business.            */
const COGS_HR = 0.81;
const SCHOOL_ARR = 9600, SCHOOL_HRS = 2400, SCHOOL_ROOMS = 12, SCHOOL_DAYS = 180;
const SCHOOL_COST = SCHOOL_HRS * COGS_HR;                 // 1,944
const SCHOOL_GP   = SCHOOL_ARR - SCHOOL_COST;             // 7,656
const COGS = [['Speech-to-text', 0.39], ['Model inference', 0.40], ['Other', 0.02]];
const INK = '#1C1C1C', PALE = '#E7E3DA', SOFT = '#F4F2EC';

SLIDES.model = {
  title: 'Business model',
  build(sec) {
    const g = $('#bm-art', sec); g.innerHTML = '';
    const S = sec._bm = { shapes: [], fills: [], texts: [] };
    const T = (x, y, str, o) => { const e = txt(g, x, y, str, o); e.style.opacity = '0';
                                  e.style.transition = 'opacity .5s ease'; S.texts.push(e); return e; };

    /* --- the three plans --- */
    const COL = [0, 452, 904];
    [['$100', 'a month, one teacher', 'TEACHER PRO'],
     ['$9,600', 'a year, whole school', 'SCHOOL PRO'],
     ['Custom', 'multi-school districts', 'DISTRICT']
    ].forEach(([big, sub, tag], i) => {
      T(COL[i], 24, tag, { size: 11, weight: 500, ls: '.18em', fill: '#8F8B80' });
      T(COL[i], 84, big, { size: 62, weight: 500 });
      T(COL[i], 112, sub, { size: 15, fill: '#8F8B80' });
    });

    /* --- School Pro, with the cost sitting inside the price --- */
    const BX = 0, BY = 170, BH = 70, BW = 1256;
    const wCost = BW * SCHOOL_COST / SCHOOL_ARR;
    S.cost = mk('path', { class: 's', d: rr(BX, BY, wCost, BH, 5) }, g);
    S.profit = mk('path', { class: 's', d: rr(BX + wCost, BY, BW - wCost, BH, 5) }, g);
    [S.cost, S.profit].forEach(p => { p.style.strokeWidth = '2'; S.shapes.push(p); });
    S.fills.push([S.cost, INK], [S.profit, PALE]);

    T(BX + 18, BY - 16, 'COST TO SERVE', { size: 11, weight: 500, ls: '.18em', fill: '#8F8B80' });
    T(BX + wCost + 18, BY - 16, 'GROSS PROFIT · 80%', { size: 11, weight: 500, ls: '.18em', fill: '#8F8B80' });
    T(BX + 18, BY + 44, '$1,944', { size: 26, weight: 500, fill: '#FFFFFF' });
    T(BX + wCost + 18, BY + 44, '$7,656', { size: 26, weight: 500 });
    T(BX, BY + BH + 28,
      `Unlimited teacher accounts · 2,400 pooled live hours · admin, analytics and support `
      + `· $${(SCHOOL_ARR / SCHOOL_ROOMS / SCHOOL_DAYS).toFixed(2)} per classroom per school day`,
      { size: 15, fill: '#8F8B80' });
    T(BX, BY + BH + 52,
      'A school pays more per streamed hour than a teacher does, and gets the whole platform for it. '
      + 'Extra hours sell in 250-hour packs at $750, at 73% margin.',
      { size: 14, fill: '#8F8B80' });

    /* --- what one streamed hour is made of --- */
    const CY = 366, CH = 56;
    T(BX, CY - 18, '$0.81 per streamed class hour', { size: 18, weight: 500 });
    const total = COGS.reduce((acc, [, v]) => acc + v, 0);
    let x = BX;
    COGS.forEach(([name, v], i) => {
      const w = BW * v / total;
      const p = mk('path', { class: 's', d: rr(x, CY, w - (i < 2 ? 6 : 2), CH, 4) }, g);
      p.style.strokeWidth = i === 2 ? '1.2' : '1.8';
      S.shapes.push(p);
      S.fills.push([p, i === 2 ? SOFT : (i ? PALE : '#CFC9BC')]);
      const last = i === 2;
      T(last ? BX + BW : x + (w - 6) / 2, CY + CH + 26, `${name} · $${v.toFixed(2)}`,
        { size: 15, anchor: last ? 'end' : 'middle', fill: '#8F8B80' });
      x += w;
    });
  },
  play(sec) {
    const S = sec._bm;
    S.shapes.forEach((p, i) => draw(p, { dur: 820, delay: 200 + i * 200 }));
    S.fills.forEach(([p, c], i) => fillAfter(p, c, 900 + i * 200));
    S.texts.forEach((t, i) => after(420 + i * 85, () => t.style.opacity = '1'));
  },
};

/* split a label so no line is wider than the box it sits on */
function fitLines(str, maxW, size) {
  const per = size * 0.53;                       // ~advance width for Poppins
  const words = str.split(' '), out = [];
  let line = '';
  words.forEach(w => {
    const t = (line ? line + ' ' + w : w);
    if (t.length * per > maxW && line) { out.push(line); line = w; }
    else line = t;
  });
  if (line) out.push(line);
  return out;
}

/* text wrapping helper for SVG copy */
function wrapText(g, str, x, y, maxW, size, lh) {
  const words = str.split(' '), out = [];
  let line = '', ln = 0;
  const push = (s) => out.push(txt(g, x, y + ln++ * lh, s, { size, fill: '#8F8B80' }));
  const per = size * 0.52;
  words.forEach(w => {
    if ((line + ' ' + w).trim().length * per > maxW) { push(line); line = w; }
    else line = (line ? line + ' ' : '') + w;
  });
  if (line) push(line);
  return out;
}




/* ------------------------------------------------- EVIDENCE ----------- */


/* ---------------------------------------------------- VALUE ----------- */










/* ==========================================================
   WHERE THIS GOES — a staircase, so nothing crosses anything
   ========================================================== */
const STEPS = [
  'Better tech stack',
  'Take the classroom',
  'A model of our own',
  'Anywhere people explain things',
  'Every market that talks for a living',
];

SLIDES.vision = {
  title: 'Where this goes',
  build(sec) {
    const g = $('#vs-art', sec); g.innerHTML = '';
    const S = sec._vs = { treads: [], risers: [], texts: [] };
    const T = (x, y, str, o) => { const e = txt(g, x, y, str, o); e.style.opacity = '0';
                                  e.style.transition = 'opacity .5s ease'; S.texts.push(e); return e; };
    const TW = 232, RISE = 78, BASE = 432, X0 = 8;

    STEPS.forEach((label, i) => {
      const x = X0 + i * TW, y = BASE - i * RISE;
      const t = mk('path', { class: 's', d: `M${x},${y}h${TW}` }, g);
      t.style.strokeWidth = i === STEPS.length - 1 ? '3' : '2';
      S.treads.push(t);
      if (i) S.risers.push(mk('path', { class: 's s-hair', d: `M${x},${y}v${RISE}` }, g));
      const last = i === STEPS.length - 1;
      const size = last ? 19 : 17;
      // wrap onto the tread rather than letting a long label hang off the end
      const lines = fitLines(label, TW - 14, size);
      lines.forEach((ln, k) =>
        T(x + TW / 2, y - 16 - (lines.length - 1 - k) * (size + 5), ln,
          { size, weight: last ? 500 : 400, anchor: 'middle' }));
      T(x + TW / 2, y + 24, String(i + 1).padStart(2, '0'),
        { size: 11.5, weight: 500, ls: '.18em', anchor: 'middle', fill: '#8F8B80' });
    });
    // something that climbs them
    S.dot = mk('circle', { cx: X0, cy: BASE, r: 0, fill: '#000' }, g);
    S.dot.style.transition = 'r .4s ease';
    S.path = { TW, RISE, BASE, X0, n: STEPS.length };
  },
  play(sec) {
    const S = sec._vs, P = S.path;
    S.treads.forEach((t, i) => draw(t, { dur: 560, delay: 200 + i * 300 }));
    S.risers.forEach((r, i) => draw(r, { dur: 300, delay: 420 + i * 300 }));
    S.texts.forEach((t, i) => after(320 + i * 150, () => t.style.opacity = '1'));
    after(300, () => S.dot.setAttribute('r', 6));
    // walk the dot up, one step at a time, then hold at the top
    const t0 = performance.now(), per = 300, total = per * (P.n - 1) + 600;
    const climb = (now) => {
      const el = Math.min(now - t0, total);
      const k = Math.min(P.n - 1 + 0.999, el / per);
      const i = Math.floor(k), f = k - i;
      const x = P.X0 + (i + f) * P.TW;
      const y = P.BASE - i * P.RISE;
      S.dot.setAttribute('cx', x.toFixed(1));
      S.dot.setAttribute('cy', y.toFixed(1));
      if (el < total) raf(climb);
    };
    if (reduceMotion) climb(t0 + total); else after(500, () => raf(climb));
  },
};

/* ==========================================================
   WHY NOW — a fly on an escalator, and the cost of making a
   picture falling off a cliff. The point is doability.
   ========================================================== */
SLIDES.whynow = {
  title: 'Why now',
  build(sec) {
    /* ---------- left: the fly ---------- */
    const g = $('#wn-art', sec); g.innerHTML = '';
    const S = sec._wn = { steps: [], legs: [], parts: [], rdash: [] };

    const A = [172, 236], B = [560, 74];
    const dx = B[0] - A[0], dy = B[1] - A[1], LEN = Math.hypot(dx, dy);
    const ux = dx / LEN, uy = dy / LEN;
    const nx = uy, ny = -ux;

    const hOff = 74;
    S.glass = mk('path', { class: 's s-hair',
      d: `M${A[0]},${A[1]}L${B[0]},${B[1]}L${B[0] + nx * hOff},${B[1] + ny * hOff}`
       + `L${A[0] + nx * hOff},${A[1] + ny * hOff}Z` }, g);
    S.deck = mk('path', { class: 's', d: `M40,236H${A[0]}L${B[0]},${B[1]}H648` }, g);
    S.deck.style.strokeWidth = '2.4';
    S.rail = mk('path', { class: 's',
      d: `M50,${236 + ny * hOff}H${A[0] + nx * hOff}L${B[0] + nx * hOff},${B[1] + ny * hOff}H638` }, g);
    S.rail.style.strokeWidth = '1.8';
    S.floor = mk('path', { class: 's s-hair', d: 'M20,266H660' }, g);

    const NSTEP = 10, TREAD = 22;
    for (let i = 0; i < NSTEP; i++) {
      const p = mk('path', { class: 's s-thin', d: 'M0,0' }, g);
      p._t = i / NSTEP; S.steps.push(p);
    }
    for (let i = 0; i < 7; i++) {
      const p = mk('path', { class: 's s-hair', d: 'M0,0' }, g);
      p._t = i / 7; S.rdash.push(p);
    }

    const fly = mk('g', {}, g); S.fly = fly;
    const inner = mk('g', { transform: 'scale(1.25)' }, fly);
    S.flyScale = 1.25;
    const P = (el) => { S.parts.push(el); return el; };
    P(mk('path', { class: 's',
      d: 'M-11,-14C-26,-19 -46,-17 -55,-8C-63,0 -60,10 -49,15C-36,21 -18,18 -11,13Z' }, inner))
      .style.strokeWidth = '2.2';
    [-22, -31, -40].forEach(x => P(mk('path', { class: 's s-hair', d: `M${x},-16.5q3,16 0,32` }, inner)));
    P(mk('ellipse', { cx: 2, cy: 0, rx: 18, ry: 15, class: 's' }, inner)).style.strokeWidth = '2.2';
    P(mk('circle', { cx: 26, cy: -3, r: 12.5, class: 's' }, inner)).style.strokeWidth = '2.2';
    const eye = P(mk('ellipse', { cx: 30, cy: -5, rx: 7.5, ry: 8.5, class: 's' }, inner));
    eye.style.fill = '#1C1C1C';
    P(mk('path', { class: 's s-thin', d: 'M31,-13q6,-10 13,-9' }, inner));
    P(mk('path', { class: 's s-thin', d: 'M27,-15q2,-11 8,-13' }, inner));
    P(mk('path', { class: 's s-thin', d: 'M33,6q3,7 0,10' }, inner));

    S.wings = [];
    [[-3, -9, -26], [-6, -7, -14]].forEach(([wx, wy, tilt]) => {
      const wg = mk('g', {}, inner);
      const w = P(mk('path', { class: 's s-thin', d: 'M0,0c14,-9 38,-10 46,-3 6,6 -12,13 -25,12S-4,5 0,0Z' }, wg));
      w.style.fill = '#FFFFFF'; w.style.fillOpacity = '.82';
      [4, 9, 14].forEach(k => P(mk('path', { class: 's s-hair', d: `M6,${-2 + k * .2}q18,-${k},36,-${k * .4}` }, wg)));
      wg.setAttribute('transform', `translate(${wx},${wy}) rotate(${tilt})`);
      wg._x = wx; wg._y = wy; wg._tilt = tilt;
      S.wings.push(wg);
    });
    [[10, 10], [0, 12], [-12, 11]].forEach(([hx, hy], j) => {
      [1, -1].forEach((side, k) => {
        const femur = P(mk('path', { class: 's s-thin', d: 'M0,0' }, inner));
        const tibia = P(mk('path', { class: 's s-thin', d: 'M0,0' }, inner));
        femur.style.strokeWidth = '2';
        S.legs.push({ femur, tibia, hx, hy: hy * (side > 0 ? 1 : .82),
                      home: hx - 4, phase: ((j + (k ? 1 : 0)) % 2) * 0.5, side });
      });
    });
    S.geom = { A, dx, dy, nx, ny, ux, uy, TREAD, hOff, ang: Math.atan2(dy, dx) * 180 / Math.PI };

    /* ---------- right: the cost of a picture ---------- */
    const c = $('#wn-cost', sec); c.innerHTML = '';
    const C = sec._wnc = { pts: [], texts: [] };
    const T = (x, y, str, o) => { const e = txt(c, x, y, str, o); e.style.opacity = '0';
                                  e.style.transition = 'opacity .5s ease'; C.texts.push(e); return e; };
    const X0 = 40, X1 = 470, Y0 = 210, Y1 = 62;
    const COSTS = [[0, 60, '2021', '$60'], [.34, 20, '2022', '$20'],
                   [.74, 0.40, '2024', '$0.40'], [1, 0.06, 'now', '$0.06']];
    const lg = v => Math.log10(v);
    const py = v => Y1 + (lg(60) - lg(v)) / (lg(60) - lg(0.06)) * (Y0 - Y1);
    const px = f => X0 + f * (X1 - X0);

    C.axis = mk('path', { class: 's s-thin', d: `M${X0},${Y0 + 8}H${X1 + 14}` }, c);
    T(X0, 32, 'COST OF A MILLION TOKENS', { size: 10.5, weight: 500, ls: '.2em', fill: '#8F8B80' });

    let d = `M${px(COSTS[0][0])},${py(COSTS[0][1])}`;
    for (let i = 1; i < COSTS.length; i++) {
      const [f0, v0] = COSTS[i - 1], [f1, v1] = COSTS[i];
      const mxp = (px(f0) + px(f1)) / 2;
      d += `C${mxp},${py(v0)} ${mxp},${py(v1)} ${px(f1)},${py(v1)}`;
    }
    C.curve = mk('path', { class: 's', d }, c);
    C.curve.style.strokeWidth = '2.6';
    COSTS.forEach(([f, v, yr, lab], i) => {
      const dot = mk('circle', { cx: px(f), cy: py(v), r: 0, fill: '#000' }, c);
      dot.style.transition = 'r .4s cubic-bezier(.3,1.5,.4,1)';
      C.pts.push(dot);
      T(px(f) + (i === 3 ? -8 : 8), py(v) - 12, lab,
        { size: 15, weight: 500, anchor: i === 3 ? 'end' : 'start' });
      T(px(f), Y0 + 30, yr, { size: 12, anchor: i ? 'middle' : 'start', fill: '#8F8B80' });
    });
    T(X1 + 14, 96, '1,000×', { size: 46, weight: 500, anchor: 'end' });
    T(X1 + 14, 118, 'cheaper in three years', { size: 13, anchor: 'end', fill: '#8F8B80' });

    /* ---------- bullets ---------- */
    const b = $('#wn-bullets', sec); b.innerHTML = '';
    [['Under a second', 'A diagram lands before the sentence ends'],
     ['Typed output', 'Models return a spec we draw, not pixels we hope for'],
     ['$0.81', 'What an hour of live class costs us today']
    ].forEach(([hd, sub]) => {
      const d2 = document.createElement('div');
      d2.style.cssText = 'flex:1';
      d2.innerHTML = `<h3 class="rv" style="font-size:24px;font-weight:500">${hd}</h3>`
                   + `<p class="rv" style="color:var(--stone);margin-top:6px;font-size:15px">${sub}</p>`;
      b.appendChild(d2);
    });
  },

  play(sec) {
    const S = sec._wn, G = S.geom, C = sec._wnc;
    drawAll([S.floor, S.deck, S.rail, S.glass], { dur: 900, delay: 140, stagger: 140 });
    S.parts.forEach(p => { p.style.opacity = '0'; p.style.transition = 'opacity .6s ease'; });
    after(1150, () => S.parts.forEach(p => p.style.opacity = '1'));

    draw(C.axis, { dur: 800, delay: 300 });
    draw(C.curve, { dur: 2000, delay: 700 });
    C.pts.forEach((dot, i) => after(760 + i * 520, () => dot.setAttribute('r', 6)));
    C.texts.forEach((t, i) => after(520 + i * 110, () => t.style.opacity = '1'));

    const FOOT = 46, LIFT = 13, STRIDE = 22, RATE = 0.9, F1 = 17, F2 = 19;
    const t0 = performance.now();
    const tick = (now) => {
      const el = (now - t0) / 1000;
      S.steps.forEach(p => {
        const t = (p._t + el * 0.13) % 1;
        const x = G.A[0] + G.dx * t, y = G.A[1] + G.dy * t;
        p.setAttribute('d', `M${x.toFixed(1)},${y.toFixed(1)}`
          + `l${(G.nx * G.TREAD).toFixed(1)},${(G.ny * G.TREAD).toFixed(1)}`
          + `l${(G.ux * 22).toFixed(1)},${(G.uy * 22).toFixed(1)}`);
        p.style.opacity = (t < .04 || t > .96) ? '0' : '.9';
      });
      S.rdash.forEach(p => {
        const t = (p._t + el * 0.13) % 1;
        const x = G.A[0] + G.dx * t + G.nx * G.hOff, y = G.A[1] + G.dy * t + G.ny * G.hOff;
        p.setAttribute('d', `M${x.toFixed(1)},${y.toFixed(1)}l${(G.ux * 12).toFixed(1)},${(G.uy * 12).toFixed(1)}`);
      });
      const ft = 0.03 + ((el * 0.075) % 1) * 0.92;
      const rx = G.A[0] + G.dx * ft, ry = G.A[1] + G.dy * ft;
      const bob = Math.sin(el * RATE * 4 * Math.PI) * 1.6;
      const off = G.TREAD + 34 * S.flyScale + bob;
      S.fly.setAttribute('transform',
        `translate(${(rx + G.nx * off).toFixed(1)},${(ry + G.ny * off).toFixed(1)}) rotate(${G.ang.toFixed(1)})`);
      S.legs.forEach(L => {
        const p = (el * RATE + L.phase) % 1;
        let fx, fy;
        if (p < 0.62) { const k = p / 0.62; fx = L.home + STRIDE / 2 - STRIDE * k; fy = FOOT; }
        else { const k = (p - 0.62) / 0.38; fx = L.home - STRIDE / 2 + STRIDE * k;
               fy = FOOT - Math.sin(k * Math.PI) * LIFT; }
        let vx = fx - L.hx, vy = fy - L.hy, d = Math.hypot(vx, vy);
        const max = F1 + F2 - 0.4;
        if (d > max) { vx *= max / d; vy *= max / d; d = max; }
        const a = Math.atan2(vy, vx);
        const cosA = Math.max(-1, Math.min(1, (F1 * F1 + d * d - F2 * F2) / (2 * F1 * d)));
        const knee = a - Math.acos(cosA) * L.side;
        const kx = L.hx + F1 * Math.cos(knee), ky = L.hy + F1 * Math.sin(knee);
        L.femur.setAttribute('d', `M${L.hx},${L.hy}L${kx.toFixed(1)},${ky.toFixed(1)}`);
        L.tibia.setAttribute('d', `M${kx.toFixed(1)},${ky.toFixed(1)}L${(L.hx + vx).toFixed(1)},${(L.hy + vy).toFixed(1)}`);
      });
      S.wings.forEach((wg, i) => {
        const f = Math.sin(el * 46 + i * 1.7) * 21;
        wg.setAttribute('transform', `translate(${wg._x},${wg._y}) rotate(${wg._tilt + f})`);
      });
      raf(tick);
    };
    raf(tick);
  },
};







/* ==========================================================
   VALUE — the attention curve is the anchor; everything the
   product is worth hangs off it.
   ========================================================== */
SLIDES.value = {
  title: 'Value',
  build(sec) {
    const g = $('#val-art', sec); g.innerHTML = '';
    const S = sec._vl = { texts: [] };
    const T = (x, y, str, o) => { const e = txt(g, x, y, str, o); e.style.opacity = '0';
                                  e.style.transition = 'opacity .5s ease'; S.texts.push(e); return e; };
    const X0 = 40, X1 = 1160, Y0 = 232, TOP = 34;
    const px = m => X0 + (m / 50) * (X1 - X0);
    const py = a => Y0 - a * (Y0 - TOP);

    S.axis = mk('path', { class: 's s-thin', d: `M${X0},${Y0}H${X1 + 24}` }, g);
    T(X0, 22, 'ATTENTION', { size: 10.5, weight: 500, ls: '.2em', fill: '#8F8B80' });
    [0, 10, 20, 30, 40, 50].forEach(m =>
      T(px(m), Y0 + 24, m === 0 ? 'bell' : m + ' min', { size: 12, anchor: 'middle', fill: '#8F8B80' }));

    const plain = m => m < 10 ? 0.30 + 0.62 * (m / 10)
                              : 0.92 * Math.exp(-(m - 10) / 26) * (1 - 0.1 * Math.sin(m / 3));
    const withUs = m => {
      const base = m < 10 ? 0.30 + 0.62 * (m / 10) : 0.92;
      const since = m < 10 ? 0 : (m - 10) % 8;
      return Math.min(1, base * (0.995 - 0.16 * (since / 8)));
    };
    const line = (fn, step) => {
      let d = '';
      for (let m = 0; m <= 50; m += step)
        d += (d ? 'L' : 'M') + px(m).toFixed(1) + ',' + py(fn(m)).toFixed(1);
      return d;
    };
    const dPlain = line(plain, 0.5), dUs = line(withUs, 0.25);
    S.gap = mk('path', { d: dUs + 'L' + dPlain.slice(1).split('L').reverse().join('L') + 'Z',
                         fill: '#1C1C1C' }, g);
    S.gap.style.opacity = '0'; S.gap.style.transition = 'opacity 1.1s ease';
    S.plain = mk('path', { class: 's s-dash', d: dPlain }, g);
    S.plain.style.stroke = '#8F8B80';
    S.us = mk('path', { class: 's', d: dUs }, g);
    S.us.style.strokeWidth = '2.8';
    S.drop = mk('path', { class: 's s-hair', d: `M${px(10)},${TOP - 6}V${Y0}` }, g);
    T(px(10) + 12, TOP + 4, 'attention peaks, then slides', { size: 13, fill: '#8F8B80' });
    T(px(50) - 6, py(plain(50)) + 24, 'lecture alone', { size: 14, anchor: 'end', fill: '#8F8B80' });
    T(px(50) - 6, py(withUs(50)) - 14, 'with something to look at', { size: 15, weight: 500, anchor: 'end' });

    /* --- everything the gap is worth --- */
    const pts = $('#vl-points', sec); pts.innerHTML = '';
    [['The room stays with you', 'attention resets every few minutes instead of sliding away'],
     ['Five hours a week back', 'nothing to build the night before, nothing to click mid-class'],
     ['Seeing it is how it sticks', 'pictures alongside words beat words alone, and it shows up in scores'],
     ['Class stops feeling like a lecture', 'the board moves, so the room does']
    ].forEach(([hd, sub]) => {
      const d = document.createElement('div');
      d.style.cssText = 'flex:1';
      d.innerHTML = `<h3 class="rv" style="font-size:19px;font-weight:500;line-height:1.2">${hd}</h3>`
                  + `<p class="rv" style="color:var(--stone);margin-top:6px;font-size:14px;line-height:1.4">${sub}</p>`;
      pts.appendChild(d);
    });
  },
  play(sec) {
    const S = sec._vl;
    draw(S.axis, { dur: 900, delay: 160 });
    draw(S.plain, { dur: 1900, delay: 500 });
    draw(S.us, { dur: 1900, delay: 1100 });
    draw(S.drop, { dur: 500, delay: 900 });
    after(2600, () => S.gap.style.opacity = '.08');
    S.texts.forEach((t, i) => after(420 + i * 110, () => t.style.opacity = '1'));
  },
};

/* ==========================================================
   COMPETITION — two axes, and one empty corner.
   Funding figures are public rounds.
   ========================================================== */
const RIVALS = [
  [0.13, 0.20, 'MagicSchool', '$65M · 4M teachers'],
  [0.21, 0.07, 'Brisk',       '$15M · 1M teachers'],
  [0.35, 0.30, 'SchoolAI',    '$6M'],
  [0.66, 0.14, 'Khanmigo',    'free · student tutoring'],
  [0.11, 0.70, 'Canva, Gamma', 'decks, made early'],
  [0.30, 0.55, 'Curipod',     '$4M · slides, made early'],
];
const US_POS = [0.74, 0.88];

SLIDES.competition = {
  title: 'Competition',
  build(sec) {
    const g = $('#cp-art', sec); g.innerHTML = '';
    const S = sec._cp = { frame: [], dots: [], texts: [] };
    const T = (x, y, str, o) => { const e = txt(g, x, y, str, o); e.style.opacity = '0';
                                  e.style.transition = 'opacity .5s ease'; S.texts.push(e); return e; };
    const L = 150, R = 1120, TP = 40, B = 452;
    const PX = f => L + f * (R - L), PY = f => B - f * (B - TP);

    S.frame.push(mk('path', { class: 's s-hair', d: `M${L},${TP}V${B}H${R}` }, g));
    S.frame.push(mk('path', { class: 's s-hair', d: `M${L},${(TP + B) / 2}H${R}` }, g));
    S.frame.push(mk('path', { class: 's s-hair', d: `M${(L + R) / 2},${TP}V${B}` }, g));

    T(L, B + 32, 'works before class', { size: 14, fill: '#8F8B80' });
    T(R, B + 32, 'works during class', { size: 14, anchor: 'end', fill: '#8F8B80' });
    [['makes text', B - 64], ['makes visuals', TP + 64]].forEach(([str, yy]) => {
      const e = T(0, 0, str, { size: 14, anchor: 'middle', fill: '#8F8B80' });
      e.setAttribute('transform', `rotate(-90 ${L - 30} ${yy})`);
      e.setAttribute('x', L - 30); e.setAttribute('y', yy);
    });

    RIVALS.forEach(([fx, fy, name, note]) => {
      const x = PX(fx), y = PY(fy);
      const c = mk('circle', { cx: x, cy: y, r: 0, class: 's s-thin' }, g);
      c.style.fill = '#F1EEE7';
      c.style.transition = 'r .45s cubic-bezier(.3,1.5,.4,1)';
      S.dots.push(c);
      T(x + 18, y - 1, name, { size: 16 });
      T(x + 18, y + 19, note, { size: 12.5, fill: '#8F8B80' });
    });

    const ux = PX(US_POS[0]), uy = PY(US_POS[1]);
    S.halo = mk('circle', { cx: ux, cy: uy, r: 26, class: 's s-hair' }, g);
    S.halo.style.opacity = '0';
    S.us = mk('circle', { cx: ux, cy: uy, r: 0, class: 's' }, g);
    S.us.style.strokeWidth = '2.4'; S.us.style.fill = '#1C1C1C';
    S.us.style.transition = 'r .5s cubic-bezier(.3,1.6,.4,1)';
    T(ux + 28, uy + 6, 'Imagineer', { size: 23, weight: 500 });
    T(ux + 28, uy + 28, 'the only one in the room', { size: 13.5, fill: '#8F8B80' });
  },
  play(sec) {
    const S = sec._cp;
    drawAll(S.frame, { dur: 900, delay: 160, stagger: 170 });
    S.dots.forEach((c, i) => after(860 + i * 220, () => c.setAttribute('r', 9)));
    S.texts.forEach((t, i) => after(640 + i * 90, () => t.style.opacity = '1'));
    after(2300, () => {
      S.us.setAttribute('r', 13);
      S.halo.style.transition = 'opacity .6s ease'; S.halo.style.opacity = '1';
      let k = 0;
      const pulse = () => { k += .035; S.halo.setAttribute('r', 24 + Math.sin(k) * 7); raf(pulse); };
      raf(pulse);
    });
  },
};

/* ==========================================================
   GO TO MARKET — where we start, how it spreads, who we hire.
   ========================================================== */
const GTM_STAGES = [
  ['01', 'Private schools first',
   'One head of school signs. No district RFP, no procurement committee, no board vote. Eight named targets, all inside a morning’s drive.'],
  ['02', 'The room next door sells it',
   'It runs on a wall other teachers walk past all day. Every active classroom is a standing demo for the one beside it.'],
  ['03', 'Then outward',
   'NCAIS and its 98 member schools, then public districts once accounts and quotas are hardened, then higher ed.'],
];

SLIDES.gtm = {
  title: 'Go to market',
  build(sec) {
    const g = $('#gtm-art', sec); g.innerHTML = '';
    const S = sec._gt = { boxes: [], arrows: [], texts: [] };
    const T = (x, y, str, o) => { const e = txt(g, x, y, str, o); e.style.opacity = '0';
                                  e.style.transition = 'opacity .5s ease'; S.texts.push(e); return e; };
    const BW = 372, GAP = 70, X0 = (1256 - (3 * BW + 2 * GAP)) / 2, BY = 16, BH = 62;

    GTM_STAGES.forEach(([n, head, body], i) => {
      const x = X0 + i * (BW + GAP);
      const b = mk('path', { class: 's', d: rr(x, BY, BW, BH, 5) }, g);
      b.style.strokeWidth = i === 0 ? '2.4' : '1.5';
      b._fill = i === 0 ? '#E7E3DA' : '#F6F4EF';
      S.boxes.push(b);
      T(x + 20, BY + 26, n, { size: 11, weight: 500, ls: '.18em', fill: '#8F8B80' });
      T(x + 20, BY + 48, head, { size: 21, weight: 500 });
      wrapText(g, body, x + 20, BY + BH + 30, BW - 36, 14.5, 21).forEach(e => {
        e.style.opacity = '0'; e.style.transition = 'opacity .5s'; S.texts.push(e);
      });
      if (i) S.arrows.push(arrow(g, x - GAP + 14, BY + BH / 2, x - 14, BY + BH / 2, 's s-thin'));
    });

    /* --- who we hire, and when --- */
    const HY = 214;
    S.rule = mk('path', { class: 's s-hair', d: `M0,${HY}H1256` }, g);
    T(0, HY + 28, 'HIRING FOLLOWS THE REVENUE', { size: 11, weight: 500, ls: '.18em', fill: '#8F8B80' });
    [['Now', 'Three founders, equity only'],
     ['First contracts', 'One teacher-success hire'],
     ['~20 schools', 'A second engineer'],
     ['~50 schools', 'Someone who sells full time']
    ].forEach(([when, who], i) => {
      const x = i * 314;
      T(x, HY + 62, when, { size: 14, weight: 500 });
      T(x, HY + 84, who, { size: 13.5, fill: '#8F8B80' });
    });

    /* --- the corridor --- */
    const sp = $('#gtm-spread', sec); sp.innerHTML = '';
    const SP = sec._sp = { rooms: [], links: [] };
    const RW = 74, RH = 54, SGAP = 34;
    for (let i = 0; i < 6; i++) {
      const x = 10 + i * (RW + SGAP);
      const r = mk('path', { class: 's' + (i ? ' s-thin' : ''), d: rr(x, 30, RW, RH, 4) }, sp);
      if (!i) r.style.strokeWidth = '2.4';
      r._fill = '#1C1C1C'; r._i = i;
      SP.rooms.push(r);
      if (i) SP.links.push(mk('path', { class: 's s-hair', d: `M${x - SGAP + 4},57H${x - 4}` }, sp));
    }
  },
  play(sec) {
    const S = sec._gt, SP = sec._sp;
    S.boxes.forEach((b, i) => { draw(b, { dur: 640, delay: 180 + i * 260 });
                                fillAfter(b, b._fill, 780 + i * 260); });
    S.arrows.forEach((pair, i) => drawAll(pair, { dur: 260, delay: 520 + i * 260, stagger: 60 }));
    draw(S.rule, { dur: 1100, delay: 900 });
    S.texts.forEach((t, i) => after(460 + i * 70, () => t.style.opacity = '1'));

    SP.links.forEach((l, i) => draw(l, { dur: 340, delay: 900 + i * 330 }));
    const light = () => SP.rooms.forEach(r => {
      r.style.fill = r._fill; r.style.fillOpacity = '0';
      r.style.transition = 'fill-opacity .6s ease';
      after(600 + r._i * 330, () => r.style.fillOpacity = r._i ? '.16' : '1');
    });
    light();
    every(4200, () => { SP.rooms.forEach(r => r.style.fillOpacity = '0'); after(300, light); });
  },
};

/* ----------------------------------------------- 9. ROADMAP ----------- */
const ROADMAP = [
  ['AUGUST 2026', 'Beta prototype', '', ''],
  ['FALL 2026', 'Development finished, ready to beta test', '', ''],
  ['WINTER', 'Beta testing, improvements, customer acquisition', '', ''],
  ['EARLY SPRING 2027', 'First full in-classroom product', '', ''],
  ['FURTHER', 'Scale', '', ''],
];

SLIDES.roadmap = {
  title: 'Roadmap',
  build(sec) {
    const list = $('#rm-list', sec); list.innerHTML = '';
    sec._rules = [];
    ROADMAP.forEach(([when, head, state, body]) => {
      const d = document.createElement('div');
      d.style.cssText = 'padding:20px 0 20px 0;position:relative';
      d.innerHTML = `<div style="display:flex;align-items:baseline;gap:22px">`
        + `<div class="tiny rv" style="letter-spacing:.18em;width:172px;flex:none">${when}</div>`
        + `<h3 class="rv" style="font-size:22px;font-weight:400">${head}`
        + `</h3></div>`;
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 800 2');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.style.cssText = 'position:absolute;left:0;bottom:0;width:100%;height:2px';
      sec._rules.push(mk('path', { class: 's' + (state ? '' : ' s-hair'), d: 'M0,1H800' }, svg));
      d.appendChild(svg);
      list.appendChild(d);
    });
  },
  play(sec) {
    drawAll(sec._rules, { dur: 800, delay: 240, stagger: 190 });
  },
};

/* -------------------------------------------- 10. FINANCIALS ---------- */
/* EDIT HERE — use of funds and the three-year ramp */
const UOF = [
  ['Legal, entity & IP', 4100], ['Pilot & field testing', 2700], ['Team software', 2350],
  ['Contingency & other', 2400], ['Tech E&O + cyber insurance', 1200],
  ['Classroom mics & hardware', 1000], ['Teacher & pilot incentives', 1000],
  ['AI usage \u00b7 550 streaming hrs', 850],
];
const RAMP = [[8, 76800, 15552], [30, 288000, 58320], [100, 960000, 194400]];

SLIDES.financials = {
  title: 'Financials',
  build(sec) {
    const g = $('#uof-art', sec); g.innerHTML = '';
    const S = sec._fn = { bars: [], texts: [], proj: [], ptexts: [] };
    const max = UOF[0][1], BW = 252, X = 210;
    UOF.forEach(([name, v], i) => {
      const y = 6 + i * 32;
      const a = txt(g, 0, y + 13, name, { size: 12.5 });
      const b = txt(g, 540, y + 13, '$' + commas(v), { size: 12.5, weight: 500, anchor: 'end' });
      [a, b].forEach(e => { e.style.opacity = '0'; e.style.transition = 'opacity .5s'; S.texts.push(e); });
      const p = mk('path', { class: 's s-thin', d: rr(X, y + 2, Math.max(v / max * BW, 4), 14, 2) }, g);
      p.style.transformOrigin = `${X}px 0px`;
      p.style.fill = '#1C1C1C';
      S.bars.push(p);
    });
    const ry = 6 + UOF.length * 32 + 8;
    S.rule = mk('path', { class: 's s-hair', d: `M0,${ry}H540` }, g);
    const t1 = txt(g, 0, ry + 24, 'Total ask', { size: 14, weight: 500 });
    const t2 = txt(g, 540, ry + 24, '$15,600', { size: 18, weight: 500, anchor: 'end' });
    [t1, t2].forEach(e => { e.style.opacity = '0'; e.style.transition = 'opacity .5s'; S.texts.push(e); });

    // three-year view — teacher-licence scenario
    const pg = $('#proj-art', sec); pg.innerHTML = '';
    const W = 620, H = 306, BASE = 224, bw = 104, gap = 62;
    const x0 = (W - (3 * bw + 2 * gap)) / 2;
    const mx = RAMP[2][1];
    S.axis = mk('path', { class: 's s-thin', d: `M0,${BASE}H${W}` }, pg);
    RAMP.forEach(([units, rev, cogs], i) => {
      const x = x0 + i * (bw + gap);
      const h = (rev / mx) * 182, ch = (cogs / mx) * 182;
      const bar = mk('path', { class: 's', d: rr(x, BASE - h, bw, h, 4) }, pg);
      bar.style.strokeWidth = '2';
      bar.style.transformOrigin = `0px ${BASE}px`;
      bar._fill = '#E7E3DA';
      S.proj.push(bar);
      const cost = mk('path', { class: 's s-thin', d: rr(x, BASE - ch, bw, Math.max(ch, 6), 3) }, pg);
      cost.style.transformOrigin = `0px ${BASE}px`;
      cost._fill = '#1C1C1C';
      S.proj.push(cost);
      const a = txt(pg, x + bw / 2, BASE - h - 14, money(rev), { size: 17, weight: 500, anchor: 'middle' });
      const b = txt(pg, x + bw / 2, BASE + 22, 'Year ' + (i + 1), { size: 13, anchor: 'middle' });
      const c = txt(pg, x + bw / 2, BASE + 39, commas(units) + ' schools', { size: 11.5, anchor: 'middle', fill: '#8F8B80' });
      [a, b, c].forEach(e => { e.style.opacity = '0'; e.style.transition = 'opacity .5s'; S.ptexts.push(e); });
    });

  },
  play(sec) {
    const S = sec._fn;
    S.bars.forEach((p, i) => {
      p.style.transform = 'scaleX(0)'; p.style.transition = 'none'; p.getBoundingClientRect();
      after(300 + i * 110, () => {
        p.style.transition = `transform 760ms ${CSS_EASE}`;
        p.style.transform = 'scaleX(1)';
      });
    });
    S.texts.forEach((t, i) => after(340 + i * 60, () => t.style.opacity = '1'));
    draw(S.rule, { dur: 700, delay: 1250 });
    draw(S.axis, { dur: 900, delay: 300 });
    S.proj.forEach((p, i) => {
      p.style.transform = 'scaleY(0)'; p.style.transition = 'none'; p.getBoundingClientRect();
      after(700 + i * 170, () => {
        p.style.transition = `transform 880ms ${CSS_EASE}`;
        p.style.transform = 'scaleY(1)';
      });
      fillAfter(p, p._fill, 1400 + i * 170);
    });
    S.ptexts.forEach((t, i) => after(1100 + i * 90, () => t.style.opacity = '1'));
  },
};



/* ============================================================
   TRACTION — four counts. Only the last one needs filling in.
   ============================================================ */







/* ==========================================================
   WHO IS BEHIND US — each portrait is the real photograph
   traced to vector, drawn on band by band the way an artist
   blocks in tone: palest first, ink last.
   ========================================================== */
const PORTRAIT_TONES = ['#1C1C1C', '#8F8B80', '#E0DCD3'];

SLIDES.supports = {
  title: 'Who is behind us',
  build(sec) {
    const row = $('#sp-row', sec); row.innerHTML = '';
    const S = sec._sp2 = { bands: [] };

    PEOPLE.forEach((p, i) => {
      const col = document.createElement('div');
      col.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;text-align:center';

      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 300 300');
      svg.style.cssText = 'width:100%;max-width:236px;height:auto';
      col.appendChild(svg);

      // palest band sits at the back, ink on top
      for (let b = p.bands.length - 1; b >= 0; b--) {
        const path = mk('path', { d: p.bands[b], 'fill-rule': 'evenodd' }, svg);
        path.style.fill = PORTRAIT_TONES[b];
        path.style.fillOpacity = '0';
        path.style.stroke = PORTRAIT_TONES[b];
        path.style.strokeWidth = b === 0 ? '1' : '0.8';
        path.style.fillRule = 'evenodd';
        path._order = i * 3 + (p.bands.length - 1 - b);
        S.bands.push(path);
      }

      const cap = document.createElement('div');
      cap.style.cssText = 'margin-top:16px';
      cap.innerHTML = `<h3 class="rv" style="font-size:21px;font-weight:500">${p.name}</h3>`
        + `<p class="rv" style="font-size:14.5px;margin-top:5px">${p.role}</p>`
        + (p.note ? `<p class="rv" style="font-size:13px;color:var(--stone);margin-top:4px">${p.note}</p>` : '');
      col.appendChild(cap);
      row.appendChild(col);
    });
  },
  play(sec) {
    const S = sec._sp2;
    S.bands.forEach(p => {
      const at = 180 + p._order * 240;
      draw(p, { dur: 900, delay: at });                 // the outline gets drawn
      after(at + 620, () => {                           // then the tone fills in
        p.style.transition = 'fill-opacity 700ms ease, stroke-opacity 700ms ease';
        p.style.fillOpacity = '1';
        p.style.strokeOpacity = '0';
      });
    });
  },
};

/* ----------------------------------------------------- 12. ASK -------- */
SLIDES.ask = {
  title: 'What we need from you',
  build(sec) {
    const list = $('#ask-list', sec); list.innerHTML = '';
    const asks = [
      ['01', 'Consultative advice',
       'Who signs. When budgets open. How to price a pilot without anchoring ourselves low.',
       null],
      ['02', 'Your read on what we do next',
       'You have built and sold companies. We have not. Tell us what you would do.',
       null],
      ['03', 'An introduction to a venture fund',
       'A firm that has done this before.',
       null],
    ];
    sec._rules = [];
    asks.forEach(([n, h, p, ph]) => {
      const d = document.createElement('div');
      d.style.cssText = 'display:flex;gap:26px;padding:22px 0;position:relative';
      d.innerHTML = `
        <div class="tiny rv" style="flex:none;width:34px;padding-top:5px;letter-spacing:.2em">${n}</div>
        <div style="max-width:760px">
          <h3 class="rv" style="font-size:27px;font-weight:400">${h}</h3>
          <p class="rv" style="color:var(--stone);margin-top:7px">${p}</p>
          ${ph ? `<div class="rv" style="margin-top:11px"><span class="ph">${ph}</span></div>` : ''}
        </div>`;
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 800 2');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.style.cssText = 'position:absolute;left:0;bottom:0;width:100%;height:2px';
      sec._rules.push(mk('path', { class: 's s-hair', d: 'M0,1H800' }, svg));
      d.appendChild(svg);
      list.appendChild(d);
    });
    const ms = $('#ask-mark', sec);
    ms.setAttribute('viewBox', `0 0 ${LOGO.mark.w} ${LOGO.mark.h}`);
    sec._mark = buildLogo(ms, { parts: ['mark'] });
  },
  play(sec) {
    drawAll(sec._rules, { dur: 900, delay: 400, stagger: 260 });
    playLogo(sec._mark, { delay: 700, dur: 700, stagger: 120 });
  },
};


const def = SLIDES[slideId];
if (!def) return clearAll;
try {
  root.querySelectorAll('.rv.in').forEach(element => element.classList.remove('in'));
  def.build(root);
  $$('.rv', root).forEach((element, index) => {
    const delay = element.dataset.d != null ? Number(element.dataset.d) : 240 + index * 95;
    after(delay, () => element.classList.add('in'));
  });
  def.play(root);
} catch (error) {
  clearAll();
  throw error;
}
return clearAll;
}
