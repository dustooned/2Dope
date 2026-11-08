# Motion effects, November 2026: Fill, Outline, Venetian blinds, Kaleidoscope, Sound wave

2026-11-08 · design and build notes. Fill and Outline (including repeated outlines) are designed in
`docs/LETTERING-DESIGN.md` under "New Motion effects". This doc adds the other three and records
what was built. Parameter references come from EffectCraft's registry (`list_effects`), read
2026-11-08.

All five are ordinary layer effects in `core/effects.ts` and `view/effects.ts`. They work on
drawings, clips, titles, adjustment layers and (later) captions. They stack in order with the
existing effects, run in the same render path for canvas, Share preview and exports, and their
numeric settings are keyable in Motion. Randomness is seeded and timing comes from the frame
number, so a frame renders the same way everywhere.

## Venetian blinds (transition)
EffectCraft's Venetian Blinds has four controls: Completion, Direction, Width and Feather. 2Dope's
version keeps those and adds:

| Setting | What it does | Keyable |
|---|---|---|
| **Completion** | 0% shows the layer, 100% hides it completely | yes |
| **Slat width** | Width of each slat in pixels | yes |
| **Direction** | Angle of the slats | yes |
| **Feather** | Soft slat edges | yes |
| **Style** | **Wipe** (each slat closes from one side), **Split** (each slat closes from its middle out), **Iris** (from both edges in) | — |
| **Stagger** | Slats start one after another instead of together (0 = all at once) | yes |
| **Order** | Forward, Reverse, Middle out, Random (seeded) for the stagger | — |
| **Scroll** | Slides the slats across the layer, for moving blinds | yes |
| **Shade** | Darkens slats as they close, for a turning 3D look | yes |
| **Reveal colour** | Closed slats show a colour instead of see-through | — |
| **Invert** | Swap what is shown and hidden | — |

## Kaleidoscope
EffectCraft's CC Kaleida has Center, Size, Rotation and Mirroring (Flower, Starlish, Unfold, Wheel,
Triangles). 2Dope's version:

| Setting | What it does | Keyable |
|---|---|---|
| **Segments** | How many slices around the centre (2–32) | yes, stepped |
| **Style** | **Flower** (mirrored slices), **Wheel** (rotated copies, no mirror), **Starlish** (mirrored, alternate slices shifted), **Unfold** (four-way mirror), **Triangles** (a mirrored triangle tiling) | — |
| **Centre** | Where the pattern turns around (percent across and down) | yes |
| **Size** | Zoom of the sampled picture inside each slice | yes |
| **Rotation** | Turns the whole pattern | yes |
| **Source angle** | Which slice of the original is copied; animate it to make the pattern flow | yes |
| **Spin** | Degrees per second of automatic rotation (frame-based, repeatable) | yes |
| **Mix** | Blend with the original | yes |

## Sound wave (generator)
EffectCraft has Audio Waveform and Audio Spectrum as two effects. 2Dope has one **Sound wave**
effect with a **Type**. It draws the shot's sound onto the layer, so the effects after it in the
stack (Kaleidoscope, Glow, Outline, Blur…) act on the drawn wave, as in EffectCraft.

| Setting | What it does | Keyable |
|---|---|---|
| **Type** | **Waveform** (the sound wave itself) or **Spectrum** (frequency bars) | — |
| **Shape** | **Line** between Start and End points, or **Circle** around a centre | — |
| **Start / End** (line) or **Centre / Radius** (circle) | Where it is drawn (percent of the layer) | yes |
| **Detail** | Samples (waveform) or bands (spectrum) across the shape | yes, stepped |
| **Height** | Largest swing in pixels | yes |
| **Thickness** / **Softness** | Line weight and edge softness | yes |
| **Look** | **Bars** (digital), **Lines** (analog), **Dots** | — |
| **Sides** | **Both**: the classic signed wave through the middle (lines) or mirrored bars/dots. **Up** or **Down**: one side only (lines become an envelope) | — |
| **Window** | How much sound each frame looks at (milliseconds) | yes |
| **Offset** | Shift the sound earlier or later (milliseconds) | yes |
| **Low / High** (spectrum) | Frequency range shown | yes |
| **Smoothing** | Averages frames for a calmer movement | yes |
| **Colours** | Inside and outside colour (the line or bars shade between them) | — |
| **Over original** | Draw on top of the layer's art, or alone | — |

- **Source**: the shot's sound clips mixed (gain and mute respected), sampled at the frame's time.
  Sounds not yet decoded draw a flat line on the canvas. Exports wait for decoding.
- **Easy start**: Motion → New layer → **Sound wave** makes an empty layer with the effect on it,
  so effects stack on the wave alone.
- **Limits**: Detail up to 1,024, Window up to 1 second. Analysis reuses the FFT already in
  `core/audioreact.ts`.

## What was built (2026-11-08)

All five effects are in `core/effects.ts` (definitions) and `view/fxextra.ts` (rendering).
- **Fill**: Replace, Tint and Multiply, with keyable Opacity.
- **Outline**: exact Euclidean distance field (Felzenszwalb), or Chebyshev for square corners. It works
  only in the art's box grown by the lines' reach. Up to 24 lines; Taper; Fade; palettes and four
  custom colours (no free colour list yet); Cycle and Colour offset; Solid, Gradient, Hatch, Dots and
  Canvas paints; Blend; Outline only. Reach is capped at 480 px and a quarter of the page.
- **Venetian blinds**: every setting listed above.
- **Kaleidoscope**: Flower and Wheel draw each slice with canvas transforms and a clip (fast).
  Starlish, Unfold and Triangles map every pixel.
- **Sound wave**: reads the shot's clips mixed to mono at 22,050 Hz (`ui/soundsource.ts`). The audio is
  cached by clips and decoded sounds, and loads in the background. Share exports and hand-in bundles
  await `soundReady()` first. Layer time is mapped to shot time as start + frame, so a retimed layer
  reads its own frame number.
- **Effect result cache**: the new `EffectDef.frameDependent` adds the frame to the cache key when an
  effect changes by itself (Outline cycling, Kaleidoscope Spin, Sound wave).
- **Format 10**: older readers drop unknown effect types, so a project using any of the five needs
  reader 10 (`FORMAT10_EFFECTS`).
- **Speed** (headless Chromium, unthrottled, 1920×1080 per frame): Outline with 6 lines 74 ms,
  Kaleidoscope 14 ms, Venetian blinds 38–54 ms. Unchanging results are cached. Kaleidoscope's
  pixel-mapped styles took about 380 ms before the Flower and Wheel fast path.
- **Not built yet**: Outline Trail mode, image paint, per-line overrides and a free colour list. These
  need new kinds of stored setting.

## Build order and status
1. Fill and Outline (Around mode, palettes and custom colours, cycle, fade, texture paint).
2. Venetian blinds. 3. Kaleidoscope. 4. Sound wave. 5. Outline Trail mode, image paint and per-line
   overrides, after the first four ship.

Status is recorded at the top of `HANDOFF.md` as each lands.
