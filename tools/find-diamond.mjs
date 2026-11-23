import { Kolam, SHAPES, smoothLoop } from '../js/kolam.js';
import fs from 'node:fs';
const out = process.argv[2] || '/tmp/dia';
fs.mkdirSync(out, { recursive: true });
const base = new Kolam(5, SHAPES.diamond);
const reps = [], seen = new Set();
for (const [x, y] of base.crossings()) {
  if (seen.has(x + ',' + y)) continue;
  for (const { p } of base.images(x, y)) seen.add(p + '');
  reps.push([x, y]);
}
console.log('dots', base.dots().length, 'crossings', base.crossings().length, 'orbits', reps.length);
const res = [];
for (let code = 0; code < 3 ** reps.length; code++) {
  const k = new Kolam(5, SHAPES.diamond); k.symmetry = 'c4';
  let c = code;
  reps.forEach(([x, y]) => { const s = c % 3; c = Math.floor(c / 3); if (s) k.apply(x, y, s); });
  const L = k.loops().length;
  if (L === 1) res.push(k);
}
console.log('single-line', res.length);
res.forEach((k, i) => {
  const s = 40, poly = smoothLoop(k.loops()[0]).map(([x, y]) => `${x * s + 20},${y * s + 20}`).join(' ');
  const dots = k.dots().map(([x, y]) => `<circle cx="${x * s + 20}" cy="${y * s + 20}" r="5" fill="#fff"/>`).join('');
  fs.writeFileSync(`${out}/d${i}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="440"><rect width="100%" height="100%" fill="#6b5240"/><polyline points="${poly}" fill="none" stroke="#fff" stroke-width="7" stroke-linejoin="round"/>${dots}<text x="10" y="30" fill="#fff" font-size="22">${i}</text></svg>`);
  console.log(i, JSON.stringify(k.serialize()));
});
