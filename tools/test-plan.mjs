import { PATTERNS, planSections } from '../js/patterns.js';
for (const p of PATTERNS) { const pl = planSections(p.phrases, 25); console.log(p.lesson, pl.map(s => s.segs).join(' '), '=', pl.reduce((a, s) => a + s.segs, 0)); }
