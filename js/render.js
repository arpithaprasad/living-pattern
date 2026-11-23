// render.js — all drawing. Style: warm off-white paper, soft lavender/blue,
// slightly imperfect hand-drawn feel, risograph-ish misregistration + grain.

export const PAPER = '#f7f2e9';
// the drawing surface is a dark threshold (stone / swept earth); the UI cards
// keep the warm paper + pastel style
export const SURFACE = '#2a231e';
export const FLOUR = '#f3eee3';
const INK = '#e9e2d4';      // marks drawn on the surface
const ACCENT = '#b4a8ff';   // guidance (lavender, lifted for the dark surface)
const OK = '#8fd3ae';

// voice pitch (0..1) → blue … lavender … rose
export const voiceColor = (t, light = 0) => `hsl(${215 + t * 95}, 55%, ${80 + light}%)`;

export const L = (view, x, y) => [view.gx + x * view.unit, view.gy + y * view.unit];
const rot = (p, r, c) => { let q = p; for (let i = 0; i < r; i++) q = [2 * c - q[1], q[0]]; return q; };
const font = (view, k = 0.3) => `700 ${Math.round(Math.max(16, view.unit * k))}px Catamaran, sans-serif`;

// ---------- background ----------
let grain = null;
function grainPattern(ctx) {
  if (grain) return grain;
  const c = document.createElement('canvas'); c.width = c.height = 180;
  const g = c.getContext('2d'); const img = g.createImageData(180, 180);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 120 + Math.random() * 135;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grain = ctx.createPattern(c, 'repeat');
  return grain;
}

let speck = null;
function speckPattern(ctx) {          // earth / stone texture: fine light specks
  if (speck) return speck;
  const c = document.createElement('canvas'); c.width = c.height = 220;
  const g = c.getContext('2d');
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(255,240,220,${Math.random() * 0.06})`;
    g.fillRect(Math.random() * 220, Math.random() * 220, 1 + Math.random() * 1.5, 1 + Math.random() * 1.5);
  }
  speck = ctx.createPattern(c, 'repeat');
  return speck;
}

// the camera feed IS the surface: darkened and warmed, so the kolam is drawn
// onto your own space and you see your hand guiding it
export function drawBackground(ctx, view, video = null) {
  ctx.fillStyle = SURFACE;
  ctx.fillRect(0, 0, view.w, view.h);
  if (video && video.readyState >= 2 && video.videoWidth && view.cover) {
    const { dx, dy, dw, dh } = view.cover;
    ctx.save();
    ctx.translate(view.w, 0); ctx.scale(-1, 1);
    ctx.filter = 'grayscale(0.85) contrast(1.1) brightness(0.9)';
    ctx.globalAlpha = 0.55;
    ctx.drawImage(video, dx, dy, dw, dh);
    ctx.restore();
    ctx.filter = 'none';
    ctx.fillStyle = 'rgba(42,30,22,0.55)';            // warm earth wash
    ctx.fillRect(0, 0, view.w, view.h);
  }
  // a soft darker floor under the kolam, like a swept threshold
  const r = view.side ? view.side * 0.75 : Math.min(view.w, view.h) * 0.45;
  const cx = view.gx + (view.side || 0) / 2, cy = view.gy + (view.side || 0) / 2;
  const g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
  g.addColorStop(0, 'rgba(20,14,10,0.45)'); g.addColorStop(1, 'rgba(20,14,10,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, view.w, view.h);
  ctx.fillStyle = speckPattern(ctx); ctx.fillRect(0, 0, view.w, view.h);
}

export function drawGrain(ctx, view) {
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = grainPattern(ctx);
  ctx.fillRect(0, 0, view.w, view.h);
  ctx.restore();
}

// small mirrored camera view in the corner, with your fingertip marked
export function drawPip(ctx, view, video, fingerNorm) {
  if (!video || video.readyState < 2 || !video.videoWidth) return;
  const { x, y, w, h } = view.pip;
  ctx.save();
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 14); ctx.clip();
  ctx.translate(x + w, y); ctx.scale(-1, 1);
  ctx.filter = 'saturate(0.6) contrast(0.95)';
  ctx.drawImage(video, 0, 0, w, h);
  ctx.restore();
  ctx.filter = 'none';
  ctx.save();
  ctx.fillStyle = 'rgba(247,242,233,0.18)';
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 14); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke();
  if (fingerNorm) {
    const fx = x + fingerNorm.x * w, fy = y + fingerNorm.y * h;
    ctx.fillStyle = ACCENT; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(fx, fy, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

// ---------- kolam ----------
const jitter = new Map();
const jit = (k) => {
  if (!jitter.has(k)) jitter.set(k, [(Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.06, 0.85 + Math.random() * 0.3]);
  return jitter.get(k);
};

export function drawDots(ctx, view, kolam, alpha = 1) {
  for (const [x, y] of kolam.dots()) {
    const [jx, jy, js] = jit(x + ',' + y);
    const [sx, sy] = L(view, x + jx, y + jy);
    const r = Math.max(2.5, view.unit * 0.075 * js);
    ctx.save();
    ctx.globalAlpha = 0.25 * alpha; ctx.fillStyle = FLOUR;      // powder halo
    ctx.beginPath(); ctx.arc(sx, sy, r * 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.95 * alpha; ctx.fillStyle = flourPattern(ctx);
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

// rice flour: a white texture with powdery gaps, used to stroke lines
let flour = null;
export function flourPattern(ctx) {
  if (flour) return flour;
  const c = document.createElement('canvas'); c.width = c.height = 96;
  const g = c.getContext('2d');
  const img = g.createImageData(96, 96);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random();
    img.data[i] = 246; img.data[i + 1] = 241; img.data[i + 2] = 230;
    img.data[i + 3] = v < 0.12 ? 60 : v < 0.3 ? 170 : 245;   // speckled coverage
  }
  g.putImageData(img, 0, 0);
  flour = ctx.createPattern(c, 'repeat');
  return flour;
}

// the drawn lines (+ their rotated twins when symmetry is on), as rice
// flour: a soft powder spread, a speckled white core, and a faint tint from
// the voice's pitch
export function drawLines(ctx, view, lines, rotations, c, opts = {}) {
  ctx.save();
  if (opts.clip) { ctx.beginPath(); ctx.rect(...opts.clip); ctx.clip(); }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const fp = flourPattern(ctx), thin = opts.thin || 1, CH = 6;   // draw in short batches of samples
  for (let pass = 0; pass < 3; pass++) {
    for (const ln of lines) {
      const s = ln.samples;
      const soft = opts.soften !== undefined && ln.closed && ln !== opts.soften ? 0.7 : 1;
      const a = (opts.alpha ?? 1) * soft;
      for (let r = 0; r < rotations; r++) {
        const P = s.map(p => L(view, ...rot([p.x, p.y], r, c)));
        for (let i = 1; i < P.length; i += CH) {
          const j = Math.min(P.length - 1, i + CH - 1), smp = s[Math.min(s.length - 1, i + (CH >> 1))];
          const w = view.unit * (0.06 + 0.17 * smp.w) * thin;
          if (pass === 0) { ctx.globalAlpha = 0.14 * a; ctx.strokeStyle = FLOUR; ctx.lineWidth = w * 2.4; }
          else if (pass === 1) { ctx.globalAlpha = 0.95 * a; ctx.strokeStyle = fp; ctx.lineWidth = w; }
          else { ctx.globalAlpha = 0.28 * a; ctx.strokeStyle = voiceColor(smp.h); ctx.lineWidth = w * 0.7; }
          ctx.beginPath(); ctx.moveTo(P[i - 1][0], P[i - 1][1]);
          for (let k = i; k <= j; k++) ctx.lineTo(P[k][0], P[k][1]);
          ctx.stroke();
        }
      }
    }
  }
  ctx.restore();
}

// simple flour strokes for a whole smoothed loop (used by the "how it's
// built" explorer); upto = fraction of the loop to draw
export function drawFlourPath(ctx, view, pts, upto = 1, width = 0.12, alpha = 1) {
  const n = Math.max(2, Math.round(upto * (pts.length - 1)) + 1);
  const P = pts.slice(0, n).map(([x, y]) => L(view, x, y));
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const path = () => { ctx.beginPath(); P.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); };
  ctx.globalAlpha = 0.14 * alpha; ctx.strokeStyle = FLOUR; ctx.lineWidth = view.unit * width * 2.4; path(); ctx.stroke();
  ctx.globalAlpha = 0.95 * alpha; ctx.strokeStyle = flourPattern(ctx); ctx.lineWidth = view.unit * width; path(); ctx.stroke();
  ctx.restore();
  return P[P.length - 1];
}

// flour sprinkling from the pen as it draws
const motes = [];
export function sprinkle(view, tip, rotations, c, amount) {
  if (!tip) return;
  for (let r = 0; r < rotations; r++) {
    if (Math.random() > amount) continue;
    const [x, y] = L(view, ...rot(tip, r, c));
    motes.push({ x: x + (Math.random() - 0.5) * 6, y: y - view.unit * 0.25, vy: 0.4 + Math.random() * 0.8,
      vx: (Math.random() - 0.5) * 0.4, life: 1, size: 0.8 + Math.random() * 1.6 });
  }
  if (motes.length > 400) motes.splice(0, motes.length - 400);
}
export function sprinkleAt(x, y, amount) {
  if (Math.random() > amount) return;
  motes.push({ x: x + (Math.random() - 0.5) * 6, y, vy: 0.4 + Math.random() * 0.8, vx: (Math.random() - 0.5) * 0.4, life: 1, size: 0.8 + Math.random() * 1.6 });
}
export function drawMotes(ctx, dt) {
  ctx.save(); ctx.fillStyle = FLOUR;
  for (let i = motes.length - 1; i >= 0; i--) {
    const m = motes[i];
    m.x += m.vx; m.y += m.vy; m.life -= dt * 1.6;
    if (m.life <= 0) { motes.splice(i, 1); continue; }
    ctx.globalAlpha = m.life * 0.8;
    ctx.fillRect(m.x, m.y, m.size, m.size);
  }
  ctx.restore();
}

// pen tips: the main one (yours) glows with your voice; twins are softer
export function drawTips(ctx, view, tip, rotations, c, active, meter) {
  if (!tip) return;
  for (let r = 0; r < rotations; r++) {
    const [sx, sy] = L(view, ...rot(tip, r, c));
    ctx.save();
    if (active && r === 0) {
      const R = view.unit * (0.4 + meter * 0.5);
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, R);
      g.addColorStop(0, 'rgba(160,148,235,0.55)'); g.addColorStop(1, 'rgba(160,148,235,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, R, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = r === 0 ? 1 : 0.5;
    ctx.fillStyle = active ? '#fff' : PAPER;
    ctx.strokeStyle = ACCENT; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sx, sy, view.unit * (r === 0 ? 0.13 : 0.09), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

// before the first hum: four pulsing starting points
export function drawStart(ctx, view, start, rotations, c, t) {
  const k = (t % 1600) / 1600;
  for (let r = 0; r < rotations; r++) {
    const [sx, sy] = L(view, ...rot(start, r, c));
    ctx.save();
    ctx.strokeStyle = ACCENT;
    for (const off of [0, 0.5]) {
      const kk = (k + off) % 1;
      ctx.globalAlpha = (1 - kk) * (r ? 0.35 : 0.7); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, view.unit * (0.15 + kk * 0.5), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = r ? 0.45 : 0.9; ctx.fillStyle = ACCENT;
    ctx.beginPath(); ctx.arc(sx, sy, view.unit * 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

// at the next gap: the possible ways out. Free mode: your finger's pick is
// solid. Learn mode: the right way pulses, and turns green when you point at it.
export function drawChoice(ctx, view, up, options, picked, opts = {}) {
  if (!up) return;
  const [qx, qy] = L(view, up.q[0], up.q[1]);
  const len = view.unit * (opts.guided ? 0.75 : 0.55);
  const pulse = opts.guided ? 0.6 + 0.4 * Math.sin((opts.pulse || 0) * 0.008) : 1;
  ctx.save();
  ctx.lineCap = 'round';
  for (const o of options) {
    const isPick = picked && o.s === picked.s;
    if (opts.guided && !isPick) continue;          // learn mode: only the right way
    const ex = qx + o.out[0] * len, ey = qy + o.out[1] * len;
    const col = opts.ok ? OK : ACCENT;
    if (opts.guided) {                              // soft glow behind the arrow
      ctx.globalAlpha = 0.25 * pulse; ctx.strokeStyle = col; ctx.lineWidth = view.unit * 0.3;
      ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(ex, ey); ctx.stroke();
    }
    ctx.globalAlpha = isPick ? (opts.guided ? 0.95 : 0.9) : 0.3;
    ctx.strokeStyle = isPick ? col : ACCENT;
    ctx.lineWidth = isPick ? (opts.guided ? 4 : 3) : 1.5;
    ctx.setLineDash(isPick ? [] : [3, 4]);
    ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(ex, ey); ctx.stroke();
    if (isPick) {   // arrowhead
      const a = Math.atan2(o.out[1], o.out[0]), hs = view.unit * (opts.guided ? 0.2 : 0.13);
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(ex, ey); ctx.lineTo(ex - hs * Math.cos(a - 0.5), ey - hs * Math.sin(a - 0.5));
      ctx.moveTo(ex, ey); ctx.lineTo(ex - hs * Math.cos(a + 0.5), ey - hs * Math.sin(a + 0.5));
      ctx.stroke();
    }
  }
  ctx.restore();
}

// learn mode: the whole reference kolam, very faint — the goal
export function drawOutline(ctx, view, loops, highlight = null, t = 0) {
  ctx.save();
  ctx.strokeStyle = '#d9d2ff'; ctx.lineJoin = 'round';
  loops.forEach((lp, i) => {
    const hi = highlight && highlight.includes(i);
    ctx.globalAlpha = hi ? 0.45 + 0.25 * Math.sin(t * 0.006) : 0.16;
    ctx.lineWidth = hi ? Math.max(2, view.unit * 0.07) : Math.max(1, view.unit * 0.03);
    ctx.setLineDash(hi ? [view.unit * 0.12, view.unit * 0.1] : []);
    ctx.beginPath(); lp.forEach(([x, y], j) => { const [sx, sy] = L(view, x, y); j ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); });
    ctx.stroke();
  });
  ctx.restore();
}

// a finished line glows once, then settles
export function drawLineGlow(ctx, view, line, rotations, c, k) {
  if (k >= 1) return;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#b9b0ee';
  ctx.globalAlpha = 0.55 * Math.sin(Math.PI * Math.min(1, k));
  ctx.lineWidth = view.unit * (0.35 + 0.25 * k);
  for (let r = 0; r < rotations; r++) {
    ctx.beginPath();
    line.samples.forEach((p, i) => { const [x, y] = L(view, ...rot([p.x, p.y], r, c)); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
  }
  ctx.restore();
}

// the lifted pen hovering over where the next line starts
export function drawPlace(ctx, view, tip, rotations, c, t, label) {
  const k = (t % 1400) / 1400;
  for (let r = 0; r < rotations; r++) {
    const [sx, sy] = L(view, ...rot(tip, r, c));
    ctx.save();
    ctx.strokeStyle = ACCENT;
    for (const off of [0, 0.5]) {
      const kk = (k + off) % 1;
      ctx.globalAlpha = (1 - kk) * (r ? 0.4 : 0.8); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, view.unit * (0.18 + kk * 0.55), 0, Math.PI * 2); ctx.stroke();
    }
    // soft shadow below a floating tip: the pen is lifted
    const lift = view.unit * (0.12 + 0.05 * Math.sin(t * 0.005));
    ctx.globalAlpha = r ? 0.2 : 0.3; ctx.fillStyle = '#5b5785';
    ctx.beginPath(); ctx.ellipse(sx, sy, view.unit * 0.12, view.unit * 0.05, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = r ? 0.55 : 1; ctx.fillStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sx, sy - lift, view.unit * (r ? 0.09 : 0.13), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (r === 0 && label) {
      ctx.font = `600 ${Math.round(Math.max(16, view.unit * 0.3))}px Catamaran, sans-serif`;
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(label).width, th = Math.max(22, view.unit * 0.42);
      let lx = sx + view.unit * 0.4, ly = sy - view.unit * 0.75;
      if (lx + tw + 16 > view.w - 8) lx = sx - view.unit * 0.4 - tw - 16;
      ctx.globalAlpha = 0.92; ctx.fillStyle = PAPER; ctx.strokeStyle = ACCENT; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(lx, ly - th / 2, tw + 16, th, th / 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2b1a12'; ctx.fillText(label, lx + 8, ly + 1);
    }
    ctx.restore();
  }
}

// learn mode: the next stretch to draw. During the call it lights up in time
// with the melody; during your turn it stays softly lit.
export function drawGuide(ctx, view, pts, frac, rotations, c, t, calling) {
  if (!pts || pts.length < 2) return;
  const upto = Math.max(1, Math.round(frac * (pts.length - 1)));
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let r = 0; r < rotations; r++) {
    const P = pts.map(p => L(view, ...rot(p, r, c)));
    // soft wide glow
    ctx.globalAlpha = (r ? 0.12 : 0.28) * (calling ? 1 : 0.7 + 0.3 * Math.sin(t * 0.006));
    ctx.strokeStyle = '#a99fe3'; ctx.lineWidth = view.unit * 0.32;
    ctx.beginPath(); P.slice(0, upto + 1).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    // thin dashed centre
    ctx.globalAlpha = r ? 0.3 : 0.75;
    ctx.strokeStyle = ACCENT; ctx.lineWidth = Math.max(1.5, view.unit * 0.035);
    ctx.setLineDash([view.unit * 0.1, view.unit * 0.09]);
    ctx.beginPath(); P.slice(0, upto + 1).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

// learn mode: the phrase as swaras, the current one lit — a sing-along line
export function drawSwaras(ctx, view, names, active, calling) {
  const size = Math.round(Math.max(24, Math.min(40, view.unit * 0.55)));
  ctx.save();
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  const gap = size * 2.3, x0 = view.w / 2 - (gap * (names.length - 1)) / 2;
  const y = view.gy + view.unit * kolamSide(view) + size * 0.95;
  names.forEach((n, i) => {
    const on = i === active;
    ctx.font = `700 ${on ? size * 1.25 : size}px Catamaran, sans-serif`;
    ctx.fillStyle = on ? (calling ? ACCENT : OK) : INK;
    ctx.globalAlpha = on ? 1 : i < active ? 0.55 : 0.35;
    ctx.fillText(n, x0 + i * gap, y);
  });
  ctx.restore();
}
const kolamSide = (view) => view.side ? view.side / view.unit : 10;

// small swara marks along the glowing stretch: where each note falls
export function drawGuideSwaras(ctx, view, pts, names, active, fracs) {
  ctx.save();
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  ctx.font = `700 ${Math.round(Math.max(13, view.unit * 0.24))}px Catamaran, sans-serif`;
  names.forEach((n, i) => {
    const k = Math.floor((fracs ? fracs[i] : (i + 0.5) / names.length) * (pts.length - 1));
    const [x, y] = L(view, pts[k][0], pts[k][1]);
    ctx.globalAlpha = i === active ? 1 : 0.55;
    ctx.fillStyle = SURFACE;
    ctx.beginPath(); ctx.arc(x, y, view.unit * 0.17, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = i === active ? ACCENT : INK;
    ctx.fillText(n, x, y + 1);
  });
  ctx.restore();
}

// learn mode: progress — one bead per sung phrase
export function drawSections(ctx, view, done, total, calling, groups = null) {
  // beads grouped by line, with a wider gap where one line ends: ●● ●● ●
  const r = 5, gap = 16, groupGap = 14;
  const xs = []; let x = 0;
  for (let i = 0; i < total; i++) {
    if (i && groups && groups[i] !== groups[i - 1]) x += groupGap;
    xs.push(x); x += gap;
  }
  const w = xs[xs.length - 1] || 0;
  const x0 = view.w / 2 - w / 2, y = Math.max(14, view.gy - 22);
  ctx.save();
  for (let i = 0; i < total; i++) {
    ctx.beginPath(); ctx.arc(x0 + xs[i], y, r, 0, Math.PI * 2);
    ctx.lineWidth = 1.5; ctx.strokeStyle = INK;
    ctx.fillStyle = i < done ? ACCENT : i === done ? (calling ? '#cfc8f3' : '#6d6488') : SURFACE;
    ctx.globalAlpha = 0.85; ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

// your finger on the page, with a faint thread to the pen it steers
export function drawFinger(ctx, view, pt, tipScreen, alpha) {
  if (!pt || alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (tipScreen) {
    ctx.strokeStyle = 'rgba(125,111,214,0.35)'; ctx.lineWidth = 1.5; ctx.setLineDash([2, 6]);
    ctx.beginPath(); ctx.moveTo(tipScreen[0], tipScreen[1]); ctx.lineTo(pt.x, pt.y); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.strokeStyle = ACCENT; ctx.fillStyle = 'rgba(160,150,230,0.3)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(pt.x, pt.y, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = ACCENT;
  ctx.beginPath(); ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function drawLabel(ctx, view, x, y, text) {
  ctx.save();
  ctx.font = font(view);
  ctx.fillStyle = '#2b1a12'; ctx.textBaseline = 'middle';
  ctx.globalAlpha = 0.85;
  ctx.fillText(text, x, y);
  ctx.restore();
}

// explore · the rules: each dot pulses inside its loop in turn, and a bright
// bead runs round every line to show it comes back to where it began
export function drawRules(ctx, view, dots, loops, t) {
  ctx.save();
  dots.forEach(([x, y], i) => {
    const k = ((t - i * 0.12) % 2.6) / 2.6;
    if (k < 0 || k > 0.5) return;
    const [sx, sy] = L(view, x, y);
    ctx.globalAlpha = (0.5 - k) * 1.6; ctx.strokeStyle = OK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sx, sy, view.unit * (0.15 + k * 0.9), 0, Math.PI * 2); ctx.stroke();
  });
  loops.forEach((lp, i) => {
    const f = (((t * 0.18 + i * 0.13) % 1) + 1) % 1;
    const p = lp[Math.floor(f * (lp.length - 1))];
    const [sx, sy] = L(view, p[0], p[1]);
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, view.unit * 0.35);
    g.addColorStop(0, 'rgba(180,168,255,0.9)'); g.addColorStop(1, 'rgba(180,168,255,0)');
    ctx.globalAlpha = 1; ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(sx, sy, view.unit * 0.35, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx, sy, view.unit * 0.07, 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();
}

// explore · symmetry: everything dim, one quarter bright; the bright quarter
// turns around the centre
export function drawSymmetry(ctx, view, loops, c, t) {
  loops.forEach(lp => drawFlourPath(ctx, view, lp, 1, 0.1, 0.16));
  const q = Math.floor(t / 1.2) % 4, mid = q * Math.PI / 2;
  const inSector = ([x, y]) => {
    let a = Math.atan2(y - c, x - c) - mid;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    return Math.abs(a) <= Math.PI / 4;
  };
  // bright runs of each loop inside the sector
  loops.forEach(lp => {
    let run = [];
    const flush = () => {
      if (run.length > 1) {
        // lavender glow under the bright quarter so it stands apart
        ctx.save(); ctx.globalAlpha = 0.35; ctx.strokeStyle = ACCENT; ctx.lineWidth = view.unit * 0.32; ctx.lineCap = 'round';
        ctx.beginPath(); run.forEach(([x, y], i) => { const [sx, sy] = L(view, x, y); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); }); ctx.stroke(); ctx.restore();
        drawFlourPath(ctx, view, run, 1, 0.14, 1);
      }
      run = [];
    };
    lp.forEach(p => { if (inSector(p)) run.push(p); else flush(); });
    flush();
  });
  // the sector's two edges, faint
  const [cx, cy] = L(view, c, c), R = view.side ? view.side * 0.55 : view.unit * 5.5;
  ctx.save(); ctx.strokeStyle = ACCENT; ctx.globalAlpha = 0.5; ctx.setLineDash([4, 6]); ctx.lineWidth = 1.5;
  for (const s of [-1, 1]) {
    const a = mid + s * Math.PI / 4;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke();
  }
  ctx.setLineDash([]); ctx.globalAlpha = 0.7;
  ctx.beginPath(); ctx.arc(cx, cy, view.unit * 0.6, mid - Math.PI / 4, mid + Math.PI / 4); ctx.stroke();
  ctx.restore();
}

// Level 3: the colour palette, low pitch at the bottom, high at the top; the
// colour your voice is on right now is enlarged
// where the colour swatches sit: a column beside the kolam (shared with hit-testing)
export function paletteSpots(view, n) {
  const gap = Math.max(46, Math.min(70, view.unit * 0.8)), r = Math.max(17, Math.min(26, view.unit * 0.3));
  let x = view.gx + view.side + Math.max(view.unit * 1.2, r * 2.4);
  if (x + r * 2 > view.w - 10) x = view.gx - Math.max(view.unit * 1.2, r * 2.4);
  const y0 = view.gy + view.side / 2 - (gap * (n - 1)) / 2;
  return Array.from({ length: n }, (_, i) => ({ x, y: y0 + (n - 1 - i) * gap, r }));   // low colours at the bottom
}
// the colour column: wave to step through it (the chosen one pops when it changes)
export function drawPalette(ctx, view, palette, chosen, sinceChange = 1e9, hoverI = -1, swaras = null) {
  const spots = paletteSpots(view, palette.length);
  const pop = Math.max(0, 1 - sinceChange / 350);
  ctx.save();
  palette.forEach((p, i) => {
    const { x, y, r } = spots[i], on = i === chosen, hov = i === hoverI && !on;
    ctx.globalAlpha = on ? 1 : hov ? 0.9 : 0.55;
    ctx.fillStyle = p.hex;
    ctx.beginPath(); ctx.arc(x, y, on ? r * (1.25 + 0.25 * pop) : hov ? r * 1.1 : r * 0.9, 0, Math.PI * 2); ctx.fill();
    if (on || hov) { ctx.strokeStyle = '#fff'; ctx.lineWidth = on ? 3 : 1.5; ctx.stroke(); }
    if (swaras) {                                    // each colour's note, beside it
      ctx.globalAlpha = on ? 1 : 0.6; ctx.fillStyle = '#f4ede0'; ctx.textAlign = 'left';
      ctx.font = `600 ${Math.round(Math.max(16, view.unit * 0.22))}px Catamaran, sans-serif`;
      ctx.fillText(swaras[i], x + r * 1.7, y + 6);
    }
  });
  const top = spots[spots.length - 1], bot = spots[0];
  ctx.globalAlpha = 0.85; ctx.fillStyle = '#f4ede0'; ctx.textAlign = 'center';
  ctx.font = `600 ${Math.round(Math.max(16, view.unit * 0.21))}px Catamaran, sans-serif`;
  ctx.fillText('pinch to pick up', top.x, top.y - top.r * 2.1);
  if (chosen >= 0) { ctx.globalAlpha = 0.7; ctx.fillText(palette[chosen].name, bot.x, bot.y + bot.r * 2.6); }
  ctx.restore();
}
// cursor in colour mode: your colour, with a ring that fills while you hold
// cursor in powder mode: empty fingers (a ring), or a pinch of the carried colour;
// pinching squeezes it; the outer ring fills while you hold still on a swatch
export function drawPowderCursor(ctx, pt, hex, ring, pinching) {
  ctx.save();
  const r = pinching ? 8 : 12;
  if (hex) {
    ctx.fillStyle = hex;
    for (let k = 0; k < 7; k++) {               // a little heap of grains
      const a = k * 2.4, d = k ? r * 0.55 : 0;
      ctx.beginPath(); ctx.arc(pt.x + Math.cos(a) * d, pt.y + Math.sin(a) * d, r * (k ? 0.45 : 0.75), 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(pt.x, pt.y, r + 3, 0, Math.PI * 2); ctx.stroke();
  if (ring > 0) {
    ctx.lineWidth = 3.5; ctx.beginPath();
    ctx.arc(pt.x, pt.y, 21, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, ring)); ctx.stroke();
  }
  ctx.restore();
}
// beside the cursor while filling: the note to hum, and a gentle nudge
export function drawTuneHint(ctx, pt, swara, tune) {
  ctx.save();
  ctx.font = '600 17px Catamaran, sans-serif'; ctx.textAlign = 'left';
  const text = tune == null ? `hum ${swara}` : tune === 0 ? `${swara} ✓` : tune > 0 ? `${swara} · a little higher ↑` : `${swara} · a little lower ↓`;
  const w = ctx.measureText(text).width + 18, x = pt.x + 26, y = pt.y - 34;
  ctx.globalAlpha = 0.92; ctx.fillStyle = tune === 0 ? '#e7f3df' : '#f4ede0';
  ctx.beginPath(); ctx.roundRect(x, y - 18, w, 28, 14); ctx.fill();
  ctx.globalAlpha = 1; ctx.fillStyle = '#2b1a12'; ctx.fillText(text, x + 9, y + 3);
  ctx.restore();
}
export function drawSwatchCursor(ctx, pt, hex, dwell) {
  ctx.save();
  ctx.fillStyle = hex; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(pt.x, pt.y, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  if (dwell > 0) {
    ctx.lineWidth = 3.5; ctx.beginPath();
    ctx.arc(pt.x, pt.y, 19, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, dwell)); ctx.stroke();
  }
  ctx.restore();
}
