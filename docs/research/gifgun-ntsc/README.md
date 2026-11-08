# GifGun 2 and ntsc-rs: export pipeline and a retro-TV effect

2026-10-31 · local inspection for the next Share/effects iteration. Reference only; nothing copied or
executed. Companions: [export settings](../export-settings/README.md),
[wunk plug-ins](../wunk-plugins/README.md).

## Sources

| Artifact | Identity | Method |
|---|---|---|
| `…\Ultimate Mograph Plugins Grab Bag\GifGun v2.0.12 (WIN+MAC)\GifGun2.zip` | CEP bundle `com.aescripts.gifgun2`, **2.0.12**, manifest 5.0; 265 entries | ZIP + readable JS/HTML (no REA needed) |
| `…\Plugins\After Effects\ntsc-rs-windows-afterfx\ntsc-rs-ae.aex` | x86-64 PE, SHA-256 `ad129f80…f354a`, **NTSC-rs 1.5.4** | REA identity; local string inventory (Ghidra string query timed out on the module) |

Neither was installed or run.

## 1. GifGun 2 — what it actually does

GifGun is a CEP panel that drives three bundled binaries: **ffmpeg**, **gifextras**, and ImageMagick
**convert** (`GifGun2/.bin/`). The encode path in the bundle's JS is explicit:

- palette generation: `ffmpeg … palettegen=stats_mode=diff:max_colors=<N>` (or
  `stats_mode=single` when "better colours" is on);
- palette application: `paletteuse=dither=bayer:bayer_scale=3`;
- loop count passed as `-loop <n>`;
- gifextras used for lossy GIF compression.

Its settings object (defaults, read from the bundle) is:

| Setting | Default | Notes |
|---|---|---|
| `resWidth` | 300 (presets also 250 / 600) | width only; height follows the comp |
| `fps` | `"10"` (presets also `"25"`) | string-typed |
| `maxColors` | **256** | palette size |
| `loop` / `infLoop` | `0` / `true` | infinite loop by default |
| `output` | `"Lossless"` | gifextras mode |
| `compression` | `"None"` | gifextras compression |
| `useBetterColors` | `false` | switches palettegen from `diff` to `single` (two-pass) |
| `pixelart` | `false` | nearest-neighbour style resampling flag |
| `keepVideoSource`, `openGifFolder`, render presets | — | workflow options |

Read as a design: GIF export is **width + fps + colours + dither + loop + lossy mode + pixel-art
resampling**, with three quality presets hiding most of it. That is a better model than a single
"quality" slider, and it is cheap for 2Dope because our GIF path already rasterises frames.

### What 2Dope should take

| # | Take | Why | Effort |
|---|---|---|---|
| 1 | **Max colours** (2–256, default 256) with palette quantisation | the single biggest GIF quality/size control | S |
| 2 | **Dither choice**: none / ordered (Bayer, with scale) / error diffusion | we already have both engines in `core/dither.ts` | S |
| 3 | **Better colours** = two-pass palette (per-clip vs per-frame stats) | kills frame-to-frame palette flicker | M |
| 4 | **Loop**: infinite / N times / once | trivial flag in the GIF encoder | S |
| 5 | **Pixel-art resampling** (nearest) beside smooth | students making pixel art will notice | S |

Not worth copying: the bundled binaries and the three-preset naming; 2Dope should compute palettes in
its own encoder.

## 2. ntsc-rs — the full retro-TV surface

Strings in the plug-in give both **parameter ids and UI descriptions**. Grouped as shipped:

| Group | Controls (id) |
|---|---|
| Composite signal | `composite_noise` (+ `_intensity`, `_detail`, `_frequency`), `composite_preemphasis`, `composite_out_chroma_lowpass`, `composite_out_chroma_lowpass_lite`, `composite_sharpening` |
| Luma | `luma_noise` (+ intensity/detail/frequency), `input_luma_filter` (Notch / Box / None) |
| Chroma | `chroma_noise`, `chroma_phase_noise`, `chroma_phase_error`, `chroma_delay_horizontal`, `chroma_demodulation` (1-line comb / 2-line comb / Notch / Box), `input_chroma_lowpass`, `output_chroma_lowpass` |
| Artifacts | `color_bleed_horiz`, `color_bleed_vert`, `ringing` (+ `_frequency`, `_power`, `_shift`), `video_scanline_phase_shift` (0/90/180/270°), `video_scanline_phase_shift_offset` |
| VHS | `vhs_tape_speed` (SP/LP/EP), `vhs_chroma_loss`, `vhs_edge_wave` (+ `_enabled`, `_frequency`, `_detail`), `vhs_head_switching` (+ `_height`, `_mid_line_jitter`), `vhs_sharpen` (+ `_enabled`, `_frequency`), `vhs_chroma_vert_blend` |
| Tracking | `tracking_noise` (+ `_height`, `_wave_intensity`, `_noise_intensity`, `_snow_intensity`, `_snow_anisotropy`) |
| Fielding | `use_field` (Alternating / Upper only / Lower only / Interleaved upper / Interleaved lower / Both) |
| Scale | `scale_with_video_size`, `bandwidth_scale` (horizontal), plus vertical scale |
| Presets | "ntsc-rs preset" is named; "ntscQT presets are not supported" |

The algorithm strings also name the modules (`ntsc.rs`, `yiq_fielding.rs`, `noise.rs`, `filter.rs`,
`shift.rs`) and the docs URL `https://ntsc.rs/docs/after-effects-plugin/`.

Read as a design: this is a **signal emulation** (modulate to composite, filter, demodulate), not a
stylise pass. A faithful port needs YIQ modulation per scanline; that is a large piece of work and
would not fit 2Dope's per-layer Canvas 2D stack well.

### What 2Dope should take (a "Retro TV" look, not a port)

A simplified effect with five controls, all cheap on the existing canvas:

1. **Scanline phase shift** (0/90/180/270°) — shift chroma channels per row.
2. **Chroma delay/bleed** — offset R/B horizontally by a few pixels (chromatic fringe).
3. **Noise** — luma + chroma, intensity/frequency, seeded.
4. **Head switching** — a jittered band at the bottom few percent, height + jitter.
5. **Edge wave / ringing** — horizontal sine wave + a small echo for "bad tape".

That is a credible VHS look without modulation/demodulation, and it reuses the seeded-noise and
offset machinery already in `view/effects.ts`.

## 3. Unknowns

- GifGun's defaults come from a minified settings object; every option exists, but the UI's exact
  ranges and the gifextras lossy levels were not read.
- ntsc-rs defaults are not in the strings; only ids, labels and descriptions. Its Ghidra string
  query timed out, so no function-level analysis exists.
- Neither tool was executed; no output was compared against 2Dope's current GIF/video.

## 4. Evidence

| Evidence | Covers |
|---|---|
| `GifGun2/CSXS/manifest.xml` | bundle id + 2.0.12 |
| `GifGun2/main.*.js` | ffmpeg palettegen/paletteuse args, settings defaults |
| `ntsc-rs-ae.aex` SHA-256 `ad129f80…f354a` | parameter ids, descriptions, version 1.5.4 |
