# Architecture

Canvas view (2026-10-30): `core/canvasview.ts` validates the device-only `2dope.canvas.view`
preference (Overscan, safe areas, centre cross, frame overview), safe-frame geometry (90%/80%)
and overview neighbours. `App.render` clips Draw/Animate art to the page unless Overscan is on;
with Overscan it lays paper under the pasteboard, then `drawCanvasView` dims outside the page and
draws the guides on the screen canvas only. `renderPainting` holds the former painting body.
Drawing planes stay page-sized; vector records already allowed off-page points, and Overscan only
stops styled vectors wholly outside the page from being dropped. `ui/canvasview.ts` owns the View
popover and overview strip. `tests/canvasview.html` exercises the real App/UI, export and storage.

Mode-context UI (2026-10-30): `core/workspacelayout.ts` validates bounded per-mode tool
order/pinning, top/side docking, brush edge, labels and optional paint targets. App reads
`2dope.workspace.layouts` and applies validated preferences outside document History.
`StudentSetup.workspaces` adds the same snapshots to existing version-1 device profiles;
older snapshots receive defaults. `ui/workspacesettings.ts` edits detached drafts with
dragging and keyboard/tap Move buttons through App settings. Failed workspace writes keep
the draft open and restore previous profile storage before changing live preferences.
`Bubbles` uses ordered tool ids and a separate More drawer, retaining an active unpinned
tool until switching away. Painting toolbars scroll horizontally when needed, keeping More
at the edge; side docks scroll vertically. `PaintingWorkspaceUI` keeps tray recovery and
workspace entry in the footer. Selection/transform/adjustment/point-edit controls override
ordinary settings folding; canvas fit accounts for docked side controls. Source and timeline
commands are reused. Board writing labels wrap existing caption inputs without field/schema
changes. `workspacelayout.html` exercises real UI/storage/profile/cancel/recovery behavior;
its responsive wrapper covers phone, small phone, tablet and short landscape.

Motion/Draw fixes (2026-10-30): `App.setFps` is an undoable comp edit that rebases playback,
invalidates onion previews and requests a redraw; `MotionPanel` includes FPS/time-format in its
ruler signature. The painting viewport is saved before Motion and restored on return to the same
project/comp; loading another project discards it. Raster grain now uses a power-of-two stamp tile
translated to document coordinates, reset at stroke start, instead of a document-sized scratch
source for every dab. `LayerCards`/`LayersPopover` open a selected artwork source in Draw, show its
own layers (or the standalone drawing’s cel stack), and add paint layers with `App.addPaintLayer`.
Animate retains track lists and placement controls. Regression pages: `workspacefixes.html`, its
responsive wrapper, and `brushperformance.html` (including the original grain routine as reference).

Editable vector brushes (2026-10-30): `core/vectorstyle.ts` owns immutable v1 appearances,
material distance/speed, deterministic dabs, portable alpha tips, clip/control validation and
full-mark affine transforms. `brush/vector.ts` dispatches to the unchanged legacy algorithm or
`brush/vectorstyled.ts` (union ink/chisel and bounded material coverage). All existing consumers
retain the shared entry point. New recipes live in the existing Brush Studio/library’s Vector
collection. `ui/vectorrestyle.ts` displays a detached preview; App validates its document context
and commits one History step. Authored controls are persisted in records and cached App maps are
cleared on undo/redo/load. `core/vectorcut.ts` intersects sparse segments with the eraser capsule,
interpolates supported channels and uses conservative styled envelopes, with clip-aware hit
checks. Persistent clips constrain the complete visible mark; centreline clipping remains the
legacy path. Project schema 4 is required only when the new fields are captured. See
`docs/research/clip-studio-paint/VECTOR-BRUSH-MILESTONE-2026-10-30.md` for validation and limits.

Current code map reviewed 2026-10-14. See `HANDOFF.md` for the checked baseline and open work.

Brush workflow (2026-10-23): `core/brushprefs.ts` validates bounded device-only size/opacity
memory, five unique recent choices and favorites. App records outgoing/current working values
and recalls only size/opacity when a preset/library brush is selected. Explicit Save brush updates
bypass recall. `2dope.brushes.preferences` contains small name/value metadata with no image bytes;
the current full brush still uses its existing key and personal definitions remain in IndexedDB.
`BrushLibrary` adds Recent/Favorites tabs and a pressed Favorite header action using the existing
icons, cards, hold menu, scrolling and Done flow. Rename carries metadata; delete removes it and
selects Pencil if needed. Project History, saved pixels, student profiles and artwork formats
are untouched. `tests/brushprefs.html` exercises sliders, library, management and fresh-App reads;
its responsive wrapper covers phone/tablet/short landscape on isolated test origins.

Raster brush feel (2026-10-23): `brush/dabs.ts` supplies a smooth finite-slope taper with a
brush-diameter run-up for wide tips, subpixel ends and a final stamp at the recorded endpoint.
Zero-length finished taps retain their mark. `RasterEngine.commit` rebuilds start/end tapers
and resets the per-dab colour index before replay. Vector outline algorithms are unchanged,
so existing saved vector records retain their rendering. Raster edits remain stored pixels.
Grain is paper-aligned but applied per stamp into the normal/shading coverage buffers; pressure
and overlap can fill paper valleys, then stroke opacity composites once. One cached pattern per
stroke and the existing scratch plane keep work inside clipped stamp bounds without extra
document-sized buffers or per-stamp pixel reads. Predicted textured stamps stay preview-only.
Image-tip brightness is decoded before letterboxing, full-roundness image tips honor rotation,
and conservative rotated bounds cover commit/Undo. Colour sprites use mask identity keys rather
than image-string suffixes. `Textured Paint` is a Painting preset using the existing settings.
`tests/brushfeel.html` shows seeded samples and checks pixels plus real App pen input/History.

Student profiles (2026-10-23): `core/studentprefs.ts` owns tool/control catalogs and bounded,
validated device setup/profile snapshots (20 unique profiles, 40-character names). Settings drafts
profile creation/selection/rename/deletion and visibility, interface level, QuickMenu, range gesture,
Ink & Paint, QuickShape and finger input together; only Apply writes profiles and calls existing
App preference setters. Failed profile writes retain the draft without changing live settings.
No-op setters are avoided so QuickMenu-only edits do not refit the canvas. App holds `studentUI`
and the shared interface level; Bubbles synchronizes its level through an App callback. Bubbles
filters painting tools/options and keeps hidden active tools available, including Focus; main.ts
filters the Full toolbar through the same visibility state. Brush is always enabled and editor
completion controls stay available. Settings refuses active drawing/transform/adjustment edits.
`2dope.student.ui`, `2dope.student.profiles` and `2dope.student.fingerPaint` are localStorage
preferences, outside the project model/History; existing QuickMenu/gesture/QuickShape/Ink & Paint
keys remain their runtime preference sources. Profiles capture snapshots of those preferences,
not tool permissions, artwork, brushes, colours, device memory mode or account identity.

Playback range (2026-10-23): `core/playback.ts` resolves optional `Comp.playbackRange` into the
current comp length and wraps the shared App playback clock/look-ahead. Stored zero-based
`[start,end)` edges survive duration shortening; preview clamps without mutating them. App's
range command resolves its target by comp id for Undo/Redo, pauses playback and notifies autosave.
`ui/playbackrange.ts` supplies one native dialog/control implementation for FlipMode, Strip and
Motion, with inclusive frame numbers, current-frame setters, validation, cancellation and whole
animation recovery. Flipbook/Clips ruler bands are view-only. The audio queue includes both edges
in its identity and mixes through the same nonzero loop origin. Normal export and nested-comp
timing do not use preview ranges. `io/schema.ts` validates/copies the additive optional comp field
without a schema bump; normal project and artwork captures preserve it.

Range gesture: `ui/playbackrangegesture.ts` observes ruler pointer input in FlipMode/Strip and
takes over stationary holds after the existing 450ms threshold. Before activation, native scrub
and pinch handlers retain input; after activation the native scrub state is cleared, a separate
dashed band/status previews the bounds, and pointer-up calls the same `App.setPlaybackRange` once.
The preview never mutates the comp. Blur/hidden/Escape/cancel/lost capture, multiple pointers,
resize, disabled settings and stale project/comp/layer/view/length/zoom invalidate it. Native
pinch bookkeeping remains active. `App.rangeGestureEnabled` strictly reads a boolean from
`2dope.playback.rangeGesture`; App settings → Gestures drafts this device preference alongside
QuickMenu, outside document History. Ruler-only touch-action preserves drawing and row gestures.

Ink & Paint (2026-10-23): `fill/autopaint.ts` computes the difference between border-connected
empty pixels before/after committed ink, using bounded scanline floods and no gap closing.
It grows only two pixels beneath actual ink, never across transparent pixels. `App.inkAlpha`
reconstructs pre-stroke raster pixels from the existing commit patch and old vector list after
pen-up, avoiding a page scan at stroke start. `automaticPaint` excludes existing Fill alpha,
out-of-selection and fully masked pixels. `recordInk` groups the saved fill patch with the ink
command before notifying History/autosave; redo replays exact pixels rather than detection.
QuickShape replacement uses the same path. Required layer masks use the existing deferred pixel
input queue; cancelled/blurred strokes keep the existing ink policy with automatic paint suppressed.
`2dope.inkpaint` holds optional device preferences; Bubbles exposes the mode and ink/paint colours,
and QuickMenu can toggle it. Line/Fill, project schema and residency/history paths stay shared.
Work caps are 921,600 pixels Lite and 4,194,304 Full; unsupported pages retain ink with a notice.

QuickMenu (2026-10-23): `core/quickmenu.ts` owns the six-action preference defaults/catalog and
validation. `ui/quickmenu.ts` overlays the ring on Draw/Animate, routes actions to existing App/UI
commands, scopes open actions to the current project/comp/layer/frame and closes on navigation,
stroke input, blur or viewport changes. A backdrop consumes outside taps; Q/Escape/arrows/Tab keep
keyboard recovery. Its edge button finds space around visible painting controls without refitting
the canvas. Playback keeps Pause accessible and disables editing/navigation actions. `ui/settings.ts`
provides Menu → App settings with a QuickMenu draft, six action selectors, edge/visibility controls,
Apply/Cancel and Restore defaults. `main.ts` wires the existing Colour/Brushes/Layers/My Assets
panels and dismisses old popovers before opening. `2dope.quickmenu` localStorage is device-only,
outside document History and .2dope schema. Q still works when the edge button is hidden; empty
slots focus Customize for recovery. `ui/quick.ts` remains the separate older Quick Animate view.

My Assets (2026-10-23): `io/artwork.ts` captures only a source's reachable graph as a complete
normal `.2dope` archive, validating references and refusing missing bytes. `io/artworkstore.ts`
keeps atomic card/package snapshots in a separate `2dope-artwork` IndexedDB database, beyond
project asset GC. `view/artworkpreview.ts` decodes only first-frame drawings for a stored preview.
`ArtworkAssets.addPackage` imports compatible-size graphs with fresh references and parked image
bytes through one existing project History command; `core/assetcopy.ts` remaps nested references.
Sounds receive independent pool IDs. `ui/artworklibrary.ts` owns My Assets, download/import and
native-size Open as project. `main.ts` routes project opening through FileUI so current work is
flushed and the incoming project enters normal autosave. Asset-marked main comps are standalone
projects, with Save current artwork, rather than pending source sessions. Saving snapshots is
separate from document History. Add copy never rescales or crops incompatible drawing pages.
Library management: name search filters metadata in `ui/artworklibrary.ts`; Manage folds Rename
and Remove away from reuse actions. `ArtworkStore.rename` changes only the card, while
`io/artwork.ts:libraryArtwork` applies that name to future copies, opened projects and exported
archives. Atomic `ArtworkStore.remove` returns the full deleted snapshot for one session-only
removal Undo, independent of document History. The removal survives shelf closure, while failed
restores retain its retry data. No library schema/dependency change.

Flipbook source review (2026-10-23): `FlipMode` keeps Play outside its scrolling actions and uses
44px button targets. CSS caps the track list at one row on short screens; active-track changes
reveal that row without changing the comp clock, including after resize. Short landscape keeps
the compact Brush recovery button beside the Tools/Options recovery column. Row ResizeObserver publishes the measured
`--flip-h` and refits only an already fitted canvas. Deferred build measurements ignore hidden
rows. Duration handles expose actual frame values and own their arrow/Shift/Home/Enter/Escape
keys. Keyboard edits preview then commit through existing exposure History, like pointer trims;
both cap new holds at one million frames (existing longer holds can still be shortened).
`tests/flipbooksource.html` exercises actual painting, holds/Undo, source playback/return,
multi-track scrolling and source-rate animation through the linked shot compositor.

Integrated painting loop (2026-10-23): `ArtworkAssets` keeps a WeakMap keyed by Project of
per-source layer/frame positions. Done and direct source switches remember the outgoing position;
open validates its layer and reuses the existing bounded comp clock. Missing layers fall back to
the first drawing layer/frame zero. This session state adds no document History/schema fields.
`App.shapeEditable` requires the current editing drawing and plane, including the mask drawing
and Line when editing a mask; stale `swapShape` calls are rejected by that existing guard.
`tests/paintingworkflow.html` combines actual Assets, Layers, Colour, Brushes, Sidebar, Bubbles,
Strip/Tracks and canvas to check painting, Undo, QuickShape ownership and linked source returns.

Brush controls (2026-10-23): `Sidebar` adds visible Size/Opacity labels, pixel/percent values,
numeric ARIA values with range/orientation/value text, and wider slider/button targets. Size uses
the existing squared mapping over 1–500px (matching canvas size shortcuts); opacity spans 0–100%.
Pointer input focuses the slider. Its own keys adjust actual units, Shift steps ten, Home/End
reach limits and Enter/Escape focus the canvas. Cancel/lost capture/blur/hidden stop active drags,
retaining the latest value. Resize observation measures usable stage height below tools and above
the docked flipbook, selecting the compact row when needed. Changes still call `brushChanged`;
tool/plane, document History, model/schema and stroke algorithms are unchanged.
`tests/brushcontrols.html` checks actual controls/App/Bubbles, focus, gestures and painted pixels.

Brush return (2026-10-23): `BrushLibrary` keeps brush/tool/plane status and 44px Done in a fixed
header, separate from actions and scrolling collections/cards. Done, Escape and opener-toggle
close focus the canvas; outside close and Studio retain their destination. Escape yields to nested
dialogs/context menus. Rebuilt openers resolve by accessible label in their original parent.
Rendering restores card/category focus and scroll, while closing resets double-tap state and
cancels collection drag/capture/ghosts. Hidden cards ignore late clicks. Brush selection still uses
`App.setBrush` and preserves tool/plane; storage, painting algorithms and document History are
unchanged. `tests/brushreturn.html` exercises the actual library/App/toolbars and pen-style pixels.

Colour return (2026-10-23): `ColorPanel` keeps a fixed title/44px Done row outside `.cp-body`'s
scroll area. Explicit Done, toolbar-toggle close and Escape return focus to the canvas without
changing the chosen colour/tool/plane. Closing clears disc drag state. Escape is captured before
the hex field stops propagation, but yields to native modal dialogs/context menus. When Bubbles
rebuilds the opener, the panel resolves its current sibling by accessible label within the original
parent for outside-tap checks and placement. Existing colour preferences/Recent remain in use;
document History, persistence formats and painting algorithms are unchanged.

Painting-plane review (2026-10-23): `App.setPlane` preserves Brush/Eraser/Smudge instead of
mapping Line to Vector and Fill to the bucket. Selecting the incompatible plane from Vector or
the bucket uses Brush. `setTool` explicitly aligns Vector with Line and the bucket with Fill.
No document/schema changes. `LayerCards` supplies larger Line/Fill/opacity targets and Close;
card rebuilds restore the list scroll and the focused input/select within its original options
group. `tests/paintingplanes.html` uses the actual App, Bubbles, LayerCards, resident pixels and
compositor to check background/paint layers, separate planes, tool routing, opacity/visibility,
focus/scroll and Undo. Physical touch/Pencil behavior remains a separate check.

Source identity (2026-10-23): `ArtworkAssetsUI` shows source name and unplaced/linked-use status in
a two-line header group. Counts reuse `CompEditor.instances` across all project comps; rename and
History callbacks refresh the label. Below 700px, the workspace selector and redundant Source
prefix step aside while editing, preserving the name, status, Assets and Done in one row. Full
names and project-wide edit behavior remain in the group description/tooltips. Session navigation,
document data, History commands and persistence stay unchanged. The workflow browser fixture
checks geometry, zero/one/multiple uses across shots, long names, rename Undo/Redo and return.

Compact source access (2026-10-23): `ArtworkAssetsUI` keeps its existing Edit source button in
the fixed picker/Options/Done row rather than the scrolling details. Phone CSS keeps a labeled
44px Edit target; Replace/Copies/Names occupy three columns in the remaining details. The source
navigation/history implementation is unchanged. Layout/workflow browser fixtures check direct
access with Options closed, selection disabling, touch-target geometry and the source-return loop.

Input/focus update (2026-10-22): `App.onKey` leaves native field keys, button activation and
already-handled events to their controls; ignored key releases clear held navigation state.
The canvas is Tab-reachable and pointer input focuses it without scrolling. `ArtworkAssetsUI`
returns focus to the canvas after source entry/Done and to the picker after placement. These are
view/input changes with no History/schema changes. `tests/artworkworkflow.html` exercises the
real App/UI creation, pen-style painting, Undo/Redo, placement, touch cancellation and return loop.

Rendering update (2026-10-22): Draw's active cel uses `view/composite.ts` through `drawEditingLayer`, with preview-only raster/vector/ghost sources from `App.render`. Plane and layer opacity/blend/masks share the playback/export compositor; the active layer's effects stay off during painting. The red mask-edit tint and other editing guides remain outside the artwork. `tests/rendering.html` runs real-browser pixel regressions independently of the Node test suite.

Workspace navigation (2026-10-26): Draw and Animate no longer have their own workspace select or
Draw/Animate shortcut; the shared `Bubbles` mode row switches every workspace and stays visible in
painting workspaces at every level. `.painting-header` only carries the artwork asset buttons;
`Bubbles.placePaintingRows` puts it after the mode row (or under it when narrow) via `--ph-top` /
`--ph-left`, and drops the tool row (`--pt-top`) only when it would collide. Which options row
shows is the pure `optionsRow` / `toolChoice` in `core/workspace.ts` (unit tested), so drawing
tool states never leak into Story, Timing or Motion. `App.setWorkspace` applies an open transform,
adjustment or point edit before switching.

Workspace/assets update (2026-10-22): `core/workspace.ts` and `ui/paintingworkspace.ts` manage Draw/Animate layouts and local view preferences. `core/assets.ts` manages project-local artwork sources (normal comps with optional `asset: true`) and linked comp-layer placements; `ui/artworkassets.ts` adds New asset, the shelf and Done. Source creation and placement mutations use `CompEditor` history; source navigation/return is session state. Existing project capture/residency/compositing preserve all source layers/frames. `tests/assets.html` checks standalone PNG/ZIP reload and source updates with real browser pixels. Clips still uses the existing exposure timeline.

Asset arrangement update: `App.setArrangeAssets` scopes an explicit Animate tool to the current
project/comp. It renders the full comp with Residency and simplified selection handles, routes
pointer gestures to `CompEditor.gestureStart` with an asset-only filter, permits initially locked
instances without changing their lock, and disables new auto-keys for static transforms. Existing
animated properties retain their key behavior. `ui/artworkassets.ts` owns the contextual placement
picker/Edit source/Copies/Done controls; `ui/bubbles.ts` exposes Move assets alongside drawing
tools. New placements select their instance. Mode/selection is session state, transforms are normal
comp-layer data. Draw asset sources omit the outer-shot context. `tests/placement.html` exercises
the real App input/cancel/navigation path without library storage.

## Runtime and entry point

Asset timing update: `core/assettiming.ts` maps inclusive user frame numbers to existing
comp-layer `start/in/out/play` fields; `CompEditor.setAssetTiming` applies one history command
without ripple. `ui/artworkassets.ts` offers collapsible Clips timing controls and edge jumps.
`ui/rails.ts` keeps asset tracks visible/selectable with finite or shot-following intervals;
`ui/strip.ts` uses the shared comp length/clock in Animate even beyond the active drawing track.
Off-frame placements remain selected for timing, while canvas handles require visible content.
`tests/assettiming.html` exercises real controls, pixel boundaries and validated capture/reload.
No new persistence fields or dependencies are needed.

Direct clip gestures: `core/assettiming.ts` also computes snapped movement and edge trims from
the original interval. `CompEditor.assetClipStart/Move/End` owns live previews, busy state and
one history command; `gestureEnd(true)` cancels these during existing navigation/project exits.
`ui/assetclipdrag.ts` delegates input to the stable Strip scroll container so rebuilding rails
cannot lose the captured gesture. Pointer cancellation, second pointers, Escape, lost capture,
blur and hidden pages restore the snapshot. Moving or trimming a following clip materializes
its visible interval; Follow shot end restores automatic ending. The start grip trims `in`
without shifting the source origin, unlike whole-clip movement. Source pixels/keys and sibling
tracks are untouched. Asset labels sit above bars; selected grips use 44px targets. The Strip's
Animate playhead/scroll uses unbounded layer time rather than the held drawing frame.
`tests/assetclips.html` covers these paths and validated capture without opening library storage.

Clip artwork previews: `view/assetpreview.ts` fingerprints a source's reachable comp settings and
frame-one drawing revisions, pins only that frame through Residency, and renders a 192×108 PNG
through the shared compositor (without the export stamp). `ui/assetclippreviews.ts` observes visible
clip slots in the stable Strip scroll container, serializes preview jobs and keeps a 32-entry LRU
per Project identity. Cache hits update existing elements; misses wait while drawing/dragging or
playing. Cancellation/error paths unpin acquired drawings; stale projects/settings are discarded.
Completed DOM slots do not rerender merely because their LRU entry was evicted. Visibility changes
resume observation. CSS repeats the small PNG across a bar; it represents the shared source's
first frame, independent of placement timing/transforms or animated-frame sampling.
`core/assetlabels.ts` supplies per-source placement numbers, names and linked counts to the rails,
picker and shelf. The toolbar and Draw header identify shared source editing. Editor selection
changes refresh asset rails, including placement-picker selection. No document/schema changes.

Asset names: `ArtworkAssets.renamePlacement` and `renameSource` in `core/assets.ts` push focused
metadata commands by project/comp/layer id. Undo resolves live objects after comp snapshots have
been replaced; it does not touch source links, pixels, timing, transforms or other placement names.
Blank/unchanged names and busy/playback edits are rejected. `ui/artworkassets.ts` offers a compact
Names picker and a source-card Rename action, reuses native dialogs with scope descriptions,
guards asynchronous replies by project and active comp, and reopens the shelf after card renames.
`ui/dialogs.ts` accepts an optional text-dialog description; existing callers retain their behavior.
`tests/assetnames.html` exercises real App/dialog/history/validated archive and stale-project paths.

Independent artwork: `ArtworkAssets.makeIndependent` prepares a reachable source graph through
`core/assetcopy.ts`, including all exposure drawings, masks and nested comps. It snapshots stored
immutable PNG references without decoding; dirty resident planes encode serially under Residency
pins. Project/source metadata and drawing revisions are checked before allocation. File comp,
drawing and vector limits are checked before and after asynchronous work. `Project.cloneStoredDrawing`
creates fresh parked drawing ids, deep vectors and separate eventual canvases. Comp/layer/cel/audio
ids, parents, pins, overrides and audio panel links remap within the copied graph. Immutable audio
assets remain shared. Source names gain a unique copy suffix, within the existing 80-character cap.
The selected placement changes only its comp link and remapped pinned overrides. `editProject`
provides one metadata Undo/Redo; pool drawings remain to serve Redo and referencedKeys protects
their stored assets. This extends existing comp snapshots rather than Motion's shallow makeUnique.
The Copies picker retains linked Duplicate placement and adds Make independent; no schema or
dependency change. `tests/assetindependent.html` exercises real App, dialogs, pixels and ZIP reload.

Source replacement: `ArtworkAssets.canReplaceSource` rejects missing/nonasset/current sources,
cycles and nested graphs that reach the target comp. `replaceSource` changes one comp link,
clears old pinned overrides and materializes finite automatic one-shot endings with existing out
timing. Looping shot-followers keep null out. One metadata History command resolves the live
placement by id on Undo/Redo and notifies document changes. No pixels, sources or new fields are
created. `ui/artworkassets.ts` reuses its sequential-preview shelf in a replacement mode, with
disabled Current source, Use source buttons/preview actions and guarded project/comp/selection/
old-source identity. Cancel/stale replies add no history; valid return restores Replace focus.
The desktop action group stays together and becomes five labeled icon columns on phones.
`tests/assetreplace.html` checks the real App, compositor, shelf, queued Undo/Redo and ZIP reload.

Painting space: `ArtworkAssetsUI` starts with a persistent picker/Options/Done row. Source actions,
identity, history and optional Timing live in a bounded scrolling details element. Folding is
session view state; options/timing use `preserveCanvasView`, and Reset layout calls `resetLayout`.
`TracksSheet` observes its column and stage: painting full/half reserve about 45%/60% canvas
(280px/300px floors when space permits), accounting for actual transport/audio rows and a 60px
minimum track area. Hidden editors are skipped; repeated identical sizes do not trigger layout
loops. Timing keeps its review budget. User sheet changes/drags preserve the canvas before refit
callbacks. `App.fit` explicitly clears the painting header and compact placement row; expanded
options remain temporary overlays. No document/schema changes. `tests/paintinglayout.html` uses
real App, sheet, painting/asset controls and app CSS to check view, frame, history and geometry.

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
| `core/selxform.ts` | Selection transform maths and pixels (affine about the selection centre, bilinear lift-and-place, whole vector strokes inside); the session lives in `App` (`beginTransform` / `applyTransform`). |
| `core/cellink.ts` | Linked art layers: layers sharing a `cel` group keep identical cels; `syncExposures` maps a timing edit onto each member (used by `App.editTimeline`). |
| `core/vecedit.ts` | Vector point editing maths: anchors (RDP), falloff / straight / curved moves, Bezier spans, snapping and joining, per-point and per-section width. The session (`App.ve`) and its anchor cache live in `App`. |
| `ui/bubbles.ts` | Simple-screen navigation: mode bubbles, tool bubbles, the one-row context bar, the clean / simple / full level button (body classes `ui-clean` / `ui-simple` / `ui-full`). |
| `ui/flipmode.ts`, `ui/layercards.ts`, `ui/sheet.ts` | Flip beginner mode (drawing bubbles row), Procreate-style layer cards for Draw (in Move assets they list the chosen placement's source layers; a tap opens it through `App.editAssetSource`), the tracks sheet handle bar (Draw / Time). |
| `ui/commands.ts`, `core/commandprefs.ts`, `ui/customize.ts` | Command registry for the options rows (stable ids, contexts, order, `face` for state labels) and named context-menu entries (`MENU_ENTRIES`); the device-local hidden set (`2dope.commands.hidden`, never in projects or student profiles); the shared Customize tick list. `showContextMenu` drops hidden `id` entries via `visibleItems`. |
| `io/gif.ts`, `io/exportgif.ts`, `ui/exporthub.ts` | Bounded looping GIF writer (fixed palette, optional 1-bit transparency) and the Export and finish hub. |

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

`.2dope` is a self-contained ZIP of schema-3/4 `project.json`, PNG drawing assets and PCM WAV sound assets. Schemas 1–3 migrate to the current in-memory file version without refitting geometry; plain earlier outlines still capture as schema 3, while versioned vector appearances/controls/clips require schema 4. Older builds refuse newer schemas rather than silently losing audio or vector appearance. Library captures can reference stored assets; archive captures must collect the bytes. File schema and database version are separate concepts. See `docs/project-format.md`.

## Output and deployment

- PNG output uses drawings directly for a plain flipbook or the shared Canvas 2D compositor for a composed shot. Sequences provide Combined/Lines/Fills/Matte passes and a manifest.
- Quick Share video encodes every main-shot frame with the same compositor and residency pins at explicit timestamps, and mixes the shot's audio clips (AAC in MP4, Opus in WebM). It is opaque; controls/cancel keep the project modal. Output bytes are capped (32 MiB Lite, 64 MiB Full), with a conservative preflight estimate. The video library is loaded only when this export is opened.
- Storyboard export produces PDF or panel PNGs/captions CSV. PDF uses built-in WinAnsi text, with limited Unicode support.
- Blender packages include images, `scene.json` and the importer. See `docs/blender.md` for supported mappings and simplifications.
- Vite uses relative asset paths for static hosting. `.github/workflows/pages.yml` installs with Node 22, tests, builds and deploys `dist/` on `main` pushes/manual dispatch.
- Colocated Vitest tests run in Node, with stubs for browser-dependent pieces. They are not a full browser, Safari, or Blender integration suite.
