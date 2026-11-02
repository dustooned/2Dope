# Motion, Draw and Animate: what to take from EffectCraft, the AE plug-in collection and Procreate

2026-10-31 · research pass + ranked integration plan. Companion detail:
[EffectCraft effect catalog](effectcraft-0.19-effects/README.md) ·
[AE plug-in settings](ae-mograph-settings/README.md) ·
[Procreate draw/Animate continuation](procreate-5.4.9/DRAW-ANIMATE-CONTINUATION-2026-10-31.md).

The question: 2Dope already has line boil, ripple, grain, texture and dither, four easings, guides,
QuickShape, symmetry and onion skin. What else is **simple, common and effective**, and where should
it go — Motion settings, Draw mode, or Animate mode?

## 0. What 2Dope has today (checked in source, not assumed)

| Area | Present | File |
|---|---|---|
| Effects | `boil`, `roughen`, `blur`, `turbulence`, `grain`, `texture`, `dither`; targets `line`/`fill`/`layer`; hold 1–8; seeded; preview + cache | `src/core/effects.ts`, `src/view/effects.ts` |
| Effect maths | value-noise displacement (1 octave = boil, 3 = turbulence); alpha-eating grain/texture; palettised dither | `src/view/effects.ts` |
| Easing | linear / ease in / ease out / ease in-out / hold over one bezier model (slope + influence), spacing ticks, reverse, Blender handles | `src/core/anim.ts` |
| Motion panel | auto-key, move-from-start, camera, group/precomp, split, anchor, effects, flipbook, 5 ease buttons | `src/ui/motion.ts` |
| Draw | guides (grid, isometric, 1- and 2-point perspective), QuickShape (line/polyline/arc/ellipse/rect/polygon), symmetry, smoother, taper, onion toggle | `src/core/guides.ts`, `src/core/quickshape.ts`, `src/brush/smoothing.ts` |

**Gaps this pass is about.** Before today there was no edge effect at all and no non-destructive
blur (only the destructive Adjust ▸ Blur); both were added on 2026-10-31 and are described in §5.
Still missing: glow/bloom/shadow, motion blur, per-side easing in the UI, the 12 named ease curves,
keyframe loop/stagger/bounce helpers, and playback modes or onion tint in Animate.

## 1. EffectCraft (local source, 292 effect specs)

EffectCraft is the closest open model of After Effects semantics. Every effect is a
`spec(id, name, category, params, fn)` in `crates/effects/src/*.rs`; params carry a UI type and a
soft/hard range, which is exactly the shape 2Dope's `EffectDef` already uses. The companion catalog
counts **306 effects / 3,014 declared params (2,966 visible) / 21 categories**; a local regex
(`extract_effects.py` here) finds 294 `spec(` forms because some are registered through helpers.
Families:

- **Blur & Sharpen**: Gaussian Blur, Fast Box Blur, Directional Blur, Radial Blur, Camera Lens Blur,
  Smart Blur, Bilateral Blur, Channel Blur, Compound Blur, Sharpen, Unsharp Mask.
- **Stylize**: Roughen Edges, Glow, Posterize, Mosaic, Find Edges, Emboss, Cartoon, Scatter,
  Texturize, Threshold, Strobe Light, Motion Tile, CC Vignette.
- **Distort**: Turbulent Displace, Ripple, Wave Warp, Twirl, Spherize, Mirror, Offset, Transform
  (with its own shutter), Corner Pin, Liquify, Smear.
- **Generate**: Gradient Ramp, 4-Color Gradient, Grid, Checkerboard, Stroke, Write-on, Scribble,
  Vegas, Lens Flare.
- **Time**: Posterize Time, Echo, Timewarp, CC Force Motion Blur, Pixel Motion Blur.
- **Transition**: Linear/Radial Wipe, Gradient Wipe, Iris Wipe, Block Dissolve.

2Dope needs a handful of these, not the catalog; the rest is context for what "complete" looks like.

### 1.1 Roughen Edges — the missing edge effect

`crates/effects/src/stylize2.rs:588` (`ec.stylize.roughenedges`; AE match name `ADBE Roughen Edges`,
`crates/script/src/matchnames.rs:299`):

| Param | Default | Range (soft) | Notes |
|---|---|---|---|
| Edge Type | Roughen | 8 popup values: Roughen, Roughen Color, Cut, Spiky, Rusty, Rusty Color, Photocopy, Photocopy Color | the "look" |
| Edge Color | 0.55, 0.30, 0.10 | colour | used by the *Color* variants |
| Border | 8 | 0–500 (soft 0–100) | px |
| Edge Sharpness | 1.00 | 0–10, step .01 | |
| Fractal Influence | 1.00 | 0–1 | how much fractal vs edge direction |
| Scale | 100 | 10–1000 (soft 10–300) | % |
| Stretch Width or Height | 0 | −10…10 (soft −5…5) | anisotropy |
| Offset (Turbulence) | 0, 0 | point | |
| Complexity | 2 | 1–10, step 1 | octaves |
| Evolution | 0° | angle | animates the noise |
| Cycle Evolution | off | checkbox | |
| Cycle (Revolutions) | 1 | 1–1000 (soft 1–20) | |
| Random Seed | 0 | 0–10000 (soft 0–100) | |

### 1.2 Gaussian Blur and the blur family

`crates/effects/src/misc.rs:551` (`ec.blur.gaussian`):

| Param | Default | Range (soft) |
|---|---|---|
| Blurriness | 0 | 0–3000 (soft 0–50), step 1 |
| Blur Dimensions | Horizontal and Vertical | H&V / Horizontal / Vertical |
| Repeat Edge Pixels | off | checkbox |

Same file, the cheap variants worth having too:

- **Fast Box Blur**: Blur Radius 0 (0–3000, soft 0–50), Iterations 3 (1–50, soft 1–5), Dimensions, Repeat Edge.
- **Directional Blur**: Direction 0° (angle), Blur Length 0 (0–1000, soft 0–100) — one slider, very "mograph".
- **Radial Blur**: Amount 10 (0–100), Center 0.5/0.5, Type Spin/Zoom.

### 1.3 Motion / mograph settings

| Setting | EffectCraft value | Where |
|---|---|---|
| Comp shutter angle | **180°** | `crates/project/src/lib.rs:369` |
| Comp shutter phase | **−90°** | `crates/project/src/lib.rs:370` |
| Motion blur samples | **16** | `crates/project/src/lib.rs:371` |
| Adaptive sample limit | **128** (range 16–256; draft 4) | `crates/engine/src/commands/comp.rs:271` |
| Layer motion-blur switch | per layer, plus a comp-level enable | render `mb_on` (`crates/render/src/lib.rs`) |
| Easy Ease | **speed 0, influence 33.33 %** | `crates/keyframe/src/lib.rs:55` |
| Easy Ease In / Out | one side only | menu `keys.easyEaseIn/Out`, `crates/engine/src/menus.rs:986-988` |
| Presets | `.ecpreset` files in `Documents/EffectCraft/Presets`, plus animation presets incl. **bounce** and **Zoom In** | `crates/ui-egui/src/panels/effects_presets.rs` |
| Transform's own shutter | Shutter Angle 0 (0–720, soft 0–360) + "use composition shutter angle" | `crates/effects/src/distort.rs:456` |

The important design point: **motion blur is a comp setting (shutter angle + phase + samples) with a
per-layer switch**, not an effect. 2Dope's 2D layer model can reproduce this cheaply for transforms
only (see §4), because a layer's pixels are already a buffer.

### 1.3.1 The shipped ease library — 12 named curves

EffectCraft ships a ScriptUI panel (`extensions/scriptui-panels/Ease Presets.jsx:32-46`) with twelve
curves, each defined as `(outInfluence %, outSpeed, inInfluence %, inSpeed)`, where **speed is a
multiple of the segment's average speed**. That is exactly 2Dope's `Side.influence` (0–1) and
`Side.slope` (0 = stopped, 1 = linear). No new maths is needed:

| Preset | out inf % | out speed | in inf % | in speed |
|---|---:|---:|---:|---:|
| Linear | 33.33 | 1 | 33.33 | 1 |
| Smooth | 40 | 0.25 | 40 | 0.25 |
| Ease In-Out Soft | 25 | 0 | 25 | 0 |
| Ease In-Out | 50 | 0 | 50 | 0 |
| Ease In-Out Strong | 75 | 0 | 75 | 0 |
| Accelerate | 50 | 0 | 20 | 1.5 |
| Accelerate Strong | 80 | 0 | 15 | 2.5 |
| Decelerate | 20 | 1.5 | 50 | 0 |
| Decelerate Strong | 15 | 2.5 | 80 | 0 |
| Expo In-Out | 88 | 0 | 88 | 0 |
| Expo Accelerate | 75 | 0 | 12 | 7 |
| Expo Decelerate | 12 | 7 | 75 | 0 |

There is **no overshoot/bounce curve** in that panel; "Bounce" exists only as a text-animator preset.
2Dope's current five easings are the `slope 0 / influence 1/3` special cases of the same model, so
adding the other seven is a data change, not an engine change.

### 1.4 What is cheap in 2Dope's Canvas2D pipeline

| EffectCraft thing | 2Dope verdict |
|---|---|
| Roughen Edges (noise displacement masked by alpha edge) | **cheap** — same loop as `displace()`, plus an alpha-gradient mask |
| Gaussian Blur | **cheap** — `applyBlur()` already exists (3 box passes, premultiplied) |
| Fast Box / Directional / Radial | cheap (same resampling core) |
| Glow / Drop Shadow | cheap as blur + composite, no new maths |
| Motion blur (shutter) | **not** an effect: needs sampling the layer transform at sub-frame times; medium |
| Fractal Noise / particle systems | expensive, and 2Dope already has `turbulence` + `grain` |

## 2. The AE plug-in collection (`D:\Downloads\Misc\Applications\Plugins`)

Scale: **199** top-level tools, **264** `.ffx` presets, **451** `.jsxbin`, **25** `.zxp`, plus the
small native pack (B.Carve, B.Fringe, PixDither, PixStipple, PixyHalftone, ntsc-rs, RetroDither).
`.ffx` is **RIFX binary, not XML**; the companion's `_tools/ffx_extract.py` decodes its `tdmn`/`tdsn`
names, `cdat` values, `tdum`/`tduM` ranges and `pdnm` popups (262 of 264 parsed). Every value quoted
below is therefore stored preset data, not a guess. Two bounded negatives matter:

- **No preset in the collection wraps Roughen Edges, Gaussian Blur or Turbulent Displace**, so this
  collection gives no parameter evidence for the two headline effects — EffectCraft and AE's public
  model do.
- **AE is effectively not installed**: `…After Effects 2026\Support Files` has no `AfterFX.exe`, and
  its `Plug-ins` folder holds only this pack's nine `.aex`. Built-in effect names/ranges cannot be
  confirmed from this machine.

What the collection says a "simple but effective mograph setting" is:

| Idea | Tools in the collection | Transfer to 2Dope |
|---|---|---|
| **Ease library / curve editing** | Flow, EaseCopy, Kease, After Ease, Easy Bounce Pro | the four easings + per-side Ease In / Ease Out buttons; a later curve editor |
| **Bounce / overshoot** | Easy Bounce Pro, Kease, After Ease | a one-tap "Settle"/"Bounce" on selected keys (adds 2 keys) |
| **Loop / cycle** | Loop, EditMonkey helpers | "Loop keys" over a range: cycle / ping-pong / offset |
| **Stagger / delay** | Add Delay, LayerMonkey | offset keys by N frames across selected layers |
| **Wiggle / sway** | AutoSway, autoParallax | seeded wiggle on a property, not an effect |
| **Anchor / parent helpers** | Anchor Sniper, Faux Parent, Good Parents, foolParent | 2Dope already has Anchor layers and parenting |
| **Camera moves / shake** | AE Camera Morph, HandyCam | camera presets (push in, drift, handheld) |
| **Motion blur switch** | `Automation Toolkit …\Automations\motionblurAll.json` | comp motion-blur toggle + shutter (EffectCraft values) |
| **Retime / trim** | foxRetimer, Fresh Trim | time remap exists in the model spec, not yet in UI |

It also confirms a bias worth keeping: every one of these tools is **one panel with three or four
controls**, not a node graph. That matches the student-first direction in `docs/ART-EFFECTS-DIRECTION.md`.

## 3. Procreate 5.4.9 — Draw and Animate (continuation)

Full selector evidence in the companion doc. What matters for 2Dope, in order:

1. **Stabilisation is a pipeline**: windowed StreamLine (strength, pressure strength, window) →
   moving average → FFT amount/sample-rate/bias, with **zoom compensation** and catch-up at stroke
   end. 2Dope has one smoother; the feel upgrade is a window pass with pressure-aware strength.
2. **Onion skin has previous/next tint colours**, a blend mode, and an **opacity distribution**
   across the stack — 2Dope has the toggle and count only.
3. **Animation Assist playback modes**: loop, one-shot, **ping-pong**, plus frame rate and direction.
4. **QuickShape has a delay setting** and offers "possible shapes" rather than one guess.
5. **Wet mix / smudge pull as dynamics** (pressure- or speed-modulated), and **glaze** as the
   smudge-strength control.
6. **Drawing Assist is a per-layer toggle** with a Pencil double-tap shortcut.

Items not worth porting: the four-map metallic/roughness PBR brush textures, dual brush, clone puck,
liquify chaos/momentum.

## 4. Ranked integration plan

Effort is engineer-days for one person who knows the codebase; "S" < ½ day.

### Tier 1 — do first (small, high value, fits existing models)

| # | Item | What exactly | Effort | Where |
|---|---|---|---|---|
| 1 | **Roughen Edges effect** | **Built 2026-10-31.** `'roughen'`: Roughness px 0–24 (default 5), Size 8–160 (default 34), Hold 1–8 (default 2), Seed; target Ink (default) or the whole layer. Alpha-only: soften alpha by Roughness/2, push the rim with 3-octave seeded noise, multiply alpha — colour untouched, inside of a shape stays solid. AE mapping: Border≈Roughness, Scale≈Size, Edge Type=Roughen. | S | `src/core/effects.ts`, `src/view/effects.ts` |
| 2 | **Gaussian Blur effect** | **Built 2026-10-31.** `'blur'`: radius 0–40 px (default 6), whole layer. Reuses `applyBlur()` (3 separable box passes, premultiplied, no dark halos); the Size row is hidden because there is no second knob. AE mapping: Blurriness=radius, Dimensions=H&V, Repeat Edge=off. | S | same two files + one guard in `src/ui/effectspanel.ts` |
| 3 | **Easy Ease In / Out buttons** | Two more buttons next to the five: ease only the outgoing or incoming side of the selected key. AE's Easy Ease In/Out, EffectCraft's `keys.easyEaseIn/Out`. The engine already stores asymmetric sides. | S | `src/ui/motion.ts` + `setSegmentSideEase` in `src/core/anim.ts` |
| 4 | **12 named ease curves** | The table in §1.3.1 as presets over `Side{slope,influence}` — Smooth, Soft/Strong In-Out, Accelerate, Decelerate, Expo family. No engine change; one select in the Easing row. | S | `src/core/anim.ts`, `src/ui/motion.ts` |

Items 1–2 are done and checked (below). Items 3–4 are the cheapest way to widen the motion
vocabulary from five buttons to a real (but still student-sized) easing library.

### Tier 2 — Motion settings that carry the most "mograph" per control

| # | Item | Setting | Effort |
|---|---|---|---|
| 5 | **Directional blur** | Angle + Length (0–100 px). One slider pair; instantly reads as speed. | S |
| 6 | **Glow / bloom** | Radius + Threshold + Strength = blur + bright-pass + screen. The "simple effective" look. | M |
| 7 | **Drop shadow / outline** | Distance 40, Opacity 100, Softness 100 (the stored AE-preset units), plus an outline width. Covers the "sticker" look; EffectCraft derives `blur = Softness/2`. | M |
| 8 | **Motion blur** | Comp shutter (180°, phase −90°, samples 16, adaptive limit 128) + per-layer switch. Sample the transform at N sub-frame times and average the layer buffer. | L |
| 9 | **Keyframe helpers** | Loop (cycle / ping-pong / offset), Stagger by N frames, Bounce/Settle (2 extra keys), Copy/Paste keys. Each is a pure `Prop` transform, so undo is one step. | M |
| 10 | **Wiggle** | Seeded wiggle on a property: amplitude, frequency, octaves. Distinct from boil: it moves the layer, not its pixels. | M |

### Tier 3 — Animate mode and Draw mode

| # | Item | Setting | Effort |
|---|---|---|---|
| 11 | Onion tint colours | Previous/next colour + opacity, replacing the single tint. | S |
| 12 | Playback modes | Loop / one-shot / ping-pong, per comp or per preview. | S |
| 13 | QuickShape delay | 0–1 s slider before the shape is offered; "possible shapes" list. | S |
| 14 | StreamLine stabilisation | Window pass with pressure strength + zoom compensation, ahead of the current smoother. | M |
| 15 | Wet mix / glaze | Pressure- or speed-modulated smudge pull; "glaze" as strength. | M |

## 5. What was built, and the next steps

### Built today: Roughen Edges

`src/core/effects.ts` gains `'roughen'` (label **Roughen edges**, target Ink, Roughness 0–20 default
3, Size 8–160 default 34, Hold 1–8 default 2); `src/view/effects.ts` implements it **on the alpha
channel only**:

1. find the painted box and copy its alpha into a float plane;
2. sample a 2-octave value-noise field at `Size`, seeded by `seed ^ effectTick` (so Hold and New
   pattern work exactly like the other effects);
3. for every painted pixel, read the alpha where that noise points
   (`x + noiseX · Roughness`, `y + noiseY · Roughness`, bilinear, zero past the artwork) and multiply
   the pixel's alpha by it.

So the rim is pulled in and out: inward keeps paint, outward erodes it, nothing is added outside the
artwork, and **colour is never touched** — thin ink keeps its colour instead of turning grey, and the
inside of a filled shape stays solid. One honest limitation: at high Roughness a 1–2 px line breaks
into dashes, because that is what eroding its edge does (AE's roughen behaves the same way); the
default is deliberately low.

This is simpler than EffectCraft's 8 edge types and 13 parameters. It keeps the numbers that change
the look (border/roughness, scale) and uses the existing Hold/Seed model instead of
Evolution/Cycle.

### Built today: Gaussian Blur

`'blur'` (label **Gaussian blur**, whole layer, radius 0–40 default 6) calls the existing
`applyBlur()` — three separable box passes each way in premultiplied float, so soft edges keep their
colour. `sizeRange` is `[0,0]` and `src/ui/effectspanel.ts` now skips the Size row when the range is
empty, so the card shows one honest slider. `effectTick` was taught that blur is static (otherwise
its cache key would change every frame).

### Checks actually run

- `npm test`: **74 files / 584 tests passed** (the two extra files are unrelated concurrent work),
  including two new assertions in `src/core/effects.test.ts` for the defaults, clamping and target
  of both effects.
- `npm run build`: passed (TypeScript strict included); the only output is the pre-existing
  chunk-size warning.
- **Not checked**: the browser render (no fixture yet), iPad cost of a 40 px blur, and how the
  roughen looks on thin vs thick ink. Those need the dev server at `127.0.0.1:5217` plus a pixel
  fixture, which is the sensible next check before shipping.

### Next: Easy Ease In / Out and the 12 curves

`anim.ts` already models asymmetric sides, so per-side easing is a small `setSegmentSide` plus two
buttons. The 12 named curves are a table on top of the same `Side{slope, influence}` — the only
design question is UI: a second row would crowd the Motion bar, so a single "More…" select in the
Easing group is the better fit.

### Costs and risks

- Blur and roughen run per layer per frame on CPU. `applyBlur` is three separable box passes per
  axis; a 40 px radius on a 1080p page is noticeable on iPad, so the preview cache and Lite budget
  matter. Consider clamping the radius on Lite (e.g. 24 px) as `device.ts` already does for onion
  skins.
- Effects already participate in `effectsKey`, so adding types does not invalidate old caches or
  files; `readEffects` drops unknown types, so a file written by a newer build opens in an older one.

## 6. Sources

- EffectCraft: the companion catalog (`crates/effects/src/*.rs`, `crates/project/src/lib.rs`,
  `crates/keyframe/src/lib.rs`, `crates/engine/src/{menus,commands/comp}.rs`,
  `crates/ui-egui/src/panels/effects_presets.rs`, `crates/script/src/matchnames.rs`,
  `extensions/scriptui-panels/Ease Presets.jsx`). The checkout is workspace **0.6.0**, not 0.19.
- AE collection: `D:\Downloads\Misc\Applications\Plugins\{After Effects, Ultimate Mograph Plugins
  Grab Bag}` — 264 RIFX `.ffx` presets (262 parsed), manuals, filenames only for `.jsxbin`/`.zxp`.
- Procreate 5.4.9: `D:\Downloads\Misc\Compressed\Procreate_5.4.9_Pro.ipa` (executable SHA-256
  `3c10dce0b2de599ea126e553bf77a16b713917acc108bba3f61d8a2c45c5130d`), selectors and strings only;
  see the companion doc.
- 2Dope source as of 2026-10-31 (`src/core/effects.ts`, `src/view/effects.ts`, `src/core/anim.ts`,
  `src/ui/motion.ts`, `src/ui/effectspanel.ts`).
