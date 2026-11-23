// log.js — quiet usability-test logging. Records the metrics from the testing
// plan for each tester; nothing leaves the computer (kept in this browser's
// localStorage). Press L to see/copy/download, N for the next tester.

const KEY = 'living-pattern-test-sessions';

// hands-only version (v1.x)
const FIELDS = [
  ['tester', 'Tester #'],
  ['date', 'Date'],
  ['pattern', 'Levels played'],
  ['levels_done', 'Levels completed'],
  ['hand_tracking', 'Hand tracking'],
  ['warmup', 'Gesture warm-up (done / skipped at)'],
  ['warmup_s', 'Warm-up time (s)'],
  ['warmup_times', 'Warm-up: each gesture learnt at'],
  ['t_first_line', 'Time to first line drawn (s)'],
  ['t_complete', 'Time to first completed level (s)'],
  ['timeline', 'Timeline (level · step · seconds)'],
  ['sweep_s', 'Sweeping, total (s)'],
  ['open_palm_pct', 'Swept with open hand (% of hand time)'],
  ['dots_s', 'Laying dots, total (s)'],
  ['draw_s', 'Drawing, total (s)'],
  ['colour_s', 'Colouring, total (s)'],
  ['pickups', 'Flour / colour pickups'],
  ['pickups_pinch', '…by pinching'],
  ['pickups_hold', '…by holding / click'],
  ['flour_empty', 'Ran out of flour'],
  ['dots_pinch', 'Dots dropped by pinch-release'],
  ['dots_hold', 'Dots dropped by holding (fallback)'],
  ['dots_click', 'Dots dropped by mouse click'],
  ['off_path', 'Times the finger left the path'],
  ['pinch_breaks', 'Pinch let go mid-line'],
  ['colour_rub_s', 'Colouring by rubbing (s)'],
  ['colour_pinch_s', 'Colouring by plain pinch (s)'],
  ['shapes_coloured', 'Shapes coloured'],
  ['free_strokes', 'Lines in "Your own"'],
  ['facts_shown', 'Facts shown'],
  ['home_presses', 'Went back to the menu (⌂)'],
  ['completed', 'Completed any level'],
  ['notes', 'Observer notes (gestures, quotes, confusion)'],
];
// earlier voice + hand version: kept so old sessions still export
const LEGACY = [
  ['t_hum_ok', '[voice] Mic check passed (s)'], ['t_point_ok', '[voice] Hand check passed (s)'],
  ['gap_pauses', '[voice] Gap pauses'], ['avg_gap_wait', '[voice] Avg gap wait (s)'], ['auto_helps', '[voice] Auto-helps'],
  ['placed_by_pointing', '[voice] Lines placed by pointing'], ['placed_auto', '[voice] Lines placed automatically'],
  ['replays', '[voice] Phrase replays'], ['info_opened', '[voice] Opened info'], ['free_mode', '[voice] Tried free mode'],
  ['swipes', '[voice] Wave gestures'], ['pinch_fills', '[voice] Pinch fills'],
];
const ALL = [...FIELDS, ...LEGACY];

function load() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
function store(all) { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage unavailable */ } }

export class TestLog {
  constructor() { this.reset(); }

  reset() {
    this.t0 = null;
    this.waitStart = 0;
    this.waitTotal = 0;
    this.s = {
      tester: load().length + 1,
      date: new Date().toLocaleString(),
      pattern: '', levels_done: '', hand_tracking: '', t_first_line: '', t_complete: '', timeline: '',
      sweep_s: 0, open_palm_pct: '', dots_s: 0, draw_s: 0, colour_s: 0,
      pickups: 0, pickups_pinch: 0, pickups_hold: 0, flour_empty: 0,
      dots_pinch: 0, dots_hold: 0, dots_click: 0, off_path: 0, pinch_breaks: 0,
      colour_rub_s: 0, colour_pinch_s: 0, shapes_coloured: 0, free_strokes: 0,
      facts_shown: 0, home_presses: 0, completed: 'no', notes: '',
      // legacy (voice version) — unused now
      t_hum_ok: '', t_point_ok: '', gap_pauses: 0, avg_gap_wait: '', auto_helps: 0,
      placed_by_pointing: 0, placed_auto: 0, replays: 0, info_opened: 'no', free_mode: 'no', swipes: 0, pinch_fills: 0,
    };
  }

  begin() { this.t0 = performance.now(); }
  get active() { return this.t0 !== null; }
  secs() { return this.t0 === null ? '' : ((performance.now() - this.t0) / 1000).toFixed(1); }

  // record the time of the first occurrence only
  first(field) { if (this.active && this.s[field] === '') this.s[field] = this.secs(); }
  count(field) { if (this.active) this.s[field] = (+this.s[field] || 0) + 1; }
  add(field, v) { if (this.active) this.s[field] = +((+this.s[field] || 0) + v).toFixed(1); }
  append(field, text, sep = ' · ') { if (this.active) this.s[field] = this.s[field] ? this.s[field] + sep + text : text; }
  set(field, v) { if (this.active) this.s[field] = v; }

  gapStart() { if (!this.active) return; this.s.gap_pauses++; this.waitStart = performance.now(); }
  gapEnd() {
    if (!this.active || !this.waitStart) return;
    this.waitTotal += (performance.now() - this.waitStart) / 1000; this.waitStart = 0;
    this.s.avg_gap_wait = (this.waitTotal / this.s.gap_pauses).toFixed(1);
  }

  save() {
    if (!this.active) return;
    const all = load();
    const i = all.findIndex(x => x.tester === this.s.tester && x.date === this.s.date);
    if (i >= 0) all[i] = { ...this.s }; else all.push({ ...this.s });
    store(all);
  }

  static all() { return load(); }
  static clear() { store([]); }
  static fields() { return FIELDS; }   // the panel shows the current version's fields

  static csv(rows) {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    return [ALL.map(([, h]) => esc(h)).join(','), ...rows.map(r => ALL.map(([k]) => esc(r[k])).join(','))].join('\n');
  }

  text() { return FIELDS.map(([k, h]) => `${h}: ${this.s[k]}`).join('\n'); }
}
