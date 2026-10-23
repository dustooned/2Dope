# Browser rendering checks

## Ink & Paint / Auto Paint

Open `/tests/inkpaint.html` on an isolated origin. Twenty-seven assertions on Full-profile desktop
use the real App, pen-style input sampled along paths, Bubbles/Sidebar/painting controls, History,
FileUI/MemoryStore autosave, PNG decode, ordinary portable project import and the shared compositor.
They check opt-in/colours, open/closed raster and vector outlines, combined Undo/Redo and one edit
notification, exact preservation of old opaque/translucent paint, selections, masks/mask editing,
deferred strokes over a parked mask, Undo/Redo after simulated valid PNG parking, lock/Alpha Lock,
cancelled/predicted input, erasing/smudging/direct Fill, QuickShape replacement, Full HD total
commit cost and Lite's pixel limit. Lite skips the Full HD timing case. Only temporary MemoryStore
projects are used and preference keys are restored; no existing project library is opened.
`/tests/inkpaint-responsive.html?size=phone` uses a real 390×844 iframe; `tablet` uses 1024×768,
and `landscape` uses 768×390. Run separately to avoid overlapping view/colour preferences.
Unit tests compare scanline detection against an independent pixel-flood oracle over randomized
maps and measure Lite/Full page sizes. Scripted desktop events do not verify physical Pencil/Safari
latency or memory. The implementation has no automatic gap closing or other-layer boundary reads.

## QuickMenu and App settings

Open `/tests/quickmenu.html` on an isolated origin. Thirty-four assertions use the actual App,
painting workspace/Flipbook, Bubbles, Sidebar, Colour panel, pen-style pointer input and history.
They cover corrupted preference fallback, reachable ring/edge controls, no canvas-view/history
changes from menus/settings, Q/repeat/Escape/arrows/Tab, draft Cancel/Apply/default reset, six-slot
order and saved device choices, real stroke pixels and Undo/Redo, existing panel callbacks and
popover handoff, full-hold New frame, consumed outside taps, locked layers, tool/plane routing,
live-stroke refusal, playback Pause, Draw/Animate reuse, obsolete menu cancellation and hidden/
empty-slot recovery and the configurable Ink & Paint toggle. It opens no project library/autosave and restores its preference keys.
The wrapper `/tests/quickmenu-responsive.html?size=phone` uses a real 390×844 iframe; `tablet`
uses 1024×768 and `landscape` uses 768×390. Run one at a time to avoid preference overlap.
Check Menu → App settings and preference survival after reloading in the built app separately.
Physical touch/Pencil/Safari are not verified by scripted desktop pointer events.

## My Assets: snapshots, sharing and cross-project copies

Open `/tests/artworklibrary.html` on an isolated origin. Thirty-four assertions use the actual App,
Assets/My Assets dialogs, FileUI and project autosave in a MemoryStore, plus a uniquely named
disposable IndexedDB artwork database. They cover a layered four-frame source, independent
snapshots/readback, vectors/masks, reachable 44px actions, imports to another project, Undo/Redo,
actual frame pixels, Animate placement/return, original-project deletion, complete normal project
capture, different-size native project opening, saving an artwork main, storage errors, shared
file import/rejection and project-change races. Management checks cover metadata-only word search,
no results/clear/focus, cancel/rename with a fresh store connection and portable readback,
44px Manage actions, removal/restore failures, recovery after shelf closure, future-copy naming
without renaming existing artwork and rejection of stale rename dialogs. The fixture restores view preferences and removes
only its own temporary artwork database. No existing project library is opened. Repeat at phone,
tablet and short-landscape sizes. Verify native shelf controls and downloading separately.
The wrapper `/tests/artworklibrary-responsive.html?size=phone` uses a real 390×844 iframe;
`size=tablet` uses 1024×768 and `size=landscape` uses 768×390. Run one at a time, since each
fixture temporarily changes/restores the same origin's view preferences.

## Multi-frame artwork in Flipbook

Open `/tests/flipbooksource.html` on an isolated development origin. Twenty-six assertions use
the actual App, Flipbook, Assets, Sidebar, Bubbles and Strip/Tracks. They paint three source
drawings, change holds with owned keys, Undo/Redo, navigate drawings, scroll controls with Play
still visible, play/loop the source, return to the Animate shot while playing, resume the source,
select a lower track in a five-track source, retain it when the list resizes, and check short-screen fitting and linked animation
pixels at the source frame rate. Repeat at phone, tablet and short-landscape sizes. It opens no
project library/autosave and restores view/brush/colour preferences. Playback waits for real frame
events and tolerates background-tab RAF throttling. Check native keyboard/pointer behavior in
production separately; physical iPad/Pencil/Safari feel remains unverified.

## Integrated background → Assets → Animate workflow

Open `/tests/paintingworkflow.html` on an isolated development origin. Twenty assertions combine
actual Assets, Layers, Brushes, Colour, Sidebar, Bubbles, Strip/Tracks and the canvas. Checks cover
shelf creation, still-background selection, brush/colour/size/opacity/plane choices, real Fill
pixels and Undo/Redo, a held QuickShape and its drawing/plane ownership, shot return, placement,
source layer/frame resumption, linked counts, repainting through the shot compositor and Clips
rails. Repeat at phone, tablet and short-landscape sizes. It opens no project library/autosave;
the brush library reads its ordinary device store, and view/brush/colour preferences are restored.
Separately check native controls in production. Physical Pencil feel, iPad Safari and persistence
of editing positions are not claimed; source positions deliberately last only for the session.

## Brush size and opacity

Open `/tests/brushcontrols.html` on an isolated development origin. Twenty-six assertions use the
real Sidebar/App/Bubbles and canvas: visible labels/units, numeric ARIA ranges, 44px targets,
pointer focus, exact-unit and Shift arrows, Home/End bounds, squared size mapping, fine dragging,
cancel/lost capture, Escape/Enter/Space ownership, Eraser/Line preservation, brush refresh, actual
half/full-opacity Fill strokes, stroke Undo/Redo, fold/recovery and Animate's shared controls.
A forced 300px stage checks compact layout against usable canvas space. Repeat at phone, tablet
and short-landscape sizes. It opens no project library/autosave and restores brush/view preferences.
Use native keyboard/pointer input in production separately; scripted pen input does not establish
physical Pencil feel or iPad Safari behavior.

## Brush selection and return

Open `/tests/brushreturn.html` on an isolated development origin. Twenty-four assertions use the
real App, BrushLibrary, Bubbles and canvas: selected brush/tool/plane status, 44px targets, fixed
Done and viewport bounds, collection/card focus and scroll, a real Fill stroke and one Undo,
reopening without false double-tap, Eraser/Vector/Smudge retention, rebuilt opener toggle,
Escape and nested-dialog/menu ownership, Studio/double-tap, cancelled/lost-capture drag and late
click, outside-focus preservation, long names and Animate's shared flow. The scroll case constrains
the actual list to 120px to exercise a long collection without saving test brushes. Repeat at
phone, tablet and short-landscape sizes. It reads the ordinary brush store but never saves/imports
brushes, opens no project library/autosave, and restores brush/colour/view preferences.
Use native Enter/Space/Escape separately in the production preview. Scripted pen-style input
does not establish physical Pencil feel or iPad Safari behavior.

## Colour selection and return

Open `/tests/colourreturn.html` on an isolated development origin. Sixteen assertions use actual
App/Bubbles/ColorPanel/LayerCards and a pen-style paint stroke: reachable/focused Done, viewport
bounds, fixed Done while scrolling, swatch selection/tool/plane/history preservation, rebuilt
toolbar toggle, Done/canvas focus, selected Fill pixels and one-step Undo, Eraser retention,
Escape from Hex colour, invalid hex, Values/Disc resizing, nested-dialog Escape ownership, disc-drag cleanup, Layers
after Done and the before swatch. Repeat at phone/tablet and short landscape sizes. The fixture
opens no project library/autosave and restores its view/colour preferences. Synthetic input checks
routing; use native Enter/Space/Escape in the production preview to confirm browser activation.

## Background painting and paint planes

Open `/tests/paintingplanes.html` on an isolated development origin. Thirty-six assertions use the
real App, Bubbles, LayerCards, Canvas and compositor: create a still background, brush on Fill and
Line without changing tools, separate painted planes, one-step stroke Undo/Redo, plane/opacity/
visibility touch targets, panel bounds/Close, Line/Fill/layer opacity and visibility pixels,
field-focus/list-scroll retention, blend focus, erasing each plane, X, Smudge, Vector/bucket plane
alignment, adding a linked paint layer, independent painting, and Undo stroke then layer creation.
Repeat in tablet landscape/portrait and phone sizes. No library/autosave is opened; view preferences
are restored. Pixel comparisons use premultiplied colour: one 8-bit level for untouched planes,
up to three for history patch readback under Chromium canvas privacy, with one-level alpha tolerance.
Those checks do not establish physical Pencil feel, Safari, or exact raw RGB at transparent edges.

## Draw → Assets → Animate workflow

Open `/tests/artworkworkflow.html` on an isolated development origin. Thirty assertions exercise
the real App, asset UI and painting layout: named creation, Enter in its dialog, focus/Tab reachability,
pen-style source pixels, one-step Undo/Redo, shot/layer/frame/workspace return, linked locked placement,
picker focus, button/slider/checkbox keyboard ownership, held-key cleanup, already-handled events,
touch movement switching to pinch without document edits, direct Edit source with Options closed,
its touch target, source repainting, Done, pointer focus and
canvas playback shortcuts. Source-header checks cover visible identity/unplaced status, complete
status and Done within a compact row, Fit clearance, one/project-wide multiple linked uses,
80-character names, rename Undo/Redo and restoring workspace controls on exit. Repeat at desktop,
tablet landscape/portrait and phone widths. No library/autosave is opened; local view preferences
are restored.
Synthetic KeyboardEvents test routing, not native button activation: separately press real Enter/Space
in the production app. Scripted pointers do not verify physical Pencil/touch feel or Safari.

From `beta/`, start `npm run dev -- --host 127.0.0.1 --port 5199 --strictPort` and open `http://127.0.0.1:5199/tests/rendering.html` in a browser. Use a separate origin from a user's working library.

The page runs real Canvas 2D pixel assertions from `src/view/composite.browser.ts` and prints a pass/fail total. It creates only in-memory fixtures; it does not open IndexedDB or change project storage. It is independent of the Node-only `npm test` suite and is not included in the main app bundle.

Coverage includes editing/export agreement, zero/partial/full layer and plane opacity, hidden parts/layers, live raster/vector/predicted sources, masks and live mask replacement, blend modes and clipping groups. Repeat in the target browser when changing the compositor. This does not verify physical pen input, gestures, long-project performance or a full app save/reopen workflow.

## Asset archive checks

Open `/tests/assets.html` on the same development server. Eight real-browser assertions encode
painted PNG planes, write/read a standalone ZIP, validate/reload the project, re-export while
drawings are parked, restore them through Residency and compare layered/edited composite pixels.
They include an unplaced source and two linked placements. A one-value RGB tolerance accommodates
canvas privacy noise. This fixture uses no browser library storage. Separately exercise the app's
New asset → paint/add layers → Done → Assets/Place → Edit source → Done loop, undo/redo and reload.

## Asset placement input checks

Open `/tests/placement.html` on an isolated development origin. Thirteen assertions use a real App,
Canvas and dispatched pointer events with in-memory project data: placement auto-selection,
tap versus movement, release outside the canvas, one-step Undo, pen cancellation, switching a
drag to pinch without undoing previous work, Done, content-pivot resize, validated transform
capture/reload, frame stepping, workspace exit and opening another project. No library/autosave
is opened. These scripted events do not establish physical touch/Pencil feel or Safari behavior.

## Asset timing checks

Open `/tests/assettiming.html` on an isolated development origin. Nine assertions use the real
App, asset controls and compositor: field change/Enter/blur commits, off-frame selection,
inclusive Start/End pixel boundaries, one-step Undo, playhead clamping, Escape cancellation
and validated archive capture/reload of timing/source links. No library/autosave is opened.

## Direct asset clip gestures

Open `/tests/assetclips.html` on an isolated development origin. Seventeen assertions exercise
the real App, rail builder and delegated pointer input: rebuilt-bar movement, both trim edges,
one-step Undo, no ripple, tap/no history, cancellation via pointer/Escape/second pointer/lost
capture/blur, subsequent control clicks, Flipbook/workspace/project exits, returning to the origin,
validated capture/reload, and the real Strip playhead/scroll beyond a shorter drawing track.
No library/autosave is opened. Scripted pointer events do not verify physical Pencil/touch feel.

## Asset clip previews

Open `/tests/assetpreviews.html` on an isolated development origin. Fifteen browser assertions
exercise real PNG capture/validated reload, layered compositor pixels/opacity, Residency pin
cleanup on success/cancellation/error, shared-source caching across duplicates and rebuilt nodes,
source-edit invalidation, offscreen/busy deferral, project identity isolation and leaving Clips.
The visibility/cache controller uses an App-shaped view-state rig and real DOM/IntersectionObserver;
it does not open a project library or autosave. Check the actual app separately for source editing,
picker labels, drag/Undo, reload and narrow layouts. Source previews intentionally show frame one.

## Asset names

Open `/tests/assetnames.html` on an isolated development origin. Ten assertions exercise real App
and dialog behavior: separately explained actions, menu/text cancellation, selected-placement
rename and picker refresh, one-step Undo, shared-source identity without rewriting instance names,
validated capture/reload, Draw header, shelf Rename/return, and rejecting a stale project dialog.
The fixture creates in-memory artwork only; it does not open the library or autosave.

## Independent artwork

Open `/tests/assetindependent.html` on an isolated development origin. Fourteen assertions exercise
the real App and Copies dialog, cancel/no history, selected-source ownership, deep vector points,
real PNG Line/Fill decode and independent painting, paint Undo plus source-link Undo/Redo, validated
standalone ZIP reload with distinct red/green sources, independent Fill recoloring, Edit source/Done,
and linked Duplicate placement. No library/autosave is opened. Unit tests cover nested sources,
mask/hold/parent/cel/pin/override/audio-panel remapping, saved/parked snapshots, failure pin cleanup,
file limits, protected Undo assets and stale-project/source/revision cancellation. Check the built
app separately for autosave/reload, actual drawing input and narrow-screen Copies controls.

## Replace artwork source

Open `/tests/assetreplace.html` on an isolated development origin. Thirteen assertions use the
real App, replacement shelf, compositor and standalone PNG/ZIP: preview/scoped copy, current-source
disabled state, cancel/focus/no history, selected replacement and picker identity, preserved
name/interval/transform/clock, real red/green pixel changes, queued App Undo/Redo, Edit source/Done,
validated archive reload retaining both sources, and stale actions after selection/project changes.
No library/autosave is opened. Unit cases cover source-specific overrides, transform keys, parent,
sibling links, finite automatic endings versus looping followers, live-id history after comp
snapshots, and missing/nonasset/cyclic/dangling/busy targets. Check the built app separately for
autosave/reload, phone shelf actions and the compact placement action row.

## Painting canvas space

Open `/tests/paintinglayout.html` on an isolated development origin. Sixteen real-App/app-CSS
assertions cover compact/readable asset selection and Done, explicit Fit clearances, bounded
scrolling details, folding without zoom/frame changes, painting canvas budgets at full Tracks,
half/full/peek view preservation, editor recovery, Reset layout, Draw handle recovery, no document
history changes and Done with details hidden. Edit source stays labeled and reachable in the
compact row, outside scrolling options, with a 44px target and disabled state when no placement is
selected. Geometry allows 0.1px for browser zoom rounding. Repeat at desktop, tablet and phone sizes.
This fixture uses no project library/autosave; it saves and restores only the local view-preference
keys it exercises. Existing naming/copy/replacement/timing fixtures now open Options before
accessing the tucked controls. Check the built app for real rail content, scrolling timing fields
with picker/Done fixed, and layout handles at the edges. Physical touch/Pencil/Safari remain separate.
## Raster taper and textured paint

Open `/tests/brushfeel.html` on an isolated development origin. Its 23 browser checks cover
pressure-dependent texture, pigment building within/across strokes, opacity ceilings, exact
live/commit pixels, seeded replay after post-correction, preview-only prediction, fine broad-brush
tips (including tilted shading), taps/short flicks, image-tip brightness and rotation, rotated Undo bounds, textured erasing,
real App pen-style Fill input and exact Undo/Redo, plus a bounded desktop 720p performance check.
The page displays four seeded swatches for visual review. It uses no project library/autosave and
restores the device preferences it exercises. Seven `brush/dabs.test.ts` unit cases check taper
geometry, untapered marks, endpoint placement, pressure/interpolation and rotated bounds.
Desktop synthetic input does not establish physical Pencil feel or iPad Safari performance.

## Student profiles

Student profiles: `studentprofiles.html` uses real App/Bubbles/QuickMenu settings and portable
capture. `studentprofiles-responsive.html?size=phone|tablet|landscape` checks actual 390×844,
1024×768 and 768×390 iframe viewports. It covers staged create/rename/delete, Apply/Cancel,
profile switching and updates, visibility and active-tool recovery (including Focus/Animate),
behavior options, device persistence, fixed settings actions, invalid names, storage failure,
show-all recovery and unchanged document History/content. `core/studentprefs.test.ts` covers
validation, defaults, bounded profile counts, name/id handling and independent snapshots. These
fixtures isolate their preference keys; native built-app checks cover reload and the Full interface.

## Playback range

`playbackrange.html` runs the real App, Flipbook, Strip/Tracks, Motion and in-memory FileUI.
`playbackrange-responsive.html?size=phone|tablet|landscape` runs one isolated real iframe viewport
at 390×844, 1024×768 or 768×390. It covers inclusive bounds, field validation, focus/cancel,
unchanged edits, one document notification, Undo/Redo, seeks/clock/fps, single-frame loops,
shortened duration recovery, ruler placement, separate source/shot intervals, replaced comp
objects, autosave/portable import, stale drafts and whole-animation recovery. A deterministic
AudioContext substitute checks the real queue's nonzero loop samples and stopping queued sound;
it does not establish audible output or iPad Safari timing. Unit tests in `core/playback.test.ts`
cover the pure clock/bounds, schema compatibility/rejection and mixer/export sampling.
The same browser fixture also checks the optional ruler gesture: settings Apply/Cancel and
device persistence without document changes, quick-drag scrubbing, hold preview/forward/reverse/
single-frame commit, Undo/Redo, pointer/Escape/blur/resize/second-pointer cancellation, disabling,
Clips layer-origin conversion and project replacement. Tests dispatch touch PointerEvents through
the actual ruler handlers; they do not verify physical Pencil/touch browser gesture arbitration.
