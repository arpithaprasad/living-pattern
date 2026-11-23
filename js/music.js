// music.js — call and response in raga Mayamalavagowla, the raga Carnatic
// students traditionally learn first, using its opening exercises
// (sarali varisai): Sa Ri Ga Ma · Pa Da Ni Sa …
// Synthesised in the browser: no recordings, no usage-rights issues.
// The app sings a phrase ("call"); you hum or sing it back ("response").
// Matching the notes is never required — the swaras give you something to
// sing along to, and a first taste of how Carnatic music is taught.

// Mayamalavagowla (just-intonation approximation): S R1 G3 M1 P D1 N3 S'
export const RATIO = [1, 16 / 15, 5 / 4, 4 / 3, 3 / 2, 8 / 5, 15 / 8, 2];
export const SWARA = ['Sa', 'Ri', 'Ga', 'Ma', 'Pa', 'Da', 'Ni', 'Ṡa'];

// Phrases live with each pattern's lesson in patterns.js: lists of [degree, beats].

export class Melody {
  constructor(ctx, sa = 277.18 /* C#4, an octave above the drone */) {
    this.ctx = ctx;
    this.sa = sa;
    this.beat = 0.5;
    this.out = ctx.createGain();
    this.out.gain.value = 0.22;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1800;
    this.out.connect(lp).connect(ctx.destination);
    this.live = new Set(); this.timers = [];
  }

  // cut off whatever is playing (used by the home button)
  stop() {
    this.timers.forEach(clearTimeout); this.timers = [];
    for (const o of this.live) { try { o.stop(); } catch {} }
    this.live.clear();
  }

  duration(phrase) { return phrase.reduce((a, [, b]) => a + b, 0) * this.beat; }

  // play a phrase; onNote(i) fires as each note starts
  play(phrase, onNote = () => {}) {
    const ctx = this.ctx;
    let t = ctx.currentTime + 0.05, prev = null;
    phrase.forEach(([deg, beats], i) => {
      const f = this.sa * RATIO[deg];
      const dur = beats * this.beat;
      this._note(f, prev, t, dur);
      this.timers.push(setTimeout(() => onNote(i), (t - ctx.currentTime) * 1000));
      prev = f; t += dur;
    });
    return t - ctx.currentTime;
  }

  _note(f, prev, t, dur) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + 0.05);
    g.gain.setValueAtTime(1, t + dur * 0.75);
    g.gain.linearRampToValueAtTime(0, t + dur * 0.97);
    g.connect(this.out);
    for (const [type, mul, amp] of [['triangle', 1, 0.8], ['sine', 2, 0.15]]) {
      const o = ctx.createOscillator();
      o.type = type;
      // a small glide into each note — a hint of Carnatic gamaka
      o.frequency.setValueAtTime((prev || f * 0.97) * mul, t);
      o.frequency.exponentialRampToValueAtTime(f * mul, t + 0.08);
      const a = ctx.createGain(); a.gain.value = amp;
      o.connect(a).connect(g);
      o.start(t); o.stop(t + dur);
      this.live.add(o); o.onended = () => this.live.delete(o);
    }
  }
}

// Sand: the soft hiss of rice flour falling from the fingers while you draw.
// Filtered noise whose level follows the drawing.
export class Sand {
  constructor(ctx) {
    this.ctx = ctx;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (0.6 + 0.4 * Math.random());
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 0.6;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    this.gain = ctx.createGain(); this.gain.gain.value = 0;
    src.connect(bp).connect(hp).connect(this.gain).connect(ctx.destination);
    src.start();
    this.level = 0;
  }
  set(level) {
    if (Math.abs(level - this.level) < 0.005) return;
    this.level = level;
    this.gain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.08);
  }
}
