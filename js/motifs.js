// motifs.js — Level 4, beyond dots: kolams built from drawn motifs rather than
// loops around dots. A "path engine" draws pre-defined strokes as you sing,
// one motif per phrase, with mirror pens copying each stroke round the centre.
//
// MOTIF_KOLAM is rebuilt from a photo of a doorstep kolam (assets/
// motif-kolam.jpg): a diamond of motifs — a centre flower, four 8-point stars,
// four eye shapes, eight lotus-like flowers with square centres and eight small
// circle tiles. Placement follows the photo; the curves are a close hand-built
// approximation (exact tracing in Figma can replace them later).

const P = (x, y) => [x, y];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const rotV = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
const quad = (a, c, b, n = 10) => Array.from({ length: n + 1 }, (_, i) => {
  const t = i / n, u = 1 - t;
  return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
});
const circle = (c, r, a0 = 0, a1 = Math.PI * 2, n = 28) =>
  Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]; });
const place = (pts, centre, ang = 0, s = 1) => pts.map(p => add(centre, rotV([p[0] * s, p[1] * s], ang)));

// ---- motifs (each returns strokes: arrays of points, in local units) ----

// lotus-like flower: a square centre with four curling petals and a dot
// (the red-and-green flowers in the photo)
function lotusMotif(centre, s, ang = 0, { quarter = false } = {}) {
  const strokes = [];
  const h = 0.36;                                    // half-size of the centre square
  const sides = quarter ? [0] : [0, 1, 2, 3];
  for (const k of sides) {
    const a = ang + k * Math.PI / 2;
    // one side of the square
    strokes.push(place([P(-h, -h), P(h, -h)], centre, a, s));
    // a petal curling out from that side (slight pinwheel twist)
    const petal = [
      // a pointed petal that curls to one side, like a pinwheel blade
      ...quad(P(-h * 0.95, -h), P(-0.75, -0.95), P(0.32, -1.3), 12),
      ...quad(P(0.32, -1.3), P(0.12, -0.72), P(h * 0.95, -h), 12).slice(1),
    ];
    strokes.push(place(petal, centre, a, s));
  }
  if (quarter) strokes.push(place(circle(P(0, 0), 0.13, -Math.PI * 0.75, -Math.PI * 0.25, 6), centre, ang, s));
  else strokes.push(place(circle(P(0, 0), 0.13), centre, ang, s));
  return strokes;
}

// 8-point star made of kites (the purple stars)
function starMotif(centre, s, ang = 0) {
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const r = i % 2 === 0 ? 0.78 : 0.32, a = -Math.PI / 2 + i * Math.PI / 8;
    pts.push(P(r * Math.cos(a), r * Math.sin(a)));
  }
  const strokes = [place(pts, centre, ang, s)];
  // lines through the centre split it into eight kites you can colour
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 4;
    strokes.push(place([P(0.78 * Math.cos(a), 0.78 * Math.sin(a)), P(-0.78 * Math.cos(a), -0.78 * Math.sin(a))], centre, ang, s));
  }
  return strokes;
}

// eye / lens shape with a dot (the magenta shapes between the stars)
function eyeMotif(centre, s, ang = 0) {
  const a = 0.72, w = 0.3, m = 0.36;
  return [
    place([P(-a, 0), P(-m, -w), P(m, -w), P(a, 0), P(m, w), P(-m, w), P(-a, 0)], centre, ang, s),
    place(circle(P(0, 0), 0.11), centre, ang, s),
  ];
}

// small round tile with a curved inner square (the little green tiles)
function tileMotif(centre, s) {
  const inner = [];
  for (let k = 0; k < 4; k++) {
    const a0 = Math.PI / 4 + k * Math.PI / 2, a1 = a0 + Math.PI / 2;
    const p0 = P(0.27 * Math.cos(a0), 0.27 * Math.sin(a0)), p1 = P(0.27 * Math.cos(a1), 0.27 * Math.sin(a1));
    inner.push(...quad(p0, P(0, 0), p1, 8).slice(k ? 1 : 0));
  }
  return [place(circle(P(0, 0), 0.42), centre, 0, s), place(inner, centre, 0, s)];
}

// ---- the kolam: one quarter is defined; mirror pens make the other three ----
export function buildMotifKolam(c = 5) {
  const C = P(c, c), d = 1.32;
  const at = (x, y) => add(C, P(x * d, y * d));
  return {
    name: 'Flower & star kolam', level: 'from a real kolam',
    sections: [
      { label: 'centre flower', strokes: lotusMotif(C, 0.8, 0, { quarter: true }) },
      { label: 'star', strokes: starMotif(at(0, -1.75), 0.95) },
      { label: 'eye', strokes: eyeMotif(at(-0.86, -0.86), 0.78, Math.PI / 4) },
      { label: 'tip flower', strokes: lotusMotif(at(0, -3.25), 0.6, 0) },
      { label: 'side flower', strokes: lotusMotif(at(-1.86, -1.86), 0.6, -Math.PI / 4) },
      { label: 'tiles', strokes: [...tileMotif(at(-0.95, -2.6), 0.78), ...tileMotif(at(-2.6, -0.95), 0.78)] },
    ],
  };
}

// ---- path engine: draws a section's strokes along their length -------------
const len = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };
function pointAt(pts, dist) {
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (dist <= seg || i === pts.length - 1) {
      const t = seg ? Math.min(1, dist / seg) : 0;
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
    }
    dist -= seg;
  }
  return pts[pts.length - 1];
}

export class PathEngine {
  constructor(kolam, c = 5) {
    this.kolam = kolam;
    this.c = c;
    this.rotations = 4;
    this.lines = [];                // same shape as DrawEngine.lines, so drawing/colour reuse it
    this.section = -1;
    this.complete = false;
    this.speed = 1;                 // lattice units per second while singing
  }
  get sectionCount() { return this.kolam.sections.length; }
  // the same small interface the app uses for the dot engine
  get started() { return this.section >= 0; }
  get pen() { return this.section >= 0 && !this.complete ? { line: this.current } : null; }
  get waiting() { return null; }
  get progress() {
    let done = 0, all = 0;
    for (let i = 0; i < this.sectionCount; i++) { const L = this.sectionLength(i); all += L; if (i < this.section) done += L; }
    return (done + this.sectionFrac() * (this.section >= 0 ? this.sectionLength(this.section) : 0)) / all;
  }
  rotP(p, r) { const c = this.c; let q = p; for (let i = 0; i < r; i++) q = [2 * c - q[1], q[0]]; return q; }
  reset() { this.lines = []; this.section = -1; this.complete = false; this.current = null; }
  // how far through the current section (0..1), by length
  sectionFrac() {
    if (this.section < 0) return 0;
    let d = 0;
    for (let i = 0; i < this.strokes.length; i++) {
      const L = len(this.strokes[i]);
      if (i < this.stroke) d += L; else if (i === this.stroke) d += this.dist;
    }
    return d / this.sectionLength(this.section);
  }
  sectionLength(i) { return this.kolam.sections[i].strokes.reduce((a, s) => a + len(s), 0); }

  // ready the pen at the start of section i (doesn't draw yet)
  begin(i) {
    this.section = i; this.stroke = 0; this.dist = 0;
    this.strokes = this.kolam.sections[i].strokes;
    this.current = null;
  }
  // where the pen is (or will start)
  tip() {
    if (this.section < 0 || this.complete) return null;
    const s = this.strokes[Math.min(this.stroke, this.strokes.length - 1)];
    return this.stroke >= this.strokes.length ? s[s.length - 1] : pointAt(s, this.dist);
  }
  // the rest of this section, for the glowing guide
  guide() {
    if (this.section < 0) return [];
    return this.strokes.map((s, i) => (i < this.stroke ? null : s)).filter(Boolean);
  }
  advance(dt, w, h) {
    if (this.complete || this.section < 0 || this.stroke >= this.strokes.length) return null;
    let move = dt * this.speed;
    while (move > 1e-9 && this.stroke < this.strokes.length) {
      const s = this.strokes[this.stroke], L = len(s);
      if (!this.current) { this.current = { samples: [], closed: false }; this.lines.push(this.current); this.push(s[0], w, h, true); }
      const take = Math.min(move, L - this.dist, 0.04);   // small steps keep curves curved
      this.dist += take; move -= take;
      this.push(pointAt(s, this.dist), w, h);
      if (this.dist >= L - 1e-6) {               // stroke done → next stroke (a quick lift)
        this.push(s[s.length - 1], w, h, true);
        this.stroke++; this.dist = 0; this.current = null;
      }
    }
    if (this.stroke >= this.strokes.length) {
      if (this.section >= this.sectionCount - 1) { this.complete = true; return 'complete'; }
      return 'hold';
    }
    return null;
  }
  push(p, w, h, force = false) {
    const s = this.current.samples, last = s[s.length - 1];
    if (force || !last || Math.hypot(p[0] - last.x, p[1] - last.y) > 0.07) {
      if (last && !force) { w = last.w + (w - last.w) * 0.2; h = last.h + (h - last.h) * 0.2; }
      s.push({ x: p[0], y: p[1], w, h });
    }
  }
  // draw everything instantly (used to preview, and to start Level 3 on it)
  finishAll() {
    for (let i = 0; i < this.sectionCount; i++) {
      this.begin(i);
      while (this.stroke < this.strokes.length) this.advance(0.5, 0.35, 0.5);
    }
    this.complete = true;
  }
}
