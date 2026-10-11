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

## 2026-10-10: PNG sequence export (M1 slice 7)

- **Output is a zip** (browsers cannot write folders, and Safari cannot at all): one folder per pass plus `export.json`. A desktop wrapper can write real folders later with the same code.
- **Passes are exact because planes are stored separately** (Lines = line plane + vectors, Fills = fill plane, Matte = silhouette). Background only affects Combined so the other passes composite cleanly.
- **Each distinct drawing is rendered once per pass**; held frames reuse the bytes. The export is modal (project cannot change underneath it); Cancel is clean.
- **Encoding is parallel** (up to 6 in flight from one scratch canvas, because `toBlob` copies pixels at call time). Background tabs slow each encode to ~1 s in browsers; this keeps a background export usable. The yield between renders uses a message channel because setTimeout is clamped in background tabs.
- **export.json** is the seed of the Blender manifest (milestone 2).
- Not built yet: exporting while you keep drawing, video/GIF/WebM/ProRes, in/out range markers, PNG-with-project bundle.

## 2026-10-11: Library, memory, gallery, data model (steps 1-3 after M1)

- **Library, not files**: every project lives on the device and is always saved (Procreate Dreams' Theater). `.2dope` is for backup and moving between devices. Assets are shared across projects by content hash; a save is one IndexedDB transaction.
- **Residency instead of tiles (for now)**: only the drawings in use keep canvases; the rest are parked as stored PNGs. Simple, and it fixes the iPad memory crash; sparse tiles stay an option for 4K.
- **One model, three workspaces** (doc 11): comps → layers (drawings, precomp, camera, null) → props with keys. The strip and X-sheet keep editing one active drawings layer through `project.exposures`, so they did not change.
- **Keys follow After Effects semantics in a normalised form**: per side linear/bezier/hold with slope + influence. The four Dreams easings are presets; the numbers map 1:1 to Blender F-curve handles. Keys live in layer time.
- **Parenting keeps the child in place** (re-expressed in the parent's space), like After Effects.
- **Cameras**: several allowed, the topmost visible one frames the comp (After Effects rule). The UI will start with one.
- **No node graph**: parenting, precomps and the layer list cover what Harmony's node view does for us, and work by touch.
- **Export renders the comp** when it is more than one plain layer; identical frames are written once (frame signature of drawings + matrices + opacity).
- Not built yet: Motion workspace UI, precompose/enter/exit, pins (exposed properties), time remap, masks/mattes, motion paths, expressions.

## 2026-10-11: Precomps, play modes, Blender add-on (steps 5-6)

- **Precomps by touch**: Group / double-tap to enter / breadcrumb / Back out; instances share content, Make unique copies; pins (★) expose properties per instance (After Effects' Essential Properties, simplified).
- **Play modes and frame picking** (from studying Nemo, doc 12): once (holds the last frame when made longer) / loop / ping-pong / single frame, speed, and time remap with hold keys for swaps. One function (`contentFrameAt`) decides the content frame everywhere.
- **Blender handoff = a package + a single-file add-on** (no server, no Blender-side state): image planes with baked image sequences (timing is always exact), F-curves with exact Bezier handles, collection instances only when a precomp runs on the shot's clock, otherwise rendered frames. Tested headless in Blender 4.5 LTS and 5.1 against 2Dope's own render.
- Not yet: separate line/fill planes in Blender, blend modes, animated anchors, OCA export.

## 2026-10-11: Touch editing, context menus, flipbook (after the Clip Studio study, doc 13)

- **Transform box = what the layer shows** (alpha bounds of the drawing on screen, cached per drawing revision; precomps union their layers). Scale/rotate move an untouched pivot to the drawing's centre, compensating position, inside the gesture's undo step.
- **Block editing is pure** (`insertAt`, `duplicateBlock`, `moveBlock`, `shiftBlock`, `blockDropIndex` in core/timeline.ts) and each edit selects its result, so the next tap acts on the same block.
- **Paste shows the same drawings by default** (an exposure sheet reuses numbers for cycles); "Paste as new drawings" copies them.
- **One context menu for the app** (ui/contextmenu.ts): right-click, pen barrel button, or one finger held still (450 ms). Each area builds its own items: frames (X-sheet, strip), keys / properties / layers (Motion), tools and frames (Draw canvas), layers (Motion canvas). It opens as a bottom sheet under 600 px. Holding while finger-painting is left to drawing.
- **X-sheet by touch**: a finger on the cells scrolls, on the frame column selects a range; hold lifts the selection, drag moves it, release opens the menu.
- **Flipbook blank page**: stepping past the last frame shows a blank page with the last drawing as onion skin; the first stroke adds the frame. Nothing is created by flipping alone.
- Existing taps stay: 2 fingers undo, 3 redo, 4 hide the interface.

## 2026-10-11: Device profile, Lite mode (step 2 of doc 13)

- **One profile for phones and weak devices** (core/device.ts, pure + tested): form (phone / tablet / desktop) from screen size and the main pointer (a touchscreen laptop stays desktop), tier (low / normal / high) from deviceMemory, cores, and for iOS the screen class (1024×768 iPads and 667-pt iPhones are low). Lite = phone or low tier, or the user's choice (☰ → Device: Auto / Lite / Full, applies on reload).
- **Lite limits**: pages up to 720p (low) or 1080p, 120 / 200 MB of live drawings, 2 / 3 onion skins, 40 / 80 undo steps, screen canvas at 1× / 2× pixel ratio. Full keeps 900 MB on strong desktops, 200 MB on iPad (Safari kills big tabs).
- **Nothing is removed from a project**: a big project opens in Lite with a warning.
- The phone layout (body classes `lite`, `form-phone`) comes in step 9.

## Open

- Pressure curve per device (global) vs per brush only?
- Vector pen: keep raw points vs fit Béziers on commit (VectorCraft-style least squares)?
- Does Safari latency need a native iPad fallback? Measure on device.
