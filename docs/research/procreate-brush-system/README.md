# Procreate brush system: what is stored, what 2Dope imports, and why feel differs

2026-10-31/11-01 · local archive REA of Procreate 5.4.9 and Procreate Dreams 1.0.11, compared with
2Dope's brush model and importer. Reference only.

## Sources and method

| Source | What was read |
|---|---|
| Procreate 5.4.9 IPA | `ValkyrieBrushResources.bundle/Brushes/Signature.brush/Brush.archive` — NSKeyedArchiver, **124 stored keys** |
| Dreams 1.0.11 IPA | **241 `.brush` archives** under `ValkyrieBrushResources.bundle/Brushes/*.brush/` — same ValkyrieBrush family; aggregated min/median/max per key |
| 2Dope | `src/core/brush.ts` (`BrushSettings`, `Dynamic`), `src/io/brushimport.ts` (Procreate `.brush`/`.brushset`, `.abr`) |

Tools: `_tools/nsarchive_dump.py` (one archive → key paths/values) and `_tools/brush_aggregate.py`
(241 archives → ranges). Both read the IPA in place; nothing extracted or executed.

Caveat: the corpus is **Dreams'** built-in brushes. They use the same key names as Procreate's
Signature brush, but Procreate's own defaults may differ. Treat the ranges as "what the engine uses",
not as Procreate 5.4.9's factory values.

## The serialized brush (groups seen in both)

| Group | Keys (examples) | Observed range across 241 brushes |
|---|---|---|
| Size / opacity | `minSize`, `maxSize`, `paintSize`, `paintOpacity`, `maxOpacity`, `smudgeSize/Opacity`, `eraseSize/Opacity` | sizes ~0.006–1.8 (fraction of canvas), opacity 0–1 |
| Spacing / plot | `plotSpacing`, `plotJitter`, `plotSmoothing`, `plotMovingAverageStabilization`, `plotFFTSmoothingAmount` | spacing 0.018–0.72; jitter 0–7.9; smoothing 0–0.83; stabilisation 0–0.7; FFT 0–0.1 |
| Pressure dynamics | `dynamicsPressureSize`, `…Opacity`, `…Saturation`, `…Hue`, `…Brightness`, `…Bleed`, `…Response`, `…Speed`, plus `…Curve.points` | size −0.75…1 (negative = inverted); opacity 0–1; response 0–0.6; speed 0.3–1 |
| Speed dynamics | `dynamicsSpeedSize`, `dynamicsSpeedOpacity` | −0.68…1 (negative = inverted) |
| Tilt dynamics | `dynamicsTiltSize/Opacity/Bleed/Brightness/…` + `…TiltAngle` | mostly 0; tilt angle 0–0.4 |
| Jitter | `dynamicsJitterSize/Opacity/Hue/Saturation/Lightness/Darkness` (+ per-stroke variants) | 0–1 |
| Taper | `pencilTaperStartLength/EndLength/Size/Opacity/Pressure/Shape/SizeLinked`, `fingerTaper…` | 0–1 each |
| Grain / texture | `bundledGrainPath`, `grainBlendMode`, `grainDepth`, `grainDepthJitter`, `grainDepthMinimum`, `grainOrientation`; also `height/metallic/roughness` maps | grain depth 0–1 (median 1); blend mode 1–28; orientation 1–4 |
| Texture placement | `textureScale`, `textureMovement`, `textureZoom`, `textureRotation`, `textureOrientation`, `textureOffsetJitter`, `textureFilter/FilterMode`, `textureInverted` | scale/zoom/movement ~1; rotation 0 |
| Shape / scatter | `shapeCount`, `shapeCountJitter`, `shapeScatter`, `shapeRotation`, `shapeAngle`, `shapeRoundness`, `shapeFlipX/YJitter`, `shapeRandomise`, `shapeFilter`, `shapeOrientation`, `shapeInverted`, `oriented` | count 0–0.42; scatter 0–2; rotation −1…1; orientation 1–4 |
| Wet / glaze / smudge | `dynamicsWetAccumulation`, `dynamicsWetnessJitter`, `dynamicsGlazeFlow`, `dynamicsGlazedFlow`, `dynamicsGlazeType`, `dynamicsSmudgeAccumulation` | wet 0–1 (median 0.5); glaze flow 0.43–1 |
| Blend / dual | `blendMode`, `dualBlendMode`, `blendGammaCorrect`, `extendedBlend`, `secondaryBrush` | blend 0–8; dual 0–28 |
| Curves | every `dynamics…Curve.points` is a two-point response curve (0/1 anchors by default) | serialized per dynamic |

## What 2Dope imports today

`brushimport.ts` deliberately takes a small set: tip image, name, `paintOpacity`/`maxOpacity`,
`plotSpacing`, `plotJitter` → scatter, `dynamicsPressureSize`, `dynamicsPressureOpacity`,
`dynamicsJitterOpacity`. Its own header says grain textures, dual brushes, wet mixing and most
dynamics do not exist, so imports are "close, not identical".

That is the honest cause of the feel gap — not one bug:

| Procreate feature | 2Dope today | Effect on feel |
|---|---|---|
| Grain image + blend mode + depth + movement | `grainImage`/`grain`/`grainScale` exist, but import ignores the Procreate grain and its blend/depth | Textured brushes feel flat or wrong-scaled |
| Pressure response curves | `Dynamic{control,min,curve,jitter,invert}` exists; import takes only the scalar | Pressure ramp/reversal comes out linear |
| Taper shape/pressure/size-linked | `taperStart/End` only | Ends look clipped instead of drawn |
| Tilt dynamics | `tiltShade` only (shading, not size/bleed) | Chisel/tilt brushes do not respond |
| Wet mix / glaze | `wetPull` exists; import ignores it | Wet media feel dry |
| Shape count/rotation/flip/randomise | absent | Scatter brushes repeat identically |
| Dual brush | absent | Texture brushes that rely on a second tip lose their look |
| Scatter range | clamped 0–2 | Procreate jitter up to 7.9 is flattened |

## Recommended work (in order)

1. **Grain parity** (highest impact on "texture"): import `bundledGrainPath` from the archive's folder,
   map `grainBlendMode` to the existing grain compositing, and honour `grainDepth`,
   `grainDepthMinimum`, `textureScale`, `textureMovement`, `textureZoom`, `textureRotation`,
   `textureOrientation`. Validate with a dry-ink brush at three pressures.
2. **Dynamics curves**: import `dynamics…Curve.points` into `Dynamic.curve` (and negative values into
   `invert`), including `…Response`/`…Speed`. This is what makes pressure feel like a hand, not a
   ramp.
3. **Taper**: map pencil/finger start/end length, size, opacity, pressure, shape and `SizeLinked`
   into the existing taper (add shape/pressure if needed).
4. **Import fidelity fixes**: widen the scatter clamp to 2Dope's real capacity, map
   `plotSmoothing`/`plotMovingAverageStabilization` into `smoothing`/`stabilize`, and map
   `shapeRotation`/`shapeCount` where the renderer supports it.
5. **Later**: tilt dynamics, wet mix/glaze, dual brush, height/metallic/roughness maps.

## Validation

Import 10 representative brushes (2B pencil, Acrylic, Airbrush, Dry Ink, Grainy Shader, Chalk, Spray,
Watercolour, Inker, Marker) and compare strokes at three pressures and two speeds against the
reference. Acceptance: grain pattern visible and correctly scaled, pressure curve matches the
archive's shape, taper ends match, no parameter silently dropped — plus a unit test that every
imported key is either mapped or listed as intentionally unsupported.

## Limits

- Values come from Dreams' factory brushes; Procreate's own presets may differ.
- The archives were parsed, not rendered; no stroke comparison was made here.
- 2Dope's renderer capabilities were read from source, not measured.
