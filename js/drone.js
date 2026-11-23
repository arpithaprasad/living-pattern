// drone.js — a soft, synthesised tanpura-style drone (no samples, no rights
// issues). Classic four-string cycle: Pa (low) · Sa · Sa · Sa (low octave).
// It's the ground Carnatic music sits on — and it makes any hum sound musical.

export class Drone {
  constructor(ctx, sa = 138.59 /* C#3 */) {
    this.ctx = ctx;
    this.sa = sa;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 2200;
    this.out.connect(lp).connect(ctx.destination);
    this.bus = this.out;
    this.on = false;
    this.step = 0;
    this.next = 0;
    this.volume = 0.12;
  }

  toggle() { this.on ? this.stop() : this.start(); return this.on; }

  start() {
    if (this.on) return;
    this.on = true;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(this.volume, t, 0.6);
    this.next = t + 0.05;
    this.timer = setInterval(() => this._schedule(), 100);
  }

  stop() {
    this.on = false;
    clearInterval(this.timer);
    this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
  }

  _schedule() {
    const pattern = [0.75, 1, 1, 0.5];   // Pa(mandra), Sa, Sa, Sa(mandra)
    const gap = 1.1;                      // seconds between plucks
    while (this.next < this.ctx.currentTime + 0.3) {
      this._pluck(this.sa * pattern[this.step % 4], this.next);
      this.step++; this.next += gap;
    }
  }

  _pluck(f, t) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t + 4.2);
    // a resonant band sweeping down gives a hint of the tanpura's "jivari" buzz
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 2.5;
    bp.frequency.setValueAtTime(f * 9, t);
    bp.frequency.exponentialRampToValueAtTime(f * 3, t + 3.5);
    const dry = ctx.createGain(); dry.gain.value = 0.35;
    for (const [type, mul, detune] of [['sawtooth', 1, -4], ['sawtooth', 1, 4], ['sine', 2, 0]]) {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = f * mul; o.detune.value = detune;
      o.connect(bp); o.connect(dry);
      o.start(t); o.stop(t + 4.4);
    }
    bp.connect(g); dry.connect(g);
    g.connect(this.bus);
  }
}
