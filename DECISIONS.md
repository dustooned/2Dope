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

## 2026-10-11: Line and Fill parts (step 3 of doc 13)

- **Parts are settings on the drawings layer, not separate layers**: Line and Fill share the drawing's timing (lip sync, swaps and the X-sheet stay simple), but each part can be hidden, faded (keyed), recoloured (tint) or shifted (keyed offset) for the whole shot. Missing settings = defaults, so old files and plain layers are unchanged (additive, no schema bump).
- **Tint keeps alpha** (`source-in` fill on a scratch canvas), so anti-aliased lines recolour cleanly. No per-drawing cache: one scratch draw per tinted part per frame keeps Lite memory flat.
- The Draw view applies hide and fade (the plane you are drawing on stays faintly visible), not offset or tint, so strokes land where the pen is.
- A layer with changed parts is no longer a "plain flipbook", so export goes through the compositor and the Lines / Fills passes follow the parts. Blender gets drawings as drawn for now (noted in the package README).

## 2026-10-11: Fill upgrades (step 5 of doc 13)

- **Lines are read once per drawing** (`prepareFill`: barrier + gap distance), cached until the drawing's lines change; fills keep the cache valid (they only touch the Fill plane). A repeat tap is one flood.
- **One fill gesture, three modes**: Tap / drag (every area the finger crosses fills; seeds on a line are refused so crossing a line does not fill the other side by accident), Lasso (every closed area at least 90 % inside the loop; the background leaks out and is skipped), Leftovers (scrub: unfilled specks whose flood stays small take the commonest colour around them, else the current colour). Each gesture is one undo step.
- **Fill the next N drawings** at the same spot (distinct drawings, holds skipped), all in the same undo step. Leftovers stay on the current drawing (specks differ per drawing).
- Not yet: "refer to other layers" (needs the active layer's transform to match the comp); a worker for very large pages.

## 2026-10-11: Ink (step 6 of doc 13)

- **Ink presets**: Ink (now post-corrected), Brush Pen (strong thin-thick, long tapers), Fine Liner (near-even width), Pixel Ink (no anti-aliasing). Brushes gain optional `antiAlias` (default on) and `postSmooth` (0..1); old saved brushes and stroke records stay valid.
- **No anti-aliasing = alpha thresholded at half** on the stroke image (live preview and commit), so fills lock to the line with no soft rim.
- **Post-correction** smooths the finished stroke's points (Gaussian over arc length, window shrinking at the ends so the line starts and ends where the pen did), then re-renders it from data. Strokes are data, so this is exact and replays the same.
- **The eraser cuts vector lines** on the Line plane: up to the nearest crossings with other vector lines (default), the whole line, or off. Cut ends lose their taper; one undo step with the raster erase.
- Not yet: changing a vector line's width after drawing; vector strokes are always anti-aliased.

## 2026-10-11: Layers in the Draw view

- **Draw shows the whole comp around the layer you draw on**: layers below under it, layers above over it, each placed relative to the drawn-on layer (its page is the view's space), so moved or scaled layers line up as in Motion. Cameras and nulls are not drawn. "Others: Show / Fade / Hide" sets how they look (per device). Their drawings join the residency working set.
- **Layers popover** (toolbar button and the strip's layer chip): tap to draw on a layer, eye, lock (locked layers refuse strokes with a message), up/down, rename (double-tap), add above, delete. All through the comp editor, so undoable and shared with Motion.
- Not yet: thumbnails in the list, per-layer opacity slider, groups of drawing layers.

## 2026-10-11: Workspace roles (step 1 of doc 16's priority)

- **Draw** keeps what you use while drawing: tools, colour, layers, size / opacity sidebar, and a slim strip (layer, frame steps, + frame, duplicate, delete, flipbook, onion on/off, scrub lock, zoom).
- **Time** is where timing lives: holds (1s–4s, any number), K / B / I marks, onion settings, and on/off chips for every layer and the active layer's Lines / Colour, above the X-sheet. The drawing tools, colour and sidebar are hidden there; Motion hides them too.
- The strip class still owns those controls (one place that keeps them in step); main.ts mounts them into the X-sheet tab. Keyboard shortcuts (1–4, K/B/I, N, D, O, L) work everywhere as before.
- **Board tab** (animatic / storyboard, doc 16) is not added yet: it arrives with its content in the storyboard-core step, so there is no empty tab.

## 2026-10-11: Storyboard core (step 2 of doc 16's priority)

- **The storyboard is a guide layer** (`guide: true`) in the shot's comp, on the same clock: panels are its frames (exposures), so retiming a panel is retiming everywhere and nothing needs syncing. Guide layers are left out of every final render (PNG sequence, Blender) unless `guideExport` is on.
- **Captions live on exposures**: dialogue, action, slugging, notes (the X-sheet note is "notes"), additive in the file, capped at 1000 / 300 characters. Duplicated panels start without captions; merging equal neighbours keeps the first panel's captions and fills its empty fields.
- **Board workspace** (first tab): the canvas draws on the selected panel (the board becomes the active layer while you are there, and the previous layer comes back when you leave); cards below with picture, duration (frames) and the four fields. Return moves to the same field of the next panel. + Panel (two seconds), duplicate, delete, move, import images as panels, play, Animate this shot.
- **The real layer is never the board by accident**: with no layer picked, Draw falls back to the first non-guide layer (or a fresh one when drawing starts).
- **Show board in Draw**: Layers popover → Board: Show / Fade (default) / Hide, independent of "Others". The current panel's dialogue shows as a subtitle in Board and while playing.
- Next: export (PDF board pages, PNG zip + captions CSV), then audio, shots end to end, camera per panel.

## 2026-10-12: Timeline foundation (ripple, measured rulers, edit lines)

- **Ripple is on by default** (doc 16, "Live edits"). A timing change *inside* a layer (insert, delete, hold change, panel duration, image panels, drag of a hold) moves everything after it on every layer of the comp: later layers shift, spanning drawings layers hold the drawing on screen longer (or lose frames there), keys after the point move, set comp durations follow. One undo step, labelled "(ripple)". Changes at the very end of a layer push nothing (nothing of that layer comes after them). Motion end trims move the layers that started after the old end. Shift+R switches ripple; holding Alt flips it for one edit; a toolbar switch shows the state.
- **One time format for every timeline**: frames, seconds + frames, or timecode, shared with the X-sheet setting. Tap any frame readout to switch. Rulers space their labels so they never overlap (whole seconds in the seconds formats). Board cards show each panel's start and length in it.
- **Edit lines**: while an edge is dragged (strip holds, Motion bars), a yellow line marks the edited frame on the visible timelines with a label ("out 24 · +3f · ripple"), the part that will shift is shaded, the dragged edge lights up, and the X-sheet marks the same frame.

## 2026-10-12: Storyboard export

- **Board > Export** makes a storyboard **PDF** (our own small PDF writer, src/io/pdf.ts: JPEG pictures at about 150 dpi, built-in Helvetica, no font files) or a **ZIP of panel PNGs + captions.csv**. Layouts: 2 per page with captions beside the picture, 4 or 6 per page with captions below; Letter or A4 landscape; captions on or off. Each panel shows its number, start and length in the current time format; long captions wrap and end with "…" when the cell is full. Picture: the board drawing, or board + animation at the panel's first frame.
- The CSV has one row per panel (panel, start, frames, duration, dialogue, action, slugging, notes, image file), UTF-8 with a BOM for Excel, and a caption starting with = + - @ gets a leading ' so spreadsheets never run it as a formula.
- The shot export gets an **Include the storyboard** switch (the board layer's guideExport; one undo step). Off by default: the board stays out of final renders.
- Characters outside WinAnsi (e.g. CJK, emoji) print as "?" in the PDF for now; the PNG/CSV export keeps them.

## Queued (user, 2026-10-12)

- ~~QuickShape~~ built (below).
- ~~Student manual + What’s new~~ built: src/ui/manualtext.ts (content as data: overview, getting started, gestures, Board, Draw, Time, Motion, export, Lite, shortcuts; UPDATES newest first) and src/ui/manual.ts (contents, search, phone dropdown, Print / PDF). Menu > Help > Manual / What’s new, or ?. A dot on the menu button until new notes are opened; a one-time hint on first launch. **Keep the manual and UPDATES in step with every feature that ships.**

## 2026-10-12: QuickShape

- Hold the pen still (450 ms, 5 px) at the end of a Brush or Pen stroke and it snaps to what it looks like: line, arc, polyline, ellipse, rectangle or polygon (src/core/quickshape.ts: resample, line test, Kåsa circle fit for arcs, PCA ellipse fit, RDP corners; square corners make a rectangle). A scribble does not snap. The eraser never snaps.
- Keep holding and move: the first point stays pinned and the pen drags the second (user, 2026-10-12: "like in other programs"). Lines and polylines move their last point; an arc stays pinned at its start with its end on the pen; ellipses, rectangles and polygons keep the side opposite the pen fixed and stretch toward it, width and height separately (grabbed mid-side, the other axis follows in proportion). A second finger (or Shift) makes it perfect: circle, square, regular polygon, lines and polyline edges at 15° steps. Lifting commits one undo step named after the shape.
- Works for vector strokes (points replaced by the shape) and pixel brushes (dabs redrawn along the shape at the stroke's median pressure). Post-correction is skipped for shapes. On/off: Brush panel > Assist (on by default).
- **Simplified timeline control in Time**: Time should have its own easy timeline control (not only the X-sheet and holds bar).

## Open

- Pressure curve per device (global) vs per brush only?
- Vector pen: keep raw points vs fit Béziers on commit (VectorCraft-style least squares)?
- Does Safari latency need a native iPad fallback? Measure on device.
