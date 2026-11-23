// pen.js — "your finger draws, your voice is the flour".
//
// A pen travels along the kolam lattice while you hum. Each time it nears a
// gap between dots it hasn't decided yet, it picks the way closest to your
// finger: straight on, or curving left/right. That choice is stored as the
// crossing's state in the Kolam, so the line always obeys the rules — it
// loops around dots, never touches one, and always closes.
//
// With 4-way symmetry on, three mirror pens draw the same choices rotated
// around the centre, so whatever you draw becomes a balanced kolam.

import { CROSS, MIRROR_H, MIRROR_V, Kolam } from './kolam.js';

const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const quad = (a, c, b, u) => {
  const v = 1 - u;
  return [v * v * a[0] + 2 * v * u * c[0] + u * u * b[0], v * v * a[1] + 2 * v * u * c[1] + u * u * b[1]];
};

export class DrawEngine {
  constructor(kolam, { symmetric = true, speed = 2.4, reference = null } = {}) {
    this.k = kolam;
    this.symmetric = symmetric;
    this.speed = speed;          // lattice segments per second while humming
    // guided mode: a finished pattern (Map "x,y" → state) the learner must follow
    this.reference = reference ? new Map(reference) : null;
    this.reset();
  }

  get rotations() { return this.symmetric ? 4 : 1; }
  rotP(p, r) { const c = this.k.n; let q = p; for (let i = 0; i < r; i++) q = [2 * c - q[1], q[0]]; return q; }
  rotD(d, r) { let q = d; for (let i = 0; i < r; i++) q = [-q[1], q[0]]; return q; }

  reset() {
    this.k.state = new Map(); this.k._loops = null;
    this.decided = new Set();
    this.marked = new Set();
    this.lines = [];       // { samples: [{x,y,w,h}], closed }
    this.pen = null;
    this.complete = false;
    this.started = false;
    this.entered = 0;            // segments the main pen has started
    this.stopAfter = Infinity;   // guided: pen holds at the midpoint of this segment
    this.waiting = null;         // guided: {q, d} gap where the finger must point the right way
    let n = 0;
    this.allSegments().forEach(() => n++);
    this.totalSegs = n;
  }

  segKey(a, b) {
    const k1 = a[0] + ',' + a[1], k2 = b[0] + ',' + b[1];
    return k1 < k2 ? k1 + '|' + k2 : k2 + '|' + k1;
  }
  allSegments() {
    const out = [], W = this.k.W;
    for (let x = 0; x <= W; x++) for (let y = 0; y <= W; y++) {
      if ((x + y) % 2 !== 1) continue;
      for (const d of [[1, 1], [1, -1]]) {
        const q = [x + d[0], y + d[1]];
        if (this.k.inBounds(q[0], q[1]) && this.k.segValid([x, y], d)) out.push({ p: [x, y], d });
      }
    }
    return out;
  }
  isMarked(p, d) { return this.marked.has(this.segKey(p, add(p, d))); }
  mark(p, d) {
    for (let r = 0; r < this.rotations; r++)
      this.marked.add(this.segKey(this.rotP(p, r), this.rotP(add(p, d), r)));
  }

  isBoundary(q) { return this.k.isEdge(q[0], q[1]); }

  // options at an undecided crossing, arriving with direction d
  options(q, d) {
    return [
      { s: CROSS, out: d },
      { s: MIRROR_H, out: [d[0], -d[1]] },
      { s: MIRROR_V, out: [-d[0], d[1]] },
    ];
  }
  bestOption(q, d, finger) {
    const opts = this.options(q, d);
    if (!finger) return opts[0];
    let vx = finger[0] - q[0], vy = finger[1] - q[1];
    const len = Math.hypot(vx, vy);
    if (len < 0.25) return opts[0];
    vx /= len; vy /= len;
    let best = opts[0], bs = -Infinity;
    for (const o of opts) {
      const s = (o.out[0] * vx + o.out[1] * vy) + (o.s === CROSS ? 0.05 : 0); // tiny bias to go straight on ties
      if (s > bs) { bs = s; best = o; }
    }
    return best;
  }

  // outgoing direction at q; decides undecided crossings using the finger
  turn(q, d, finger) {
    if (this.isBoundary(q)) return this.k.edgeTurn(q, d);
    const key = q[0] + ',' + q[1];
    if (!this.decided.has(key)) {
      const o = this.reference ? { s: this.refState(q) } : this.bestOption(q, d, finger);
      for (let r = 0; r < this.rotations; r++) {
        const img = this.rotP(q, r);
        this.k.set(img[0], img[1], r % 2 ? Kolam.swapHV(o.s) : o.s);
        this.decided.add(img[0] + ',' + img[1]);
      }
    }
    const s = this.k.get(q[0], q[1]);
    if (s === MIRROR_H) return [d[0], -d[1]];
    if (s === MIRROR_V) return [-d[0], d[1]];
    return d;
  }

  refState(q) { return this.reference.get(q[0] + ',' + q[1]) || CROSS; }
  refOut(q, d) { return this.options(q, d).find(o => o.s === this.refState(q)).out; }

  // guided: is the finger pointing (roughly) the reference way out of gap q?
  fingerMatches(q, d, finger) {
    if (!finger) return false;
    const vx = finger[0] - q[0], vy = finger[1] - q[1], len = Math.hypot(vx, vy);
    if (len < 0.3) return false;
    const o = this.refOut(q, d);
    return (o[0] * vx + o[1] * vy) / (len * Math.SQRT2) > 0.6;   // within ~50°
  }

  // the next n segments ahead of the pen, as lattice points (no side effects)
  peek(n) {
    const pen = this.pen; if (!pen) return null;
    let a = pen.P[pen.P.length - 1], d = pen.d;
    const pts = [a];
    for (let i = 0; i <= n; i++) {
      const b = add(a, d);
      pts.push(b);
      if (i === n) break;
      let nd;
      if (this.isBoundary(b)) nd = this.k.edgeTurn(b, d);
      else {
        const st = this.decided.has(b[0] + ',' + b[1]) ? this.k.get(b[0], b[1]) : this.reference ? this.refState(b) : CROSS;
        nd = st === MIRROR_H ? [d[0], -d[1]] : st === MIRROR_V ? [-d[0], d[1]] : d;
      }
      if (this.isMarked(b, nd)) { pts.push(add(b, nd)); break; }  // the line closes here
      a = b; d = nd;
    }
    // smooth from the current midpoint to the midpoint n segments on
    const out = [];
    for (let k = 1; k < pts.length - 1; k++) {
      const A = mid(pts[k - 1], pts[k]), B = mid(pts[k], pts[k + 1]);
      for (let i = 0; i <= 8; i++) out.push(quad(A, pts[k], B, i / 8));
    }
    return out;
  }

  // learn mode: if the learner is stuck at a gap, take the right way for them
  confirmWaiting() {
    const pen = this.pen, w = this.waiting;
    if (!pen || !w) return false;
    pen.next = this.turn(w.q, w.d, null);   // turn() follows the reference
    this.waiting = null;
    return true;
  }

  // learn mode, multi-line kolams: place the pen at the start of the next line
  beginNext(w = 0.3, h = 0.5) {
    if (this.pen || this.complete) return false;
    if (!this.startLine(null)) { this.complete = true; return false; }
    this._sample(w, h, true);
    return true;
  }

  // start the first line without moving (guided mode shows the way first)
  begin(w = 0.3, h = 0.5) {
    if (this.pen || this.started) return;
    this.startLine(null);
    this._sample(w, h, true);
  }

  // where the pen would start a new line: the unmarked segment nearest the finger
  startLine(finger) {
    let pick = null;
    if (!this.started) {
      const c = this.k.n;                       // first line: middle of the left edge
      pick = { p: [0, c % 2 ? c : c + 1], d: [1, 1] };
      if (!this.k.segValid(pick.p, pick.d) || this.isMarked(pick.p, pick.d)) pick = null;
    }
    if (!pick) {
      let bd = Infinity;
      for (const s of this.allSegments()) {
        if (this.isMarked(s.p, s.d)) continue;
        const m = mid(s.p, add(s.p, s.d));
        const dd = finger ? Math.hypot(m[0] - finger[0], m[1] - finger[1]) : 0;
        if (dd < bd) { bd = dd; pick = s; }
        if (!finger) break;
      }
    }
    if (!pick) return false;
    this.started = true;
    this.entered++;
    this.mark(pick.p, pick.d);
    const line = { samples: [], closed: false };
    this.lines.push(line);
    this.pen = { P: [pick.p], d: pick.d, t: 0.5, next: null, closing: false, line };
    return true;
  }

  // the upcoming undecided crossing, if any (for showing the choice)
  upcoming() {
    const pen = this.pen;
    if (!pen || pen.next || pen.closing) return null;
    const q = add(pen.P[pen.P.length - 1], pen.d);
    if (this.isBoundary(q) || this.decided.has(q[0] + ',' + q[1])) return null;
    return { q, d: pen.d };
  }

  tip() {
    const pen = this.pen; if (!pen) return null;
    const n = pen.P.length - 1, Pn = pen.P[n];
    const q = add(Pn, pen.d);
    if (pen.t < 0.5) {
      const prev = n > 0 ? pen.P[n - 1] : add(Pn, [-pen.d[0], -pen.d[1]]);
      return quad(mid(prev, Pn), Pn, mid(Pn, q), pen.t + 0.5);
    }
    if (!pen.next) return mid(Pn, q);
    return quad(mid(Pn, q), q, mid(q, add(q, pen.next)), pen.t - 0.5);
  }

  // move the pen forward; returns an event string or null
  advance(dt, finger, w, h) {
    if (this.complete) return null;
    let event = null;
    if (!this.pen) {
      if (!this.startLine(finger)) { this.complete = true; return 'complete'; }
      this._sample(w, h, true);   // begin exactly on the segment midpoint
      event = 'lineStart';
    }
    const pen = this.pen;
    pen.t += dt * this.speed;
    for (let guard = 0; guard < 8; guard++) {
      if (pen.closing && pen.t >= 0.5) {
        pen.t = 0.5; this._sample(w, h, true);
        pen.line.closed = true; this.pen = null;
        if (this.marked.size >= this.totalSegs) { this.complete = true; return 'complete'; }
        return 'lineClosed';
      }
      if (!pen.next && !pen.closing && pen.t >= 0.5) {
        if (this.entered >= this.stopAfter) {          // end of a guided section
          pen.t = 0.5; this._sample(w, h); return 'hold';
        }
        const q = add(pen.P[pen.P.length - 1], pen.d);
        if (this.reference && !this.isBoundary(q) && !this.decided.has(q[0] + ',' + q[1])) {
          if (!this.fingerMatches(q, pen.d, finger)) {   // wait until the finger points the right way
            pen.t = 0.5; this.waiting = { q, d: pen.d }; this._sample(w, h); return 'wait';
          }
        }
        this.waiting = null;
        pen.next = this.turn(q, pen.d, finger);
      }
      if (pen.t >= 1) {
        const q = add(pen.P[pen.P.length - 1], pen.d);
        pen.P.push(q); pen.d = pen.next; pen.next = null; pen.t -= 1; this.entered++;
        if (this.isMarked(q, pen.d)) pen.closing = true; else this.mark(q, pen.d);
        continue;
      }
      break;
    }
    this._sample(w, h);
    return event;
  }

  _sample(w, h, force = false) {
    const p = this.tip(); if (!p) return;
    const s = this.pen.line.samples, last = s[s.length - 1];
    if (force || !last || Math.hypot(p[0] - last.x, p[1] - last.y) > 0.06) {
      // ease thickness and colour so the line reads as one stroke, not beads
      if (last && !force) { w = last.w + (w - last.w) * 0.2; h = last.h + (h - last.h) * 0.2; }
      s.push({ x: p[0], y: p[1], w, h });
    }
  }

  // how far along the main pen is, in segments (fractional)
  get position() { return this.pen ? this.entered + this.pen.t - 0.5 : this.entered; }

  get progress() { return this.marked.size / this.totalSegs; }
}
