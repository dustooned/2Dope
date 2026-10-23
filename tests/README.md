# Browser rendering checks

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
