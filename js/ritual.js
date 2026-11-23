// ritual.js — every level is the same doorstep ritual, done by hand:
//
//   sweep  → move your hand across the leaves and dust like a broom
//   water  → the ground is sprinkled so the flour holds (animation)
//   flour  → pinch rice flour from the bowl (or hold your finger in it);
//            it runs out as you work, and you go back for more
//   dots   → pinch over a mark and open your fingers: the dot drops
//   draw   → GUIDED: pinch at "start here" and, keeping the pinch, pull
//            the pen along the path. Flour only falls while your fingers
//            are together. The line only moves when your finger moves along it,
//            so it's your work, but it stays on the path (with a little of
//            your hand's wobble). Mirror levels: you draw one quarter and
//            it appears four times.
//   free   → your own: pinch and draw; the flour follows your finger, mirrored four ways
//   colour → coloured powders in bowls: pinch one up, then rub your thumb
//            against your fingertips over a shape to crumble it in
//   sweep uses an OPEN, flat hand as a wide broom (a pointing finger only nudges)
//
// All positions are in lattice units (dot coordinates), so it survives resizes.

import { L, FLOUR, flourPattern, drawLines, sprinkleAt } from './render.js';
import { ColourLayer, PALETTE } from './colour.js';

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const rot = (p, r, c) => { let q = p; for (let i = 0; i < r; i++) q = [2 * c - q[1], q[0]]; return q; };
const plen = (P) => { let s = 0; for (let i = 1; i < P.length; i++) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); return s; };

// ---- tuning (all easy to change) ----
export const TUNE = {
  broom: 1.7, broomFinger: 0.55, broomMouse: 1.3, broomMinSpeed: 1.2, // sweep reach: open hand / pointing finger / mouse; how fast to move
  dotHold: 1.2, dotReach: 0.65,            // drop a dot (hold = slow fallback if pinching doesn't register)
  startHold: 0.15, startReach: 0.6,        // pinch at "start here" to begin
  pinchToDraw: true,                       // flour only falls while pinching (false: just pull with your finger)
  pull: 0.8,                               // how close to the path your finger must be to pull the pen
  lookAhead: 3,                            // how far ahead (units) the pen can be pulled to in one go
  maxSpeed: 8,                             // units / s the pen can travel
  wobble: 0.1,                             // max personal wobble off the path (units)
  bowlHold: 0.6,                           // hold in the bowl to pick up (if pinch isn't used)
  flourPerPinch: 12,                       // units of line one pinch of flour draws
  dotCost: 0.04, shapeCost: 0.3,           // flour per dot / colour per shape
  fillTime: 0.9, pinchFill: 0.4,           // colour: rubbing fills a shape in this long; a plain pinch fills at this fraction of the speed
};

const LEAF_COLOURS = ['#8a6a2f', '#a07a35', '#6f7a3a', '#b58a3c', '#7d5a2a', '#94803f'];

export class Ritual {
  /**
   * opts: {
   *   kolam,                         // lattice size W (+ dots, if dots: true)
   *   dots: bool,                    // lay the pulli first
   *   guides: [{ pts, rot, text }],  // lines to pull, in order (rot 4 = mirrored quarter)
   *   free: bool,                    // freehand mirror drawing instead of guides
   *   colourBase: { lines, rotations, whole } // colour level
   *   leaves, dust                   // how messy the doorstep is
   * }
   */
  constructor(opts) {
    this.o = opts;
    this.kolam = opts.kolam;
    this.W = opts.kolam.W; this.c = this.W / 2;
    this.phases = opts.sweep === false ? [] : ['sweep', 'water'];
    if (opts.dots) this.phases.push('dots');
    if (opts.guides) this.phases.push('draw');
    if (opts.free) this.phases.push('free');
    if (opts.colourBase) this.phases.push('colour');
    this.phases.push('done');
    this.phase = this.phases[0]; this.t = 0; this.events = [];
    if (this.phase !== 'sweep') this.wet = 1;
    this.prev = null; this.vel = [0, 0]; this.speed = 0;

    // sweep
    const R0 = this.c + 1.6;
    this.debris = [];
    for (let i = 0; i < (opts.leaves ?? 14); i++) this.debris.push(this._item('leaf', R0));
    for (let i = 0; i < (opts.dust ?? 220); i++) this.debris.push(this._item('dust', R0));
    this.debrisTotal = this.debris.length; this.sweepR = R0 + 1.4;
    this.wet = this.wet || 0;

    // flour in your fingers (0..1) and which powder (-1 = rice flour)
    this.supply = 0; this.powder = -1; this.bowlHold = 0; this.bowlHover = null;

    // dots
    this.marks = (opts.dots || opts.autoDots) ? opts.kolam.dots().map(([x, y]) => ({ x, y, placed: opts.autoDots ? 1 : 0, hold: 0 })) : [];

    // guided drawing
    this.guides = (opts.guides || []).map(g => {
      const N = g.pts.length;
      return { ...g, rot: g.rot || 1, spu: (N - 1) / Math.max(1e-3, plen(g.pts)), drawn: [], idx: 0 };
    });
    this.line = 0; this.started = false; this.startHoldT = 0; this.farSince = 0; this.wob = [0, 0];

    // free drawing
    this.freeStrokes = []; this.freeCur = null; this.restT = 0;

    // colour
    if (opts.colourBase) {
      this.layer = new ColourLayer(this.W, 420, !!opts.colourBase.whole);
      this.layer.build(opts.colourBase.lines, opts.colourBase.rotations, this.c);
      this.prog = new Map(); this.hover = -1;
      this.coloursUsed = new Set(); this.regionsDone = new Set();
    }
  }

  _item(kind, R0) {
    const a = rand(0, TAU), d = Math.sqrt(Math.random()) * R0;
    return {
      kind, x: this.c + Math.cos(a) * d, y: this.c + Math.sin(a) * d, vx: 0, vy: 0, rot: rand(0, TAU), spin: 0, alpha: 1,
      size: kind === 'leaf' ? rand(0.4, 0.75) : rand(0.025, 0.07),
      col: kind === 'leaf' ? LEAF_COLOURS[(Math.random() * LEAF_COLOURS.length) | 0]
        : `rgba(${rand(110, 160) | 0},${rand(90, 125) | 0},${rand(60, 90) | 0},${rand(0.5, 0.9).toFixed(2)})`,
    };
  }
  emit(e) { this.events.push(e); }
  _next() {
    const i = this.phases.indexOf(this.phase);
    this.phase = this.phases[i + 1]; this.t = 0;
    this.emit({ type: 'phase', phase: this.phase });
  }
  get needsFlour() { return ['dots', 'draw', 'free', 'colour'].includes(this.phase); }

  // where the bowls sit (screen px), recomputed from the view each frame:
  // one bowl of rice flour, or a row of colour bowls, beside the kolam
  bowls(view) {
    const colour = this.phase === 'colour';
    const n = colour ? PALETTE.length : 1;
    const r = Math.max(26, Math.min(40, view.unit * 0.42));
    const gap = r * 2.5;
    let x = view.gx + view.side + Math.max(view.unit * 1.4, r * 2.2);
    if (x + r * 1.3 > view.w - 8) x = view.gx - Math.max(view.unit * 1.4, r * 2.2);
    const y0 = view.gy + view.side / 2 - (gap * (n - 1)) / 2;
    return Array.from({ length: n }, (_, i) => ({ x, y: y0 + i * gap, r, powder: colour ? i : -1 }));
  }

  // ---------- update ----------
  // finger: [x, y] lattice or null · pt: screen point
  // inp: { hand, pinching, pinchStart, pinchEnd, open, rubbing, click }
  //      (with a mouse, holding the button counts as pinching)
  update(dt, finger, pt, view, inp = {}) {
    this.inp = inp;
    const pinch = !!inp.pinchStart, click = !!inp.click;
    this.t += dt; this.events = []; this.wantFlour = false; this.view = view;
    if (finger && this.prev && dt > 0) {
      const vx = (finger[0] - this.prev[0]) / dt, vy = (finger[1] - this.prev[1]) / dt;
      this.vel = [this.vel[0] + (vx - this.vel[0]) * 0.5, this.vel[1] + (vy - this.vel[1]) * 0.5];
    } else this.vel = [this.vel[0] * 0.8, this.vel[1] * 0.8];
    this.speed = Math.hypot(...this.vel); this.prev = finger;

    // the bowl: pinch (or hold) to pick up a fresh pinch of powder
    this.bowlHover = null;
    if (this.needsFlour && pt) {
      for (const b of this.bowls(view)) if (Math.hypot(pt.x - b.x, pt.y - b.y) < b.r * 1.35) this.bowlHover = b.powder;
    }
    const inBowl = this.bowlHover !== null;
    if (inBowl) {
      const p = this.phase === 'colour' ? this.bowlHover : -1;
      const fresh = this.supply < 0.98 || p !== this.powder;
      this.bowlHold = fresh ? this.bowlHold + dt : 0;
      if (fresh && (pinch || click || this.bowlHold >= TUNE.bowlHold)) {
        this.supply = 1; this.powder = p; this.bowlHold = 0;
        this.emit({ type: 'pickup', powder: p, pinch: pinch && !!inp.hand });
      }
    } else this.bowlHold = 0;

    switch (this.phase) {
      case 'sweep': this._sweep(dt, finger, inp); break;
      case 'water': this.wet = Math.min(1, this.t / 1.8); if (this.t > 2.4) this._next(); break;
      case 'dots': if (!inBowl) this._dots(dt, finger, inp); break;
      case 'draw': if (!inBowl) this._draw(dt, finger, inp); break;
      case 'free': if (!inBowl) this._free(dt, finger, inp); else this.freeCur = null; break;
      case 'colour': if (!inBowl) this._colour(dt, finger, inp); break;
    }
    return this.events;
  }
  _use(amount) {
    const had = this.supply > 0;
    this.supply = Math.max(0, this.supply - amount);
    if (had && this.supply <= 0) this.emit({ type: 'empty' });
  }

  // ---------- sweep
  _sweep(dt, f, inp) {
    let touched = 0;
    // a flat open hand is a wide broom; a pointing finger only nudges
    this.broom = !inp.hand ? TUNE.broomMouse : inp.open ? TUNE.broom : TUNE.broomFinger;
    for (const d of this.debris) {
      if (d.gone) continue;
      if (f && this.speed > TUNE.broomMinSpeed) {
        const dx = d.x - f[0], dy = d.y - f[1], dist = Math.hypot(dx, dy);
        const reach = this.broom + (d.kind === 'leaf' ? d.size * 0.5 : 0);
        if (dist < reach) {
          const k = (1 - dist / reach) * (d.kind === 'leaf' ? 0.55 : 0.8);
          d.vx += (this.vel[0] * 1.1 - d.vx) * k + (dx / (dist + 1e-3)) * 0.6 * k;
          d.vy += (this.vel[1] * 1.1 - d.vy) * k + (dy / (dist + 1e-3)) * 0.6 * k;
          d.spin += (this.vel[0] * dy - this.vel[1] * dx) * 0.08 * k;
          touched++;
        }
      }
      d.x += d.vx * dt; d.y += d.vy * dt; d.rot += d.spin * dt;
      const fr = Math.exp(-(d.kind === 'leaf' ? 3.2 : 4.5) * dt);
      d.vx *= fr; d.vy *= fr; d.spin *= Math.exp(-3 * dt);
      // swept away: far enough out, or off the edge of the screen
      const v = this.view, sx = v ? v.gx + d.x * v.unit : 0, sy = v ? v.gy + d.y * v.unit : 0;
      const offScreen = v && (sx < -10 || sy < -10 || sx > v.w + 10 || sy > v.h + 10);
      const nearEdge = v && (sx < v.unit * 0.6 || sy < v.unit * 0.6 || sx > v.w - v.unit * 0.6 || sy > v.h - v.unit * 0.6);
      if (Math.hypot(d.x - this.c, d.y - this.c) > this.sweepR || offScreen || (nearEdge && Math.hypot(d.vx, d.vy) > 0.3)) { d.alpha -= dt * 2.5; if (d.alpha <= 0) d.gone = true; }
    }
    this.sweeping = touched > 0;
    const left = this.debris.filter(d => !d.gone);
    if (left.every(d => d.kind !== 'leaf') && left.length < this.debrisTotal * 0.12) {
      for (const d of left) { d.alpha -= dt * 1.5; if (d.alpha <= 0) d.gone = true; }
      this.cleanAt ??= this.t;
      if (this.t - this.cleanAt > 0.8) { this.debris = []; this._next(); }
    }
  }
  get sweepProgress() { return this.debrisTotal ? 1 - this.debris.filter(d => !d.gone).length / this.debrisTotal : 1; }

  // ---------- dots
  _dots(dt, f, inp) {
    // pinch over a mark, then open your fingers: the dot drops where you let go.
    // (holding your finger on a mark for a while also works, more slowly)
    this.dotTarget = null;
    for (const m of this.marks) {
      if (m.placed) { m.placed = Math.min(1, m.placed + dt * 4); continue; }
      const near = f && Math.hypot(f[0] - m.x, f[1] - m.y) < TUNE.dotReach;
      if (near) this.dotTarget = m;
      if (near && this.supply > 0) m.hold += dt; else m.hold = Math.max(0, m.hold - dt * 2);
      if (near && this.supply <= 0) this.wantFlour = true;
      const drop = near && (inp.pinchEnd || inp.click || m.hold >= TUNE.dotHold);
      if (this.supply > 0 && drop) {
        m.placed = 0.01; m.hold = 0; this._use(TUNE.dotCost);
        this.emit({ type: 'dot', x: m.x, y: m.y, n: this.placedCount, of: this.marks.length, how: inp.pinchEnd ? (inp.hand ? 'pinch' : 'click') : inp.click ? 'click' : 'hold' });
      }
    }
    if (this.marks.every(m => m.placed >= 1)) { this.dotsDoneAt ??= this.t; if (this.t - this.dotsDoneAt > 0.6) this._next(); }
  }
  get placedCount() { return this.marks.filter(m => m.placed).length; }

  // ---------- guided drawing: pull the pen along the path
  _draw(dt, f, inp) {
    const g = this.guides[this.line];
    this.pulling = false;
    // flour only falls while your fingers are pinched together
    const holding = TUNE.pinchToDraw ? !!inp.pinching : true;
    this.holding = holding;
    if (!g) return;
    const P = g.pts, N = P.length - 1;
    if (!this.started) {
      const near = f && Math.hypot(f[0] - P[0][0], f[1] - P[0][1]) < TUNE.startReach;
      this.startHoldT = near && this.supply > 0 && holding ? this.startHoldT + dt : 0;
      this.nearStart = near;
      if (near && this.supply <= 0) this.wantFlour = true;
      if (this.startHoldT >= TUNE.startHold) {
        this.started = true; g.idx = 0; g.drawn = [{ x: P[0][0], y: P[0][1], w: 0.6, h: 0.5 }];
        this.emit({ type: 'lineStart', line: this.line });
      }
      return;
    }
    if (!f) return;
    const i0 = Math.floor(g.idx);
    // where along the path ahead of the pen is your finger?
    const ahead = Math.ceil(TUNE.lookAhead * g.spu);
    // the FIRST stretch of path ahead that's within reach of your finger,
    // and the closest point on it. At a crossing the path leaves your reach
    // before it comes back, so the pen keeps going the way it was going
    // instead of skipping a loop; on a small motif the whole shape is in
    // reach, so it simply follows your finger round.
    let best = -1, bd = Infinity, inStretch = false;
    for (let i = i0; i <= Math.min(N, i0 + ahead); i++) {
      const d = Math.hypot(P[i][0] - f[0], P[i][1] - f[1]);
      if (d < TUNE.pull) { inStretch = true; if (d < bd) { bd = d; best = i; } }
      else if (inStretch) break;
    }
    if (best < 0) { this.farSince ||= this.t; return; }
    this.farSince = 0;
    if (this.supply <= 0) { this.wantFlour = true; return; }
    if (!holding) return;                            // fingers open: the flour stops
    if (best <= g.idx) return;                       // finger on the pen but not moving forward
    // the pen follows, up to a speed limit
    const step = Math.min(best - g.idx, TUNE.maxSpeed * g.spu * dt);
    const from = g.idx; g.idx += step; this.pulling = true;
    // your wobble: where your finger is relative to the path, kept small
    const tip = P[Math.min(N, Math.round(g.idx))];
    let wx = f[0] - tip[0], wy = f[1] - tip[1]; const wl = Math.hypot(wx, wy);
    if (wl > TUNE.wobble) { wx *= TUNE.wobble / wl; wy *= TUNE.wobble / wl; }
    this.wob = [this.wob[0] + (wx * 0.6 - this.wob[0]) * 0.15, this.wob[1] + (wy * 0.6 - this.wob[1]) * 0.15];
    for (let i = Math.floor(from) + 1; i <= Math.floor(g.idx); i++) {
      // the wobble fades out near both ends so lines still meet cleanly
      const ease = Math.min(1, i / 6, (N - i) / 6);
      g.drawn.push({ x: P[i][0] + this.wob[0] * ease, y: P[i][1] + this.wob[1] * ease, w: 0.45 + 0.25 * Math.min(1, this.speed / 4), h: 0.5 });
    }
    this._use(step / g.spu / TUNE.flourPerPinch);
    if (g.idx >= N - 0.01) {
      g.idx = N; this.started = false; this.startHoldT = 0;
      this.emit({ type: 'lineDone', line: this.line, of: this.guides.length });
      this.line++;
      if (this.line >= this.guides.length) this._next();
    }
  }
  get offPath() { return this.phase === 'draw' && this.started && this.farSince && this.t - this.farSince > 0.7; }
  get drawLinesOut() {
    // your lines, grouped by symmetry so they render as quarters × 4 where mirrored
    const one = [], four = [];
    for (const g of this.guides) if (g.drawn.length > 1) (g.rot === 4 ? four : one).push({ samples: g.drawn, closed: false });
    return { one, four };
  }
  get pen() {
    const g = this.guides[this.line]; if (!g || this.phase !== 'draw') return null;
    const P = g.pts, i = Math.min(P.length - 1, Math.round(g.idx));
    return this.started ? P[i] : P[0];
  }

  // ---------- free: the flour follows your finger, mirrored four ways
  _free(dt, f, inp) {
    this.pulling = false;
    const inside = f && f[0] > -0.3 && f[1] > -0.3 && f[0] < this.W + 0.3 && f[1] < this.W + 0.3;
    const holding = TUNE.pinchToDraw ? !!inp.pinching : true;
    if (!inside || this.supply <= 0 || !holding) {
      if (this.supply <= 0 && inside) this.wantFlour = true;
      this.freeCur = null; return;
    }
    if (!this.freeCur) {
      this.freeCur = { samples: [{ x: f[0], y: f[1], w: 0.55, h: 0.5 }], closed: false };
      this.freeStrokes.push(this.freeCur);
      this.emit({ type: 'freeStart' });
      return;
    }
    const s = this.freeCur.samples, last = s[s.length - 1];
    const p = [last.x + (f[0] - last.x) * 0.35, last.y + (f[1] - last.y) * 0.35];
    const d = Math.hypot(p[0] - last.x, p[1] - last.y);
    if (d > 0.03) { s.push({ x: p[0], y: p[1], w: 0.45 + 0.25 * Math.min(1, this.speed / 4), h: 0.5 }); this._use(d / TUNE.flourPerPinch); this.pulling = true; }
  }

  // ---------- colour
  _colour(dt, f, inp) {
    // rub your thumb against your fingertips over a shape to crumble the
    // powder in (a plain pinch sprinkles more slowly; with a mouse, hold the button)
    this.filling = false;
    const reg = f ? this.layer.regionAt(f[0], f[1]) : -1;
    this.hover = reg;
    if (reg < 0 || this.powder < 0) return;
    const key = reg + ':' + this.powder;
    let prog = this.prog.get(key) || 0;
    if (prog >= 1) return;
    if (this.supply <= 0) { this.wantFlour = true; return; }
    const rate = inp.rubbing ? 1 : inp.pinching ? TUNE.pinchFill : 0;
    if (!rate && !inp.click) return;
    const add = inp.click ? 1 - prog : rate * dt / TUNE.fillTime;
    const room = this.supply / TUNE.shapeCost;
    const d = Math.min(add, room);
    prog = Math.min(1, prog + d);
    this._use(d * TUNE.shapeCost);
    PALETTE.forEach((_, i) => { if (i !== this.powder) this.prog.delete(reg + ':' + i); });
    this.prog.set(key, prog);
    this.layer.aim(f[0], f[1], this.powder);
    this.layer.fillTo(prog);
    this.filling = true;
    this.coloursUsed.add(this.powder); this.regionsDone.add(reg);
  }
  finishColour() { if (this.phase === 'colour') this._next(); }
  finishFree() { if (this.phase === 'free') this._next(); }

  // ---------- drawing
  draw(ctx, view, now) {
    const c = this.c;
    if (this.wet > 0) {
      const [cx, cy] = L(view, c, c), r = (c + 1.3) * view.unit;
      const g = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
      g.addColorStop(0, `rgba(12,9,7,${0.42 * this.wet})`); g.addColorStop(0.75, `rgba(12,9,7,${0.3 * this.wet})`); g.addColorStop(1, 'rgba(12,9,7,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
      if (this.phase === 'water') this._drops(ctx, view);
    }
    if (this.layer) this.layer.draw(ctx, view);
    if (this.phase === 'colour' && this.hover >= 0 && this.powder >= 0 && !this.filling)
      this.layer.drawPreview(ctx, view, this.hover, PALETTE[this.powder].hex, 0.22 + 0.1 * Math.sin(now * 0.008));
    if (this.o.colourBase) drawLines(ctx, view, this.o.colourBase.lines, this.o.colourBase.rotations, c, { thin: this.o.colourBase.whole ? 0.5 : 1 });
    if (this.phase === 'sweep') this._drawDebris(ctx, view);
    if (this.marks.length && this.phase !== 'sweep' && this.phase !== 'water') this._drawMarks(ctx, view, now);
    if (this.guides.length && (this.phase === 'draw' || this.phase === 'done')) {
      this._drawGuides(ctx, view, now);
      const { one, four } = this.drawLinesOut;
      const thin = this.o.thin || 1;
      if (one.length) drawLines(ctx, view, one, 1, c, { thin });
      if (four.length) drawLines(ctx, view, four, 4, c, { thin });
      if (this.phase === 'draw') this._drawPen(ctx, view, now);
    }
    if (this.freeStrokes.length) drawLines(ctx, view, this.freeStrokes, 4, c);
    if (this.phase === 'free') this._drawMirrorHint(ctx, view);
    if (this.needsFlour) this._drawBowls(ctx, view, now);
  }

  _drops(ctx, view) {
    ctx.save();
    for (let i = 0; i < 14; i++) {
      const ph = (this.t * 1.3 + i / 14) % 1, a = i * 2.39, d = (0.2 + ((i * 0.618) % 1) * 0.8) * (this.c + 0.8);
      const [x, y] = L(view, this.c + Math.cos(a) * d, this.c + Math.sin(a) * d);
      ctx.globalAlpha = (1 - ph) * 0.5 * (1 - Math.max(0, this.t - 1.6)); ctx.strokeStyle = '#9fb3c2'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, view.unit * (0.05 + ph * 0.35), 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  _drawDebris(ctx, view) {
    ctx.save();
    for (const d of this.debris) {
      if (d.gone) continue;
      const [x, y] = L(view, d.x, d.y);
      ctx.globalAlpha = Math.max(0, d.alpha);
      if (d.kind === 'dust') { ctx.fillStyle = d.col; ctx.beginPath(); ctx.arc(x, y, Math.max(1, d.size * view.unit), 0, TAU); ctx.fill(); continue; }
      const s = d.size * view.unit;
      ctx.save(); ctx.translate(x, y); ctx.rotate(d.rot);
      ctx.fillStyle = d.col;
      ctx.beginPath(); ctx.moveTo(-s, 0); ctx.quadraticCurveTo(-s * 0.2, -s * 0.55, s, 0); ctx.quadraticCurveTo(-s * 0.2, s * 0.55, -s, 0); ctx.fill();
      ctx.strokeStyle = 'rgba(40,28,14,0.55)'; ctx.lineWidth = Math.max(1, s * 0.06);
      ctx.beginPath(); ctx.moveTo(-s * 1.15, 0); ctx.lineTo(s * 0.9, 0); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  _drawMarks(ctx, view, now) {
    ctx.save();
    for (const m of this.marks) {
      const [x, y] = L(view, m.x, m.y), r = Math.max(2.5, view.unit * 0.075);
      if (!m.placed) {
        ctx.globalAlpha = 0.35 + 0.15 * Math.sin(now * 0.004 + m.x);
        ctx.strokeStyle = FLOUR; ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.arc(x, y, r * 2.4, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        if (m.hold > 0) {
          ctx.globalAlpha = 0.9; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(x, y, r * 2.4, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, m.hold / TUNE.dotHold)); ctx.stroke();
        }
        continue;
      }
      const k = m.placed;
      ctx.globalAlpha = 0.25 * k; ctx.fillStyle = FLOUR; ctx.beginPath(); ctx.arc(x, y, r * 1.8 * (1.6 - 0.6 * k), 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.95 * k; ctx.fillStyle = flourPattern(ctx); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  _path(ctx, view, pts, r, a = 0, b = pts.length - 1) {
    ctx.beginPath();
    for (let k = a; k <= b; k++) { const [x, y] = L(view, ...rot(pts[k], r, this.c)); k === a ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
  }

  _drawGuides(ctx, view, now) {
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    this.guides.forEach((g, i) => {
      if (i < this.line) return;
      const cur = i === this.line && this.phase === 'draw';
      for (let r = 0; r < g.rot; r++) {
        // the whole line faintly (mirrored quarters too)
        ctx.globalAlpha = cur ? (r === 0 ? 0.3 : 0.14) : 0.07; ctx.strokeStyle = '#d9cfff';
        ctx.lineWidth = view.unit * 0.08; ctx.setLineDash(cur ? [] : [4, 7]);
        this._path(ctx, view, g.pts, r); ctx.stroke(); ctx.setLineDash([]);
      }
      if (!cur) return;
      // the stretch just ahead of the pen, brighter, with moving arrows
      const P = g.pts, a = Math.floor(g.idx), b = Math.min(P.length - 1, a + Math.ceil(2.2 * g.spu));
      ctx.globalAlpha = 0.8; ctx.strokeStyle = '#b4a8ff'; ctx.lineWidth = view.unit * 0.07;
      this._path(ctx, view, P, 0, a, b); ctx.stroke();
      const ph = (now / 700) % 1, step = Math.max(2, Math.round(0.6 * g.spu));
      for (let s = 0; s < 3; s++) {
        const k = Math.floor(a + (s + ph) * step);
        if (k >= b - 1) break;
        const [x0, y0] = L(view, ...P[k]), [x1, y1] = L(view, ...P[k + 1]);
        const ang = Math.atan2(y1 - y0, x1 - x0), z = view.unit * 0.13;
        ctx.globalAlpha = 0.9; ctx.fillStyle = '#e6e0ff';
        ctx.beginPath(); ctx.moveTo(x0 + Math.cos(ang) * z, y0 + Math.sin(ang) * z);
        ctx.lineTo(x0 + Math.cos(ang + 2.5) * z, y0 + Math.sin(ang + 2.5) * z); ctx.lineTo(x0 + Math.cos(ang - 2.5) * z, y0 + Math.sin(ang - 2.5) * z); ctx.fill();
      }
    });
    ctx.restore();
  }

  // the pen: where the line is now. Before you start it's "start here";
  // while drawing it's a little heap of flour you keep your finger on.
  _drawPen(ctx, view, now) {
    const p = this.pen; if (!p) return;
    const [x, y] = L(view, ...p);
    ctx.save();
    const pulse = 1 + 0.12 * Math.sin(now * 0.007);
    if (!this.started) {
      ctx.globalAlpha = 0.95; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, view.unit * 0.24 * pulse, 0, TAU); ctx.stroke();
      if (this.startHoldT > 0) {
        ctx.strokeStyle = '#b4a8ff'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(x, y, view.unit * 0.32, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, this.startHoldT / TUNE.startHold)); ctx.stroke();
      }
      ctx.fillStyle = '#f4ede0'; ctx.font = `600 ${Math.round(Math.max(18, view.unit * 0.24))}px Catamaran, sans-serif`; ctx.textAlign = 'center';
      ctx.fillText('start here', x, y - view.unit * 0.42);
    } else {
      ctx.globalAlpha = this.offPath ? 0.95 : 0.6; ctx.strokeStyle = this.offPath ? '#fff' : '#b4a8ff'; ctx.lineWidth = this.offPath ? 3 : 2;
      ctx.beginPath(); ctx.arc(x, y, view.unit * (this.offPath ? 0.3 * pulse : 0.2), 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  _drawMirrorHint(ctx, view) {
    // the four mirror quarters, very faint
    const [cx, cy] = L(view, this.c, this.c), h = (this.c + 0.4) * view.unit;
    ctx.save(); ctx.globalAlpha = 0.12; ctx.strokeStyle = '#d9cfff'; ctx.setLineDash([3, 8]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, cy - h); ctx.lineTo(cx, cy + h); ctx.moveTo(cx - h, cy); ctx.lineTo(cx + h, cy); ctx.stroke();
    ctx.restore();
  }

  _drawBowls(ctx, view, now) {
    const bowls = this.bowls(view);
    ctx.save();
    for (const b of bowls) {
      const hex = b.powder < 0 ? FLOUR : PALETTE[b.powder].hex;
      const glow = this.wantFlour && (this.supply <= 0) && (b.powder === this.powder || b.powder < 0 || this.phase === 'colour');
      // bowl (a brass-coloured dish) with a heap of powder
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#6b4f2a'; ctx.beginPath(); ctx.ellipse(b.x, b.y + b.r * 0.15, b.r, b.r * 0.62, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#a4834d'; ctx.beginPath(); ctx.ellipse(b.x, b.y, b.r * 0.92, b.r * 0.52, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = hex; ctx.beginPath(); ctx.ellipse(b.x, b.y - b.r * 0.05, b.r * 0.72, b.r * 0.38, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.5; ctx.fillStyle = b.powder < 0 ? flourPattern(ctx) : hex;
      ctx.beginPath(); ctx.ellipse(b.x, b.y - b.r * 0.12, b.r * 0.5, b.r * 0.24, 0, 0, TAU); ctx.fill();
      if (glow || (this.bowlHold > 0 && (this.phase !== 'colour' || this.bowlHover === b.powder))) {
        ctx.globalAlpha = 0.6 + 0.3 * Math.sin(now * 0.008); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.ellipse(b.x, b.y + b.r * 0.1, b.r * 1.15, b.r * 0.78, 0, 0, TAU); ctx.stroke();
      }
      if (b.powder === this.powder && this.phase === 'colour' && this.supply > 0) {
        ctx.globalAlpha = 1; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(b.x, b.y + b.r * 0.1, b.r * 1.08, b.r * 0.72, 0, 0, TAU); ctx.stroke();
      }
    }
    // label
    const top = bowls[0];
    ctx.globalAlpha = 0.85; ctx.fillStyle = '#f4ede0'; ctx.textAlign = 'center';
    ctx.font = `600 ${Math.round(Math.max(17, view.unit * 0.22))}px Catamaran, sans-serif`;
    ctx.fillText(this.phase === 'colour' ? 'pinch a colour' : 'rice flour · pinch to pick up', top.x, top.y - top.r * 1.4);
    ctx.restore();
  }

  // cursor: a broom while sweeping; otherwise your pinch of powder, which
  // shrinks as it runs out (the ring shows how much is left)
  drawCursor(ctx, view, pt) {
    if (!pt) return;
    ctx.save();
    if (this.phase === 'sweep') {
      const ang = this.speed > 0.3 ? Math.atan2(this.vel[1], this.vel[0]) + Math.PI : Math.PI / 2;
      const len = view.unit * (this.broom || TUNE.broom) * 0.75;
      ctx.strokeStyle = '#d8c08a'; ctx.lineCap = 'round';
      const n = this.broom >= TUNE.broom ? 9 : this.broom <= TUNE.broomFinger ? 3 : 6;   // wide broom for an open hand
      for (let i = -n; i <= n; i++) {
        const a = ang + i * 0.06;
        ctx.globalAlpha = 0.55; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(pt.x + Math.cos(a) * len, pt.y + Math.sin(a) * len); ctx.stroke();
      }
      ctx.globalAlpha = 0.9; ctx.fillStyle = '#8a6a2f'; ctx.beginPath(); ctx.arc(pt.x, pt.y, 6, 0, TAU); ctx.fill();
    } else if (this.phase !== 'water' && this.phase !== 'done') {
      const hex = this.powder < 0 ? FLOUR : PALETTE[this.powder].hex;
      const s = this.supply;
      if (s > 0) {
        ctx.fillStyle = hex;
        for (let k = 0; k < 7; k++) {
          const a = k * 2.4, d = k ? 4 + 4 * s : 0;
          ctx.globalAlpha = 0.95; ctx.beginPath(); ctx.arc(pt.x + Math.cos(a) * d, pt.y + Math.sin(a) * d, (k ? 2.6 : 4) * (0.5 + 0.5 * s), 0, TAU); ctx.fill();
        }
      }
      // fingers together (pinching): a solid lavender ring; open: a dashed one
      const pinched = this.inp && this.inp.pinching;
      ctx.globalAlpha = 0.95; ctx.strokeStyle = pinched ? '#b4a8ff' : 'rgba(255,255,255,0.55)'; ctx.lineWidth = pinched ? 3 : 1.5;
      ctx.setLineDash(pinched ? [] : [3, 4]); ctx.beginPath(); ctx.arc(pt.x, pt.y, pinched ? 9 : 11, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      if (this.phase === 'colour' && this.inp && this.inp.rubbing && s > 0) for (let k = 0; k < 3; k++) sprinkleAt(pt.x + (Math.random() - 0.5) * 14, pt.y + 6, 1);
      // how much is left
      ctx.globalAlpha = 0.9; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 15, 0, TAU); ctx.stroke();
      if (s > 0) { ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(pt.x, pt.y, 15, -Math.PI / 2, -Math.PI / 2 + TAU * s); ctx.stroke(); }
      // picking up: a ring fills while you hold in the bowl
      if (this.bowlHold > 0) {
        ctx.strokeStyle = '#b4a8ff'; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 21, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, this.bowlHold / TUNE.bowlHold)); ctx.stroke();
      }
      if ((this.pulling || this.filling) && s > 0) sprinkleAt(pt.x, pt.y + 4, 0.7);
    }
    ctx.restore();
  }
}
