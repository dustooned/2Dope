# Mograph tools worth implementing: shortlist

2026-10-31 · synthesis of the grab-bag survey, the `.ffx` mining and the two REA passes. Companion:
[grab-bag REA triage](../grab-bag-rea-triage/README.md), [AE settings](../ae-mograph-settings/README.md),
[motion synthesis](../motion-mograph-integration-2026-10-31.md), [layers](../layer-systems/README.md).

The question: beyond easing, effects and export, which **mograph tools** from the collection are
worth building into 2Dope? Ranked by student value and fit with the existing model, not by what the
plug-in is famous for.

Evidence classes used below: **FFX** = stored preset values, **NAME** = tool name + folder only,
**SRC** = readable JS/JSX (few; most panels are minified or `.jsxbin`), **REA** = native binary.
Most of these tools are `.jsxbin` — obfuscated, so their internal algorithm is unavailable. The
recommendations therefore describe *behaviour to implement*, not code to port.

## Ranked shortlist

| # | Tool (collection) | What it adds | Evidence | 2Dope shape | Effort |
|---|---|---|---|---|---|
| 1 | **Add Delay / LayerMonkey / layerrepeater** | stagger the same animation across layers by N frames, in order or at random | NAME | Motion command: *Stagger keys* — offset selected layers' keys by 1–24 frames, forward/backward/random | S |
| 2 | **Loop / cycle tools + CT Wave "Loop Time"** | repeat a keyed action over a range: cycle, ping-pong, offset | FFX (`Loop Time (frames)` = 25, 0–100) | *Loop keys* over a selection: cycle / ping-pong / offset, N repeats | S–M |
| 3 | **EaseCopy / After Ease / Kease / Flow** | copy an ease from one segment to another; named curve library | NAME (+ EffectCraft's 12 curves, SRC) | Copy/paste easing between segments; the 12 presets already planned | S |
| 4 | **Easy Bounce Pro / Kease** | overshoot and settle after a move | NAME | *Settle* on selected keys: inserts 2–3 keys with decreasing overshoot; amount + decay | M |
| 5 | **AutoSway / autoParallax** | secondary motion: wind sway, parallax drift | FFX (AutoSway `Lag factor` 0–540; wave controls) | Seeded *Wiggle/Sway* on a property: amplitude, frequency, lag, seed | M |
| 6 | **AE Camera Morph / HandyCam** | camera moves and handheld shake between shots | NAME | Camera presets on the existing camera layer: push in, drift, handheld; amount/speed | M |
| 7 | **foxRetimer / Fresh Trim** | retime: speed up, reverse, freeze, ping-pong | SRC (foxRetimer `.jsx`) + model doc | Time-remap UI on a layer: speed, reverse, freeze, ping-pong | M |
| 8 | **cloners_plus_effectors** (24 `.ffx`: grid, linear, radial, path; plain/random/step/pulse/noise/wiggle effectors) | duplicate a layer into a pattern with per-copy offsets | FFX | *Repeat layer* (grid/line/ring) as a render-time duplicate with offset/rotation/colour stagger; no schema change if kept as layer settings | M–L |
| 9 | **BeatEdit / FreqReact** | markers and values from audio beats/levels | NAME | Beat markers from the clip's audio; optional "scale to level" | M |
| 10 | **Gridder / EasyRulers** | precise grids, rulers and snapping | SRC (Gridder 53 `.jsx`) | Motion/Animate overlay grid with spacing/columns and snap; Draw already has guides | S–M |
| 11 | **GoType / Typewrite / Discotext / Digit Fiddler** | text reveal and number animation | FFX/NAME | Only if 2Dope gets a text layer; otherwise skip | L |
| 12 | **Expressionist / iExpressions** | expression snippets | NAME | Skip — a formula UI is the opposite of student-first | — |

## Recommended next three (after the current easing work)

1. **Keyframe toolkit**: stagger + loop + ease copy/paste (items 1–3). All are pure `Prop`
   transforms over the existing `Key`/`Side` model, so each is one undo step and unit-testable
   without touching the renderer. This is the highest value per line of code in the whole survey.
2. **Settle/bounce** (item 4). Adds the one motion idea students ask for by name ("make it
   bounce"), and is still just key insertion — no physics engine.
3. **Wiggle/sway** (item 5). Turns a static layer into something alive; seeded, so export matches
   playback.

Then camera presets, retime, and repeat/cloner — those touch the layer model or renderer and need
their own review.

## Deliberately not now

- **Expressions** (Expressionist/iExpressions): powerful, but a formula field is a support burden
  and contradicts the "simple by default" direction.
- **Cloner/effector systems**: 24 `.ffx` show the depth; a student version is one "Repeat" control,
  not an effector graph. Defer until layers support render-time duplication cleanly.
- **Data-driven comps** (CompsFromSpreadsheet): niche for this audience.
- **3D camera rigs / FBX / Element**: out of scope.

## Limits

- Most tools here are `.jsxbin` or minified panels; no algorithm, range or default was recovered
  from them. The row-level evidence is FFX values (where a preset exists) or the tool's documented
  behaviour.
- `.ffx` presets describe one saved configuration, not the full control range.
- No plug-in was executed; feature names are matched from folders and presets, not verified runtime
  behaviour.
