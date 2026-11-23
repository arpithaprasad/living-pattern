import { Kolam, SHAPES } from '../js/kolam.js';
import { DrawEngine } from '../js/pen.js';
import { PATTERNS, planSections } from '../js/patterns.js';
for (const pat of PATTERNS) {
  const k = new Kolam(5, SHAPES[pat.shape || 'square']);
  const e = new DrawEngine(k, { reference: pat.state, speed: 1.3 });
  const plan = planSections(pat.phrases, e.totalSegs / e.rotations, pat.segments);
  e.begin(); let si = 0, steps = 0; const ends = [];
  e.stopAfter = e.entered + plan[0].segs;
  while (!e.complete && steps < 50000) {
    steps++;
    let finger = null;
    const up = e.waiting || e.upcoming();
    if (up && !e.isBoundary(up.q)) { const o = e.refOut(up.q, up.d); finger = [up.q[0] + o[0], up.q[1] + o[1]]; }
    const ev = e.advance(1 / 60, finger, 0.5, 0.5);
    if (ev === 'hold' || ev === 'lineClosed') {
      ends.push(ev); si++;
      if (!e.pen) e.beginNext();
      e.stopAfter = e.entered + plan[si].segs;
    }
  }
  const same = JSON.stringify([...k.state].filter(([, v]) => v).sort()) === JSON.stringify([...pat.state].sort());
  console.log(pat.name, '| sections', plan.length, 'ended', ends.length + 1, '| complete', e.complete, '| lines', k.loops().length, '| matches reference', same, ends.join(','));
}
