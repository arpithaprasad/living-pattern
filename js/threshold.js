// threshold.js — "At the threshold": the whole kolam ritual, by hand only.
//
//   1 · sweep   — leaves and dust lie on the doorstep; move your hand across
//                 them like a broom to sweep them away
//   2 · water   — the ground is sprinkled with water so the flour holds
//                 (a short animation, nothing to do)
//   3 · dots    — faint marks show where the pulli (dots) go; hold your
//                 finger on each one to drop a dot of flour
//   4 · draw    — the kolam's lines appear faintly; start at the marker and
//                 trace each line: the flour follows your finger
//
// Everything is in lattice units (the same coordinates as the dots), so the
// scene keeps its shape when the window resizes.

import { L, FLOUR, flourPattern, drawLines, sprinkleAt } from './render.js';

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);

// tuning
const BROOM = 1.1;          // broom reach (lattice units)
const BROOM_MIN_SPEED = 1.2; // the hand has to be moving (units/s) to sweep
const DOT_HOLD = 0.35;      // seconds to rest on a mark to drop a dot
const DOT_REACH = 0.55;     // how close to a mark counts
const ON_LINE = 0.6;        // how close to the guide the flour still falls
const LOOK_AHEAD = 22;      // guide samples searched ahead of where you are

const LEAF_COLOURS = ['#8a6a2f', '#a07a35', '#6f7a3a', '#b58a3c', '#7d5a2a', '#94803f'];

export class Threshold {
  constructor({ kolam, loops, texts = [], dotsText = '' }) {
    this.kolam = kolam;
    this.c = kolam.W / 2;
    this.dotsText = dotsText;
    // guide lines: biggest first (outer line → inner circle), like the lesson
    this.guides = loops
      .map((pts, i) => ({ pts, r: Math.max(...pts.map(([x, y]) => Math.hypot(x - this.c, y - this.c))), text: texts[i] }))
      .sort((a, b) => b.r - a.r)
      .map((g, i) => ({ pts: g.pts, text: texts[i] || '' }));
    this.phase = 'sweep';
    this.t = 0;                 // time in this phase
    this.done = false;
    this.events = [];

    // --- sweep: leaves + dust around the threshold
    const R0 = this.c + 1.6;
    this.debris = [];
    for (let i = 0; i < 16; i++) this.debris.push(this._item('leaf', R0));
    for (let i = 0; i < 260; i++) this.debris.push(this._item('dust', R0));
    this.debrisTotal = this.debris.length;
    this.sweepR = R0 + 1.4;     // pushed beyond this = swept away
    this.prev = null; this.vel = [0, 0]; this.speed = 0;

    // --- dots
    this.marks = kolam.dots().map(([x, y]) => ({ x, y, placed: 0, hold: 0 }));
    this.wet = 0;

    // --- draw
    this.line = 0;              // which guide line
    this.idx = 0;               // how far along it you are (sample index)
    this.started = false;       // flour is falling on this line
    this.strokes = [];          // your flour, per line: [{samples, closed}]
    this.cur = null;            // the stroke being drawn
    this.offSince = 0;
  }

  _item(kind, R0) {
    const a = rand(0, TAU), d = Math.sqrt(Math.random()) * R0;
    return {
      kind, x: this.c + Math.cos(a) * d, y: this.c + Math.sin(a) * d, vx: 0, vy: 0,
      rot: rand(0, TAU), spin: 0, alpha: 1,
      size: kind === 'leaf' ? rand(0.35, 0.65) : rand(0.025, 0.07),
      col: kind === 'leaf' ? LEAF_COLOURS[(Math.random() * LEAF_COLOURS.length) | 0] : `rgba(${(rand(110, 160)) | 0},${(rand(90, 125)) | 0},${(rand(60, 90)) | 0},${rand(0.5, 0.9).toFixed(2)})`,
    };
  }

  emit(e) { this.events.push(e); }

  get progress() {
    if (this.phase === 'sweep') return 1 - this.debris.filter(d => !d.gone).length / this.debrisTotal;
    if (this.phase === 'dots') return this.marks.filter(m => m.placed).length / this.marks.length;
    if (this.phase === 'draw') return (this.line + this.idx / this.guides[this.line].pts.length) / this.guides.length;
    return 1;
  }

  // finger: [x, y] in lattice units, or null when there's no hand / pointer
  update(dt, finger) {
    this.t += dt;
    this.events = [];
    // hand velocity (lattice units / s), smoothed
    if (finger && this.prev && dt > 0) {
      const vx = (finger[0] - this.prev[0]) / dt, vy = (finger[1] - this.prev[1]) / dt;
      this.vel = [this.vel[0] + (vx - this.vel[0]) * 0.5, this.vel[1] + (vy - this.vel[1]) * 0.5];
    } else this.vel = [this.vel[0] * 0.8, this.vel[1] * 0.8];
    this.speed = Math.hypot(...this.vel);
    this.prev = finger;

    if (this.phase === 'sweep') this._sweep(dt, finger);
    else if (this.phase === 'water') { this.wet = Math.min(1, this.t / 1.8); if (this.t > 2.4) this._go('dots'); }
    else if (this.phase === 'dots') this._dots(dt, finger);
    else if (this.phase === 'draw') this._draw(dt, finger);
    return this.events;
  }

  _go(phase) { this.phase = phase; this.t = 0; this.emit({ type: 'phase', phase }); }

  // ---------- 1 · sweep
  _sweep(dt, f) {
    let touched = 0;
    for (const d of this.debris) {
      if (d.gone) continue;
      if (f && this.speed > BROOM_MIN_SPEED) {
        const dx = d.x - f[0], dy = d.y - f[1], dist = Math.hypot(dx, dy);
        const reach = BROOM + (d.kind === 'leaf' ? d.size * 0.5 : 0);
        if (dist < reach) {
          const k = (1 - dist / reach) * (d.kind === 'leaf' ? 0.55 : 0.8);
          // carried along with the hand, plus a little outward scatter
          d.vx += (this.vel[0] * 1.1 - d.vx) * k + (dx / (dist + 1e-3)) * 0.6 * k;
          d.vy += (this.vel[1] * 1.1 - d.vy) * k + (dy / (dist + 1e-3)) * 0.6 * k;
          d.spin += (this.vel[0] * dy - this.vel[1] * dx) * 0.08 * k;
          touched++;
        }
      }
      d.x += d.vx * dt; d.y += d.vy * dt; d.rot += d.spin * dt;
      const fr = Math.exp(-(d.kind === 'leaf' ? 3.2 : 4.5) * dt);
      d.vx *= fr; d.vy *= fr; d.spin *= Math.exp(-3 * dt);
      if (Math.hypot(d.x - this.c, d.y - this.c) > this.sweepR) { d.alpha -= dt * 2.5; if (d.alpha <= 0) d.gone = true; }
    }
    this.sweeping = touched > 0;
    // nearly clean: the last specks blow away by themselves
    const left = this.debris.filter(d => !d.gone);
    const leavesLeft = left.filter(d => d.kind === 'leaf').length;
    if (leavesLeft === 0 && left.length < this.debrisTotal * 0.12) {
      for (const d of left) { d.alpha -= dt * 1.5; if (d.alpha <= 0) d.gone = true; }
      if (!this.cleanAt) this.cleanAt = this.t;
      if (this.t - this.cleanAt > 0.8) { this.debris = []; this._go('water'); }
    }
  }

  // ---------- 3 · dots
  _dots(dt, f) {
    this.hover = null;
    for (const m of this.marks) {
      if (m.placed) { m.placed = Math.min(1, m.placed + dt * 4); continue; }
      const near = f && Math.hypot(f[0] - m.x, f[1] - m.y) < DOT_REACH;
      if (near) { this.hover = m; m.hold += dt; } else m.hold = Math.max(0, m.hold - dt * 2);
      if (m.hold >= DOT_HOLD || (near && this.click)) {
        m.placed = 0.01; m.hold = 0;
        this.emit({ type: 'dot', x: m.x, y: m.y, n: this.marks.filter(q => q.placed).length, of: this.marks.length });
      }
    }
    this.click = false;
    if (this.marks.every(m => m.placed >= 1)) { if (!this.dotsDoneAt) this.dotsDoneAt = this.t; if (this.t - this.dotsDoneAt > 0.6) this._go('draw'); }
  }

  // ---------- 4 · draw
  _draw(dt, f) {
    const g = this.guides[this.line];
    if (!g) return;
    const P = g.pts, N = P.length;
    this.drawing = false;
    if (!f) { this._lift(); return; }
    // where along the guide is the finger? search a little ahead of progress
    let best = -1, bd = ON_LINE;
    const from = this.started ? Math.max(0, this.idx - 3) : 0;
    const to = this.started ? Math.min(N - 1, this.idx + LOOK_AHEAD) : 3;
    for (let i = from; i <= to; i++) {
      const d = Math.hypot(P[i][0] - f[0], P[i][1] - f[1]);
      if (d < bd) { bd = d; best = i; }
    }
    if (!this.started) {
      // flour starts falling once you rest on the start marker
      if (best >= 0) { this.startHold = (this.startHold || 0) + dt; } else this.startHold = 0;
      if (this.startHold > 0.3) { this.started = true; this.idx = 0; this.emit({ type: 'lineStart', line: this.line }); }
      else return;
    }
    if (best >= 0) {
      this.idx = Math.max(this.idx, best);
      this.drawing = true; this.offSince = 0;
      if (!this.cur) { this.cur = { samples: [], closed: false, line: this.line }; this.strokes.push(this.cur); }
      const s = this.cur.samples, last = s[s.length - 1];
      // the flour follows your finger (lightly smoothed), not the guide
      const p = last ? [last.x + (f[0] - last.x) * 0.6, last.y + (f[1] - last.y) * 0.6] : f;
      if (!last || Math.hypot(p[0] - last.x, p[1] - last.y) > 0.03)
        s.push({ x: p[0], y: p[1], w: 0.45 + 0.25 * Math.min(1, this.speed / 4), h: 0.5 });
    } else {
      // off the line: the flour stops until you come back to it
      this._lift();
      if (!this.offSince) this.offSince = this.t;
    }
    if (this.idx >= N - 3) {
      // closed the line: join your stroke to where it began
      if (this.cur && this.cur.samples.length) {
        const first = this.strokes.find(s => s.line === this.line);
        if (first && first.samples.length) this.cur.samples.push({ ...first.samples[0] });
      }
      this._lift();
      this.emit({ type: 'lineDone', line: this.line, of: this.guides.length });
      this.line++; this.idx = 0; this.started = false; this.startHold = 0;
      if (this.line >= this.guides.length) { this.done = true; this._go('done'); }
    }
  }
  _lift() {
    if (this.cur) this.cur.line = this.line;
    if (this.cur && this.cur.samples.length < 2) this.strokes.pop();
    this.cur = null;
  }
  get offLine() { return this.phase === 'draw' && this.started && this.offSince && this.t - this.offSince > 0.6; }

  // your drawing in the same shape the rest of the app uses for lines
  get lines() { return this.strokes.filter(s => s.samples.length > 1); }

  // the start of the current guide line + which way it goes
  get startMark() {
    const g = this.guides[this.line]; if (!g) return null;
    const P = g.pts, a = P[0], b = P[3];
    return { x: a[0], y: a[1], dir: Math.atan2(b[1] - a[1], b[0] - a[0]) };
  }

  // ---------- drawing
  draw(ctx, view, now) {
    // wet ground (after sprinkling water): a darker, slightly glossy patch
    if (this.wet > 0) {
      const [cx, cy] = L(view, this.c, this.c), r = (this.c + 1.3) * view.unit;
      const g = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
      g.addColorStop(0, `rgba(12,9,7,${0.42 * this.wet})`);
      g.addColorStop(0.75, `rgba(12,9,7,${0.3 * this.wet})`);
      g.addColorStop(1, 'rgba(12,9,7,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
      if (this.phase === 'water') this._drops(ctx, view);
    }
    if (this.phase === 'sweep') this._drawDebris(ctx, view);
    if (this.phase === 'dots' || this.phase === 'draw' || this.phase === 'done') this._drawMarks(ctx, view, now);
    if (this.phase === 'draw' || this.phase === 'done') {
      this._drawGuides(ctx, view, now);
      drawLines(ctx, view, this.lines, 1, this.c);
    }
  }

  _drops(ctx, view) {
    // a few drops landing as rings
    ctx.save();
    for (let i = 0; i < 14; i++) {
      const seed = (i * 97.13) % 1, ph = ((this.t * 1.3 + i / 14) % 1);
      const a = i * 2.39, d = (0.2 + ((i * 0.618) % 1) * 0.8) * (this.c + 0.8);
      const [x, y] = L(view, this.c + Math.cos(a) * d, this.c + Math.sin(a) * d);
      ctx.globalAlpha = (1 - ph) * 0.5 * (1 - Math.max(0, this.t - 1.6)); ctx.strokeStyle = '#9fb3c2'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, view.unit * (0.05 + ph * 0.35 + seed * 0.05), 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  _drawDebris(ctx, view) {
    ctx.save();
    for (const d of this.debris) {
      if (d.gone) continue;
      const [x, y] = L(view, d.x, d.y);
      ctx.globalAlpha = Math.max(0, d.alpha);
      if (d.kind === 'dust') {
        ctx.fillStyle = d.col;
        ctx.beginPath(); ctx.arc(x, y, Math.max(1, d.size * view.unit), 0, TAU); ctx.fill();
        continue;
      }
      const s = d.size * view.unit;
      ctx.save(); ctx.translate(x, y); ctx.rotate(d.rot);
      ctx.fillStyle = d.col;
      ctx.beginPath(); ctx.moveTo(-s, 0);
      ctx.quadraticCurveTo(-s * 0.2, -s * 0.55, s, 0);
      ctx.quadraticCurveTo(-s * 0.2, s * 0.55, -s, 0); ctx.fill();
      ctx.strokeStyle = 'rgba(40,28,14,0.55)'; ctx.lineWidth = Math.max(1, s * 0.06);
      ctx.beginPath(); ctx.moveTo(-s * 1.15, 0); ctx.lineTo(s * 0.9, 0); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  _drawMarks(ctx, view, now) {
    ctx.save();
    for (const m of this.marks) {
      const [x, y] = L(view, m.x, m.y);
      const r = Math.max(2.5, view.unit * 0.075);
      if (!m.placed) {
        // a faint chalk mark where the dot belongs, with a ring that fills as you hold
        ctx.globalAlpha = 0.35 + 0.15 * Math.sin(now * 0.004 + m.x);
        ctx.strokeStyle = FLOUR; ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.arc(x, y, r * 2.4, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        if (m.hold > 0) {
          ctx.globalAlpha = 0.9; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(x, y, r * 2.4, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, m.hold / DOT_HOLD)); ctx.stroke();
        }
        continue;
      }
      const k = m.placed;   // grows in as it lands
      ctx.globalAlpha = 0.25 * k; ctx.fillStyle = FLOUR;
      ctx.beginPath(); ctx.arc(x, y, r * 1.8 * (1.6 - 0.6 * k), 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.95 * k; ctx.fillStyle = flourPattern(ctx);
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  _drawGuides(ctx, view, now) {
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    this.guides.forEach((g, i) => {
      if (i < this.line) return;                 // already drawn: your flour shows it
      const P = g.pts.map(([x, y]) => L(view, x, y));
      const current = i === this.line;
      // the whole line, faint
      ctx.globalAlpha = current ? 0.28 : 0.08; ctx.strokeStyle = '#d9cfff';
      ctx.lineWidth = view.unit * 0.09; ctx.setLineDash(current ? [] : [4, 7]);
      ctx.beginPath(); P.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
      ctx.setLineDash([]);
      if (!current) return;
      // the next stretch ahead of you, brighter, with moving arrows
      const a = this.started ? this.idx : 0, b = Math.min(P.length - 1, a + 26);
      ctx.globalAlpha = 0.75; ctx.strokeStyle = '#b4a8ff'; ctx.lineWidth = view.unit * 0.07;
      ctx.beginPath(); for (let k = a; k <= b; k++) (k === a ? ctx.moveTo(...P[k]) : ctx.lineTo(...P[k])); ctx.stroke();
      const phase = (now / 600) % 1;
      for (let s = 0; s < 3; s++) {
        const k = Math.min(P.length - 2, Math.floor(a + (s + phase) * 7));
        if (k >= b) break;
        const [x0, y0] = P[k], [x1, y1] = P[k + 1], ang = Math.atan2(y1 - y0, x1 - x0), z = view.unit * 0.12;
        ctx.globalAlpha = 0.9; ctx.fillStyle = '#e6e0ff';
        ctx.beginPath(); ctx.moveTo(x0 + Math.cos(ang) * z, y0 + Math.sin(ang) * z);
        ctx.lineTo(x0 + Math.cos(ang + 2.5) * z, y0 + Math.sin(ang + 2.5) * z);
        ctx.lineTo(x0 + Math.cos(ang - 2.5) * z, y0 + Math.sin(ang - 2.5) * z); ctx.fill();
      }
      // start marker (until you begin)
      if (!this.started) {
        const [x, y] = P[0], pulse = 1 + 0.15 * Math.sin(now * 0.006);
        ctx.globalAlpha = 0.95; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, view.unit * 0.22 * pulse, 0, TAU); ctx.stroke();
        if (this.startHold > 0) {
          ctx.strokeStyle = '#b4a8ff'; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(x, y, view.unit * 0.3, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, this.startHold / 0.3)); ctx.stroke();
        }
        ctx.fillStyle = '#f4ede0'; ctx.font = `600 ${Math.round(Math.max(18, view.unit * 0.3))}px Catamaran, sans-serif`;
        ctx.textAlign = 'center'; ctx.fillText('start here', x, y - view.unit * 0.38);
      }
    });
    ctx.restore();
  }

  // a broom of bristles behind the hand while sweeping; a pinch of flour while drawing
  drawCursor(ctx, view, pt) {
    if (!pt) return;
    ctx.save();
    if (this.phase === 'sweep') {
      const ang = this.speed > 0.3 ? Math.atan2(this.vel[1], this.vel[0]) + Math.PI : Math.PI / 2;
      const len = view.unit * BROOM * 0.75;
      ctx.strokeStyle = '#d8c08a'; ctx.lineCap = 'round';
      for (let i = -5; i <= 5; i++) {
        const a = ang + i * 0.09;
        ctx.globalAlpha = 0.55; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(pt.x + Math.cos(a) * len, pt.y + Math.sin(a) * len); ctx.stroke();
      }
      ctx.globalAlpha = 0.9; ctx.fillStyle = '#8a6a2f';
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 6, 0, TAU); ctx.fill();
    } else {
      const on = this.drawing;
      ctx.globalAlpha = 0.95; ctx.fillStyle = on ? FLOUR : 'rgba(246,241,230,0.5)';
      ctx.beginPath(); ctx.arc(pt.x, pt.y, on ? 7 : 9, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(pt.x, pt.y, 12, 0, TAU); ctx.stroke();
      if (on) sprinkleAt(pt.x, pt.y + 4, 0.8);
    }
    ctx.restore();
  }
}
