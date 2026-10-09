# Deconstruction 06: Craft source deep dive (brushes, vectors, audio)

Repos (Apache-2.0, shallow clones, read-only) in `E:\2026\Dev\Apps\2Dope\reference\`:
photocraft (Photoshop), vectorcraft (Illustrator), filmcraft (Premiere), designcraft (InDesign), soundcraft (Pro Tools). EffectCraft at `C:\Users\dusto\effectcraft`.
Apache-2.0 allows reuse with attribution + NOTICE. All are Rust; 2Dope spec is TypeScript → port ideas/algorithms, or compile crates to WASM.

## A. PhotoCraft brush engine (`crates/paint`) — best natural-brush reference
Design rules worth copying verbatim:
- **Strokes are data** (`Stroke { brush, points }`), replayable and testable.
- **Deterministic jitter**: every random value = hash(stroke seed, dab index). Same stroke → same pixels on scrub/export. (Matches our determinism rule.)
- **Incremental**: feed points in any chunking, get identical dabs (key for live drawing + replay).
- **Opacity vs Flow**: within a stroke, flow builds coverage per dab up to the opacity ceiling; stroke composites once at stroke opacity.

`StrokePoint`: x, y, pressure (1 for mouse), tilt_x, tilt_y (Pointer Events), rotation, wheel, time.

`Dynamic { control, jitter, minimum, fade_steps }` with **Control = Off | Fade | PenPressure | PenTilt | StylusWheel | Rotation | InitialDirection | Direction**. One struct reused everywhere (same idea as Harmony; doc 02).

`BrushSettings` sections (each toggleable, with section locks):
| Section | Fields |
|---|---|
| Core | size, hardness, spacing (or speed-based spacing when off), opacity, flow, angle, roundness, flip x/y, aliased, erase, blend mode, tip (Round / Sampled / Stored) |
| Shape dynamics | size, angle, roundness Dynamics; tilt scale; flip jitter; brush projection |
| Scattering | scatter, both axes, count, count jitter |
| Texture | pattern (procedural Noise/Canvas/Paper/Dots or tile), invert, scale, brightness, contrast, each-tip, mask mode (Multiply…Height), depth + depth jitter |
| Dual brush | second tip with own size/spacing/scatter/count, mask mode |
| Color dynamics | per tip, fg/bg mix, hue/sat/bright jitter, purity |
| Transfer | opacity, flow, wetness, mix Dynamics |
| Pose | fixed tilt/rotation/pressure overrides |
| Smoothing | amount, **pulled string** (lazy mouse), catch-up, catch-up on end, adjust for zoom |
| Other | noise, wet edges, build-up (airbrush), protect texture |
Also: **Mixer brush** (wet, load, mix, flow, sample all layers; reservoir + pickup state) for v2 wet-mixing; **symmetry** (vertical, horizontal, dual, diagonal, center, rotation); **procedural tips** (chalk, spatter, bristle, charcoal, leaf, grass, sponge, star, rake); **ABR import** (`io/abr_map.rs`); compact **16-bit grayscale tiles as base64 in JSON** for tips/textures.

2Dope:
- ➕ Adopt this section layout for the brush panel and native brush JSON. It covers Procreate/ABR mapping too.
- ➕ Smoothing options: pulled-string + catch-up are what animators expect (Procreate StreamLine equivalent).
- ➕ Procedural tips = instant natural media presets with zero image assets (pencil, charcoal, chalk, ink spatter).
- ➕ Symmetry: cheap win for character turnarounds / effects.
- ➕ Speed-based spacing when spacing is off.
- Defer: mixer/wet (spec non-goal v1), but reserve the `transfer.wetness/mix` fields.

## B. VectorCraft (`crates/brush`, `tools`, `pathops`, `trace`, `doc`)
Brush types (on vector strokes): **Calligraphic** (elliptical nib: angle, roundness %, size, per-stroke variation), **Scatter** (art copies: size/spacing/scatter/rotation ranges, rotate-to-path, colorization), **Art** (stretch art along path), **Pattern**, **Bristle**. Colorization: None / Tints / Tints&Shades / HueShift.
- ➕ Calligraphic nib = the cleanest "ink line" for vector animation. Pair with pressure.
- ➕ Scatter brush on a path = leaves, sparkles, dust trails; animate path trim → effects animation.

**Variable-width profiles** (`doc/appearance.rs`): `(position 0..1, left width, right width)` list, named saveable profiles, built-ins.
- ➕ Asymmetric left/right width = thick-thin inking. Store per vector stroke; pressure writes it.

Gesture tools (`tools/draw2/gesture.rs`): **Pencil** (live fitted preview, close by ending near start, continue a selected open path by starting near its end, snaps endpoints), **Paintbrush**, **Blob Brush** (strokes merge into filled shapes), Eraser, Knife, **Smooth**, **Path Eraser**, Join.
- ➕ "Start near an endpoint continues the line" + "end near start closes it": essential for clean vector line art.
- ➕ **Blob brush** = draw filled shapes that merge with same-color neighbors. Great for vector color fills/shadows.

**Shaper** (`docs/shaper.md`): sketch rough shape → snaps to rect/ellipse/triangle/hexagon/line; scribble across overlapping shapes to merge/delete regions; originals kept editable.
- ➕ Later: quick shape recognition (hold-to-snap like Procreate QuickShape).

Path ops (`pathops`): least-squares **cubic Bézier fit** (Graphics Gems method; this is our stroke smoothing), simplify, smooth, remove redundant points, add anchors, average, join, boolean/pathfinder, offset, planar map (live paint regions).
- ➕ Planar map = fill regions between vector lines without closing paths (Live Paint). This is the vector version of our gap-closing fill. Strong fit.

Trace (`trace`): quantize → contour; and **centerline** (distance transform → Zhang-Suen skeleton → stroked center lines for thin parts, fills for wide parts).
- ➕ Centerline trace = our later-idea "raster roughs → editable vector strokes". Algorithm is documented in the file header.

## C. SoundCraft (`crates/audio-io/peaks.rs`)
- ➕ **Multi-resolution min/max peak overview** for waveform drawing (compute once, zoom instantly). Use for waveform layers.
- Loudness/peak meters exist if we ever need a level readout for `audio.amplitude`.

## D. Cross-repo architecture lessons
- `#![forbid(unsafe_code)]`, no panics/unwrap in libs ("never crash" rule).
- Tools only emit actions; geometry runs in engine commands so **gestures replay through the journal** (undo, tests, automation all free).
- Every app: command registry + CLI + localhost control port + MCP. ✅ adopt for 2Dope.
