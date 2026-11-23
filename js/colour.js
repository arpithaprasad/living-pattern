// colour.js — Level 3, festival colours: hum to pour coloured powder into the
// shapes of a finished kolam. Works on ANY kolam's lines (dot kolams, motif
// kolams): the lines are rasterised into a small mask, the enclosed spaces are
// found, and the one you point at fills outward from your finger while you hum.
// Your pitch picks the colour; loudness sets how fast it pours.

// a palette that feels like kolam powders (low pitch → high pitch)
export const PALETTE = [
  { name: 'indigo', hex: '#5b4ea8' },
  { name: 'leaf green', hex: '#5e9e4f' },
  { name: 'turmeric', hex: '#e7b52c' },
  { name: 'saffron', hex: '#e2752a' },
  { name: 'kaavi red', hex: '#b8402f' },
  { name: 'kumkum pink', hex: '#cf3f74' },
];
export const colourFor = (pitchT) => Math.min(PALETTE.length - 1, Math.max(0, Math.floor(pitchT * PALETTE.length)));

const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

export class ColourLayer {
  // W: lattice width (the kolam spans 0..W); R: mask resolution
  constructor(W, R = 420, whole = false) {
    this.W = W; this.R = R; this.whole = whole;
    this.pad = 0.6;                               // lattice units of margin
    this.scale = R / (W + this.pad * 2);
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = R;
    this.ctx = this.canvas.getContext('2d');
    this.img = this.ctx.createImageData(R, R);
    this.colour = new Uint8Array(R * R);          // 0 = empty, else palette index + 1
    this.noise = new Float32Array(R * R).map(() => 0.72 + Math.random() * 0.28);
    this.pour = null;
    this.dirty = false;
  }

  toMask(lx, ly) { return [(lx + this.pad) * this.scale, (ly + this.pad) * this.scale]; }

  // lines: [{samples:[{x,y}], closed}], drawn with `rotations` copies about (c, c)
  build(lines, rotations, c, dots = []) {
    this.c = c; this.twinCache = new Map();
    const R = this.R, m = document.createElement('canvas');
    m.width = m.height = R;
    const g = m.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, R, R);
    g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
    g.lineWidth = Math.max(2, this.scale * 0.13);
    const rot = (p, r) => { let q = p; for (let i = 0; i < r; i++) q = [2 * c - q[1], q[0]]; return q; };
    for (const ln of lines) for (let r = 0; r < rotations; r++) {
      g.beginPath();
      ln.samples.forEach((s, i) => { const [x, y] = this.toMask(...rot([s.x, s.y], r)); i ? g.lineTo(x, y) : g.moveTo(x, y); });
      // only close a line whose ends actually meet: a quarter of a symmetric
      // line is "closed" by its rotations, and a closing chord here would cut
      // fake walls through the loops
      const a = ln.samples[0], b = ln.samples[ln.samples.length - 1];
      if (ln.closed && a && Math.hypot(a.x - b.x, a.y - b.y) < 0.3) g.closePath();
      g.stroke();
    }
    const d = g.getImageData(0, 0, R, R).data;
    this.wall = new Uint8Array(R * R);
    for (let i = 0; i < R * R; i++) this.wall[i] = d[i * 4] > 100 ? 1 : 0;
    // label the enclosed spaces; anything touching the edge is "outside"
    this.label = new Int32Array(R * R).fill(-1);
    this.sizes = [];
    this.outside = new Set();
    let next = 0;
    const stack = new Int32Array(R * R);
    for (let start = 0; start < R * R; start++) {
      if (this.wall[start] || this.label[start] >= 0) continue;
      let sp = 0, size = 0, edge = false;
      stack[sp++] = start; this.label[start] = next;
      while (sp) {
        const i = stack[--sp]; size++;
        const x = i % R, y = (i / R) | 0;
        if (x === 0 || y === 0 || x === R - 1 || y === R - 1) edge = true;
        for (const j of [i - 1, i + 1, i - R, i + R]) {
          if (j < 0 || j >= R * R || this.wall[j] || this.label[j] >= 0) continue;
          if ((j === i - 1 && x === 0) || (j === i + 1 && x === R - 1)) continue;
          this.label[j] = next; stack[sp++] = j;
        }
      }
      if (edge) this.outside.add(next);
      this.sizes.push(size); next++;
    }
    // motif kolams: a "shape" is a whole motif (a flower, a star), not the tiny
    // slivers between its strokes, so merge each motif's lines + spaces into one
    if (this.whole) {
      const inside = (i) => this.wall[i] || (this.label[i] >= 0 && !this.outside.has(this.label[i]));
      const seen = new Uint8Array(R * R), blob = new Int32Array(R * R).fill(-1);
      for (let start = 0; start < R * R; start++) {
        if (seen[start] || !inside(start)) continue;
        let sp = 0, size = 0; stack[sp++] = start; seen[start] = 1;
        while (sp) {
          const i = stack[--sp]; size++; blob[i] = next;
          const x = i % R;
          for (const j of [i - 1, i + 1, i - R, i + R]) {
            if (j < 0 || j >= R * R || seen[j] || !inside(j)) continue;
            if ((j === i - 1 && x === 0) || (j === i + 1 && x === R - 1)) continue;
            seen[j] = 1; stack[sp++] = j;
          }
        }
        this.sizes.push(size); next++;
      }
      for (let i = 0; i < R * R; i++) if (blob[i] >= 0) this.label[i] = blob[i];
      // tiny specks (stray line ends) don't count as shapes
      this.sizes.forEach((n, l) => { if (n < 40) this.outside.add(l); });
    }
    // centroid of each space (in mask pixels), for finding its symmetric twins
    const sx = new Float64Array(next), sy = new Float64Array(next);
    for (let i = 0; i < R * R; i++) { const l = this.label[i]; if (l >= 0) { sx[l] += i % R; sy[l] += (i / R) | 0; } }
    this.cent = this.sizes.map((n, l) => [sx[l] / n, sy[l] / n]);
    this.colour.fill(0); this.pour = null; this.dirty = true;
  }

  // the same shape repeated around the kolam: rotate / mirror the space's centre
  // about the kolam's centre and keep the spaces of (nearly) the same size there.
  twins(reg) {
    if (reg < 0) return [];
    if (this.twinCache.has(reg)) return this.twinCache.get(reg);
    const R = this.R, [cx, cy] = this.toMask(this.c, this.c), [px, py] = this.cent[reg];
    const dx = px - cx, dy = py - cy, out = new Set([reg]);
    const maps = [[dx, dy], [-dy, dx], [-dx, -dy], [dy, -dx], [-dx, dy], [dy, dx], [dx, -dy], [-dy, -dx]];
    for (const [mx, my] of maps) {
      const x = Math.round(cx + mx), y = Math.round(cy + my);
      let found = -1;
      for (let rad = 0; rad <= 3 && found < 0; rad++)
        for (let oy = -rad; oy <= rad && found < 0; oy++) for (let ox = -rad; ox <= rad; ox++) {
          const xx = x + ox, yy = y + oy;
          if (xx < 0 || yy < 0 || xx >= R || yy >= R) continue;
          const l = this.label[yy * R + xx];
          if (l >= 0) { found = l; break; }
        }
      if (found >= 0 && !this.outside.has(found) && Math.abs(this.sizes[found] - this.sizes[reg]) <= this.sizes[reg] * 0.2) out.add(found);
    }
    const arr = [...out];
    this.twinCache.set(reg, arr);
    return arr;
  }

  // which enclosed space is under lattice point (lx, ly)? -1 if none / outside
  regionAt(lx, ly) {
    if (!this.label) return -1;
    const [mx, my] = this.toMask(lx, ly);
    const R = this.R;
    for (let rad = 0; rad <= 16; rad++) {            // tolerate landing on (or near) a line
      for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
        const x = Math.round(mx) + dx, y = Math.round(my) + dy;
        if (x < 0 || y < 0 || x >= R || y >= R) continue;
        const l = this.label[y * R + x];
        if (l >= 0) return this.outside.has(l) ? -1 : l;
      }
    }
    return -1;
  }

  // pour colour `ci` into the shape under (lx, ly) and every matching shape
  aim(lx, ly, ci) {
    const reg = this.regionAt(lx, ly);
    if (reg < 0) { this.pour = null; return -1; }
    if (this.pour && this.pour.reg === reg && this.pour.ci === ci) return reg;
    const R = this.R, regs = [reg];   // each shape on its own
    // powder lands all over the shape at once, like sprinkling, getting denser
    // as you hum — so a half-filled shape looks speckled, never like a blob
    // spilling out of one corner
    const px = [];
    for (let i = 0; i < R * R; i++) if (this.label[i] === reg) px.push(i);
    for (let k = px.length - 1; k > 0; k--) { const j = (Math.random() * (k + 1)) | 0; [px[k], px[j]] = [px[j], px[k]]; }
    const order = px.map((_, k) => k);
    this.pour = { reg, regs, ci, px: order.map((k) => px[k]), done: 0 };
    return reg;
  }

  // pour for dt seconds; returns true when the region is full
  step(dt, loud) {
    const p = this.pour; if (!p) return false;
    const rate = Math.max(2500, p.px.length / 1.1) * (0.9 + 0.6 * loud);   // ~1 s for a shape, even humming softly
    const to = Math.min(p.px.length, p.done + Math.ceil(rate * dt));
    for (let k = p.done; k < to; k++) this.colour[p.px[k]] = p.ci + 1;
    p.done = to; this.dirty = true;
    return p.done >= p.px.length;
  }

  // fill the current shape up to a fraction (0..1) of its area
  fillTo(frac) {
    const p = this.pour; if (!p) return;
    const to = Math.min(p.px.length, Math.ceil(p.px.length * frac));
    if (to <= p.done) return;
    for (let k = p.done; k < to; k++) this.colour[p.px[k]] = p.ci + 1;
    p.done = to; this.dirty = true;
  }

  // fill the current shape quickly (about half a second), no voice needed
  stepFast(dt) {
    const p = this.pour; if (!p) return true;
    const to = Math.min(p.px.length, p.done + Math.ceil(Math.max(p.px.length / 0.7, 2000) * dt));
    for (let k = p.done; k < to; k++) this.colour[p.px[k]] = p.ci + 1;
    p.done = to; this.dirty = true;
    if (p.done >= p.px.length) { this.pour = null; return true; }
    return false;
  }
  isFilledWith(reg, ci) {
    for (let i = 0; i < this.label.length; i++) if (this.label[i] === reg) return this.colour[i] === ci + 1;
    return false;
  }
  // a soft tint over the shape you're pointing at, in the chosen colour
  drawPreview(ctx, view, reg, hex, alpha) {
    if (reg < 0) return;
    const regs = new Set([reg]);
    if (!this.prev || this.prev.reg !== reg || this.prev.hex !== hex) {
      const c = this.prev && this.prev.canvas || document.createElement('canvas');
      c.width = c.height = this.R;
      const g = c.getContext('2d'), img = g.createImageData(this.R, this.R), [r, gg, b] = hexRGB(hex);
      for (let i = 0; i < this.label.length; i++) if (regs.has(this.label[i])) {
        img.data[i * 4] = r; img.data[i * 4 + 1] = gg; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      this.prev = { reg, hex, canvas: c };
    }
    const s = view.unit / this.scale;
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.drawImage(this.prev.canvas, view.gx - this.pad * view.unit, view.gy - this.pad * view.unit, this.R * s, this.R * s);
    ctx.restore();
  }

  filledCount() { let n = 0; for (let i = 0; i < this.colour.length; i++) if (this.colour[i]) n++; return n; }

  // draw the coloured powder under the kolam's lines
  draw(ctx, view) {
    if (this.dirty) {
      const d = this.img.data, rgb = PALETTE.map(p => hexRGB(p.hex));
      for (let i = 0; i < this.colour.length; i++) {
        const c = this.colour[i];
        if (!c) { d[i * 4 + 3] = 0; continue; }
        const [r, g, b] = rgb[c - 1], n = this.noise[i];
        d[i * 4] = r * n; d[i * 4 + 1] = g * n; d[i * 4 + 2] = b * n; d[i * 4 + 3] = 235;
      }
      this.ctx.putImageData(this.img, 0, 0);
      this.dirty = false;
    }
    const s = view.unit / this.scale;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.canvas, view.gx - this.pad * view.unit, view.gy - this.pad * view.unit, this.R * s, this.R * s);
    ctx.restore();
  }
}
