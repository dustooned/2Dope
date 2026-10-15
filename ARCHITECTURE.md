# Architecture

Current code map reviewed 2026-10-14. See `HANDOFF.md` for the checked baseline and open work.

## Runtime and entry point

Client-only TypeScript and Vite, native DOM controls and Canvas 2D. No UI framework or backend. Video export lazily loads the pinned `mediabunny` dependency for browser encoding/muxing. Compositing currently uses Canvas 2D; WebGL and sparse tiles are not the current implementation.

`index.html` supplies the initial UI and startup watchdog. `src/main.ts` creates `App`, connects panels/callbacks, opens storage, and starts `FileUI`. `src/style.css` supplies workspace, Quick Animate, phone, and Lite layouts.

## Source map

| Area | Responsibility |
|---|---|
| `app.ts` | Shared playhead/workspaces, pointer/touch/keyboard input, drawing/fill commands, timing edits, playback, render orchestration. |
| `compedit.ts` | Layer/property/key editing, transform gestures, parenting, precomps, pins, layer timing; history commands. |
| `core/project.ts` | Project/drawing pool, active comp/layer, Line/Fill canvases and vector strokes. |
| `core/timeline.ts`, `core/ripple.ts`, `core/timecode.ts` | Exposures/captions, timing across layers, shared ruler/readout formatting. |
| `core/comp.ts`, `core/anim.ts` | Comps, layer types, transforms, cameras, content time, keyed values and easing. |
| `core/history.ts` | Commands and undo/redo; commands can declare drawings whose pixels they require. |
| `core/residency.ts`, `core/device.ts` | Park/reload drawing pixels, asset references, memory budgets and Lite limits. |
| `core/brush.ts`, `core/stroke.ts`, `core/rng.ts` | Brush settings/presets, stroke records, deterministic jitter. |
| `core/quickshape.ts`, `core/vectorcut.ts`, `core/color.ts`, `core/newproject.ts` | Shape fitting, vector erasing, color conversion, project dimensions/settings. |
| `brush/` | Input smoothing, dab generation, raster buffers and vector outlines. |
| `fill/fill.ts` | Barriers, gap closing, flood/lasso/leftover fill algorithms. |
| `view/` | Viewport coordinates, compositor, onion skins, overlays, pixel operations and content bounds. |
| `ui/strip.ts`, `ui/xsheet.ts`, `ui/board.ts`, `ui/motion.ts` | Workspace views of shared document and commands. |
| `ui/boardtimeline.ts` | Board Timeline/Split views: panels as blocks on the comp clock (edge drag = `setPanelDuration`, body drag = `moveSelectionTo`), audio clips lined up underneath (drag = clip start or linked offset, one undo step), pinch/Ctrl+wheel zoom. |
| `core/brushlib.ts`, `ui/brushlib.ts` | Brush library: categories for the built-in presets, My brushes (per device, validated on read), preview strokes, Studio = the Brush panel. Opens by tapping the active Brush/Vector/Eraser tool. |
| `ui/rails.ts` | Draw/Time timeline rails: every layer as a row in stacking order on the strip's clock and zoom; the active layer is the strip's own editable blocks (positioned by `--active-top`); LINE/FILL sublayers and groups fold open (`RailState`, per device). Folding never changes visibility or playback. |
| `core/audio.ts`, `audio.ts`, `io/sound.ts`, `io/soundmix.ts`, `ui/audiotracks.ts` | Timeline audio: clips on comps (fixed or linked to a board panel), shared playback on the app clock, WAV assets in the asset store, mixing for video export, the foldable Audio lane. |
| `core/waveform.ts`, `ui/waveform.ts` | Cached multiresolution audio extrema and one trim/gain/stereo-aware waveform renderer shared by the Audio lane and Board timeline. Waveform drawing is static; only the CSS playhead moves during playback. |
| Other `ui/` modules | Gallery/files, project/export dialogs, brush/color/layer panels, Quick Animate, menus, splitter, icons, manual. |
| `io/schema.ts`, `io/projectio.ts`, `io/persist.ts`, `io/autosave.ts` | File validation/migration, captures, library storage, save queue and versions. |
| Other `io/` modules | PNG sequence plans/rendering, ZIP/PDF, storyboard/CSV export, Blender manifest/packages. |
| `io/videoplan.ts`, `io/exportvideo.ts`, `ui/videoexport.ts` | Main-shot video sizing/timing/budgets, offline MP4/WebM encoding, capability checks, modal preview/download. |
| `blender/2dope_import.py` | Blender importer, bundled as raw source by `io/blenderpack.ts`. |

## Document and clocks

- `Project` owns drawings, comps, the main shot and project-bin folders. A comp owns a top-first layer stack: drawings, nested comp, camera, null.
- A drawings layer references drawing IDs through run-length exposures `{ drawing, length, ...captions }`. Reusing an exposure can reuse a drawing; copying a drawing is a separate operation.
- Each drawing has raster Line, lazy raster Fill, vector records, and a revision counter for caches. Display order: Fill, Line, vectors.
- `project.exposures` and `project.fps` address the active layer/comp, not a separate strip/X-sheet document.
- Keys/exposures use layer time. Start/in/out use the containing comp's clock. `contentFrameAt` and related `core/comp.ts` functions handle play modes, speed, time remap and nested frame rates.
- Board panels are guide-layer exposures; captions are exposure metadata. Final renders skip guides unless `guideExport` is enabled.
- Timing changes use `app.ts`/`CompEditor` and `core/ripple.ts`. They can affect other layers and the board; preserve shared behavior for trim, insert, delete and exposure edits.

## Stroke and history flow

Coalesced pointer events -> `toPoint` (document-space pressure/tilt/time) -> `Smoother` -> `StrokeRecord.points` -> `DabWalker` -> `RasterEngine.addDabs` buffers -> completed pixels and before/after rectangles -> `History`.

QuickShape and post-correction can change the final point path before commit. Predicted events produce only a one-frame preview. Jitter uses seeded `hash01`; raster stroke opacity is distinct from dab flow. Keep dab/smoothing/timing algorithms independent of UI where possible for Node tests; some project/residency code necessarily handles canvas objects.

**Persistence distinction:** vector pen strokes stay as records in `Drawing.vectors`; raster edits use pixel undo and are saved as PNG planes. The original M0 direction "pixels are a cache" does not mean raster projects retain a permanent stroke journal after reopening.

Undoable document edits use commands and must update revisions/rendering, panel notifications, and `onDocChanged` for autosave. Drags preview live, then commit one undo step; cancellation restores their starting state.

## Storage and memory

`openStore()` opens IndexedDB `2dope`, database version 2. If unavailable, it returns an in-memory store and the UI warns about persistence. Stores cover projects, heads, versions, asset references, assets, folders and metadata.

`captureProject()` snapshots synchronously and finishes PNG encoding asynchronously. Autosave serializes writes; one save puts assets, card, head and references in one transaction. Content-addressed PNGs are shared across projects and versions. Garbage collection preserves references needed by live/undoable drawings.

Residency parks offscreen planes as PNG bytes or stored asset keys, shrinking canvases to 0-by-0. Rendering, export and pixel undo must request the necessary drawings through it. `device.ts` controls memory, page size, undo depth, onions and display resolution.

`.2dope` is a self-contained ZIP of schema-3 `project.json`, PNG drawing assets and PCM WAV sound assets. Schema 1/2 files migrate on open; older builds refuse schema 3 rather than silently losing audio. Library captures can reference stored assets; archive captures must collect the bytes. File schema and database version are separate concepts. See `docs/project-format.md`.

## Output and deployment

- PNG output uses drawings directly for a plain flipbook or the shared Canvas 2D compositor for a composed shot. Sequences provide Combined/Lines/Fills/Matte passes and a manifest.
- Quick Share video encodes every main-shot frame with the same compositor and residency pins at explicit timestamps, and mixes the shot's audio clips (AAC in MP4, Opus in WebM). It is opaque; controls/cancel keep the project modal. Output bytes are capped (32 MiB Lite, 64 MiB Full), with a conservative preflight estimate. The video library is loaded only when this export is opened.
- Storyboard export produces PDF or panel PNGs/captions CSV. PDF uses built-in WinAnsi text, with limited Unicode support.
- Blender packages include images, `scene.json` and the importer. See `docs/blender.md` for supported mappings and simplifications.
- Vite uses relative asset paths for static hosting. `.github/workflows/pages.yml` installs with Node 22, tests, builds and deploys `dist/` on `main` pushes/manual dispatch.
- Colocated Vitest tests run in Node, with stubs for browser-dependent pieces. They are not a full browser, Safari, or Blender integration suite.
