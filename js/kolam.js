// kolam.js — Sikku Kolam as a "mirror curve" (after Paulus Gerdes).
//
// Lattice: an n×n grid of dots (pulli) sits at odd/odd coordinates inside a
// (2n)×(2n) box. The line travels diagonally and only ever visits points
// where x+y is odd — the midpoints between neighbouring dots ("crossings").
// The outer border reflects the line. At each interior crossing the user can
// choose one of three states:
//   CROSS    — the line passes straight through (an ✕)
//   MIRROR_H — a horizontal mirror: the line bounces (flips dy)
//   MIRROR_V — a vertical mirror: the line bounces (flips dx)
// Whatever the states are, the result is always one or more closed loops that
// never touch a dot — the core construction rule. One loop = a true sikku.

export const CROSS = 0, MIRROR_H = 1, MIRROR_V = 2;

// dot layouts
export const SHAPES = {
  square: null,
  // rows of 1-3-5-3-1 (on a 5×5 grid): the classic diamond pulli
  diamond: (i, j, n) => Math.abs(i - (n - 1) / 2) + Math.abs(j - (n - 1) / 2) <= (n - 1) / 2,
  // a 5×5 grid without its four corners and its centre (a ring of dots)
  ring: (i, j, n) => !((i === 0 || i === n - 1) && (j === 0 || j === n - 1)) && !(i === (n - 1) / 2 && j === (n - 1) / 2),
};
const DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

export class Kolam {
  // shape: optional (i, j, n) => bool deciding which dots of the n×n grid
  // exist — e.g. a diamond. Missing dots act like the outer border.
  constructor(n = 4, shape = null) {
    this.n = n;
    this.W = 2 * n;
    this.dotSet = new Set();
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        if (!shape || shape(i, j, n)) this.dotSet.add((2 * i + 1) + ',' + (2 * j + 1));
    this.state = new Map();
    this.symmetry = 'c4';     // 'none' | 'c4' | 'd4'
    this._loops = null;
  }

  key(x, y) { return x + ',' + y; }
  inBounds(x, y) { return x >= 0 && y >= 0 && x <= this.W && y <= this.W; }
  hasDot(x, y) { return this.dotSet.has(x + ',' + y); }
  // the two dots a midpoint sits between
  pair(x, y) { return x % 2 === 0 ? [[x - 1, y], [x + 1, y]] : [[x, y - 1], [x, y + 1]]; }
  dotCount(x, y) { return this.pair(x, y).filter(([a, b]) => this.hasDot(a, b)).length; }
  // a midpoint with a dot on one side only: the line bounces off it, like a wall
  isEdge(x, y) { return this.dotCount(x, y) === 1; }
  edgeTurn(q, d) { return q[0] % 2 === 0 ? [-d[0], d[1]] : [d[0], -d[1]]; }
  // a diagonal segment hugs exactly one dot; it exists only if that dot does
  segValid(p, d) {
    const hug = p[0] % 2 === 0 ? [p[0] + d[0], p[1]] : [p[0], p[1] + d[1]];
    return this.hasDot(hug[0], hug[1]);
  }
  isInterior(x, y) { return x > 0 && y > 0 && x < this.W && y < this.W; }
  get(x, y) { return this.state.get(this.key(x, y)) || CROSS; }

  set(x, y, s) {
    if (s === CROSS) this.state.delete(this.key(x, y));
    else this.state.set(this.key(x, y), s);
    this._loops = null;
  }

  dots() {
    const out = [];
    for (let i = 0; i < this.n; i++)
      for (let j = 0; j < this.n; j++)
        if (this.hasDot(2 * i + 1, 2 * j + 1)) out.push([2 * i + 1, 2 * j + 1]);
    return out;
  }

  crossings() {
    const out = [];
    for (let x = 1; x < this.W; x++)
      for (let y = 1; y < this.W; y++)
        if ((x + y) % 2 === 1 && this.dotCount(x, y) === 2) out.push([x, y]);
    return out;
  }

  // Symmetric images of a crossing, each with a flag saying whether H/V swap.
  images(x, y) {
    const c = this.n; // centre (c, c) in lattice units ×2 → W/2
    const rot = ([px, py]) => [2 * c - py, px];
    const res = [];
    const push = (p, swap) => {
      if (!res.some(r => r.p[0] === p[0] && r.p[1] === p[1])) res.push({ p, swap });
    };
    if (this.symmetry === 'none') return [{ p: [x, y], swap: false }];
    let p = [x, y];
    for (let k = 0; k < 4; k++) { push(p, k % 2 === 1); p = rot(p); }
    if (this.symmetry === 'd4') {
      // reflect across the vertical axis, then rotate again
      let q = [2 * c - x, y];
      for (let k = 0; k < 4; k++) { push(q, k % 2 === 1); q = rot(q); }
    }
    return res;
  }

  static swapHV(s) { return s === MIRROR_H ? MIRROR_V : s === MIRROR_V ? MIRROR_H : s; }

  // Set one crossing (and its symmetric partners) to state s.
  apply(x, y, s) {
    const changed = [];
    for (const { p, swap } of this.images(x, y)) {
      this.set(p[0], p[1], swap ? Kolam.swapHV(s) : s);
      changed.push(p);
    }
    return changed;
  }

  // Cycle CROSS → H → V → CROSS. In guided mode, skip states that would
  // split the line (if any state keeps it as one loop).
  twist(x, y, guided = false) {
    if (!this.isInterior(x, y) || (x + y) % 2 !== 1) return [];
    const start = this.get(x, y);
    const snapshot = new Map(this.state);
    for (let k = 1; k <= 2; k++) {
      const changed = this.apply(x, y, (start + k) % 3);
      if (!guided || this.loops().length === 1) return changed;
      this.state = new Map(snapshot); this._loops = null;
    }
    return []; // guided: no twist here keeps one line, so nothing changes
  }

  serialize() { return [...this.state.entries()]; }
  load(entries) { this.state = new Map(entries); this._loops = null; }

  // Outgoing direction after arriving at q travelling in direction d.
  _turn(q, d) {
    let [dx, dy] = d;
    const [x, y] = q;
    if (this.isEdge(x, y)) [dx, dy] = this.edgeTurn(q, d);
    else {
      const s = this.get(x, y);
      if (s === MIRROR_H) dy = -dy;
      else if (s === MIRROR_V) dx = -dx;
    }
    return [dx, dy];
  }

  // Trace every closed loop. Returns arrays of lattice points [x, y].
  loops() {
    if (this._loops) return this._loops;
    const segKey = (a, b) => {
      const k1 = a[0] + ',' + a[1], k2 = b[0] + ',' + b[1];
      return k1 < k2 ? k1 + '|' + k2 : k2 + '|' + k1;
    };
    const visited = new Set();
    const loops = [];
    for (let x = 0; x <= this.W; x++) {
      for (let y = 0; y <= this.W; y++) {
        if ((x + y) % 2 !== 1) continue;
        for (const d0 of DIRS) {
          const q0 = [x + d0[0], y + d0[1]];
          if (!this.inBounds(q0[0], q0[1]) || !this.segValid([x, y], d0)) continue;
          if (visited.has(segKey([x, y], q0))) continue;
          // trace starting with the segment (x,y) → q0
          const pts = [];
          let cur = [x, y], dir = d0, guard = 0;
          do {
            const nxt = [cur[0] + dir[0], cur[1] + dir[1]];
            visited.add(segKey(cur, nxt));
            pts.push(cur);
            dir = this._turn(nxt, dir);
            cur = nxt;
            if (++guard > 100000) throw new Error('trace overflow');
          } while (!(cur[0] === x && cur[1] === y && dir[0] === d0[0] && dir[1] === d0[1]));
          loops.push(pts);
        }
      }
    }
    // longest loop first
    loops.sort((a, b) => b.length - a.length);
    this._loops = loops;
    return loops;
  }
}

// Smooth a closed loop of lattice points into a dense closed polyline.
// Each corner becomes a quadratic curve from one segment midpoint to the
// next, with the lattice point as its control — bounces turn into round
// petals around dots, crossings stay straight.
export function smoothLoop(pts, samplesPerSeg = 10) {
  const out = [];
  const L = pts.length;
  for (let k = 0; k < L; k++) {
    const p0 = pts[(k - 1 + L) % L], p1 = pts[k], p2 = pts[(k + 1) % L];
    const a = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
    const b = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
    for (let i = 0; i < samplesPerSeg; i++) {
      const t = i / samplesPerSeg, u = 1 - t;
      out.push([
        u * u * a[0] + 2 * u * t * p1[0] + t * t * b[0],
        u * u * a[1] + 2 * u * t * p1[1] + t * t * b[1],
      ]);
    }
  }
  out.push(out[0]); // close
  return out;
}

// Default starting designs (found with tools/find-defaults.mjs): C4-symmetric
// single-line sikku patterns, so the first hum always draws something whole.
// (No C4 single-line pattern exists on 4×4, so the prototype uses 5×5.)
export const DEFAULTS = {
  5: [["1,4",2],["6,1",1],["9,6",2],["4,9",1],["1,6",2],["4,1",1],["9,4",2],["6,9",1],["1,8",2],["2,1",1],["9,2",2],["8,9",1],["3,6",2],["4,3",1],["7,4",2],["6,7",1],["4,5",1],["5,4",2],["6,5",1],["5,6",2]],
};
