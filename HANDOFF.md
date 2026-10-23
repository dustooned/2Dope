# 2Dope maintenance handoff

## Current state (2026-10-23) — read this first

**Release checkpoint (2026-10-23):** the user requested publishing the accumulated Draw/Animate,
project-local Assets, source/placement editing, rendering and painting-control work. This checkpoint
includes the dated implementation/test records below, browser fixtures and Claude entry guidance.
Fresh release checks: 52 files / 431 unit tests and strict TypeScript/production build passed;
the existing large-chunk warning remains. The latest 102 browser assertions were verified during
the preceding implementation step, not rerun for this push. Historical "uncommitted" and
"No commit/push/deploy" labels below describe those earlier steps. Pushing main starts the
existing GitHub Pages workflow; check its result before claiming the deployed build is live.

**Latest step: brush size/opacity controls, included in this checkpoint.** Phone review reproduced 26px-wide
unlabeled sliders, `aria-valuenow="100%"` being read as zero, and pointer input leaving focus on
BODY. Sidebar now visibly labels Size (px) and Opacity (%), with ≈48px-wide slider targets and
44px buttons. ARIA values are numeric with separate value text, ranges and vertical orientation.
Size uses the existing squared mapping over 1–500px, matching canvas size shortcuts; opacity now
reaches 0–100%. Zero opacity makes new strokes invisible. Brush selection/settings/persistence
still use the existing `brushChanged` path; no model/schema/dependency or stroke-algorithm changes.

Pointer input focuses its slider. Arrows adjust 1px/1%, Shift adjusts 10, Home/End reach limits,
and Enter/Escape return to canvas. Slider keys do not navigate frames/start playback. Fine dragging
is retained; cancel/lost capture/blur/hidden stop the gesture and retain its latest value. Under
300px of usable stage height, the sidebar becomes a bottom row above a docked flipbook. CSS
publishes preferred top/bottom clearances; stage/root resize and stage-style observation refresh
the layout. The expanded Brush controls toggle moves to the right edge, clear of that row.

Changed this step: `ui/sidebar.ts`, CSS, manual/UPDATES, architecture/roadmap/test docs and this
handoff; new `tests/brushcontrols.html` and `ui/brushcontrols.browser.ts`.

Checks this turn: **52 files / 431 unit tests passed**, strict TypeScript/production build and
diff check. Existing large-chunk warning remains. **102 browser assertions passed** at isolated
origin 5202: 26 control checks each at 354×767, 931×698 and 698×354 CSS (78), plus the existing
24 brush-library checks at phone size. The real Sidebar/App/Bubbles fixture covers labels/ARIA,
touch geometry, tap/focus, exact and Shift arrows, bounds, squared mapping, fine dragging,
cancel/lost capture, Escape/Enter/Space ownership, Eraser/Line preservation, brush refresh,
half/full-opacity Fill pixels, one-stroke Undo/Redo, fold/recovery and Animate. A forced 300px
stage checks every compact control and the fold toggle with `elementFromPoint`. No project
library/autosave is opened; brush/view preferences are restored. Early compact-layout failures
were corrected before these final results; whole-stage height and unresolved CSS max-height
were insufficient measures of usable space.

Production Brave 5201: native opacity tap selected 50; Left twice then Shift+Right reached 58
with focus retained. End restored 100, Return focused canvas. Size Home/Up/Shift+Up reached 12px;
Escape returned to canvas. On the test background, Brush/Fill remained selected. Phone sliders
measured ≈48×92px. At 698×354 CSS the compact sliders were ≈48×56px and unobstructed, with an
80×44px Brush controls toggle at the right edge. Native opacity tap/Left reached 49 with focus;
End/Escape restored 100/canvas. Native Space folded and restored the row with size 12, opacity
100 and Brush/Fill intact. Evidence: `../artifacts/brush-controls-phone.png` and
`../artifacts/brush-controls-short-screen.png`. Viewport override reset; active test tab closed.
Physical iPad/Pencil/Safari feel and long-project performance remain unverified. No commit/push/deploy.

**Immediate next task (proposed; await user authorization):** review the full Draw → paint
background → Assets → Animate placement loop with these controls together, fixing remaining
navigation/layout friction before expanding the interface. Full rail rewrite, advanced docking,
cross-project sharing and Auto Paint remain separate.

### Earlier Brushes choose/return workflow

**Latest step: Brushes choose/return workflow, uncommitted.** Phone review reproduced no visible
finish action, ≈37px header actions and focus dropping to BODY after brush selection. Brushes
now has a fixed 44px Done beside brush/tool/Line–Fill status. Import/Studio/Save and collection
buttons have 44px targets. Collections and cards scroll separately; short screens use the available
viewport. Done, Escape and opener-toggle close return focus to the canvas with brush/tool/plane
intact. Outside dismissal and Studio retain their destination. Nested dialogs/menus own Escape.

Card/category rebuilds restore focus and scroll. The opener is recovered by accessible label if
its toolbar rebuilt. Closing clears double-tap timing and cancels collection drag/capture/ghosts;
lost capture cancels its matching drag. Hidden cards ignore late clicks. Single-tap selection and
double-tap Studio are retained, using existing `App.setBrush`; no model/schema/dependency changes.

Changed this step: `ui/brushlib.ts`, CSS, manual/UPDATES, architecture/roadmap/test docs and this
handoff; new `tests/brushreturn.html` and `ui/brushreturn.browser.ts`.

Checks this turn: **52 files / 431 unit tests passed**, strict TypeScript/production build and
diff check. Existing large-chunk warning remains. **88 browser assertions passed** at isolated
origin 5202: 24 brush checks each at 354×767, 931×698 and 698×354 CSS (72), plus the existing 16
Colour checks at phone size. The new fixture uses actual App/BrushLibrary/Bubbles and pen-style
Fill pixels/Undo, with selected status, 44px geometry, fixed Done, card/category focus and scroll,
Eraser/Vector/Smudge retention, reopened/rebuilt opener behavior, Escape ownership, Studio,
drag/late-click/lost-capture cleanup, outside focus, long names and Animate's shared flow. A 120px
list constraint exercises scroll without saving test brushes. It reads the brush store, saves no
brushes and opens no project library/autosave; brush/colour/view preferences are restored.

Production Brave 5201: native Inking selection retained collection focus; choosing Brush Pen
retained card focus and showed Brush Pen · Brush · Fill. Space on Done returned to canvas with
Brush/Fill selected and size 18. Escape from the selected card returned to canvas. At 698×354 CSS,
native scrolling moved the list ≈164px while Done stayed at y≈19px, ≈44px high. Enter on Done
returned to canvas with Brush/Fill intact. Evidence: `../artifacts/brush-return-phone.png` and
`../artifacts/brush-return-short-screen.png`. Viewport override reset; agent test tab closed.
Physical iPad/Pencil/Safari feel and long-project performance remain unverified. No commit/push/deploy.

**Immediate next task (proposed; await user authorization):** review the brush size/opacity
controls alongside background painting, keeping adjustments readable and easy at phone/tablet
sizes. Full rail rewrite, advanced docking, cross-project sharing and Auto Paint remain separate.

### Earlier Colour choose/return workflow

**Latest step: Colour choose/return workflow, uncommitted.** Colour now has a visible 44px Done
button in a fixed header above its scrolling controls. Done, Escape (including from Hex colour)
and the opening colour circle return focus to the canvas, keeping the chosen colour, tool and
Line/Fill target. Closing clears any active disc drag. Outside clicks retain their normal target.
Escape yields to an open nested dialog or context menu. The toolbar replaces its colour button
after colour changes; the panel now recovers that anchor so the opening circle closes it normally.
A size observer repositions the panel when Disc/Values or Recent rows change its height.

Changed this step: `ui/colorpanel.ts`, CSS, manual/UPDATES, architecture/roadmap/test docs and this
handoff; new `tests/colourreturn.html` and `ui/colourreturn.browser.ts`. No document/schema or
dependency changes; existing shared project/history/residency paths are preserved.

Checks this turn: **52 files / 431 unit tests passed**, strict TypeScript/production build and
diff check. Existing large-chunk warning remains. **84 browser assertions passed** at isolated
origin 5202: 16 Colour assertions each at 931×698, 354×767 and 698×354 CSS (48), plus the existing
36 painting-plane assertions at phone size. The in-memory fixture checks fixed/reachable Done,
scrolling, resized placement, rebuilt opening-circle toggle, colour/tool/plane retention, a real
Fill stroke and Undo, Eraser, Hex Escape/invalid entry, nested-dialog ownership, late disc events,
Layers access and the before swatch. It opens no library/autosave and restores view/colour prefs.

Production Brave 5201: palette yellow + Enter on Done retained Brush/Fill and focused the canvas.
Native keyboard entry of #264653 + Return committed the colour; Escape from the Hex field then
closed Colour with canvas focus and Brush/Fill intact. Layers remained reachable and Space on
Close layers returned to the canvas. At 698×354 CSS a native scroll moved the body by ≈322px while
Done stayed at y≈19px, ≈44px high; Space on Done retained #264653 and focused the canvas. Evidence:
`../artifacts/colour-return-phone.png` and `../artifacts/colour-return-short-screen.png`.
Viewport override reset and agent test tab closed. Physical iPad/Pencil/Safari feel and long-project
performance remain unverified. No commit/push/deployment.

**Immediate next task (proposed; await user authorization):** review the brush library's
choose/return workflow alongside background painting, keeping the selected brush, tool and plane
clear. Full rail rewrite, advanced docking, cross-project sharing and Auto Paint remain separate.

### Earlier background painting / Layers / Line–Fill review

**Latest step: background painting / Layers / Line–Fill review, uncommitted.** Reproduced in
production: selecting Paint on Fill replaced Brush with the bucket, and Line selected Vector.
`App.setPlane` now keeps Brush, Eraser and Smudge. Vector is explicitly on Line and the bucket
on Fill; choosing their incompatible plane uses Brush. Plane selection no longer resets the fill
mode. Existing raster/vector storage, residency, commands, source navigation and schema are retained.

Phone Line/Fill buttons/eyes were ≈34px and opacity ranges ≈16px high. These now have 44px targets;
the layer opacity/blend rows and panel header controls are enlarged too. Visibility buttons say
Hide/Show Line or Fill. Close layers explicitly returns to the canvas. A native opacity arrow-key
check also reproduced focus dropping to BODY when the panel rebuilt. `LayerCards.update` now
preserves list scroll and restores the focused input/select within its original options group.

Changed this step: `app.ts`, `ui/layercards.ts`, CSS, manual/UPDATES, architecture/roadmap/test docs,
this handoff; new `tests/paintingplanes.html` and `ui/paintingplanes.browser.ts`.

Checks: **52 files / 431 unit tests passed**, strict TypeScript/production build and diff check.
Existing large-chunk warning remains. **138 browser assertions passed** at isolated origin 5202:
36 painting checks each at 354×767, 931×698 and 698×931 CSS (108), plus 30 asset workflow checks.
The new fixture uses actual App/Bubbles/LayerCards, pen-style strokes, resident pixels and the
compositor: still background and linked paint layers, Brush/Eraser/Smudge/Vector/bucket routing,
separate Line/Fill, X, opacity/visibility pixels, focus/scroll, Close, and stroke/layer Undo/Redo.
It opens no library/autosave and restores view preferences. Visible-colour comparisons tolerate
one 8-bit level for untouched planes, up to three for history patch readback under Chromium canvas
privacy, and one alpha level. The measured redo difference was ≤3 raw RGB / ≈2.17 premultiplied
levels with alpha unchanged; exact raw RGB at transparent edges is not claimed.

Production Brave 5201: at phone width Fill kept Brush selected and the bucket off. Repeated native
Fill-opacity Left keys changed 99→98→97 while retaining Fill opacity focus and the same list scroll;
End restored 100. Space on Close layers focused the canvas. Through actual controls, added a still
blue background, brushed two strokes on Fill, then a Line stroke while keeping Brush. Tablet rows
measured ≈44px for each target/eye/range; Line opacity retained focus after Left/End. Source Done
returned to the shot. Evidence: `../artifacts/painting-planes-phone.png` and
`../artifacts/painting-layers-tablet.png`. Physical iPad/Pencil/Safari feel and long-project performance
remain unverified. No commit/push/deployment.

**Immediate next task (proposed; await user authorization):** review Colour's touch close/return
path alongside painting and layers. Observed here: the phone Colour panel covers the Layers tool
and has no visible Close action; Escape dismisses it. Keep the chosen colour/tool and recoverable
canvas controls. Full rail rewrite, advanced docking, cross-project sharing and Auto Paint remain
separate.

### Earlier source identity

**Latest step: visible source identity while painting, uncommitted.** The source header now shows
its artwork name and Updates N placements across all project comps, or Not placed yet for unused
artwork. It reuses `CompEditor.instances`; no model/schema/dependency changes. Full source names
and the project-wide edit explanation remain in the group description and tooltips. Rename,
Undo/Redo and ordinary UI updates refresh the name/count. Exiting clears the source status.

Source identity uses two text lines beside Done in the existing-height header. Below 700px the
workspace selector/switcher and redundant Source prefix step aside while editing, leaving room
for Assets, source name/status and Done. Long names shorten within the available width. Done
restores the ordinary header and existing shot/frame/workspace/canvas-focus return behavior.

Changed this step: `ui/artworkassets.ts`, CSS, `ui/artworkworkflow.browser.ts`, manual/UPDATES,
architecture/roadmap/test docs and this handoff.

Checks: **52 files / 431 unit tests passed**, strict TypeScript/production build and diff check.
Existing large-chunk warning remains. **162 browser assertions passed** on isolated dev origin 5202:
30 workflow assertions at 1745×833, 931×698, 698×931 and 354×767 CSS (120), naming 10, plus 16 layout
assertions at tablet landscape and phone (32). Added checks cover source identity/unplaced status,
complete status/44px Done within one compact header, Fit clearance, one and multiple uses across
other shots, 80-character source names, rename Undo/Redo and restoring workspace controls. The
fixture uses in-memory artwork only and restores local view preferences; no library/autosave.

Production Brave 5201 at 354×767 CSS: native Enter on Sky's Edit source opened Evening sky;
its name and Updates 2 placements were visible in a ≈241×54px header, with the complete status
fitting. Native Space on Done returned to Animate/frame 1 with canvas focus, a visible workspace
selector, cleared source status and playback stopped. Test-only drawing folds were restored;
viewport override reset. Screenshot: `../artifacts/source-identity-phone.png`.
Physical iPad/Pencil/Safari feel and long-project performance remain unverified.

**Immediate next task (proposed; await user authorization):** review Draw's Layers and Line/Fill
controls at tablet/phone sizes during an actual background-painting pass, then fix observed
friction. Full rail rewrite, advanced docking, cross-project sharing and Auto Paint remain separate.
No commit/push/deployment.

### Earlier compact source access

**Latest step: direct Edit source in the compact placement bar, uncommitted.** The existing
Edit source control now stays beside Placed asset, Options and Done, outside scrolling details.
On phones it keeps a pencil icon and visible Edit label in a 44px target. Replace/Copies/Names
use three columns in the phone details. The compact row retains its height; source selection,
editing and Done use the existing navigation, shot/frame return, canvas focus and History behavior.
Done's tooltip now explains that it returns to the shot/frame. No model/schema/dependency changes.

Changed this step: `ui/artworkassets.ts`, CSS, `ui/paintinglayout.browser.ts`,
`ui/artworkworkflow.browser.ts`, manual/UPDATES, architecture/roadmap/test docs and this handoff.

Checks: **52 files / 431 unit tests passed**, strict TypeScript/production build and diff check.
Existing large-chunk warning remains. **106 browser assertions passed** on isolated origin 5202:
16 layout assertions at each of 1745×833, 931×698, 698×931 and 354×767 CSS pixels (64), plus
21 workflow assertions at desktop and phone widths (42). New checks cover reachable/labeled Edit
with Options closed, 44px geometry (0.1px zoom-rounding tolerance), no-selection disabling and
fixed sizing outside the scrolling details. Workflow checks direct Edit, pen-style source painting,
Undo/Redo, touch cancellation and return without opening library/autosave.

Production Brave 5201 at 354×767 CSS: compact bar ≈58px tall, picker ≈170px wide, Edit ≈44×44px
and Options closed. Native Enter on Edit opened the selected source in Draw with canvas focus;
native Space on Done returned to Animate/frame 1 with canvas focus and playback stopped. Screenshot:
`../artifacts/compact-source-phone.png`. Viewport override reset. Physical Pencil/touch feel,
iPad Safari and long-project performance remain unverified.

**Immediate next task (proposed; await user authorization):** review the source-editing header on
narrow screens so students can identify the artwork and its shared-link behavior while painting.
Full rail rewrite, advanced docking, cross-project sharing and Auto Paint remain separate.
No commit/push/deployment.

### Earlier input/focus review

**Latest step: Draw → Assets → Animate input/focus review, uncommitted.** Reproduced two
production keyboard conflicts: Enter on Asset options exited placement, while Space started
playback instead of activating the button. `App.onKey` now gives native fields their keys,
leaves Enter/Space button activation alone and respects already-handled events. Ignored releases
clear held navigation keys without toggling playback. Canvas/body shortcuts still work.

The drawing canvas is Tab-reachable; pointer input focuses it without scrolling. New asset,
Edit source (including shelf previews/cards) and both Done controls return focus to the canvas.
Place focuses the selected-placement picker. Navigation retains the existing shared project,
source pixels, shot/layer/frame/workspace return and History behavior. No schema/dependency changes.

Changed this step: `app.ts`, `ui/artworkassets.ts`, manual/UPDATES, architecture/roadmap/test docs,
this handoff; new `tests/artworkworkflow.html` and `ui/artworkworkflow.browser.ts`.

Checks: **52 files / 431 unit tests passed**, strict TypeScript/production build and diff check.
Existing large-chunk warning remains. **85 browser assertions passed** on isolated dev origin 5202:
new workflow 20, placement 13, clip gestures 17, layout 13 (1745×782 CSS), timing 9, replacement 13.
The new workflow uses real App/UI, pen-style pointer events and source pixels, one-step Undo/Redo,
creation/placement/source return, touch move-to-pinch cancellation, focus and keyboard routing.
It opens no library/autosave and restores its view preferences. Its touch check resolves the live
placement after cancellation because the editor restores a snapshot rather than the old object.

Production Brave 5201: native Enter opened Asset options without leaving placement; native Space
closed it without playback. Enter opened Edit source with canvas focus; Space on Done returned
to Animate with canvas focus and playback stopped. Evidence: `../artifacts/artwork-workflow-focus.png`.
Actual iPad/Pencil/Safari feel and long-project performance remain unverified.

**Immediate next task (proposed; await user authorization):** make the selected asset's Edit source
and return path easier to discover from the compact placement bar, keeping the existing style and
canvas-space budget. Full rail rewrite, advanced docking, cross-project sharing and Auto Paint
remain separate. No commit/push/deployment.

### Earlier canvas-space step

**Latest step: more canvas space in Draw/Animate, uncommitted.** Move assets now starts with a
compact Placed asset / Options (three dots) / Done bar. Source actions, identity, Undo/Redo and
optional Timing open in bounded scrolling details. Picker and Done stay outside that scroll
area. Closing Options restores the compact bar, and Reset layout folds both options and timing.
These folds are session view state, not document data. Options/timing toggles preserve the view.

`TracksSheet` now measures the actual column/stage and reserves about 45% canvas at full Tracks
and 60% at half in painting modes, with 280px/300px floors when feasible and at least 60px of
tracks. It recalculates on viewport/editor changes, skips hidden tracks, and avoids redundant size
writes. Timing retains its review budget. User sheet changes/drags call preserveCanvasView before
existing refit callbacks. Explicit `App.fit` clears the painting header and compact placement row;
expanded options remain temporary overlays. No content, timing, history, schema or dependencies
change. Earlier work remains preserved below.

Changed this step: `ui/artworkassets.ts`, `ui/sheet.ts`, `ui/paintingworkspace.ts`, `main.ts`,
`app.ts`, CSS, manual/UPDATES, architecture/roadmap/test docs/this handoff; new
`tests/paintinglayout.html` and `ui/paintinglayout.browser.ts`. Naming/independent/replacement/
numeric-timing browser helpers now open Options before accessing tucked controls.

Checks: **52 files / 431 tests passed**, strict TypeScript/production build and `git diff --check`.
Existing large-chunk warning remains. **13 real-App/app-CSS layout assertions at each of three
CSS viewport sizes (39 total): 931×698, 698×931, 354×767.** Coverage: readable picker/Done,
explicit Fit clearances, bounded scrolling details, folding view/frame preservation, full canvas
budget, half/full/peek view preservation, editor recovery, Reset layout, Draw handle recovery,
no document/history changes and Done while collapsed. The fixture saves/restores only its local
view-preference keys; it opens no library/autosave. **46 asset browser assertions also passed**:
naming 10, independent copies 14, source replacement 13 and numeric timing 9, through Options.

Production Brave `5201`: at 931×698 CSS, full Tracks left a measured 314px canvas in a 698px
column; at 354×767 it left 345px in a 767px column. Expanded timing scrolled while Done stayed
at y≈67px; Show start remained usable and moved to frame 4. Closed Options returned to a 58px
bar, with a 218px phone picker. Folded Tools/Options remained recoverable at the edges. Explicit
Fit showed artwork between the header and compact bar. Viewport override reset after checks.
Evidence: `../artifacts/canvas-space-tablet.png`, `../artifacts/canvas-space-phone.png`.
Physical iPad/Pencil/Safari and long-project performance remain unverified.

**Immediate next task (proposed; await user authorization):** review the complete Draw → Assets →
Animate navigation with touch/pen-style input and keyboard focus, using observed findings to
choose the next fixes. Physical Pencil checks still need a device. Full rail rewrite, advanced
docking, cross-project sharing and Auto Paint remain separate. No commit/push/deployment.

### Earlier source replacement step

**Latest step: Replace source for a selected asset placement, uncommitted.** Replace in Move
assets opens the familiar Assets preview shelf in a focused selection mode. Use source or its
preview changes the selected placement's link. Current source is disabled; ordinary Edit/Place/
Rename/New asset controls and placement rows are omitted in this mode. Close cancels. Source
identity/counts/picker/previews update, and Edit source opens the replacement artwork in Draw.

`ArtworkAssets.replaceSource` uses one focused metadata History command, resolving the live
placement by id on Undo/Redo. It preserves name, transform/keys, parent, lock and playback/timing.
Old source-layer pinned overrides reset and are restored by Undo. A finite automatic one-shot
ending becomes explicit out before the swap; looping shot-followers remain automatic. No source
comps/drawings/pixels are created or deleted. `canReplaceSource` rejects unchanged/nonasset/missing
sources and circular/dangling nested source graphs. UI actions check project, active comp,
selection and original source; stale selection/project replies close without changes. Cancel
restores Replace focus. Shelf preview pins still release through existing sequential previews.
The new action group stays together on desktop and uses five labeled icon columns on phones.
No schema or dependency changes. Earlier uncommitted work is retained below.

Changed this step: `core/assets.ts`, `core/assets.test.ts` (four new cases), `ui/artworkassets.ts`,
CSS, manual/UPDATES, architecture/roadmap/project-format/test docs/this handoff; new
`tests/assetreplace.html` and `core/assetreplace.browser.ts`.

Checks: **52 files / 431 tests passed**, strict TypeScript/production build, `git diff --check`.
Existing large-chunk warning remains. **13 real-App browser assertions passed** at isolated dev
origin `5202`: shelf scope/current/cancel/focus, selected source/picker/preserved properties,
real red/green compositor pixels, queued App Undo/Redo, Edit source/Done, validated standalone
ZIP with both editable sources, and stale selection/project actions. No library/autosave in fixture.

Production Brave `5201`: replaced Foreground trees' Evening sky copy with Evening sky, retaining
its name and 4–20 interval. Counts changed to three linked originals, with the independent source
still available. One Undo/Redo restored/reapplied the link. Reload retained the replacement. At
**354×767 CSS pixels**, inspected the compact action row and source previews, then selected the
independent source again through Use source. Both editable sources remained; another reload kept
the selected source and 4–20 interval. Desktop toolbar now keeps Done in its action row. Viewport
override reset. Evidence: `../artifacts/asset-replace.png`, `../artifacts/asset-replace-phone.png`.
Physical iPad/Pencil/Safari and long-project performance remain unverified.

**Immediate next task (proposed; await user authorization):** tablet layout pass for Draw/Animate,
recovering canvas space when placement controls and expanded Tracks are both open, with reachable
selector/Done/collapse handles and preserved zoom/playhead. Full rail rewrite, advanced docking,
cross-project sharing and Auto Paint remain separate. No commit/push/deployment.

### Earlier independent artwork step

**Latest step: Make independent for one asset placement, uncommitted.** Move assets now has
Copies → Duplicate placement (shared source) / Make independent (own editable artwork). The
selected placement retains its name, timing, lock and transform. Its copied source gets a unique
copy suffix and keeps layers, frames, Line/Fill, deep vector data, masks and nested source graphs.
Edit source opens that artwork in Draw; Done returns through the existing source navigation.
One Undo restores the original source link and removes the new comps; Redo restores the copy.

`core/assetcopy.ts` walks/deduplicates the source graph and remaps comp/layer/cel/audio ids,
parents, masks, pins, overrides (including selected outer placement overrides) and audio panel
links. Immutable audio bytes remain shared. `Project.cloneStoredDrawing` creates fresh parked
drawing ids with deep vectors and independent canvases on decode. Stored PNG refs are reused
without loading all frames; dirty resident Line/Fill encode serially with balanced Residency pins.
Project/comp/source/drawing revision checks reject stale async jobs before allocating pool data.
File comp/drawing/vector limits are enforced before and after preparation. Undo uses existing
`CompEditor.editProject` metadata snapshots; drawings stay in the pool for Redo and their keys
remain GC-protected. No new schema fields/dependencies; Motion's shallow makeUnique is unchanged.

Changed this step: new `core/assetcopy.ts` and tests, `core/assets.ts` and tests, `core/project.ts`,
`ui/artworkassets.ts`, exported existing format limits in `io/schema.ts`, manual/UPDATES,
architecture/roadmap/project-format/test docs/this handoff, and new `tests/assetindependent.html`
with `core/assetindependent.browser.ts`. Earlier uncommitted changes are preserved below.

Checks: **52 files / 427 tests passed**, strict TypeScript/production build, `git diff --check`.
Existing large-chunk build warning remains. **14 real-App browser assertions passed** on isolated
dev origin `5202`: Copies/cancel, selected source ownership, real PNG Line/Fill, deep vector points,
independent painting and paint/source Undo/Redo, validated standalone ZIP reload, independent
recoloring, Edit source/Done, and linked Duplicate placement. No library/autosave in the fixture.

Production Brave `5201`: made Foreground trees independent from Evening sky. Its name and 4–20
interval stayed intact; source count changed from three shared placements to two original/one
independent. One Undo/Redo restored/reapplied the link. Painted an extra stroke in Evening sky
copy, returned, opened Evening sky and confirmed the original five lines were unchanged. Its two
clip previews matched; the independent preview differed. Autosave/reload kept both source cards,
placement names, counts and edited preview. At **354×767 CSS pixels**, inspected Copies choices
and cancelled without changes. Viewport override reset, canvas fitted afterward.
Evidence: `../artifacts/asset-independent.png`, `../artifacts/asset-independent-phone.png`.
Physical iPad/Pencil/Safari and long-project performance remain unverified.

**Immediate next task (proposed; await user authorization):** Replace source on one selected
placement from this project's Assets shelf, keeping its name/timing/transform and one Undo.
Full rail rewrite, advanced docking, cross-project sharing and Auto Paint remain separate.
No commit/push/deployment.

### Earlier naming step

**Latest step: separate placement/source naming, uncommitted.** The placement toolbar now has
Names → Rename placement / Rename source, with a scope explanation before entering text. A
placement rename affects that instance only. Source rename changes the shared comp name across
the project and preserves every existing placement name. Source cards in Assets have Rename,
including unplaced sources; the shelf reopens afterward. Draw header, picker, rail labels and
source context reflect names. Metadata only: no pixels, links, timing or transforms change.

`ArtworkAssets.renamePlacement/renameSource` use one focused shared-history command per name,
resolving objects by id during Undo/Redo so later comp-snapshot commands cannot stale the target.
Blank/unchanged names add no history, names trim/cap at 80 characters, and busy/playback edits
are refused. Dialog replies are guarded by Project identity and active comp. Cancel restores
focus to Names or the shelf. `askText` has an optional scope description; old callers keep their
existing behavior. Hinted picker choices stack the description below the title instead of running
the two together. No dependency, format or schema changes.

Changed this step: `core/assets.ts`, `core/assets.test.ts` (four new cases and extended validated
name round-trip coverage), `ui/artworkassets.ts`, `ui/dialogs.ts`, CSS, manual/UPDATES, architecture,
roadmap/test docs/this handoff; new `tests/assetnames.html` and `core/assetnames.browser.ts`.

Checks: **51 files / 416 tests passed**, strict TypeScript/production build and `git diff --check`.
**Ten real-App browser assertions passed** at isolated dev origin `5202`: scope choices, menu/text
cancel, one-copy rename/picker, one-step Undo, source rename preserving placement labels,
validated capture/reload of names and links, Draw header, shelf/card refresh, and stale-project
reply rejection. No library/autosave is opened in that fixture.

Production Brave `5201`: renamed Sky 2 placement to Foreground trees; Undo/Redo restored/reapplied
it as one step. Renamed shared Sky to Sunset while the Foreground trees and other placement names
stayed intact. At **354×767 CSS pixels**, used the source-card Rename to Evening sky and checked
the refreshed shelf. Autosave/reload retained the distinct names. Viewport override reset.
Evidence: `../artifacts/asset-names.png` and `../artifacts/asset-names-phone.png`.
Physical iPad/Pencil/Safari and long-project performance remain unverified.

**Immediate next task:** Make independent for a selected placement, copying editable artwork with
one Undo restoring the original source link. Inspect/reuse existing make-unique support, including
pixel-reference ownership, instead of duplicating the entire asset system. Full rail rewrite,
advanced docking, cross-project sharing and Auto Paint remain separate. All work is uncommitted;
no push/deployment.

### Earlier preview and identity step

**Latest step: artwork previews and source/placement identity in Clips, uncommitted.** Asset bars
repeat a small source-frame-one preview. These identify shared artwork, not each animated frame
or the instance's transform. Names/durations and trim grips remain above the preview. Duplicates
share cached artwork; source settings/pixel revisions invalidate it. Preview completion updates
existing elements without rebuilding rails. Only visible clips request new rendering, one job at
a time; drawing/clip gestures and playback defer new work. The 32-entry LRU is scoped by Project
identity, including reused ids/revisions. Completed slots do not thrash on LRU eviction.

Labels distinguish placement names/numbers from source names. Numbers count instances of that
source in the current shot. The picker includes a differing source name in parentheses; the toolbar
shows Source and the linked count in this shot. Edit source's tooltip explains the shared effect
across all shots. Draw's source header says Source. Shelf counts say linked placements. Picker
selection now also refreshes rail highlights/grips via the editor-change callback.

Changed: new `core/assetlabels.ts` (+ four tests), `view/assetpreview.ts`, `ui/assetclippreviews.ts`,
`ui/rails.ts`, `ui/strip.ts`, `ui/artworkassets.ts`, `main.ts`, CSS/manual/UPDATES, architecture,
roadmap/test docs/this handoff; new `tests/assetpreviews.html` / `view/assetpreview.browser.ts`.
Renderer pins only frame-needed drawings, uses the shared compositor and suppresses export stamps.
Cancellation/error paths release pins. Visibility changes resume preview observation. No schema,
document-edit behavior or dependencies added. Earlier work remains preserved below.

Checks: **51 files / 412 tests passed**, strict TypeScript/production build and `git diff --check`.
**15 new browser assertions passed** at isolated dev origin `5202`: actual PNG capture/reload,
layered pixels/opacity, pin success/cancel/error cleanup, shared cache/rebuilt-node reuse, source
edits without replacing nodes, offscreen/input deferral, project identity reuse and leaving Clips.
This fixture uses a minimal App-shaped view-state rig, real DOM, Residency and compositor.

Production Brave preview `5201`: source/placement labels, repeated artwork after reload, edited
the shared source in Draw and returned; all three linked clip previews changed and matched.
Dragging the thumbnail-covered clip shifted 4–20 to 5–21; one Undo restored 4–20. At **354×767
CSS pixels**, inspected repeated artwork and used the picker between Clouds (one placement) and
Sky (three placements); source identity/counts remained readable. Viewport override reset.
Evidence: `../artifacts/asset-previews.png`, `../artifacts/asset-previews-phone.png`.
Physical iPad/Pencil/Safari and long-project performance remain unverified.

**Immediate next task:** separate Rename placement and Rename source actions in existing asset
controls, preserving shared links and history. Do not rebuild previews, movement/timing or the
asset loop. Full rail rewrite, advanced docking, cross-project sharing and Auto Paint remain
separate. Keep physical iPad checks on the checklist. All work is uncommitted; no push/deployment.

### Earlier direct clip gesture step

**Latest step: direct asset clip dragging/trimming, uncommitted.** In Animate → Clips, drag an
asset bar to move it by whole frames. Select a bar to reveal 44px start/end grip targets. Moving
keeps visible duration; start trimming keeps the source origin and ending, while end trimming
keeps the beginning. Moving/trimming a following clip makes its current interval explicit;
Follow shot end in numeric Timing restores automatic ending. Preview recomputes from the initial
snapshot, release commits one history entry, and a tap or returning to the origin creates none.
Source pixels, local transform keys and sibling tracks stay put. Fixed shot duration bounds edits.

`CompEditor.assetClipStart/Move/End` owns previews and participates in `strokeActive` busy state;
existing `gestureEnd(true)` cancels on project/workspace navigation. Delegated `ui/assetclipdrag.ts`
captures the stable Strip scroll container across rail rebuilds. Escape, a second pointer,
pointercancel, lost capture, blur, hidden pages and leaving Clips cancel unfinished previews.
Near-edge pointer movement nudges horizontal scrolling. No cross-track moves or ripple are added.
Asset track names sit above the bars so first-frame handles are no longer under sticky labels.
Numeric Timing remains the exact/accessible path for very short clips. Its tray scrolls within
short canvas areas with a sticky picker/Timing/Undo row, keeping expanded Tracks usable on phones.
The Clips playhead and auto-scroll now use the shared clock beyond the held drawing frame;
ruler labels include the active drawing track's comp offset.

Changed in this step: `core/assettiming.ts` (+ four tests), `compedit.ts` (+ three tests), new
`ui/assetclipdrag.ts`, `ui/rails.ts`, `ui/strip.ts`, CSS/manual/UPDATES, architecture/roadmap/tests
docs/this handoff; new `tests/assetclips.html` and `core/assetclips.browser.ts`. Existing schema-3
fields and history only; no dependency/schema changes. Previous work remains preserved below.

Checks: **50 files / 408 tests passed**, strict TypeScript/production build and `git diff --check`.
**17 real-App browser assertions passed** on isolated dev origin `5202`: live rebuilt-bar move,
both trims, one-step Undo, no ripple, taps, cancellation via pointer/Escape/second pointer/lost
capture/blur, subsequent control clicks, Flipbook/workspace/project exits, returning to the origin,
validated capture/reload and the actual Strip's beyond-drawing playhead/scroll. These dispatch
scripted events, not physical touch/Pencil input.

Production Brave preview `5201`: body drag shifted 5–18 to 7–20, one Undo restored 5–18;
start grip trimmed to 6–18, end grip extended to 6–20, numeric Timing agreed. At **354×767 CSS
pixels**, expanded Tracks and dragged the start grip to 4–20; autosave/reload retained it.
Found/fixed the offscreen Timing tray with expanded Tracks and checked Show end plus the sticky
Timing toggle after scrolling the tray. Viewport override reset. Evidence: `../artifacts/asset-clips.png`
and `../artifacts/asset-clips-phone.png`. Physical iPad/Pencil/Safari remains unverified.

**Immediate next task:** artwork previews on asset clips and clearer source/placement labels,
using resident/cached thumbnails without decoding entire projects or rebuilding the timeline.
Keep physical iPad checks on the checklist. Full rail rewrite, advanced docking, cross-project
sharing and Auto Paint remain separate. Do not reimplement the asset loop, movement or numeric
timing. All work remains uncommitted; no push/deployment.

### Earlier numeric timing step

**Latest step: selected asset timing in Clips, uncommitted.** Animate → Clips → tap an asset
track (or choose a placement in Move assets) → Timing exposes Start, Hold and End. Start/End
are inclusive shot frame numbers; Hold is duration in frames. Enter or leaving a field commits
one history step; Escape discards a pending value. Start shifts the interval and source origin
together; Hold/End set a finite ending, Follow shot end restores `out:null`. An auto-sized shot
can shrink when its finite ending is removed. Fixed shot duration bounds edits. Once-playing
sources become looping when setting their hold/end so they do not disappear prematurely;
single-frame and ping-pong modes are preserved. Source drawings, transforms and sibling tracks
are not retimed. Off-frame selection remains editable; preview handles require visible content.

Asset tracks now stay visible in Animate's folded Clips list, highlight selection, show their
actual interval and select the instance rather than entering the source. The Clips ruler,
scrubbing range and readout follow the shared shot clock beyond a shorter drawing track.
Show start/end jumps preview the interval edges. Timing folds away, including at phone width.
Undo/Redo clamp the playhead when the shot gets shorter.

Changed: new `core/assettiming.ts` plus six tests; three added editor tests; `compedit.ts`,
`app.ts`, `ui/artworkassets.ts`, `ui/rails.ts`, `ui/strip.ts`, `main.ts`, CSS/manual/UPDATES,
architecture/next-phase/test docs/this handoff. New `tests/assettiming.html` and
`core/assettiming.browser.ts`. Uses existing schema-3 fields; no dependency/schema changes.

Checks: **50 files / 401 tests passed**, strict TypeScript/production build and `git diff --check`.
**Nine real-App browser assertions passed** at isolated development origin `5202`: native field
change/Enter/blur, off-frame selection, composite pixels before/at Start and at/after End,
one-step Undo, shorter-shot playhead clamping, Escape cancellation and validated capture/reload.
Production preview `5201`: changed Hold 12, Start 5, End 18; used Undo/Redo, Follow shot end,
edge jumps, Play/Pause across the extended shot, saved/reloaded the interval. At **354×767 CSS
pixels**, edited End and folded Timing to recover canvas space. Viewport override reset.
Evidence: `../artifacts/asset-timing.png`, `../artifacts/asset-timing-phone.png`.
Physical iPad/Pencil/Safari behavior remains unverified. Earlier fixture counts below are historical.

**Immediate next task:** direct clip movement and edge trimming in Clips, using the same timing
command/history model with one Undo per gesture. Keep the full rail rewrite, advanced docking,
cross-project sharing and Auto Paint separate. Do not rebuild the existing asset loop, placement
tool or numeric timing. All work remains uncommitted; no push/deployment.

### Earlier direct arrangement step

**Latest step: direct asset arrangement in Animate, uncommitted.** Place opens the explicit
**Move assets** tool with that instance selected. Tap a placement, drag to move, use a corner
to resize proportionally. A contextual picker handles overlapping/offscreen instances; Edit
source, Duplicate, Done and shared Undo/Redo stay accessible. Brush sliders tuck away while
arranging. Both Flipbook and Clips support it. Painting locks stay on the instances; only this
explicit, asset-filtered gesture path permits their transforms. Static edits ignore Motion's
Auto-key preference; already animated properties keep their other keys and edit at the playhead.
Entering/leaving arrangement fits the comp/drawing view. Mode/selection is session state;
transforms and source links use existing schema-3 comp data.

Changed in this step: `app.ts` (mode scope, rendering/residency, pointer/keyboard routing,
busy-state/cancellation handling and source-only Draw context); `compedit.ts` (restricted gesture
options, threshold for taps versus moves); `view/overlay.ts` (simple asset handles); `ui/bubbles.ts`
(Move assets and direct return to painting); `ui/artworkassets.ts` (contextual controls and shelf
Move action); `core/assets.ts` (auto-select placement), its test rig, `main.ts`, CSS, manual/UPDATES,
architecture/roadmap/this handoff. Seven added editor regressions; new repeatable browser fixture
`tests/placement.html` / `core/placement.browser.ts`. No dependency or schema changes in this step.

Checks: **49 files / 392 tests passed**, strict TypeScript/production build and `git diff --check`
passed. **13 real-App browser input assertions passed** on isolated origin `5202`: auto-selection,
tap/no history, one-step move/Undo, release outside canvas, pen cancellation, switching a moved
finger to pinch without undoing prior work, Done/lock/source preservation, resident content-pivot
resize, validated transform capture/reload, stepping past shot end, workspace exit and new project
reset. These dispatch events in a real browser; they are not physical Pencil/touch tests.

Desktop Brave production preview `5201`: selected on canvas, moved and resized one linked
instance, one Undo restored the whole drag, duplicated it, edited its shared source and returned;
autosave/reload retained transforms and links. Fixed sibling instances showing around the source
while editing: Draw asset sources now show on their own. Tested drawing-tool return without
opening Brushes, and both Flipbook/Clips. At **354×767 CSS pixels**, used the placement picker,
moved artwork and Undo/Redo in the contextual toolbar, collapsed the editor and used Done to
restore drawing controls. Viewport override reset. Evidence: `../artifacts/asset-placement.png`
and `../artifacts/asset-placement-phone.png`. Physical iPad/Pencil/Safari remains unverified.

**Immediate next task:** clearer asset start/hold/end controls in Clips, tied to the selected
instance and existing comp timing. Keep the full rail rewrite, advanced docking, cross-project
sharing and Auto Paint separate. Do not reimplement the asset loop or direct placement tool.
All work remains uncommitted; no push/deployment. Earlier paragraphs below record preceding steps.

### Earlier asset UI polish

**Latest UI polish (uncommitted):** `ui/artworkassets.ts` now uses a compact right-edge dialog with real artwork previews, layer/frame counts, source Edit/Place buttons and folded placement details. It matches existing line icons, rounded layer cards and theme variables. Previews pin/unpin source frame-0 drawings through Residency, render through the compositor, run sequentially and stop when the panel/project changes. `ui/paintingworkspace.ts` uses icon-labelled mode shortcuts; CSS keeps Assets/Done visible at narrow widths, moves New asset into the shelf on phones, and highlights Done. Manual/UPDATES updated. Document format and source/placement commands are unchanged by this polish.

Checks for this polish: **49 files / 385 tests passed**, strict TypeScript/production build and `git diff --check` passed. Desktop Brave production preview `5201`: source thumbnails drawn after reload from parked artwork; folded placement actions, remove/Undo, source Edit/Done, create/Place another source, Escape dismissal and focus return. Responsive override was refreshed successfully in this pass: **354×767 CSS pixels** inspected, source Done and Assets remain visible without header scrolling, shelf cards adapt to a single-column compact layout and New asset/create/place works. This supersedes the earlier asset phone-width gap below, but still does not verify physical iPad/Pencil/Safari behavior.

**Next bounded product step:** select a placed asset directly in Animate and move/resize it with a small contextual Edit source action, using the existing comp transform/history model; then make its hold/start/end clearer in Clips. Current placements are initially locked and transforms remain in Motion. The free-arrangement rail is still separate future work. Keep iPad testing on the checklist. No commit/push/deployment performed.

### Earlier reusable asset step

**Latest step: reusable project assets, uncommitted.** Draw → New asset → paint/add layers → Done → Assets/Place in Animate → Edit source in Draw → Done now works. Sources are normal editable comps marked `asset: true`; placements are linked comp layers, initially locked, behind drawing tracks. Still artwork holds and optional source frames loop. Unplaced sources stay saved. Assets are project-local; cross-project sharing is not built. The Draw/Animate layouts below remain in place; Clips reuses the exposure timeline.

Changed in this asset step: new `core/assets.ts`, `core/assets.test.ts` (seven regressions), `core/assets.browser.ts`, `ui/artworkassets.ts`, `tests/assets.html`; comp model/schema preserve the optional source marker, `app.ts` keeps linked sources visible/resident and all source paint layers visible, `compedit.ts` safely exits an unplaced source, `main.ts` wires the shelf, CSS/manual/UPDATES/project-format/next-phase/tests README updated. Additive schema-3 field, no dependency changes. Navigation guards callback reentry when the Animate shortcut leaves source editing.

Verification: **49 files / 385 tests passed**, strict TypeScript/production build passed, `git diff --check` passed. **Eight real-browser archive assertions passed** at isolated development origin `5202/tests/assets.html`: actual PNG and ZIP encoding/validated reload, all source layers/links/unplaced artwork, parked-source re-export, Residency restoration and edited composite pixels. Desktop Brave production preview `5201`: created a two-layer Sky source, painted both, placed in Animate, reopened/edited source, returned with Done and Animate shortcut; edits persisted through autosave/reload. Added a second linked placement; Undo/Redo changed shelf counts correctly. Artwork held on shot frame 2, Done restored 2/2, all four control groups hid and recovered with Reset. Browser viewport override did not change the actual viewport in this pass, so **new asset UI at phone width is unverified**, as are physical iPad/Pencil input. The earlier layout-only narrow inspection below remains historical evidence.

**Immediate next task:** test this asset flow on iPad, then improve asset placement and Clips presentation (visible source/instance selection and timing) using existing comp data. The free-arrangement rail, advanced docking, cross-project sharing and Auto Paint remain later work. Do not rebuild the mode shell, renderer or first linked-asset loop. All current work remains uncommitted; no push or deployment.

### Earlier workspace layout step

Draw/Animate workspace layouts, uncommitted. This supersedes the five-screen status below. Current screens are Story, Draw, Animate, Timing, Motion and Share. Draw defaults to a still Canvas with optional Flipbook; Animate has simplified drawing tools (More tools for the rest) and independent Flipbook/Clips views. Tools, Options, Brush controls and Editor collapse with recoverable handles; Fit canvas and Reset layout stay accessible. Clips currently reuses the exposure timeline, not a new free-arrangement rail.

Changed in this step: `core/workspace.ts` (+ three preference tests), `ui/paintingworkspace.ts`, `app.ts`, `main.ts`, `ui/bubbles.ts`, `ui/flipmode.ts`, `ui/sheet.ts`, `index.html`, CSS, manual and UPDATES. No schema/dependency changes. Earlier rendering changes remain in the working tree.

Verification: **48 files / 378 tests passed**, strict TypeScript/production build passed. Desktop Brave at isolated origin `5200`: created/drew in Draw, switched to Animate with artwork intact, added a frame, toggled Flipbook/Clips with shared two-frame length, verified Draw default Canvas independently, drew in Draw and undid in Animate, restored Animate/Clips after autosave/reload, hid all four control groups and recovered them with Reset, opened More tools. Narrow layout inspected at about 354×767 CSS pixels; footer scrolls horizontally, handles remain accessible. iPad/Pencil/physical gestures remain unverified. The 31 pixel checks mentioned below were run during the earlier rendering step, not rerun for this UI step.

The asset workflow that followed this layout step is recorded above. The earlier next-task sections below describe planning history and must be read in light of the completed steps.

### Earlier rendering baseline

Latest implementation: **Draw rendering consistency**, uncommitted on local `main` at `f4dc28f`. **47 test files / 375 tests passed**, **31 real-browser pixel checks passed**, strict TypeScript and production build passed. The [2026-10-22 review](docs/REVIEW-2026-10-22.md) describes the pre-fix state; its rendering defects are addressed by this working-tree change. The older sections below are historical; their feature gaps, version/schema wording and UI descriptions may be superseded. Verify source and Git diff before acting on them.

### What exists and what is planned

- Current screens: **Story, Draw (with flipbook), Timing, Motion, Share**. Interface levels: **Focus, Simple, Full**.
- Clipping masks, alpha lock, paint stacks, layer masks, effect stacks, GIF/PSD/OpenRaster import, brush collections, Reference, notes and newer Share formats are implemented. The old statement that clipping/effects are unbuilt is obsolete.
- File schema is **3** (`src/io/schema.ts`); IndexedDB version is **2**. There are more optional layer fields than the old `cel`/`w` summary describes.
- A separate **Animate** workspace, dockable **Advanced** interface and canvas-based rail remain proposals in [next-phase.md](docs/next-phase.md). That document is planning context, not an instruction to implement everything.

### Completed rendering step (2026-10-22, Codex)

**Draw now uses the shared layer compositor.** `src/app.ts` supplies resident live raster/vector/predicted sources to `drawEditingLayer` in `src/view/composite.ts`. Layer opacity/blend and part visibility/opacity apply during drawing; the hidden 25% floor is removed. Raster/vector ink is flattened before plane opacity, and the whole layer is flattened before layer opacity/blend. Clipping-group opacity is applied once. Effects remain off on the active drawing while painting; mask editing keeps its red guide tint. Loading thumbnails retain their placeholder path through the layer compositor.

Changed application files: `src/app.ts`, `src/view/composite.ts`, `src/ui/manualtext.ts` (manual and UPDATES). New repeatable browser checks: `tests/rendering.html`, `tests/README.md`, `src/view/composite.browser.ts`. No schema, timing, dependency or layout changes.

Verification: `npm test` (375), `npm run build`, `git diff --check`; real Canvas 2D fixture (31 checks) in desktop Brave at `http://127.0.0.1:5199/tests/rendering.html`. Fixtures cover zero/partial/full layer and plane opacity, raster/vector overlap, hidden layers/parts, live preview sources, parked thumbnail opacity, masks/live mask replacement, normal/multiply/screen/overlay against export, and clipping. The production app at isolated origin `5198` was checked for zero layer/Line opacity, opacity Undo/Redo, Line opacity persistence after autosave/reload, and a new mouse stroke at 50% layer opacity. An immediate reload before the autosave debounce elapsed did not preserve an earlier test edit; persistence verification allowed autosave to finish. Physical Pencil, iPad memory, and full gesture behavior remain unverified.

### Immediate next task

Follow **Latest direction (2026-10-22)** in `docs/next-phase.md`: Draw is a complete painting/asset workspace with an optional flipbook; Animate also keeps a drawing canvas/tools, simplified, with Flipbook/Clips views. Controls must collapse into recoverable edge trays without clutter or losing the view. The next product slice is Draw → New asset → Add in Animate → Edit in Draw → Return, with local editable assets and no manual export/import round trip. Cleanup and layout changes support that slice. This is updated planning, not an implemented mode split; source still has the current five screens. Auto Paint is noted for later. Preserve internal `line`/`fill` identifiers and existing archives. Do not reimplement the fixed opacity path. The rail rewrite remains future performance work, not a prerequisite to this first asset workflow.

### Collaboration and verification status

- The initial review changed no application source and added `docs/REVIEW-2026-10-22.md`. Coordination added `CLAUDE.md` and updated `AGENTS.md` and this handoff. The subsequent rendering implementation changes are listed above. All remain uncommitted at handoff; do not mistake the initial review's no-source-change statement for the current working tree.
- `docs/next-phase.md` was already modified before the review; preserve that edit. Local Git reported three documentation commits ahead of its recorded `origin/main`. No fetch, commit, push or live deployment check was performed. Recheck Git status because another collaborator may have continued.
- Let one assistant own a given source file/change at a time. Before editing, inspect the latest diff; after completing work, record the actual result here so the next assistant does not repeat or overwrite it. If active work overlaps, agree on ownership before editing the same files.
- Desktop browser checks covered drawing, undo/redo, frame insertion, exposure retiming, shared Motion length, Story captions, reload persistence, Play/Pause, opening Brushes/Reference and GIF generation to Ready. GIF download validation did not finish. See the review for exact scope.
- iPad/Pencil, real-file import coverage, full standalone archive round trips, audio/video outputs and Blender remain verification gaps. Unit tests do not establish these results.
- During rendering verification, **5198** served the production preview and **5199** served the development browser fixture. **5197** was not running. Run the app from this directory and check actual running servers/Vite output rather than assuming a leftover tab is live. Use an isolated origin for tests; do not clear a user's library.

## Historical state (2026-10-17)

`main` at `8f505f5` is pushed (GitHub Pages deploys on push). 309 tests and the production build pass. Everything below was checked by script (and screenshots) in desktop Chromium only: **none of it has been tried on an iPad / Apple Pencil yet**, which is the next real test.

Built 2026-10-16 (Claude, one long session), newest last:

- **Audio scrub** (`audio.ts` `audition`): optional, off by default, Audio lane / sound card checkbox.
- **Selection transform** (`core/selxform.ts`, `App.beginTransform/applyTransform`): Fill > Select area, then Transform; drag to move, corner handles scale, knob rotates (15° snap), flips; Line + Fill pixels and whole vector strokes inside; one undo step that also restores the selection. Lasso has marching ants.
- **Tracks sheet** (`ui/sheet.ts`, Draw and Time): one handle bar (Play, time, + Audio) above the timeline; tap steps closed / half / full, drag resizes, swipe down closes; sounds are rows under the layers (`AudioTracks.railRows`) with a floating settings card. Board and Motion keep the old splitter and Audio lane.
- **Bubbles** (`ui/bubbles.ts`): mode bubbles (Flip, Draw, Animate = Time, Move = Motion, Story = Board), tool bubbles for the mode, a one-row context bar per tool, and a level button (clean / simple / full; simple is the default, full = the classic layout). Simple hides the top bar and focus bar; the timeline row keeps essentials as icons with More (`data-extra` in `ui/strip.ts`).
- **Flip** (`ui/flipmode.ts`): beginner mode; drawing bubbles row, + for a fresh page (`App.flipToBlank`, also the Flipbook button), Play, Fit; nudge to the timeline after six drawings.
- **Linked art layers** (`core/cellink.ts`, layer field `cel`): drawings layers in one cel group keep the same cels and timing; `editTimeline` syncs them in one undo step. Layers bubble: chips in Flip, **layer cards** in Draw (`ui/layercards.ts`, Procreate style: thumbnails, tap / tap again for options, hold-drag to reorder).
- **Vector point editing** (`core/vecedit.ts`, `App.enterPointEdit`): anchors found once (`anchorsFor` cache), drag with smooth falloff or straight spans, hold a point to toggle straight / curved, Bezier handles on curved points, snap onto other lines' points and join ends (toggles), width for whole line / this point / chosen sections (per-point `w` multiplier on `StrokePoint`, saved optionally). Points appear after a QuickShape hold (toggle).
- **Transparent GIF** option (`io/gif.ts` `GIF_CLEAR`, disposal 2).
- **Fixes:** Flip Pause (no per-frame rebuild), Safari page zoom from scroll containers (`touch-action`, viewport snap-back in `main.ts`), notices deduplicated.

Built 2026-10-17 (later): media as tracks (`ui/media.ts`, `App.importPicture/importMovie`: pictures = still object layers, movies = one drawing per frame up to 12 s plus their sound; all from frame 1), sound clips drag / trim on the timeline and in Motion (`AudioTracks.clipBlock`), Adjust (`core/adjust.ts`: HSB and Gaussian blur on the current drawing, `App.beginAdjust/applyAdjust`), Symmetry (`StrokeRecord.sym`, mirrored dabs in `brush/raster.ts`, vector copies), Reference layer (layer field `reference`), `App.refit()` (layout changes keep a zoomed / turned view), one-row timeline bar on the simple screen (`Strip.navRow` moved into the tracks bar). Brush import (`io/brushimport.ts`: bplist / XML plist + NSKeyedArchiver, Procreate `.brushset`/`.brush` Shape.png + name/size/opacity/spacing/jitter/pressure, ABR v1/v2/v6+ sampled tips; Brushes > Import): tested only on generated fixtures, no real Procreate or Photoshop files yet.

Built 2026-10-17 (latest): Procreate selection modes and actions (`App.takeSelection/autoSelect/copyArt/pasteArt/...`, exact masks via `spatial.exact` and `transformMask`), freeform transform (`XParams.sx/sy`), named palettes + harmony (`core/color.ts harmony/paletteFromPixels`), drawing guides + assisted drawing (`core/guides.ts`), layer masks (layer field `mask`, drawn in `composite.ts drawLayer`, edited via `App.editingMask`), layer groups in the cards (`LayerCards.children/groupWithBelow`, outer-shot context in Draw), onion Keys-only fallback (`App.onionNeighbors`). Layer fields added: `reference`, `mask` (both optional).

File format: two optional fields only (`cel` on layers, `w` on points); older files open unchanged, older builds ignore them.

Linked layers stay in step for every edit: Draw / Time / Flip via `App.editTimeline`, everything else (Motion trims and moves, ripples) via `syncCelGroups` in `CompEditor.push`. A duplicated cel copies its partners' drawings (`Project.copiedFrom`, session only; a parked partner falls back to blank). Known gaps: GIF transparency is 1-bit; nothing verified on iPad. Still not built: clipping masks, effect stacks, warp, free-arrangement timeline, general media/video import, Rust desktop.

**Design studies (evidence and proposals, not features):** [layers/masks/UI](docs/LAYERS-MASKS-AND-UI-STUDY.md), [selection/transform](docs/SELECTION-TRANSFORM-MANUAL-STUDY.md), [manuals vs source](docs/MANUAL-TO-SOURCE-COMPARISON.md), [timeline/media/UI direction](docs/TIMELINE-AND-MEDIA-DIRECTION.md), [art effects and clipping](docs/ART-EFFECTS-DIRECTION.md), [brush import](docs/NATIVE-BRUSH-IMPORT-DIRECTION.md). The free-timeline request needs concrete changes confirmed before structural work; do not treat the standalone timeline mockup as a spec.

Prepared 2026-10-14; updated 2026-10-17 so another assistant can continue without a previous chat.

## Start here

- Workspace: `E:\2026\Dev\Apps\2Dope`.
- **Application and Git root:** `E:\2026\Dev\Apps\2Dope\beta`.
- `reference/` beside it contains separate Craft reference projects, not the app or its dependencies.
- Read `AGENTS.md`, then `ARCHITECTURE.md`, then relevant source. Preserve user/Claude edits visible in `git status`.
- Current source, tests, and manual are stronger evidence of present behavior than an early milestone paragraph or a proposed feature study.

## Checked baseline

The repository began this review clean on `main`, at `92bb08fcd42dc30dd5727cdcdf6593fab995b4f0` (2026-10-14): Motion end trims keep the board and animation in step. Upstream status was local Git information; the remote/deployed site was not checked.

Recent preceding work includes two-way Board/Draw timing, adding/retiming/deleting the last panel, deleting the first panel without shifting animation before frame 0, repaired older files, Time's frame bar, Draw's Split/touch selection, and finishing interrupted pointer strokes.

Environment: Node `v24.20.0`, npm `11.19.0`, existing installed dependencies and lockfile. CI uses Node 22. No dependency upgrades or clean reinstall were performed.

| Check on 2026-10-14 | Result |
|---|---|
| `npm test` | 21 files, **212 tests passed**. |
| Initial `npm run build` | Failed on an unescaped apostrophe in `src/ui/manualtext.ts`, in the update note about a layer's end. |
| Build after the one-line fix | **Passed:** strict TypeScript check and Vite production output. |
| Production browser smoke check | **Passed** in desktop Chrome on a separate loopback origin; scope below. |

The sole application-code change in this review escapes that apostrophe. The displayed sentence is unchanged. Other changes document the current implementation and maintenance workflow. This baseline describes the local review; consult Git history and GitHub Actions for subsequent commits and deployment status.

## Run and check

Run from the application root in PowerShell:

```powershell
Set-Location 'E:\2026\Dev\Apps\2Dope\beta'
git status --short --branch
npm test
npm run build
```

For a clean install use `npm ci`. For editing use `npm run dev`: port **5180** by default, but read Vite's printed URL if busy. Claude's `.claude/launch.json` explicitly uses **5181** with `--strictPort`.

To check a production build on a separate origin:

```powershell
npm exec -- vite preview --host 127.0.0.1 --port 5182 --strictPort
```

`npm run dev:lan` enables the HTTPS LAN configuration for device testing; it is a development server. `dist/` and `node_modules/` are ignored/generated. Edit source and rebuild. Pushing `main` triggers `.github/workflows/pages.yml`: Node 22, `npm ci`, tests, build, GitHub Pages deployment.

Browser libraries are tied to their origin. `localhost`, `127.0.0.1`, different ports, and the deployed site have separate libraries. Keep the same origin to see an existing library, or transfer an exported `.2dope` file. Avoid clearing site storage while investigating a missing project.

## Current product

A browser-based 2D drawing, animation, and storyboard app intended for pen/touch as well as desktop:

- **Board:** guide-layer panels, captions, duration, animatic playback, Animate this shot, PDF or PNG/CSV export.
- **Draw:** raster/vector pen, eraser, fill, Line/Fill planes, brush dynamics/smoothing, QuickShape, layers, flipbook, onion skin, Quick Animate.
- **Time:** X-sheet, holds, drawing selection/order/roles/notes, frame bar, shared time formats and ripple timing.
- **Motion:** layers, transforms, keyframes/easing, parenting/nulls/camera, precomps, pins/overrides and playback modes.
- **Projects:** local IndexedDB library, folders, autosave, versions, standalone `.2dope` files, Lite/device limits and parked drawings.
- **Output/help:** PNG frames and sequence passes, storyboard PDF/images/CSV, Blender package/importer, searchable student manual and update notes.

No application backend is present. Raster planes are saved as pixels; vector strokes retain point data. Do not assume raster stroke replay/editing survives a file round trip.

## Where to make a change

| Request | Start with | Related checks |
|---|---|---|
| Pen feel, smoothing, QuickShape, interrupted strokes | `src/app.ts`, `src/brush/`, `src/core/brush.ts`, `src/core/quickshape.ts` | Core/ink/stabilize/QuickShape tests; real pen and cancellation gestures. |
| Fill/eraser, Line/Fill | `src/fill/fill.ts`, `src/app.ts`, `src/core/vectorcut.ts`, `src/view/composite.ts` | Fill tests; canvas output, undo, saved images. |
| Exposure, Board sync, insert/delete/hold/ripple | `src/core/timeline.ts`, `src/core/ripple.ts`, `src/app.ts`, `src/compedit.ts` | Timeline/ripple/editor tests; the same edit across workspaces and undo/redo. |
| Board cards/captions/export | `src/ui/board.ts`, `src/ui/boardexport.ts`, `src/io/storyboard*.ts`, `src/io/pdf.ts` | Storyboard tests; actual exported PDF/images/CSV. |
| Layers, keys, camera, precomps | `src/compedit.ts`, `src/core/comp.ts`, `src/core/anim.ts`, `src/ui/motion.ts` | Editor/comp/anim tests; composed playback/export. |
| Save/open, versions, gallery, file format | `src/ui/files.ts`, `src/ui/gallery.ts`, `src/io/{schema,projectio,persist,autosave,zip}.ts` | IO/autosave tests; browser reload and standalone file round trip. |
| Memory/older devices | `src/core/residency.ts`, `src/core/device.ts`, `src/view/` | Residency/device tests; target-device stress testing. |
| Blender | `src/io/blender.ts`, `src/io/blenderpack.ts`, `blender/2dope_import.py` | Planning tests; import/render in intended Blender version. |
| Layout/controls/manual | `index.html`, `src/main.ts`, `src/style.css`, relevant `src/ui/` | Build and desktop/touch-width flows; update the manual when behavior changes. |
| Draw/Time timeline rails | `src/ui/rails.ts`, `src/ui/strip.ts` | Rows follow comp order and the strip's cell width; the editable row keeps the strip's own pointer logic. |
| Audio | `src/core/audio.ts`, `src/audio.ts`, `src/io/sound*.ts`, `src/ui/audiotracks.ts`, `src/io/exportvideo.ts` | Audio tests; import, playback sync, save/reload, video export with sound. |

## Invariants

1. One document/clock across workspaces. Layer keys/exposures use layer time; start/in/out use comp time. Reuse timing/content-frame functions.
2. One undo step per gesture. Preview, cancel, undo, and redo must preserve document state and autosave/render notifications.
3. Parked drawings have no live pixels. Use residency for canvas access, declare pixel-dependent command drawings, and preserve assets needed by history.
4. Fill stays under ink. Guide boards stay out of final export unless included. Check both plain-flipbook and compositor export paths when relevant.
5. File schema 2 and IndexedDB version 2 are separate. Breaking file changes need migration; standalone archives need every referenced asset's bytes.
6. Brush randomness stays seeded, predicted points are never committed, and interrupted pointers must finish/cancel their stroke so frame changes cannot stay blocked.
7. Device limits, touch workflows, and the student manual are product requirements.

## Browser verification scope

Desktop Chrome, production build at `http://127.0.0.1:5182/`, a new `Codex maintenance check` project at 1280-by-720 and 12 fps:

- First-run New project dialog rendered and created the named project.
- Added a frame (1 -> 2), undid it (2 -> 1), redid it (1 -> 2).
- Board, Time, and Motion controls rendered; Time/Motion showed the same two-frame shot.
- What's new rendered the repaired sentence correctly.
- Reload reopened the named project and both frames from browser storage.
- A mouse stroke drew on the canvas; after autosave and reload, it visibly reopened intact.
- No warning/error console entries were captured during the checks. A screenshot was saved outside the repository in this chat's visualization directory.

This is a smoke check, not full regression coverage. Tests include mock App/canvas/storage components. `docs/test-report-m1.md` and `docs/blender.md` describe historical checks, not new device/Blender verification from this review.

## Open work and evidence gaps

- **Video export** exists (Quick Share MP4/WebM with audio, plus looping GIF). A higher-quality transparent export is still queued in `DECISIONS.md`; confirm formats and devices before building it.
- **Latest timing fixes need repeatable browser regression coverage:** both ends of layers, two-way board/animation synchronization, undo/redo. Pure timeline/ripple tests include first-panel deletion, but there is no checked-in end-to-end browser runner.
- **Real iPad/Apple Pencil checks remain necessary:** pressure/tilt, palm rejection, touch conflicts, playback feel, long-project memory. Desktop/mocked tests do not establish these results.
- **Blender import/render was not rerun.** `docs/blender.md` records earlier checks and simplifications: non-normal blend modes, animated anchors, nested cameras, combined Line/Fill images.
- **PDF Unicode is limited:** the custom PDF writer uses WinAnsi; unsupported characters become `?`. PNG/CSV export preserves text.
- **Version labels:** `package.json` and `APP_VERSION` in `src/io/projectio.ts` both say `0.0.2` (reconciled 2026-10-15). Neither is the schema version.
- **Large coordinating files:** `app.ts`, `compedit.ts`, `ui/motion.ts`. Keep fixes narrow; preserve command, event, timing, and residency boundaries during any later extraction.
- **Historical future-tense documentation remains:** README milestone prose, format examples, the old test report, feature studies. Earlier memory findings were followed by residency work and should not automatically be treated as current defects.

Proposals in `docs/feature-deconstruction/` (audio, shot organization, masks/effects, drawing assists and more) are design studies. They do not establish a new implementation request or current feature support.

## Next-session prompt

> Continue 2Dope in `E:\2026\Dev\Apps\2Dope\beta`. Read AGENTS.md, HANDOFF.md and ARCHITECTURE.md, check git status for concurrent changes, then implement the requested adjustment within the existing architecture. Preserve shared timing, undo/autosave, residency, device limits and file compatibility. Run relevant tests and the production build, verify the affected browser flow, and distinguish new verification from historical reports.
