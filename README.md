# The Living Pattern — prototype v1.4 (hands only)

**Your finger draws. Your voice is the rice flour.**
Hum and a line appears; stop and it waits. At every gap between dots, the line turns toward your finger (straight on, or curving left/right), so it always follows kolam rules. With 4-way symmetry, three mirror pens copy you, so the result is always balanced. When your line joins back up it closes. If one line covers all 25 dots, you've drawn a sikku kolam. Wave sideways to sweep it away.

INFO 680 · Pratt · core-loop prototype for testing.

## Run it on your laptop

You need a local server, because browsers only allow the camera and mic on `localhost` or `https`.

```bash
cd living-pattern
python3 -m http.server 8000
```

Then open **http://localhost:8000** in Chrome. Click **Begin** and allow the camera and mic.

## Put it on a phone (GitHub Pages, free)

1. Create a new GitHub repo and upload everything in this folder.
2. Go to repo **Settings → Pages → Deploy from branch → `main` / root**.
3. After a minute you get `https://<you>.github.io/<repo>/`. Open that link on any phone and prop the phone up.

## v1.4 — gesture warm-up + the new look
- **Gesture warm-up** after Begin: four tiles (Sweep · Drop a dot · Draw · Sprinkle colour) with the illustrated hands. Each fills as the camera sees the gesture, turns green with a ✓, then the next lights up. "skip this one" / "skip warm-up" are there if a gesture won't register. ✋ opens it again any time. Skip it for a session with `?tutorial=0`. With a mouse: move across · click twice · hold and drag · hold.
- Logged per tester: `warmup` (done / skipped which), `warmup_s`, `warmup_times` (when each gesture was learnt).
- **Design system applied**: paper cards with the printed shadow, Rozha One titles (Transcity is used instead if it's installed on the computer), Catamaran text, marigold buttons, arch-framed level cards and photo, kolam border on the start screen, peacock "Did you know?" note. Fonts are bundled in `assets/fonts`, so they work offline.
- The microphone is no longer requested (hands only). Add `?voice=1` for the old voice modes.

## v1.3 — test logging for the hands-only version
Press **L** for the panel, **N** for the next tester, **Download all (.csv)** at the end. Saved automatically every 5 s and at every step change. Recorded per tester:
levels played / completed · hand tracking ok? · time to first line, to first completed level · **timeline** (e.g. `L1 sweep 23s · L1 dots 41s · L1 draw 95s · L1 ✓`) · total seconds sweeping / laying dots / drawing / colouring · % of sweeping done with an open hand · pickups (by pinch vs hold) · times the flour ran out · dots by pinch-release vs hold-fallback vs click · times the finger left the path · pinch let go mid-line · colouring seconds by rubbing vs plain pinch · shapes coloured · lines in "Your own" · facts shown · times ⌂ was pressed · observer notes.
Old voice-version sessions still export (their columns are marked [voice]).

## v1.2 — gestures that match the real actions
- **Sweep**: an open, flat hand is a wide broom (reach 1.7); a pointing finger only nudges (0.55). The broom drawn under your hand widens to match.
- **Dots**: pinch over a mark, then open your fingers: the dot drops when you let go. (Holding still on a mark for 1.2 s still works, as a fallback.)
- **Drawing** (guided levels and Your own): pinch at "start here", then keep pinching while you pull; the flour only falls while your fingers are together. `?pinch=0` turns this off (just pull with your finger).
- **Colours**: rub your thumb against your fingertips over a shape to crumble the powder in (`hands.rubbing`: thumb speed relative to the index/middle tips while close to them). A plain pinch sprinkles at 40% speed.
- Mouse: holding the button = pinching / rubbing, releasing = opening your fingers.
- The cursor ring is solid lavender while your fingers are pinched, dashed when open.

## v1.1
- Fixed "Done colouring" / "Done drawing" (the finish event was lost; the reveal now opens).
- **"Did you know?" facts**: 15 short kolam facts (`COPY.facts`) drift in at the top left after sweeping, when drawing starts, sometimes after a line, and now and then while laying dots, colouring or free drawing. No repeats until all are shown; at most one every 20 s.

## What's new in v1.0 — hands only
The voice + hand version is backed up in `~/Downloads/living-pattern-v0.26-voice-backup` (and v0.10 in `-v0.10-backup`).

Every level is now the doorstep ritual, done by hand (`js/ritual.js`, tuning numbers in `TUNE` at the top):
- **Sweep** the leaves and dust (move your hand like a broom) → **water** is sprinkled (animation) → **pinch rice flour** from the bowl (or hold your finger in it; it runs out as you work and you go back for more) → **lay the dots** (hold on each mark) → **draw**.
- **Guided drawing**: rest on "start here", then pull the pen along the path. The pen only moves when your finger moves along the path (up to 8 units/s, your finger must stay within 0.8 dot-spacings), so the line stays clean but you do the drawing; a little of your hand's wobble (≤0.1) stays in the line. At crossings the pen keeps its direction (it follows the first stretch of path within reach).

| # | Level | What you do |
|---|---|---|
| 1 | At the threshold | lotus kolam; draw a quarter of each line, it appears four times (symmetry) |
| 2 | On your own | the same kolam, every line in full |
| 3 | Festival colours | pinch coloured powder from 6 bowls, rest on a shape and it sprinkles in (powder runs out too) |
| 4 | Beyond dots | the flower & star kolam, 21 motif strokes, mirrored |
| 5 | Your own | freehand on 25 dots, mirrored four ways; rest to put the flour down |

Open a level directly: `?level=1` … `?level=5`. The hum tutorial is off (`?tutorial=1` brings it back). Run with `python3 serve.py` (no browser caching).

## What's new in v0.26
- **New first level, "At the threshold" (hands only, no singing)** — `js/threshold.js`. Open directly with `?mode=threshold` (skips the hum tutorial).
  1. **Sweep**: leaves and dust cover the doorstep; move your hand across them like a broom (the debris is carried along with your hand's motion). Nearly clean → the rest blows away.
  2. **Water**: a short animation darkens the ground ("water is sprinkled so the flour holds").
  3. **Dots**: dashed marks show the 13 pulli; hold your finger on each (~0.35 s) to drop a dot.
  4. **Draw**: the lotus kolam's 3 lines appear faintly. Rest on "start here", then trace: the flour follows your finger (not the guide), as long as you stay within ~0.6 dot-spacings of the path; off the path it stops and asks you to come back. Each line closes with a small chime; then the reveal, and Level 3 colours the kolam you drew.
- Levels list now numbered by position (this is #1; the old levels are #2–#6). Drone plays softly during the ritual; no melody leads.

## What's new in v0.25
- **Settle before pouring**: your finger has to rest on a shape ~0.4 s before powder drops (and before the note reminder plays), so sliding across the kolam while humming doesn't sprinkle the shapes on the way.

## What's new in v0.24
- **Sprinkled fills**: powder lands all over the shape at once and gets denser as you hum (random pixel order), instead of a disc growing from the fingertip — partial fills look speckled and always stay inside the lines. Pouring a new colour over a shape replaces the old one cleanly.

## What's new in v0.23
- **Each colour is a swara** (indigo Sa · green Ri · turmeric Ga · saffron Ma · red Pa · pink Da, Mayamalavagowla on the drone's Sa, any octave). Picking a colour up plays its note (pinch it again to replay; it also replays when you reach a new empty shape). Hum the note over a shape: in tune (±1.6 semitones) fills in ~1 s, off the note fills slowly (~4.5 s) with a "a little higher ↑ / lower ↓" nudge. Progress is kept per shape, so stopping never loses it. The app's own note is ignored for 1.2 s so it can't fill shapes itself.

## What's new in v0.22
- Colour fills one shape at a time (no automatic symmetric twins).
- Easier pouring: a soft hum fills a shape in about a second (loudness only speeds it a little).

## What's new in v0.21
- **Colour like real kolam powder**: pinch a colour to pick it up (or hold still on it ~0.7 s; click with a mouse); your cursor becomes a pinch of that powder. Point at a shape and **hum to pour**: it spreads while you hold the note (louder = faster), pauses when you stop, and fills the matching shapes too. Click pours instantly (testing). Pinch detection loosened (0.34 / 0.5). Voice meter shows again in colouring.

## What's new in v0.20
- **Colours climb like a scale**: your low note (first hum in colouring; moves down if you settle lower) = indigo at the bottom; each whole tone higher = the next colour up (pink ≈ 10 semitones above). Starts on indigo. Pointing only fills.

## What's new in v0.19
- **Hum to pick a colour, relative to your own voice.** Your usual humming note (median of everything you've hummed this session) = turmeric; each ~2.5 semitones lower/higher moves one colour (indigo is ~5 semitones below your usual note). Hold ~0.45 s to lock. "You" marker + ring show where your voice is heading. Low colours now at the bottom of the column. Pointing is only for filling (swatches can't be picked by pointing; a mouse click still picks, for testing).

## What's new in v0.18
- **Colouring is one gesture: point and hold.** Hold on a swatch (~0.6 s, ring closes) to pick a colour; hold on a shape (~0.7 s) to fill it and its matching shapes. Pinch-to-fill removed (didn't register reliably). Wave / arrow keys still step through colours as extras.

## What's new in v0.17
- **Fixed split shapes in colouring**: quarter-lines were being "closed" with a straight chord in the colour mask, cutting fake walls through the loops and making fake shapes outside the kolam.
- **Wave to change colour** (open hand sideways; arrow keys or clicking a swatch also work). Pointing no longer picks colours.
- **Pinch and hold to fill**: hold the pinch ~0.5 s on a shape; the ring around the cursor fills, then the shape pours. Aim locks where you pointed just before pinching. No more fill-by-hovering.

## What's new in v0.16
- **Simpler reveal**: just "Next: <level> →" and "Menu" ("Keep drawing" only on the last level). What's-a-kolam stays under the ? button.
- **Colouring is hand-only**: point at a swatch to pick a colour; point at a shape and **pinch** to fill (click works; holding still 1.4 s is a fallback). Pinch uses where the finger was just *before* the pinch, so the aim doesn't slip.
- **Colour the shape**: one fill also colours its matching shapes around the kolam (rotations/mirrors of the same size). On motif kolams a whole motif (flower, star, eye) is one shape, not the slivers between its strokes.
- Log: new `pinch_fills` count.

## What's new in v0.15
- **⌂ home button** (or Esc / H): stops the lesson and the melody, clears the canvas, back to the level path.
- **Drone only during lessons**: the tanpura plays while you're drawing (levels 1, 2, 4, 5) and fades out on menus, intros, reveals, colouring and the tutorial. ♪ now mutes it for the session.

## What's new in v0.14
- **Only real hums and sung notes draw.** The line needs a detectable pitch, so room noise and the app's own flour sound can't keep it drawing (tested: hums from 82 to 440 Hz are detected accurately; noise never is).
- **High and low are relative to your voice:** the pitch range starts around your first note and widens as you go. A marker labelled 'you' shows where your voice is beside the colours.
- **Level 4 is bigger** (and so is colouring it), and pointing near a shape snaps to it. Level 4 also draws only while you sing, at a gentler speed.

## v0.13
- **Colouring split between voice and hand:** sing higher or lower to choose a colour (it only switches after you hold the pitch for about half a second). Point at a shape and it lights up in your colour; hold for half a second (or click) and the whole shape fills.
- **Level 4 motifs no longer overlap** (re-spaced and slightly smaller).
- **Camera back in a small corner window;** the kolam is drawn on a plain threshold surface.

## v0.12: levels
A **path of five doorsteps** replaces the pattern picker. Each level teaches one new idea about kolam and takes away a little help.

| Level | Teaches | Interaction | Engine |
|---|---|---|---|
| 1 Dots & symmetry | pulli, loops around dots, symmetry | sing, point at gaps, lift and place; mirror pens copy you | dot-grid engine (`pen.js`, `kolam.js`) |
| 2 On your own | kolam is drawn by one hand | no mirror pens: draw every part (longer song) | dot-grid engine |
| 3 Festival colours | colour for festivals | point at a shape + hum = pour powder; pitch picks the colour | colour engine (`colour.js`) |
| 4 Beyond dots | motif kolams placed by eye | one motif per phrase, lift and place between motifs, then colour | path engine (`motifs.js`) |
| 5 Your own | free creation | finger picks every turn, then colour | dot-grid engine |

- Level 4's flower-and-star kolam is rebuilt from a doorstep photo (`assets/motif-kolam.jpg`): the placement matches, the curves are approximations. Photo credits are listed below.
- After any kolam: **Add festival colours →** colours what you just drew.
- The placeholder patterns are hidden. Only real references appear.

## v0.11: look, learning, feel
- **Rice flour on a threshold.** Lines are powdery white flour with a faint tint from your pitch, on a dark stone or earth surface. The camera fills the screen as that surface (darkened and warmed), and your fingertip cursor sits on your real finger. The UI cards keep the pastel paper style.
- **A learning arc.** Discover (what kolam is, with a photo and sources) → pick a kolam → **See how it's built** (dots appear, each line draws itself, the rules, symmetry) → Learn it (call and response) → **Reflect** (yours next to the real one, the rule you followed, sources) → Make your own.
- **Feel.** Flour sprinkles from the pen with a soft sandy sound while you draw. After the first phrase, prompts only appear if you stay quiet.
- The animation loop keeps running even if a frame errors, so test sessions can't freeze.
- Your previous working version is in `~/Downloads/living-pattern-v0.10-backup`.

## v0.10
- **Smoother singing in learn mode:** your voice starts each stretch and the phrase carries it. Gaps up to 1.5 s (between syllables, breaths, a late start) no longer stop the line. Each stretch finishes in about 85% of its phrase, and thickness holds steady through gaps. Pointing past a gap also keeps the line going. Tune with `carryMs` and `carryFinish` in `js/main.js`.

## v0.9 — user-testing tools
- **Press L** for the test log: what this tester did, measured automatically. It covers mic and hand checks passed, time to first line, gap pauses and average wait, auto-helps, lines placed by pointing vs automatically, phrase replays, completion and time, "What's a kolam?" opened, free mode tried, wave gestures, and whether hand tracking worked. Type observer notes (sang or hummed, quotes) in the box.
- **Press N** (or "Next tester") to save the session and go back to the start screen with the intro, ready for the next person.
- **Download all (.csv)** exports every saved session for your synthesis. Sessions are kept in this browser only; nothing is uploaded.

## v0.8
- **Lift and place between lines.** When a line closes, it glows and a label says "line 1 of 3 complete". The pen lifts and the next line's outline lights up. Point at the glowing start to begin the next line (it starts on its own after 4.5 s). Progress beads are grouped by line, and finished lines step back slightly.

## v0.7
- **First real pattern: Lotus kolam.** The central knot of a traditional lotus kolam on a 13-dot diamond (1-3-5-3-1): an outer weave, a middle line around the corners, and a small circle round the centre dot. The lesson (Sarali varisai 1) follows the lines and ends at the centre on a long Sa. The reveal shows the original photo (`assets/lotus-kolam.jpg`): credit its source in your documentation.
- The engine now supports dot shapes beyond squares (`SHAPES` in `js/kolam.js`) and multi-line kolams in learn mode.

## v0.6
- Each pattern has its own beginner lesson: Sarali varisai 1 → Sarali varisai 2 → Janta varisai 1 (`js/patterns.js`). Phrases are split across the kolam to fit, and every kolam ends on a long held Sa.
- At a gap the line pauses, and just pointing the right way is enough (no need to keep singing). If you're stuck for 5 s, it shows you the way.
- Prompts say singing the swaras or humming both work.

## v0.5
- Smoother line: the mic waits ~0.1 s before starting and ignores dips shorter than ~0.35 s; thickness and colour ease instead of jumping.
- Music is now Sa Ri Ga Ma: raga Mayamalavagowla, sarali varisai phrases. The swaras show under the kolam and along the glowing stretch, and light up as they play and as you draw.

## v0.4 — Learn mode
- **Pick a kolam to learn** from 3 reference cards. ⚠ These are placeholders in `js/patterns.js`; swap in documented traditional patterns.
- **Call and response** in raga Mohanam (`js/music.js`): the app sings a short phrase while the next stretch of line glows, and you hum it back to draw it. Notes never need to match. If you stay quiet, it sings the phrase again.
- **You must point the right way** at each gap. The line waits at the glowing arrow until your finger points along it (the arrow turns green).
- About 9 phrases make a whole kolam (beads at the top). Then "Make your own →" opens free mode.
- `node tools/test-guided.mjs` checks that following the arrows reproduces each pattern exactly.

## What's new in v0.3
- **New interaction:** the finger steers and the voice draws. Pinch is gone.
- At the next gap, faint arrows show the 3 possible ways, and the solid one is where your finger is taking it.
- The camera is a small picture in the top-left corner, with your fingertip marked.
- The engine is in `js/pen.js`, and `node tools/test-pen.mjs` simulates random fingers.

## How to play
| Do this | What happens |
|---|---|
| Hum, sing, "mmm" | The pen moves and lays down "flour" |
| Stop | The pen waits |
| Louder / softer | Thicker / thinner line |
| Higher / lower | Rose-lavender / blue |
| Move your finger (or mouse) | At each gap, the line turns toward it |
| Wave an open hand sideways (or press **c**) | Sweep it away |

Testing shortcuts: hold **Space** to fake a hum (+Shift = loud, +Alt = high pitch) · **d** shows the debug readout.
URL switches: `?sym=none` (no mirror pens) · `?speed=3` (faster pen) · `?tutorial=0` · `?debug=1`

## How it works

- **`js/kolam.js`**: the kolam is modelled as a *mirror curve* (after Paulus Gerdes). Dots sit on a 5×5 grid, and the line travels diagonally between them, bouncing off the border. Each crossing between two dots is either ✕ (pass through) or a small mirror (bounce). Whatever the user does, the line never touches a dot and always closes, so the construction rule holds. One loop = a true sikku. The default pattern is a C4-symmetric single line found by `tools/find-defaults.mjs`. (No C4 single-line pattern exists on 4×4, which is why the grid is 5×5.)
- **`js/voice.js`**: loudness plus rough pitch (YIN). It learns the room's noise for the first ~1.5 s. There's no note matching.
- **`js/hands.js`**: MediaPipe Hand Landmarker (loaded from CDN) with pinch and swipe detection.
- **`js/drone.js`**: a synthesised tanpura-style drone (Pa·Sa·Sa·Sa). No recordings, so no rights issues. Toggle it with ♪.
- **`js/render.js`**: paper, grain, risograph offset, and the voice-painted line.
- **`js/tutorial.js`**: the interactive intro.
- **`js/content.js`**: all the words. **The cultural copy is a draft. Verify it against Nagarajan and IGNCA before testing.**

`node tools/test-kolam.mjs` checks the model. On the default pattern, 20 of 40 free twists keep a single line and 20 split it. Guided mode always has a twist that keeps one line.

## What to watch for in user testing
1. Do people start humming without being told twice?
2. Do they find pinching on their own once the prompt appears?
3. When a twist splits the line, does that feel like *breaking it* or *a puzzle*? (Run default vs `?guided=1`.)
4. Afterwards, ask: did they notice the colour following their pitch?
5. Do they open "What's a kolam?" on their own?

## Photo credits
- `lotus-kolam.jpg` (Level 1 reference): photographer unknown, found via Google Images.
- `motif-kolam.jpg` (Level 4 reference): Martha Strawn, kolam photographed in Tamil Nadu, 1977–1986. Martha Strawn Collection, IGNCA Cultural Archives, New Delhi.
- `colour-kolam.jpg` (Level 3) and `line-kolam.jpg`: Michael Backman, *Women's Kolam Patterns of Tamil Nadu, South India*, michaelbackmanltd.com/kolam (photographed in Kumbakonam).
- Pattern sheet used for future references: Selva Rajesh (watermarked; platform to add).
