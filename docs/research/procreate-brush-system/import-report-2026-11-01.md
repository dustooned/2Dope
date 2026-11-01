# Procreate import report (2026-11-01)

What 2Dope's importer (`src/io/brushimport.ts`, after package A of
[CLAUDE-ITERATION-3](../CLAUDE-ITERATION-3.md)) makes of real brush archives. Parsed, not rendered:
no stroke was compared against Procreate.

## How it was run

- Every `*.brush/` folder of the local Procreate Dreams 1.0.11 IPA (216 brushes) and Procreate 5.4.9's
  Signature brush (1) was copied, read-only, into a scratch folder as one `.brush` zip each (the
  archive plus any pictures in that folder). Nothing was added to the repository.
- `BRUSH_CORPUS=<that folder> npx vitest run src/io/brushimport.test.ts` runs the opt-in
  "local brush corpus" test: every file imports and **no archive key is unknown** (each is mapped or
  listed as not supported, with a reason). It writes `report.json` next to the files.
- Result: 217/217 imported, 0 unknown keys. Mapped keys per brush: 13 (min) / 26 (median) / 38 (max).
  Two keys had no reason on the first run (`dynamicsPressureShapeRoundness`, `…Minimum`); they are now
  covered.

## The finding that matters most

**214 of 217 factory brushes name their grain (`bundledGrainPath`) and shape (`bundledShapePath`)
from Procreate's own resource bundle.** Those pictures are not inside the brush folder, so they cannot
come across: these brushes import with the round tip and the built-in paper grain, and the report says
so per brush. Only 4 brushes carry a grain picture in their folder (`GL-Palm`, `GL-Limestone`,
`GL-Volcanic`, one `Grain.png`). Brushes a user makes or buys and exports from Procreate normally carry
their own `Shape.png` / `Grain.png`, and those are imported (blend, depth, minimum, movement, zoom,
rotation, orientation 1).

So grain parity was tested with the repository fixture (`src/io/fixtures/testbrush.ts`, grain blend
28 → height), not with a factory brush.

## Grain blend modes in the corpus

| `grainBlendMode` | brushes | 2Dope |
|---|---|---|
| 1 | 146 | multiply (2Dope's grain pass) |
| 27 | 29 | height (owner decision, 2026-11-01 follow-up; same approximation as 28) |
| none | 12 | multiply |
| 10 | 9 | not supported → multiply |
| 7 | 7 | not supported → multiply |
| 28 | 3 | height (approximation: paint misses valleys deeper than the depth) |
| 20, 8, 6, 19, 9, 11, 26 | 1–3 each | not supported → multiply |

The research note said "1 and 28 dominate"; the corpus says **1 and 27**. 27 and 28 both appear on
low-depth canvas/wash textures (depth 0.1–0.28), which fits Procreate's "Height" / "Linear height"
grain blends, but which number is which is not confirmed. Follow-up (same day): the owner chose
to map 27 as height too; the tables above were produced before that change.

## Ten representative brushes

The Dreams set has no "2B Pencil", "Grainy Shader", "Spray" or "Inker", so the nearest names were used.
"Taper" values are fractions of a long stroke (×160 px in 2Dope); `size/opacity/shape` are the new
taper settings.

| Brush (stand-in for) | Mapped / not | Pressure → | Curve | Taper start / end · size / opacity / shape | Other |
|---|---|---|---|---|---|
| HB Pencil (2B pencil) | 30 / 165 | size 0.58, opacity 1 | opacity 3-pt | 0 / 0.16 · 0.18 / 0.24 / 0.31 | |
| Acrylic | 30 / 165 | size 0.20, opacity 1 | — | 0.13 / 0.08 · 0 / 1 / 0 | taper fades only (size 0) |
| Soft Airbrush (Airbrush) | 29 / 166 | opacity 1 | — | 0 / 1 · 0 / 1 / 0 | end fade only |
| Dry Ink | 29 / 166 | size 1 | size 3-pt | 0.29 / 0.21 · 1 / 1 / 0.82 | stabilise 0.30, size jitter 0.23, opacity jitter 0.53 |
| 6B Pencil (Grainy Shader) | 30 / 165 | size 0.89, opacity 1 | opacity 3-pt | 0.25 / 0.15 · 0.20 / 0.23 / 0.23 | follows direction |
| Chalk | 29 / 166 | size 1 | size 3-pt | 0.10 / 0.26 · 0.97 / 0 / 0.37 | StreamLine 0.43 |
| Fat Nozzle (Spray) | 26 / 169 | size 0.13, opacity 1 | opacity 3-pt | — | scatter 0.04 |
| Watercolor | 26 / 169 | size 0.37, opacity 1 | — | — | wet mix not supported |
| Studio Pen (Inker) | 29 / 166 | size 1 | size 3-pt | 0.25 / 0.25 · 0.36 / 0 / 0.62 | StreamLine 0.38 |
| Marker | 30 / 165 | size 0.66, opacity 0.12 | size 3-pt | 0.27 / 0.24 · 0.66 / 1 / 1 | follows direction |
| Signature Brush V1 (Procreate 5.4.9) | 27 / 97 | size 0.58 | straight | 0.28 / 0.29 · 0.68 / 0 / 0 | speed size 1.0 not applied (pressure drives size) |

None of the ten has its shape or grain picture in the folder (bundled), so all ten import with the
round tip and the built-in grain.

Across all 217: 42 brushes bring a non-straight pressure curve, 2 an inverted pressure dynamic
(Gel Pen, Oil Pastel), 7 a speed dynamic (where pressure does not drive that setting), 4 a scatter
above the old 0–2 clamp (Blotch, Flower Power, Glimmer, Splatter).

## Largest "not supported" groups (count of key occurrences over 217 brushes)

tilt dynamics 7800 · wet mix / glaze / rendering 3981 · tip variation (count, flips, randomise,
scatter angle) 2525 · material maps 2246 · smudge/erase/clone sizes 2094 · metadata 2082 · grain
settings without a grain picture 1890 · grain detail 1651 · size/opacity range sliders 1276 · dual
brush 1231 · pressure colour 1230 · pressure response smoothing 1039.

## Not verified

- No rendered comparison with Procreate (no reference strokes at three pressures / two speeds).
- The height approximation, rolling grain (`textureMovement` < 1), rotation units (assumed ×180°)
  and the speed sign convention are reasoned from key names and ranges, not measured.
- Procreate 5.4.9's own brush library is not in the IPA (only Signature); the corpus is Dreams'.
