# Claude iteration 2 — work packages (2026-10-31)

Supersedes the task list in `NEXT-ITERATION-BRIEF.md` for this round. Read that brief for the
layer/export work (package 8); this file adds everything researched since: Wiggle/Smoother,
EffectCraft default FX, wunk dither/Fringe, Retro TV, GIF options.

Standing rules: read `AGENTS.md` + the top dated `HANDOFF.md` section; run `git status`; preserve
other sessions' uncommitted work; no commit/push; one undo step per completed edit; update
`manualtext.ts` + `UPDATES` and the dated HANDOFF section; `npm test` + `npm run build` + affected
browser fixtures; never clear project storage; on Windows `spawn EPERM` means rerun outside the
sandbox, not rewrite config.

Evidence for each package is in `docs/research/` (links per package).

## 0. Verify the two shipped effects (do first, half day)

Fixture for `roughen` + `blur`: identity at 0, blur spreads without darkening, roughen changes alpha
only (RGB preserved, interior alpha 255), determinism by seed/hold, target scoping (Ink vs Colour vs
layer), one undo. Run on a dev server at `127.0.0.1:5217`.
Ref: `motion-mograph-integration-2026-10-31.md` §5.

## 1. Easing library (1 day)

- `setSegmentSide(prop, frame, 'in' | 'out', easing)` in `core/anim.ts`; two Motion buttons
  (Ease in only / Ease out only) = AE Easy Ease In/Out.
- The 12 named curves from the motion report §1.3.1 as data over `Side{slope, influence}`; unit test
  each preset round-trips; expose as one "More…" select (no twelve buttons).
Ref: `motion-mograph-integration-2026-10-31.md` §1.3.1.

## 2. Keyframe toolkit (1–2 days)

All pure `Prop`/`Key` transforms — no renderer work.

- **Wiggle** (EffectCraft Wiggler): insert keys between the first and last selected keys at
  `1/frequency`; each key deviates within ±magnitude of the interpolated base; options Frequency
  (0.5–10/s), Magnitude, Dimensions (both / X / Y), Smoothness (jagged↔smooth), Seed; end keys
  untouched; deterministic; one undo. Tests mirror EffectCraft's
  (`tests_anim_tools.rs`): key count/step, magnitude bound, seed reproducibility, undo.
- **Smooth keys**: tolerance-based key reduction (first/last kept), one undo.
- **Stagger**: offset selected layers' keys by N frames, in layer order / reverse / random.
- **Loop keys**: cycle / ping-pong / offset over a selected range, N repeats.
- **Copy/paste easing** between segments (EaseCopy behaviour).
Ref: `effectcraft-motion-and-fx/README.md` §1–2, `mograph-tool-shortlist/README.md` #1–3.

## 3. Default FX, wave 1 (1–2 days)

- **Drop Shadow**: colour, opacity 50, direction 135°, distance 5, softness 0, shadow-only.
  **Pad the layer** by `distance + 1.5·softness + 2` or it clips at the page edge.
- **Glow**: based on alpha/colour, threshold 60, radius 10, intensity 1.0, composite original
  on top/behind/none; pad by `1.5·radius + 2`.
- **Directional Blur**: direction + length; **Radial Blur**: amount, centre, spin/zoom. Both reuse
  the box-blur core.
Ref: `effectcraft-motion-and-fx/README.md` §4.

## 4. Default FX, wave 2 (1–2 days)

Posterize (level 6), Mosaic (block counts, sharp colours), Find Edges (invert, blend), Threshold
(level 128), Twirl (angle, radius 30, centre), Mirror (centre, angle), Offset (shift, blend),
Wave Warp (type, height 10, width 40, direction 90, speed 1, pinning, phase). Optional: Motion Tile,
CC Vignette.
Ref: same, §4–5.

## 5. Wunk slice (1 day)

- **Dither**: optional per-channel R/G/B thresholds (default = today's behaviour); add ordered
  matrices Bayer 3×3, 5×3, 8×1, 12×4, 1×8, 4×12, Diagonal 5×5, Cluster Dot 8×8 (Bayer 4×4 stays
  default). Data + tiled lookup, tests for dimensions/wrap/clamping, old files unchanged.
- **Fringe** effect: Direction (8 steps), Offset 0–40 px, Iterations 1–8, Falloff; alpha-aware
  directional smear with decreasing opacity; deterministic.
Ref: `wunk-plugins/README.md` §4, §6.

## 6. Retro TV effect (1 day)

One effect combining Zaebects `signal` and the ntsc-rs subset: Strength, Static, Chroma loss,
Chroma shift, Phase offset, Scanline blur, Roll, Distortion speed; `size` = noise frequency,
`hold` = tape chunkiness. Seeded; row-wise/per-pixel on the existing canvas.
Ref: `zaebects-signal/README.md`, `gifgun-ntsc/README.md` §2.

## 7. GIF options (half day)

Extend the GIF export with: max colours (2–256, default 256), loop (once / N / infinite), dither
(none / ordered + scale / error diffusion), "better colours" two-pass palette, pixel-art resampling
(nearest). Persist per device like the other export settings.
Ref: `gifgun-ntsc/README.md` §1.

## 8. Layers + export sheet (next round)

Draw layer row anatomy + swipe actions + reorder, Animate track/art-layer panel, format-aware export
presets. Full criteria in `NEXT-ITERATION-BRIEF.md`.
Refs: `layer-systems/README.md`, `export-settings/README.md`.

## 9. Audio React (future round, after 8)

Bake audio-reactive motion onto a property. From FreqReact (`freqreact/README.md`):

- **Analysis**: decode the chosen clip's audio (reuse the existing audio path), window + FFT per
  project frame, average magnitudes between **Start Hz** (default 10) and **End Hz** (default 250),
  normalise, then apply **Decay** and **Smoothing** envelopes. Cache by asset + settings.
- **Reactors**: Pulse (`envelope × intensity`), Elastic (triangle wave damped by
  `exp(-env × decay)`), Oscillate (`sin(time × speed) × envelope`), Flicker/Wiggle (seeded noise ×
  envelope). Start with Pulse, Elastic, Oscillate.
- **Bake**: write one key per frame (or per N frames) into the selected property over the chosen
  range; one undo step; deterministic from seed + settings; no expression engine.
- **UI**: Motion keyframe action "React to audio…" with Source, Band Start/End, Reactor, Intensity,
  Decay, Smoothing, Time Offset, Master, Seed, Range. Remember last settings per device; optionally
  store them on the layer for re-baking (optional field, backward compatible).
- **Tests**: synthetic 100 Hz sine peaks in a 90–110 Hz band; reactor outputs stay within
  ±intensity; same seed = same keys; undo restores; fixture bakes onto opacity and sees variation.
- **Risks**: long clips (cap/duration guard), Lite memory, and the temptation to build a live
  expression evaluator — don't.
Ref: `freqreact/README.md`.

## Decisions to confirm

- Layer **groups** remain out of this round (schema change).
- Effect names: "Retro TV" (vs VHS), "Fringe", "Drop Shadow"/"Glow" as effect cards (not layer styles).
- Wiggle lives in Motion/Timing keyframe actions, not the effects panel.

## Definition of done

Every package: tests + build pass, a browser check of the affected flow, manual + `UPDATES` updated,
HANDOFF dated section refreshed with actual checks and gaps. No commit or push.
