# Zaebects `signal.aex`: a simpler VHS/analog-effect reference

2026-10-31 · local inspection of
`C:\Program Files\Adobe\Common\Plug-ins\7.0\MediaCore\Zaebects\signal.aex`.
Reference only; nothing executed. Companion: [GifGun + ntsc-rs](../gifgun-ntsc/README.md).

## Identity

| Item | Value |
|---|---|
| File | `signal.aex`, **676 KB**, x86-64 PE |
| Match name | `ADBE Signal` |
| Vendor strings | `Zaebects`, "Thanks for using Signal plugin. Team Zaebects." |
| Framework strings | AEScripts licensing framework (`aescripts-license-fw/`), AE plugin helper suites |
| Version | not exposed in the strings read |

Only **one** plug-in is present in this folder (the earlier folder inventory that suggested twenty
`signal.aex` copies was counting other packs).

## The control surface (14 labels)

Read from the binary's defined strings:

| Group | Controls |
|---|---|
| Strength | **Signal strength**, **Signal amplification** |
| Noise | **Static**, **Luma noise**, **Chroma noise**, **Hue Noise** |
| Chroma | **Chroma loss**, **Chroma vertical blend** |
| Scan | **Scanlines blur**, **Phase shift**, **Phase shift offset** |
| Time | **Roll speed**, **Distortion speed**, **Frequency** |

No further control-like labels were found with a second pass over the string table, so this is
likely the whole surface (checkboxes reuse the same words as their slider).

## What it is, and why it matters

This is a **VHS/analog signal look** built from the same vocabulary as ntsc-rs, but far smaller: no
composite modulation, no fielding, no tracking-noise stack. It is the "few knobs, strong look"
version of the family:

- **Signal strength / amplification** — wet/dry and gain of the whole effect.
- **Static + Luma/Chroma/Hue noise** — four separate noise characters (monochrome speckle, luma
  grain, chroma grain, coarse hue blotches), which is what makes the look read as tape rather than
  film grain.
- **Chroma loss / Chroma vertical blend** — desaturate and vertically smear colour, the classic
  "bleeding colour under a sharp luma" of VHS.
- **Scanlines blur, Phase shift (+ offset)** — per-row blur and per-row chroma displacement.
- **Roll speed, Distortion speed, Frequency** — the *animated* part: vertical roll, noise evolution
  speed, and noise scale.

The two independent references now agree on the control vocabulary: ntsc-rs exposes the same ideas
with more depth (comb filters, head switching, edge wave), and Zaebects ships the student-sized
subset. That is good evidence for the shape of 2Dope's effect.

## Proposed 2Dope effect: "Retro TV" (one card, eight controls)

Keep the effect id `retro`/`vhs` and map the shared vocabulary:

| Control | Range / default | Implementation on the existing canvas |
|---|---|---|
| Strength | 0–100 %, default 100 | wet/dry mix at the end |
| Static | 0–100 %, default 12 | seeded mono speckle (reuse `hash01`) |
| Chroma loss | 0–100 %, default 30 | desaturate, keep luma |
| Chroma shift | 0–8 px, default 2 | per-row offset of R/B (phase shift) |
| Phase offset | 0–360°, default 0 | constant offset added to the row shift |
| Scanline blur | 0–8 px, default 0 | small vertical box blur per row |
| Roll | −4…4 rows/frame, default 0 | vertical scroll of the sampled image |
| Distortion speed | 0–8, default 2 | how often the noise field changes (`hold`-like) |

Keep `size` as the noise frequency (4–120 px). Seeded and deterministic like the other effects, so
scrubbing, export and Share agree. `hold` can stay 1 for smooth motion, or 2 for a chunkier tape.

Effort: **S–M**. All operations are row-wise or per-pixel on an ImageData that the effect pipeline
already allocates; no modulation/demodulation, no new dependencies.

## Limits

- Labels only: no ranges, defaults or ordering were recovered, and the plugin was not run.
- The binary uses the AEScripts licensing framework; only strings were read.
- Whether each control is a slider, checkbox or popup is not established (the labels suggest sliders
  plus at least one checkbox, "Static").
- ntsc-rs remains the deeper reference for artifacts this effect omits (head switching, tracking
  noise, edge wave) if we ever want a second "worn tape" preset.

## Evidence

| Evidence | Covers |
|---|---|
| `signal.aex` defined strings | 14 control labels, match name, vendor/licence strings |
| [GifGun + ntsc-rs](../gifgun-ntsc/README.md) | the deeper parameter inventory this subset mirrors |
