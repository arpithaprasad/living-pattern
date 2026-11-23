// Finds C4-symmetric single-line (sikku) patterns for a given grid size and
// writes SVG previews. Usage: node tools/find-defaults.mjs 4 [outDir]
import { Kolam, smoothLoop } from '../js/kolam.js';
import fs from 'node:fs';

const n = +(process.argv[2] || 4);
const outDir = process.argv[3] || '.';
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// one representative per C4 orbit
const k0 = new Kolam(n);
const reps = [], seen = new Set();
for (const [x, y] of k0.crossings()) {
  if (seen.has(x + ',' + y)) continue;
  for (const { p } of k0.images(x, y)) seen.add(p[0] + ',' + p[1]);
  reps.push([x, y]);
}

const found = [];
for (let trial = 0; trial < 20000 && found.length < 6; trial++) {
  const k = new Kolam(n);
  const pMirror = 0.25 + rand() * 0.5;
  for (const [x, y] of reps) if (rand() < pMirror) k.apply(x, y, rand() < 0.5 ? 1 : 2);
  const loops = k.loops();
  if (loops.length !== 1) continue;
  const sig = JSON.stringify(k.serialize().sort());
  if (found.some(f => f.sig === sig)) continue;
  found.push({ sig, k, mirrors: k.state.size, len: loops[0].length });
}

found.forEach((f, i) => {
  const s = 40, W = f.k.W;
  const poly = smoothLoop(f.k.loops()[0]).map(([x, y]) => `${x * s + 20},${y * s + 20}`).join(' ');
  const dots = f.k.dots().map(([x, y]) => `<circle cx="${x * s + 20}" cy="${y * s + 20}" r="4" fill="#555"/>`).join('');
  fs.writeFileSync(`${outDir}/default-${n}-${i}.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W * s + 40}" height="${W * s + 40}"><rect width="100%" height="100%" fill="#f7f2e9"/>${dots}<polyline points="${poly}" fill="none" stroke="#8a7fd1" stroke-width="4" stroke-linejoin="round"/></svg>`);
  console.log(i, 'mirrors', f.mirrors, 'pathLen', f.len, JSON.stringify(f.k.serialize()));
});
console.log('found', found.length);
