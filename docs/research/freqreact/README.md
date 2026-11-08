# FreqReact 3.0.47: audio-reactive motion, read from the package

2026-10-31 · local inspection of `D:\Downloads\FreqReact_3.0.47.zip` → `FreqReact-v3.0.47.zxp`.
Reference only; nothing installed or executed. Companion:
[mograph tool shortlist](../mograph-tool-shortlist/README.md),
[EffectCraft motion + FX](../effectcraft-motion-and-fx/README.md).

Method note: this package is **not** a native binary, so REA's native provider has nothing to
decompile. It is a CEP extension whose **JSX source ships readable**, and whose animation presets are
RIFX `.ffx` with an embedded JSON control schema. Everything below is read from those files.

## Identity and inventory

| Item | Value |
|---|---|
| Outer zip | `FreqReact_3.0.47.zip` (0.93 MB) |
| Extension | `FreqReact-v3.0.47.zxp`, CEP, 81 entries, signed (`META-INF/signatures.xml`) |
| Host-side code | 12 readable `.jsx` (ReactorExpression 39.7 KB, ReactorSystem 47 KB, Bridge 32.4 KB, ProfileStore 28.5 KB, ProfileManagement 29.8 KB, …) |
| Panel code | `assets/main-*.js` (444 KB), `spectrum-*.js` (412 KB), `settings-*.js` (236 KB), `dashboard-*.js`; `meyda.min.js` (audio feature extraction) |
| Presets | **34 `.ffx`** — 8 reactor types × {1D, 2D, 3D, Color} + `frProfile`, `reactRangeBake`, `reactSpectrumControls` |
| Docs | `START HERE.txt` → `freqreact.com/start`, `LICENSES.txt` |

## How it works (from the JSX)

1. An **audio layer** carries a profile effect named `#FreqProfile <name>`; it exposes
   `Custom 1..N` values (band energies / triggers) plus `Custom 10` (trigger) for Elastic.
2. A **reactor effect** (`Pseudo/pulse1Da`, `Pseudo/elastic2Da`, …) sits on the target layer with
   controls and hidden `reactOutput` / `outputSmooth` point properties.
3. `ReactorExpression.jsx` writes an expression into the target property that reads the profile's
   Custom values and the reactor's controls, then outputs the animated value.
4. `reactRangeBake.ffx` provides a bake path (keys instead of expressions) — relevant for 2Dope.

## Reactor types and dimensions

Types: **Pulse, Elastic, Oscillate, Steps, Wiggle, Flicker, Switch, Trigger**. Each ships in
**1D, 2D, 3D and Color** variants (Color uses channel intensities instead of X/Y/Z).

## Control surfaces (from the `.ffx` control schema)

**Pulse** (`Pseudo/pulse1Da`):

| Control | Type | Default | Soft range | Hard range |
|---|---|---:|---|---|
| X Intensity (Y/Z in 2D/3D) | slider | 0 | −1000…1000 | −5000…5000 |
| Additive | checkbox | off | — | — |
| Decay | slider | 0 | 0…100 | 0…100 |
| Smoothing | slider | 0 | 0…100 | 0…100 |
| Time Offset | slider | 0 | −100…100 | −500…500 |
| Master Intensity | slider | 100% | −100…100 | −1000…1000 |
| Aux 1–3 | slider | 0 | ±100000 | ±1000000 |

**Elastic** (`Pseudo/elastic2Da`): X/Y Intensity, **Elasticity** 50 (1…100), Smoothing, Time Offset,
Master Intensity, Aux 1–3.

**Oscillate**: Decay, Additive, **Osc Speed** (1…100 → mapped to 0.5…35 internally), **Osc Type**
(sin / triangle / …), Smoothing, Time Offset, Master, Aux.

**Spectrum Controls** (`Pseudo/spectrumControlsa`): **Start Frequency 10 Hz** (1…22050), **End
Frequency 250 Hz** (1…22050), **Spectrum Height 10000** (1…32000), Output 0…100.

## The maths (read from the expression templates)

- **Pulse**: picks a profile output (or decay output when Additive), then cross-fades between three
  decay stages with `linear(decayAmount, 0/33.3/66.6, …, 0, 1)`; output = `finalOutput × Intensity
  × Master + Aux`.
- **Elastic**: `decay = linear(Elasticity, 1, 100, 2, 0.1)`;
  `e = ((2·|i mod 2a − a| − a) / exp(trigger·decay)) · mod` with `freq = 10`, `mod = linear(Elasticity,
  1,100, 0.9, 0.55)` — i.e. a triangle wave damped by the trigger envelope.
- **Oscillate**: `oscSpeed = linear(speed, 1,100, .5,35)`; sin uses `sin(time·speed)·finalOutput·0.5`,
  triangle uses the same triangle formula — driven by the band output rather than raw time.

## Preset inventory (34)

`reactPulse{1D,2D,3D,Color}`, `reactElastic…`, `reactOscillate…`, `reactSteps…`, `reactWiggle…`,
`reactFlicker…`, `reactSwitch…`, `reactTrigger…`, plus `frProfile`, `reactRangeBake`,
`reactSpectrumControls`.

## What 2Dope should build: "Audio React" (bake, don't evaluate)

Expressions are the wrong model for 2Dope (no expression engine, and export must be reproducible).
The equivalent that fits:

1. **Analyse the clip's audio offline** per frame: FFT bands between Start/End Hz (defaults 10–250 Hz
   for the bass band, as the spectrum control does), produce an envelope with decay and smoothing.
2. **Bake keys** onto the chosen property: one key per frame (or per N frames), values scaled by
   Intensity × Master + Aux. This is exactly what `reactRangeBake` does in AE, and it keeps undo,
   autosave, scrubbing and export identical.
3. **Reactor types to offer**: Pulse, Elastic, Oscillate, Wiggle, Flicker — the five that read as
   motion; Steps/Switch/Trigger are more "data" than animation and can wait.
4. **Controls** (one card): Source (which audio clip), Band Start/End Hz, Reactor type, Intensity
   (X/Y), Decay, Smoothing, Time Offset, Master, New seed (for Wiggle/Flicker).
5. Determinism: same audio + same settings + same seed = same keys. Store the settings on the layer
   like an effect so re-baking is repeatable.

Effort **M**: the audio decode already exists for playback/waveform; the new parts are the offline
FFT, the envelope maths and the bake UI. Risk is performance on long clips, not correctness.

## Limits

- Panel JS is minified; band count, FFT size and windowing come from Meyda and were not read.
- The expression templates were read but not run; exact decay curve shape at extremes is unverified.
- The `.ffx` schema gives control defaults/ranges, not the profile's internal band layout.
- No plug-in was installed; no AE project was opened.
