// voice.js — microphone loudness + rough pitch. No notes, no scoring:
// we only need "is someone making a sound", "how loud", "higher or lower".

export class Voice {
  constructor(ctx) {
    this.ctx = ctx;
    this.level = 0;        // smoothed RMS
    this.loud = 0;         // 0..1 loudness above threshold
    this.active = false;   // currently vocalising?
    this.pitch = 0;        // Hz (smoothed), 0 if unknown
    this.pitchT = 0.5;     // 0 (low) .. 1 (high)
    this.floor = 0.004;    // ambient noise estimate
    this.calibFrames = 0;
    this.fake = null;      // keyboard "hum" for testing: {loud, pitchT}
    this._frame = 0;
  }

  async start() {
    const stream = await navigator.mediaDevices.getUserMedia({
      // autoGainControl boosts quiet laptop/phone mics; echoCancellation keeps
      // the drone from drawing by itself
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true },
    });
    const src = this.ctx.createMediaStreamSource(stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.buf = new Float32Array(this.analyser.fftSize);
    src.connect(this.analyser);
  }

  get threshold() { return Math.max(0.008, this.floor * 3); }

  // 0..1 for a meter; the threshold sits at 40%
  get meter() { return Math.min(1, this.level / (this.threshold * 2.5)); }

  update() {
    if (this.fake) {
      this.active = true; this.loud = this.fake.loud; this.pitchT = this.fake.pitchT; this.pitch = 138.59 * Math.pow(2, this.fake.pitchT); this.level = this.threshold * (1.3 + this.fake.loud * 1.2);
      return;
    }
    if (!this.analyser) return;
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(sum / this.buf.length);
    this.level += (rms - this.level) * 0.35;

    // first ~1.5s: learn the room's noise floor; afterwards drift slowly when quiet
    // (use a low percentile, so someone humming straight away doesn't
    // become "the noise floor")
    if (this.calibFrames < 90) {
      (this._calib ||= []).push(this.level);
      if (++this.calibFrames === 90) {
        const s = this._calib.sort((a, b) => a - b);
        this.floor = Math.min(0.015, Math.max(0.002, s[Math.floor(s.length * 0.2)]));
      }
    } else if (!this.active) {
      this.floor += (Math.min(0.015, this.level) - this.floor) * 0.002;
    }

    const thr = this.threshold;
    // raw on/off with hysteresis…
    if (!this.raw && this.level > thr * 1.25) this.raw = true;
    else if (this.raw && this.level < thr * 0.75) this.raw = false;
    const now = performance.now();

    // pitch: only a periodic sound (a hum or a sung note) has one. Noise —
    // the room, a tap, or the app's own flour sound — does not, so it can't
    // draw by itself.
    if (this.raw && (this._frame++ % 2 === 0)) {
      const f = yin(this.buf, this.ctx.sampleRate);
      if (f > 0) {
        this._recent = [...(this._recent || []).slice(-4), f];       // median of the last 5
        const med = [...this._recent].sort((x, y) => x - y)[this._recent.length >> 1];
        this.lastPitchAt = now;
        this.pitch = this.pitch ? this.pitch * Math.pow(med / this.pitch, 0.35) : med;
        this.learnRange(this.pitch);
        // remember the voice's usual note (median of everything hummed so far)
        if (!this._histAt || now - this._histAt > 100) { this._histAt = now; (this.hist ||= []).push(this.pitch); if (this.hist.length > 900) this.hist.shift(); }
        const t = (Math.log2(this.pitch) - Math.log2(this.lo)) / (Math.log2(this.hi) - Math.log2(this.lo));
        this.pitchT += (Math.min(1, Math.max(0, t)) - this.pitchT) * 0.3;
      }
    }
    const voiced = this.lastPitchAt && now - this.lastPitchAt < 300;

    // …then debounce: start after ~0.1s of voiced sound, stop after ~0.35s
    // without it, so breaths and tiny dips don't chop the line
    if (this.raw && voiced) { this.lastOn = now; this.onSince ||= now; } else this.onSince = 0;
    if (!this.active && this.onSince && now - this.onSince > 100) this.active = true;
    else if (this.active && !(this.raw && voiced) && now - this.lastOn > 350) this.active = false;

    // loudness eases toward its target instead of jumping
    const target = Math.min(1, Math.max(0, (this.level - thr) / (thr * 6)));
    this.loud += (target - this.loud) * 0.06;
  }

  // "high" and "low" are relative to YOUR voice: the range starts as about an
  // octave around your first note and widens as you go higher or lower
  // your comfortable humming note: the median of what you've hummed
  naturalPitch() {
    if (!this.hist || this.hist.length < 8) return 0;
    const h = [...this.hist].sort((a, b) => a - b);
    return h[h.length >> 1];
  }

  learnRange(p) {
    if (!this.lo) { this.lo = p / 1.45; this.hi = p * 1.45; return; }
    if (p < this.lo) this.lo = p;
    if (p > this.hi) this.hi = p;
  }
}

// Minimal YIN pitch estimate. Returns Hz or -1.
export function yin(buf, sr) {
  const maxLag = Math.min(Math.floor(sr / 70), buf.length >> 1);
  const minLag = Math.floor(sr / 900);
  const W = buf.length - maxLag;
  const d = new Float32Array(maxLag + 1);
  for (let tau = 1; tau <= maxLag; tau++) {
    let s = 0;
    for (let i = 0; i < W; i++) { const v = buf[i] - buf[i + tau]; s += v * v; }
    d[tau] = s;
  }
  // cumulative mean normalised difference
  let run = 0;
  for (let tau = 1; tau <= maxLag; tau++) { run += d[tau]; d[tau] = d[tau] * tau / (run || 1); }
  for (let tau = minLag; tau < maxLag; tau++) {
    if (d[tau] < 0.2) {
      while (tau + 1 < maxLag && d[tau + 1] < d[tau]) tau++;
      const a = d[tau - 1], b = d[tau], c = d[tau + 1];
      const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
      return sr / (tau + (isFinite(shift) ? shift : 0));
    }
  }
  return -1;
}
