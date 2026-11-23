// tutorial.js — the gesture warm-up (hands only, v1.4).
// Four tiles, one gesture each, in the order the levels use them:
//   Sweep · Drop a dot · Draw · Sprinkle colour
// Each tile fills as the camera sees the gesture, turns peacock with a ✓,
// and the next one lights up. With a mouse every gesture has a stand-in.

import { GLYPH } from './glyphs.js';
import { COPY } from './content.js';

const STEPS = COPY.warmup.steps;   // [{ key, name, how, mouse, why }]

export class Tutorial {
  constructor(root, { onDone, onPass }) {
    this.root = root;
    this.onDone = onDone;
    this.onPass = onPass || (() => {});
    this.active = false;
    this.handsReady = false;
    this.handsFailed = false;
    this.step = 0;
    root.querySelector('#tut-skip').onclick = () => this.finish(true);
    root.querySelector('#tut-next').onclick = () => (this.step >= STEPS.length ? this.finish(false) : this.skipStep());
    this.build();
  }

  build() {
    const $ = (s) => this.root.querySelector(s);
    $('#tut-title').textContent = COPY.warmup.title;
    $('#tut-text').textContent = COPY.warmup.sub;
    $('#tut-skip').textContent = COPY.warmup.skip;
    $('#tut-tiles').innerHTML = STEPS.map((s, i) => `
      <div class="lp-gesture" data-i="${i}">
        ${GLYPH[s.key]}
        <div class="lp-gesture__name">${s.name}</div>
        <div class="lp-gesture__how">${s.how}</div>
        <div class="lp-gesture__bar"><span></span></div>
      </div>`).join('');
    this.tiles = [...this.root.querySelectorAll('.lp-gesture')];
  }

  start() {
    this.active = true; this.step = 0; this.t0 = performance.now(); this.times = [];
    this.reset();
    this.render();
    this.root.classList.add('show');
  }

  reset() {
    this.prog = 0; this.stepT = 0; this.last = null; this.drops = 0;
    this.wasPinch = false; this.passed = false;
  }

  render() {
    this.tiles.forEach((t, i) => {
      t.classList.toggle('lp-gesture--done', i < this.step);
      t.classList.toggle('is-current', i === this.step);
      t.classList.toggle('is-next', i > this.step);
      t.querySelector('.lp-gesture__bar span').style.width = i < this.step ? '100%' : '0%';
    });
    const all = this.step >= STEPS.length;
    const nx = this.root.querySelector('#tut-next');
    nx.textContent = all ? COPY.warmup.go : COPY.warmup.skipOne;
    nx.classList.toggle('lp-btn--quiet', !all);
    this.root.querySelector('#tut-count').textContent = all ? COPY.warmup.allDone : `${this.step + 1} / ${STEPS.length}`;
    this.status(all ? COPY.warmup.ready : '');
  }

  status(text, ok = false) {
    const el = this.root.querySelector('#tut-status');
    if (el.textContent !== text) el.textContent = text;
    el.classList.toggle('ok', ok);
  }

  pass(how = 'gesture') {
    if (this.passed) return;
    this.passed = true;
    const s = STEPS[this.step];
    this.times.push(`${s.key} ${((performance.now() - this.t0) / 1000).toFixed(1)}s${how === 'gesture' ? '' : ' (' + how + ')'}`);
    this.onPass(s.key, how);
    this.tiles[this.step].querySelector('.lp-gesture__bar span').style.width = '100%';
    this.status(COPY.warmup.nice, true);
    setTimeout(() => {
      if (!this.active) return;
      this.step++; this.reset(); this.render();
    }, 900);
  }

  skipStep() { if (this.step < STEPS.length) this.pass('skipped'); }

  finish(skipped) {
    if (!this.active) return;
    this.active = false;
    this.root.classList.remove('show');
    const missed = this.times.filter((t) => t.includes('(skipped)')).map((t) => t.split(' ')[0]);
    this.summary = { skipped: skipped && this.step < STEPS.length ? STEPS[this.step].key : null, missed,
                     secs: (performance.now() - this.t0) / 1000, times: this.times.join(' · ') };
    this.onDone(this.summary);
  }

  // with a mouse, each click is a dot (counted on release, so a quick click is never missed)
  mouseUp() { if (this.active && !this.passed && STEPS[this.step] && STEPS[this.step].key === 'drop' && !this.handActive) this.drops++; }

  // a swipe event from the hand tracker counts as a sweep straight away
  swiped() { if (this.active && STEPS[this.step] && STEPS[this.step].key === 'sweep') this.pass(); }

  // every frame. inp: { hand, cursor:{x,y} 0..1 of the screen, pinching, open, rubbing, mouseDown }
  update(dt, now, inp) {
    if (!this.active || this.passed || this.step >= STEPS.length) return;
    const s = STEPS[this.step];
    this.stepT += dt;
    const c = inp.cursor, moved = c && this.last ? Math.hypot(c.x - this.last.x, c.y - this.last.y) : 0;
    const dx = c && this.last ? Math.abs(c.x - this.last.x) : 0;
    this.last = c;
    const hand = inp.hand;
    let gain = 0;

    if (s.key === 'sweep') {
      // an open hand travelling sideways (or, with a mouse, just moving across)
      if (hand ? inp.open : !!c) gain = dx / 0.9;
    } else if (s.key === 'drop') {
      // a pinch that opens again = one dot. Two dots and you have it.
      this.handActive = hand;
      if (hand) { if (this.wasPinch && !inp.pinching) this.drops++; this.wasPinch = inp.pinching; }
      this.prog = this.drops / 2;
    } else if (s.key === 'draw') {
      // keep pinching while the hand moves: the flour trails behind
      if (hand ? inp.pinching : inp.mouseDown) gain = moved / 0.4;
    } else if (s.key === 'rub') {
      if (hand ? inp.rubbing : inp.mouseDown) gain = dt / 1.2;
    }
    if (s.key !== 'drop') this.prog = Math.min(1, this.prog + gain);
    this.tiles[this.step].querySelector('.lp-gesture__bar span').style.width = `${Math.round(this.prog * 100)}%`;
    if (this.prog >= 1) { this.pass(); return; }

    // what to say under the tiles
    const W = COPY.warmup;
    if (!this.handsReady && !this.handsFailed) this.status(W.waking);
    else if (this.handsFailed) this.status(s.mouse);
    else if (!hand) this.status(this.stepT > 2 ? W.showHand : '');
    else if (s.key === 'sweep' && !inp.open) this.status(W.openUp);
    else if (s.key === 'drop' && this.drops === 1) this.status(W.oneMore);
    else if (this.prog > 0.05) this.status(W.keepGoing);
    else this.status(this.stepT > 6 ? s.why : '');
  }
}
