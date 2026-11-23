import { Kolam, DEFAULTS } from '../js/kolam.js';
import assert from 'node:assert';
const k = new Kolam(5); k.load(DEFAULTS[5]);
assert.equal(k.loops().length, 1, 'default is one line');
const all = k.loops().flat();
for (const [x,y] of all) assert.equal((x+y)%2, 1, 'never touches a dot');
let split=0, kept=0, guidedNoop=0;
for (const [x,y] of k.crossings()) {
  const t = new Kolam(5); t.load(DEFAULTS[5]);
  t.twist(x,y,false); t.loops().length===1 ? kept++ : split++;
  const g = new Kolam(5); g.load(DEFAULTS[5]);
  const ch = g.twist(x,y,true); assert.equal(g.loops().length,1,'guided keeps one line');
  if (!ch.length) guidedNoop++;
}
console.log('free twists: keep one line', kept, '/ split', split, '| guided no-op crossings', guidedNoop, 'of', k.crossings().length);
console.log('ok');
