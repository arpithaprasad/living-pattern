import { Kolam } from '../js/kolam.js';
import { DrawEngine } from '../js/pen.js';
import fs from 'node:fs';
let seed = +(process.argv[2]||3); const rnd=()=>((seed=(seed*16807)%2147483647)/2147483647);
const out = process.argv[3];
let svgs=[];
for (let trial=0; trial<6; trial++) {
  const k = new Kolam(5); const e = new DrawEngine(k);
  let finger=[rnd()*10, rnd()*10], steps=0, lines=0;
  while (!e.complete && steps < 20000) {
    if (rnd()<0.02) finger=[rnd()*10, rnd()*10];
    const ev = e.advance(1/60, finger, 0.5, 0.5); steps++;
    if (ev==='lineClosed') lines++;
  }
  const loops = k.loops().length;
  console.log('trial',trial,'complete',e.complete,'seconds',(steps/60).toFixed(1),'pen lines',e.lines.length,'kolam loops',loops,'decided',e.decided.size,'/40');
  if (out) {
    const s=36, c=5; let paths='';
    for (const ln of e.lines) for (let r=0;r<4;r++){
      const pts=ln.samples.map(p=>{let q=[p.x,p.y]; for(let i=0;i<r;i++) q=[2*c-q[1],q[0]]; return `${q[0]*s+18},${q[1]*s+18}`;});
      paths+=`<polyline points="${pts.join(' ')}" fill="none" stroke="hsl(${250+r*0},50%,55%)" stroke-width="3"/>`; }
    const dots=k.dots().map(([x,y])=>`<circle cx="${x*s+18}" cy="${y*s+18}" r="3.5" fill="#555"/>`).join('');
    svgs.push(`<svg xmlns="http://www.w3.org/2000/svg" width="396" height="396"><rect width="100%" height="100%" fill="#f7f2e9"/>${dots}${paths}</svg>`);
  }
}
if (out) svgs.forEach((s,i)=>fs.writeFileSync(`${out}/pen-${i}.svg`, s));
