// main.js — two ways to play:
//
//  LEARN (guided)  pick a reference kolam → the app sings a short phrase while
//                  the next stretch of line glows → you hum it back and the
//                  line draws → at each gap you must point toward the glowing
//                  arrow to continue → ~9 phrases complete the kolam.
//  FREE            your finger steers, your voice is the flour (v0.3).
//
// URL switches: ?sym=none ?debug=1 ?tutorial=0 ?mode=free
import { Kolam, smoothLoop, SHAPES } from './kolam.js';
import { DrawEngine } from './pen.js';
import { Voice } from './voice.js';
import { Drone } from './drone.js';
import { Melody, SWARA, RATIO, Sand } from './music.js';
import { PATTERNS, planSections } from './patterns.js';
import { ColourLayer, PALETTE, colourFor } from './colour.js';
import { buildMotifKolam, PathEngine } from './motifs.js';
import { Tutorial } from './tutorial.js';
import { Ritual, TUNE } from './ritual.js';
import { COPY } from './content.js';
import { TestLog } from './log.js';

const log = new TestLog();
import * as R from './render.js';

const q = new URLSearchParams(location.search);
const CONFIG = {
  n: 5,
  symmetric: q.get('sym') !== 'none',
  tutorial: q.get('tutorial') !== '0' && !q.get('level'),   // the gesture warm-up (skip with ?tutorial=0)
  voice: q.get('voice') === '1' || q.get('mode') === 'free',  // the mic is only needed for the old voice modes
  freeSpeed: 2.4,      // segments / second while humming (free mode)
  guidedSpeed: 1.36,   // a section (3 segments) ≈ one 4-note phrase (2.2 s)
  section: 3,          // segments per sung phrase
  carryMs: 1500,       // learn mode: once you start singing, gaps this short don't stop the line
  carryFinish: 0.85,   // a stretch finishes in 85% of its phrase, so a late start still fits
};

// ---------- elements ----------
const $ = (id) => document.getElementById(id);
const canvas = $('stage'), ctx = canvas.getContext('2d');
const video = $('video');
const promptEl = $('prompt');

// ---------- state ----------
let kolam = new Kolam(CONFIG.n);
let engine = new DrawEngine(kolam, { symmetric: CONFIG.symmetric, speed: CONFIG.freeSpeed });

const S = {
  revealed: false,
  sweep: null,
  pointer: null, pointerSource: null, pointerSeen: 0,
  fingerNorm: null,
  fingerEverSeen: false,
  firstHumAt: 0,
  transient: null,
  started: false,   // permissions granted
  playing: false,   // drawing allowed (tutorial + picker done)
  hasVideo: false,
};
// guided-mode state
const G = { note: -1, sectionStart: 0, plan: [], waitSince: 0, mode: 'none', pattern: null, phase: 'idle', section: 0, guide: null, callStart: 0, callDur: 1, silentSince: 0, refLoops: null };

let view = { w: 0, h: 0, unit: 0, gx: 0, gy: 0, pip: { x: 14, y: 14, w: 200, h: 112 } };
let audioCtx, voice, drone, melody, sand, hands = null;
let colour = null;   // Level 3: the coloured-powder layer
let TH = null;       // the hand-only ritual (every level): sweep → dots → draw / colour

const tutorial = new Tutorial($('tutorial'), {
  onPass: (key, how) => log.append('timeline', `warm-up ${key}${how === 'skipped' ? ' skipped' : ' ✓'}`),
  onDone: (sum) => {
    if (sum) { log.set('warmup', sum.skipped ? `left at ${sum.skipped}` : sum.missed.length ? `done, skipped ${sum.missed.join(', ')}` : 'done'); log.set('warmup_s', sum.secs.toFixed(1)); log.set('warmup_times', sum.times); log.save(); }
    if (q.get('level')) { G.level = +q.get('level'); startRitual(G.level); } else if (q.get('mode') === 'free') startFree(); else if (!S.discovered) showDiscover(); else showPicker(); },
});

// ---------- layout ----------
function layout() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // the motif kolam (and colouring it) gets more room: its shapes are small
  const big = G.mode === 'motif' || (G.mode === 'colour' && S.base && S.base.thin < 1) || (G.mode === 'ritual' && G.level === 4);
  let side = Math.min(w * 0.9, h * (big ? 0.84 : 0.64));
  // while exploring on a wide screen, the step card sits on the right, so the kolam moves left
  const sheet = G.mode === 'explore' && w >= 900 ? 400 : 0;
  let gx = (w - sheet - side) / 2, gy = Math.max(48, (h - side) / 2 - h * 0.03);
  // you, in a small window in the corner (not behind the kolam)
  const aspect = video.videoWidth ? video.videoHeight / video.videoWidth : 9 / 16;
  const pw = Math.max(120, Math.min(220, w * 0.2));
  const pip = { x: 14, y: 14, w: pw, h: pw * aspect };
  if (gx < pip.x + pip.w + 10 && gy < pip.y + pip.h + 10) {      // narrow screens: move the kolam below it
    gy = pip.y + pip.h + 24; side = Math.min(side, h - gy - 150); gx = (w - sheet - side) / 2;
  }
  // the camera fills the screen (object-fit: cover) and becomes the surface
  const vw = video.videoWidth || 1280, vh = video.videoHeight || 720;
  const k = Math.max(w / vw, h / vh);
  const cover = { dw: vw * k, dh: vh * k, dx: (w - vw * k) / 2, dy: (h - vh * k) / 2 };
  view = { w, h, side, unit: side / kolam.W, gx, gy, cover, pip };
}
window.addEventListener('resize', layout);
video.addEventListener('loadedmetadata', layout);

// your fingertip in the camera → the same spot on screen, so the cursor sits
// right on your real finger in the camera surface
// the middle 60% of the camera covers the whole screen, so small hand moves are enough
const handToScreen = (p) => ({
  x: Math.min(1, Math.max(0, (p.x - 0.2) / 0.6)) * view.w,
  y: Math.min(1, Math.max(0, (p.y - 0.15) / 0.7)) * view.h,
});
const screenToLattice = (p) => [(p.x - view.gx) / view.unit, (p.y - view.gy) / view.unit];

function say(text, ms = 2600) { S.transient = { text, until: performance.now() + ms }; }

// ---------- modes ----------
const shapeOf = (p) => SHAPES[(p && p.shape) || 'square'];
function outlineLoops(state, shape = null) {
  const k = new Kolam(CONFIG.n, shape); k.load(state);
  return k.loops().map(lp => smoothLoop(lp, 8));
}

// which line (group) each section belongs to — found by quietly "playing"
// the lesson once with a perfect finger
// how long (in pen segments) each line of a kolam is, in the order it's drawn
function lineLengths(pattern, symmetric) {
  const k = new Kolam(CONFIG.n, shapeOf(pattern));
  const e = new DrawEngine(k, { symmetric, speed: 6, reference: pattern.state });
  e.begin(); const lens = []; let start = e.entered;
  for (let i = 0; i < 60000 && !e.complete; i++) {
    const up = e.waiting || e.upcoming();
    let f = null;
    if (up && !e.isBoundary(up.q)) { const o = e.refOut(up.q, up.d); f = [up.q[0] + o[0], up.q[1] + o[1]]; }
    const ev = e.advance(1 / 30, f, 0.5, 0.5);
    if (ev === 'lineClosed' || ev === 'complete') { lens.push(e.entered - start); if (ev === 'lineClosed') { e.beginNext(); start = e.entered; } }
  }
  return lens;
}
// split each line into stretches of about 4 segments, one sung phrase each;
// the lesson's phrases repeat, and the last stretch gets the long final Sa
function planByLines(pattern, symmetric) {
  if (symmetric && pattern.segments) return planSections(pattern.phrases, 0, pattern.segments);
  const segs = [];
  for (const L of lineLengths(pattern, symmetric)) {
    const n = Math.max(1, Math.round(L / 4));
    for (let i = 0; i < n; i++) segs.push(Math.round(L * (i + 1) / n) - Math.round(L * i / n));
  }
  const body = pattern.phrases.slice(0, -1), last = pattern.phrases[pattern.phrases.length - 1];
  return segs.map((sg, i) => ({ phrase: i === segs.length - 1 ? last : body[i % body.length], segs: sg }));
}

function sectionGroups(pattern, plan, symmetric = true) {
  const k = new Kolam(CONFIG.n, shapeOf(pattern));
  const e = new DrawEngine(k, { symmetric, speed: 4, reference: pattern.state });
  e.begin(); e.stopAfter = e.entered + plan[0].segs;
  const groups = [0]; let si = 0, line = 0;
  for (let i = 0; i < 60000 && !e.complete; i++) {
    const up = e.waiting || e.upcoming();
    let f = null;
    if (up && !e.isBoundary(up.q)) { const o = e.refOut(up.q, up.d); f = [up.q[0] + o[0], up.q[1] + o[1]]; }
    const ev = e.advance(1 / 30, f, 0.5, 0.5);
    if (ev === 'hold' || ev === 'lineClosed') {
      if (ev === 'lineClosed') { line++; e.beginNext(); }
      si++; groups.push(line); e.stopAfter = e.entered + plan[Math.min(si, plan.length - 1)].segs;
    }
  }
  return groups.slice(0, plan.length);
}

// the reference loops (and their symmetric partners) that the pen's
// current line will draw — lit up while placing the next line
function upcomingLoops() {
  const pen = engine.pen; if (!pen || !G.refLattice) return [];
  const p = pen.P[pen.P.length - 1], q = [p[0] + pen.d[0], p[1] + pen.d[1]];
  const out = new Set();
  for (let r = 0; r < engine.rotations; r++) {
    const a = engine.rotP(p, r) + '', b = engine.rotP(q, r) + '';
    G.refLattice.forEach((lp, i) => {
      for (let j = 0; j < lp.length; j++) {
        const u = lp[j] + '', v = lp[(j + 1) % lp.length] + '';
        if ((u === a && v === b) || (u === b && v === a)) { out.add(i); break; }
      }
    });
  }
  return [...out];
}

function startGuided(pattern, { symmetric = true } = {}) {
  setTimeout(layout, 0);
  G.mode = 'guided'; G.pattern = pattern; G.section = 0; G.phase = 'idle'; G.symmetric = symmetric;
  log.set('pattern', log.s.pattern ? log.s.pattern + ', ' + pattern.name : pattern.name);
  kolam = new Kolam(CONFIG.n, shapeOf(pattern));
  G.refLoops = outlineLoops(pattern.state, shapeOf(pattern));
  engine = new DrawEngine(kolam, { symmetric, speed: CONFIG.guidedSpeed, reference: pattern.state });
  engine.begin();
  engine.stopAfter = engine.entered;   // hold until the first call
  G.plan = planByLines(pattern, symmetric);
  G.groups = sectionGroups(pattern, G.plan, symmetric);
  G.lineCount = G.groups[G.groups.length - 1] + 1;
  G.line = 0; G.next = [];
  { const k = new Kolam(CONFIG.n, shapeOf(pattern)); k.load(pattern.state); G.refLattice = k.loops(); }
  S.revealed = false; S.playing = true;
  hidePicker(); hideReveal(); hideColourUI();
  setTimeout(() => startCall(), 700);
}

function startFree() {
  setTimeout(layout, 0);
  log.set('free_mode', 'yes');
  G.mode = 'free'; G.phase = 'idle'; G.refLoops = null; G.guide = null;
  kolam = new Kolam(CONFIG.n);
  engine = new DrawEngine(kolam, { symmetric: CONFIG.symmetric, speed: CONFIG.freeSpeed });
  S.revealed = false; S.playing = true;
  hidePicker(); hideReveal(); hideColourUI();
}

// call: the app sings, the next stretch of line glows
function startCall(replay = false) {
  if (G.mode !== 'guided' || engine.complete) return;
  if (!engine.pen) engine.beginNext();   // multi-line kolams: on to the next line
  const sec = G.plan[Math.min(G.section, G.plan.length - 1)];
  const phrase = sec.phrase;
  if (!replay) {
    engine.stopAfter = engine.entered + sec.segs;
    // draw speed matched to the phrase, so singing it back fills the stretch
    engine.speed = melody ? sec.segs / (melody.duration(phrase) * CONFIG.carryFinish) : CONFIG.guidedSpeed;
  }
  G.guide = engine.peek(Math.max(1, engine.stopAfter - engine.entered));
  G.phrase = phrase;
  if (!replay) G.sectionStart = engine.position;
  G.phase = 'call'; G.note = -1; G.started = false;
  G.callStart = performance.now();
  G.callDur = melody ? melody.play(phrase, (i) => { if (G.phase === 'call') G.note = i; }) : 2;
  const token = (G.token = Math.random());
  setTimeout(() => {
    if (G.token === token && G.mode === 'guided' && G.phase === 'call') {
      G.phase = 'response'; G.silentSince = performance.now();
    }
  }, G.callDur * 1000 + 150);
}

function totalSections() { return G.plan.length; }

// where each note of a phrase falls, as fractions of its stretch (by beats)
function noteSpans(phrase) {
  const total = phrase.reduce((a, [, b]) => a + b, 0);
  let acc = 0;
  return phrase.map(([, b]) => { const s = acc / total; acc += b; return [s, acc / total]; });
}

// ---------- finishing / sweeping ----------
function finish() {
  if (S.revealed) return;
  S.revealed = true; G.phase = 'done';
  if (G.mode === 'guided' || G.mode === 'motif') { log.set('completed', 'yes'); log.first('t_complete'); }
  markDone(G.level);
  // remember this kolam, so Level 3 can colour it
  if (G.mode !== 'colour') S.lastBase = { lines: engine.lines, rotations: engine.rotations, kolam, thin: G.mode === 'motif' ? 0.5 : 1, name: G.pattern ? G.pattern.name : 'your kolam',
                 photo: G.pattern && G.pattern.photo };
  const kind = G.mode === 'colour' ? 'colour' : G.mode === 'motif' ? 'motif' : G.mode === 'guided' ? 'dots' : 'free';
  setTimeout(() => showReveal(kind), 700);
}

function sweep(dir = 1) {
  if (!engine.started) return;
  S.sweep = { t0: performance.now(), dir, lines: engine.lines, rot: engine.rotations };
  const backToPath = G.mode !== 'free';
  engine.reset();
  S.revealed = false;
  hideReveal(); hideColourUI(); colour = null;
  if (backToPath) { G.mode = 'none'; G.phase = 'idle'; G.guide = null; G.refLoops = null; setTimeout(showPicker, 600); }
  else say(COPY.promptSwept, 3000);
}

// ---------- the path of levels (replaces the old pattern picker) ----------
const LOTUS = PATTERNS.find(p => p.photo);          // the real reference kolam
const doneSet = () => { try { return new Set(JSON.parse(localStorage.getItem('lp-done') || '[]')); } catch { return new Set(); } };
function markDone(level) {
  if (level == null) return;
  const d = doneSet(); d.add(level);
  try { localStorage.setItem('lp-done', JSON.stringify([...d])); } catch { /* no storage */ }
}

function startLevel(lv) {
  G.level = lv.id;
  hidePicker();
  // Level 1 opens with "see how it's built": dots, each line, the rules, symmetry
  if (lv.id === 1 && !S.explored) { startExplore(LOTUS, () => startRitual(1)); return; }
  startRitual(lv.id);
}

function showPicker() {
  S.playing = false; G.mode = 'none'; G.refLoops = null; G.guide = null;
  hideColourUI();
  const list = $('picker-list'), done = doneSet();
  list.innerHTML = '';
  COPY.levels.forEach((lv) => {
    const b = document.createElement('button');
    b.className = 'pick level' + (done.has(lv.id) ? ' done' : '');
    const thumb = document.createElement('div'); thumb.className = 'thumb';
    if (lv.img) { const im = document.createElement('img'); im.src = lv.img; im.alt = ''; thumb.appendChild(im); }
    else {
      const c = document.createElement('canvas'); c.width = 220; c.height = 275;
      drawThumb(c, lv.id === 5 ? [] : LOTUS.state, lv.id === 5 ? null : shapeOf(LOTUS), lv.id === 2);
      thumb.appendChild(c);
    }
    b.appendChild(thumb);
    const label = document.createElement('span');
    label.innerHTML = `<em>Level ${COPY.levels.indexOf(lv) + 1}</em><b>${lv.title}</b><small>${lv.line}</small>${done.has(lv.id) ? '<i>✓ drawn</i>' : ''}`;
    b.appendChild(label);
    b.onclick = () => startLevel(lv);
    list.appendChild(b);
  });
  $('picker').classList.add('show');
}
function hidePicker() { $('picker').classList.remove('show'); }
$('picker-free').onclick = () => startLevel(COPY.levels[4]);

function drawThumb(c, state, shape, quarters = false) {
  const g = c.getContext('2d'), k = new Kolam(CONFIG.n, shape), u = c.width * 0.86 / (k.W + 1), o = c.width * 0.07 + u / 2, oy = c.height - c.width * 0.93 + u / 2;
  g.fillStyle = '#5b2217'; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#f3eee3'; g.lineWidth = u * 0.13; g.lineJoin = g.lineCap = 'round';
  for (const lp of outlineLoops(state, shape)) {
    g.beginPath(); lp.forEach(([x, y], i) => (i ? g.lineTo(o + x * u, oy + y * u) : g.moveTo(o + x * u, oy + y * u))); g.stroke();
  }
  if (quarters) {   // Level 2: a hand drawing all four quarters
    g.strokeStyle = '#b4a8ff'; g.lineWidth = 2; g.setLineDash([4, 5]);
    g.beginPath(); const cy = oy - u / 2 + (k.W + 1) * u / 2; g.moveTo(c.width / 2, cy - c.width * 0.45); g.lineTo(c.width / 2, cy + c.width * 0.45); g.moveTo(c.width * 0.05, cy); g.lineTo(c.width * 0.95, cy); g.stroke();
    g.setLineDash([]);
  }
  g.fillStyle = '#f3eee3';
  for (const [x, y] of k.dots()) { g.beginPath(); g.arc(o + x * u, oy + y * u, u * 0.1, 0, Math.PI * 2); g.fill(); }
}

// ---------- discover: what a kolam is, before drawing ----------
let discoverGo = null;
function showDiscover(card = null, onGo = null) {
  S.playing = false;
  if (!card) S.discovered = true;
  const c = card || { place: COPY.discoverPlace, title: COPY.discoverTitle, body: COPY.discover, note: COPY.discoverNote,
                      sources: COPY.discoverSources, btn: COPY.discoverBtn, img: 'assets/lotus-kolam.jpg' };
  $('discover-img').src = c.img;
  $('discover-place').textContent = c.place || '';
  $('discover-title').textContent = c.title;
  $('discover-body').innerHTML = c.body.map(t => `<p>${t}</p>`).join('');
  $('discover-note').textContent = c.note || '';
  $('discover-sources').textContent = c.sources || '';
  $('discover-go').textContent = c.btn;
  // the kolam card leads into “see how it’s built”, then straight into Level 1
  discoverGo = onGo || (() => startLevel(COPY.levels[0]));
  $('discover').classList.add('show');
}
$('discover-go').onclick = () => { $('discover').classList.remove('show'); discoverGo(); };

// ---------- explore: see how the chosen kolam is built, step by step ----------
// steps: dots → each line (or group of rotated lines) → the rules → symmetry
const E = { steps: [], i: 0, t0: 0, pattern: null, loops: [], groups: [] };

function lineGroups(latt, rotP) {
  // loops that are rotations of each other belong to one "line" step
  const key = (lp) => lp.map(p => p + '').sort().join(';');
  const keys = latt.map(key), seen = new Set(), groups = [];
  latt.forEach((lp, i) => {
    if (seen.has(i)) return;
    const g = [i]; seen.add(i);
    for (let r = 1; r < 4; r++) {
      const k = key(lp.map(p => rotP(p, r)));
      const j = keys.indexOf(k);
      if (j >= 0 && !seen.has(j)) { g.push(j); seen.add(j); }
    }
    groups.push(g);
  });
  // outermost first: sort by the farthest point from the centre
  const c = CONFIG.n, far = (i) => Math.max(...latt[i].map(([x, y]) => Math.hypot(x - c, y - c)));
  return groups.sort((a, b) => far(b[0]) - far(a[0]));
}

function startExplore(pattern, then = null) {
  E.then = then; S.explored = true; log.append('timeline', 'how it’s built');
  hidePicker();
  S.playing = false;
  G.mode = 'explore'; G.pattern = pattern; G.phase = 'idle'; G.guide = null; G.refLoops = null;
  kolam = new Kolam(CONFIG.n, shapeOf(pattern));
  engine = new DrawEngine(kolam, { symmetric: true });
  const k = new Kolam(CONFIG.n, shapeOf(pattern)); k.load(pattern.state);
  const latt = k.loops();
  E.pattern = pattern;
  E.loops = latt.map(lp => smoothLoop(lp, 10));
  E.groups = lineGroups(latt, (p, r) => engine.rotP(p, r));
  const n = E.groups.length, texts = pattern.lineTexts || [];
  E.steps = [
    { kind: 'dots', title: COPY.exploreDots, text: pattern.dotsText || '' },
    ...E.groups.map((g, i) => ({ kind: 'line', upto: i, title: COPY.exploreLine(i + 1, n), text: texts[i] || COPY.exploreLineDefault })),
    { kind: 'rules', title: COPY.exploreRules, text: COPY.exploreRulesText, src: COPY.exploreRulesSource },
    { kind: 'sym', title: COPY.exploreSym, text: COPY.exploreSymText },
  ];
  E.i = 0; E.t0 = performance.now();
  layout();
  renderExplore();
  $('explore').classList.add('show');
}
function renderExplore() {
  const st = E.steps[E.i];
  $('explore-count').textContent = `${E.pattern.name} · ${E.i + 1} / ${E.steps.length}`;
  $('explore-title').textContent = st.title;
  $('explore-text').textContent = st.text;
  $('explore-src').textContent = st.src || '';
  $('explore-skip').textContent = COPY.exploreSkip;
  $('explore-back').textContent = COPY.exploreBack;
  $('explore-back').disabled = E.i === 0;
  $('explore-next').textContent = E.i === E.steps.length - 1 ? COPY.exploreGo : COPY.exploreNext;
}
function exploreGo(d) {
  const j = E.i + d;
  if (j >= E.steps.length) { exploreDone(false); return; }
  E.i = Math.max(0, j); E.t0 = performance.now(); renderExplore();
}
$('explore-next').onclick = () => exploreGo(1);
$('explore-back').onclick = () => exploreGo(-1);
$('explore-skip').onclick = () => exploreDone(true);
function exploreDone(skipped) {
  $('explore').classList.remove('show');
  log.set('explore', skipped ? `skipped at ${E.i + 1}/${E.steps.length}` : 'watched all');
  if (E.then) { const f = E.then; E.then = null; f(); } else startGuided(E.pattern);
}

function drawExplore(now, dt) {
  const st = E.steps[E.i], t = Math.max(0, (now - E.t0) / 1000);
  const c = CONFIG.n;
  // dots: appear one by one on the first step
  const dots = kolam.dots();
  if (st.kind === 'dots') {
    const shown = Math.min(dots.length, Math.floor(t / 0.12) + 1);
    const tmp = { dots: () => dots.slice(0, shown) };
    R.drawDots(ctx, view, tmp);
  } else R.drawDots(ctx, view, kolam);
  // lines drawn so far; the current one animates in, flour falling from its head
  let drawingNow = false;
  if (st.kind === 'line') {
    E.groups.forEach((g, gi) => {
      if (gi > st.upto) return;
      const f = gi < st.upto ? 1 : Math.min(1, t / 2.6);
      g.forEach(li => {
        const head = R.drawFlourPath(ctx, view, E.loops[li], f);
        if (f < 1) { R.sprinkleAt(head[0], head[1] - view.unit * 0.2, 0.7); drawingNow = true; }
      });
    });
  } else if (st.kind === 'rules') {
    E.loops.forEach(lp => R.drawFlourPath(ctx, view, lp, 1, 0.12, 0.85));
    R.drawRules(ctx, view, dots, E.loops, t);
  } else if (st.kind === 'sym') {
    R.drawSymmetry(ctx, view, E.loops, c, t);
  }
  if (sand) sand.set(drawingNow ? 0.06 : 0);
}

// ---------- Level 3 · festival colours ----------
// a finished white lotus kolam to colour, if nothing has been drawn yet
function autoBase() {
  const k = new Kolam(CONFIG.n, shapeOf(LOTUS));
  const e = new DrawEngine(k, { symmetric: true, speed: 6, reference: LOTUS.state });
  e.begin();
  for (let i = 0; i < 60000 && !e.complete; i++) {
    const up = e.waiting || e.upcoming();
    let f = null;
    if (up && !e.isBoundary(up.q)) { const o = e.refOut(up.q, up.d); f = [up.q[0] + o[0], up.q[1] + o[1]]; }
    const ev = e.advance(1 / 30, f, 0.35, 0.5);
    if (ev === 'lineClosed') e.beginNext();
  }
  return { lines: e.lines, rotations: 4, kolam: k, name: LOTUS.name, photo: LOTUS.photo };
}
function startColour(base) {
  setTimeout(layout, 0);
  G.mode = 'colour'; G.phase = 'idle'; G.refLoops = null; G.guide = null;
  if (!G.level || G.level === 1 || G.level === 2 || G.level === 4) G.colourFrom = G.level;
  G.level = 3;
  S.base = base; kolam = base.kolam;
  engine = { lines: [], rotations: base.rotations, started: true, complete: false, reset() {}, tip: () => null, progress: 0 };
  colour = new ColourLayer(kolam.W, 420, (base.thin || 1) < 1);
  colour.build(base.lines, base.rotations, CONFIG.n);
  G.colours = new Set(); G.regions = new Set(); G.lastPour = 0;
  G.ci = -1; G.hover = -1; G.filling = false; G.swatch = -1; G.swatchSince = 0; G.wasPinching = false; G.prog = new Map(); G.tune = null; G.noteAt = 0;
  S.revealed = false; S.playing = true;
  hidePicker(); hideReveal();
  $('colour-done').hidden = false; $('colour-done').textContent = COPY.colourDone;
  say(COPY.colourIntro, 6000);
}
function hideColourUI() { $('colour-done').hidden = true; }
$('colour-done').onclick = () => {
  $('colour-done').hidden = true;
  if (G.mode === 'ritual' && TH) { TH.finishColour(); TH.finishFree(); if (TH.phase === 'done' && !S.revealed) ritualFinished(); }
  else finish();
};

// ---------- "Did you know?" facts, shown now and then ----------
const facts = { left: [], until: 0, lastAt: 0 };
function showFact(force = false) {
  const now = performance.now();
  if (!force && (now < facts.until + 4000 || now - facts.lastAt < 20000)) return;   // not too often
  if (!facts.left.length) facts.left = COPY.facts.map((_, i) => i).sort(() => Math.random() - 0.5);
  $('fact-text').textContent = COPY.facts[facts.left.pop()];
  log.count('facts_shown');
  $('fact').classList.add('show');
  facts.lastAt = now; facts.until = now + 11000;
  clearTimeout(facts.timer); facts.timer = setTimeout(() => $('fact').classList.remove('show'), 11000);
}
function hideFact() { clearTimeout(facts.timer); $('fact').classList.remove('show'); facts.until = 0; }

// wave an open hand sideways to step through the colours (or click a swatch)
function cycleColour(dir = 1) {
  G.ci = (G.ci + (dir > 0 ? 1 : -1) + PALETTE.length) % PALETTE.length;
  G.colourFlash = performance.now();
  say(`${PALETTE[G.ci].name} ✓`, 900);
}
const HOLD_PICK = 0.7;   // seconds of pointing still on a colour to pick it up without pinching

// Level 3 works like real kolam powder: pick up a pinch of colour with your
// fingers, carry it to a shape, and sing to sprinkle it in. Each colour is a
// swara of Mayamalavagowla (indigo Sa · green Ri · turmeric Ga · saffron Ma ·
// red Pa · pink Da): you hear it when you pick the colour up, and the shape
// fills as you hum that note. Any octave counts. Off-note humming still fills,
// just slowly, with a nudge "a little higher / lower" — never a fail.
const SETTLE_MS = 400;     // finger must rest on a shape this long before powder drops
const SEMI_OK = 1.6;        // within this many semitones of the swara = in tune
const FILL_IN_TUNE = 1.0;   // seconds of in-tune humming to fill a shape
const FILL_OFF = 4.5;       // seconds if you're off the note
const COLOUR_SA = 138.59;   // the drone's Sa (C#3); the octave doesn't matter

function playSwara(ci) {
  if (!melody || ci < 0) return;
  melody.play([[ci, 2]]);
  G.noteAt = performance.now();
}
// distance (in semitones, -6..6) from the hummed pitch to the colour's swara, folded across octaves
function swaraOffset(pitch, ci) {
  const target = COLOUR_SA * RATIO[ci];
  let d = 12 * Math.log2(pitch / target);
  d = ((d % 12) + 18) % 12 - 6;
  return d;
}

function colourFrame(now, dt, finger, pointerFresh) {
  const c = CONFIG.n;
  const pinching = !!(hands && hands.present && hands.pinching);
  const pinchStart = pinching && !G.wasPinching;
  G.wasPinching = pinching;

  // 1 · pick up a colour: pinch on a swatch (or hold still on it, or click); you hear its swara
  let sw = -1;
  if (pointerFresh && S.pointer) R.paletteSpots(view, PALETTE.length).forEach((p, i) => {
    if (Math.hypot(S.pointer.x - p.x, S.pointer.y - p.y) < p.r * 1.8) sw = i;
  });
  if (sw !== G.swatch) { G.swatch = sw; G.swatchSince = now; }
  let ring = 0;
  if (sw >= 0 && (sw !== G.ci || pinchStart)) {
    ring = sw !== G.ci ? (now - G.swatchSince) / 1000 / HOLD_PICK : 0;
    if (pinchStart || ring >= 1 || S.clickFill) {
      const fresh = sw !== G.ci;
      G.ci = sw; G.colourFlash = now; ring = 0; S.clickFill = false;
      playSwara(sw);                                   // pinching the same colour again replays its note
      if (fresh) say(`${PALETTE[sw].name} · its note is ${SWARA[sw]} · hum it over a shape`, 2600);
      R.sprinkleAt(S.pointer.x, S.pointer.y, 1);
    }
  }

  // 2 · carry it to a shape and hum the swara to fill it (a click fills it at once)
  const hover = (sw < 0 && finger && pointerFresh && G.ci >= 0) ? colour.regionAt(finger[0], finger[1]) : -1;
  if (hover !== G.hover) { G.hover = hover; G.hoverSince = now; G.reminded = false; }
  // your finger has to settle on a shape (~0.4 s) before any powder drops,
  // so sliding across the kolam doesn't sprinkle everything on the way
  const settled = hover >= 0 && now - G.hoverSince > SETTLE_MS;
  // settled on a new empty shape: remind the note (not too often)
  if (settled && !G.reminded) {
    G.reminded = true;
    if ((G.prog.get(hover + ':' + G.ci) || 0) < 1 && now - G.noteAt > 2500 && !(voice && voice.active)) playSwara(G.ci);
  }
  // (ignore the app's own note for a moment after it plays, so it can't fill shapes by itself)
  const humming = voice && voice.active && voice.pitch > 0 && now - G.noteAt > 1200;
  G.filling = false; G.tune = null;
  const key = hover + ':' + G.ci;
  if (hover >= 0 && (G.prog.get(key) || 0) < 1) {
    let prog = G.prog.get(key) || 0;
    if (S.clickFill) prog = 1;
    else if (humming && settled) {
      const off = swaraOffset(voice.pitch, G.ci);
      const ok = Math.abs(off) <= SEMI_OK;
      G.tune = ok ? 0 : off < 0 ? 1 : -1;            // 1 = go higher, -1 = go lower
      prog += dt / (ok ? FILL_IN_TUNE : FILL_OFF);
      G.filling = true;
    }
    prog = Math.min(1, prog);
    G.prog.set(key, prog);
    if (prog > 0) {
      // a new colour poured over a shape replaces its old one
      PALETTE.forEach((_, i) => { if (i !== G.ci) G.prog.delete(hover + ':' + i); });
      colour.aim(finger[0], finger[1], G.ci);
      colour.fillTo(prog);
      if (!G.regions.has(hover)) { G.regions.add(hover); log.first('t_first_line'); }
      G.colours.add(G.ci); G.lastPour = now;
    }
    ring = Math.max(ring, prog);
  }
  S.clickFill = false;

  R.drawBackground(ctx, view, null);
  colour.draw(ctx, view);
  if (hover >= 0 && !G.filling) colour.drawPreview(ctx, view, hover, PALETTE[G.ci].hex, 0.25 + 0.12 * Math.sin(now * 0.008));
  R.drawLines(ctx, view, S.base.lines, S.base.rotations, c, { thin: S.base.thin || 1 });
  R.drawDots(ctx, view, kolam);
  R.drawPalette(ctx, view, PALETTE, G.ci, now - (G.colourFlash || 0), sw, SWARA);
  if (G.filling && S.pointer) R.sprinkleAt(S.pointer.x, S.pointer.y + 8, G.tune === 0 ? 1.2 : 0.4);
  R.drawMotes(ctx, dt);
  if (sand) sand.set(G.filling ? (G.tune === 0 ? 0.12 : 0.04) : 0);
  R.drawGrain(ctx, view);
  if (pointerFresh && S.pointer) {
    R.drawPowderCursor(ctx, S.pointer, G.ci >= 0 ? PALETTE[G.ci].hex : null, ring, pinching);
    if (G.ci >= 0 && hover >= 0) R.drawTuneHint(ctx, S.pointer, SWARA[G.ci], G.tune);
  }
  if (S.hasVideo) R.drawPip(ctx, view, video, S.fingerNorm);
  if (S.started) setPrompt(currentPrompt(now));
  updateMeter();
}

// ---------- the hand-only ritual: every level ----------
// 1 At the threshold  — lotus kolam, mirror: draw a quarter of each line, it appears four times
// 2 On your own       — the same kolam, every line drawn in full
// 3 Festival colours  — colour the kolam with powders from bowls
// 4 Beyond dots       — the flower & star kolam, motif by motif (mirrored)
// 5 Your own          — freehand on 25 dots, mirrored four ways
const lotusLoops = () => {
  const loops = outlineLoops(LOTUS.state, shapeOf(LOTUS));
  // biggest first: outer line, the corner line, then the centre circle
  const c = CONFIG.n, rad = (P) => Math.max(...P.map(([x, y]) => Math.hypot(x - c, y - c)));
  return loops.sort((a, b) => rad(b) - rad(a));
};
// evenly spaced points along a polyline, so the pen moves smoothly
function densify(P, step = 0.05) {
  const out = [P[0]];
  for (let i = 1; i < P.length; i++) {
    const [x0, y0] = P[i - 1], [x1, y1] = P[i], d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(d / step));
    for (let k = 1; k <= n; k++) out.push([x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]);
  }
  return out;
}
function motifGuides() {
  const def = buildMotifKolam(CONFIG.n), near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.2, out = [];
  for (const sec of def.sections) {
    const chain = [];
    for (const st of sec.strokes) {
      const last = chain[chain.length - 1];
      if (last && near(last[last.length - 1], st[0])) last.push(...st.slice(1));
      else if (last && near(last[last.length - 1], st[st.length - 1])) last.push(...st.slice().reverse().slice(1));
      else chain.push(st.slice());
    }
    const len = (P) => P.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - P[i][0], p[1] - P[i][1]), 0);
    chain.filter(pts => len(pts) > 0.15)          // skip single-point dabs
      .forEach((pts, i) => out.push({ pts: densify(pts), rot: 4, text: i === 0 ? COPY.ritual.motifSection(sec.label) : '' }));
  }
  return out;
}

function startRitual(id) {
  log.set('pattern', log.s.pattern ? log.s.pattern + ', L' + id : 'L' + id);
  if (q.get('pinch') === '0') TUNE.pinchToDraw = false;
  hideFact();
  hideColourUI(); hideReveal(); hidePicker();
  G.mode = 'ritual'; G.level = id; G.phase = 'idle'; G.pattern = LOTUS;
  let opts;
  if (id === 1 || id === 2) {
    kolam = new Kolam(CONFIG.n, shapeOf(LOTUS)); kolam.load(LOTUS.state);
    const loops = lotusLoops();
    const guides = loops.map((P, i) => id === 1
      ? { pts: P.slice(0, Math.round((P.length - 1) / 4) + 1), rot: 4, text: LOTUS.lineTexts[i] }
      : { pts: P, rot: 1, text: LOTUS.lineTexts[i] });
    opts = { kolam, dots: true, guides, leaves: id === 1 ? 14 : 8, dust: id === 1 ? 220 : 140 };
  } else if (id === 3) {
    kolam = new Kolam(CONFIG.n, shapeOf(LOTUS)); kolam.load(LOTUS.state);
    const base = S.lastBase && S.lastBase.thin === 1 ? S.lastBase : lotusBase();
    S.base = base;
    opts = { kolam, sweep: false, autoDots: true, colourBase: { lines: base.lines, rotations: base.rotations, whole: false } };
  } else if (id === 4) {
    kolam = new Kolam(CONFIG.n, () => false);
    G.pattern = { name: 'Flower & star kolam', photo: 'assets/motif-kolam.jpg' };
    opts = { kolam, guides: motifGuides(), thin: 0.5, leaves: 10, dust: 160 };
  } else {
    kolam = new Kolam(CONFIG.n, null);
    G.pattern = null;
    opts = { kolam, autoDots: true, free: true, leaves: 8, dust: 120 };
  }
  engine = new DrawEngine(new Kolam(CONFIG.n, null), { symmetric: false, speed: CONFIG.freeSpeed });
  layout();
  logPhaseEnd();
  TH = new Ritual(opts);
  logRitualStart();
  G.big = id === 4;
  S.playing = true; S.revealed = false;
  if (TH.phase === 'sweep') say(COPY.ritual.sweep, 6000);
  if (id === 3) { say(COPY.ritual.colour, 7000); showDoneBtn(COPY.colourDone); }
}
const lotusBase = () => ({ lines: lotusLoops().map(P => ({ samples: P.map(([x, y]) => ({ x, y, w: 0.5, h: 0.5 })), closed: true })),
  rotations: 1, kolam, thin: 1, name: LOTUS.name, photo: LOTUS.photo });
function showDoneBtn(text) { $('colour-done').hidden = false; $('colour-done').textContent = text; }

function ritualFinished() {
  hideFact();
  const id = G.level;
  logPhaseEnd();
  log.set('completed', 'yes'); log.first('t_complete');
  log.append('timeline', `L${id} ✓`);
  const done = new Set(String(log.s.levels_done || '').split(', ').filter(Boolean)); done.add('L' + id);
  log.set('levels_done', [...done].join(', '));
  log.save();
  markDone(id); S.revealed = true; hideColourUI();
  if (id === 1 || id === 2) {
    // the colour level colours this kolam, drawn as you drew it (mirrored lines expanded)
    const lines = [];
    for (const g of TH.guides) {
      const smp = g.drawn.length > 1 ? g.drawn : g.pts.map(([x, y]) => ({ x, y, w: 0.5, h: 0.5 }));
      for (let r = 0; r < g.rot; r++) lines.push({ samples: smp.map(p => { let q = [p.x, p.y]; for (let k = 0; k < r; k++) q = [2 * CONFIG.n - q[1], q[0]]; return { ...p, x: q[0], y: q[1] }; }), closed: false });
    }
    S.lastBase = { lines, rotations: 1, kolam, thin: 1, name: LOTUS.name, photo: LOTUS.photo };
  }
  let kind = 'dots';
  if (id === 3) { kind = 'colour'; G.regions = TH.regionsDone; G.colours = TH.coloursUsed; }
  if (id === 4) kind = 'motif';
  if (id === 5) kind = 'own';
  setTimeout(() => showReveal(kind), 900);
}

// ---------- test logging for the ritual (press L to see, N for the next tester) ----------
const PHASE_FIELD = { sweep: 'sweep_s', dots: 'dots_s', draw: 'draw_s', colour: 'colour_s', free: 'draw_s' };
const LG = { phase: null, start: 0, handT: 0, openT: 0, wasOff: false, wasHolding: false, saveT: 0 };
function logPhaseEnd() {
  if (!LG.phase || !TH) return;
  const secs = (performance.now() - LG.start) / 1000;
  if (PHASE_FIELD[LG.phase]) log.add(PHASE_FIELD[LG.phase], secs);
  if (['sweep', 'dots', 'draw', 'colour', 'free'].includes(LG.phase)) log.append('timeline', `L${G.level} ${LG.phase} ${secs.toFixed(0)}s`);
  LG.phase = null;
}
function logRitualStart() { LG.phase = TH.phase; LG.start = performance.now(); LG.wasOff = false; LG.wasHolding = false; }
function logRitualEvent(e) {
  if (e.type === 'phase') { logPhaseEnd(); if (e.phase !== 'done') { LG.phase = e.phase; LG.start = performance.now(); } log.save(); }
  if (e.type === 'pickup') { log.count('pickups'); log.count(e.pinch ? 'pickups_pinch' : 'pickups_hold'); }
  if (e.type === 'empty') log.count('flour_empty');
  if (e.type === 'dot') log.count(e.how === 'pinch' ? 'dots_pinch' : e.how === 'click' ? 'dots_click' : 'dots_hold');
  if (e.type === 'freeStart') { log.count('free_strokes'); log.first('t_first_line'); }
}
function logRitualFrame(dt, inp) {
  if (!log.active || !TH) return;
  if (TH.phase === 'sweep' && inp.hand) {
    LG.handT += dt; if (inp.open) LG.openT += dt;
    log.set('open_palm_pct', Math.round(100 * LG.openT / LG.handT));
  }
  const off = !!TH.offPath;
  if (off && !LG.wasOff) log.count('off_path');
  LG.wasOff = off;
  // letting go of the pinch in the middle of a line
  const holdingLine = TH.phase === 'draw' && TH.started && !!TH.holding;
  if (LG.wasHolding && !holdingLine && TH.phase === 'draw' && TH.started) log.count('pinch_breaks');
  LG.wasHolding = holdingLine;
  if (TH.phase === 'colour' && TH.filling) log.add(inp.rubbing ? 'colour_rub_s' : 'colour_pinch_s', dt);
  if (TH.regionsDone) log.set('shapes_coloured', Math.max(+log.s.shapes_coloured || 0, TH.regionsDone.size));
  LG.saveT += dt; if (LG.saveT > 5) { LG.saveT = 0; log.save(); }   // autosave every few seconds
}

function ritualFrame(now, dt, finger, pointerFresh) {
  // hand: pinch / open palm / rubbing from the tracker. Mouse: holding the
  // button counts as a pinch (so everything can be tried without a camera)
  const hand = S.pointerSource === 'hand' && !!(hands && hands.present);
  const pinching = hand ? !!hands.pinching : !!S.mouseDown;
  const inp = {
    hand, pinching,
    pinchStart: pinching && !G.wasPinching, pinchEnd: !pinching && G.wasPinching,
    open: hand && !!hands.openPalm, rubbing: hand ? !!hands.rubbing : !!S.mouseDown,
    click: false,
  };
  G.wasPinching = pinching;
  const pt = pointerFresh ? S.pointer : null;
  const evs = TH.update(dt, finger, pt, view, inp);
  S.ritualClick = false;
  logRitualFrame(dt, inp);
  for (const e of evs) {
    logRitualEvent(e);
    if (e.type === 'phase') {
      if (e.phase === 'water') { say(COPY.ritual.water, 2600); showFact(true); }
      if (e.phase === 'dots') say(COPY.ritual.dots(TH.marks.length), 7000);
      if (e.phase === 'draw') { showFact(true); say(TH.guides[0].rot === 4 ? COPY.ritual.drawMirror : COPY.ritual.draw, 7000); }
      if (e.phase === 'free') { say(COPY.ritual.free, 7000); showDoneBtn(COPY.ritual.freeDone); }
      if (e.phase === 'done') ritualFinished();
    }
    if (e.type === 'pickup') { G.puffUntil = now + 90; if (e.pinch) log.count('pinch_fills'); if (!G.pickedOnce) { G.pickedOnce = true; say(COPY.ritual.picked, 2600); } }
    if (e.type === 'empty') say(COPY.ritual.empty, 3500);
    if (e.type === 'dot') { G.puffUntil = now + 110; const [x, y] = R.L(view, e.x, e.y); for (let i = 0; i < 6; i++) R.sprinkleAt(x, y, 1); }
    if (e.type === 'lineStart') { log.first('t_first_line'); const t = TH.guides[e.line].text; if (t) say(t, 6000); }
    if (e.type === 'lineDone') {
      if (melody) melody.play([[0, 0.5], [4, 0.5], [7, 1]]);
      if (e.line + 1 >= e.of) say(COPY.ritual.allDone, 3000); else if (Math.random() < 0.5) showFact();
    }
  }
  // a fact now and then during the slower parts (laying dots, colouring, free drawing)
  if (['dots', 'colour', 'free'].includes(TH.phase) && TH.t > 6 && Math.random() < dt / 25) showFact();
  R.drawBackground(ctx, view, null);
  TH.draw(ctx, view, now);
  R.drawMotes(ctx, dt);
  if (sand) {
    const lvl = now < (G.puffUntil || 0) ? 0.16
      : TH.phase === 'sweep' && TH.sweeping ? Math.min(0.16, 0.03 + TH.speed * 0.015)
      : (TH.pulling || TH.filling) ? 0.035 : 0;
    sand.set(lvl);
  }
  R.drawGrain(ctx, view);
  if (pt) TH.drawCursor(ctx, view, pt);
  if (S.hasVideo) R.drawPip(ctx, view, video, S.fingerNorm);
  if (S.started) setPrompt(currentPrompt(now));
  updateMeter();
}

// ---------- Level 4 · beyond dots: a motif kolam drawn motif by motif ----------
function startMotif() {
  setTimeout(layout, 0);
  G.mode = 'motif'; G.level = 4; G.section = 0; G.phase = 'idle'; G.refLoops = null; G.guide = null; G.groups = null;
  kolam = new Kolam(CONFIG.n, () => false);          // no dots in this kolam
  const def = buildMotifKolam(CONFIG.n);
  engine = new PathEngine(def, CONFIG.n);
  const lesson = PATTERNS.find(p => p.lesson === 'Sarali varisai 2').phrases;
  G.plan = def.sections.map((sec, i) => ({ phrase: i === def.sections.length - 1 ? lesson[lesson.length - 1] : lesson[i % (lesson.length - 1)], segs: 0 }));
  G.pattern = { name: def.name, photo: 'assets/motif-kolam.jpg' };
  engine.begin(0);
  S.revealed = false; S.playing = true;
  hidePicker(); hideReveal(); hideColourUI();
  setTimeout(() => motifCall(), 700);
}
function motifCall(replay = false) {
  if (G.mode !== 'motif' || engine.complete) return;
  const phrase = G.plan[Math.min(G.section, G.plan.length - 1)].phrase;
  G.phrase = phrase;
  if (!replay) {
    engine.begin(G.section);
    // never faster than about 2.2 units a second: long motifs take longer than one phrase
    engine.speed = Math.min(2.2, engine.sectionLength(G.section) / (melody ? melody.duration(phrase) * CONFIG.carryFinish : 2));
  }
  G.guideStrokes = engine.guide();
  G.phase = 'call'; G.note = -1; G.started = false;
  G.callStart = performance.now();
  G.callDur = melody ? melody.play(phrase, (i) => { if (G.phase === 'call') G.note = i; }) : 2;
  const token = (G.token = Math.random());
  setTimeout(() => {
    if (G.token === token && G.mode === 'motif' && G.phase === 'call') { G.phase = 'response'; G.silentSince = performance.now(); }
  }, G.callDur * 1000 + 150);
}
function motifStep(now, dt) {
  // here the line only moves while you're actually singing (a short 0.6 s grace)
  if (voice.active || (G.started && now - G.lastVoice < 600)) {
    if (voice.active) { G.started = true; G.lastVoice = now; G.loud = voice.loud; G.pitch = voice.pitchT; }
    G.silentSince = now;
    log.first('t_first_line');
    const ev = engine.advance(dt, voice.active ? voice.loud : G.loud, voice.active ? voice.pitchT : G.pitch);
    if (ev === 'hold') {
      // a motif is finished: lift the pen and show where the next one starts
      const label = engine.kolam.sections[G.section].label;
      G.section++;
      G.phase = 'lineDone'; G.doneAt = now; G.doneLine = null;
      say(COPY.motifDone(label), 1500);
      setTimeout(() => {
        if (G.phase !== 'lineDone') return;
        engine.begin(G.section);
        G.phase = 'place'; G.placeSince = performance.now(); G.placeHeld = 0;
      }, 1100);
    }
    if (ev === 'complete') finish();
  } else if (now - G.silentSince > 6000) {
    motifCall(true); log.count('replays');
  }
}

// a picture of the finished kolam for the reflect card
function snapshot() {
  const pad = view.unit * 0.6, sx = view.gx - pad, sy = view.gy - pad, sz = view.side + pad * 2;
  const dpr = canvas.width / view.w;
  const out = document.createElement('canvas'); out.width = out.height = 360;
  const g = out.getContext('2d');
  g.fillStyle = R.SURFACE; g.fillRect(0, 0, 360, 360);
  g.drawImage(canvas, sx * dpr, sy * dpr, sz * dpr, sz * dpr, 0, 0, 360, 360);
  return out.toDataURL('image/jpeg', 0.9);
}

// ---------- reveal card ----------
function showReveal(kind) {
  const loops = kind === 'dots' || kind === 'free' ? kolam.loops().length : 0;
  const T = COPY.reveal[kind];
  $('reveal-title').textContent = kind === 'free' && loops === 1 ? COPY.revealTitle : T.title;
  $('reveal-body').textContent = kind === 'colour' ? T.body(G.regions.size, [...G.colours].map(i => PALETTE[i].name))
    : typeof T.body === 'function' ? T.body(loops) : T.body;
  $('reveal-more').innerHTML = COPY.revealMore.map(p => `<p>${p}</p>`).join('') + `<p class="note">${COPY.revealNote}</p>`;
  $('reveal-more').hidden = true;
  // just two ways on: the next level, or the menu (what's-a-kolam lives under ?)
  $('reveal-more-btn').hidden = true; $('reveal-colour').hidden = true;
  const next = COPY.levels.find(l => l.id === (G.level || 0) + 1);
  $('reveal-free').textContent = next ? `Next: ${next.title} →` : ''; $('reveal-free').hidden = !next;
  $('reveal-learn').textContent = COPY.revealLearn; $('reveal-learn').hidden = false;
  $('reveal-close').textContent = COPY.revealClose; $('reveal-close').hidden = !!next;
  // yours vs the real one
  const photo = (kind === 'colour' ? (S.base && S.base.photo) : G.pattern && G.pattern.photo) || null;
  const realPhoto = kind === 'colour' ? 'assets/colour-kolam.jpg' : photo;
  $('reveal-compare').hidden = kind === 'free';
  $('reveal-photo').hidden = !realPhoto;
  if (kind !== 'free') { $('reveal-yours').src = snapshot(); $('reveal-yours-cap').textContent = COPY.reflectYours; }
  if (realPhoto) { $('reveal-photo-img').src = realPhoto; $('reveal-photo-cap').textContent = kind === 'colour' ? COPY.reflectFestival : COPY.reflectReal; }
  $('reveal-rule').textContent = T.rule || '';
  $('reveal-sources').textContent = T.sources || '';
  $('reveal').classList.add('show');
}
function hideReveal() { $('reveal').classList.remove('show'); }
$('reveal-more-btn').onclick = () => {
  log.set('info_opened', 'yes'); $('reveal-more').hidden = false; $('reveal-more-btn').hidden = true; };
$('reveal-close').onclick = () => { hideReveal(); say(COPY.promptSweep, 5000); };
$('reveal-free').onclick = () => { hideReveal(); const next = COPY.levels.find(l => l.id === (G.level || 0) + 1); if (next) startLevel(next); };
$('reveal-colour').onclick = () => { hideReveal(); G.level = 3; startColour(S.lastBase); };
$('reveal-learn').onclick = () => { hideReveal(); showPicker(); };

// ---------- prompts ----------
function currentPrompt(now) {
  if (!S.playing || $('reveal').classList.contains('show')) return '';
  if (S.transient && now < S.transient.until) return S.transient.text;
  if (G.mode === 'ritual' && TH) {
    const inp = TH.inp || {};
    if (TH.phase === 'sweep') return inp.hand && !inp.open && TH.t > 3 ? COPY.ritual.sweepOpen : TH.t > 8 ? COPY.ritual.sweepNudge : '';
    if (TH.needsFlour && TH.supply <= 0) return TH.phase === 'colour' ? COPY.ritual.needColour : COPY.ritual.needFlour;
    if (TH.phase === 'dots') return (TH.dotTarget && inp.pinching ? COPY.ritual.dotsRelease : COPY.ritual.dotsPrompt) + ` · ${TH.placedCount} / ${TH.marks.length}`;
    if (TH.phase === 'draw') return TH.offPath ? COPY.ritual.offPath : !TH.started ? COPY.ritual.startPrompt : !TH.holding ? COPY.ritual.keepPinching : '';
    if (TH.phase === 'colour') return TH.powder < 0 ? COPY.ritual.needColour : COPY.ritual.colourPrompt;
    if (TH.phase === 'free') return COPY.ritual.freePrompt;
    return '';
  }
  if (G.mode === 'colour') return G.ci < 0 ? COPY.promptPickUp : now - (G.lastPour || 0) > 3500 ? COPY.promptColour : '';
  if (G.mode === 'guided' || G.mode === 'motif') {
    if (G.phase === 'call') return COPY.promptListen;
    if (G.phase === 'place') return COPY.promptPlace;
    if (G.phase === 'response') {
      if (engine.waiting) return COPY.promptPoint;
      if (!voice.active && G.section === 0) return COPY.promptHumBackFirst;
      // after the first phrase people know the rhythm: only nudge if they stay quiet
      if (!voice.active && now - G.silentSince > 2500) return COPY.promptHumBack;
    }
    return '';
  }
  if (!engine.started) return COPY.promptHum;
  if (engine.complete) return S.revealed ? COPY.promptSweep : '';
  if (!S.fingerEverSeen && now - S.firstHumAt > 2500) return COPY.promptFinger;
  if (!voice.active) return COPY.promptKeepHumming;
  return '';
}
let shownPrompt = null;
function setPrompt(text) {
  if (text === shownPrompt) return;
  shownPrompt = text;
  promptEl.classList.remove('show');
  setTimeout(() => { promptEl.textContent = text; if (text) promptEl.classList.add('show'); }, 180);
}

// ---------- listening meter ----------
function updateMeter() {
  const m = $('meter');
  if (!voice || !S.playing || G.mode === 'ritual') { m.classList.remove('show'); return; }
  m.classList.add('show');
  $('meter-fill').style.width = (voice.meter * 100).toFixed(1) + '%';
  m.classList.toggle('on', voice.active);
  $('meter-label').textContent = voice.active ? 'hearing you' : 'listening';
}

// ---------- input: mouse / touch / keyboard ----------
const pointerAt = (e) => {
  S.pointer = { x: e.clientX, y: e.clientY }; S.pointerSource = 'mouse'; S.pointerSeen = performance.now();
};
window.addEventListener('pointermove', (e) => { if (e.target === canvas || tutorial.active) pointerAt(e); });
canvas.addEventListener('pointerdown', (e) => { pointerAt(e); if (G.mode === 'colour') S.clickFill = true; if (TH) S.ritualClick = true; S.mouseDown = true; });
canvas.addEventListener('pointerup', () => { S.mouseDown = false; });
// the warm-up sits over the canvas: presses on it (not on its buttons) still count
$('tutorial').addEventListener('pointerdown', (e) => { if (!e.target.closest('button')) { pointerAt(e); S.mouseDown = true; } });
window.addEventListener('pointerup', () => { if (S.mouseDown && tutorial.active) tutorial.mouseUp(); S.mouseDown = false; });
canvas.addEventListener('pointerleave', () => { S.mouseDown = false; });
window.addEventListener('keydown', (e) => {
  if (!S.started) return;
  if (e.code === 'Space') {
    e.preventDefault();
    voice.fake = { loud: e.shiftKey ? 0.9 : 0.4, pitchT: e.altKey ? 0.9 : 0.35 };
  }
  if (e.key === 'c') sweep(1);
  if (e.key === 'Escape' || e.key === 'h') goHome();
  if (G.mode === 'colour' && (e.key === 'ArrowRight' || e.key === 'ArrowDown')) cycleColour(1);
  if (G.mode === 'colour' && (e.key === 'ArrowLeft' || e.key === 'ArrowUp')) cycleColour(-1);
  if (e.key === 'd') $('debug').hidden = !$('debug').hidden;
  if (e.key === 'l' || e.key === 'L') toggleLogPanel();
  if (e.key === 'n' || e.key === 'N') nextTester();
});
window.addEventListener('keyup', (e) => { if (e.code === 'Space' && voice) voice.fake = null; });

// the drone plays only while a lesson is running; ♪ mutes it altogether
$('btn-drone').onclick = () => { if (!S.started) return; S.droneMuted = !S.droneMuted; $('btn-drone').classList.toggle('off', S.droneMuted); };
function syncDrone() {
  if (!drone) return;
  const lesson = S.playing && !S.revealed && !tutorial.active && ['guided', 'motif', 'free', 'ritual'].includes(G.mode);
  const want = lesson && !S.droneMuted;
  if (want && !drone.on) drone.start();
  else if (!want && drone.on) drone.stop();
}
// ⌂ — stop everything and go back to the level path
function goHome(quiet = false) {
  if (!S.started) return;
  if (G.mode === 'ritual' && TH && !S.revealed) { logPhaseEnd(); log.append('timeline', `L${G.level} ⌂ left`); }
  if (!quiet) log.count('home_presses'); log.save();
  G.token = null; G.phase = 'idle';
  if (melody) melody.stop();
  if (tutorial.active) { tutorial.active = false; tutorial.root.classList.remove('show'); }
  ['reveal', 'discover', 'explore'].forEach((id) => $(id).classList.remove('show'));
  hideColourUI();
  kolam = new Kolam(CONFIG.n); engine = new DrawEngine(kolam, { symmetric: CONFIG.symmetric, speed: CONFIG.freeSpeed });
  colour = null; TH = null; S.revealed = false; G.mode = 'none'; hideFact();
  layout();
  showPicker();
}
$('btn-home').onclick = goHome;
$('btn-reset').onclick = () => { if (S.started) { hideReveal(); if (engine.started) sweep(1); else showPicker(); } };
$('btn-help').onclick = () => { if (!S.started) return; goHome(true); hidePicker(); tutorial.start(); };
$('btn-info').onclick = () => {
  log.set('info_opened', 'yes');
  showReveal(1);
  $('reveal-title').textContent = 'What’s a kolam?'; $('reveal-body').textContent = '';
  $('reveal-more').hidden = false; $('reveal-more-btn').hidden = true;
  $('reveal-free').hidden = $('reveal-learn').hidden = true;
  $('reveal-close').hidden = false; $('reveal-close').textContent = 'Back';
  $('reveal-compare').hidden = true; $('reveal-rule').textContent = ''; $('reveal-sources').textContent = '';
};

// ---------- test logging (L) and next tester (N) ----------
function nextTester() {
  logPhaseEnd();
  log.set('notes', $('log-notes').value || log.s.notes);
  log.save();
  location.reload();   // fresh start screen + intro for the next person
}
function renderLogPanel() {
  $('log-current').textContent = log.active ? log.text() : 'No session yet — press Begin.';
  $('log-notes').value = log.s.notes;
  $('log-count').textContent = `${TestLog.all().length} saved session(s) in this browser`;
}
function toggleLogPanel() {
  const p = $('logpanel');
  if (p.hidden) { renderLogPanel(); p.hidden = false; }
  else { log.set('notes', $('log-notes').value); log.save(); p.hidden = true; }
}
window.addEventListener('keydown', (e) => {
  if (S.started || e.target.tagName === 'TEXTAREA') return;   // after Begin, the main handler covers these
  if (e.key === 'l' || e.key === 'L') toggleLogPanel();
});
$('log-notes').addEventListener('keydown', (e) => e.stopPropagation());
$('log-notes').addEventListener('input', () => { log.set('notes', $('log-notes').value); log.save(); });
$('log-copy').onclick = async () => {
  log.save();
  try { await navigator.clipboard.writeText(log.text()); $('log-copy').textContent = 'Copied ✓'; }
  catch { $('log-copy').textContent = 'Select the text and copy'; }
  setTimeout(() => { $('log-copy').textContent = 'Copy this session'; }, 1600);
};
$('log-csv').onclick = () => {
  log.save();
  const blob = new Blob([TestLog.csv(TestLog.all())], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'living-pattern-tests.csv'; a.click();
};
$('log-next').onclick = () => nextTester();
$('log-close').onclick = () => toggleLogPanel();
$('log-clear').onclick = () => {
  if (confirm('Delete all saved test sessions in this browser?')) { TestLog.clear(); log.reset(); renderLogPanel(); }
};
window.addEventListener('beforeunload', () => { if (log.active) log.save(); });

// ---------- start ----------
$('start-title').textContent = COPY.startTitle;
$('start-sub').textContent = COPY.startSub;
$('start-btn').textContent = COPY.startBtn;
$('start-privacy').textContent = COPY.privacy;
$('picker-title').textContent = COPY.pickerTitle;
$('picker-sub').textContent = COPY.pickerSub;
$('picker-free').textContent = COPY.pickerFree;
if (q.get('debug') === '1') { $('debug').hidden = false; window.__lp = { get engine() { return engine; }, G, get view() { return view; }, finish: () => finish(), get colour() { return colour; }, get TH() { return TH; }, tutorial }; }

$('start-btn').onclick = async () => {
  $('start-btn').disabled = true;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  await audioCtx.resume();
  voice = new Voice(audioCtx);
  drone = new Drone(audioCtx);
  melody = new Melody(audioCtx);
  sand = new Sand(audioCtx);

  try {
    video.srcObject = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
    });
    await video.play();
    S.hasVideo = true;
    layout();
  } catch (err) { console.warn('camera unavailable', err); }

  if (CONFIG.voice) {
    try { await voice.start(); }
    catch (err) { console.warn('mic unavailable', err); say('no microphone — hold the space bar to “hum”', 6000); }
  }

  $('start').classList.add('hide');
  S.started = true;
  log.begin();
  if (CONFIG.tutorial) tutorial.start(); else tutorial.onDone();

  // hand tracking loads in the background while the hum step runs
  if (!S.hasVideo) { tutorial.handsFailed = true; log.set('hand_tracking', 'no camera'); return; }
  try {
    const { Hands } = await import('./hands.js');
    const h = new Hands();
    await h.init();
    h.onSwipe = (dir) => { log.count('swipes'); return tutorial.active ? tutorial.swiped() : G.mode === 'colour' ? cycleColour(dir) : sweep(dir); };
    hands = h;
    log.set('hand_tracking', 'ok');
    tutorial.handsReady = true;
  } catch (err) {
    console.warn('hand tracking failed', err);
    tutorial.handsFailed = true;
    log.set('hand_tracking', 'failed');
    say('hand tracking didn’t load — use your mouse or finger on the screen instead', 6000);
  }
};

// ---------- frame loop ----------
let last = performance.now(), fps = 60, fingerAlpha = 0;

function frameBody(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;

  syncDrone();
  // inputs
  if (S.started) {
    voice.update();
    if (hands) {
      hands.update(video, now);
      if (hands.present && hands.cursor) {
        S.fingerNorm = hands.cursor;
        S.pointer = handToScreen(hands.cursor); S.pointerSource = 'hand'; S.pointerSeen = now;
      } else S.fingerNorm = null;
    }
  }
  const pointerFresh = S.pointer && now - S.pointerSeen < (S.pointerSource === 'hand' ? 400 : 3000);
  if (pointerFresh && S.playing && engine.started) S.fingerEverSeen = true;
  if (S.started && tutorial.active) {
    const hand = S.pointerSource === 'hand' && !!(hands && hands.present);
    tutorial.update(dt, now, {
      hand, cursor: pointerFresh ? { x: S.pointer.x / view.w, y: S.pointer.y / view.h } : null,
      pinching: hand && !!hands.pinching, open: hand && !!hands.openPalm, rubbing: hand && !!hands.rubbing, mouseDown: !!S.mouseDown,
    });
  }
  const finger = pointerFresh ? screenToLattice(S.pointer) : null;

  if (G.mode === 'colour' && colour) { colourFrame(now, dt, finger, pointerFresh); return; }
  if (G.mode === 'ritual' && TH) { ritualFrame(now, dt, finger, pointerFresh); return; }
  if (S.playing && G.mode === 'motif' && G.phase === 'response') motifStep(now, dt);

  // --- learn mode: call → response
  if (S.playing && G.mode === 'guided' && G.phase === 'response') {
    if (engine.waiting) {
      // at a gap the line pauses: pointing the right way is enough (no need
      // to keep singing); stuck for a while → it shows you and moves on
      if (!G.waitSince) { G.waitSince = now; log.gapStart(); }
      engine.advance(0, finger, voice.loud, voice.pitchT);
      if (engine.waiting && now - G.waitSince > 5000) { engine.confirmWaiting(); log.count('auto_helps'); say(COPY.promptShown, 1800); }
      if (!engine.waiting) { G.waitSince = 0; G.silentSince = now; G.lastVoice = now; log.gapEnd(); }  // pointing keeps the stretch going
    } else if (voice.active || (G.started && now - G.lastVoice < CONFIG.carryMs)) {
      // your voice starts the stretch; the phrase carries it through the small
      // gaps between syllables, breaths, or a late start
      if (voice.active) { G.started = true; G.lastVoice = now; G.loud = voice.loud; G.pitch = voice.pitchT; }
      G.silentSince = now;
      log.first('t_first_line');
      const ev = engine.advance(dt, finger, voice.active ? voice.loud : G.loud, voice.active ? voice.pitchT : G.pitch);
      if (ev === 'hold') {
        G.phase = 'between'; G.section++;
        say(COPY.praise[G.section % COPY.praise.length], 900);
        setTimeout(() => startCall(), 800);
      }
      if (ev === 'lineClosed') {
        // a whole line is finished: celebrate it, lift the pen, show the next line
        G.section++; G.line++;
        G.phase = 'lineDone'; G.doneAt = now; G.doneLine = engine.lines[engine.lines.length - 1];
        say(COPY.lineDone(G.line, G.lineCount), 2200);
        setTimeout(() => {
          if (G.phase !== 'lineDone') return;
          engine.beginNext();
          G.next = upcomingLoops();
          G.phase = 'place'; G.placeSince = performance.now(); G.placeHeld = 0;
        }, 1300);
      }
      if (ev === 'complete') finish();
    } else if (now - G.silentSince > 6000) {
      startCall(true);   // quiet for a while → sing the phrase again
      log.count('replays');
    }
  }
  if (S.playing && (G.mode === 'guided' || G.mode === 'motif') && G.phase === 'place') {
    const tip = engine.tip();
    let near = false;
    if (tip && finger) for (let r = 0; r < engine.rotations; r++) {
      const t = engine.rotP(tip, r);
      if (Math.hypot(t[0] - finger[0], t[1] - finger[1]) < 0.9) near = true;
    }
    G.placeHeld = near ? G.placeHeld + dt : 0;
    if (G.placeHeld > 0.35 || now - G.placeSince > 4500) {
      G.phase = 'between'; G.next = [];
      if (G.placeHeld > 0.35) { say(COPY.placed, 900); log.count('placed_by_pointing'); } else log.count('placed_auto');
      setTimeout(() => { if (G.mode === 'motif') motifCall(); else if (G.mode === 'guided') startCall(); }, 500);
    }
  }
  // --- free mode: voice moves the pen; the finger steers it
  if (S.playing && G.mode === 'free' && voice.active && !engine.complete) {
    if (!engine.started) S.firstHumAt = now;
    log.first('t_first_line');
    const ev = engine.advance(dt, finger, voice.loud, voice.pitchT);
    if (ev === 'lineClosed') say(COPY.promptLineClosed, 3200);
    if (ev === 'complete') finish();
  }

  // --- draw
  const c = kolam.n, rots = engine.rotations;
  R.drawBackground(ctx, view, null);
  if (G.mode === 'explore') { R.drawMotes(ctx, dt); drawExplore(now, dt); R.drawGrain(ctx, view); if (S.hasVideo) R.drawPip(ctx, view, video, S.fingerNorm); setPrompt(''); updateMeter(); return; }
  if (G.refLoops) R.drawOutline(ctx, view, G.refLoops, G.phase === 'place' ? G.next : null, now);
  if (S.sweep) {
    const k = (now - S.sweep.t0) / 700;
    if (k >= 1) S.sweep = null;
    else {
      const edge = view.w * (S.sweep.dir > 0 ? k : 1 - k);
      const clip = S.sweep.dir > 0 ? [edge, 0, view.w - edge, view.h] : [0, 0, edge, view.h];
      R.drawLines(ctx, view, S.sweep.lines, S.sweep.rot, c, { clip });
    }
  }
  if (G.mode === 'guided' && G.guide && (G.phase === 'call' || G.phase === 'response')) {
    const frac = G.phase === 'call' ? Math.min(1, (now - G.callStart) / (G.callDur * 1000)) : 1;
    R.drawGuide(ctx, view, G.guide, frac, rots, c, now, G.phase === 'call');
  }
  if (G.mode === 'motif' && G.guideStrokes && (G.phase === 'call' || G.phase === 'response')) {
    // the next motif lights up stroke by stroke in time with the phrase
    const frac = G.phase === 'call' ? Math.min(1, (now - G.callStart) / (G.callDur * 1000)) : 1;
    const n = G.guideStrokes.length;
    G.guideStrokes.forEach((st, i) => {
      const f = Math.max(0, Math.min(1, frac * n - i));
      if (f > 0) R.drawGuide(ctx, view, st, f, rots, c, now, G.phase === 'call');
    });
  }
  R.drawLines(ctx, view, engine.lines, rots, c, { thin: G.mode === 'motif' ? 0.5 : 1, soften: G.mode === 'guided' && !engine.complete ? (engine.pen && engine.pen.line) || null : undefined });
  if (G.phase === 'lineDone' && G.doneLine) R.drawLineGlow(ctx, view, G.doneLine, rots, c, (now - G.doneAt) / 1300);
  R.drawDots(ctx, view, kolam);
  if (S.playing && G.mode === 'free' && !engine.started) R.drawStart(ctx, view, [0.5, c % 2 ? c + 0.5 : c + 1.5], rots, c, now);

  if (S.playing && G.mode === 'guided' && G.phase === 'response') {
    const up = engine.waiting || engine.upcoming();
    if (up && !engine.isBoundary(up.q)) {
      const ref = { s: engine.refState(up.q) };
      R.drawChoice(ctx, view, up, engine.options(up.q, up.d), ref, { pulse: now, ok: engine.fingerMatches(up.q, up.d, finger), guided: true });
    }
  } else if (S.playing && G.mode === 'free') {
    const up = engine.upcoming();
    if (up) R.drawChoice(ctx, view, up, engine.options(up.q, up.d), engine.bestOption(up.q, up.d, finger));
  }
  const tip = engine.tip();
  if ((G.mode === 'guided' || G.mode === 'motif') && G.phase === 'place' && tip) R.drawPlace(ctx, view, tip, rots, c, now, G.mode === 'motif' ? COPY.placeMotif : COPY.placeLabel);
  else R.drawTips(ctx, view, tip, rots, c, S.playing && voice && voice.active, voice ? voice.meter : 0);
  // flour falls from the pen while it's drawing, with a soft sandy sound
  const drawing = S.playing && voice && engine.pen && !engine.waiting &&
    (((G.mode === 'guided' || G.mode === 'motif') && G.phase === 'response' && (voice.active || (G.started && now - G.lastVoice < CONFIG.carryMs))) ||
     (G.mode === 'free' && voice.active));
  if (drawing) R.sprinkle(view, tip, rots, c, 0.55);
  R.drawMotes(ctx, dt);
  if (sand) sand.set(drawing ? 0.05 + 0.08 * (voice.active ? voice.loud : G.loud || 0.3) : 0);
  if ((G.mode === 'guided' || G.mode === 'motif') && S.playing) {
    R.drawSections(ctx, view, G.section, totalSections(), G.phase === 'call', G.groups);
    if (G.phrase && (G.phase === 'call' || G.phase === 'response')) {
      // which swara are we on? during the call: the note being played;
      // during your turn: how far the pen is through this section
      const spans = noteSpans(G.phrase), names = G.phrase.map(([d]) => SWARA[d]);
      let idx = G.note;
      if (G.phase === 'response') {
        const segs = G.plan[Math.min(G.section, G.plan.length - 1)].segs;
        const f = G.mode === 'motif' ? engine.sectionFrac() : (engine.position - G.sectionStart) / segs;
        idx = Math.max(0, spans.findIndex(([, e]) => f < e));
        if (f >= 1) idx = names.length - 1;
      }
      R.drawSwaras(ctx, view, names, idx, G.phase === 'call');
      if (G.guide && G.mode === 'guided') R.drawGuideSwaras(ctx, view, G.guide, names, idx, spans.map(([a, b]) => (a + b) / 2));
    }
  }
  R.drawGrain(ctx, view);

  fingerAlpha += (((pointerFresh && S.playing) ? 1 : 0) - fingerAlpha) * 0.2;
  R.drawFinger(ctx, view, S.pointer, tip && S.pointerSource === 'hand' ? R.L(view, tip[0], tip[1]) : null, fingerAlpha);
  if (S.hasVideo) R.drawPip(ctx, view, video, S.fingerNorm);

  if (S.started) setPrompt(currentPrompt(now));
  updateMeter();

  if (!$('debug').hidden && voice) {
    $('debug').textContent =
      `fps ${fps.toFixed(0)} | level ${voice.level.toFixed(3)} thr ${voice.threshold.toFixed(3)} ` +
      `${voice.active ? 'HUM' : '—'} | pitch ${voice.pitch.toFixed(0)}Hz → ${voice.pitchT.toFixed(2)} | ` +
      `hand ${hands ? (hands.present ? (hands.openPalm ? 'open' : 'yes') : 'no') : 'off'} | ` +
      `mode ${G.mode} ${G.phase} §${G.section} | drawn ${((engine.progress || 0) * 100).toFixed(0)}%`;
  }
}

// keep the loop alive even if one frame throws, so a test session never freezes
function frame(now) {
  try { frameBody(now); } catch (err) { console.error(err); }
  requestAnimationFrame(frame);
}

layout();
requestAnimationFrame(frame);
