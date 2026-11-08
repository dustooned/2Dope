# EffectCraft motion tools and default FX worth adding

2026-10-31 · source read of `C:\Users\dusto\effectcraft` (workspace 0.6.0). Reference only; nothing
copied. Companion: [mograph tool shortlist](../mograph-tool-shortlist/README.md),
[EffectCraft catalog](../effectcraft-0.19-effects/README.md).

Two buckets: **motion tools** (change keys, no renderer work) and **default FX** (pixel passes that
reuse the existing effect stack). Both are student-sized in EffectCraft, which is why they fit.

## 1. Wiggle — EffectCraft's Wiggler, and what it actually does

`keys.wiggle` is a **keyframe assistant**, not an image effect (`crates/engine/src/commands/anim_tools.rs`,
tests in `tests_anim_tools.rs`). Semantics proven by the tests:

| Option | Values | Meaning |
|---|---|---|
| `frequency` | keys per second (default 5) | keys are inserted between the first and last selected keys at `1/frequency` (5 Hz at 30 fps = every 6 frames) |
| `magnitude` | number (default 1) | each inserted key deviates **within ±magnitude** of the interpolated base value |
| `dimensions` | `independent` / `one` / `all` | per-axis noise, a single axis (with `dimension` index), or one shared offset |
| `apply` | `spatial` / `temporal` | position-path noise vs value noise (spatial is for point properties) |
| `noise` | `jagged` / `smooth` | random per key, or smoothed between keys |
| `seed` | integer | deterministic; the same seed reproduces the same keys |

End keys are left untouched, the result is one undo step, and re-running with the same seed is
reproducible. That is exactly the contract 2Dope wants.

**2Dope shape:** *Wiggle* in the keyframe actions (Motion and Timing), applying to the selected
property keys or the whole property over a frame range. UI: Frequency (0.5–10/s), Amount (px or %,
matching the property), Dimensions (Both / X / Y), Smoothness (jagged ↔ smooth), Seed, and a *New
seed* button. Implement as a pure `Prop` transform (insert keys via `setKey`, seeded by
`core/rng.ts`), so undo, autosave and export stay correct. Effort **S**.

## 2. Smoother — the other half of the pair

`keys.smooth` (same file) removes keys while staying within a **tolerance** of the original curve
(test: 61 ramp keys with jitter → fewer than 10 keys at tolerance 1.0). For 2Dope this is the cleanup
tool for hand-keyed motion, motion-sketch input and imported animation.

**2Dope shape:** *Smooth keys* with one Tolerance control; keep first/last; one undo. Effort **S**.

## 3. Motion Sketch (mentioned, not specified here)

EffectCraft has `motion.sketch` (record pointer motion into position keys). Useful for Animate but it
needs a recording UI and a preview overlay; keep it for later.

## 4. Default FX with their actual parameters

Read from `crates/effects/src/{misc,distort,stylize2}.rs`.

| Effect | Parameters (default; range / soft range) | Fit for 2Dope |
|---|---|---|
| **Drop Shadow** | Color black; Opacity 50 (0–100); Direction 135°; Distance 5 (0–32000, soft 0–120); Softness 0 (0–1000, soft 0–250); Shadow Only off | **High** — cheapest "sticker" look; needs padding (`dist + 1.5·soft + 2`) |
| **Glow** | Based On Alpha/Color; Threshold 60 (0–100); Radius 10 (0–1000, soft 0–100); Intensity 1.0 (0–255, soft 0–4); Composite Original On Top/Behind/None; Glow Operation; Colors Original/A&B/Map; Dimensions | **High** — the planned bloom; pad by `1.5·radius + 2` |
| **Posterize** | Level 6 (2–255, soft 2–32) | Cheap stylise |
| **Mosaic** | Horizontal Blocks 10, Vertical Blocks 10 (1–4000, soft 1–200); Sharp Colors off | Cheap stylise |
| **Find Edges** | Invert off; Blend With Original 0 (0–100) | Cheap line/extract look |
| **Threshold** | Level 128 (0–255) | Cheap; pairs with dither |
| **Twirl** | Angle 0°; Twirl Radius 30 (0–100); Center 0.5/0.5 | Cheap distort |
| **Wave Warp** | Wave Type; Height 10 (−1000…1000, soft −100…100); Width 40 (1–10000, soft 1–500); Direction 90°; Speed 1 (−100…100, soft −5…5); Pinning; Phase | **High** — water, flags, heat |
| **Mirror** | Reflection Center 0.5/0.5; Angle 0° | Cheap |
| **Offset** | Shift Center To 0.5/0.5; Blend With Original 0 (0–100) | Cheap tiling helper |
| **Directional Blur** | Direction 0°; Blur Length 0 (0–1000, soft 0–100) | **High** — speed streaks |
| **Radial Blur** | Amount 10 (0–100); Center; Spin/Zoom; Antialiasing | **High** — impact/zoom |
| **Sharpen** | Amount 0 (0–500, soft 0–100) | Cheap |
| **Unsharp Mask** | Amount 50; Radius 1 (0.1–500, soft 50); Threshold 0 (0–255) | Cheap |
| **Motion Tile** | Tile Width/Height 100; Output 100; Mirror Edges; Phase; Horizontal Phase Shift | Medium — patterns/scroll |
| **CC Vignette** | Amount 50 (−100…100); Angle of View 60 (0–179); Center; Pin Highlights | Cheap framing |

## 5. Recommended order for 2Dope

1. **Wiggle + Smoother** — motion tools, pure key transforms, highest value per line.
2. **Drop Shadow** — one card, immediate utility on art and text.
3. **Glow** — the bloom already planned; reuse `applyBlur` + bright-pass + screen.
4. **Posterize + Mosaic + Find Edges + Threshold** — four small stylise passes, one commit.
5. **Directional Blur + Radial Blur** — mograph staples on the existing blur core.
6. **Wave Warp + Twirl + Mirror + Offset** — distort set; Wave Warp pays for itself.
7. **Motion Tile + Vignette** — nice-to-have.

## 6. Costs and risks

- Wiggle/Smoother touch only `Prop`/`Key`, so no renderer risk; they must respect one undo step and
  the autosave notification.
- Drop Shadow and Glow **grow the layer bounds** (padding above). Without it they clip at the page
  edge, which is the most likely visible bug.
- Wave Warp/Directional/Radial blur are per-pixel on the existing ImageData path; radius-independent
  for blur (box passes), sampling cost for the warps.

## 7. Limits

- Parameters and defaults are from EffectCraft source; nothing was built or run.
- Wiggle semantics are from its tests, not from using the UI; 2Dope's UI wording is a proposal.
- EffectCraft has no image "Wiggle" effect — if what you want is a wobbling image, that is our
  `boil`/`ripple` family, not this tool.
