# Decisions

## 2026-10-09: Milestone 0 setup

- **TypeScript + Vite, no framework.** Fast iteration on pen feel. Rust/WASM (Craft crates) stays an option for heavy algorithms later (path fitting, tracing).
- **Raster first**, vector pen included in a minimal form (pressure width only).
- **Strokes stored as data** (`StrokeRecord`: points with x, y, pressure, tilt, time + brush + color + seed). Raster pixels are a cache. Enables replay, write-on, deterministic export.
- **One `Dynamic` shape** `{control: off|pressure|tilt|speed, min, curve, jitter, invert}` for size, opacity, flow. Modeled on Harmony pen styles and PhotoCraft brush settings (behavior studied, no code copied).
- **Opacity vs flow**: dabs build coverage in a stroke buffer; the stroke composites once at its opacity.
- **Deterministic jitter** via `hash01(seed, dabIndex, salt)`.
- **Pixel undo** for raster strokes (before/after of the stroke's bounding box) for M0. Re-render-from-data undo can come once layers/frames exist.
- **Canvas 2D** for M0. Move to WebGL2 when effects/compositing need it.
- Recorded points are the **stabilized** points, so replay doesn't depend on zoom or stabilizer state.

## 2026-10-09: Tilt shading + frames (M1 slice 1)

- **Tilt shading** is a per-brush `tiltShade` block: past a threshold the dab blends (20° band) into a bigger, lighter, flatter, softer tip angled to the pen's azimuth. Shaded coverage goes to a second buffer with its own grain, so shading is grainy while lines stay crisp in the same stroke.
- Mouse testing: **Alt** simulates a tilted pen.
- **Timing = run-length exposures** `{drawing, length}`; pure functions in `core/timeline.ts`, undo keeps the old array.
- **Add frame inside a hold splits it** (new drawing takes the rest of the hold), so timing stays the same; on a hold's last frame it inserts one frame.
- Drawings are full-size canvases for now. Risk: memory on long shots (8 MB per 1080p drawing). Sparse tiles come before long projects.

## Open

- Pressure curve per device (global) vs per brush only?
- Vector pen: keep raw points vs fit Béziers on commit (VectorCraft-style least squares)?
- Does Safari latency need a native iPad fallback? Measure on device.
