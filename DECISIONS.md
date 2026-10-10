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

## 2026-10-10: Onion skin + scrub lock (M1 slice 2)

- Onion skin shows **distinct drawings**, not frames (holds skipped), like paper. Ghosts are cached as tinted canvases keyed by drawing + revision + color (max 8 canvases) so rendering is a few drawImage calls.
- **Scrub lock** (from Procreate Dreams, behavior only): a home frame; any scrub (strip drag, Shift + arrows) snaps back on release. Home is a frame index, clamped if the timeline shrinks.
- Onion settings persist per device (localStorage); lock state is session-only for now.

## 2026-10-10: Line + Fill planes and the fill tool (M1 slice 3)

- **Planes:** Drawing = `line` canvas + lazily created `fill` canvas (+ vectors). Display order fill, line, vectors. The fill plane is created on first use (memory). Shade plane deferred.
- **Fill algorithm** (src/fill/fill.ts, pure, tested): barrier = line alpha >= threshold (soft edges block); distance-to-line BFS gives a closing radius capped by the seed's own distance (clicks next to lines still work); flood fill over open pixels; give back the closing band (bounded steps, restricted to the band); grow under the line only into pixels with alpha > 0. 32 ms on a 1920x1080 ring.
- **Why it cannot halo or leak:** the fill only ever enters pixels the line covers (alpha > 0), and the line plane draws on top of it.
- **Known limits:** a gap is only closed on its near side (a few px), so a notch can remain where the line is missing; closing can leave a tiny sliver just past a gap; fills are hard-edged where no line covers the boundary (inside a closed gap). Contiguous region only (no fill-all-enclosed yet); hold-and-slide gesture not built yet.
- The eraser works on the active plane only (no erase-all-planes modifier yet).
- Dev-only `window.__2dope` handle for scripted checks.

## 2026-10-10: Autosave, recovery, versions, project file (M1 slice 4)

- **File = zip of project.json + content-addressed PNG assets** (docs/project-format.md). Content addressing (hash of the PNG bytes) gives free de-duplication, immutable assets, and lets autosave and versions share storage with no per-version copy. A unique hash also avoids the trap of reusing counters (`rev`) across sessions.
- **Own tiny zip reader/writer** (no dependency): STORE on write, STORE+DEFLATE on read, checksums, size caps, zip-slip rejection. Deterministic output.
- **Crash safety:** write new assets first, then the project record that points to them; one write at a time on a queue; a failed save keeps the previous good save and reports the error.
- **Capture is synchronous, encoding is async** (`toBlob` snapshots pixels at call time). That is what makes "save a version right before Clear" exact while the UI keeps going.
- **Schema rules:** additive = no bump; breaking = bump + migrate; newer files refused. Everything validated on load; project.json is read back and validated before every write.
- **PNG round trip is lossless in alpha; RGB can differ by 1 on a few near-transparent pixels** (canvas stores premultiplied alpha). It stabilizes after the first save, so it does not accumulate. Tests compare with tolerance 1 and exact alpha.
- **Not yet:** a stroke being drawn when the tab dies is lost (the last finished stroke is saved); raster strokes are still pixels, not data; recent-projects list / multiple projects in browser storage (one autosave slot for now); only layer 1 opens.

## 2026-10-10: Timeline, exposure and roles (M1 slice 5)

- **Drags preview live without touching history and commit as ONE command** (before/after exposure arrays), so a whole drag is one undo step and a cancelled drag leaves no trace.
- **Selection is by exposure index** and is cleared by edits that shift indices (add, delete, move, undo/redo of those) but kept by exposure/hold changes, which do not.
- **Exposure = set every selected hold to N** (never deletes a drawing). Setting back to 1s restores 1 each; per-drawing original lengths are not remembered (simple, predictable).
- **Roles (key/breakdown/inbetween) are an optional per-drawing field**, saved in project.json without a schema bump (additive; unknown values ignored). Onion "keys only" uses it.
- **Keys 1-4 now set exposure** (as in the original spec); 100% zoom moved to Shift+1.
- Not built yet: in/out markers and loop range, ripple modifier, frame-range (sub-block) marquee, moving several blocks at once, per-layer frame-rate override.

## 2026-10-10: X-sheet and Quick Animate (M1 slice 6)

- **X-sheet is a view of the same exposures** (selection, exposure, roles, undo and autosave are shared), living as a tab in the side panel so the strip stays visible. One column for now because there is one layer; it becomes one column per layer with compositing.
- **Typing a number follows the paper convention:** it shows that drawing from the typed frame to the end of its hold (splitting the hold), and merges equal neighbors. A number with no drawing creates a blank one. Pure and tested (`exposeAt`).
- **Notes live on the exposure** (not on a frame number), so they survive retiming, reordering and splitting. Stored as an optional `note` (no schema bump).
- **Quick Animate = a body class + one floating bar**, not a second app: it reuses the strip and every command, hides the rest with CSS, and fades while a stroke is live (`onStrokeState`). Mode is remembered per device.
- **Keys changed:** Tab = Quick Animate, Shift+Tab = hide UI, Shift+X = X-sheet tab. The X-sheet grid handles its own keys (`data-own-keys`) so digits type drawing numbers instead of setting exposure.
- Refit uses a timer, not requestAnimationFrame (which pauses in background tabs).
- Not built yet: new-project flipbook template, phoneme/dialogue columns, sheet columns for sound and camera, X-sheet text export.

## Open

- Pressure curve per device (global) vs per brush only?
- Vector pen: keep raw points vs fit Béziers on commit (VectorCraft-style least squares)?
- Does Safari latency need a native iPad fallback? Measure on device.
