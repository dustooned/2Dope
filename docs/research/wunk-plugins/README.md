# `D:\Downloads\wunk`: what the four files are, and what 2Dope could take

2026-10-31 · local artifact inspection for feature integration. Reference only; nothing copied.
Tools used: REA (PE identity + Ghidra string inventory for `B.Fringe`), local Aseprite parse, local
string triage. Companion: [NEXT-ITERATION-BRIEF](../NEXT-ITERATION-BRIEF.md).

## Inventory

| File | Size | What it is |
|---|---|---|
| `112_FREE_BRUSHES_1.0_en_ru_zh.aseprite` | 39,197 B | **not a brush set** — a one-frame promo sheet (233×486, 32-bit, 4 layers `main`/`en`/`ru`/`zh`) advertising "112+ presets for dithering" |
| `B.Carve.aex` | 640,512 B | After Effects plug-in, x86-64 PE, SHA-256 `96fb9e87…63b63`; **seam-carving resize** |
| `B.Fringe.aex` | 172,032 B | AE plug-in, x86-64 PE, SHA-256 `556ca905…205ac`; two-knob edge fringe |
| `PixDither.aex` | 120,832 B | AE plug-in; dithering with per-channel thresholds and a large algorithm list |
| `PixStipple.aex` | 27,136 B | AE plug-in; stipple effect (parameters not recovered) |

All four `.aex` are Wunkolo plug-ins ("WUNK …", `PixStipple by Wunkolo(Wunkolo@gmail.com)`); Carve
and Fringe are **Vulkan compute** plug-ins (`Carve.glsl`, `Fringe.comp.spv`), not CPU filters.

## 1. The `.aseprite` file is a promo sheet, not brushes

Parsed structure: one frame, 233×486, 32-bit RGBA, four layers (`main`, `zh`, `ru`, `en`), four zlib
cels, no tags. Rendering `main` shows a contact sheet headed "ASEPRITE · 112+ presets for dithering
(& unique designs)" by Shimotsl / sadarommel, with sections labelled **8×8, 12×12, 15×15, 16×16,
17×17, 18×18**, each cell a black-and-white dither pattern, then a "HOW TO USE" text block.

So the "brushes" are **dither patterns meant to be picked as Aseprite custom brushes** at those
sizes — not paint tips, no alpha, no grayscale height. Reproduced with `_tools/aseprite_png.py`.

Implication for 2Dope: nothing to import as a brush. The transferable idea is a **pattern dither**
mode (tiled threshold matrix at 8–18 px) beside our ordered/error-diffusion methods. The sheet's
patterns are the author's artwork; use them as a size/legibility reference, not as an asset.

## 2. `B.Carve` — seam carving (content-aware resize)

Evidence from the executable's own strings (shader source embedded in the PE):

- "seam carving", "Expanding: Copy everything to the right of the seam 1 pixel to the right",
  "shrink/expand in axis", "-1, 0, or 1 direction in which the carve/expansion is happening",
  "Width Scale", "Negative width.", "Width is not an integer."

Read as a feature: it **resizes by removing or inserting seams**, with a width scale and a direction
per axis, and the shader works per channel depth. That is a *canvas/asset resize* tool, not a look.

Fit for 2Dope: high cost, medium fit. Seam carving needs an energy map + dynamic programming per
axis and protection rules for line art (otherwise faces and ink get sliced). A student-facing version
would only make sense as "Resize artwork (content-aware)" with a protect-line/lock-region option and
a preview; not a layer effect.

## 3. `B.Fringe` — a two-knob edge fringe

REA string inventory (`ev_21f9237e…`, 26 rows) finds exactly two control names in the plug-in's own
data: **Iterations** and **Offset** (plus framework strings `LayerSize`, `Depth`, and the SPIR-V path
`shaders/Fringe.comp.spv`).

Read as a feature: repeatedly shift/offset the image (or its edges) N times — a fringe/echo that
grows with iterations and distance with offset. Implementation in 2Dope would be a layered
directional smear (sample the layer at ±offset, composite N times), cheap on the existing effect
canvas.

Fit: good. A **Fringe** effect with Direction (angle), Offset (px), Iterations (1–8), and a
fade/falloff control is a simple, very "mograph" look and reuses the existing effect pipeline.

## 4. `PixDither` — dither settings worth folding into ours

Strings show the control surface:

- **Threshold Red**, **Threshold Green**, **Threshold Blue** — per-channel thresholds, not one.
- Algorithm list: `Threshold | Floyd Steinberg | False Floyd Steinberg | Filter Lite | Zhigang Fan |
  Shiau-Fan | Jarvis, Judice & Ninke | Stucki | Burkes | Sierra | Two Row Sierra | Atkinson |
  Bayer 2x2 | Bayer 3x3 | Bayer 5x3 | Bayer 4x4 | Bayer 8x8 | Cluster Dot 4x4 | Cluster Dot 8x8 |
  Horizontal 2x2 | Horizontal 8x1 | Horizontal 12x4 | Vertical 2x2 | Vertical 1x8 | Vertical 4x12 |
  Diagonal 5x5 | PicoCAD`.
- `1 color` / `%u color%s` — palette size handling.

2Dope already has palettes, ordered Bayer and the main error-diffusion methods. Gaps this exposes:
**per-channel thresholds** and the **non-square ordered matrices** (3×3, 5×3, 8×1, 12×4, 1×8, 4×12,
5×5 diagonal, cluster-dot). Those are data, not new maths — cheap to add to `core/dither.ts`.

## 5. `PixStipple` — stipple, parameters unknown

Only identity strings survive ("PixStipple", "Stipple", the author string). No control names were
found in the PE's defined strings, and the plug-in is small enough that its parameters are probably
built inline. Do **not** guess a parameter set for implementation; if we want the look, define our
own stipple (dot density, dot size, angle, jitter, seeded) rather than claiming parity.

## 6. Suggested integration order

| # | Take | Source | Effort | Notes |
|---|---|---|---|---|
| 1 | **Per-channel dither thresholds + non-square matrices** | PixDither | S | extends `core/dither.ts`, no new effect type |
| 2 | **Fringe effect** (Direction, Offset, Iterations, Falloff) | B.Fringe | S–M | new effect type on the layer stack; seeded direction optional |
| 3 | **Pattern dither** (8/12/15/16/18 px threshold tiles) | Aseprite sheet (idea only) | M | author's patterns not copied; generate our own or ship user-supplied tiles |
| 4 | **Stipple effect** (own parameters) | PixStipple (name only) | M | dot density/size/angle/jitter; explicitly not a parity claim |
| 5 | **Content-aware resize** | B.Carve | L | needs energy map, seam DP, line protection; separate from effects |

## 7. Limits

- Carve/Fringe are Vulkan plug-ins; the shaders are embedded SPIR-V and were **not** disassembled.
  Parameter names come from the PE's defined strings, not from the effect's UI code.
- `B.Carve`'s string inventory could not be completed: the Ghidra string query timed out on the
  640 KB module. Its feature reading rests on the shader source text embedded in the binary.
- PixStipple's parameters are unknown; no claim is made.
- The `.aseprite` file is third-party promotional art; the parse proves structure, not a license to
  reuse the patterns.

## 8. Evidence

| Evidence | Covers |
|---|---|
| `ev_21f9237e…` / `ev_4c4301de…` | B.Fringe string inventory (26 rows; Iterations, Offset) |
| `B.Carve.aex` SHA-256 `96fb9e87…` | seam-carving shader strings |
| `PixDither.aex` / `PixStipple.aex` | dither control strings / identity only |
| `_tools/aseprite_dump.py`, `aseprite_png.py` | Aseprite structure + rendered sheet |
