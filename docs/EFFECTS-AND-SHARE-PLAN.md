# Effects, gradient fills and Share mode: plan

2026-10-18 · agreed order · step 1 (Share mode) built

## Order

1. **Share mode** (done 2026-10-18): the last mode bubble. Preview the whole shot as it will come out (same compositor as export, sound along), choose Video or GIF with their settings, read the checks, make it, watch the result, Save or Share (system share sheet). More formats keeps PNG frames, storyboard, Blender, backup.
2. **Effects foundation + Line boil** (Motion).
3. **Gradient fills** for the Fill bucket.
4. **Texture fill, Noise / grain, Turbulent displace.**
5. **Dither** (RetroDither-style, our own implementation of public algorithms).
6. **Polish pass + iPad test.**

## 2. Effects foundation

- An ordered effect stack per layer, with a target: the whole layer, its Line, or its Fill; plus a shot-level stack (dither, grain, colour) applied after the camera.
- Parameters are keyable props (Motion rows); seeds are fixed per effect, so playback, scrubbing, undo and export match.
- **Hold** (boil on 1s / 2s / 3s): the random pattern changes every N frames, not every frame.
- One evaluator for Draw (optional "show effects" toggle, off while drawing), Motion, Share and every export. Preview quality drops while playing; exports are always full quality.
- Cached per (drawing revision, parameters, held frame); bounded scratch canvases; Lite budgets respected.
- Saved as optional `.2dope` fields; older files open unchanged. Blender export bakes effects into the rendered passes when "include effects" is on.
- UI: Motion layer properties gain an **Effects** fold (add, reorder, on/off, delete); an fx bubble in Motion.

**Line boil** (the first effect): a smooth noise displacement map on Line (strength in px, scale, hold, seed). Vector lines can boil by moving their points instead (crisp).

## 3. Gradient fills

- Fill bucket options: **Solid / Linear / Radial**, two colours (current + second, swap), opacity per stop.
- Tap fills the area; drag across it sets the gradient direction (radial: centre → edge), previewed live, one undo step. Works with Fill across, selections and ColorDrop. Stored as pixels (no format change).

## 4. Texture and noise

- **Texture fill** (target Fill): paper, crayon, canvas, halftone, or an imported picture; scale, strength, blend (multiply / overlay / screen), locked to the page or moving with the layer; optional boil.
- **Noise / film grain**: amount, size, mono or colour, animated or held.
- **Turbulent displace**: amount, size, complexity (octaves), evolution (animates), hold. Line boil is the Line-only preset.

## 5. Dither

From the RetroDither manual (the plugin's binaries were inspected only to confirm its menu text is not readable; no code was used): palette, algorithm, downscale, threshold, grayscale, serpentine.

- **Palette**: adaptive N colours (median cut, see `paletteFromPixels`), 1-bit, Game Boy, CGA, EGA, C64, ZX Spectrum, PICO-8, NES-like, or a palette from the colour panel.
- **Algorithm**: ordered Bayer 2×2 / 4×4 / 8×8 (stable from frame to frame: the default for animation), and error diffusion: Floyd–Steinberg, Atkinson, Jarvis–Judice–Ninke, Stucki, Burkes, Sierra (these shimmer on moving images; offered with a warning).
- **Pixel size** (downscale), **threshold**, **grayscale first**, **serpentine** (error diffusion).
- Shot-level by default; also per layer.

## Later candidates

Glow, colour overlay / duotone, posterize, halftone, chromatic aberration, blur and motion blur, outline / drop shadow, sparkles; Share title card (project name and student) and frame range.
