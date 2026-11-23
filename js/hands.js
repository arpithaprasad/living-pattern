// hands.js — MediaPipe hand tracking + three gestures:
//   point  → a cursor (between thumb and index tip)
//   pinch  → fires onPinch once per pinch
//   swipe  → an open hand moving quickly sideways fires onSwipe

import { HandLandmarker, FilesetResolver }
  from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/vision_bundle.mjs';

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class Hands {
  constructor() {
    this.present = false;
    this.cursor = null;     // {x, y} normalised, already mirrored (0..1)
    this.pinching = false;
    this.openPalm = false;
    this.rub = 0; this.rubbing = false;
    this.onPinch = () => {};
    this.onSwipe = () => {};
    this._lastVideoTime = -1;
    this._trail = [];
    this._swipeCooldown = 0;
  }

  async init() {
    const fileset = await FilesetResolver.forVisionTasks(WASM);
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: 'VIDEO', numHands: 1,
      minHandDetectionConfidence: 0.5, minTrackingConfidence: 0.5,
    });
    try { this.lm = await HandLandmarker.createFromOptions(fileset, opts('GPU')); }
    catch { this.lm = await HandLandmarker.createFromOptions(fileset, opts('CPU')); }
  }

  update(video, now) {
    if (!this.lm || video.readyState < 2 || video.currentTime === this._lastVideoTime) return;
    this._lastVideoTime = video.currentTime;
    const res = this.lm.detectForVideo(video, now);
    const h = res.landmarks && res.landmarks[0];
    if (!h) { this.present = false; this.pinching = false; this.rub = 0; this.rubbing = false; this._trail = []; return; }
    this.present = true;

    // mirror x so it matches the selfie view
    const P = h.map(p => ({ x: 1 - p.x, y: p.y }));
    const size = dist(P[0], P[9]) || 0.1;                 // wrist → middle knuckle
    const pinchD = dist(P[4], P[8]) / size;

    const target = { x: P[8].x, y: P[8].y };   // index fingertip
    this.cursor = this.cursor
      ? { x: this.cursor.x + (target.x - this.cursor.x) * 0.45, y: this.cursor.y + (target.y - this.cursor.y) * 0.45 }
      : target;

    // pinching drags the index tip toward the thumb, so report where the
    // finger was pointing just *before* the pinch started
    this._hist = (this._hist || []).filter((e) => now - e.t < 400);
    this._hist.push({ t: now, c: this.cursor, d: pinchD });
    // pinch with hysteresis; pinchCursor = where the finger pointed just
    // *before* the pinch closed (pinching drags the tip toward the thumb)
    if (!this.pinching && pinchD < 0.34) {
      this.pinching = true;
      const before = this._hist.find((e) => now - e.t <= 250 && e.d > 0.45) || this._hist[0];
      this.pinchCursor = before ? before.c : this.cursor;
      this.onPinch(this.pinchCursor);
    }
    else if (this.pinching && pinchD > 0.5) { this.pinching = false; this.pinchCursor = null; }

    // rubbing: the thumb tip sliding against the fingertips (to crumble
    // coloured powder). Measured as the thumb's speed relative to the index /
    // middle fingertips, while it stays close to them.
    const ref = { x: (P[8].x + P[12].x) / 2, y: (P[8].y + P[12].y) / 2 };
    const rel = { x: (P[4].x - ref.x) / size, y: (P[4].y - ref.y) / size };
    const close = Math.hypot(rel.x, rel.y) < 0.75;
    if (this._rel && this._relT) {
      const dt = Math.max(0.016, (now - this._relT) / 1000);
      const v = Math.hypot(rel.x - this._rel.x, rel.y - this._rel.y) / dt;
      this.rub += ((close ? Math.min(v, 6) : 0) - this.rub) * 0.3;
    }
    this._rel = rel; this._relT = now;
    this.rubbing = this.rub > 0.9;
    this.pinchD = pinchD;

    // open palm = four fingertips well away from the wrist
    const ext = [[8, 6], [12, 10], [16, 14], [20, 18]]
      .filter(([tip, pip]) => dist(P[tip], P[0]) > dist(P[pip], P[0]) * 1.12).length;
    this.openPalm = ext >= 4 && pinchD > 0.5;

    // swipe: open palm travels > 35% of the frame sideways within 400 ms
    this._trail.push({ t: now, x: P[9].x, y: P[9].y });
    while (this._trail.length && now - this._trail[0].t > 400) this._trail.shift();
    if (this.openPalm && now > this._swipeCooldown && this._trail.length > 3) {
      const a = this._trail[0], b = this._trail[this._trail.length - 1];
      if (Math.abs(b.x - a.x) > 0.35 && Math.abs(b.y - a.y) < 0.2) {
        this._swipeCooldown = now + 1200; this._trail = [];
        this.onSwipe(b.x > a.x ? 1 : -1);
      }
    }
  }
}
