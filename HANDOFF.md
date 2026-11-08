# 2Dope maintenance handoff

## Current state (2026-11-08) — read this first

### Tween ease, tween onion ghosts, routes from existing lines (2026-11-08)

- **Tween ease.** The optional `Exposure.ease` (`'easeIn' | 'easeOut' | 'easeInOut'`, part of format 9)
  shapes `vectorTweenAt`'s `t` through `progress(easingSides(e))`, so playback, scrubbing, Motion and
  exports agree. The frame menu shows "Tween to the next pose" chips (Even, Slow start, Slow end, Both),
  with the current choice highlighted, only on a tweening layer. `App.setTweenEase` acts on the selected
  exposures in one Undo step. Schema validation rejects unknown values, and reader 9 is required when one is set.
- **Tween onion ghosts.** `App.drawTweenGhosts` draws a faint in-between for each frame of the
  current pose's hold (at most 24) when onion skin is on. It is hidden while drawing, editing points or transforming.
- **Route from an existing line.** In draw-a-path mode, a tap (under 8 screen px of travel) finds the nearest
  pen line within 18 screen px on another visible, non-guide drawing layer at this frame (`CompEditor.lineAt`)
  and uses it, in stage space, as the route. An empty tap explains itself and keeps the mode open.
- The iPad checklist has a new Animate along a path section.

Checks: vectortween unit tests passed (the ease timing and saving test is new). commandrow passed 65,
covering onion ghosts appearing only on a tweening layer, the Slow start chip, one Undo, and Undo back to even.
precision passed 19 and precision-responsive passed 57, covering a tapped line as the route and the empty-tap notice.
Final run, with nothing else using the test server: 763+ unit tests and the build passed, and **71 of 71** browser fixtures passed. An earlier run
failed commandrow only because a second commandrow ran at the same time and shared its browser storage. Do not run fixtures in parallel on
one origin. The path, ease and onion work is committed and deployed (see git log). Physical iPad testing has not been done.

### Animate along a path, even speed, orient (2026-11-08, format 9)

- **Animate along a path…** (Motion → Animation): `CompEditor.setDrawingPath` arms a canvas mode.
  The next drag records a line in stage space (`pathStroke`, drawn dashed by `view/overlay.ts`).
  Releasing calls `onPathDrawn`, and Motion then asks `askPathOptions` (`ui/dialogs.ts`: travel time
  in seconds, Even speed default on, Turn to face the way it travels default off).
  `animateAlongPath` maps the line through the inverse `pathMatrix` into position space and runs
  `core/motionpath.ts` `pathProp`. That simplifies the line (≤60 keys and ≤ frames + 1), places keys
  by distance, uses Catmull-Rom handles with corners over 50° kept sharp and closes loops smoothly.
  The result replaces the position keys and sets or clears `transform.orient` in one Undo step. Esc
  cancels. Status text guides the student.
- **Even speed** (`Prop.even`, `core/anim.ts` `evenAt`). Steady arc-length travel from the first key
  to the last, eased by the first key's out side and the last key's in side. Inner keys shape the path but not its timing.
  Toggle with Animation → Even speed on path (`setEvenSpeed`).
- **Orient along path** (`Transform.orient`, `rotationAt` in `core/comp.ts`). Adds `travelAngle`
  (0° = facing right) to the rotation in `localMatrix`, so every renderer and export agrees. Toggle with
  Animation → Turn along path (`setOrient`). Blender bakes oriented rotation and even-speed position
  per frame.
- **Format 9** (`io/schema.ts`, `docs/project-format.md`): optional `even` (2D properties only) and
  `orient`. Reader 9 is required only when either is used.
- Manual and `UPDATES` updated.

Checks: 90 unit test files passed, including the new `core/motionpath.test.ts` (key placement, steady
speed, loop closing, orientation, save/load and reader gate). The build passed. `precision` (18) and
`precision-responsive` (54) passed. The new check draws a path through the editor's canvas gesture
API, fills in the real dialog, and verifies keys, one Undo, steady speed, turning, reader 9 on save,
identical values after reopening, the Blender bake and Esc cancel. The full suite passed 71 of 71 (see above). Physical
iPad drawing of a path has not been tested.

### Follow-up: scrub tweens, virtual Flipbook, Story/Motion split, cleanup (2026-11-08)

- **Scrub preview.** `App.showsTween` shows vector in-betweens while playing, scrubbing and stepping.
  Drawing, Edit points, Transform and mask painting show the pose being edited. Residency loads
  the next pose under the same rule. commandrow checks that an in-between frame renders differently
  from the untweened render.
- **Virtual Flipbook strip** (`ui/flipmode.ts`). Each track keeps its exposures, and only the cels and
  ruler numbers within half a screen of the view are DOM elements (`renderWindow`, run on scroll and
  zoom). `markCels` touches only those cels. Thumbnails are a data URL cached per drawing and
  `thumbRev` (`<img>`, not a canvas per cel). `.flip-cells`/`.flip-ruler` use containment.
  railperf (1,000 frames × 8 tracks): build 10–14 ms (it was ~500), pinch zoom step 14–19 ms
  (it was ~840, then ~70). Headless software rendering varies, so the hard check is a 30 ms guard
  plus "fewer than 600 cels exist".
- **Story and Motion load lazily** (`main.ts`). Proxies record Motion hooks (`motion.set`) and
  Story calls, build the panel when its workspace opens, and preload both at idle
  (`requestIdleCallback`, 1.5 s timeout). Main chunk 921 → 738 kB (gzip 293 → 234 kB; 405 kB on 2026-11-07).
- **Cleanup.** The Transform extraction left unused imports in `app.ts`. They are removed along with
  the dead `pick` in `io/brushimport.ts` and five unused fixture imports. `tsconfig.json` now has
  `noUnusedLocals`, so the build fails on dead imports. Motion's status reads "No layer selected" instead of
  "0 layers · 0 keys". workspacecontrols waits for the lazily loaded Motion toolbar.
- **iPad checklist**: `docs/testing/ipad-checklist.md`. It still needs a real device; this was not tested on one.

Checks: 758 unit tests passed (1 skipped) and the build passed. Targeted fixtures passed: railperf, flipbooksource,
painting layout/workflow, playback range (both), workspace layout (both), workspacefixes, workspacecontrols,
storyui, storyexport, motionassets and commandrow. The final full browser suite passed **71 of 71**. A manual check in the
Browser pane opened Motion and Story through the real entry with no console errors.

### Cleanup, faster start, Next pose and cycles (2026-11-08)

- **Research docs** are committed (`52327c5`); `.rea-work/` (25 MB of REA scratch output) is ignored.
- **app.ts split.** Selection Transform's geometry, drag maths, preview painting and handle drawing
  moved to `src/drawtransform.ts`; art Copy/Cut/Paste pixel work moved to `src/artclip.ts`. App
  keeps the session, History steps and notices, and its public Transform API is unchanged.
- **Code splitting.** `main.ts` loads Share, video export, hand-in bundle, symbols, vector objects,
  layout, presets, camera moves, titles, Story Present and the Reference window on first use
  (`lazy()` retries after a failed load and reports it as a notice). Main chunk 1,251 → 921 kB
  (gzip 405 → 293 kB). The chunk warning remains; the rest is the editor core.
- **Flipbook zoom** no longer rebuilds the strip. Cels are placed by `--s`/`--n` × `--flip-cell`
  (`style.css`), and `FlipMode.relayout()` redoes only the ruler and sizes. The `railperf` fixture
  (1,000 frames × 8 tracks, 4,000 thumbnails; drawings shrunk to 1 px so the test measures the
  strip) reports a zoom median of 62–90 ms here (it was about 840 ms). Its threshold is a 150 ms regression guard. 60 fps zoom
  needs a virtualized strip (not built).
- **Next pose** (Animate, Vector tool, `paint.nextpose`): copies the drawing with its line ids,
  holds a one-frame pose for `App.POSE_HOLD` (6) frames, turns on `tweenVectors` and opens Edit points
  on the copy. It is one Undo step. Motion → Layer → **Tween vector lines** is now an on/off toggle
  (previously Remove only).
- **Auto-matched tweens** (`core/vectortween.ts`): when two poses share no line ids, pen lines pair
  nearest-centre first, a reversed partner is flipped, and both are resampled by arc length to
  the same point count. Poses that share ids behave exactly as before, so existing projects are unchanged. There is no schema change.
- **Repeat as a cycle** (frame menu ×2/×3/×4/To end, `timeline.repeatCycle`, `App.repeatSelection`):
  the repeats show the same drawings. To end cuts the last repeat short. Each is one Undo step.
- **Layer groups**: not built. They already exist as Draw Layers → Group (a folder backed by a
  nested comp), so the brief's optional `group` id would duplicate them.
- Manual and `UPDATES` were updated.

Checks: 758 unit tests passed (1 skipped) and the production build passed. Fixtures run this pass:
railperf, flipbooksource, commandrow (60, including Next pose, one Undo step and the interpolated middle),
and importeffects (25, including the Tween vector lines toggle).

Three fixtures that already failed on `d39288a` were fixed in their test code, with no app change:
`paintingplanes` now opens Smudge from More tools, where the classroom pass moved it. In `precision` and
`precision-responsive`, the "asset dropped curves" check compared `readArtwork`'s schema with 7. Reading
always migrates to the current reader, and the 2026-11-05 temporal-effects work raised that to 8. The check
now confirms that the reopened artwork keeps its curved position keys and still needs only reader 7.
After this, 758 unit tests passed (1 skipped), the build passed and **all 71 browser fixtures passed**. Physical
iPad/Pencil remain unverified. Nothing beyond `52327c5` is committed or pushed.

### Classroom interface

The shared mode bar keeps icon labels in compact layouts. More tools groups named icons by
task and respects the active student profile in Draw and Animate. Untouched toolbars get the
revised defaults. Draw moves Smudge into More tools and Animate pins Transform next to Select.
Transform modes use distinct icons with text. Motion groups clipboard actions under Import,
alignment under Layer, and presets under Animation. Share puts four common exports first
and puts additional formats under More formats.

Animate and Motion no longer offer vector pose setup. Existing project tweens still render.
Motion's Layer menu offers Remove vector tweening on a layer that already uses it.

The production build, 754 unit tests (one skipped), and 12 targeted Chromium fixtures passed.
Responsive fixtures covered phones, tablets and landscape. Physical iPad testing is pending.

### Transform precision, vector poses and temporal effects

Draw and Animate keep the four Transform modes and Apply/Cancel at the top of the options row.
`ui/bubbles.ts` opens exact Width, Height and Angle, adjustable snap distance, sampling, flips,
and reset under Transform options. `app.ts` uses drawing-space dimensions before rotation and
draws a size or angle badge during a drag. Uniform preserves the current proportions.

In Animate, choose Vector on a drawing layer, enable Tween vector points and extend the first
drawing's hold. Duplicate vector pose copies its stroke IDs. Use Edit points or Vector objects
on the copy. Playback and Motion interpolate the geometry of matching brush strokes or
compatible imported paths. Unmatched geometry and raster paint stay held. Both original
drawings stay editable. Motion's Selected layer menu also toggles the layer setting.

Echo and Motion blur are whole-layer effects on drawings and clip instances. Echo samples
earlier content and the poses it occupied. Motion blur accumulates the current artwork over
subframe transforms, including parents. They run after spatial effects. Clip source
adjustments render inside the sampled artwork. Historical samples skip further temporal
history to keep nested rendering bounded. `core/comp.ts` shares dependencies and frame
signatures with residency and exports. The Blender handoff bakes temporal effects in
composition space and vector tweens into rendered drawings. Projects and artwork archives
with these features require reader 8. Unrelated saves keep their previous minimum versions.

Checks covered exact dimensions and a pen stroke duplicated and edited through the Animate
UI. Motion, Share preview and the downloaded PNG agreed for a nested clip with an active
adjustment and both temporal effects, and for a vector in-between. The fixtures also checked
project reopen, Blender bake planning and rendered temporal bake pixels. The production build,
754 unit tests (one skipped) and nine targeted Chromium fixtures passed. Physical iPad and
Apple Pencil validation is still pending.

### Draw and Animate Transform (2026-11-05)

The toolbar starts Transform on the current selection or on the artwork bounds of the current
drawing. Switching drawing tools applies the edit in one History step and returns directly to
painting. Tapping Transform again or pressing Enter also applies. Escape and Cancel restore
the starting pixels. A temporary selection made from artwork bounds ends with the transform.

The options row exposes Uniform, Freeform, Distort and Warp. Opposite handles anchor scaling.
Distort uses a four-corner perspective transform. Warp uses a nine-point mesh and rejects folded
cells. Two fingers navigate the canvas while Transform is active. Canvas-edge and center snapping
shows guides, and Magnetics constrains movement to one axis. The row also offers interpolation,
scale steps, rotation, mirroring, Fit and Reset. The arrow keys nudge by one document pixel,
or ten with Shift. Warp and Distort rasterize affected vectors to the ink plane when applied.
The affine modes keep vector paths editable. Undo restores the original pixels and vectors.
The cage and preview controls are session state with no project-format change.

The importeffects fixture compares the real Motion canvas, Share preview and downloaded PNG with
a blurred group and an active partial-opacity adjustment in its source. The production build
passed with the existing chunk warning. Unit tests passed 751 with one skipped. Browser checks
covered compact and Full Transform controls, actual Freeform and Distort handles, the Warp center,
Cancel, one-step Undo and synthetic pinch navigation. Physical iPad gestures and native Procreate
clipboard handoff still need device verification.

### Clipboard, imported assets and editable clips (2026-11-05)

`ui/clipboard.ts` handles browser Copy, Cut and Paste events. It respects text fields and
routes canvas selections, timeline frames and Motion layers separately. Native timeline Paste
makes independent drawings. Paste (same drawings) is still in the frame menu. Copy Visible
renders a PNG using the composition renderer and drawing residency pins. External files arrive
through Paste, drop, or Assets → Import and use the media and artwork decoders.

`app.ts`, `ui/media.ts`, `ui/audiotracks.ts` and `core/assets.ts` commit the editable source graph
and its first placement at the playhead in one History step. The project shelf supports pictures,
SVG/EPS, original GIF frames, PSD/OpenRaster, sound, short movies and compatible .2dope artwork
archives. GIF holds use shot FPS. Movies retain decodable sound and use up to 12 seconds of
footage. Clipboard formats depend on the sending app and browser. Movie decode, asset size,
duration and project limits apply. Existing file import commands still work.

`ui/artworkassets.ts` and `ui/motion.ts` expose Remove from Shot and Delete Asset. Source deletion
requires no remaining placements and reports the compositions that use it. Make Clip replaces
adjacent tracks, protecting dependencies across the clip boundary. Save as Asset copies the
editable graph and drawing data without changing the shot. Motion's Selected layer menu brings
Transform, Anchor, Effects, Graph, and Edit Clip together. Edit Clip and a double-click on its
timeline bar open the source. The breadcrumb restores the original shot frame and selection.
Once, Loop and Hold Last Frame use existing timeline controls and no project schema bump.

Checks: 749 unit tests passed, one skipped, and the production build passed with the existing
chunk warning. The main-entry clipboardassets fixture passed all 10 checks, including PNG alpha,
GIF holds, WAV and generated WebM, independent frame copy, PNG clipboard output, dependency-safe
deletion, double-click and return, and a cross-FPS .2dope clip import. The surrounding workspace,
media, asset library, painting, Flipbook, anchor and precision fixtures passed in targeted runs.
The clipboard fixture supplies browser clipboard events and intercepts the outgoing PNG write.
Native Procreate/iPad clipboard permissions and format handoff remain unverified.

### Docked Flipbook divider (2026-11-05)

`ui/flipmode.ts` now uses the timeline's `ui/splitter.ts` pointer and keyboard resizing for the
Flipbook track viewport. The Flipbook stays at the bottom. Drag or use Up/Down to resize.
Double-click restores the automatic height. The chosen height is a device preference shared by
Draw and Animate. Old floating coordinates are ignored. Draw retains Canvas/Flipbook and Animate
retains Flipbook/Clips. `style.css` bounds the panel by the stage height and the existing resize
observer keeps the active track visible and reserves the measured height for canvas fitting.
The manual and Updates document the divider.

Checks: 749 unit tests passed, 1 skipped, and the production build passed with the existing
chunk warning. Seven Chromium fixtures passed on a separate origin: flipbooksource (30),
workspacelayout-responsive (88), workspacecontrols (4), paintinglayout (16), paintingworkflow (21),
playbackrange-responsive (50), and artworkworkflow (31). The Flipbook fixture verifies drag,
keyboard resize, height persistence, default reset, and ignoring an old floating preference.
Physical touch and Safari remain unverified.

### Workspace controls and Motion graph dock (2026-11-05)

Motion groups its toolbar into creation/import, graph/canvas tools, and layer/animation/view menus.
`ui/motion.ts`, `ui/anchors.ts`, `ui/icons.ts` and `style.css` give those actions distinct icons and
keep Graph reachable on the first toolbar screen at phone width. `ui/contextmenu.ts` supports
optional icons alongside menu labels. `ui/paintingworkspace.ts` and `ui/bubbles.ts` add view, paint
target and layer action icons. At 360 px and below the painting view buttons use compact 44 px
targets so Tool settings and Workspace stay reachable. `ui/board.ts` adds icons to Story views,
panel actions and dialogue editing. The manual and Updates describe the controls.

`ui/graph.ts` and `main.ts` dock the selected layer’s graph beside the canvas and timeline at
1100 × 650 and up. The dock shows animated transform curves with a common layer-time playhead and
independent value scales. Timing and value edits remain per property and use a detached draft.
Apply uses the existing stale-property guard and one Undo. Reset reloads the saved property.
Switching property requires applying or resetting pending edits. Leaving Motion, changing shots,
or removing the target closes the dock. Compact windows open the modal editor.

Checks: 749 unit tests passed, 1 skipped, production build passed with the existing chunk warning.
All 10 targeted Chromium fixtures passed on a separate origin (369 checks across desktop, 320 px,
phone, tablet and landscape). The main-entry `workspacecontrols` fixture covers dock geometry,
timeline sync, draft retention, Undo, workspace icon labels and compact dialog fallback. Physical
touch/Pencil and Safari remain unverified.

### Whole Story desk follow-up (2026-11-05)

User confirmed they were seeing the new `6ba16da` UI and still wanted a more substantial change.
A fresh published browser session verified the prior build was live on `2dope.xyz`; this was not
assumed to be a cache issue. The follow-up changes the overall Story workspace rather than only
its writing forms. Existing untracked research/railperf experiments remain excluded.

At >=1100px wide and >=650px tall, `style.css` puts the canvas and Story editor side by side,
with a shared top navigation strip and a full-height right desk. Audio spans the bottom; the old
height splitter is hidden only in this wide desk. Smaller windows retain the stacked/splitter
layout. Focus, hidden UI, presentation, folded timeline and Share are excluded from desk geometry.
The right desk uses a horizontal panel navigator above a full-width writing editor. Header rows
separate Story identity/actions, view selection and playback; New panel is primary and secondary
actions are icon-sized with accessible names. Phones combine the view picker, Play and clock;
previous/next selection remains available through the panel navigator. The canvas identifies the
current panel. Simple/Full share Story navigation, with classic duplicate top bars hidden only
in Story. `ui/bubbles.ts` hides the global Share entry while Story owns its own Share action.

Native main-entry review exposed a stale sketch toolbar after starting a board. `App.createBoard`
now notifies frame observers after entering the board drawing, and Bubbles includes board presence
in its update signature. No document model, timing or persistence format changed.

Checks: 749 unit tests + 1 skipped (87 files), strict TypeScript/production build pass (existing
chunk warning). Story UI 24 + three-size wrapper 72, storyexport 41, workspacefixes 23,
paintingworkflow 21, motionassets 13, anchors 11, projectpreview 7 pass. Fixtures assert final
creation ownership/tool readiness, full-mode navigation, desk geometry, single Share, current
sketch context and normal navigation/layout after leaving Story. Actual main-entry browser
review covered desktop Simple/Full and the compact phone interface, including real sidebar/tools
that the isolated Board fixture does not contain. Screenshots outside Git: `2dope-story-desk-*.png`.
Physical iPad/Pencil/onscreen keyboard remain unverified. Wide desk sizing is responsive rather
than a new draggable vertical divider; smaller windows keep their existing timeline-height control.

### Focused Story UI cleanup (2026-11-05)

User requested another Story UI cleanup after the published anchor update (`99a62e8`).
Pre-existing untracked research/railperf material remains excluded.

`ui/board.ts` now puts one current-panel writing surface beside `ui/storynav.ts`'s compact panel
navigator. Hidden forms remain available for existing caption/keyboard commands; only the active
panel is presented. Dialogue and Action are side by side on wider screens, details remain folded,
and the sticky header offers Duration, panel actions and a direct drawing-canvas focus button.
The navigator is horizontal above the editor on phones. Phone controls consolidate view tabs into
one picker and compact Story tools/Share buttons; all four views still use the same `setView`.
Short landscape uses one toolbar row; Split shares the focused editor under the existing timeline.
No new document fields, timings or export formats were added.

The navigator follows the shared panel clock, supports arrows/Home/End, restores focus across
rebuilds and uses an IntersectionObserver to allocate only visible 96x64 thumbnail canvases.
Offscreen buffers release to 0x0; previews letterbox actual thumbnail proportions. Panel changes
reset editor scrolling after visibility changes. Return across panel fields reveals/selects the
next panel before focusing it. Existing delayed keyboard scroll callbacks now require that their
field is still connected and focused, avoiding a late jump after navigating elsewhere. Caption
Undo and folded metadata remain intact. The export fixture explicitly selects panel 1 before
editing its form because other panel forms are now hidden.

Checks: 749 unit tests + 1 skipped (87 files), strict TypeScript/production build pass, with the
existing large-chunk warning. Story UI 21 and its expanded three-size wrapper 63, storyexport 41,
workspacefixes 23, paintingworkflow 21, motionassets 13, anchors 11 and projectpreview 7 pass
(eight unique fixtures). Checks cover navigation-only state, writing/Undo/Return, current-panel and
header visibility, no sideways form scrolling, the phone view picker, portrait preview pixels
and bounded thumbnail allocation on an 80-panel list. Real CDP mouse selection and Action typing,
commit and caption Undo also passed. Visual review covers Grid/Panels/Timeline/Split at 1280x900,
375x812, coarse-pointer 768x1024 and 812x375. Before/after screenshots live outside Git in this
chat's visualization directory: `2dope-story-{view}-{BEFORE,AFTER}-{size}.png` (disposable test art).
Physical iPad/Pencil and a real onscreen keyboard remain unverified. Long dialogue/details scroll
within the focused editor; the navigator has its own independent scroll. No virtualized form
rebuild or new all-panel writing mode was introduced.

### Direct Motion anchor placement (2026-11-05)

User asked to make anchor-point changes much easier. This follows published precision-tools
commit `b057c5a`; the working changes survived a usage-limit interruption and were rechecked.
Existing untracked research and railperf experiments remain excluded.

Implemented: `ui/anchors.ts` adds a prominent Motion Anchor tool (Y), selected-state controls,
yellow labeled pivot, tap/drag placement, Center and a nine-position context grid. Done/Esc/Y
ends it; key repeat does not flicker the mode, typing does not activate it. Short landscape hides
secondary timeline controls while Anchor is active. `CompEditor` compensates Position using the
original layer matrix; current-frame artwork and descendants stay in place through rotated,
scaled/reflected parents and camera views. Each edit is one command, with cancellation/no-op
restoration and frame/comp drift guards. Presets pin drawing content before measuring, then check
for stale clock/selection/graph state. Unlocked, visible artwork/groups/nulls only; zero-scale
inverse drags refuse. Source-entry double taps are suppressed while Anchor/path tools are active.
Pen anchor cancellation restores the original transform, unlike painting's keep-stroke behavior.
`anchorFixed?:true` is additive layer interaction metadata in the existing format. It preserves
an explicit pivot choice against first-transform automatic centering and survives project/asset
serialization. Anchor/Position remain ordinary existing props; ordinary archives still require 3.
Center anchors and numeric anchor edits mark the explicit choice as well. Manual/UPDATES and
format/architecture describe normal Auto-key behavior and the current-frame preservation limit.

Checks: 749 unit tests passed + 1 skipped (87 files); strict TypeScript/production build pass
(existing large-chunk warning). Eight affected browser fixtures: anchors 11, three-size wrapper
33, precision 17 + wrapper 51, motionassets 13 + wrapper 39, creationtools 23, workspacefixes 23.
Anchor checks include actual App pointer routing, pen cancel, single Undo/Redo, paired Auto-key,
nine positions, typing/keyboard isolation, grouped placement ownership, metadata roundtrip and
old minimum schema. Five editor unit tests cover matrix/descendant invariance, reflection,
camera/parent mapping, no-op/cancel, keyed compensation, explicit-pivot preservation and guards.
Real CDP mouse movement independently placed the pivot at its expected pointer position while
leaving the artwork matrix unchanged. Screenshots reviewed at 1280x900, 375x812, coarse-pointer
768x1024 and 812x375: `2dope-anchor-{tool,presets}-*.png` in this chat's visualization directory.
Physical iPad/Pencil/Safari and an onscreen keyboard remain unverified. This preserves the image
at the current frame, not every frame of animation with changing scale/rotation.

### Precision tools and workspace consistency (2026-11-04)

User approved the recommended graph/path/layout/SVG/workspace/recovery phase. Published baseline
was `d7aaf2f` (camera moves, symbols and hand-in bundles). Existing untracked research/railperf
work remains excluded. No new audio feature was added.

Implemented:
- `core/layout.ts`, `ui/layout.ts`, `compedit.ts`: Motion Layout and Animate placement Align & snap;
  canvas/selection edge/centre alignment, equal-gap distribution, current-frame anchor centering,
  device canvas/layer/grid snapping with blue guides, multi-layer movement and transformed-parent
  solving. Selected children do not double-move. Bounds actions pin content and guard stale targets;
  singular parents refuse. Each action/drag has one Undo. Snap target work is skipped when off.
- `core/precision.ts`, `ui/graph.ts`: segment timing handles, numeric frames/values/handle time and
  progress, presets, Value X/Y and speed inspection. Draft remains detached until one Apply command;
  Cancel, invalid key order and stale properties preserve the source. UI caps at 1,000 keys.
- `core/anim.ts`, `compedit.ts`, `view/overlay.ts`: spatial cubic key offsets, canvas points/handles,
  Smooth/Straight and linked handles. Parent/camera mappings and camera view restoration, cancellation,
  selection/workspace exit and one-command drags. Sample caching bounds repeated overlay work.
  Blender's old overlapping timing influences now normalize as playback does.
- `io/schema.ts`, `core/presets.ts`, `io/blender.ts`: schema 7 only for captures containing spatial
  keys; normal projects retain earlier minimum versions. Preset 2 only for curved captures, normalized
  position offsets adapt to canvas size. Curved Blender channels bake integer composition frames;
  actual Blender import and subframe equivalence are not verified.
- `core/pathgeometry.ts`, `core/vectorshape.ts`, `ui/vectorobjects.ts`, `app.ts`, SVG IO: exact
  relative/shorthand cubic/quadratic/arc node editing (including compact arc flags), fill/stroke/alpha,
  width, object movement, multi-selection and flat selection groups. Detached pinned preview, bounds
  measurement, stale guard and one Drawing history step. Import namespaces groups; export preserves
  selection groups. Complex paths retain paint/move/group controls; node UI caps at 2,000 segments.
- Main/commands/Motion wire the tools; shared dialog styling keeps footers reachable across sizes.
  Draw/Animate settings identify placement vs painting targets; Story exposes selected-panel context
  and recognizes all persisted views. Existing title browser checks now assert minimum capture version
  separately from the newest validated runtime schema. Manual, UPDATES and format/architecture updated.

Checks: 744 unit tests passed + 1 skipped (87 files), strict TypeScript and production build pass
(existing chunk-size warning). Fifteen unique affected browser fixtures pass: precision 17 +
three-size wrapper 51; motionfinish 22; creationtools 23; motionassets 13 + wrapper 39; assetlayers 9;
artworkworkflow 31; storyui 14 + phone 14; workspacefixes 23; projectpreview 7; paintingworkflow 21;
storyexport 41; importeffects 22. Includes project/asset schema roundtrips, alpha pixels,
Undo/Redo, stale/cancel paths and a 250-layer/500-key/200-path scene captured, validated, loaded and
undone. One disposable desktop run measured the large capture/recovery sequence at 179 ms; this
is a sample, not a device performance guarantee.

Visual review: Layout, Graph and Vector objects at 1280×900, 375×812, coarse-pointer 768×1024 and
812×375, no dialog horizontal overflow and reachable footers. Real CDP mouse drags changed timing
handles and imported nodes. Screenshots: `2dope-{layout,graph,vectors}-precision-*.png` outside
Git in this chat's visualization directory. Physical iPad/Pencil, Safari memory and onscreen keyboard
remain unverified. Spatial paths are cubic by time progress, not constant-distance path travel;
graph view is one property/segment, not a multichannel dock. SVG groups are selection groups, not
an editable nested hierarchy. Arc endpoints can move; dedicated arc radius/rotation handles are
not present. More advanced node insertion/deletion, nested object stacks and subframe Blender
reproduction remain future work.

### Camera / Effects / Symbols / Hand-in finishing phase (2026-11-03)

Owner: user approved the four recommended follow-ups after verifying `c61572b` was pushed.
That checkpoint’s presets/titles release is the baseline; all pre-existing untracked research
and railperf experiments remain excluded from this phase.

Implemented:
- `core/cameramove.ts`, `ui/cameramove.ts`: Motion → Animation → Camera move, with New/existing
  camera, Push/Pull/Pan, inclusive frame range, strength 0–30%, direction and easing. Preview has
  an independent play/scrub clock. Apply bakes normal keys (one command including a new camera),
  refuses locked/hidden/trimmed/stale targets and requires explicit replacement of affected keys.
  Other channels/outside keys remain. Topmost-camera precedence is shown in preview status.
- `core/comp.ts`, `core/effects.ts`, `core/presets.ts`, `io/schema.ts`, `ui/effectspanel.ts`:
  applying an Effects preset embeds optional `styleOrigin` with the complete resulting stack,
  including earlier animated effects retained by Append. Reset to preset restores that snapshot
  with fresh ids in one Undo and survives project/asset roundtrips independently of the library.
  Ordinary effects/rendered appearance keep the same minimum schema. Existing searchable effect
  families and bottom sheet were already built; this pass adds one interior scrolling region,
  per-tab scroll/focus preservation, visualViewport/keyboard clamping, full-window desktop drag
  clamping and a compact landscape header. One panel tree and preview quality behavior remain.
- `view/compdraft.ts`, `ui/symbols.ts`: shared detached serial preview for camera/source changes.
  Motion Layer → Symbol options shows source usage, pins/current values and Reset override, routes
  to existing Motion pin editing, shared-source editing and Make independent. Swap previews the
  replacement before applying the existing command, preserves custom name/placement/parent/timing,
  resets only that instance’s pins and undoes once. Existing graph-copy/cycle/deletion guards remain.
- `io/bundle.ts`, `ui/bundle.ts`, `ui/share.ts`: Share → Hand-in bundle makes full-range MP4 with
  sound, transparent PNG poster, explicit first-six-seconds-or-shorter GIF and optional editable
  project ZIP. Share passes export scope before restoring another workspace. A single archive
  capture supplies independent snapshot Residency/SoundBank; the working project/clock/history
  stays unchanged. New video/GIF excerpt offsets preserve picture/audio clock alignment. GIF keeps
  existing 480 px normal / 320 px Lite limits. Native MP4 is required; unsupported audio is reported
  rather than replaced by silence. Complete output is available only after every required member.
  Retry keeps completed files; explicit partial ZIP marks its manifest/filename incomplete.
  Cancellation produces no automatic download; every Save is explicit. Settings changes discard
  the old job. Rendering/staging share the device allowance: owner pixels, snapshot assets/audio,
  padded per-depth scratch, pinned frames and four staged-file/ZIP copies are conservatively
  budgeted. Archive source images load sequentially under an incremental asset-byte cap.
  Missing referenced archive images are refused instead of captured as blank. Snapshot pixels release after each frame; writer effect caching disables temporarily
  and restores the prior allowance. Large jobs refuse with recovery rather than reducing quality.
- Manual/UPDATES, project-format, architecture and proposal checkpoints updated. Existing title
  fixture now explicitly opens its stack tab instead of assuming another fixture’s saved tab.

Checks: **722 unit tests passed + 1 skipped**, 86 files; strict TypeScript/production build pass
(existing chunk-size warning). **15 unique affected browser fixtures** passed across final runs:
`motionfinish` **22** + three-size wrapper **66**, `creationtools` **23** + wrapper **69**,
`motionassets` **13** + wrapper **39**, `assetlayers` **9**, `artworkworkflow` **31**, `storyui`
**13**, `workspacefixes` **23**, `projectpreview` **7**, `assetcatalog-responsive` **24**,
`artworklibrary` **34**, `paintingworkflow` **21**, `storyexport` **41**. The new fixture exercises
actual App/History/PNG capture and storage-independent exports, real AVC MP4 encoding/decoding,
real AAC audio muxing, GIF/PNG alpha and frozen red pixels despite later working-art changes,
editable archive members, failure/retry/cancel/explicit-save UI, unsupported-MP4 recovery, source
scope handoff, source sharing/independence and camera/Reset Undo. Unit checks cover audio sample
range offsets, GIF frame offsets, nested/padded budget estimates and ZIP-copy caps.

Visual review: camera, Effects, Symbol options, source swap and bundle at 1280×900, 375×812,
coarse-pointer 768×1024 and 812×375. Screenshots outside the repo in this chat’s visualization
directory: `2dope-{camera,effects,symbol,swap,bundle}-finishing-*.png`. Landscape keeps Apply/Close
reachable and Effects retains a usable scrolling content area. Samples are disposable test art.
Physical iPad/Pencil/Safari, a real onscreen keyboard and hardware memory stress remain unverified.
Budget checks are conservative estimates, not a promise of free RAM. No temporal blur/Echo,
rich text, live linked styles, compatible-pin remapping or streaming ZIP implementation was added.

### Presets, editable titles and shared layer descriptions (2026-11-03)

The preceding asset/layout/gallery work was committed and pushed as `501c9d7`; its Pages run
completed successfully. This next phase implements the user-authorized reusable preset library,
editable titles and layer presentation consistency. Pre-existing untracked research and railperf
experiments remain excluded.

Implemented:
- `core/presets.ts`, `io/presetstore.ts`, `ui/presets.ts`: one strict portable version-1 format;
  eight starter moves/looks, named save, collision Replace/Save copy, rename/remove, JSON download/
  import and at most 40 device records per kind. Effects capture concrete values at the playhead
  without effect keys; Apply replaces by default or explicitly appends with fresh ids, normalizing
  groups/adjustments to a composite target. Motion saves easing and relative position/scale/
  rotation/zoom, absolute opacity; durations adapt to FPS and cannot collapse keys or leave the
  layer/shot. Existing keys in affected channels require explicit Replace range. Other keys remain.
  Apply is one History command; projects embed concrete values independently of library records.
  Preview uses a detached comp graph, own clock, serialized/coalesced drawing pins, stale-target
  checks and close cancellation. Main hooks Motion and Effects to the same library.
- `core/title.ts`, `ui/titles.ts`, `core/comp.ts`, `app.ts`, `compedit.ts`: editable system-font
  titles (280 code points, four lines, size/weight/alignment/fill/outline) with bounded detached
  preview. Applying leaves the blank flipbook page and clears stale spatial/mask editing state.
  Create/edit allocates a new transparent Fill snapshot in one command; Undo retains exact
  old/new drawings. Saved pixels are authoritative on reopen, including asset packages. Editing
  explicitly redraws with the current device font. Normal layer transforms/masks/effects remain;
  Ink-only effects are disabled/explained for editable titles. Paint/exposure commands offer
  deliberate Convert to paint; actual pen input on masks preserves title pixels/metadata. Clear,
  Fill and selection commands in mask mode still target artwork and therefore require conversion.
  Selection fragments drop title metadata. Merge requires conversion; adding paint above a title
  creates an independent drawing rather than linking its metadata into a cel group.
- `io/schema.ts`, `projectio.ts`, `artwork.ts`: reader 6; only title-containing archives require 6.
  Ordinary projects retain their minimum 3/4/5. Strict title metadata is round-tripped without text
  layout during load. Blender Check explains “Title exported as an image” and uses saved pixels.
- `core/layerpresentation.ts` and the three layer UIs: shared kind/source/mask/effects/opacity/
  hidden/lock descriptions and accessible full names. Existing gesture, reorder, timing and
  thumbnail controllers stay separate. Title creation/edit actions are available in Layers/Motion.
- Manual, updates, architecture and format notes describe actual behavior. Refined proposals keep
  a checkpoint distinguishing this build from the remaining camera/bundle/temporal work.

Checks: **698 unit tests passed + 1 skipped**, 83 files; strict TypeScript/production build pass
(existing >500 kB chunk warning). **12 affected browser fixtures** passed: creationtools **23**,
three-size wrapper **69**, motionassets **13** + wrapper **39**, assetlayers **9**, artworklibrary
**34**, artworkworkflow **31**, workspacelayout **22**, storyui **13**, paintingworkflow **21**,
workspacefixes **23**, projectpreview **7**. Creation checks use disposable IndexedDB databases and
actual App/History/rendering. They cover exact PNG roundtrip pixels, alpha, title undo/edit/convert,
pen/mask input, group/effect parity, strict import failure, stale apply rejection, cap/collision/
removed-target atomicity, failed-save draft retention and compatible camera preview.

Visual review: title editor and preset dialog at 1280×900, 375×812, coarse-pointer 768×1024 and
812×375. Screenshots in this chat’s visualization directory: `2dope-title-editor-*.png` and
`2dope-presets-*.png`. Scrollable forms keep Apply/Cancel reachable in short landscape. Physical
iPad/Pencil/Safari, on-screen keyboard behavior and an actual Blender import remain unverified.
System font appearance can change on an explicit edit on another OS; saved shots do not reflow.
No rich text/custom fonts/per-character animation, live linked presets, style-origin Reset,
dedicated new-camera assistant or hand-in bundle was added in this phase.

### Release checkpoint: assets, creation layouts and gallery pictures (2026-11-03)

The user authorized publishing the completed local asset/Motion and creation-layout/gallery
follow-ups, then building reusable presets followed by editable titles and consistent layer
controls. The local headings below record their pre-release checkpoints and checks. This release
excludes pre-existing untracked research and railperf experiments. Pushing main invokes Pages.
That checkpoint excludes the presets/titles/layer controls implemented in the newer section above.

### My Assets four-feature build, creation layouts and last-shot project pictures (2026-11-03, local)

Owner: build all four recommended My Assets improvements; improve Draw/Animate/Story tool layouts;
make project-gallery thumbnails show the last shot/frame being previewed. This extends the local
Motion/asset pass below. Both follow-ups were subsequently committed and pushed as `501c9d7`; the heading records their
original local checkpoint.

Implemented:
- `src/core/artworkcatalog.ts`, `src/io/artworkstore.ts`, `src/ui/artworklibrary.ts`: optional
  library-card kind/collection/update metadata, one-level named collections, search by name or
  collection, Drawings/Vectors/Animated clips filters, sorting by update/save/name/duration.
  Manage → Collection moves into an existing collection, creates one with its first asset, or
  returns to Unfiled. Existing IndexedDB version and portable project schema stay unchanged.
  Old multi-frame cards classify as clips; unclassified older stills remain Drawings until resaved.
- `src/view/artworkpreview.ts`, `src/ui/artworkpreview.ts`: saved thumbnails open a visual preview
  with Play/Pause, frame seek, dimensions, layers, fps and duration. It has its own Project,
  Residency and clock; seeks coalesce, frames decode sequentially and close cancels remaining
  work/releases surfaces. Rapid seeking/closing and source decoding failures have recovery.
  Preview does not change the working project, playhead or History. This is a visual preview,
  not an audio-preview implementation.
- `src/ui/artworkassets.ts`: explicit Save as new and Update existing. Updating chooses a saved
  target, atomically replaces its card/package and preserves identity/name/collection/original
  date. A deleted target is refused rather than recreated. Project copies remain independent.
  `ArtworkStore` adds atomic `move`/`replace`; the test wrapper delegates both methods.
- My Assets has **Add & place** as well as Add copy. Combined import/placement uses one History
  step and preserves complete editable source graphs. Motion stays in Motion with the instance
  selected; Animate retains its arrangement behavior. Library copies are independent; later
  placements in the project can share that source. Same-canvas-size reuse is preserved, with
  native-size Open as project for mismatches. Primary card actions are full-width; matching-size
  Open as project, Download and management sit under Manage. Short landscape uses a wider,
  compact library header so its scrolling cards retain usable space.
- `src/ui/bubbles.ts`, `src/ui/paintingworkspace.ts`, `src/core/workspacelayout.ts`, `src/style.css`:
  common navigation-first/tool-second geometry in Draw/Animate/Story; compact single-row HUD
  in short landscape; tools left, asset actions right, common default Brush/Eraser/Colour slots.
  Only untouched former Draw/Animate defaults migrate; custom bars/docks stay intact. More tools
  groups drawing, animation/effects, view or Story actions. Footer stays one scrolling row with
  Workspace anchored at the edge, and Story canvas fit accounts for the brush rail (`src/app.ts`).
  `FlipMode.update` clears `--flip-h` when hidden, fixing stale sidebar/menu positioning in Clips.
- `src/view/projectpreview.ts`, `src/ui/files.ts`, `src/ui/gallery.ts`: gallery pictures render the
  current composed frame (192×108), pinning required pixels, honoring Motion camera view and
  including the Story panel when previewing Story. Editing handles/guides stay out. Opening
  Projects refreshes the last-viewed picture after view-only scrubbing/playback, before switching
  projects and on best-effort paused hidden/pagehide flushes. The card-only update keeps document
  JSON, modified dates, Undo and restore points unchanged. Stale/failed capture preserves the old
  picture, and closing Projects while it loads cannot reopen it. This changes in-app project cards,
  not operating-system `.2dope` file icons.
- Manual/UPDATES, architecture and project-format notes refreshed. Existing keyboard toolbar test
  now checks moving one slot rather than assuming Smudge's old position. Workspace checks compare
  common tool positions/nonoverlap. Painting fixture uses the production transport-row placement
  and tests releasing the Flipbook inset. New catalog/project-preview fixtures use disposable data.

Checks: **668 unit tests passed + 1 skipped**, 81 files; strict TypeScript and production build
pass (existing chunk-size warning). **20 unique affected browser fixtures passed** across final
runs: assetcatalog **8**, its three-size wrapper **24**, projectpreview **7**, artworklibrary **34**
and phone **34**, workspacelayout **22** and four-size wrapper **88**, toolbars **37**, storyui **13**
and phone **13**, paintingworkflow **21**, motionassets **13** and wrapper **39**, flipbooksource
**26**, workspacefixes **23** and phone **23**, assetlayers **9**, artworkworkflow **31**, storyexport
**41**, canvasview **25**. PNG pixel checks cover composed foreground/background at the last
frame, camera view, nested shots, Story guides and gallery cancellation. Catalog checks cover
fresh IndexedDB reads, collection/type/duration sorting, independent animation preview, one-step
reuse, snapshot updates preserving existing project pixels, and refusing removed update targets.

Visual review: 1280×900, 375×812, coarse-pointer 768×1024, short 812×375, plus 320 px workspace
coverage in the fixture wrapper. No body overflow; shared creation controls stay separate and
asset dialogs fit. Screenshots outside the repo in this chat's visualization directory:
`2dope-{draw,animate}-unified-*.png`, `2dope-story-unified-*.png`, `2dope-library-*.png` and
`2dope-clip-preview-*.png`. Samples are disposable fixture artwork.

Not checked: physical iPad/Pencil/Safari/onscreen keyboard, full browser/performance suite, or
guaranteed async thumbnail completion after a forced browser termination. Collections are device
library metadata and do not travel as portable project folders. Existing research/railperf files
were preserved; no reference-project changes, commit, push or deployment in this follow-up.

### Asset creation and Motion workflow cleanup (2026-11-03, local follow-up)

Owner: deeper cleanup of asset files and a Motion menu closer to EffectCraft's flow; first commit
and push the completed changes. The previous pass was committed and pushed as **276d63a**.
GitHub Pages workflow **41721423953** completed successfully for that exact SHA
(`https://github.com/dustooned/2Dope/actions/runs/41721423953`). The implementation below follows
that published checkpoint and remains **uncommitted/unpushed**.

- `src/ui/motion.ts`: stable transport and shared-clock readout, task menus for New layer, Import,
  Assets, Layer, Animation, Effects and View at both Simple/Full levels. Auto-key, selection count,
  search and Animated stay in a separate row. Easing/timeline settings remain available in one
  disclosure. Animation exposes existing assistants, named easing, easing copy/paste, reverse and
  deletion; View exposes canvas guides, expand/collapse, all-layer recovery and reset zoom.
  Effects targets the selected drawing/adjustment/group and is disabled for other layer kinds.
  Layer button, row ellipsis and hold/right-click share the same categorized menu, including
  Arrange/parent, Source/playback and Blending/masks, each with Back recovery. No renderer/effect
  algorithms were added or borrowed. EffectCraft's local Project panel and menu source informed
  the task flow; this is not a full EffectCraft feature-parity claim.
- `src/core/assets.ts`, `src/compedit.ts`: Create asset from selection precomposes selected layers
  as a reusable source and linked placement in **one History command**. Captures the full shot
  duration so held pictures with transform animation do not turn into one-frame clips. Existing
  ordinary Group behavior is unchanged. Camera/story-guide selections are refused; composition
  limits and busy states are checked. Group boundary behavior still applies to adjustment/clipping/
  blend interactions and is explained before creating the source.
- `src/ui/artworkassets.ts`, `src/ui/artworklibrary.ts`, `src/main.ts`: Motion uses the same asset
  shelf/library as Draw/Animate. Project sources have name/type filters, focused Edit/Place actions
  and a Save/files/manage disclosure with Save to My Assets, direct `.2dope` download, Rename and
  Send to another project. Download captures all referenced editable data without saving a library
  card or adding document History. Place from Motion stays in Motion with an unlocked linked
  layer; source Edit/Done returns to the original shot/frame. Source/standalone views explain when
  to return to a shot before placing. Move in a Motion shelf selects the layer instead of invoking
  Animate-only arrangement. Save/library formats, matching-canvas reuse limits and schema unchanged.
- `src/core/workspacelayout.ts`, `src/ui/bubbles.ts`: only untouched old Motion defaults migrate
  from duplicated commands to camera/view tools. Customized bars retain pins/removals. Main opts
  out of the duplicate floating Motion options row. Mode scrolling reveals the active workspace
  after navigation/resize. `src/style.css` supplies 44px command targets, a compact short-landscape
  header, bounded timeline/body scrolling and responsive asset controls.
- Manual/UPDATES and architecture map refreshed. Existing library/name fixtures explicitly open
  the new project-card disclosure before saving/renaming. New `src/ui/motionassets.browser.ts`,
  `tests/motionassets.html` and its three-size wrapper use an in-memory store and disposable art.

Checks: **663 unit tests passed + 1 skipped** in 80 files; production build passes strict TypeScript
and Vite (existing chunk-size warning). New Motion/asset browser checks **13/13**, responsive
**39/39** (375×812, 768×1024, 812×375): pixel-identical multi-frame precomposition, one-step Undo,
alpha/vector preservation in complete downloadable archives, library reuse, source return, submenu
blending/Undo, active-mode visibility, toolbar migration and 44px controls. **18 unique affected
browser fixtures passed** across the final integration and toolbar/Story regression runs. Final
integration run: artworklibrary 34, phone 34, artworkworkflow 31, paintingworkflow 20, assetreplace
13, assetnames 10, assetlayers 9, flipbooksource 26, storyexport 41, commandrow 44 and importeffects
22, plus the new checks above. Toolbar/Story run: toolbars 37, workspacelayout 20, its four-size
wrapper 80, storyui 13 and phone 13. Normal `git diff --check`
passes. Screenshots outside the repo: this chat's visualization directory,
`2dope-motion-{desktop,phone,tablet,landscape}.png` and matching `2dope-assets-*.png`.

Limits: no physical iPad/Pencil/Safari/onscreen-keyboard check. Standalone `.2dope` asset download
is added; new PNG/SVG export formats, library folders/tags, saved animation/effect presets, a graph
editor and temporal effects are outside this pass. The previous 15-item slate remains a spec,
not a statement that those deferred features were built. Existing untracked research/railperf work
is preserved. This follow-up has not been committed, pushed or deployed.

### Release checkpoint (2026-11-03)

The user requested committing and pushing the completed November 3 Story, vector/media import,
adjustment/group effects and focused Motion/Effects UI work below. Those sections record the
pre-commit checks and limitations; their “uncommitted” labels describe their original checkpoint.
This commit excludes the pre-existing untracked research and railperf experiments. A deeper asset
creation and Motion workflow cleanup is the next requested implementation pass, not part of this
release checkpoint. Pushing `main` triggers the existing GitHub Pages workflow.

### Story interface consistency and editing ownership (2026-11-03, uncommitted follow-up)

Owner: "Interface has a lot of inconsistencies esp with story mode…let's fix."
- `src/ui/board.ts`: one persistent Story header at Simple/Full levels with Play/Pause,
  Previous/Next panel, shared-clock readout, Grid/Panels/Timeline/Split, New panel, Story tools,
  Share and contextual help. Story tools makes Script, image import, Present, Animate and selected
  panel actions reachable at Simple level. The empty state disables playback/share without hiding
  recovery actions. Each card has an explicit menu and keyboard-accessible picture button.
- Panel cards leave Dialogue and Action outside a session-remembered Panel details disclosure;
  shot/camera/stickers/timing/notes remain inside it. Keyboard Return opens the next card's Details
  when required. Compact previews and styled Duration fields make room for dialogue. No caption
  schema or timing calculations changed. `Both` is consistently labeled `Split` (stored value unchanged).
- `src/core/workspacelayout.ts`, `src/ui/bubbles.ts`: Story's new default bar is Brush/Eraser/Colour;
  only the untouched former default migrates. Custom bars retain their actions and receive new
  sketch tools through existing seen-tool migration; Brush stays recoverable. Panel actions can
  still be pinned. Main opts into the panel-owned view controls to remove their duplicate floating
  row (`src/main.ts`). Non-painting mode buttons show names and keep 44 px targets, scrolling
  inside the viewport; short landscape uses icons to keep the canvas usable.
- `src/style.css`: scoped Story header/card styling, 44 px actions, semantic field/focus states,
  reduced-motion handling, and bounded Story height so cards and canvas retain scrollable space.
- A browser regression exposed a real focus bug: Undo Start storyboard allowed the fallback real
  drawing layer to become active, and Redo did not return to the guide. `src/app.ts` restores
  Story ownership after history steps and when loading a project while Story is open. This is
  runtime selection only, without an extra history edit. The sketch regression proves strokes and
  captions target the guide and leave the animation drawing track alone.
- Manual/UPDATES updated (`src/ui/manualtext.ts`); existing story export fixture follows the
  renamed Share entry and Story tools import action (`src/ui/storyexport.browser.ts`).

Checks for this follow-up: `npm test` **660 passed + 1 skipped**, 80 files; production build passes
(existing chunk-size warning). Browser: new `storyui` **13/13** and phone wrapper **13/13**;
`storyexport` **41/41**, `commandrow` **44/44**, `workspacelayout` **20/20** and its four-size wrapper
**80/80**. Earlier in this follow-up `toolbars` **37/37**, `workspacefixes` **23/23** and phone
**23/23** also passed. New tests cover Start/Undo/Redo, actual sketch pixels + Undo, caption/details
state, view-only history, playback/panel stepping, menu duplication, help/share routing and load
ownership. Unit coverage checks untouched/default migration versus customized bars.

Visual review: desktop 1280×900, phone 375×812, coarse-pointer tablet 768×1024, short landscape
812×375; no body overflow, header stays reachable and both canvas/card areas retain space. Review
screenshots live outside the repo in this chat's visualization directory as `2dope-story-*.png`.
The screenshots use disposable in-memory sample panels, not a user's saved project. Physical
iPad/Pencil/Safari/onscreen keyboard remains unverified. No commit, push or deployment performed.

### Vector/media import, adjustment/group effects, focused Motion UI, and release specification (2026-11-03, uncommitted)

Owner: expand the current app; import SVG/EPS/vector items, investigate PNG transparency, clean up
the touched UI/Motion tools, fix adjustment effects doubling and missing group effects. Follow-up:
the pasted 15-item slate requests verdicts, cross-cutting decisions, build cards and milestones;
it does **not** request implementing the whole slate or another general layout rewrite.

**Implemented locally:**
- `src/io/vectorimport.ts`, `src/io/eps.ts`, `src/core/vectorshape.ts`: bounded SVG path-object
  import and a simple path-based EPS data parser. Curves, solid fills/strokes, fill rules,
  opacity, basic shapes, group transforms, local uses and paint styles are retained. Unsupported
  text/gradients/patterns/masks/clipping/dashes/special appearances are refused with a plain-SVG
  conversion message; this is not an arbitrary EPS/PostScript, AI or PDF interpreter.
- Portable `StrokeRecord.shape`, synchronous cached Path2D rendering (`src/brush/vector.ts`),
  whole-object transforms/selection clips, SVG re-export and cross-project fit. Imported paths
  are excluded from brush point editing/restyling/vector erasing. The Vector row now actually
  exposes Export SVG and Rasterize imported vectors; rasterizing the Ink vector stack is one
  undoable pixel command. Source changes in `app.ts`, `vectorstyle.ts`, `vectorclip.ts`,
  `vectorcut.ts`, `sendto.ts`, `svg.ts`, `commands.ts`, `bubbles.ts`.
- Format 5 is required only for imported path objects (`schema.ts`, `projectio.ts`, `artwork.ts`).
  Older projects load; ordinary captures/artwork archives still use minimum formats 3/4.
  Validation counts path data in the existing 64 MiB vector budget; imports cap input at 8 MB,
  2,000 painted paths, one million characters/path and bounded recursion. See `docs/project-format.md`.
- `src/ui/media.ts`: SVG/EPS routed before image decode; PNG alpha survives import. Bitmap
  failure falls back to the browser Image decoder, with resource cleanup and a changed-timeline
  guard. The reported original PNG was not supplied, so its exact failure is not established.
  White paper can conceal transparency: View → Transparency grid (also Motion View) adds a
  screen-only checkerboard (`canvasview.ts`, `ui/canvasview.ts`, `app.ts`). No matte is removed
  from pictures that actually contain opaque white pixels.
- `src/view/composite.ts`: adjustments interpolate premultiplied original/effected pixels
  rather than source-over double translucent art; the comp background is included in the adjusted
  page exactly once. Comp-instance effects run after nested composition rendering and before
  the placement transform. Flat groups/adjustments treat targets as one Composite input,
  including slider previews (`src/view/effects.ts`). `compedit.ts` supports keyed group effects;
  `core/comp.ts` frame-content keys include group effects so export dedup cannot freeze them.
- `src/io/blender.ts`: group effects force per-placement baking on the placement clock;
  transforms/opacity remain plane channels. Check explicitly notes that output is group-page-sized
  and effects beyond that page crop. Adjustment layers remain omitted with the existing note.
- `src/ui/motion.ts`: + Layer and Layer actions group existing actions; Motion tools exposes
  existing Wiggle/Smooth/Loop/Stagger/audio/easing commands, not new algorithms. Layer search
  clears on project/comp change; Animated reveals keyed property rows. Effects opens a selected
  group as well as a drawing. Existing advanced controls remain in the disclosure.
- `src/ui/effectspanel.ts`, `src/style.css`: searchable effect families with visible hints;
  Add stays open for repeated additions, updates count/status and restores button focus. A 16-effect
  limit matches persistence and also guards duplication. The same panel docks at widths ≤760 px,
  or ≤1024 px on a coarse pointer; desktop remains draggable. Header, search styling, keyboard
  tabs, focus recovery, reduced motion and touched semantic tokens refined. Effects/Motion/Share
  help buttons route section ids through the shell (`main.ts`, `app.ts`, `share.ts`). Manual/UPDATES updated.

**Specification only:** `docs/ADDITIONS-REFINEMENT-2026-11-03.md` covers all 15 requested verdicts,
cross-cutting text/temporal/preset/symbol/export/row decisions, cards for surviving work, UI rules,
three milestones and five remaining risks. Titles, saved effect styles, new camera-move presets,
hand-in bundles, Tint/Tritone and the layer-row presentation migration are **not implemented** here.
It identifies the already-present twelve easing curves and time remapping rather than proposing
duplicate implementations. Motion blur/Echo and other renderer-heavy slate items are deferred.

**Checks:** `npm test`: 80 files, **659 passed + 1 skipped** (opt-in brush corpus). Production build
passes strict TypeScript and Vite; existing large-chunk warning remains. Nineteen unique affected
browser fixtures passed across runs: importeffects, importeffects-responsive, effects, rendering,
canvasview, toolbars, commandrow, workspacefixes(+responsive), shareexport, storyexport,
vectornext, vectorbrushes(+responsive), selectionedit, selectionpaint,
artworklibrary(+responsive), sendto. The last renderer/archive changes were rechecked with
importeffects 22/22, phone 22/22, effects 25/25, shareexport 4/4, vectorbrushes 46/46,
and sendto 6/6. Updated older assertions deliberately account for Export SVG appearing in the
Vector row, the new view option/focus order, Add staying open and runtime format normalization.
The fixture runner first could not reach the sandboxed Vite server; verification succeeded with
both isolated test server and temporary-profile Chrome outside the sandbox, at 127.0.0.1:5217.

Visual review at 1280×900, 375×812 and coarse-pointer 768×1024: no body overflow, Effects list
scrolls, all help buttons 44 px on touch; bottom sheet fits phone/tablet. Screenshots are outside
the repo in this chat's visualization directory (`2dope-effects-{desktop,phone,tablet}.png`).

**Not checked:** physical iPad/Pencil/Safari/virtual-keyboard feel; full fixture suite/railperf;
native Blender import/render of these new group bakes; the user's original PNG/EPS/SVG files.
Blender group bakes crop outside the group page, and adjustment layers are still intentionally
not exported. No source files from sibling reference projects were changed. Existing untracked
research/railperf files were preserved. No commit, push or deployment was performed.

The November 2 sections below were committed before this session (HEAD `5ef54cc`), despite their
historical “uncommitted” headings. Consult Git rather than treating those old labels as current status.

### Blender: masks, effects, parts and clipping rendered; adjustment layers left out (2026-11-02, uncommitted)

Owner: yes to fixing what Blender dropped without a note (clip, mask, adjustment, effects).
- `src/io/blender.ts` `planBlender`, drawings layers:
  - `adjust`: not exported, note.
  - mask, active effects or `partsActive`: `soloComp` (one copy of the layer, no parent, position
    on its anchor, no scale / turn, opacity 100, normal blend, project page size, no camera)
    rendered per frame as `r:` images (deduped by `frameContent` key). The plane keeps the
    layer's channels, so it still moves in Blender. Note. (The old "parts not in Blender" note is gone.)
  - clipped (`clip`, not a guide): `clipComp` (the comp without cameras, its clip base at
    opacity 0 so only the clipped paint shows, other layers hidden but kept for parents)
    rendered in comp space; the plane is comp-sized, no parent, centred, with no moves, and
    only the layer's opacity channel. Note.
- `trimScene` now cuts any image a drawings layer shows (`d:` or `r:`), with bounds keyed by image key
  and each layer's planned `size` as its page; `PlaneImage { key, source, rect }` replaces
  `DrawingImage`. Precomp frames (kind `baked`) are still written whole.
- `src/io/blenderpack.ts`: one `draw(key)` paints a drawing or renders a job onto a reused
  canvas per size; measure, cut, then the whole precomp frames.
- Checks: `blender.test.ts` 3 new tests (adjust, mask / effects, clip); `npx vitest run`
  653 + 1 skipped; `npm run build`. End to end: a scene built in the dev app's modules (an
  in-memory `Project`, the open test project untouched) with plain, masked, clipped, boiled
  and adjustment layers → `exportBlender` ZIP (4 images) → headless Blender 5.1 import of that
  ZIP with the repo add-on: plane bounds match the art (masked and clipped both cover only
  x 400–500, y 100–300 px; no adjustment plane), and a camera render matches 2Dope's picture.
- Not checked: a clipped layer that other layers are parented to (its Blender plane has no
  moves, so their children would not follow); glow / shadow effects that reach past the page edge
  are cut at the page; the Share UI with these notes in the Check list (same list as before).

### Blender planes sized to their art (2026-11-02, uncommitted)

Owner: "layers were exported whole aspect ratio size. any way we can export assets as their size
of asset not video?"
- `src/io/blender.ts` `trimScene`: each drawings layer's plane and images are cut to the union of
  the painted bounds of its drawings, plus 2 px, clamped to the page. `BlenderLayer.offset` (new,
  optional) says where the images start on the page; anchors are unchanged because the add-on
  places children from their parent's anchor. When a drawing is cut two different ways (two layers, or a
  storyboard marker, always the whole page), it gets `d:<id>~n` / `drawings/<id>_n.png`. An empty layer
  becomes a 1×1 plane. `planBlender` only lists images for drawings that a layer or marker shows (no
  longer the drawings used only by baked precomp frames).
- `src/io/blenderpack.ts`: measures each shown drawing's painted rect (`getImageData` alpha scan),
  then writes cropped PNGs; `BlenderOptions.trim` (default true). README line added.
- `blender/2dope_import.py` `plane()`: vertices start at `offset` (default 0,0, so older packages
  import as before).
- Share: Blender › Layer size (Its art · small planes / Whole page), saved as
  `2dope.share.blender`; summary says the image count.
- Checks: `blender.test.ts` 3 new tests (union and margin, clamp and whole-page mode, two cuts
  and the storyboard marker); `npx vitest run` 650 + 1 skipped; `npm run build`. Dev app: the red
  600×400 rectangle exported as a 604×404 plane at offset 198,148, and the ZIP went from 113 KB to 34 KB.
  Headless Blender 5.1 with the repo's add-on (`--background --factory-startup`, a hand-built
  package matching that layer, both modes): the art's corners land at the same world points
  (-7.6, 3.9) and (-1.6, -0.1) for the page-sized and trimmed planes.
- Not checked: importing the app's own ZIP in Blender (the test package was built inside Blender);
  baked precomp frames are still comp-sized (not trimmed); clip / mask / adjustment / effects
  are still dropped from Blender without a note (see the review in the conversation of
  2026-11-02).

### Share screen clean-up; Blender export runs in Share (2026-11-02, uncommitted)

Owner: "anything we need to clean up with the blender export? Also the export screen needs some UI
clean up."
- Blender (`src/io/blender.ts`): `planBlender` builds the scene from `exportComp` (the gap left by
  the section below), so a solo asset goes to Blender by itself, like every other Share export;
  `layerEnd` once per layer; unused `type Layer` re-export removed. `src/io/blenderpack.ts`
  `exportBlender` takes an `AbortSignal`, and drops the `images` entry of a drawing missing from
  the pool (the add-on already shows a blank frame).
- Share (`src/ui/share.ts`): Blender uses Share's own make flow (progress bar, Cancel / Esc,
  Ready page with Save / Share… and the two Blender steps, plus the planner's notes). Before
  making, its Check list shows layers / precomps / frames, storyboard markers and every
  "simplified in Blender" note; the summary gives size and image count. `ShareHooks.blender` and
  `main.ts` `exportForBlender` (toast flow) are gone; Menu › Export for Blender opens
  `share.show('blender')`. Plurals ("1 frame", "1 picture") via `count`.
- CSS (`src/style.css`): `.share-kinds` had no rules at all (buttons wrapped raggedly, the chosen
  one unmarked): now a two-column card grid with the chosen card lit. Also styled `.share-advanced`,
  `.share-passes`, `.share-zip`, `.share-steps`, `.share-result.checker`, text / number rows.
  Time-lapse moved into the header; header subtitle hidden under 760 px.
- Also: `compLength`'s doc comment had ended up above `exportComp` (`src/core/comp.ts`); moved back.
- Manual: UPDATES entry.
- Checks: `blender.test.ts` new case (shot while a group is open; solo asset alone);
  `npx vitest run` 647 + 1 skipped; `npm run build`;
  fixtures storyexport 41/41 and shareexport 4/4. Dev app (127.0.0.1:5217): Menu › Export for
  Blender opens Share on Blender, Make → Ready with a 113 KB ZIP; PNG frames with Advanced open;
  375 px phone width, no sideways scroll.
- Not checked: importing the ZIP in Blender; the full fixture suite; Safari's `-webkit-line-clamp`
  on the card hints.

### Share exports the open timeline (GIF "removes footage, returns on undo") (2026-11-01, uncommitted)

Owner: GIF export glitched: the footage vanished and came back on undo; then: "it was rendering
another timeline and not Motion; had to reimport the asset".
- Cause: `ShareView.show()` stepped out of groups with `editor.exit()` while `crumbs()` had more than
  one step. A timeline not reachable from `project.main` (an asset opened on its own) also gives a
  multi-step trail, so opening Share switched the open timeline to the shot, and every exporter
  rendered `project.main`. Undo restored the asset timeline. (A direct `exportGif` call was checked
  first: it changes nothing, no residency or history side effects.)
- Fix: `exportComp(p)` (`src/core/comp.ts`): the shot, also while a group inside it is open; the
  open timeline when it is not part of the shot. Used by `planGif`, `planApng`, `planVideo`,
  `exportSequence` and Share's preview / picture (`ShareView.comp`); storyboard and animatic stay
  on the shot. `show()` only steps out of groups when `exportComp` is the shot.
- Tests: `gif.test.ts` (exportComp: shot, group in shot, solo asset, no active comp; planGif sizes);
  new fixture `tests/shareexport.html` (the real app in a same-origin iframe: solo square asset
  stays open, its GIF is square, no undo step; in the shot the GIF has the shot's shape).
- Not checked: Blender export (`planBlender` still uses `main`), the old ExportUI dialog paths.

### Motion view switches; new default tools reach saved bars; QuickMenu / ☰ overlap (2026-11-01, committed)

Owner: the QuickMenu button and the ☰ button overlapped; Motion needs the title safe and other
view toggles.
- `src/ui/quickmenu.ts` `placeTrigger`: `.canvas-menu-btn` is an obstacle, so the edge button sits
  above ☰ (measured on an emulated 768×1024 touch tablet: QuickMenu 859–903, ☰ 913–953).
- `src/app.ts` `drawCanvasView` also runs in Motion (after `drawComp`, before the overlay): safe
  frames, centre cross, Overscan's dimmed pasteboard. The frame overview strip stays Draw/Animate.
- Tool keys `safeareas`, `centrecross`, `overscan` (`setCanvasView` toggles, lit when on; icons
  `safearea`, `centrecross`, `overscan`): in Motion's tool set and default bar; pinnable in
  Draw/Animate. Bubbles signature includes `canvasView`.
- `src/core/workspacelayout.ts`: layouts save `seen` (every tool the mode offered); on read, a
  default tool missing from `seen` is appended once (saves without `seen` use `SEEN_BEFORE`, the
  lists before this change). So users with a saved Motion bar get the switches, and the Draw /
  Animate Eyedropper; a tool removed later stays removed. Two validation tests now pass `seen`.
- Manual (Motion), UPDATES.
- Checks: `workspacelayout.test.ts` (new migration test); fixture toolbars 37/37 (Motion bar has
  the switches; Title safe lit and orange safe frames drawn over the shot).
  `npx vitest run` 645 + 1 skipped; `npm run build`; all 50 fixtures pass (railperf excluded).
- Not checked: real touch hardware; QuickMenu on the left edge (no overlap expected there).

### Touch: hold = eyedropper, double-tap = menu, Eyedropper tool, ☰ button (2026-11-01, committed)

Owner, in order: keep two-finger tap undo (a staple); a menu icon at the bottom right for touch;
keep the QuickMenu reachable; then, after trying a staged 0.25 s / 0.55 s hold: "just an eyedropper
tool, hold one finger to eyedropper like before, double tap activates the right-click menu".
- `src/app.ts` `armHold`: with `touchHold` 'eyedropper' (default), a one-finger hold (`HOLD_MS`,
  450) in Draw/Animate starts the eyedropper (`beginHoldPick`: loupe, slide, lift keeps, cancel
  restores); elsewhere a hold does nothing. 'menu' setting: the hold opens the menu (`holdMenu`).
  The two-finger hold and the staged menu are gone.
- Double-tap: `finishTapSession` → `fingerTap` (tap session now keeps where the finger landed);
  two one-finger taps within `DOUBLE_TAP_MS` (350) and `DOUBLE_TAP_PX` (30) open the canvas menu
  there. Not while finger painting (a tap draws), in Timing (a tap plays), or on a group in Motion
  (double-tap enters it). Two-finger tap still undoes (fixture-checked).
- Eyedropper tool: `eyedrop` in `WORKSPACE_TOOLS` and the default Draw / Animate bars (users who
  saved their own bar add it from Edit tool bar); arms `app.armEyedropper()`, lit while armed;
  `main.ts` refreshes the bubbles on `onEyedrop`.
- ☰ `.canvas-menu-btn` at the stage's bottom right on touch screens (`maxTouchPoints` or
  `(any-pointer: coarse)`), above the flipbook (`--flip-h`). The canvas menu starts with QuickMenu
  in Draw/Animate (`app.onQuickMenu` from `main.ts`; menu entry `canvas.quickmenu`, hideable).
- Setting wording (`pensettings.ts`), manual gesture table, UPDATES.
- Checks: fixture toolbars 35/35 (hold picks and stays the eyedropper, slide, lift, nothing drawn;
  double-tap menu; slow taps nothing; two-finger tap undo; two-finger hold nothing; Eyedropper
  tool lit / pick / out; ☰ → QuickMenu; Motion hold nothing, double-tap menu; Canvas-menu
  setting).
  `npx vitest run` 644 + 1 skipped; `npm run build`; all 50 fixtures pass (workspacelayout's
  default-bar count updated from 8 to 9 buttons for the Eyedropper).
- Not checked: real touch hardware (tap timing on an iPad), the ☰ button's position by eye.

### Dock-style tool bars, Animate actions, Motion column width, touch-hold eyedropper (2026-11-01, committed)

Owner: more tool icons in Animate; toolbars easy to customise by drag and drop (add and remove,
Mac Dock style, same on desktop and tablet), both the tool bar and option rows; mid-task also
asked for a resizable Motion layer column, a one-finger hold eyedropper into the colour puck, and
a two-finger hold for the canvas menu instead of one finger.
- `src/ui/baredit.ts` (new) `BarEditor`: edit mode for any bar (`BarEditTarget`): wiggle, tray of
  what is not on the bar, drag along (reorder), off (remove), from the tray (add, at the drop
  point; a tap puts it back in its built-in place), tap to pick → ◀ ▶ Remove, keyboard arrows /
  Delete / Escape. Document-level capture Pointer Events (mouse, pen, touch the same; drag after
  6 px); the bar's own handlers and clicks are blocked while editing. `keep` items (Brush) cannot
  leave. Styles at the end of `src/style.css` (reduced motion: no wiggle).
- Tool bar (`src/ui/bubbles.ts` `editTools`): edits `WorkspaceLayout.tools` (existing device
  prefs, per workspace) live via `app.setWorkspaceLayouts`; while editing the bar shows exactly the
  pinned tools (no current-tool insert, no student-profile filter, so a drag never unpins a hidden
  tool). Entry: More tools → Edit tool bar; hold / right-click a tool → Edit tool bar… or Remove.
  At the Full level Draw/Animate use the classic top bar (notice; not editable here). A folded
  (hidden) bar is not opened (notice).
- Option rows (`editRow`, Customize chip): `CommandPrefs.order` (optional, per context;
  `orderCommands`, `setCommandOrder`, `setRowLayout`); `orderRow` (`src/ui/commands.ts`)
  permutes a built row's `[data-command]` chips among their own slots so fixed controls stay.
  `setCommandHidden` now keeps `order`. The old Customize checklist is no longer used by rows
  (`showCustomize` still serves the canvas and frame menus).
- Animate / Draw tools (`WORKSPACE_TOOLS`): play, onion, prevdraw, nextdraw, insert, dup, del,
  fx (not pinned by default); new icons `newframe`, `dupframe`, `delframe`; fx on a painting bar
  opens the layer you draw on. Titles for these "action" buttons.
- Motion layer column (`src/ui/motion.ts`): width 140–520 (default 196, `2dope.motion.leftw`),
  CSS `--mleft-w`; drag the `.mleft` right edge on any row or the ruler grip; double-click resets;
  arrow keys on the grip. Replaced the `LEFT_W` constant.
- Touch hold (`src/app.ts`, superseded by the section above): `PenPrefs.touchHold` ('eyedropper' default | 'menu'; App settings →
  Pen and tablet → Touch and hold). Eyedropper: one finger still for `HOLD_MS` in Draw/Animate
  (not with finger painting) samples the screen (`sampleScreen`) into the colour, a loupe
  (`.hold-loupe`) follows the finger, lift keeps it, cancel restores. Two-finger hold: both within
  `HOLD_SLOP` → canvas menu at their midpoint; restores the view the fingers nudged, marks the tap
  session moved (no undo), blocks pinch/pan until all fingers lift (`touchGestureDone`). Elsewhere
  (Motion, Timing, Story) a one-finger canvas hold now does nothing. Menus on frames, layers,
  panels and tracks are unchanged (one-finger hold).
- Manual (gestures table, tool bar, Motion), UPDATES entry.
- Tests: `commandprefs.test.ts` (order), `pen.test.ts` (touchHold); new fixture
  `tests/toolbars.html` + `src/ui/toolbars.browser.ts` (24): edit tool bar with mouse / finger /
  pen drags, saved, tap picks, Remove, Brush kept, arrows, Reset, Escape; Animate Onion and New
  drawing from the bar; Select row reorder saved and Reset; one-finger hold picks red, loupe,
  slide, lift; two-finger hold opens the menu and is no undo; 'menu' setting. `commandrow`
  updated for the tray (44/44).
- Checks: `npx vitest run` 644 passed + 1 skipped; build passes; all 50 browser fixtures pass on 127.0.0.1:5217 (railperf excluded: it hangs
  headless Chrome; the manual text was edited after the run started, code was not). In the dev app
  (test origin): tool bar drags (mouse / touch / pen), tray placement, Brush guard, Reset, Done;
  Select row reorder and Reset; Motion column 196 → 316 (touch) → 256 (grip, mouse) → 196.
- Not checked: real touch hardware (iPad, Android) for the holds and drags; Safari; the wiggle by
  eye; option rows that scroll sideways on a phone while editing.

### Motion layers: blend mode, clipping mask, layer mask (2026-11-01, committed)

Owner: "layers should have masking, color modes etc" in Motion (Draw's layer options had them;
Motion's layer menu did not).
- `src/ui/motion.ts` `layerActions` / `runLayerAction`: Blend mode… (pickBox of `BLEND_MODES`;
  not on camera / anchor layers), Clipping mask on/off, Add mask / Edit mask / Delete mask (drawings
  layers that are not guides or adjustment layers). Same edits as Draw (`editor.edit`, `app.addMask`,
  `app.deleteMask`), one undo step each. Add / Edit mask focus the layer, switch to Draw and turn
  mask painting on (brushes paint masks; Motion has no brushes). Both the ⋯ button and the
  right-click / hold menu use this list. Row name shows ↳ (clip) and ◐ (mask); the tooltip names
  the blend mode.
- Manual (Motion list) and an UPDATES entry.
- Checks: `npx vitest run` 643 + 1 skipped; build passes; fixtures effects 25/25, quickmenu 34/34,
  workspacefixes 23/23, commandrow 44/44. In the dev app (test-origin project, Drawing 4): the ⋯
  menu listed the three new entries; Multiply and Clipping mask updated the row (↳, tooltip);
  Add mask opened Draw with "Mask on"; three Undos restored the layer (↳ ◐ and Multiply gone).
- Not checked: touch hold menu, mask on a layer inside a group (comp), blend on comp layers by eye.
  No new fixture covers the Motion menu entries (MotionView is not built in a fixture).

### Adjustment-layer effects go on the right layer; Motion rows fold by arrow (2026-11-01, committed)

Owner report: effects added right after making an adjustment layer went on the wrong layer, and
tapping a layer in Motion always unfolded all its properties.
- Cause 1: `addLayer('adjustment')` opens the card on the new layer but keeps your layer selected
  (by design); the next `editor.onChange` / `onToolChange` ran `EffectsPanel.follow()`, which saw
  your layer as the target and switched the card back, so + Add effect landed on your layer.
  Fix (`src/ui/effectspanel.ts`): the card remembers the target and `CompEditor.picks` (a new
  counter bumped by every `select()`, `src/compedit.ts`) from when it opened or last followed, and
  only follows when the layer you draw on changes or you pick a layer (even the same one again).
- Cause 2: both `CompEditor.select()` and Motion's name tap (`src/ui/motion.ts`) added the layer to
  `editor.open`. Removed; the existing ▸/▾ chevron is now the only way to unfold. New layers still
  open unfolded (`addLayer`). Name tooltip mentions the arrow.
- Manual (Motion list) and an UPDATES entry.
- Checks: `npx vitest run` 643 passed + 1 skipped; `npm run build` passes; fixture `effects` 25/25
  (2 new checks: Vignette after + Adjustment lands on the adjustment layer and not yours, picking
  your layer moves the card back; selecting leaves the row folded). audioreact, canvasview,
  paintinglayout, playbackrange, quickmenu, storyexport, workspacefixes, assetreplace, placement
  pass (run before the `picks` refinement, which only touches the Effects card). In the dev app
  (test origin): a name tap selected Drawing 4 and left it folded; ▸ showed 8 rows, ▾ folded them.
- Not checked: touch, the Draw-side Adjustment tile clicked by hand.

### Cursor choice; iteration 3 follow-ups (2026-11-01, committed with iteration 3)

Owner: "add all those changes" (the open iteration-3 decisions), plus student feedback asking for
other cursor shapes than the crosshair.
- Grain blend 27 now imports as height too (`src/io/brushimport.ts`); the test uses blend 10 for
  the unsupported case.
- Brush Studio's Scatter slider goes to 8 for pixel brushes, 2 for styled vector brushes
  (`src/ui/panel.ts`; the file schema still caps styled vectors at 2).
- Cursor: optional `PenPrefs.cursor` ('crosshair' default | 'circle' | 'dot' | 'brush' | 'none';
  `src/core/pen.ts`, older builds ignore it). `canvasCursorCss` builds an SVG data-URL cursor (dark
  ring inside white; hotspot centred; falls back to crosshair). Brush size = brush size × zoom,
  only for Brush / Eraser / Vector (Fill gets the small circle), crosshair above ~120 px (browser
  cursor limit). `App.updateCursor` caches the string; `render()` refreshes it while Brush size is
  chosen; `setPenPrefs` applies it. UI: App settings → Pen and tablet → Cursor, previewed on the
  test pad (`src/ui/pensettings.ts`). Space / R / Z keep their grab / rotate / zoom cursors.
- Manual (Pen and tablet) and an UPDATES entry.
- Checks: `npx vitest run` 643 passed + 1 skipped; `npm run build` passes. Fixtures on 127.0.0.1:5217: vectornext 15/15 (3 new
  cursor checks: the browser accepts each cursor; Brush size grows with zoom), brushcontrols 26/26,
  studentprofiles 28/28, commandrow 44/44, canvasview 25/25. The rest of the suite was not rerun.
- Not checked: Apple Pencil hover on iPad (no cursor there), how each cursor looks on dark and
  light paper by eye, Firefox/Safari cursor rendering.

### Iteration 3: brush import accuracy and vector features (2026-11-01, committed)

Brief: `docs/research/CLAUDE-ITERATION-3.md` (packages A and B), pasted by the owner.

**A. Procreate brush import** (`src/io/brushimport.ts`, `src/ui/brushlib.ts` `importedBrush`)
- Model (`src/core/brush.ts`, all optional, older builds ignore them): `Dynamic.points` (a response
  curve; `evalDynamic` uses it instead of `curve`, then `invert` flips the output), `taperSize`,
  `taperOpacity`, `taperShape`, `grainMode: 'height'`, `grainMin`, `grainMovement`, `grainRotation`,
  `grainFollow` + `grainRef`. `sanitizeBrushExtras` clamps/drops them in `readBrush` (storage) and
  `schema.ts` `brush()` (files). Moving the Curve slider in Brush Studio drops `points` (`panel.ts`).
- Renderer: `src/brush/dabs.ts` `taperProfile` (size/alpha; defaults reproduce the old taper);
  `src/brush/raster.ts` grain pass: height masks (`heightFor`, threshold at the depth, cached),
  depth minimum, rolling grain (per-dab pattern offset when movement < 1), rotation,
  `grainScaleOf` (follows brush size). Defaults reproduce the old pass.
- Importer: `unarchive` now resolves nested objects (curves are `{points:{NS.objects:['{x, y}']}}`);
  `curvePoints`; pressure size/opacity curves; negative amounts → `invert`; speed size/opacity only
  when pressure does not drive that setting; Apple Pencil taper first (Signature's touch taper is 0,
  so it used to import no taper), touch taper otherwise, with size/opacity/shape; StreamLine,
  `plotMovingAverageStabilization` → `stabilize`; real colour-jitter key names
  (`dynamicsJitterHue` …); scatter clamp 0–2 → 0–8; `bundledShapePath`/`bundledGrainPath` looked up in
  the brush folder; grain blend 1 → multiply, 28 → height, others reported; textureMovement, Zoom
  (→ follow size), Rotation (×180°, assumed), Orientation 1; an unreadable archive is skipped and a
  file with none readable fails with a message.
- A4 report: every `ImportedBrush` has `report {mapped, unsupported[{key, why}], unknown}` from the
  `NOT_MAPPED` table; logged with `console.debug('[brush import] …')` on import.
- Tests (`src/io/brushimport.test.ts`, +9): fixture `src/io/fixtures/testbrush.ts` (a .brush written
  by `scripts/make-brush-fixture.py`: Python's NSKeyedArchiver plist, Procreate key names, our
  values) asserts mapped values; the report (37 keys, one unknown on purpose); every Signature key
  has a reason; blend 27 / missing bundled grain / speed-only / scatter 12→8; damaged archive and
  truncated zip fail with `BrushImportError`; inverted curve maths; taper profile; storage sanitising.
  Opt-in corpus test: `BRUSH_CORPUS=<folder of .brush>`; run on 217 local factory brushes (216 Dreams
  1.0.11 + Signature, copied out of the IPAs into a scratch folder, not the repo): all import, 0
  unknown keys. Report: `docs/research/procreate-brush-system/import-report-2026-11-01.md`.

**B. Vector features**
- B1 `src/core/vectorcut.ts`: `vectorWidths` moved here from `brush/vector.ts` (re-exported there);
  the eraser's reach along each segment is radius + the interpolated drawn half-width (pressure,
  point width, tapers); styled lines keep `vectorReach`. (Segment-based hit testing already existed.)
- B2: `at()` already interpolated `w` before this round; now tested (cut through a width peak).
- B3 `src/core/vecedit.ts` `simplifyPoints` (Douglas–Peucker on centreline and width), `smoothPoints`
  (bounded by the tolerance), `segDist`; `App.simplifyLine(smooth)` (tolerance = 15 % of the weight,
  1–6 px), one undo step "Simplify line" / "Smooth line", authored controls reset; commands
  `points.simplify`, `points.smooth` (`src/ui/commands.ts`).
- B4: already present — `StrokeRecord.controls {anchors, modes, handles}` is written by `pushVectors`,
  validated by `readVectorControls`, round-trip tested in `io.test.ts`. Nothing added; no schema bump.
- B5: `VectorErase` gains `'intersection'` ("Only where it crosses": cuts the touched span only where
  the eraser path strictly crosses the line). "Whole line" already existed. `VECTOR_ERASE_NAMES`;
  undo label "Erase (vector: …)"; canvas context-menu chip; stored mode validated on load.
- B6 `src/io/svg.ts`: `vectorsToSvg` (one stroked centreline path per pen line, colour, opacity,
  average width, round caps, per-point half-widths in `data-2dope-w`) and `readVectorSvg` (reads
  that back); `App.exportVectorSvg()`, command `paint.svg` "Export SVG" (Vector pen row).
- Tests: `src/core/vectornext.test.ts` (10) on one fixture (long two-point line, variable-width line,
  crossing pair, closed shape); browser fixture `tests/vectornext.html` + `src/ui/vectornext.browser.ts`
  (12): Simplify/Smooth steps and undo, SVG download point count, only-where-it-crosses (graze vs
  cross, control with Up to crossings), undo label, height vs multiply grain rows, other grain
  fields paint without errors, taper size/opacity at the stroke start.

Checks (actual): `npx vitest run` 79 files, 642 passed + 1 skipped (corpus, opt-in);
`npm run build` passes (existing chunk-size warning); fixture `vectornext` 12/12 on 127.0.0.1:5217;
all fixtures except railperf (it hangs headless Chrome): 48/49 on the first run;
the failure was canvasview's check expecting the undo label `Erase` (now "Erase (vector: up to
crossings)", by design); its assertion was updated in `src/ui/canvasview.browser.ts` and
canvasview 25/25 + vectornext 12/12 pass on rerun. The other 47 were not rerun after that one-line
test change.

Decisions (settled in the follow-up above):
- Grain blends: the corpus has 1 (146 brushes) and **27** (29); 28 only 3. 1 → multiply; 27 and 28
  → height (27 added in the follow-up).
- Scatter clamp: raised for new imports only; stored brushes keep their value (no migration).
  The Scatter slider now reaches 8 for pixel brushes.
- Handles: additive (the existing `controls` field); no schema bump.

Gaps / not verified:
- 214 of 217 factory brushes name Procreate's bundled shape/grain pictures, which are not in the
  file, so their texture cannot come across; grain parity is shown with the fixture only.
- No stroke rendered against Procreate (three pressures / two speeds); height approximation, rolling
  grain, rotation units and the speed sign are reasoned, not measured. Taper `Pressure`, tilt,
  wet mix, dual brush, FFT motion filtering stay unsupported (listed per brush).
- Vector tapers, styled vectors and `vectorstyle.ts` do not use the new taper/grain fields.
- SVG has no variable width (average width; the profile is only in `data-2dope-w`), no styles,
  clips or fills; no SVG import into 2Dope.
- The eraser chip and the Simplify / Smooth / Export SVG buttons were not clicked in the app; the
  fixture calls the App methods. Not checked on touch or iPad.

### Faster effects, floating Effects card, Vignette, Hard edges (2026-11-01, uncommitted)

User feedback: stacked FX lag in Motion previews and while frames generate; the Effects card was awkward (closed on any outside tap, no quick switch between the add list and the layer's effects); Vignette wanted as an effect; pixelate effects only changed the inside of the art.

- Speed (`src/view/effects.ts`): `warp()` and `smear()` no longer allocate an array per pixel (mappings write into a shared `Float64Array`), and bilinear sampling is inlined. `smear()` (Directional blur) and `warp()` (Wave warp) take a `reach` and only work on the painted box padded by it. Blurs (Gaussian, Drop shadow, Glow) go through `blurPainted()`, which blurs only the painted box plus the three-box reach (same pixels as a whole-page blur).
- Preview quality: `fxPreview` 'full' | 'fast' | 'off' (saved as `2dope.fx.preview`), and `setFxPlaying()` from `App.render()`. `fxPreviewScale()` is 0.5 for Fast or while playing. `drawEffected(..., scale)` works at that fraction and pixel-sized settings shrink with it (`scaled()`). Exports always use 1. Off skips layer effects and adjustment layers while you work.
- Effects card (`src/ui/effectspanel.ts`): a floating card that no longer closes on outside taps. Drag the title to move it (`2dope.fx.pos`; double-click resets). Shift+E toggles it for the selected layer (captured, so the eraser shortcut doesn't fire). It follows the selection (`follow()` on editor and tool changes). Tabs "On this layer (n)" and "+ Add effect" (`2dope.fx.tab`; Tab key switches); adding returns to the layer tab. Preview row: Full / Fast / Off.
- New `vignette` effect: amount -100..100, size, softness, roundness, centre. Mosaic and Retro pixels (`dither`) have a `hard` toggle: blocks become fully opaque (average coverage ≥ 50%) or empty, so the outline is pixelated too.
- Manual Effects section and UPDATES entry (2026-11-01) updated.

Measured in Chrome (dev server, 1080p, median of 5):
- Test art: a 300 px disc and a 1300×700 outline.
- Shadow + glow + wave + TV stack: 1518 → 230 ms at Full, 405 → 60 ms at half size; a cached replay takes 0.1 ms.
- Per effect, before → after: radial blur 1635 → 643, directional blur 708 → 139, wave 496 → 84, twirl 404 → 89, mirror 368 → 78, glow 385 → 71, Gaussian blur 345 → 149 ms.

Checks: `npx vitest run` 624/624, `npm run build` passes (existing chunk-size warning). The effects fixture is 23/23, with new checks for Hard edges and Vignette; it also opens the + Add effect tab now. All 48 fixtures pass. railperf is excluded because it hangs headless Chrome; `_vectorportable` is a helper page the runner skips. Shift+E, the tabs and title drag were checked in the dev app.

Gaps:
- Not measured on a phone.
- Twirl, Mirror, Offset and radial blur still walk the whole padded page: their sources can come from anywhere.
- No whole-comp frame cache for Motion playback. Only the per-layer effect cache exists: 96 MB, about 11 padded 1080p frames at Full, about 4× that at half size.
- A wider app performance audit with real student projects wasn't done.

### Adjustment layers are always their own layer (2026-11-01, uncommitted)

Owner feedback: turning a drawing layer into an adjustment layer hid that layer's art; they want a
separate adjustment layer. `src/compedit.ts` `addLayer('adjustment', above?)` puts a new adjustment
layer right above `above` (default top) and keeps the current layer active (no `select`), opening
its Effects. Motion layer menu: "New adjustment layer above" (or "Make it a normal layer" on an
adjustment layer); Draw/Animate layer options: an "Adjustment" tile (above the drawing's whole
stack), and the Adjustment switch only shows on an adjustment layer (to turn it back); Animate Track
menu: "Adjustment". Adjustment layers are left out of the flipbook tracks; "Other layers in this
shot" labels them and opens their effects. Checked in the dev app: a new `Adjustment` layer above,
the original layer unchanged and still active, Effects opened, not a flipbook track. Checks:
624 tests, build, fixtures effects/paintingplanes/workspacefixes/flipbooksource/inkpaint/
paintingworkflow/assetlayers pass.

### Adjustment layers; Motion/Timing tool row in Full (2026-11-01, uncommitted)

- Bug: at the Full level Motion had no tool row. `body.ui-full .bub-tools` hides the bubble tools
  (the top bar has them for Draw), but `body.ws-motion|ws-time .topbar .tools` hides the top bar's
  drawing tools, so Motion and Timing had none. `src/style.css` (end): Full keeps `.bub-tools` in
  Motion/Timing and moves `.bub-ctx` below it (66 px, or `--tools-bottom` under 700 px). Checked in
  the dev app at 1024 px: Motion tools 510–964 × 105–159, context row at 163; Timing likewise.
- Adjustment layers: optional `adjust?: true` on a drawings layer (`src/core/comp.ts`, read/written
  in `src/io/schema.ts`; older builds ignore the field and draw it as a normal, usually empty, layer).
  `src/view/composite.ts` `drawComp`: when a shown adjustment layer with active effects exists, the
  comp is drawn onto its own page (`scratchFor('adj'+depth)`) bottom-up; at the adjustment layer,
  `applyAdjustment` runs its effects on the page so far through `drawEffected` (paint = the page,
  once, not per part), replaces it (opacity 100) or mixes it over (lower opacity); its own drawing is
  never drawn; the page is then drawn onto the target with the caller's transform. Layers above are
  untouched. `drawLayersAround` (Draw/Animate view) skips adjustment layers (effects stay off while
  painting, as for layer effects). No mask from the layer's own pixels yet (whole frame).
- UI: `src/compedit.ts` `addLayer('adjustment')` (top, whole shot, opens Effects) and `setAdjust`;
  Motion comp menu chip "+ Adjustment" and layer menu "Adjustment layer" (check); layer cards tag and
  an "Adjustment layer" switch in the layer options (`src/ui/layercards.ts`).
- Tests: `io.test.ts` flag round-trip; `effects` fixture: threshold on an adjustment layer turns the
  red layer below black, the blue layer above is unchanged, 50 % opacity mixes, no effects = no change.

### Layers lists the shot's other layers (2026-11-01, uncommitted)

Student report (2026-10-31): after the update their finished layers seemed gone and only the rough
sketch showed; deleting the sketch layer made the finished layer appear. So the data was there all
along (the earlier "old address" diagnosis was wrong for this case). Draw's Layers lists only the
drawing you are on (its art layers, `app.celLayers`, unchanged since `4e48166`), so another drawing
layer was never listed, and it was covered by the sketch or hidden by Others.
- `src/ui/layercards.ts`: in Draw/Animate (not inside an asset) an "Other layers in this shot"
  section under the list: each other non-board drawing layer with its eye and a tap to draw on it;
  the header says when Others hides them. The card signature includes every layer's id/name/eye.
  Styles at the end of `src/style.css`; UPDATES entry.
- Checked in the dev app: with two layers, the section listed the other one and tapping it picked it.

### Keyframed effect settings (2026-11-01, uncommitted)

Owner asked for effect settings that React to audio can drive. Effect settings are now keyframable.

- `src/core/effects.ts`: optional `LayerEffect.keys` (`Record<setting, Prop<number>>`, layer time;
  settings = `amount`, `size` when the kind has one, numeric `range` extras); `keyableSettings`,
  `stillSetting`, `effectAt(e, frame)` (keyed values clamped to the setting's range);
  `effectsKey` uses the resolved values (so caching and still effects change per frame);
  `effectsPad` pads for the largest key; `readEffects` validates keys (unknown settings, bad sides,
  non-integer or unsorted frames dropped). Older builds drop `keys` and use the still values.
- `src/view/effects.ts` `drawEffected` resolves each effect at the frame.
- `src/compedit.ts`: `fx:<effect id>:<setting>` PropKeys (`isFx`): get/set through the effect,
  rows appear in Motion once a setting has keys, labels "✨ Glow Radius", numbers format plain;
  `keyEffectSetting` (◆ on/off, one undo step "Keyframe effect" / "Remove effect keys").
- `src/ui/effectspanel.ts`: a ◆ next to every keyable slider; keyed sliders preview and set a
  key at the playhead (`editor.setValue`). `src/ui/motion.ts`: label/value/typing for fx rows.
- Tests: 3 unit tests in `effects.test.ts`; `effects` fixture check (◆ → one step, Motion row,
  export alpha beside bright art grows from frame 0 to 20, `bakeReaction` writes keys on the row).
- The open Effects card re-renders on frame change when a setting is keyed (`frameChanged`, chained
  to `app.onFrameChange` in `src/main.ts`; skipped while a control in it has focus). Checked in the
  dev app: Radius slider read 0 / 30 / 60 at frames 0 / 10 / 20.
- UPDATES entry. Not done: choices, colours and toggles are not keyable.

### Send to another project (2026-10-31, uncommitted)

Owner choice: Send-to (from the source project), not Bring-in. A student reuses a drawing (head and
hair) in another project in about three taps.

- New `src/io/sendto.ts`: `sendToProject(src, item, store, targetId, where, residency)` copies a
  layer stack (`{kind:'layer', layers}`: the layer with its linked art layers, every exposure and
  mask) or an asset graph (`artworkGraph`) into a project loaded from the store (not opened, no
  History), via `copyArtworkGraph` + `cloneStoredDrawing`, then saves it at once (`captureProject`
  library mode: the target's existing drawings keep their stored keys; `saveHead` like autosave).
  `start`: a layer's layers go on top of the target's main comp from frame 1; an asset is added
  and placed (`compLayer`, loop, locked) on top. `library`: an unplaced asset (a layer stack is
  wrapped in an asset comp named after the layer). Limits checked (`MAX_COMPS/DRAWINGS/VECTORS`).
  Same page size: the exact bytes or stored keys (`snapshotArtwork`). Different size: pixels
  scaled to fit and centred (`fitPage`), vectors (points, brush size, symmetry centre, control
  anchors/handles, clip matrices), layer position/anchor (values and keys), part offsets and comp
  sizes follow (`fitStroke`, `fitComp`). Sounds of an asset are copied by path. `style.mask`
  of styled vectors is not rescaled (left as is).
- UI: `src/ui/layercards.ts` Send to… in the swipe-left quick actions and the options' Layer
  section (`sendTo` hook); `src/ui/artworkassets.ts` Send to… on asset cards and in the
  placement's Copies menu (`sendTo` hook); `src/main.ts` `sendToFlow`: pick a project (`pickBox`,
  most recently opened first, open project excluded), then where, then a toast with Open project.
- Tests: `src/io/sendto.test.ts` (fit maths, 3 tests); fixture `tests/sendto.html` +
  `src/ui/sendto.browser.ts` (MemoryStore, 6 checks: same-size layer with identical pixels on
  frames 1–2, different size scaled and centred, layer to library, asset to start and library,
  source unchanged with no undo step, targets still open with their old drawings).
- Manual (Projects) line and an UPDATES entry.

Checks (actual): `npx vitest run` 78 files / 620 passed; `npm run build` passed; browser fixtures on
127.0.0.1:5217: sendto 6/6, paintingplanes, assetlayers, artworkworkflow, artworklibrary,
paintingworkflow, assetnames, inkpaint all pass (8/8). Not checked: the full fixture suite, the
pickBox flow clicked through in the real app (the fixture calls `sendToProject` directly), touch,
very large layers (encoding cost), styled vectors with `style.mask` on a different page size.

### Audio React: bake audio-reactive keys (2026-10-31, uncommitted)

Brief: pasted by the owner (spec `docs/research/CLAUDE-ITERATION-2.md` §9, evidence
`docs/research/freqreact/README.md`). Bake only: no expressions, no live analysis.

- New `src/core/audioreact.ts` (+ `audioreact.test.ts`, 7 tests): radix-2 `fft`; `bandEnvelope`
  (Hann window, **FFT 2048** centred on each frame, band magnitudes summed and scaled so a full-scale
  sine in the band ≈ 1, **absolute, not normalised to the clip's peak**, so a quiet band stays low;
  Decay = peak hold, Smoothing = one-pole); reactors `pulse`, `elastic` (FreqReact's
  `triangle(τ·10)/exp(τ·decay)·mod` with τ = time since the last hit, see note), `oscillate`,
  `flicker` (seeded `hash01`); `bake` (one offset per frame, ×Master, Time offset); `monoMix`;
  `MAX_REACT_FRAMES = 3600`.
- New `src/ui/audioreactdialog.ts`: "React to audio…" dialog (Source clip, Band start/end, Reactor,
  Intensity, Decay, Smoothing, Time offset, Master, Elasticity / Speed + Wave / Seed shown per
  reactor, Direction for points, Range: selected keys / work area / whole shot), settings saved per
  device (`2dope.audioreact`, validated), envelope cache keyed by clip placement, trim, fps, range and
  band settings; decodes through the existing `SoundBank` (no Web Audio graph). Nothing selected →
  notice, no dialog; no clip → notice.
- `src/compedit.ts`: `bakeReaction` (one undo step "React to audio", base value + offset through
  `setKey`, per-axis for points) and `selectedRows`. `src/ui/motion.ts`: key menu entry and a
  `sounds` field set from `src/main.ts` (`motion.sounds = audioPlayback.bank`). Timing has no key
  rows, so it is Motion only. Settings are device-only (not stored on the layer).
- Fixture `tests/audioreact.html` + `src/ui/audioreact.browser.ts` (9 checks). Manual line + UPDATES.

Measured: 100 Hz sine in 90–110 Hz ≈ 0.5+ at mid-clip; a 1 kHz tone in the same band < 0.01
(ratio > 100); 1 kHz tone in 900–1100 Hz > 0.5. `bandEnvelope` 10 s / 240 frames / FFT 2048:
**40 ms** (node), so 2048 was kept. Browser fixture: decode + analyse + bake of a 2 s WAV 83–90 ms;
48 keys, values within 50…90 for Intensity 40 on a base of 50, beat frames high and quiet frames low;
undo restores in one step, redo re-applies; save → reopen gives the same values; the export
compositor's alpha follows the baked opacity; same settings bake identical keys.
Note on Elastic: the brief's `exp(env·decay)` with the envelope as `env` would wobble during
silence; FreqReact's trigger input is a time since the hit, so τ is used (stated in the code).
Not checked: long clips near 120 s (cap at 3600 frames is reported in the notice), Lite/iPad memory
and time, Steps/Switch/Trigger (later), storing settings on the layer for re-baking.

### Animate: layers belong to the drawing, tracks to the timeline (2026-10-31, uncommitted)

Owner decision (2026-10-31): in Animate, Layers = the layers inside the drawing (Procreate Dreams
style, same capabilities as Draw); tracks (drawing, assets, media, camera, anchors) live on the
timeline; a placed asset shows its own layers, **editable in Animate with a shared banner**.

- `src/ui/layercards.ts`: scoping uses `isPaintingWorkspace` (Draw and Animate) instead of Draw
  only, so Animate's Layers shows the current track's art layers (`app.celLayers`), + adds an art
  layer, and the Animation/Background/Object/Notes/Media add menu no longer shows there.
- `src/ui/flipmode.ts`: the Track button still adds an animation track on tap; hold or right-click
  opens New track: Animation, Background, Object, Notes, Media (moved from the Layers + menu).
- `src/ui/layerspop.ts` ("All layers"): back to drawing and group tracks only (the package 8
  camera/anchor rows and their notice are removed; type labels for group/board stay).
- `src/core/assets.ts` `open(id, layer, stay)`; `src/ui/artworkassets.ts` `openSource(…, here)`
  and the auto-exit from source editing in Animate is removed; `src/main.ts` passes `here` when a
  layer is tapped in Animate's Layers. Edit source (placement toolbar) still opens Draw. The existing
  header ("Source: X · Updates N placements · Done") is the banner; Make independent already exists.
- Fixtures updated to the new model: `assetlayers` (stays in Animate; Animate Layers shows the
  drawing's layers, not tracks), `paintingplanes` (Background via the Track menu).
- UPDATES entry.

### Package 8: layers, Animate tracks and video presets (2026-10-31, uncommitted)

Brief: `docs/research/NEXT-ITERATION-BRIEF.md`. Most of A already existed (row with thumbnail,
name, state tags, eye; swipe right = multi-select, swipe left = quick actions; hold-drag reorder;
options with opacity, blend, Alpha Lock, Clipping, Reference, Merge, Rename, Mask, Effects; groups
as precomp folders, so **A6 needs no schema change**). D (mode labels, transport order, bottom bar)
was done in the UI cleanup iterations.

- A: `src/ui/layercards.ts` swipe-left quick actions gain **Clear** (picks the layer, then
  `clearFrame`, one undo) for unlocked drawing layers.
- B: `src/ui/layerspop.ts` — in Animate/Timing/Motion the list shows every track with a type label
  (group, board, camera, anchor; drawing rows keep their plain name); tapping a camera/anchor gives a
  notice instead of painting. Ink/Colour rows: the eye works on any track via `editor.setPart` (one
  undo, same model as Motion), a summary of opacity and recolour (with a swatch), and an
  **Effects** button that opens that layer's card. No solo/mute (the eye and Others cover it).
- C: `src/io/videoplan.ts` `VIDEO_PRESETS` (Web video 1080p high MP4, Animatic 720p standard,
  Master original high; see-through still forces WebM) and `videoPresetOf`; `src/ui/share.ts`
  Video has a Preset row that sets format/size/quality and follows Advanced changes ("Your own
  settings"). Remembered through the existing video options. Not done: a Frames preset (the PNG
  frames card already exists), resolution Half/Custom, quality Studio, range = work area.
- Styles at the end of `src/style.css`; UPDATES entry; `videoplan.test.ts` preset test.

Checks (actual): `npx vitest run` 76 files / 610 passed; `npm run build` passed; browser fixtures
**46/46** on 127.0.0.1:5217. Dev app (Animate): tracks listed as Anchor · anchor, Camera · camera,
drawings plain; tapping Camera gave the notice; hiding Ink on a non-active track was one undo step
("Hide ink") and undo restored it; Effects opened for that track. Share → Video: Quality change
made the Preset row follow (custom → web), Animatic set 720p/standard. Not checked: the swipe Clear
by touch (same functions as the options' Clear), phone widths, real touch.

### E: welcome screen, samples and time-lapse (2026-10-31, uncommitted)

- New `src/ui/firstrun.ts`: one-screen first run (five tips: modes, Draw, gestures, keyframes,
  Share; Simple / Full; start blank or a sample). Shown once per device (`2dope.firstrun.done`), only
  when the library is empty, through `files.askNew` in `src/main.ts`; a sample choice opens the
  sample after `files.start()` and the untouched blank project is removed. Styles at the end of
  `src/style.css`. Static text tips, not the animated demos the plan describes.
- New `src/io/samples.ts`: code-drawn samples (no bundled files): Bouncing ball (12 drawings on 1s
  at 12 fps, squash on contact, floor layer) and Sliding title (badge with eased position, rotation,
  scale bounce, drop shadow). `src/ui/files.ts` `addSample()` saves a copy (with its PNG assets) and
  opens it; `src/ui/gallery.ts` has a Samples button. No storyboard or walk-cycle sample yet.
- New `src/ui/timelapse.ts`: after each document change (700 ms idle, never mid-stroke) a ≤360 px
  JPEG of the shot at the playhead, per open project, **in memory for this session only** (not in
  the project file, not in IndexedDB), capped at 600 by keeping every other picture. Share has a
  ⏱ Time-lapse button (`ShareHooks.timelapse`): replay (play/scrub), Save as GIF (fixed palette,
  12 fps, ≤480 px), and an on/off switch (`2dope.timelapse.off`).
- Fixture `tests/firstrun.html` + `src/ui/firstrun.browser.ts` (MemoryStore; 5 checks: welcome
  answers and Escape, both samples' structure and pixels, blank removed, time-lapse record/replay/
  off). Unit test `src/ui/timelapse.test.ts`. Manual (Projects/Share) and an UPDATES entry.

Checks (actual): first-run fixture 5/5; headless screenshot of the welcome screen at 390×844 (fits,
readable); Save as GIF in the dev page produced a 3-frame GIF that decodes with the right colours.
`npx vitest run` 76 files / 609 passed; `npm run build` passed; browser fixtures **46/46** on
127.0.0.1:5217. Not checked: the real first start
on a fresh device/origin (the fixture drives the same functions), touch, iPad memory with 600
time-lapse pictures (~10 MB at most), and keeping a time-lapse across sessions (not built).

### Effect default fixes: Glow, Roughen thin lines, Retro TV static (2026-10-31, uncommitted)

- `src/view/effects.ts`: Glow's brightness is now the brightest channel (HSV value), so vivid
  colours glow at the default 60 % threshold (the red test shape glows; black ink still does not).
  Roughen scales its displacement by local paint coverage (`boxMean` over the roughness radius,
  `k = min(1, coverage / 0.5)²`): a 1.5 px line keeps 68 % of its ink at the default (was 39 %),
  rims of thick strokes/shapes unchanged (still 141 rim pixels on the 36 px square). Retro TV static
  amplitude 160 → 96. `src/core/effects.ts`: Retro TV Static default 12 → 6 %.
- `effects` fixture: new check that a thin line keeps ≥ 55 % at the default (19 checks). UPDATES entry.

Checks (actual): `npx vitest run` 608 passed; `npm run build` passed; browser fixtures **45/45** on
127.0.0.1:5217; looked at the headless look grid (thin line intact, glow on red, lighter static).

### Iteration 2 packages 2–7: key tools, twelve effects, dither/Fringe, Retro TV, GIF options (2026-10-31, uncommitted)

Plan: `docs/research/CLAUDE-ITERATION-2.md` (packages 0–1 are the section below). Package 8 not started.
Decisions kept as proposed: no layer groups; effect cards named Drop shadow, Glow, Fringe, Retro TV;
Wiggle in Motion's key menu (Timing has no keyframes, so it is Motion only).

- **2 Key tools.** New `src/core/keytools.ts` (+ `keytools.test.ts`, 10 tests): `wiggle` (keys every
  fps/frequency frames between the range ends, each within ±magnitude of the motion underneath,
  dims both/X/Y, jagged↔smooth, seeded by `hash01`, existing keys kept), `smoothKeys` (greedy
  removal within a tolerance, ends kept), `loopKeys` (cycle / ping-pong / offset, N repeats,
  replaces keys inside the new range), `staggerOffsets` (order / reverse / seeded random).
  `src/compedit.ts`: `wiggleKeys`, `smoothSelectedKeys`, `loopSelectedKeys`, `staggerLayers`,
  `copyEasing` / `pasteEasing` (one undo each; a row with one selected key uses its whole range).
  `src/ui/motion.ts`: key context menu Wiggle… / Smooth keys… / Loop keys… / Copy / Paste easing;
  layer menu "Stagger N layers…" with several selected.
- **Effects model.** `src/core/effects.ts`: optional `LayerEffect.params` validated per kind by
  `EffectDef.extras` (range / choice / colour / toggle; unknown keys dropped, numbers clamped),
  `param()`, `EffectDef.pad` + `effectsPad()`, `seeded` flag; `effectsKey` includes params;
  `resetEffect` clears them; `effectTick` uses `animated`. No schema version change: older builds
  drop unknown types (and ignore `params`). `src/ui/effectspanel.ts` renders extras in Advanced
  (sliders preview live, one undo on release; choices, colour, toggles one undo each); New pattern
  only for seeded kinds.
- **Padding.** `src/view/effects.ts` `drawEffected` works on the page grown by `effectsPad` on every
  side (and takes the comp fps); `src/view/composite.ts` draws the result at −pad (mask at +pad).
- **3** Drop shadow (distance, softness = blur/2, direction 135° = down-right, opacity 50, colour,
  shadow only; pad dist + 1.5·soft + 2), Glow (bright-pass with soft knee on threshold, blur radius,
  intensity, original on top / behind (add) / glow only; pad 1.5·r + 2), Directional blur (length,
  angle; pad len/2 + 2), Radial blur (spin degrees or zoom %, centre).
- **4** Posterize, Mosaic (blocks across/down, sharp), Find edges (Sobel over white, invert, mix),
  Threshold, Twirl (angle, radius %, centre), Mirror (angle, centre), Offset (wrap shift, mix),
  Wave warp (height, width, shape, direction, speed in waves/s using comp fps, phase, pin edges;
  animated). Motion Tile and CC Vignette **not done** (optional).
- **5** `src/core/dither.ts`: `ORDERED` matrices (Bayer 2/3/4/8, 5×3, 8×1, 1×8, 12×4, 4×12, diagonal
  5×5, cluster 8×8; non-power sizes ranked from a low-discrepancy lattice, not copied), `orderedAt`
  tiling, `bias` per channel; Retro pixels gains R/G/B threshold extras (−100…100 → ±128).
  Fringe effect (offset, copies 1–8, 8 directions, falloff; drawn behind; pad offset + 2).
- **6** Retro TV (`tv`): Strength mix, Static (seeded dashes, `size` = dash length), Chroma loss,
  Chroma shift with 4-line phase, Phase offset, Scanline blur, Roll (rows/frame, tied to the cached
  tick), Distortion speed (noise changes per tick × speed). Not a signal model.
- **7** New `src/io/gifpalette.ts`: `GifOptions` (colours 2–256, loop for ever/once/N, dither
  none/ordered 1–3/diffusion, better colours, pixel art), `readGifOptions`, `medianCut`,
  `mapToPalette`. `src/io/gif.ts`: header takes a palette and loop (once = no NETSCAPE block);
  frames take indices and a see-through index. `src/io/exportgif.ts`: default options keep the
  old fixed RGB332 path byte for byte; otherwise palette from frame 0 or (better) from every
  frame in a first pass. `src/ui/share.ts`: GIF Advanced rows, saved as `2dope.gif.options`.
- Manual Effects / GIF lines and three UPDATES entries; Motion manual line for key tools.

Checks (actual): `npx vitest run` **75 files / 608 passed**; `npm run build` passed; browser fixtures
**45/45** on 127.0.0.1:5218 (5217 was taken), `effects` now 18 checks (shadow direction/opacity/padding
past the page edge and in `drawComp`, shadow only, glow only on bright art, directional streak axis,
radial spin≠zoom, posterize/threshold/mosaic/edges, twirl/wave identity at 0, mirror, offset wrap,
wave moves over frames, fringe side/falloff, Retro TV identity/seed/frames/roll, params undo through
the real card). Dev app: wiggle/smooth/loop/paste easing/stagger each one undo step. Real GIF exports
decoded with `decodeGif` for default, 16-colour ordered, 4-colour better+once, 8-colour pixel art.
Looked at a headless grid (thin line, thick stroke, filled shape): shadow, wave, fringe, twirl look
right; Glow does nothing on dark or mid-red art at the default 60 % threshold (by design, but may
surprise); Retro TV static is strong on large flat colour at 12 %.
**Not checked:** effect cost on a phone (all CPU ImageData passes; radial/directional blur and warps
are per-pixel on the padded page, cached per frame), the Share dialog and Motion menus by hand at
phone width, real touch, Blender export of the new effects (they are pixels like the others).

### Effects fixture (Roughen edges, Gaussian blur) and Motion easing Tier 1 (2026-10-31, uncommitted)

**Task 1, verification.** New fixture `tests/effects.html` + `src/view/effects.browser.ts` (8 checks,
drives `drawEffected`, `drawEditingLayer` and the real `EffectsPanel`): blur 0 is pixel-identical;
blur 8 spreads a hard dot with worst soft-edge RGB drift 5 (no darkening); roughen changes 141 rim
pixels of a 36 px square, never adds alpha, keeps the inside at 255 and RGB within 2 (alpha ≥ 64);
same seed/frame repeat exactly, hold 2 holds frame 1 and changes at frame 2, hold 1 and a new seed
change it; Ink roughen leaves Colour untouched and vice versa, whole-layer blur hits both; the layer
you draw on renders without its effects; Add / slider release / New pattern are one undo step each
(live slider preview and the Simple→Advanced switch add none), undo restores each, autosave notified.
Look (headless screenshot of the fixture's grid): thick stroke and filled shape roughen well;
**a thin 1.5 px line breaks up badly** (keeps 39 % of its ink at the default 3 px, mostly gone at
8 px), and thick strokes at 8 px get a smeared rim. Not fixed; consider scaling roughness by local
stroke width or a lower default for Ink.

**Task 2, easing.** `src/core/anim.ts`: `CURVES` (the 12 presets from the research table as data),
`curveSides`, `curveOf`, `setSegmentSide(prop, f, 'in' | 'out', side)`, `setSegmentCurve`. No
schema change (plain `Side` values). `src/compedit.ts`: `setEaseSide`, `setCurve`,
`curveOfSelection` (one undo step each). `src/ui/motion.ts`: Easing row gains **Ease in only**
(eases the segment's start = AE Easy Ease Out on the first key) and **Ease out only** (its end = AE
Easy Ease In on the next key) plus a **More…** select of the 12 curves; key labels name a matching
curve instead of "Custom". Names follow 2Dope's existing meaning (ease in = slow start), which is
the opposite of AE's key-centred wording. Manual Easing line and an UPDATES entry.
`src/core/anim.test.ts`: 3 tests (per-side keeps the other side; all 12 round-trip, stay
monotonic and match the table; back to the five easings).

Checks (actual): `npx vitest run` **74 files / 587 passed**; `npm run build` passed (chunk-size
warning only); browser fixtures on a separate origin (127.0.0.1:5218) **45/45** including the new
`effects`. In the dev app: Ease in only → Ease out only → Expo decelerate → Linear gave the expected
sides, each one undo step, four undos returned to the start. Not checked: how the wider Easing row
lays out on a phone/tablet (no screenshot), real touch.

### Textured brushes fast on phones (2026-10-31, uncommitted)

User reported heavy Draw/Animate lag on a Pixel 9. Cause (measured in the in-app browser at
412×915, Lite, 1920×1080 page, GPU canvas, timing flushed by a 1 px readback): every grained dab
(Pencil — the default brush — Charcoal, Shading Pencil, Textured Paint) was drawn, paper-cut and
copied through one small scratch canvas, so the GPU stalled once per dab (≈1 dab/px for Pencil), and
the live preview recopied the whole page every frame.

- `src/brush/raster.ts`: grained dabs are now prepared in slots of a 256×256 sheet (`atlas`,
  clipped per slot, paper still in document coordinates) and copied to their buffer in order by
  `flushStamps()` at the end of `addDabs`/`drawGhost`, or before an ungrained dab on the same
  buffer: one stall per batch instead of per dab. Dabs ≥ 256 px keep the old one-at-a-time path.
  `displaySource()` copies the page into `work` once per stroke (`workReady`), then only restores
  and repaints the stroke's growing box. State resets in `begin`/`cancel`/`bind`/`resize`.
  A 1024 sheet failed the brushperformance reference in Chrome's software canvas (Pencil 128 px,
  premultiplied RGB error 2.8 > 2.05: grain sampling far from the origin); 256 passes.

Measured (same method, ms per pointer move, before → after): Pencil 8 px stroke 13.3 → 0.76,
stroke + screen render 63.7 → 0.66; Textured Paint 0.1 / 0.5 after; ungrained brushes unchanged
(0.23 / 0.5). Live preview vs a full recompute: max channel difference 0 (Pencil), 1 (Textured
Paint, Pencil eraser). brushperformance reference check passes headless (software) and in the GPU
pane (all ≤ 1.9 premultiplied error). `npx vitest run` 587 passed, `npm run build` passed,
browser fixtures **45/45** on 127.0.0.1:5218.
Not checked: a real Pixel 9 or iPad (desktop GPU only); Animate with many onion skins; the
per-move `#stats` DOM update (left as is, `app.ts` is being edited by the Story session).

### Story C iteration 2: scenes and shot / camera stickers (2026-10-31, uncommitted)

Before this: Script to panels was checked (vitest 581, build, 44/44 fixtures) and committed as
`f2ed57b` (not pushed). Nothing from another session was pending.

**No file-format change**: both features read and write existing captions.

- New `src/core/scenes.ts` (+ `scenes.test.ts`, 3 tests). Stickers live in Camera / framing as
  " · "-separated words: `SHOT_STICKERS` (EWS, WS, MS, CU, ECU, OTS, POV; one per panel,
  `toggleShot` replaces/clears) and `MOVE_STICKERS` (Pan/Tilt/Dolly/Zoom/Truck ×2, Shake; `toggleMove`
  on/off); typed words are kept. Scenes come from Shot / scene: `parseShot` ("Sc 2 · Sh 3 · rest"),
  `scenesOf` (a panel without "Sc" belongs to the scene before; 0 = none yet), `sceneColour` (fixed
  hue per number), `renumberScenes(shots, at)` (a scene starts at `at`, at a "Sh 1" / bare "Sc N", or
  where the number changes; scenes and shots are renumbered in order, the heading text kept, panels
  before the first scene untouched, 60-char cap).
- `App.newSceneAt(i)`: one Undo step ("New scene") that rewrites every shot caption via
  `editTimeline`. `App.setCaption` takes an optional Undo label (stickers say "Add/Remove sticker").
- Panels cards (`board.ts`): sticker chips under Camera / framing (aria-pressed; focus stays on the
  tapped chip after the rebuild), **New scene here** under Shot / scene, a scene-colour top border.
- Grid (`boardgrid.ts`): a full-row scene header before each scene's first panel ("▾ Scene 2 ·
  EXT. STREET · 2 panels · 72f", colour bar) that folds the scene's tiles (session only), scene
  colour on tiles, sticker badges on the picture. Current/selected marking now goes by `data-i`
  (folded tiles are absent); keyboard counts only tiles.
- CSS at the end of `style.css`; manual (Story) and an UPDATES entry.

Checks (actual): `npx vitest run` **584 passed** (+3); `npm run build` passed; browser fixtures
**44/44**. Dev app on 127.0.0.1:5217 (9-panel test board from the script iteration): on panel 3,
CU then Pan left then WS gave Camera "WS · Pan left" with WS and Pan left pressed and focus kept on
WS; New scene here on panel 7 renumbered panels 6–9 to "Sc 2 · Sh 2", "Sc 3 · Sh 1…3" while panel 1
(no scene) stayed empty; Undo restored the old shots, Redo reapplied; Grid showed three scene
headers with panel counts/lengths, the "WS←" badge, and folding scene 2 hid its 2 tiles (9 → 7) with
aria-expanded false and focus on the header (screenshots). The New scene button first sat in the
card header and was clipped at 230px; it moved under Shot / scene and fits. Not checked: the PDF
with stickers (Camera text is printed by the existing exporter), touch, phone width, export numbering
per scene (shot list 1A/1B is not built), scene colours chosen by people (fixed by number).

Still open for C: "Animate this" from a panel (panel → shot), dragging stickers from a tray onto
panels, per-scene numbering in exports.

### Story C iteration 1: Script to panels (2026-10-31, uncommitted)

Before this: the Story views work was checked (vitest 576, build, 44/44 fixtures) and committed as
`d79bb9e` (not pushed). Nothing from another session was pending, so nothing was left out.

Backlog item C (next-phase Story 3, then 8 "Animate this", then stickers/scenes). First iteration:
**Script → panels**.

- New `src/core/script.ts` (+ `script.test.ts`, 5 tests): `parseScript(text, fps)` reads plain text
  or Fountain in blank-line blocks. Scene headings (INT/EXT/EST/INT./EXT/I/E, or a forced `.Heading`)
  start scenes; a NAME cue block (extensions like (V.O.) and parentheticals dropped, `@` forced cues,
  ALL-CAPS names title-cased by `speakerName`) → one Dialogue panel "Name: words"; consecutive
  `Name: words` lines in plain text → one panel with several lines; any other paragraph → an Action
  panel (`!` forces action). Skipped: title page (only at the start), transitions (`… TO:`, `>`,
  FADE IN/OUT, CUT TO BLACK, THE END), `[[notes]]`, `/* boneyard */`, `#` sections, `=` synopses,
  `===` page breaks. Shot / scene = `Sc N · Sh M`, the first shot of a scene adds the heading (cut to
  60 chars). Lengths: `guessSeconds` (speech ~2.5 words/s + 0.5 s, action ~3 words/s, 2–8 s in half
  seconds). At most 300 panels (`dropped` reports the rest). Captions capped at 1000 chars.
- `App.addScriptPanels(panels)` (Story only): new drawings + exposures with shot/action/dialogue via
  `editTimeline` — one Undo step, inserted after the selected panel. With no board, it starts one
  (its own Undo step, as before) and the script panels replace its blank starter panel.
- `ui/dialogs.ts` `askLongText` (modal with a textarea and a live summary; Ctrl/⌘+Return adds);
  `ui/board.ts` **Script** button in the Story bar and **Paste a script…** on the empty board; the
  dialog says "N panels in M scenes, about …" before adding. CSS for the wide dialog in `style.css`.
- Manual (Story) and an UPDATES entry.

Checks (actual): `npx vitest run` **581 passed** (+5); `npm run build` passed; browser fixtures **44/44**.
Dev app on 127.0.0.1:5217 (test project at 12 fps, 5-panel board): empty dialog said "Nothing pasted
yet." with Add disabled; a Fountain sample (2 headings, an action, SAM with a parenthetical, MRS. LEE
(V.O.), CUT TO:, a second action) read "4 panels in 2 scenes, about 102f"; Add inserted them after
panel 1 with shots "Sc 1 · Sh 1 · INT. HALLWAY - NIGHT", "Sc 1 · Sh 2", "Sc 1 · Sh 3",
"Sc 2 · Sh 1 · EXT. STREET - CONTINUOUS", dialogue "Sam: Is anyone there?" / "Mrs. Lee: Go home,
Sam." and the notice; one Undo went back to 5 panels, Redo to 9 (screenshot of the dialog). Not
checked: the no-board path (starter panel replaced) in the browser, pasting on iPad, very long
scripts in the browser, real Fountain files with dual dialogue (`^` is stripped, both speak in turn).

Still open for C: "Animate this" (panel → shot), shot-type and camera-move stickers, scenes with
colour labels and per-scene numbering in exports.

### Story views iteration 2: Grid, and Strip timing that snaps (2026-10-31, uncommitted)

The user asked to continue item B with Grid and Strip after Present. 8bf6b47 and 95f29d2 were pushed
by the main session (deploying); this session pushed nothing.

- **Grid** (new `src/ui/boardgrid.ts`, `BoardGrid`): a fourth Story view (`BoardView` =
  grid | panels | timeline | split, exported from `board.ts`; `2dope.board.view` accepts `grid`). Tiles
  show the panel picture (BoardPanel's `paintThumb`), number, length and first line (`tileLine`: the
  first dialogue line "Who: text", else the action). Tap = `goPanel`; double-tap or Enter =
  `writeOn` (Panels view, card scrolled in, first field focused); hold / right-click = the existing
  `frameMenu`; drag (8px threshold, pointer capture) onto another tile = `moveSelectionTo(target)`
  (one Undo, via the shared timeline command); arrow keys move by tile / row. − / + (2–8), pinch or
  Ctrl/⌘ + wheel set per-row count, saved at `2dope.board.gridcols`. Rebuilds only when panels,
  captions or thumbnails change. The options-row Story chips gained Grid and now follow view changes
  made from the Story bar (`board.onView` → `bubbles.update()`; before, they could stay on Panels).
- **Strip (Story Timeline)**: edge drag uses new `snapPanelLength(len, fps, slop)` in
  `core/timeline.ts` (+ unit tests): lengths within ~8px of a whole or half second snap to it; Alt
  drags freely. The dragged panel shows its length (`data-len` badge, `.btl-panel.timing`). Existing
  edge ripple, drag-to-reorder, pinch / Ctrl+wheel zoom and saved zoom were already there.
- CSS at the end of `style.css`; manual (Story views and Timeline lines) and an UPDATES entry.

Checks (actual): `npx vitest run` **576 passed** (+2 snap tests); `npm run build` passed; browser fixtures **44/44**;
dev app on 127.0.0.1:5217 (test project, 5-panel board): Grid shows 5 tiles with
"Panel 1, 24f: Sam: Is anyone there?" etc.; + + set 6 per row (6 grid columns, saved), − − back to 4;
tap marked panel 3 current; dragging tile 1 onto tile 4 showed the drop ring and moved "Sam" to
position 4; double-tap opened Panels with "Panel 4 line 1 speaker" focused; chips showed Grid
pressed after using the Story bar (screenshot). Timeline: an edge dragged to 47f showed "48f" and
committed 48f; with Alt it read 47f; a drag to 46f stayed 46f (outside the snap zone). Not checked:
real pinch / touch drag, phone width, keyboard arrows by hand, Undo of a Grid move by hand, auto-scroll
while dragging in a long Grid (not built). No fixture added.

Still open for B: drag auto-scroll and drop-between markers in Grid, remembering scroll per view,
Strip snapping to the playhead and other panels' edges, then script to panels and scenes.

### Story views iteration 1: Present (2026-10-31, uncommitted)

Committed before this (not pushed): `8bf6b47` research docs and `95f29d2` UI cleanup iterations 1–4,
onion settings, Roughen edges / Gaussian blur, manual and handoff. Checks before that commit:
vitest 574 passed, build passed, browser fixtures 44/44.

Backlog item B (next-phase Story priority: Grid · Strip · Present). Story already has Panels
(cards), Timeline (strip on the clock) and Both, which cover most of Grid and Strip, so the first
iteration builds the missing **Present** view.

- New `src/ui/present.ts` (`StoryPresent`): `body.presenting` puts `.stage-col` full window (black),
  hides every stage overlay except the canvas, the existing live dialogue subtitle and a
  `.present-layer`. The layer swallows pointer input (nothing reaches the board canvas): tap =
  play/pause, horizontal swipe ≥50px = next/previous panel (`app.goPanel`), plus a bar with Play,
  ‹ count ›, Done. Keys (window capture, so the app's Space/Enter do not double-fire): Space/Enter,
  ← → / PageUp/PageDown, Escape. It shows the current panel's Action under the subtitle, requests
  browser full screen when allowed (leaving full screen ends Present), stops playback on exit and
  ends itself if the workspace changes or the board disappears. Viewing only: no History, no saves.
- `ui/board.ts`: a Present button after Play (optional 4th constructor callback). `main.ts`
  creates `StoryPresent` with a fit callback (`app.view.fit` with the bar and caption reserved at the
  bottom; normal `app.fit()` after exit) and updates it on frame changes. CSS at the end of `style.css`.
- Manual (Story section) and an UPDATES entry.

Checks (actual): `npx vitest run` 574 passed; `npm run build` passed; browser fixtures **44/44**. Dev
app on 127.0.0.1:5217 (test project; created a 2-panel board with a "Sam: Is anyone there?" line and
two Actions): Present opened at the current panel with its action; ← went to panel 1 with the
subtitle "Sam: Is anyone there?" and its action (screenshot); tap toggled play/pause; swipe left/right
changed panel 1→2→1; playing advanced the counter 1/2→2/2; Escape and Done exited and restored the
layout. Browser full screen was refused for the scripted click (needs a real user gesture), so it
was not observed. Not checked: real touch, iPad Safari (no Fullscreen API on iPhone), phone layout,
long multi-line dialogue, a board with real drawings. No fixture added.

Still open for B: a denser Grid (pinch to change cards per row, drag to reorder), Strip edge-drag
timing with snapping, remembering zoom/scroll per view, then script to panels and scenes.

### Roughen edges and Gaussian blur, plus the mograph/draw research behind them (2026-10-31, uncommitted)

User asked to continue the reference REA, mine EffectCraft, the After Effects plug-in collection and
the Procreate IPA for effects/motion settings worth integrating, and named two gaps: roughen edges
and Gaussian blur.

**Built (source):**

- `src/core/effects.ts`: two new effect types. `roughen` (label Roughen edges; target Ink; Roughness
  0–20 default 3; Size 8–160 default 34; Hold 1–8 default 2; seeded) and `blur` (label Gaussian
  blur; whole layer; radius 0–40 default 6; `sizeRange [0,0]`). `effectTick` treats blur as static.
- `src/view/effects.ts`: `roughen()` is **alpha-only** (pull the alpha from where a 2-octave seeded
  noise points, scaled by Roughness; colour untouched, so thin ink does not grey out and shape
  interiors stay solid; nothing is added past the artwork). `blurLayer()` reuses `applyBlur()` (three
  separable box passes, premultiplied).
- `src/ui/effectspanel.ts`: the Advanced Size row is skipped when the effect has no second knob.
- `src/core/effects.test.ts`: defaults, clamping and target for both.
- `src/ui/manualtext.ts`: Effects wording now lists both, and a 2026-10-31 UPDATES entry.

**Research written** (no code copied; parameters/behaviour only):

- `docs/research/motion-mograph-integration-2026-10-31.md` — synthesis and ranked plan (Tier 1:
  Easy Ease In/Out and the 12 named ease curves from EffectCraft's shipped panel; Tier 2:
  directional blur, glow, drop shadow, motion blur 180°/−90°/16 samples, keyframe loop/stagger/
  bounce; Tier 3: Procreate onion tint, playback modes, QuickShape delay, StreamLine).
- `docs/research/effectcraft-0.19-effects/README.md` (+ `extract_effects.py`) — 306 effects / 3,014
  params catalog; Roughen Edges and Gaussian Blur parameter tables; motion-blur and easing defaults.
  Checkout is workspace 0.6.0, not 0.19.
- `docs/research/ae-mograph-settings/README.md` (+ `_tools/ffx_extract.py`) — 264 `.ffx` presets are
  **RIFX binary, not XML**; 262 parsed for real names/values/ranges. Bounded negatives: no preset
  wraps Roughen Edges/Gaussian Blur; AE is effectively not installed (no `AfterFX.exe`).
- `docs/research/procreate-5.4.9/DRAW-ANIMATE-CONTINUATION-2026-10-31.md` (+ `inspect_draw_metadata.py`,
  `strings_scan.py`) — brush parameter surface, stabilisation pipeline, guides/QuickShape, Animation
  Assist (onion tint colours, playback modes).
- `docs/research/layer-systems/README.md` — REA decode of the Procreate/Dreams `LayersResources.bundle`
  (10 documents, 637 nodes, 415 edges): layer-cell outlets (thumbnail, alpha-lock background, clipping,
  lock, blend target, depth, swipe actions), Procreate group vocabulary, Dreams track/onion vocabulary.
- `docs/research/export-settings/README.md` — Procreate formats/quality/codec/profile, Dreams
  Quick-vs-Advanced export, Harmony `EXPORTMMX_*` saved prefs, and a proposed 2Dope preset matrix.
- `docs/research/NEXT-ITERATION-BRIEF.md` — acceptance criteria for the Draw layer row/groups, the
  Animate track + art-layer panel, and the format-aware export sheet.
- `docs/research/wunk-plugins/README.md` — `D:\Downloads\wunk`: the `.aseprite` is a **dither-pattern
  promo sheet**, not brushes; `B.Carve` is seam-carving resize; `B.Fringe` has two controls
  (Iterations, Offset); `PixDither` adds per-channel thresholds and non-square matrices; `PixStipple`
  parameters unknown. Integration order + limits inside.
- `docs/research/grab-bag-rea-triage/README.md` — what in the Ultimate Mograph grab bag is actually
  REA-able: ~90 native `.aex` (ranked: Bendio, BlockSwap, Auto_Crop first), 25 `.zxp` of which several
  carry plain `.jsx` source (read, no REA), and 451 `.jsxbin` that REA cannot decompile.
- `docs/research/gifgun-ntsc/README.md` — GifGun 2.0.12: CEP + ffmpeg/gifextras pipeline, settings
  (max colours 256, fps 10, loop, dither=bayer scale 3, two-pass palette, pixel-art resampling);
  ntsc-rs 1.5.4: full parameter inventory grouped, and a five-control "Retro TV" subset that fits
  Canvas 2D without NTSC modulation.
- `docs/research/zaebects-signal/README.md` — Zaebects `signal.aex` (match name `ADBE Signal`):
  fourteen VHS controls (signal strength, static, luma/chroma/hue noise, chroma loss/blend, scanline
  blur, phase shift + offset, roll/distortion speed, frequency) and a proposed eight-control
  "Retro TV" effect for 2Dope.
- `docs/research/mograph-tool-shortlist/README.md` — ranked mograph tools to build (stagger, loop,
  ease copy, settle/bounce, wiggle/sway, camera presets, retime, repeat/cloner), with evidence class
  and effort; recommends the keyframe toolkit (stagger + loop + ease copy) first.
- `docs/research/CLAUDE-ITERATION-2.md` — ordered work packages for the next Claude session (verify
  effects → easing → keyframe toolkit incl. Wiggle/Smoother → default FX waves → wunk slice →
  Retro TV → GIF options → layers/export next round), with acceptance criteria and open decisions.
- `docs/research/freqreact/README.md` — FreqReact 3.0.47 (CEP, readable JSX + 34 `.ffx` with embedded
  JSON control schema): reactor types (Pulse/Elastic/Oscillate/Steps/Wiggle/Flicker/Switch/Trigger ×
  1D/2D/3D/Color), controls and defaults, expression maths, and the bake-based "Audio React" design
  for 2Dope (package 9, future).
- `docs/research/procreate-brush-system/README.md` — NSKeyedArchiver REA of Procreate/Dreams brush
  archives (Signature: 124 keys; corpus: 241 brushes with min/median/max). Groups, ranges, what the
  importer takes today (7 settings), and why grain/dynamics/taper feel different. Includes
  `_tools/nsarchive_dump.py` and `_tools/brush_aggregate.py`.
- `docs/research/clip-studio-vector-next/README.md` — the CSP vector gaps turned into work: segment
  eraser hit test, cut width preservation, simplify/smooth, authored handles persistence, erase
  modes, SVG export.
- `docs/research/CLAUDE-ITERATION-3.md` — packages A (brush import accuracy: curves, mapping, grain)
  and B (vector features), ordered, with acceptance criteria and decisions.

Checks (actual): `npm test` **74 files / 584 passed** (the two extra files are the concurrent onion
and Story work); `npm run build` passed (existing chunk-size warning only). **Not checked:** the new
effects in a browser/pixel fixture, iPad cost of a 40 px blur, roughen on thin vs thick ink. Next
sensible step is a fixture plus a visual check on `127.0.0.1:5217`, then the easing library in the
report's Tier 1.

### Onion skin settings on the Onion button (2026-10-31, uncommitted)

User asked for easy onion settings: tap Onion toggles as before, press-and-hold opens settings.

- New `src/ui/onionpop.ts`: one floating settings card (`.onion-pop`, `role=dialog`) placed above
  or below the held button and kept on screen: Show onion skin, Before / After (− n +, capped by
  `device.limits.onionMax`), Strength (opacity), Colours (tint), Keys only, While playing. It edits
  `App.onion` through `onionChanged()` (device setting, saved, no History). Escape or a tap outside
  closes it. `onionHold(app, button)` adds the hold (`HOLD_MS`, then `swallowNextClick` so the hold
  does not also toggle) and right-click; the button's own click still toggles.
- Attached to every Onion button: Flipbook header (`flipmode.ts`), timeline transport
  (`strip.ts`), Quick bar (`quick.ts`) and the pinnable Onion tool bubble (`bubbles.ts`). The
  X-sheet's onion settings row is unchanged. CSS at the end of `style.css`.
- Manual (Draw flipbook tips) and an UPDATES entry.

Checks (actual): `npx vitest run` 574 passed; `npm run build` passed; browser fixtures **44/44**. Dev
app (Draw, Flipbook): synthetic 600 ms hold on the Flipbook Onion opened the card with onion still
On (no toggle); + raised Before 2→3 and − set it back; Escape closed it; two taps toggled
On→Off→On; right-click opened it above the button (screenshot). No new fixture was added for it.
Not checked: real touch/Pencil hold, phone width placement, Quick bar and bubble buttons by hand
(same function attached).

### UI cleanup iteration 4: mode names and the Draw/Animate bottom bar (2026-10-31, uncommitted)

Backlog items 5 and 7.

- Mode names: the ≥1000px rule that shows mode labels in the floating mode bubbles now applies
  in every mode, not only `body.painting-workspace` (`style.css`); the `.bub-name` readout hides
  there as before. Full top bar (`index.html` `#ws`): buttons say **Story** and **Timing** (were
  Board / Time) with the same titles as the bubbles, and below 1400px the active mode keeps its
  word (`.topbar .ws button[aria-pressed='true'] .lbl`, ≥701px) while the others stay icons.
- Bottom bar (`paintingworkspace.ts`, `canvasview.ts`, `style.css`): Tools / Tool settings / Brush
  controls / Editor handles sit in one `.painting-folds` group, each with an icon (Tool settings =
  `adjust`, Editor = `flipbook`, set once with `setLabel` instead of rewriting `textContent` every
  update); labels hide below 1000px. **Fit canvas** moved from the bar into View (after the switches; F
  unchanged). Aria-labels kept (`Toggle tools`, `Toggle tool settings`, …), so recovery fixtures
  still find them. `flipbooksource` fixture now opens View before Fit canvas.
- Manual (painting layout lines) and an UPDATES entry.

Checks (actual): `npx vitest run` 574 passed (the extra test is from the concurrent effects work
in `core/effects.test.ts`, not this change); `npm run build` passed; browser fixtures **42/44** first (canvasview focus order, flipbooksource had no View button), fixed (Fit after the switches; fixture calls `app.fit()`), then **44/44**.
Dev app at 768×1024 Full: Draw bottom bar = Canvas, Flipbook, status, [4 icon handles], View,
Workspace gear in one row; View → Fit canvas fits and closes the popover; Timing top bar shows
"Timing" on the active button, other modes as icons. Not checked: phone widths, ≥1000px Motion
with the floating mode bubbles (Simple level) for overlap with its tool row, touch.

Concurrent work noticed (not this session's, left untouched): `src/core/effects.ts` /
`effects.test.ts`, `src/ui/effectspanel.ts`, `src/view/effects.ts` and new `docs/research/*` files.
This session changed only `TARGET_NAMES` in `core/effects.ts` (iteration 2).

### UI cleanup iteration 3: Timing one-home controls and one transport order (2026-10-31, uncommitted)

Backlog items 2 and 3 (next-phase Quick cleanup 1 and 3; 2026-10-22 review finding 3).

- Timing homes: Hold 1–4 / − / + and Key / Breakdown / In-between stay only in the options bar
  (`bubbles.ts` time row). The X-sheet's timing bar (`strip.timingBar`) lost its Hold and Mark groups
  (and the typed-hold box; the X-sheet Hold cell still types holds) and keeps onion settings and the
  layer switches. The strip's frame-action group (`.strip-edit`: + Frame, Duplicate, Delete, Split,
  Select, New page) is hidden in Timing (`body.ws-time`), since the X-sheet has its own actions.
  Timing's default toolbar (`core/workspacelayout.ts`) is now just Layers; Play/Onion/frame tools stay
  in the Workspace catalog for pinning. Saved per-device layouts keep whatever they had.
- Transport order everywhere: **Play · ◀ frame count ▶ · Range** (Flipbook header already matched).
  `strip.ts` nav now holds Play and the frame readout (no longer hidden on Simple); Motion's bar
  (`motion.ts`) was reordered. On Simple the tracks bar hides its own Play/readout when the strip's
  nav row is docked in it (`has-nav` class from `main.ts`, CSS in `style.css`).
- Manual (Timing section) and an UPDATES entry.

Checks (actual): `npx vitest run` 573 passed; `npm run build` passed. Full browser run on 5217:
**43/44**; `commandrow` failed 2 checks (Select-row Copy still hidden after reload / Customize list)
in the full run only, then passed **44/44 checks alone** right after. The two earlier full runs today
passed it; cause not identified (this change does not touch the Select command row), like the
earlier `brushcontrols` full-run-only miss.
In the dev app (test origin 5217, Simple): Timing toolbar = Layers + More tools; transport = + Media,
Flipbook, Play, ◀, 1 / 1f, ▶, Range, Onion, More; X-sheet = onion settings, layer/Ink/Colour
switches, frame actions; Hold/Mark only in the options bar. Motion read Play · ◀ 1/1f ▶ · Range.
Not checked: Full-level Draw strip order visually, phone widths, touch.

### UI cleanup iteration 2: Ink / Colour names and tidier Draw Layers (2026-10-31, uncommitted)

The user chose **Ink / Colour** for the two drawing parts (backlog item 1), then asked for a
cleaner Draw Layers panel.

- Names (labels only; `Plane`/`PartName` ids, schema and storage keys unchanged): new
  `PART_LABEL` in `core/comp.ts` drives Layers cards (`layercards.ts`), the layer popover
  (`layerspop.ts`), rails (`rails.ts`, uppercase INK / COLOUR), Timing chips (`strip.ts`), Motion part
  rows/menus (`motion.ts`), undo labels (`compedit.ts`), the hidden-part notice and canvas menu
  (`app.ts`), the paint-target cue (`main.ts`), Brushes header, Quick bar ("Draw on: Ink"), QuickMenu
  ("Ink / Colour target"), student-profile control names, Effects targets, `index.html` options-bar
  buttons/titles, Blender note and manual figure. The bucket is **Bucket fill** everywhere
  (`index.html`, canvas menu, student prefs). Export passes read "Ink (lines)" / "Colour (fills)";
  their folders/suffixes (`lines`, `fills`) are unchanged.
- Draw Layers (`layercards.ts`, `style.css`): options show Opacity, Blend, Ink/Colour rows, the
  switches and four everyday tiles (Rename, Duplicate, Lock, Delete). **More actions** (device-only
  `2dope.layers.more`, try/catch) reveals labelled sections This drawing (Select, Fill, Clear, Flip ↔/↕)
  and Layer (Effects, Mask/Delete mask, Art layer, Group, Merge); groups get Ungroup there. The swipe
  hint shows only with 2+ layers; the active card's tag reads "on Ink" / "on Colour".
- Fixtures updated for the new labels: `paintingplanes`, `quickmenu`, `brushreturn`, `studentprofiles`.
- Manual (Layers, Draw tips, shortcuts, Motion) and two UPDATES entries.

Checks (actual): `npx vitest run` 573 passed; `npm run build` passed. Rename alone: browser
fixtures **44/44** on 127.0.0.1:5217; after the Layers change, **44/44** again. In the dev app:
Layers shows Ink/Colour, the options bar and toolbar show Ink/Colour/Bucket fill, the trimmed
options and More actions (opens, remembered) were checked at ~800px width. Not checked: phone width
of More actions, touch. Noticed, not fixed: the footer status read "Brush on Drawing · Ink" while
the active Layers card was "clip" after a reload (possibly stale status text; not investigated).

### UI cleanup pass: ranked backlog and iteration 1 (2026-10-31, uncommitted)

The user asked for the UI cleanup and the evaluation features still missing, worked in small
iterations. Survey of `docs/next-phase.md` (Quick cleanup, Last fixes, Story), the 2026-10-22
review, the mode-context direction and the running app (test origin 127.0.0.1:5217). Ranked list
the user approved, with status:

- **Iteration 1 (done):** A "can't draw" on hidden layers; 4 Motion camera-view icon; 6 Undo/Redo
  contrast (no change needed, see below).
- **1. One name for the drawing parts (next; needs the user's pick of names).** The Draw options
  row says Ink target / Colour target; Layers cards, layer popover, Motion part rows, X-sheet
  `clip: Line Fill` and the Brushes header (`brushlib.ts:493`) say Line / Fill, and Fill also
  names the Bucket tool (next-phase Quick cleanup 2).
- **2. Timing duplicates (Quick cleanup 1, review finding 3, still open):** Hold 1–4 in the top bar
  and the X-sheet; onion and frame actions in X-sheet and the bottom transport.
- **3. Transport order differs per mode (Quick cleanup 3):** Timing puts Play first, Motion ◀ first.
- **5. Mode bar labels vanish outside Draw** at the same width (icons only in Timing/Motion).
- **7. Draw bottom bar has 9 items** (Canvas, Flipbook, status, Tools, Tool settings, Brush
  controls, View, Workspace, Fit canvas).
- Missing evaluation features, larger: **B** Story Grid · Strip · Present views (next-phase Story
  priority); **C** script to panels, scenes, shot/camera stickers; **D** canvas-drawn rail with
  lift-and-drag and the 1,000-frame test; **E** time-lapse replay, sample projects, first-run screen.

Iteration 1 changes:

- `app.ts`: `hiddenTarget()` runs at the start of `beginStroke` (after the locked check). A stroke,
  fill, smudge or erase on a hidden layer, or on its hidden target part (Line for Vector, else the
  current plane), no longer paints invisible marks: a notice names what is hidden with **Show it** /
  **Show Line|Fill**, which uses the existing `editor.setFlag` / `setPart` (one Undo step). Mask
  editing, guide editing and placeholder layers are exempt. `onNotice` takes an optional action;
  `main.ts` passes it to `files.toast` (6 s with a button, 4 s without). Fixture `onNotice`
  overrides still type-check (they ignore the action).
- `ui/icons.ts` new `viewfinder` icon; Motion's Camera view bubble (`ui/bubbles.ts`) uses it instead
  of the show/hide eye.
- Undo/Redo "dim" (Quick cleanup 8): measured in the app. They are full contrast and eyedropper-size
  when enabled; 0.4 opacity only while disabled (nothing to undo). Left unchanged.
- Manual (Layers and Motion lists) and an UPDATES entry.

Checks (actual): `npx vitest run` 72 files / 573 passed; `npm run build` passed (existing chunk
warning); `npm run test:browser -- --base http://127.0.0.1:5217` **44/44 fixtures passed**. In the
dev app (test origin 5217, existing test project): hid the layer, drew → notice "“clip” is hidden,
so nothing would show." with Show it, which restored the layer; hid Line, drew → "The Line part of
“clip” is hidden…" with Show Line, which restored it; Motion showed the viewfinder bubble; no
console errors. Not checked: touch/Pencil, a new fixture for the notice (none added), Animate
Flipbook drawing past the end on a hidden track. No commit or push.

### Animatic / storyboard export and Story subtitle lines (2026-10-30, uncommitted)

User asked for storyboard and animatic exports as options (not rendered automatically; a choice
made at export carries across modes), Story polish, and much cleaner subtitle/dialogue entry.

**Data decision (no schema change).** Dialogue stays in the existing exposure `dialogue` caption,
now read as one subtitle per line, `Speaker: words` when named (`core/dialogue.ts`). Old free text
loads as lines without a speaker; older builds still show the text as written. A panel's frames
are shared between its lines by text length (min one frame each); nothing extra is stored. A
line like "Wait: what" without a speaker is shown with "Wait" as the speaker (stored text is
unchanged either way).

- `core/dialogue.ts` (+ tests): parse/format lines, `splitPanel`, `boardCues`, `cueAt`,
  `boardSpeakers`, SRT and WebVTT writers.
- Story cards (`ui/board.ts`, `style.css`): a Dialogue / subtitles block directly under the
  picture with Who (speaker datalist of names already used) + What is said rows, per-line screen
  time, `+ Line` / Shift+Return to add, `×` to remove, Return through lines then to the next
  panel's first line, Escape reverts. Other captions keep their fields and labels.
  Polish: Images button uses the picture icon (was the export icon), header shows `fr` and
  `@ start · length`, the thumbnail has a role/label/title, the Split view is called Both (as in
  the bubbles), cards are 230px wide. Board timeline blocks show the lines as subtitles read.
- Live subtitle (`main.ts`): one cue at a time with the speaker highlighted, same timing as the
  animatic.
- Exports (`ui/share.ts`): new **Animatic** format (board panels, or Board + animation; burn-in
  subtitles on by default; optional `.srt` beside the video; size/file/background are the shared
  Video settings, never see-through; ends at the last panel). **Storyboard** settings are now
  inline in Share (PDF sheets or panel ZIP; same `2dope.board.export` key, so earlier choices carry
  over); `ui/boardexport.ts` was removed. Story's Export button / bubble opens Share on the last
  story format (Storyboard or Animatic); Share remembers the pick for every mode. Video, GIF,
  Animated PNG, PNG frames and Picture offer "Put the storyboard in it", which is the existing
  project-level `setBoardExport` (one Undo step; Blender and all renders follow it).
- `io/animatic.ts` (+ tests) paints a frame and builds a `VideoPicture`; `io/exportvideo.ts`
  accepts that optional picture (length, drawings, painter) and `planVideo` an optional length.
  `view/composite.ts` gained `guide` / `onlyGuide` options. `io/storyboardexport.ts` prints
  dialogue lines with bold speakers and adds `subtitles.srt` to the panel ZIP when there is
  dialogue.
- Manual (Story and Share sections, Story card figure), UPDATES entry, ARCHITECTURE note,
  `docs/project-format.md` note. New fixture `tests/storyexport.html` (41 checks: line editing,
  keyboard flow, Escape, undo, speaker list, old free text, Story Export → Share, PDF text, ZIP
  with `subtitles.srt`, animatic checks, board-only vs Board + animation pixels, burn-in, a real
  WebM encode with duration = board length and the `.srt` link, remembered picks across modes, the
  include-storyboard toggle and its Undo).

Checks (actual): `npm test` 72 files / 573 passed; `npm run build` passed (existing chunk-size
warning); `git diff --check` clean. `npm run test:browser` (`--base http://127.0.0.1:5220`):
**44/44 fixtures passed**, including the new `storyexport` (41/41); it also passed in the
in-app browser pane. After that run, a notice for dialogue past the panel's 1000-character
caption cap was added; unit tests, build and `tsc` were re-run and pass. Visually checked in the
dev app on test origin 127.0.0.1:5220: Story card with the Dialogue block under the picture,
Share opened from Story on Storyboard, Animatic preview with the burned-in "Sam: …" line, checks
and subtitle switches. Not checked: MP4/H.264 animatic encode (the fixture uses WebM), audio in an
animatic with real clips (same mixer as Video, untested here), phone/narrow layout of the line
rows, touch/Pencil, iPad. No commit or push.

### Overscan / canvas view options and Animate toolbar polish (2026-10-30, uncommitted)

User asked for a toggle letting artists draw and see art outside the canvas, with title/action-safe
guides and micro thumbnails, plus modest Animate toolbar polish.

**Overscan design decision.** Drawing planes stay exactly page-sized. Enlarging raster planes (a
project overscan margin) would touch every pixel consumer (~100 `docW`/`getImageData` sites:
fills, selections, smudge, autopaint, residency, persistence, schema, PSD/ORA/export) and raise
memory against Lite limits. Vector strokes are point records that were never bounded by the page,
so Overscan is **vector-based**: Vector lines can start, end or lie wholly past the edge, are kept
and saved as before (no schema change), and the Eraser cuts them there. Brush/Smudge/Fill pixels
still stop at the page edge; a one-per-session notice says so and points to Vector. Exports
render into comp-size canvases, so framing/size never change. Existing behaviour retained and now
documented: a layer moved in Motion that draws directly can bring off-page vector lines into the
frame, while layers flattened for opacity/blend/mask/effects stay bounded by the page; onion
ghosts and thumbnails are page-sized.

- `core/canvasview.ts` (+ unit tests): device-only `2dope.canvas.view` prefs (overscan, safeAreas,
  centre, overview), 90% action / 80% title safe geometry (no prior project convention existed),
  overview neighbours.
- `app.ts`: `canvasView`/`setCanvasView` (no History). Draw/Animate art is now clipped to the page
  when Overscan is off (previously off-page vectors leaked onto the pasteboard); with Overscan, paper
  runs under the pasteboard and `drawCanvasView` dims outside the page and draws safe frames/centre
  on the screen canvas only (also over Move assets). The painting body moved into `renderPainting`.
  Styled vectors wholly off-page are no longer discarded with Overscan on. Canvas menu entries
  `canvas.overscan` / `canvas.safeareas` (registered in `MENU_ENTRIES`).
- `ui/canvasview.ts`: View button in the painting footer (popover of four switches, Escape/outside
  close) and the frame overview strip (prev/next drawings from `Drawing.thumb`, tap to jump).
- Animate/Draw toolbar (`ui/bubbles.ts`, `ui/paintingworkspace.ts`, `style.css`): every tool title
  says what it does and what a tap / second tap does; tools vs panel openers (Layers, Colour,
  Reference) separated by a divider and marked `data-kind`; Smudge now opens brushes on a second
  tap like Brush/Vector/Eraser; the options row starts with its owner ("Brush settings", "Vector
  settings", …); More tools explains pinning; Move assets hint mentions Done. Footer: Tools fold
  handle uses the panel icon (no longer the ••• of More tools), fold handles get Show/Hide titles
  and a faded dashed look when hidden, status reads "Brush on Drawing · Ink". aria-labels kept.
- Manual (Draw and Animate section) and UPDATES entry; ARCHITECTURE note; new fixture
  `tests/canvasview.html` (25 checks: stroke past edge, page clip without Overscan, dimmed
  pasteboard with Overscan, persistence, no Undo step, export unchanged, Eraser off-page + Undo,
  wholly-off-page vector, Brush notice once, safe/centre screen-only, Escape/focus, overview
  targets/navigation, Motion hides it, Animate shares it).

Checks (actual): `npm test` 70 files / 565 passed; `npm run build` passed (existing chunk warning);
`git diff --check` clean. `npm run test:browser` on isolated `127.0.0.1:5219`: **42/43**; the miss
was `brushcontrols` (3 slider-value checks) in the full run only. It passed 26/26 alone and after
`assettiming` and `artworklibrary`; cause not identified (it does not touch the changed code).
Visually checked in the dev app (test origin 5219): Overscan line past the page, safe frames,
centre cross, overview strip, View popover; Animate toolbar divider, titles, "Brush settings"
row, More tools hint, faded hidden handle. Not checked: phone/side-dock layouts of the new divider
and overview strip, touch/Pencil, iPad memory. No commit or push.

### Effects button in Full Motion (2026-10-30, uncommitted)

The user could not find Effects in Motion at the Full interface level. Full has long hidden the
floating tool row (where the ✦ bubble lives; `style.css` `body.ui-full .bub-tools`), so Effects was
reachable only from a layer's ⋯ menu. `src/ui/motion.ts` adds an Effects button after Flipbook in
the timeline bar, marked `data-dup` so Simple and Focus (which have the bubble) hide it. It opens
the selected drawing layer, else the first drawing layer, else a notice, matching the bubble.
Auto-key and Through camera were already in Full under Keyframes, easing and view options.
Manual (Motion list) and UPDATES entry added.

Checks (actual): `npm test` 69 files / 562 passed; `npm run build` passed; `git diff --check`
clean. In the dev app on a test origin at Full level, Motion showed the Effects button and it
opened the Effects card for the drawing layer, with no console errors. With the `ui-simple` body
class the button computes to `display: none` (the bubble covers it). Not checked: narrow/touch
layouts. Browser fixtures not run.

### Workspace UI release scope (2026-10-30)

The user authorized committing and pushing the mode-first workspace cleanup, per-mode
customization/student-profile support, clearer Story labels and distinct Transform icon,
including their documentation and regression fixtures. Earlier "uncommitted" / "no push"
notes below describe their implementation-time status. Validation: 562 unit tests and
production build passed; 42/42 browser fixtures passed for the workspace change, followed
by 44 command-row and 20 workspace checks after the icon update. Physical stylus/iPad
testing remains unverified. Pushing `main` runs `.github/workflows/pages.yml`.

### Distinct Transform graphic (2026-10-30; completed locally, uncommitted)

User noted Transform looked like Motion. Added a dedicated 24px bounding-box icon with
four square corner handles in `ui/icons.ts`. The painting toolbar (`ui/bubbles.ts`) and
selection Transform / Move all commands (`ui/commands.ts`) now use it; Motion retains its
connected keyframe diamonds. Manual/UPDATES describe the distinction. No behavior changes.
Checks: 562 unit tests passed; production build passed (existing chunk warning); focused
`commandrow` (44 checks) and `workspacelayout` (20 checks) browser fixtures passed. Visually
verified the production Draw toolbar at isolated `127.0.0.1:5262` without changing the
user's current drawing at `5261`. No commit, push or deployment.

### Mode-first workspaces (2026-10-30; completed locally, uncommitted)

The user authorized implementation with "go" after selecting the Mode-first design and
reinforcing Procreate-like Draw, Dreams-like Animate/Flipbook, editing flexibility and
customizable tool access. This is a workspace refinement using existing artwork commands.

- Draw and Animate have distinct compact pinned toolbars plus a separate More tools drawer
  for Vector, Bucket fill, adjustments and Reference. The current unpinned tool stays visible
  until switching away. Narrow painting rows scroll, keeping More at the edge. Tray recovery
  and Tool settings moved into the footer rather than overlapping brush controls.
- Workspace / App settings offers per-mode tool pinning, drag or Move-button reordering,
  top/left/right toolbar docks, brush rail edge, optional labels and explicit ink/colour targets.
  `core/workspacelayout.ts` validates bounded preferences at `2dope.workspace.layouts`.
  Existing version-1 student profiles now include validated `workspaces` snapshots; old
  profiles receive defaults. Draft Apply/Cancel and default restoration leave artwork alone.
  Failed workspace storage retains the draft and restores prior profile storage.
- Ink target / Colour target distinguish paint destinations from Bucket fill. The footer
  names the tool and paint layer/part; adjustments explicitly name current drawing or selected
  area scope. Selection/transform/adjustment/point-edit controls remain available when ordinary
  settings are folded. Canvas fit accounts for side docks. Shared source paint layers and
  Flipbook/Clips/source-return commands are reused, preserving the shot/frame/artwork.
- Story cards retain their layout and captions, with permanent visible/accessibility labels:
  Shot / scene, Camera / framing, Dialogue / narration, Action, Timing / beats, Production notes.
  The manual, release notes, architecture and linked direction note describe the new UI.

Checks: **562 unit tests / 69 files passed**, production build passed (existing chunk warning),
**42/42 browser fixtures passed** on isolated `127.0.0.1:5261`. New `workspacelayout.html` passes
20 real-App checks; its responsive wrapper passes **80 checks** across 390x844, 320x568,
834x1112 and 844x390. Coverage includes pin/order, dock collision and touch targets, extra-tool
recovery, per-mode persistence/fresh-App reads, profile snapshots, Cancel/defaults, storage
failure, Flipbook stage budget, no document History edits and absence from portable projects.
Existing source/painting/selection/playback/browser fixtures passed with intentional UI-label
and tool-menu path updates. Actual app entry reviewed in the in-app browser: default Draw,
custom docks, Animate/Flipbook, and Story labels. Documentation whitespace checked.

Changed areas: `src/app.ts`, `main.ts`, `style.css`, `core/studentprefs*`, new
`core/workspacelayout*` and `ui/workspacesettings.ts`, `ui/bubbles.ts`, `paintingworkspace.ts`,
`settings.ts`, `board.ts`, `manualtext.ts`, new workspace browser fixtures and the affected
UI regression fixtures. No dependency or project-schema change. Preferences remain device-local.

Limits: arbitrary freely floating tool groups / a general panel builder are not implemented;
reorder/docking happens in Workspace, while existing movable Reference/Flipbook windows remain.
Physical pen/iPad Safari feel is unverified. No commit, push or deployment of this UI work.

### Accepted UI direction (2026-10-30; implemented scope above)

The user selected the Mode-first proposal: Draw follows a canvas-first Procreate-like
layout; Animate uses Dreams-like Flipbook/Clips working areas; Story retains its cards
with clearer writing labels. They explicitly require extra settings and easy ways to
move tools and add controls. Requirements, recovery rules and implementation order are
recorded in [mode-context UI direction](docs/MODE-CONTEXT-UI-DIRECTION-2026-10-30.md).
Extend existing student profiles/QuickMenu with per-mode layouts; preserve shared Assets
and source-edit return context. The implementation and validation are recorded above.
The user reinforced experience closeness to Procreate in Draw and Dreams in Animate/
Flipbook, including editing flexibility. The linked note now makes the everyday drawing,
frame/playback and source-edit loops explicit acceptance requirements, retaining vectors,
source layers and customization without flattening or duplicating artwork on mode switches.
The initial direction-recording follow-up changed documentation only; the later "go"
authorized the application implementation above. No commit/push/deployment of this UI work.

### Release scope (2026-10-30)

The user authorized committing and pushing this snapshot: editable vector brushes and custom tips,
Motion/FPS redraw and viewport fixes, faster textured raster brushes, and source paint layers in
Draw, including their research, documentation and regression fixtures. Earlier "uncommitted"
labels below record the status when those implementation notes were written.

**Deferred at the user's request:** the later UI cleanup for Line/Fill/Whole, additional tools,
overlapping controls and faster adjustment access. That investigation made no application changes.
The local `main` push runs `.github/workflows/pages.yml` to publish GitHub Pages. Validation for
the completed implementation: 559 unit tests, production build, 40 browser fixtures, plus explicit
tablet/landscape checks. Physical stylus feel remains unverified.

### Motion redraw, textured-brush stalls and Draw paint layers (2026-10-30, uncommitted)

User reported Motion/FPS glitching the drawing space, Pencil/Paint freezing (Ink was fine), and
Draw Layers showing tracks instead of the artwork's own paint layers.

- `App.setFps` now requests a redraw, clears onion previews, rebases playback and notifies autosave
  through one undoable comp-rate command. `MotionPanel` includes FPS/time format in its ruler
  signature. A two-color nested-source test reproduces and verifies immediate remapping after
  FPS changes and Undo/Redo. Motion temporarily owns its viewport; returning to the same painting
  comp restores Draw pan/zoom/rotation. Another project discards that saved view. Screen redraws
  explicitly reset alpha/blending and clear the surface to avoid leftover drawing state.
- Raster grain formerly resolved a document-sized scratch surface for each dab. Pencil 8px on
  1920×1080 measured median **206.3 ms** per eight-sample input batch, worst **573.9 ms**. Textured
  Paint 48px commit measured **1185.9 ms**. `RasterEngine.stamp` now uses a growing power-of-two
  stamp tile, translated to document coordinates; stroke start/resize releases its previous size.
  Focused rerun: Pencil median **3.5 ms**, worst **11.9 ms**; Paint 48px commit **149.9 ms** (later
  suite run **125.9 ms**; final run **44.9 ms** after resetting the tile between strokes).
  Dense tapered paint can still have a brief finish cost; timings vary with brush/page/device.
  Original-vs-new reference checks preserve grain phase/coverage/color within canvas rounding
  (at most 2/255 alpha and premultiplied color; relative alpha error below 0.0001). Ink matched
  exactly. Existing saved raster pixels are not rerendered or modified.
- In Draw, opening Layers on a selected placed asset opens its source through the existing asset
  controller. The full panel lists that source's layers and names the artwork, with long names
  ellipsized. Add creates a paint layer inside the source, retaining its frame/playback settings;
  Done restores the shot. Standalone Draw shows its current cel/paint stack. Animate keeps shot
  tracks and Background/Object/Animation choices. Paint-card selection, eye/options, reordering,
  duplication/deletion and undo continue through the existing comp editor. Empty assets can add
  their first paint layer again. The alternate layer popover follows the same scope.

Checks: **559 tests / 68 files passed**; production build passed (existing chunk-size warning).
**40/40 browser fixtures passed** on isolated `127.0.0.1:5240`. New `workspacefixes.html` passes
23 checks for Motion pixels/FPS/ruler/undo/view restoration and source paint ownership/layer actions.
Its responsive wrapper passes 23 checks each on phone (390×844), tablet (834×1112), and landscape
(844×390), including long source names. `brushperformance.html` passes 10 checks and
measures Pencil/Paint/Ink and compares against the retained original grain routine. Existing
painting fixtures were updated to exercise the intentional Draw paint-layer flow, while still
testing Animate's Background creation. Final Pencil 8px batches measured median **3.3 ms**, worst
**10.3 ms**; Paint 48px batches median **1.6 ms**, worst **3.2 ms**, commit **44.9 ms**. Ink control
and all legacy/vector/export fixtures passed. `git diff --check` reported no whitespace errors.

Changed this follow-up: `src/app.ts`, `brush/raster.ts`, `ui/motion.ts`, `ui/layercards.ts`,
`ui/layerspop.ts`, `style.css`, `ui/manualtext.ts`; new brush/workspace browser fixtures and responsive
wrapper; updated `paintingplanes.browser.ts`/`paintingworkflow.browser.ts`, architecture and manual.
No format/schema changes, commit, push or deployment. Physical tablet/iPad Safari validation remains
unavailable; reported Motion symptoms were addressed through the reproduced redraw/view faults.

### Editable vector brushes — completed locally (2026-10-30, uncommitted)

The user asked to finish Claude's interrupted vector-brush assignment. Parsed Claude session
`fc2bb431-0754-4284-a884-cf7fc33e8042`: Claude stopped after source inspection/design notes,
without application implementation changes. Recovered the notes from its session transcript and
implemented the milestone here. Existing research and pen/tablet work were preserved.

- Brushes → **Vector** offers Ink, Chisel, Dry Ink, Pencil, Dots and Pattern. Studio supports
  original/ink/chisel/material routes and custom image-tip import; unsupported controls hide.
- Explicit **Apply brush to lines** uses a detached preview, keeps weight by default, supports
  brush weight/taper, cancels without mutations and applies as one undo/autosave change. An active
  canvas selection preserves the original appearance outside it. Project/frame/layer/data guards
  refuse stale previews. Library selection affects future strokes only.
- New marks retain immutable v1 appearance, inline 128² custom alpha tips, calibrated pressure,
  local width, captured speed/material distance, authored anchors/modes/handles and visible-mark
  selection clips. Cuts interpolate channels and retain stamp phase; sparse segments respond to
  the eraser. Full-mark affine transforms include tips, reflection, handles and clips.
- Shared rendering covers drawing, thumbnails/playback, masks, nested assets and export. Legacy
  versionless outlines keep their original algorithm. Styled/control/clip captures write schema 4;
  plain earlier outlines still write schema 3. My Assets remains standalone.
- Buffers/work are bounded. A 16-record / 8 MiB coverage cache makes unchanged dense marks cheap
  to replay; previews remain transient, edits replace records, project load clears the cache.

Checks: **559 unit tests / 68 files passed**, production build passed (existing chunk-size warning),
**37/37 browser fixtures passed** on isolated `127.0.0.1:5230`, including the new 46-check specimen
and its 390×844 wrapper. The specimen tests fresh-origin portability after library deletion,
different pen calibration, exact PNG Lines output, nested vector masks/My Assets, restyle history,
authored controls, selections, nonuniform/reflected marks and cache invalidation. Desktop stress
measurement: 1,500-point dry line median **8.9 ms**, worst **11.6 ms** uncached; twelve dense lines
median **1.4 ms/frame** with caching, worst/cold **107.8 ms**. This does not establish pen latency.

Open `/tests/vectorbrushes.html` on the dev server for the draggable four-style specimen. Full
implementation/check/limit notes: [vector milestone](docs/research/clip-studio-paint/VECTOR-BRUSH-MILESTONE-2026-10-30.md).
Changed areas: `core/vectorstyle`, stroke/brush/brushlib, cuts/clips/selection transforms, vector
dispatcher/styled renderer, App point/restyle/creation flows, Brush Studio/library/commands/CSS,
schema/capture, tests/fixture reporter and manual/format/architecture notes.

Limits: cold dense frames can still pause; large/high-zoom marks soften at the bounded scratch
resolution. Inline tips/clips can enlarge JSON (64 MiB resource estimate). Erasing uses a
conservative styled footprint rather than exact tip-hole hit testing. Advanced joins, ribbons,
pinch/redraw/simplify and a dedicated vector-layer policy remain deferred. Physical Wacom/Apple
Pencil feel and iPad Safari memory were not verified. No commit, push, deployment or new CSP
native analysis was performed.

### Pen and tablet settings (2026-10-30, uncommitted on main)

The user asked to optimise for Wacom and other tablet drivers with custom pen settings. Browsers
do not expose the tablet brand or driver, so detection works from what the pen reports through
Pointer Events.

- **`src/core/pen.ts`** (unit-tested in `pen.test.ts`, 10 tests): `PenPrefs` (`2dope.pen` in
  localStorage, device-only, not in student profiles), `mapPressure` (threshold, full-strength
  point, soft/firm gamma; the defaults return pressure unchanged), `PenProbe` (pressure that changes
  or stays flat across strokes, an approximate level count, tilt, twist, eraser bit 32, side button,
  hover, strongest pressure) and `diagnosePen` with platform tips (Windows Ink for
  Wacom/Huion/Gaomon/XP-Pen, Windows press-and-hold, macOS Accessibility, Linux libinput).
- **`app.ts`**: `toPoint` maps pen pressure through the prefs and zeroes tilt when tilt is off (this
  covers strokes, smudge, predicted points and QuickShape). The eraser end (`buttons & 32`) switches
  to the Eraser on pen-down and the tip restores the previous tool and Smudge (`penEnd`). Button 5
  (the eraser end) no longer bails out of `onDown`; before this the eraser end did nothing. The side
  button can pan (`barrelPan`, which suppresses the context menu that follows) instead of opening
  the menu. A pen that reports flat pressure for two strokes gives one notice.
- **`src/ui/pensettings.ts`**: App settings → Pen and tablet. A test pad drawn with the draft curve
  (the eraser end erases), a curve graph, a live readout, the diagnosis and tips, sliders, tilt and
  eraser-end switches, the side-button choice, Set from my test strokes, Clear pad and Restore pen
  defaults. Applies with Apply settings. `AppSettingsUI.show` accepts `focus: 'pen'`, but nothing
  calls it yet.
- Manual (Getting started) and UPDATES entry "Pen and tablet settings". CSS `.pen-*`.

Checks (actual): `npm test` 67 files / 546 passed. `npm run build` passed (main chunk 752 kB /
237 kB gzip, up from 740 kB; the existing warning remains). `npm run test:browser` 35 of 35 passed.
In the dev app on the 127.0.0.1:5217 test origin with synthetic pen PointerEvents, these worked: the
eraser end switched to the Eraser and the tip went back to Brush; mapped pressure (firmness -1,
0.25 to 0.613) and tilt off; the no-pressure notice after two flat strokes; the pad diagnosis and
tips; the phone-width layout with no horizontal overflow. No console errors. Synthetic strokes went
into that test origin's project (two were undone).

Not verified: real Wacom, Huion or XP-Pen hardware with Windows Ink on or off, real eraser-end and
side-button events across browsers (Firefox and Safari report these differently), the
side-button pan with a real pen, and Apple Pencil. The level estimate (the smallest pressure step
seen, rounded to a power of two) is approximate. A pen whose driver sends mouse input cannot be told
apart from a mouse; the pad only shows the Windows Ink tip when a mouse draws on it. No browser
fixture covers the pen section yet.

### Ctrl+A selects the page; Delete respects a canvas selection (2026-10-30, uncommitted)

The user reported that Ctrl+A showed no marching ants, but Delete then removed everything. Cause:
Ctrl+A ran `selectAll()` (every timeline exposure), and Delete/Backspace always ran `deleteFrame()`,
which deleted all selected frames (undoable), even with a lasso selection or during a transform.

- New `App.selectCanvas()`: the whole page as an exact spatial selection (marching ants at the page
  edge). Ctrl/Cmd+A uses it in Draw and Animate; Motion and `timingOnly` keep the frame `selectAll()`.
  A locked layer gives a notice; a blank page, open stroke or transform does nothing.
- Delete/Backspace: `deleteSelectedArt()` when there is a canvas selection, else `deleteFrame()` as before.
- Manual shortcut table (Ctrl+A/Esc, Ctrl + − 0, Delete wording) and UPDATES "Ctrl+A selects the page".

Checks (actual): `npm test` 546 passed; `npm run build` passed; `npm run test:browser` 35 of 35.
In the dev app: Ctrl+A selected 1920×1080 with marching ants (screenshot) and left the frame
selection empty. Delete then cleared the line pixels as one "Delete selected" step with 13 frames
kept, and Undo brought them back. Without a selection, Delete still made "Delete frame (ripple)",
and Undo restored it. Not checked: Ctrl+A in Timing/Motion after this change (same code path as
before), Cmd+A on a Mac, or touch keyboards.

### Tablet buttons: zoom keys and side-button choices (2026-10-30, uncommitted)

A tester using a Wacom reported that their programmed side buttons (zoom and erase) did nothing.
Cause, from the code; not reproduced on hardware: Wacom's Erase function reports the eraser bit,
which `onDown` dropped before `30fd0e5` (button 5). Wacom zoom presets send Ctrl +/−, which fell
through `onKey` to `changeHold` (the frame hold changed and the browser zoomed the page).

- `onKey`: Ctrl/Cmd + = / NumpadAdd and − / NumpadSubtract zoom the canvas about its centre
  (×1.25 and ×0.8); Ctrl/Cmd 0 fits it. All call `preventDefault`. Plain + and − still change the hold.
- `BarrelAction` adds `zoom` (NavMode zoom while held) and `eraser` (Eraser while held; `penEnd`
  takes `barrelErase`, and the tip alone restores the tool). `barrelPan` was renamed `barrelUsed`
  and suppresses the context menu for every choice except `menu`.
- Pen and tablet select, manual, UPDATES ("Tablet buttons") and `docs/testing/pen-tablet-test.md`
  (steps 5 and 6 cover programmed buttons).

Checks (actual): `npm test` 546 passed; `npm run build` passed (753 kB main chunk);
`npm run test:browser` 35 of 35 passed. In the dev app with synthetic events: Ctrl+=, Ctrl+− and
Ctrl+0 were prevented and zoomed or fit without adding an undo step. Side-button zoom changed the
zoom, pan moved the view, and eraser switched to the Eraser with the tip restoring Brush. Those
three kept the menu closed; `menu` still opened it. Not verified: a real Wacom (whether Chrome
receives the driver's keystroke and Erase as expected, with Windows Ink on and off) and Wacom
Pan/Scroll, which sends wheel events (plain wheel zooms the canvas).

### Vector drawing and custom-brush REA (2026-10-30, research only)

The user requested a deep REA study of CLIP STUDIO PAINT's vector drawing/layers and custom
brush variety for possible 2Dope work. Read
[the study](docs/research/clip-studio-paint/VECTOR-BRUSH-REA-2026-10-30.md) and
[the proposed implementation](docs/research/clip-studio-paint/VECTOR-BRUSH-IMPLEMENTATION-PLAN.md).
The research folder retains REA SQLite, PE import/export and native function evidence.

Key distinction: 2Dope already retains editable stroke records, but the vector renderer draws a
solid outline and pen creation strips custom tip/grain images. Rich editable styles require a
versioned appearance renderer, durable geometry/channels, material packaging/loading and reliable
channel-preserving cuts. This is a proposal, not implementation authorization.

Native functions were decompiled in shipped `iswCoreTG.dll` (IllustStudio Libraries For Trigraph,
version 1.10.0.0), including pen-head replacement, channel-preserving curve division and a geometric
curve renderer. Its use by the active CSP 5.0.4 tool is unverified; it is absent from the main
executable's static imports. Do not describe this legacy component as the confirmed modern brush
engine. The report separates completed evidence from timeouts and remaining runtime questions.
The modern main-executable Ghidra trace remained incomplete even with a 30-minute reduced-profile
startup window; failure diagnostics are retained and all task-owned analysis processes were closed.
Two open questions are recorded in the REA bundle: modern rendering internals and physical pen feel.

Claude implementation instructions: [CLAUDE-VECTOR-BRUSH-HANDOFF.md](docs/CLAUDE-VECTOR-BRUSH-HANDOFF.md).
This scopes the first usable custom-vector-brush milestone, with an isolated specimen first,
compatibility/editing foundations and application integration. Giving Claude that assignment is
separate from this research; the instructions do not mean application implementation has happened.

Changed by this research: this handoff and `docs/research/clip-studio-paint/` only. Application
source was inspected, not edited. Concurrent pen/tablet-settings work was present and preserved.
Documentation/evidence checks are recorded in the report; application tests/build and physical
stylus comparisons were not run for this research. No commit, push or deployment by this study.

## Earlier state (2026-10-26)

### Adjust inside a selection and a smaller main bundle (2026-10-26, merged into main and pushed)

The user asked for the remaining improvements from the Draw audit before committing and pushing.
Painting, colour selection and vector clipping were already on main. What was left:

- **Adjust (HSB and Gaussian blur) is limited to the active selection.** `beginAdjust` copies the
  selection mask (`adjusting.mask`) and finds the drawn box only inside it. `previewAdjust` puts the
  pixels outside it back (`keepOutside` in `src/core/adjust.ts`, unit-tested). Blur still reads pixels
  just outside the edge, so it blends, but writes only inside. Vector lines are split once with
  `clipStrokeToMask` (`adjusting.parts`). Only inside parts change colour. A line that crosses the
  edge becomes inside and outside pieces (outside pieces renamed `~o<k>` so ids stay unique); one
  wholly inside or outside stays the same record. One undo step as before. Nothing drawn inside the
  selection gives a notice instead of starting an adjustment. Seven new checks in
  `selectionpaint`.
- **Bundle split.** The manual (`manual.ts` + `manualtext.ts` + figures) and brush import
  (`io/brushimport.ts`) load on first use. The main chunk went from 878 kB / 281 kB gzip to
  735 kB / 231 kB gzip. The What's new dot is set 1 s after boot from the lazily loaded manual.
  If a chunk cannot load (a tab left open across a deploy), a notice asks to reload. The
  large-chunk warning remains: `app.ts` itself is about 270 kB of source, and Share, export and
  Motion are built at boot. Splitting those needs constructor changes.
- Manual and UPDATES: Adjust in the feature table and the selection paragraph; new "Adjust inside a
  selection" release note.

Checks (actual, rebased on `bc6c56f`): `npm test` 66 files / 536 passed. `npm run build` passed
(main chunk 740 kB / 232 kB gzip after Slice 3; the warning remains). Every `tests/*.html` page in
real-time headless Chrome against a dev server on this branch: 35 pages, 873 checks, 0 failed
(selectionpaint 46, pointedit 9, artworklibrary 34, assetlayers 9). The manual opening and the What's
new dot were checked in the real app. Not checked: brush import of a real file after the split, and a
tab left open across a deploy (the reload notice path). iPad/Pencil and touch were not tested.

### Asset layers, command registry Slice 3 and a real-time fixture runner (2026-10-26, merged into main and pushed)

**Layers in Move assets.** With a placement chosen in Move assets, `LayerCards` shows that artwork's
own layers (`assetLayers`) instead of the shot's tracks: thumbnails at the placement's clock, a
"‹ Shot tracks" button for the usual list (which then offers "‹ Layers of <name>" back), and a tap on
a layer opens the source on that layer through the new `App.editAssetSource` hook (main wires it to
`ArtworkAssetsUI.openSource`, now public; `ArtworkAssets.open(id, layerId?)` takes the layer). Done
returns to the shot as before. Drawing inside a source already listed only the source's layers;
outside Move assets nothing changed. `editor.onChange` now refreshes the cards so a new placement
choice shows at once.

**Slice 3 (menus).** `CtxItem` label entries take an optional `id`; `showContextMenu` drops entries
this device hides, then the titles and separators they leave (`visibleItems`, unit-tested). The
frame menu (`framemenu.ts`) and the canvas menu (`App.openCanvasMenu`) carry ids
(`frame.*`, `canvas.*`, registered for naming in `MENU_ENTRIES`) and end with
"Customize this menu…", the same tick list as a row's Customize (`src/ui/customize.ts`,
`customizable()`). App settings → Hidden controls names each entry and where it lives
(`controlInfo`, `CONTEXT_NAMES`). Hide interface and the chip rows inside menus are not hideable.
Not done from the Slice 3 plan: the tool bubbles stay on `toolsFor` and student tool visibility
(`STUDENT_TOOLS` / App settings), so tools do not gain a second hide mechanism; layers/assets rows
are dynamic lists with no fixed actions worth registering; the Motion canvas menu has no ids yet.

**Cleanup.** Removed an unused `XParams` import (`--noUnusedLocals` is otherwise clean apart from
the public `comps` parameter of `assetTimingChange`, kept for its callers). No `console.log`,
`debugger` or TODOs in `src`. Fixtures that stood on "Running…" or failed under
`--virtual-time-budget` (inkpaint, inkpaint-responsive, artworklibrary(+responsive),
assetindependent, assetnames, assetpreviews, brushprefs(+responsive), colourreturn, flipbooksource)
fail the same way on `b30b052` and all **pass in real time**: virtual time does not wait for
IndexedDB, image encoding or animation frames. New `npm run test:browser`
(`scripts/fixtures.mjs`) drives headless Chrome over the DevTools protocol in real time against a
dev server on 127.0.0.1:5217 and exits non-zero on any failure; use it instead of `--dump-dom`.

Checks (actual): `npm test` 66 files / 535 tests; `npm run build` passed; `git diff --check` clean.
Fixtures: `npm run test:browser` **35 of 35 passed, 0 failures** (887 checks), including the new assetlayers 9/0 and commandrow 44/0 (menu checks added).

Not verified: hold-to-hide on a touch device; screen-reader wording of the Customize menus; the asset
Layers view on a phone-width layout (the panel is the same component as before).

### Command registry, Slice 2: the other options rows (2026-10-26, `b30b052`, merged into main and pushed)

Slice 2 of [the command registry handoff](docs/CLAUDE-COMMAND-REGISTRY-HANDOFF.md). The Transform,
Timing, Fill, Smudge, Brush/Vector (`paint`) and Edit points (`points`) rows now draw their action
chips from `src/ui/commands.ts`, with the same labels, titles, icons, pressed states and order as
before, and each row ends with the shared Customize chip. Layers and assets rows are left for Slice 3.

- `Command` gained `name` (the word used in Customize, the hide menu and App settings when the chip
  label is a symbol: `−` is "Smaller", `2` is "Hold for 2") and `face(app)` (label, title or icon that
  follow state: Freeform's title, the straight/curved point chip, the width-scope chip). `ROW_NAMES`
  and `commandName` name rows and commands in App settings.
- Transform renders whole from the registry. The other rows mix commands with controls that stay
  hand-built through `Bubbles.cmd(id)`, which returns nothing for a hidden or disabled command:
  parameter groups (fill modes and styles, Line/Fill plane, select shapes and operations, symmetry and
  guide steppers) wait for Slice 4 variants; hint text, the colour inputs, Brushes and Paint colour
  (they need Bubbles hooks), Point settings and its toggles (Bubbles-local state) and the width meter
  with Thinner/Thicker stay as they were.
- A command chip calls `update()` after `run`, so state no App callback reports redraws through
  `sig`: `transform.freeform` no longer resets `sig`, and `a.smudgeStrength` joined `sig` so the
  strength readout follows Softer/Stronger.
- Ids: `transform.apply|cancel|freeform|smaller|bigger|rotateleft|rotateright|fliph|flipv|fit|reset`,
  `time.hold1..4|shorter|longer|key|breakdown|inbetween`, `fill.swap|selection`,
  `smudge.softer|stronger`, `paint.inkpaint|editpoints`, `points.toggle|allstraight|widthscope|done`.
- Manual sentence and the UPDATES entry "Hide actions in the other options rows".

Checks (actual): `npm test` 65 files / 530 tests; `npm run build` passed (usual chunk-size warning);
`git diff --check` clean. Headless Chrome fixtures: commandrow 37/0 at 1280×900 and at phone width
(new checks for each row's order, Freeform, +, hiding and restoring Smaller by name, Swap, Fill
selection, Softer readout, Edit points, the points row and width scope, Done, Timing holds);
brushcontrols 26/0, paintinglayout 16/0, paintingplanes 36/0, paintingworkflow 20/0, playbackrange
50/0 (and phone), pointedit 9/0, quickmenu 34/0 (and phone), selectionedit 29/0, selectionpaint 40/0,
studentprofiles 28/0 (and phone), placement 13/0, assets 8/0. inkpaint still stalls on "Running…"
in headless Chrome, as before this change.

Not verified: hold-to-hide on a touch device, screen-reader wording of the Customize menus.
Slice 3 followed; see the section above.

### Command registry, Slice 1: the Select row (2026-10-26, `9552148`, merged into main and pushed)

Implements Slice 1 of [the command registry handoff](docs/CLAUDE-COMMAND-REGISTRY-HANDOFF.md),
modelled on [research/clip-studio-paint](docs/research/clip-studio-paint/README.md): stable id,
contexts, hidden bit, and a variant hook (the hook is not used yet).

The source tree was clean before starting. The checkout was on `codex/vector-selection`, and the
dirty `HANDOFF.md` blocked switching to `main`. So `codex/command-registry` branches from `0f36113`
and includes the vector-selection commit. Not committed. Slice 2 was not started.

- **`src/core/commandprefs.ts`** (5 tests): `readCommandPrefs`, `isCommandHidden`,
  `setCommandHidden` and the key `2dope.commands.hidden`. Ids must match `namespace.name`
  (lower case, at most 64 characters); duplicates are dropped and the list is capped at 200.
  Device-local only.
- **`src/ui/commands.ts`** (4 tests).
  - It has the `Command` type, `COMMANDS`, `commandsIn(context)` (all of a row, for Customize),
    `commandsFor(context, app)` (enabled ones, hidden ones not removed) and `commandById`.
  - It keeps a cached device store: `commandPrefs()`, `setHidden()`, `onCommandPrefsChange()` and
    `reloadCommandPrefs()`.
  - The Select commands copy labels, titles, icons and run bodies verbatim from `bubbles.ts`:
    transform, fill, copy, cut, duplicate, delete, invert, deselect, reselect, moveall, selectall
    and paste. It also adds **`select.copytolayer` and `select.cuttolayer`**: those chips postdate
    the handoff's list, and the row must stay identical.
  - `isEnabled` reproduces the old if/else: the selection actions need a selection; Reselect needs
    `canReselect`; Move all and Select all need no selection; Paste needs `hasArtClip`. Orders
    10–140 give the old sequence.
- **`bubbles.ts`.** The Select row's action chips now come from `commandChips('select')`, including
  the no-selection Reselect / Move all / Select all, which the registry expresses identically. The
  shape chips, operation chips and `gradChips()` are unchanged.
  - Each registry chip has `data-command`, and right-click or hold offers "Hide “X” from this row".
  - A **Customize** chip at the end lists all 14 Select commands (✓ when shown; Hide/Show hint) and
    toggles them.
  - `sig` includes the hidden set, and Bubbles redraws on `onCommandPrefsChange`.
- **`settings.ts`.** "Hidden controls" sits under Visible tools and controls. It lists hidden
  commands, each with a Show button that takes effect on Apply (like the rest of the dialog). It is
  not part of student profiles.
- **Copy.** A manual sentence on the options bar, and the UPDATES entry "Hide Select actions you do
  not use".

**Checks.**
- `npm test`: 65 files / 527 tests.
- `npm run build` passed (existing chunk warning).
- `git diff --check -- src tests` is clean.

New fixture `tests/commandrow.html`: **19 / 0** in headless Chrome with a fresh profile. It runs in
two passes around a real `location.reload()`, and covers:
- the exact label order with and without a selection;
- icons, titles and pressed states;
- Copy and Transform still work;
- right-click Hide removes exactly Copy and saves it;
- the tool bar and the transform row are untouched;
- Copy is still hidden after the reload;
- Customize lists all 14 commands and brings Copy back in place;
- App settings Show applies only on Apply;
- student profiles and the comp JSON hold no hidden ids.

Regression fixtures: selectionpaint 40/0, selectionedit 29/0, quickmenu 34/0, paintingworkflow 20/0,
paintingplanes 36/0. At 375px the row still scrolls inside its bar with no page overflow, and
Customize matches the other chips' size.

**Not verified.**
- Touch hold-to-hide on a real device (the fixture uses the contextmenu event).
- The screen-reader announcement of the Customize sheet.
- Hidden-controls labels for commands from later slices (they show "Label (context row)").

**Resume at Slice 2:** move the transform row (`bubbles.ts`, `row === 'transform'`) into the
registry the same way, then time, fill, smudge, paint and points. Extend `commandrow.browser.ts` for
each row.

### Slice 1: vector lines keep to the selection (2026-10-26, `0f36113`, merged into main and pushed)

Implements Slice 1 of [the follow-up slices handoff](docs/CLAUDE-FOLLOWUP-SLICES-HANDOFF.md). It is
on branch `codex/vector-selection` from `6491434`, committed there at the user's request (not pushed
or merged). No source files were dirty before starting. Baseline: 62 files / 502 tests, and the
build passed. Slice 2 was not started.

- **New `src/core/vectorclip.ts`** (16 unit tests in `vectorclip.test.ts`).
  - `clipStrokeToMask(rec, mask, w, h, keep = 'inside')`:
    - It walks every segment in steps of at most 1px, so an unselected strip between two sparse
      points is still found. Point centres alone missed it, and a fixture caught that.
    - It bisects each crossing 8 times between neighbouring samples, and the cut point is taken on
      the kept side.
    - Pieces keep pressure, tilt and time and lose the taper at cut ends.
    - A wholly kept stroke is the same record; nothing kept gives `[]`.
    - Piece ids are `${id}~c${k}` (`vectorcut` uses `~${k}`).
  - `eraseVectorsInMask(...)`:
    - Only the parts of the eraser path inside the mask erase; they are found with
      `clipStrokeToMask` and fed run by run to the existing `eraseVectors`.
    - A touched line keeps its outside parts as they were.
    - It returns null when the inside length is unchanged, so an eraser touching lines only outside
      gives no vector change, in both Whole and Crossing modes.
  - `vectorcut.ts` now exports its `at()` helper.
- **`app.ts`.**
  - New `clipToSelection(strokes, clip)`, which uses the pen-down `live.clip` (null while editing a
    mask).
  - The pen commit clips the record and its symmetry copies. If nothing survives, it shows the notice
    "The stroke is outside the selection." and adds no undo step or `lastShape`. Point-edit-after-hold
    opens the first surviving piece.
  - The Line-plane erase uses `eraseVectorsInMask` when there is a clip. The raster half still clips
    as before.
  - `swapShape` (Edit shape) clips vector replacements with `lastShape.clip`. It refuses before
    undoing if nothing would survive, with the notice "That shape would be outside the selection."
  - The live vector preview is clipped the same way, so a pen line never shows outside while
    drawing.
- **Copy.** The Studio hint now includes Vector lines. The manual's selection paragraph replaces the
  "Vector lines are not clipped" limit. New UPDATES entry: "Vector lines keep to the selection". The
  earlier "Paint inside a selection" entry is left as the dated note it was.
- **Fixtures.**
  - `selectionpaint` check 11 (it asserted the old limit) is replaced by vector checks:
    - one crossing stroke becomes one inside piece with ends on the edges;
    - it is one undo step, and Undo removes it;
    - a stroke across two selected areas becomes two records with none outside;
    - point editing works on each piece;
    - a stroke wholly outside adds nothing, no undo step, and gives the notice;
    - the symmetry copy outside is dropped;
    - QuickShape and Edit shape → Keep my stroke stay inside.
  - Checks 13–14: the vector eraser outside changes nothing and adds no step; inside, it cuts only
    inside and the outside ends stay; Undo restores the original single record.
  - `inkpaint` "A selection restricts automatic paint without acting as a fake closing wall" was
    already failing on `6491434`. The raster stencil (`2298783`) clips the square ink stroke that
    crossed the selection, so the loop never closed. The app behaves as designed; the test setup was
    stale. The check now seeds three sides as existing ink and draws the closing side inside the
    selection. It asserts paint only inside the selection, and no paint when the shape is open (so
    the selection edge is not a wall).

**Checks.**
- `npm test`: 63 files / 518 tests.
- `npm run build` passed (existing chunk warning).
- `git diff --check -- src tests` is clean. The whole tree flags a blank line at EOF in
  `docs/feature-deconstruction/07-…`, another collaborator's uncommitted edit, left alone.

Headless Chrome, fresh profile, 1280×900, against `127.0.0.1:5217`:

| Fixture | Pass / Fail |
|---|---|
| selectionpaint | 40 / 0 |
| selectionedit | 29 / 0 |
| paintingplanes | 36 / 0 |
| quickmenu | 34 / 0 |
| paintingworkflow | 20 / 0 |
| pointedit | 9 / 0 |
| inkpaint | 21 / 0 until it stalls (see below) |

inkpaint then stalls on "Running…", as it also does on a clean `6491434` checkout in headless
Chrome. Its later checks (QuickShape, Edit shape enclosure, full-HD timing, Lite) are not verified
here.

**Not verified.**
- iPad/Pencil.
- The cost of per-pixel segment sampling on long full-HD vector strokes. The live preview reclips
  every frame.
- Vector erase in Crossing mode where a cut crossing lies exactly on the selection edge.
- A selection made after a Transform (the transformed mask is used as it is).

**Resume:** review this branch; Slice 2 (saved selections, then feather) waits until asked.

### Selection editing: colour wand, Reselect, Copy/Cut to layer (2026-10-26, committed and pushed to main at the user's request)

The user asked to check the new research docs and implement from them. The new notes are
[research/procreate-5.4.9](docs/research/procreate-5.4.9/README.md) (saved selections, live wand
threshold, feather with one commit, snapping) and [research/storyboard-pro-24.0.1](docs/research/storyboard-pro-24.0.1/README.md)
(export/import background, nothing to build now). Neither has an implementation handoff. So this
takes the [audit's](docs/DRAW-CAPABILITY-AUDIT-2026-10-26.md) next bounded selection items that need
no schema change. It is built on `2298783`.

- **Colour selection with a live threshold.** New `SelectShape` `'color'` (chip "Colour", palette
  icon). A tap selects the connected pixels within the threshold of the tapped colour, using the
  drawing as seen (Fill, Line, vectors; `visiblePixels`).
  - Pure `src/fill/wand.ts` `colorRegion`: premultiplied RGBA, so empty paper is one colour;
    4-connected; 6 unit tests.
  - Dragging sideways before lifting changes the threshold live: 2 screen px per 1%, with a notice
    "Threshold N%". It is saved to `2dope.select.threshold` on lift.
  - New, Add and Subtract combine against the selection from before the tap
    (`takeSelection(..., prev)`). Esc or pointercancel restores it.
  - The gesture is `wandG`. It counts in `strokeActive` and is routed in move, up, cancel,
    other-pointer and Esc. Selection construction still adds no undo step.
- **Reselect.** `clearSpatialSelection` remembers the dropped selection (`lastSpatial`).
  `canReselect` requires the same project, comp, layer, frame and drawing. A "Reselect" chip shows
  when nothing is selected. It is session-only, not saved.
- **Copy to layer / Cut to layer** (`selectionToNewLayer`, new `copylayer` / `cutlayer` icons).
  - A new drawing gets the selected Line, Fill and wholly-inside vectors (new ids).
  - The new layer is a `structuredClone` of the source layer: timing, transform, settings,
    unlocked, `cel` removed. It goes just above the source and is named "… selection".
  - Its exposures copy the source's lengths. The selected drawing maps to the copy; every other
    exposure maps to one shared empty drawing.
  - Cut also runs `deleteSelectedArt('Cut')`.
  - New `History.combine(n, label)` (2 unit tests) makes the layer edit and the cut one undo step.
    It only combines when the cut actually pushed a step.

Copy: the manual's Select paragraph, two new paragraphs (Colour and threshold; Copy/Cut to layer and
Reselect), and the UPDATES entry "Colour selection, Reselect and Copy to layer".

**Checks.** `npm test`: 62 files / 502 tests. `npm run build` passed (existing chunk warning).
Fixtures in headless Chrome (fresh profile, 1280×900, against 127.0.0.1:5217):

| Fixture | Pass / Fail |
|---|---|
| New `tests/selectionedit.html` | 29 / 0 |
| selectionpaint | 29 / 0 |
| paintingplanes | 36 / 0 |
| quickmenu | 34 / 0 |
| paintingworkflow | 20 / 0 |
| artworkworkflow | 31 / 0 |
| pointedit | 9 / 0 |
| brushreturn | 24 / 0 |

The new fixture covers:
- the Colour chip;
- threshold 0 selecting the exact colour;
- the live drag up and back;
- the remembered threshold;
- cancel;
- Add and Subtract;
- Reselect, including across frames;
- copy pixels in place, source unchanged, one undo and redo;
- cut moving the pixels, the 2+3 exposure timing, nothing shown on the other drawing, one undo.

The new chips were viewed in the real app at desktop width.

`git diff --check` flags a trailing blank line in `docs/feature-deconstruction/07-…`. That file is
another collaborator's concurrent edit and was not touched.

**Not done or not verified.**
- Out of scope: feather (needs fractional masks in every consumer), saved selections (needs
  persistence design), selection-construction undo, tap-to-place polygon lasso, and transform
  precision/snapping.
- Wand cost on a full-HD page: one full-page flood per 1% threshold step while dragging, not
  measured on iPad.
- Copy to layer when the source layer has a layer mask or clipping: both are cloned with the
  settings and not separately tested. Like Duplicate layer, the clone keeps the same mask drawing
  id, so the two layers share one mask.
- Pencil/touch feel of the sideways drag.

### Selection as a painting stencil (2026-10-26, committed and pushed to main at the user's request)

Implements the Must scope of [the stencil handoff](docs/CLAUDE-SELECTION-STENCIL-HANDOFF.md), plus
its Smudge stretch. Baseline `1c06f0c`, on top of the quick-cleanup pass that is also uncommitted.
Committed together with the quick-cleanup pass.

- **A new selection stays a selection.** `selectMoves` is removed everywhere (`app.ts`, `main.ts`,
  `bubbles.ts`, `quickmenu.ts`, two fixtures). `endFill`/`autoSelect` no longer call
  `beginTransform()`. Move all, Select contents and Paste still start Transform themselves.
- **Explicit chips.** The Select row has one chip per shape (Freehand, Rectangle, Ellipse,
  Automatic) and per combination (New, Add, Subtract), with `aria-pressed`. Transform is the first
  action chip. The cycling chips and their `.bub-cycle` dot CSS are gone.
- **Clip helper.** New `src/brush/clip.ts`: `anySelected` (pure, 6 tests in `clip.test.ts`) and
  `maskCanvas` (browser only).
- **`RasterEngine`.** `begin(record, clip?)`: an array sets the clip, `null` clears it, `undefined`
  keeps it. `cancel()` (and so `commit()`) clears it. `apply()` returns early when no selected pixel
  is in the rect. Otherwise it copies the stroke image into a new `stencil` canvas and uses
  `destination-in` with the mask canvas (built once per stroke; `clipImageCanvas` and `stencil` are
  resized with the engine). The shared buffers are never masked in place. Predicted-input ghosts
  (`drawGhost`) go through the stencil too. `commit()` returns null when the pixels did not change,
  so there is no undo step.
- **App.** `beginStroke` slices the selection mask once at pen-down into `live.clip` (null while
  `editingMask`) and passes it to `raster.begin`. Ink & Paint's `autoPaint.selection` reuses it.
  `redrawShape` keeps it (`undefined`). `lastShape.clip` is passed again by `swapShape` (Edit shape).
- **Smudge.** Clipped: `beginSmudge` builds a reused mask canvas. `smudgeDab` places the dab on
  whole pixels when clipped and masks it with `destination-in`. A smudge that changes nothing adds
  no undo step (also without a selection).
- **Copy.** Studio hint (`panel.ts`), manual tool-bar line and Select paragraph, and a new UPDATES
  entry "Paint inside a selection" that names the limits.

**Limits (documented in the manual and release note).** Vector pen strokes are not clipped. The
Eraser on the Line plane still cuts vector lines outside the selection (`eraseVectors`), so an
eraser stroke outside can still add an Erase step when it crosses vectors. Painting a layer mask
ignores the selection by design. Adjustments are not clipped (out of scope).

**Checks run.** `npm test`: 60 files / 494 tests. `npm run build`: passed with the existing
large-chunk warning. `git diff --check` is clean. Fixtures, run in headless Chrome with a fresh
profile against `127.0.0.1:5217` (the in-app pane was hidden, so animation frames would not run):

| Fixture | Result |
|---|---|
| New `tests/selectionpaint.html` | 29/0. Covers acceptance checks 1–12, plus Smudge and mask editing. |
| paintingplanes | 36/0 |
| quickmenu | 34/0 |
| paintingworkflow | 20/0 |
| artworkworkflow | 31/0 |
| pointedit | 9/0 |
| brushreturn | 24/0 at 1280×900 (one 44px-scroll layout check fails at 1024×768) |

`inkpaint` stays on "Running…" in headless Chrome after "Alpha Lock never introduces…" or "Cancelled
Pencil…". A clean worktree of `1c06f0c` stalls the same way, so this predates this change. It is not
verified in a visible tab.

The Select row was looked at in the real app at the Simple and Full levels and at 375px, where it
scrolls inside its bar and the page does not scroll sideways. Its chips stay at the existing compact
height (under 44px), like the other option rows.

**Not verified.** iPad/Pencil feel and Lite memory with two extra full-page canvases. Clipping with
a textured or image-tip brush (the fixture uses a plain round brush). Ellipse and Automatic
selections as stencils (only rectangles were painted through). Save/reopen (no schema change).

### Quick cleanup pass (2026-10-26, committed and pushed to main with the stencil work at the user's request)

The user asked to fix the two broken browser fixtures, add the missing Move assets notice and test
the point-edit workspace-switch fix with a real vector line. Kept local for review.

- **flipbooksource / artworklibrary were not app bugs.** Both pass in a visible or headless Chrome
  (26/0 and 34/0; artworklibrary-responsive 34/0). They failed only in a *hidden* in-app browser
  pane, where `requestAnimationFrame` never fires. Playback could not advance, and bare
  `await new Promise(requestAnimationFrame)` hung the page on "Running…". Both fixtures now wait for a
  frame for at most 500ms (`nextFrame()`) and first report
  `FAIL: Animation frames run (this tab is hidden or in the background: show it and reload)` instead of
  hanging. Run fixtures in a visible tab or in headless Chrome. The in-app pane must be on screen.
- **Move assets with nothing placed** now gives the notice "Nothing is placed in this shot yet. Open Assets
  and place one, then Move assets can arrange it." (`App.setArrangeAssets`, only when turning on).
  Covered by a new first check in `artworkworkflow`.
- **Point edit settle, tested on a real pen line** (new `tests/pointedit.html`,
  `src/ui/pointedit.browser.ts`, 9 checks). A finished point drag and a pending live width change are
  kept on a workspace switch, as `Move point` / `Line width`, with Undo/Redo correct. **Bug found and
  fixed:** switching workspace *during* a point or handle drag moved the point with no history step,
  so the next Undo skipped it. `exitPointEdit()` now pushes the unfinished drag as one `Move point`
  (or `Curve handle`) step, like letting go, but without a snap-join. The later pointerup is ignored.
- The UPDATES "One way to switch workspaces" entry has one more sentence for these two changes.

Checks: `npm test` 59 files / 488 passed; `npm run build` passed (existing large-chunk warning).
Headless Chrome (fresh profile, http://127.0.0.1:5218, a separate test origin): paintingworkflow
20/0, artworkworkflow 31/0, flipbooksource 26/0, artworklibrary 34/0, artworklibrary-responsive
34/0, pointedit 9/0. The hidden in-app pane was confirmed to report the new RAF failure. Not done:
the rest of the fixture suite, real touch/Pencil hardware, and the logo session's files. The
point-edit check uses synthetic mouse pointer events.

### App logo and site icon (2026-10-26, committed and pushed to main at the user's request)

The user supplied `2dopeLogo.svg` (an Affinity export with embedded gradient images) for the site
icon and app logo. It is now `public/logo.svg`, with the size fixed to 300×300 instead of 100%.
`public/favicon-32.png` (transparent) and `public/apple-touch-icon.png` (180px on `--bg` #1d1d22)
were rendered from it with headless Chrome. `index.html` links all three. The logo also sits at the
top of the menu (`.menu-logo`, decorative alt) and in the Projects header (`.glogo`, before the
crumbs). `public/404.html` shows it and resolves its path from the `/2Dope/` root. A release note was
added. Checks: 59 files / 488 tests and the build passed; `dist/index.html` uses `./` paths. The menu
and Projects header were viewed on the 127.0.0.1:5217 test server at desktop width. Not checked: a
real iPad home-screen add, Safari's tab icon, phone-width Projects header, and the deployed 404 page.

### Draw exploration (2026-10-26, research only)

The user asked to parse the current Draw tools and explore Procreate-like additions, especially
selections. [Current audit](docs/DRAW-CAPABILITY-AUDIT-2026-10-26.md) maps implemented tools,
source limitations, official Procreate handbook behavior and a proposed implementation order.
No application behavior changed. Baseline `c870fbf` was clean; 59 files / 488 tests and the
production build passed (existing large-chunk warning).

Focused Chrome check on isolated `127.0.0.1:5227`, disposable 720p project: Rectangle selection
immediately enters Transform; Apply restores Copy/Add/Subtract actions; Brush paints beyond both
selection boundaries. Evidence: `docs/draw-audit-2026-10-26.png`. Smudge/Eraser/adjustment selection
limits were inspected in source, not freshly demonstrated. No complete fixture suite, iPad,
save/reopen, REA, commit, push or deployment. Earlier selection studies predate the current code.

Suggested next step: explicit Select controls and deliberate Transform entry, then hard-edged
selection clipping for raster painting. Preserve vectors and settle crossing-stroke behavior
before claiming all-tool selection support. The audit is a proposal, not an implemented release.

### Procreate 5.4.9 package read (2026-10-26, research only)

The user asked for a REA pass on their local Procreate `_Pro.ipa` ("I believe I have an IAP"), then
to finish the job. [docs/research/procreate-5.4.9/README.md](docs/research/procreate-5.4.9/README.md)
records what the package shows: identity (5.4.9 / 57074, iPad, `au.com.savageinteractive.procreate`),
a repack marker (`cryptid 0`, no provisioning profile), no in-app-purchase code, and the shipped
Objective-C and Interface Builder vocabulary for saved selections, live wand threshold, feather
preview plus single commit, and angular-versus-Cartesian snapping. It also confirms the feather
popover is one slider. No method bodies were decompiled (Windows Ghidra does not admit iOS Mach-O),
no code was executed, and no app file changed. The [Draw audit](docs/DRAW-CAPABILITY-AUDIT-2026-10-26.md)
carries a one-paragraph addendum so its "no .ipa inspected" sentence is no longer read as current.

### Storyboard Pro 24 binaries read (2026-10-26, research only)

The user then asked for the same static REA pass on `F:\ToonBoom SBP\win64\bin`.
[research/storyboard-pro-24.0.1/README.md](docs/research/storyboard-pro-24.0.1/README.md) records it:
24.0.1.23015, Qt 6 + OpenSceneGraph; `.sboard` projects; an export/import class map (EDL, AAF, FCP
XML, CSV, PDF with analyse and preview jobs, QuickTime with one-movie-per-panel, Final Draft and
Harmony import); a QtScript automation surface; and FlexNet-wrapped `*_libFNP.dll` modules around an
otherwise unpacked executable. No decompilation and nothing executed.
[Doc 16](docs/feature-deconstruction/16-storyboard-pro-animatic.md) gained a dated section, and its
index entry and "Still to do" line were updated. No app file changed.

### Procreate Dreams 1.0.11 package read (2026-10-26, research only)

The user asked for the same static pass on the Dreams `.ipa`.
[research/procreate-dreams-1.0.11/README.md](docs/research/procreate-dreams-1.0.11/README.md) records
it: bundle `au.com.savageinteractive.Dreams` 1.0.11 (17168), documents `.dream`/`.drm` and `.alpine`,
a `Valkyrie` chunk container with embedded JPEG/PNG frames, the Valkyrie/Phoenix/DisplayList/
Compositor engine split, 1,243 ObjC classes across 70 Swift modules, and model names for tracks,
content, keyframes-as-attributes with subframes, onion-skin caps and `blendPrimaryFrame`, per-frame
palettes, masks/clipping and export families with a codec limit. No decompilation, nothing executed.
Docs [07](docs/feature-deconstruction/07-procreate-dreams-handbook.md) and
[08](docs/feature-deconstruction/08-dreams-cleanroom-spec.md) gained dated package-evidence sections
(08 no longer claims nothing was read). No app file changed.

### Clip Studio Paint UI model verified (2026-10-26, research only)

The user brought a finding from another session — CSP's tool UI is a shipped SQLite database — and
asked how to use it here. Re-verified with REA's SQLite inspector:
`Settings\PAINT\Tool\english\EditImageTool.todb` (893,952 bytes, SHA-256 `c06ba91b…`, SQLite 3.53.4,
UTF-16LE), tables `Manager` (12 columns), `Node` (24), `Variant` (504). `Node` is the command tree
with a stable `NodeDefaultIdentifier`, UUID sibling/child links, `NodeHidden`/`NodeHideByGrade`
flags and `NodeVariantID`; `Variant` is **not** a language table but a sparse per-node parameter row
(sampled rows are NULL outside their tool's columns), so one command can present different controls
per context. Recorded in
[research/clip-studio-paint/README.md](docs/research/clip-studio-paint/README.md); the 2Dope plan —
one registry, per-context filters, persisted hidden set, variant hook, starting with the Select row —
is in [CLAUDE-COMMAND-REGISTRY-HANDOFF.md](docs/CLAUDE-COMMAND-REGISTRY-HANDOFF.md). No app change.

**Latest step: easy delete for imported sounds and movies.**
The user authorized committing and pushing this to main on 2026-10-26.
The user reported no easy way to delete imported sound and video. Sounds could only be deleted from
the folded Settings controls; movies/pictures are ordinary drawing layers whose delete sat in the
Flipbook hold menu, Layers and Motion. No data/format change: delete reuses the existing audio
History edit and `CompEditor.deleteLayers`.

- `core/audio.ts` `withoutClip` (2 unit tests). `AudioTracks.deleteClip` (one "Delete sound" undo
  step, closes the card, notice "Deleted … Undo brings it back.") and `soundMenu` (Settings…,
  Mute, Delete sound). Trash buttons on Clips rail sound rows, Motion sound rows, Audio lane rows
  and the sound card header; the controls' "Delete clip" is now "Delete sound". Hold/right-click
  menus on sound blocks (Clips/Motion) and Story timeline sounds (`Board.setSoundMenu`).
- `rails.ts`: hold/right-click on a top-level layer name tag in Clips offers Rename… and Delete
  layer (confirm, undoable). Import notices for movies, pictures and sounds say how to remove them.
- Manual (Layers media list, Audio) and release note "Easy delete for sounds and movies".

Checks: 59 files / 488 unit tests, strict TypeScript and build passed. Browser on 127.0.0.1:5217 with a generated 1 s WAV and a
generated WebM: the Clips trash, the block menu, the card trash, the Motion trash, the Audio lane
trash and the Story timeline menu each removed the sound, with one Undo restoring it. The Clips
layer menu's Delete layer confirmed and removed the movie layer; Undo restored it. Not checked on
touch hardware (hold timing) and the movie had no sound track, so movie+sound import was not re-run.

### Earlier step (2026-10-26): shared workspace navigation, ebee0fc

The user reviewed and authorized committing and pushing this to main on 2026-10-26.
The user asked to move Draw/Animate workspace switching into the shared mode bubbles, fix tool
options leaking across workspaces (repro: Fill in Draw, then Motion showed Fill options), audit
the visible buttons per workspace, and keep changes local.

- Navigation: `paintingworkspace.ts` drops the workspace `<select>` and Draw/Animate shortcut
  (constructor loses its `share` argument; 13 browser fixtures updated). The shared mode row shows
  in Draw/Animate at every level (it stays hidden at Focus elsewhere, as before). Share lights
  while open and the name beside the row reads Share. `.painting-header` now holds only New asset /
  Assets / source editing. `Bubbles.placePaintingRows` places it right of the mode row when it
  fits (desktop, 768px tablet), else under it (phone), and moves the tool row down only on overlap.
  On phones New asset is now an icon button instead of `display: none`.
- Options row: new pure `optionsRow` / `toolChoice` in `core/workspace.ts`; `bubbles.ts` routes
  every options branch through it. Fill, Select, Smudge, Adjust, transform, point editing, asset
  arranging and QuickShape Edit shape only appear in Draw/Animate. Adjust now wins over the Fill/
  Select tool under it (previously its sliders/Apply/Cancel never showed after Fill or Select).
  Gradient Done/Cancel also show under Select (Fill selection with a gradient style had none).
- `App.setWorkspace` calls `settleTemporaryEdits`: applies an open transform and adjustment and
  exits point editing (each one existing undo step). Gradient edits were already applied.
- Feedback instead of silent no-ops: Earlier/Later at the first/last panel or drawing; Fill
  selection, transform and Edit points on a locked layer or a still-loading drawing. QuickMenu's
  key handler no longer throws for keys dispatched on document/window (noted on 2026-10-24).
- Manual (Draw and Animate, workspaces), release note "One way to switch workspaces",
  ARCHITECTURE note added.

Audit (127.0.0.1:5217, disposable 1080p project, desktop): every Story, Timing and Motion tool
bubble and options chip was clicked and its effect recorded (history label, layers, workspace,
notice or panel). All acted; Effects with a camera selected falls back to the first drawing layer;
Split outside a layer already explained itself. Draw tools and their chips were exercised too.
Not changed: Move assets with nothing placed still enters arranging with only its hint.

Checks: 59 files / **486 unit tests** (4 new options-row tests), strict TypeScript and production
build passed. Browser on 127.0.0.1:5217: Fill→Motion shows Motion options, Timing/Story their own;
Adjust after Select shows Apply/Cancel/Colour/Blur; transform and HSB adjustment are kept on a
workspace switch and one Undo removes each; first-panel Earlier shows its notice; Share lights.
No overlaps among dock, modes, asset header, tools, options, level and edge handles in Draw and
Animate at all three levels at 1440x900, 768x1024 and 375x812. Fixtures: paintingworkflow 20/0,
paintingplanes 36/0, artworkworkflow 30/0, brushcontrols 26/0, inkpaint 27/0, paintinglayout
16/0, quickmenu 34/0, studentprofiles 28/0, brushreturn 24/0, colourreturn 16/0, playbackrange
50/0. flipbooksource fails "Source playback advances and loops…" and artworklibrary stays on
Running… — both identical on an unchanged HEAD copy (127.0.0.1:5218), so not from this change.
Note: my audit clicks saved symmetry/guide/fill prefs on the 5217 test origin, which broke
fixtures until those keys were removed there; reset test-origin prefs before fixture runs.
Point-edit settle was not exercised with a real vector line, and physical iPad/Pencil was not tested.

### Earlier step (2026-10-26): menu workspace names, 1f3d413

The user authorized committing and pushing this rename to main on 2026-10-26.
The user asked for the menu's Board and Time buttons (`index.html`, `data-ws` board/time) to be
renamed Story and Timing, the names that the mode bubbles, the painting switcher and the manual
already use. Only the button labels changed; the `data-ws` values, layer names ("Board" guide
layer), the export option and historical release notes are untouched. A line was added to the
2026-10-26 release note. Checks: 59 files / 482 tests, strict TypeScript and build passed. On
127.0.0.1:5217, the menu shows Story / Draw / Animate / Timing / Motion, and each button opens
its workspace (ws-board, ws-draw, ws-animate, ws-time, ws-motion).

### Earlier step (2026-10-26): sizing, corner and text-size pass, 8b0fd1f

The user authorized committing and pushing this pass to main on 2026-10-26.
The user reported the live site looked unchanged and asked to also fix the button sizes and the
corner/text-size drift. The deployed CSS/JS did contain f94e90a (checked by fetching the live
assets); Pages sends `Cache-Control: max-age=600`, so a browser can show the old page for up to
10 minutes. A hard refresh loads the new one.

- Menu dock and level button: 40px to 44px. They now sit 5px below the 8px bar top, which centres
  them on the 54px bubble rows and painting header (desktop centre 35px in every workspace and
  level). Over the Full top bar (`ui-full`, not quick/hidden/collapsed/painting) the dock sits at
  4px and the top bar's min-height is 52px. At 480px and below, the 46px bubble rows outside the
  painting workspace use +1px. Neighbouring offsets moved from 56px to 60px: bub-modes, bub-tools, bub-ctx,
  painting header, and the `bub-stack` width check in `bubbles.ts`. Also: the top bar's left padding
  is 60px, the menu sits at +55px and the level menu at 63px.
- Corners: new `--radius-xs` 4px, `--radius` 8px, `--radius-md` 12px, `--radius-lg` 16px, `--pill`.
  Every `border-radius` maps onto them: 3-5px go to xs; 6, 7, 10 and 11px go to 8px (controls in
  panels); 14-28px panels go to 16px; pill-shaped controls use `--pill`; 1-2px hairlines and 50%
  are kept. The boot-failure box in index.html is now 12px.
- Text: 9px to 10px (5 labels); a manual h4 and the colour panel title went from 14px to 15px.
  The App settings title (17px) and Share title (18px) are now 16px, like other dialog titles.
  16px inputs are kept to stop iOS zooming in.
- Release note: the 2026-10-26 entry gained an item.

Checks: 59 files / 482 tests, strict TypeScript and build passed. On 127.0.0.1:5217 at
1440x900, all five workspaces at all three levels have the dock, level button and adjacent bar
sharing a centre line, with an 8px gap. At 375x812 the Draw and Time centres match
(35 and 31), there is no horizontal page overflow, and there are no console errors. Browser
fixtures were not re-run, and the Board, gallery, share and effects panels were not inspected
one by one.

### Earlier step (2026-10-26): UI consistency pass, f94e90a

The user authorized committing and pushing this checked pass to main on 2026-10-26.
The user asked to clean up inconsistent UI. Scope was styling and one class bug; no behaviour,
data, file format or History changes.

- `style.css`: new `:root` tokens `--on-accent` (#fff), `--key` (#ffd24a), `--board` (#f0c040)
  and `--danger` (#ff7b7b). Text on accent backgrounds was split between #1d1d22/#15151b (classic
  toolbar, pressed buttons, tabs, Play, primary, menu dock, gallery check, video save) and white
  (bubbles, painting views, dialogs); all now use `--on-accent`. Role chips (key/breakdown/
  inbetween) keep dark text on purpose. Near-duplicate yellows (#ffd25a, #e8c45a) now use `--key`,
  #ff6b6b uses `--danger`, and hardcoded #ff5a8a / rgba(255, 90, 138, a) now derive from
  `--accent` (via `color-mix`). Greens (#3fbf8f group/sound, #4ade80 share OK) and the canvas/
  tag palettes in TypeScript were left alone.
- QuickMenu trigger: `quickmenu.ts` replaced `className`, dropping `has-ico`, so the icon and label
  sat at different heights. It now adds the class; radius/font match the other edge handles.
- Menu: the five workspace buttons use a new `.menu-grid.workspaces` (3 + 2) instead of a
  4-column grid that left Motion alone on a row. Sidebar eyedropper radius matches Undo/Redo.
- Release note "More consistent controls" added. `.claude/launch.json` gained a `2dope-test`
  entry serving 127.0.0.1:5217 as an isolated test origin.

Not changed: the 40px menu dock and level buttons (their offsets line up with the top bar, bubbles
and painting header in different modes), and general radius/font-size drift across panels.
Contrast note: white on #ff5a8a is about 3:1; setting `--on-accent` to #1d1d22 would give about
5.7:1 if that is preferred.

Fresh checks: **59 files / 482 unit tests**, strict TypeScript and production build passed
(existing large-bundle warning). Dev server on isolated 127.0.0.1:5217, new 1080p test project at
1440x900: QuickMenu icon and label centred on the same line, workspace grid 3 + 2, selected menu
button text white, no console errors. Browser fixtures were not re-run; Board, Time, Motion,
share and gallery panels were not reviewed visually.

**Next:** user review of the colours and menu layout.

### Previous step (2026-10-24): code and UI cleanup after 206e7fb

The user authorized committing and pushing this checked cleanup to main on 2026-10-24.
The user asked to clean up the code and UI. The scope was dead code, dead CSS and leftover
colour emoji. No behaviour, data, file format or History changes.

Code: removed unused `isResident` (core/project), `contextMenuOpen` (ui/contextmenu) and the
`LayerKind` type (core/comp). Constructor parameters that were stored but never read are now plain
parameters in AssetClipDrag, QuickBar, Splitter and XSheet. `tsc --noUnusedLocals
--noUnusedParameters` now reports only `assetTimingChange`'s unused `comps`, which was kept so
it matches the signature of `assetClipTimingChange`.

CSS: removed rules with no matching element: `.logo`, `.hold-readout`, `.role-text-*`, `.dfoot`
(the `.vfoot` half of that rule is kept), `.share-seg`, `.fx-del`. Classes built from templates
are still live (`role-${r}`, `painting-${key}-handle/-folded`, `ui-${level}`), so treat any
"unused class" scan with care.

UI: the focus bar's Tools/Timeline/Share buttons use `data-icon` (panel/time/export) instead of
emoji. Motion layer and part eyes use the SVG `eye` icon, and an empty gallery folder uses the
`folder` icon. Emoji were removed from:
- effect and dither palette labels
- storyboard caption placeholders
- Key role chip and frame-menu label
- Board view chips
- Effects/texture menu items
- layer-card tags (a still stack now shows "still ·")
- gallery Move-to folders
- the Hand in legend
The flipbook key-drawing marker is now ◆. The Studio preset option for a personal brush reads
"Name (My brushes)" instead of using ⭐, which now means Favorites. Monochrome text symbols
(✓ ✕ ★ ♪ ☰ ✎) and the flipbook colour-tag dots were kept on purpose, as was the default
"📝 Notes" layer name, because it is saved in project data. Release note added.

Changed: index.html, style.css, core/{comp,dither,effects,project}.ts, ui/{assetclipdrag,
board,bubbles,contextmenu,flipmode,framemenu,gallery,layercards,manualtext,motion,panel,quick,
share,splitter,xsheet}.ts, this handoff.

Fresh checks: **59 files / 482 unit tests**, strict TypeScript and production build passed
(existing large-bundle warning remains). Dev-server review on isolated `127.0.0.1:5216` used a
new 1080p test project:
- The focus bar at Full level shows the SVG icons with intact labels and aria-labels.
- The Timeline toggle folds and unfolds and keeps its icon.
- The Motion eye toggles between the icon and – both ways.
- No app console errors.

A synthetic Escape dispatched on `document` threw in QuickMenu's key handler
(`target?.closest` on a non-Element). Real key events target an element, so it was not fixed.
Browser fixtures were not re-run, and the effects, board and gallery labels were not checked
visually. User project storage was not touched.

Committed and pushed to main as 97e6e1e. Pages run 40119614142 succeeded for exact SHA
`97e6e1ecab1a4641019818f2ede88669b598e6ac`, and the public site served the new "Tidier labels" note.

**Next:** user review of the cleaned-up labels and icons.

### Previous step: brush memory, Favorites and Recent release, following 586f67d
The user authorized committing and pushing this checked release to main on 2026-10-23.
The user approved this bounded next Draw improvement. Each brush recalls its working size and
opacity when selected through the library or Studio preset selector. Draw/Animate and painting
tools share the existing brush identity. Other Studio changes still require Save brush to keep
a reusable definition; saving over a personal brush supplies its exact new values.

Brushes adds Recent (five unique choices, latest first) and Favorites ahead of the existing
collections. The fixed header has a 44px pressed Favorite button, and the existing hold menu
offers Add/Remove from Favorites for any card. Favorites reuse original cards/definitions, with
star marks and helpful empty states. Selecting Recent keeps focus on its moving card; removing
a favorite through the menu recovers to its card or the category. Rename carries preferences;
delete removes them and selects Pencil when deleting the active personal brush.

`core/brushprefs.ts` validates bounded metadata in device-only `2dope.brushes.preferences`:
version 1, up to 610 name/size/opacity entries and favorites, five recent names. No image data,
document fields, schema migration, drawing Undo, student-profile fields or extra canvases.
Existing current-brush and personal-definition stores remain in place. Changed: new core
preferences/tests, App, BrushLibrary, icons/CSS, browser/responsive fixtures, four existing fixture
preference guards, manual/UPDATES, architecture/project-format/test docs and this handoff.

Fresh checks: **59 files / 482 unit tests**, strict TypeScript/production build and diff check
passed (existing large-bundle warning remains). On isolated `127.0.0.1:5214`, new workflow
**21/0 each** at desktop, 390×844, 1024×768 and 768×390; brush return **24/0**, brush controls
**26/0**, integrated painting **20/0** = **154 browser assertions**. The initial new fixture caught
context-menu focus loss (fixed) and a fractional 44px measurement (uses existing 43.9 tolerance).
Brush-controls previously expected an explicit same-name definition to reset values; it now
uses the same exact-definition bypass as Save brush while new tests cover ordinary recall.

Native built review on isolated `127.0.0.1:5215` created a 720p test project, favorited Textured
Paint, adjusted it to 11px/30%, switched to Marker and back through Favorites, and reloaded:
brush, values, favorite and selected Favorites category retained. Corrected a selected-button
theme clash discovered visually. Screenshot: `../artifacts/brush-memory-favorites.jpg`.
User project storage was not cleared. Release prepared for the authorized main push; verify
Pages for the exact pushed SHA. Physical iPad/Pencil/Safari review
and earlier deferred Clips/view fixture failures remain separate.

**Next:** user review of brush shortcuts; selection feathering/saved selections were the next
suggested Draw improvement, not implemented or otherwise authorized by this step.

### Previous step: raster taper and textured paint release

**Latest step: raster taper and textured paint release, including the preceding UI icon cleanup.**
The user authorized committing and pushing these checked changes to main on 2026-10-23.
The user chose brush feel over Procreate parity work. Raster tapers now use a smooth finite-slope
profile with enough length for wide brush tips, a subpixel end stamp at the recorded endpoint,
and a visible full-sized mark for finished taps. Short flicks do not inflate into broad blobs.
Start-only tapers also rebuild on commit. Existing vector outline code and saved raster pixels
are unchanged; no project/brush format fields or migration were added.

Grain now modulates each dab before it accumulates in the coverage buffers, instead of punching
a fixed texture out of the finished stroke. Light pressure retains texture, stronger pressure
and overlapping passes fill paper valleys, and stroke opacity remains the final ceiling. This
reuses the existing scratch plane and cached paper patterns, clipping work per stamp with no
additional document-sized canvases or per-stamp readbacks. Prediction remains preview-only.
Also fixed image-tip rotation at full roundness, grayscale decoding before letterboxing,
rotated commit/Undo bounds, collision-prone colour-tip cache keys, and colour-jitter index reset
when taper/post-correction replays a stroke. Added **Textured Paint** to Brushes → Painting.

Changed this step: `brush/dabs.ts`, `brush/raster.ts`, `core/brush.ts`, the painting category
mapping in `core/brushlib.ts`, new `brush/dabs.test.ts`, `brush/feel.browser.ts` and
`tests/brushfeel.html`, manual/UPDATES, architecture and test docs. The previous icon cleanup is
preserved. Fresh verification: **58 files / 477 unit tests**, strict TypeScript/production build
and diff check passed (existing bundle-size warning remains). New brush-feel fixture **23/0**,
brush return **24/0**, Ink & Paint **27/0**, integrated painting workflow **20/0**: **94 browser
assertions** on isolated `127.0.0.1:5211`. A long 720p textured stroke measured about 46–63ms on
this desktop. An earlier brush-return attempt lost its context menu while the viewport changed;
the stable rerun passed all 24 checks. No app change was made to bypass that fixture.

Built preview on isolated `127.0.0.1:5212`: chose Textured Paint from Painting, confirmed its
48px Brush/Line identity and return to canvas, drew real mouse strokes with an overlapping pass,
and visually checked tapered tips, texture and coverage buildup. Reload retained the strokes,
Textured Paint selection and 48px size. Test-only artwork remains on
that origin; user project storage was not cleared. Samples/screenshots:
`../artifacts/brush-taper-textured-paint.png`, `textured-paint-preset.png`,
`textured-paint-native-strokes.png`. Release prepared for the requested main push; verify Pages
for the exact pushed SHA. Physical iPad/Pencil feel and Safari
performance remain unverified; earlier deferred Clips/view fixture failures remain deferred.

**Next:** user review of Textured Paint and tapered strokes on the intended stylus/device.

### Previous step: UI icon cleanup

**UI icon cleanup, implemented after published release 94bd127.**
Replaced the main emoji/generic placeholders with the existing 24px current-colour SVG system.
Brushes and its category/collection tabs, Import/Studio/Save/New actions, Reference modes/navigation/
eyedropper/close, and Flipbook in Clips and Motion now use shared icons. Added distinct Ink & Paint,
palette, playback range, reset rotation, import, download, save and folder icons; Settings uses a
cog. QuickMenu reuses these icons and changes its Play icon to Pause during playback. Range labels
and selected frame numbers remain visible in the Simple strip/navigation toolbar after icon updates.
Effects has plain text names, SVG add/close/more controls and 44px close/more targets. Reference
buttons also have 44px minimum targets. Kept accessible labels/tooltips and existing action paths.

Changed: `src/ui/icons.ts`, Bubbles, BrushLibrary, Reference, Strip, Motion, PlaybackRangeControl,
QuickMenu, ArtworkAssets/ArtworkLibrary, EffectsPanel, core brush category/QuickMenu presentation
catalogs, index/CSS, manual/UPDATES and brushreturn/paintingworkflow fixture label selectors.
This is presentation work; project data, category IDs, preferences and History behavior are unchanged.

Fresh verification: **57 files / 470 unit tests**, strict TypeScript/production build and diff check
passed; existing large-bundle warning remains. Browser checks on isolated `127.0.0.1:5209`:
Brush return **24/0**, phone QuickMenu **34/0**, phone range/gesture **50/0**, integrated painting
workflow **20/0** = **128 assertions**. Built-app review on isolated `127.0.0.1:5210` checked brush
categories and actions, Reference mode switching/all header targets, saving a source to My Assets
and its import/download icons, Motion Flipbook/Range, and Effects add/more/Escape/close. Verified
Reference and Effects targets at least 44px, and labels/icons remain intact after reload.
Screenshots: `../artifacts/ui-icons-brush-library.png`, `ui-icons-reference.png`, `ui-icons-assets.png`,
`ui-icons-effects.png`. Test projects/preferences remain only on isolated review origins. User project
storage was not cleared. No commit or push this step. Physical iPad/Pencil/Safari review remains pending;
older deferred Clips/view fixture failures stay deferred.

**Next:** user review of the icon cleanup; follow their direction for publishing or further work.

### Previous step: published release cleanup (94bd127)

**Final release cleanup, committed/pushed to main as 94bd127; Pages build/deploy succeeded.**
App settings now keeps Student profiles first and groups Visible tools and controls, Drawing
options, QuickMenu and Gestures into collapsible sections. QuickMenu Customize opens its section
directly. Profile guidance distinguishes updating the selected profile from saving a separate
setup. Updated `src/ui/settings.ts`, manual/UPDATES and test-document headings; no model or file
format changes in this cleanup. All accumulated My Assets, QuickMenu, Ink & Paint, playback-range,
gesture and student-profile work since 086c7da is included in this release.

Fresh cleanup verification: **57 files / 470 unit tests passed**, strict TypeScript and production
build passed, and staged diff check passed after trimming extra fixture EOF blank lines. The
existing large-bundle warning remains. Fresh browser release checks: student profiles **28/0
each** at phone and landscape sizes, QuickMenu **34/0**, playback range/gesture **50/0** at tablet,
My Assets **34/0**, Ink & Paint **27/0**, and integrated painting workflow **20/0**: **221 assertions**.
Native built-app review on isolated `127.0.0.1:5205` confirmed all four settings groups initially
collapsed, the saved Background painting profile retained, and QuickMenu Customize directly
opening its section; Cancel returned without applying changes. Screenshot:
`../artifacts/release-settings-cleanup.png`. Tests do not clear user project storage. Physical
iPad/Pencil/Safari and audible output remain separate checks; older deferred Clips/view fixture
failures remain deferred. Pages run 40029682128 succeeded for exact SHA
`94bd127a1b6cf0f9d066f78fb21ea8fa46901e8c`; the public site served the new cleanup/profile text.

### Previous step: student tool profiles

**Student tool profiles, implemented after 086c7da.**
The user requested tool/setting choices and named profiles in App settings. Built Student profiles
with a chooser, profile name, Save as new profile, Rename and Delete. Profile selection previews
its values; all profile/setup mutations stay in the dialog draft until Apply settings. Applying
updates the selected named profile; Cancel/Close/Escape discard the complete draft. Current setup
handles unnamed/customized preferences. Names are trimmed/collapsed, limited to 40 characters and
unique ignoring case; up to 20 profiles. Profile write failure leaves the draft open, live settings
and persisted profiles unchanged. Status/errors stay in the fixed footer beside Apply/Cancel.

Visible tools and controls chooses painting tools, Line/Fill, Ink & Paint, symmetry and guides.
Drawing options holds Focus/Simple/Full, automatic Ink & Paint, QuickShape and finger drawing.
Profiles also capture the existing QuickMenu slots/edge/button and playback-range gesture. These
are device setups, not student accounts or feature permissions. Shortcuts/QuickMenu remain
available. Brush cannot be hidden; a hidden active tool remains visible until switched away,
including Focus. Guide-edit completion controls are retained. Show all tools and controls resets
visibility as a draft. App settings itself remains reachable. No brushes/colours/device limits,
document modes, project pixels, schema or exports are included in a profile.

`core/studentprefs.ts` owns validated catalogs/setup/profile data. App loads student visibility,
finger preference and existing interface level; Bubbles shares that interface state via an App
callback and filters floating painting tools/options. Main filters classic Full toolbar controls
from the same state and synchronizes the finger menu checkbox. Active-tool recovery applies to
the painting toolbar at all levels. Settings only invokes changed setters, so QuickMenu-only edits
do not refit the canvas. Opening refuses active strokes/transforms/adjustments and pauses playback.
QuickMenu Customize focuses its section; normal App settings opens at Student profiles.

New device keys: `2dope.student.ui`, `2dope.student.profiles` (version 1),
`2dope.student.fingerPaint`. Existing QuickMenu/range/QuickShape/Ink & Paint/interface keys remain
live preference sources. Profile snapshots are outside Project/History and all portable artwork.
No-op Apply does not add drawing history; profile tests verified zero document notifications.

Changed this step: new `core/studentprefs.ts` and unit tests, student profile browser fixture,
responsive wrapper and HTML pages; updated App, Bubbles, App settings, QuickMenu, main/index,
CSS, manual/UPDATES, architecture/format/roadmap/test docs. Existing QuickMenu/range fixtures now
isolate the added preference keys. All earlier user/Claude work preserved. No commit/push/deploy.

Fresh verification: **57 files / 470 unit tests passed**, strict TypeScript/production build and
diff check passed; existing large-bundle warning remains. Real-App student profile checks **28/0
each** at 390×844, 1024×768 and 768×390 = **84 assertions**: create/rename/delete staging,
Apply/Cancel, switching/update, independent snapshots, Draw/Animate/Focus visibility, active-tool
recovery, options/QuickMenu, device persistence, fixed actions, names, storage failure, show-all
and unchanged document/portable capture. Existing QuickMenu **34/0**, integrated painting workflow
**20/0** at 898×910, and range/gesture workflow **50/0** at 1024×768: **188 browser assertions
passed this step**. Physical iPad/Pencil/gesture arbitration remains unverified.

Native built review on isolated `127.0.0.1:5205`: created Background painting with Vector/Smudge
and Line/Fill controls hidden, saved/applied, reloaded and verified the selected profile. Updated
its interface to Full and confirmed painting controls retained those visibility choices; reload
retained Full, the profile name and checkboxes. The classic top bar remains hidden by the existing
painting workspace layout, so the visible Full-level review used its floating painting controls.
Screenshot: `../artifacts/student-profiles-native.png`. The test profile remains only on the
isolated review origin. Tests used separate origins without clearing user project storage.

**Next:** user direction for further profile options or repeat-cycle authoring. Physical device
review remains pending; old deferred Clips/view failures stay deferred.

### Previous step: optional playback-range gesture

**Optional playback-range gesture, uncommitted after 086c7da.**
The user requested a gesture option. Menu → App settings → Gestures now offers **Hold ruler to
set playback range**, default off. Apply settings saves the boolean device preference
`2dope.playback.rangeGesture`; Cancel discards the draft. QuickMenu preferences remain separate,
and Restore QuickMenu defaults does not reset gestures. Range dialogs include a short settings hint.

In Flipbook or Clips/Timing, hold still on the frame-number ruler for the existing 450ms hold
threshold, then drag in either direction and lift. A dashed ruler band and a Loop start–end hint
preview inclusive bounds; a stationary hold selects one frame. Pointer-up calls the existing
App range command once, with normal Undo/autosave. The preview does not mutate the document.
Quick ruler drags retain scrubbing and native pinch bookkeeping stays active. Drawing/row gestures
are not reassigned. Whole animation remains in Range; the gesture does not change export scope.

`ui/playbackrangegesture.ts` shares the input lifecycle across FlipMode and Strip, with callbacks
to end their native scrub state after activation (without snapping scrub-lock home). It rejects
stale project/comp/layer/workspace/length/zoom or changed range owners. Escape, extra fingers,
pointer cancel/lost capture, blur/hidden, resize and disabling the preference cancel the preview.
Pointer cleanup handles releases outside the ruler. Ruler-only touch-action/user-select/callout
rules support touch holds while retaining other row interactions. Saved range ruler bands exclude
the transient preview so frame notifications cannot remove it.

Changed this step: new `ui/playbackrangegesture.ts`; updated core playback preference/test,
App, App settings, range dialog/band selector, FlipMode/Strip integration, CSS, playback-range
browser fixture, manual/UPDATES, architecture/format/roadmap/test docs. Earlier dirty work preserved.
No dependency/project schema change, commit, push, deploy or recording feature.

Fresh verification: **56 files / 464 unit tests passed**, strict TypeScript/production build and
diff check passed (existing bundle-size warning). Expanded real-App range/gesture browser fixture
**50/0 each** at actual 390×844, 1024×768 and 768×390 iframe viewports = **150 assertions**.
Existing QuickMenu/App settings fixture **34/0** at 898×910: **184 browser assertions passed**.
These cover device-only Apply/Cancel, ordinary scrub, hold preview/commit/Undo/Redo, reverse and
single-frame ranges, interruption paths, Clips layer offsets and project replacement, alongside
the prior range/audio/archive checks. An initial run while editing had four first-hold assertions
fail; fresh final-handler runs passed at all three sizes. Desktop scripted touch PointerEvents
do not establish physical Pencil/iPad Safari hold, pinch or callout behavior.

Native built app on isolated `127.0.0.1:5205`: enabled the checkbox through Menu → App settings,
applied, reloaded and reopened settings; it remained enabled. Screenshot:
`../artifacts/playback-range-gesture-settings.png`. Native physical hold-and-drag was not tested.
Only separate test/review origins were used; existing user project origins were untouched.

**Next:** physical touch/Pencil review of hold-versus-scrub/pinch; repeat-cycle authoring remains
a separate proposed feature requiring user direction. Prior deferred fixtures remain deferred.

### Previous step: playback range

**Playback range, uncommitted after 086c7da.**
The user approved playback range. Built Range controls in Draw/Animate Flipbook, Clips/Timing
and Motion using a shared `ui/playbackrange.ts` native dialog. Start/End are inclusive UI frame
numbers; Use current sets either edge. Apply validates whole frames and commits one History
command/document notification; Cancel/Escape discards the draft; Whole animation clears it.
Unchanged Apply is a no-op. Opening pauses playback and restores focus on close. Stale dialogs
close on project/comp/workspace/length changes. Controls have 44px targets and match existing UI.

`Comp.playbackRange` is optional zero-based `[start,end)` metadata. `core/playback.ts` clamps
preview bounds against current comp length without overwriting saved edges, so restoring a
shortened duration restores the range. App Play from outside begins at the range start; Play
inside resumes there. Paused scrubbing remains unrestricted. One-frame ranges work. The shared
clock, seek/fps clock rebasing and residency look-ahead use the same bounds. Flipbook and Clips
rulers outline the interval (Clips accounts for the active layer start). Sources and shots keep
independent ranges; nested placements, content duration and exports retain normal timing.

The audio queue includes both edges in its restart key and uses a nonzero loop origin in
`mixSound`, so queued chunks crossing an edge sample the selected section. Scrub audition and
exports retain their existing full-comp/default sampling. `io/schema.ts` validates and copies
the additive optional comp field under schema 3; autosave, portable files and My Assets captures
preserve it. Range Undo resolves the comp by id rather than retaining a potentially stale object.

Changed this step: new `core/playback.ts`, unit tests, shared range UI and four browser fixture
files; updated App, audio/mixer, comp/schema, FlipMode/Strip/Motion, CSS, manual/UPDATES,
architecture/format/roadmap/test docs. All earlier user/Claude changes preserved. No commit/push.

Fresh verification: **56 files / 463 unit tests passed**, strict TypeScript/production build
passed (existing chunk-size warning), and diff check passed. New browser fixture **31/0 each**
at actual iframe viewports 390×844, 1024×768 and 768×390 = **93 passing assertions**, including
clock/seek/fps/single-frame edges, validation/cancellation/focus/layout, Undo/Redo/no-op,
shortened duration, source independence, ruler origins, autosave/portable import, replacement
comp objects and stale dialogs. A deterministic AudioContext substitute exercises real queued
mix samples/stop behavior without playing sound. Existing integrated painting workflow **20/0**
at 898×910: **113 browser assertions passed this step**. No audible-output or physical Pencil/
iPad Safari claim. User-deferred Clips/view fixture failures remain recorded below.

Native production review on isolated `127.0.0.1:5205`: created a named 720p/24-frame review shot,
set frames 5–12 with Enter, played/paused inside the interval, reloaded and verified the saved
range, cancelled a changed draft with Escape, and switched to Clips with the same range. Screenshot:
`../artifacts/playback-range-native.png`. Normal user origins were untouched. Browser connection
to the sandbox server was blocked; an approved external local review server resolved it. Only
test-created browser tabs were used. The review shot remains on the isolated production origin.

**Next:** repeat-cycle authoring is a separate proposed next feature, requiring user approval.
Physical Pencil/iPad review of the existing drawing/Ink & Paint workflows remains outstanding;
do not expand auto-fill gaps/references/page limits or resume deferred fixtures implicitly.

### Previous step: first Ink & Paint / Auto Paint workflow

**First Ink & Paint / Auto Paint workflow, uncommitted after 086c7da.**
The user said Go after My Assets and customizable QuickMenu. Built optional Ink & Paint in
Draw/Animate Options, also assignable to QuickMenu. Switching it on selects Line with Brush or
Vector; Ink has its own editable colour and the main Colour supplies solid automatic paint.
It starts off. On/off and ink colour use device-only `2dope.inkpaint`; ordinary project/asset
Line, Fill and editable vectors remain unchanged, with no new schema/dependency.

`fill/autopaint.ts` uses the difference between before/after border-connected empty pixels:
newly enclosed regions only, threshold 24, no gap closing, no selection/page edge as a wall and
two pixels of growth only beneath actual ink. It is tested against a separate pixel-flood oracle
over 150 randomized small maps. `App.inkAlpha` reconstructs before-ink from the existing raster
commit patch and old vector list after pen-up. No page scan delays pen-down/live ink. Automatic
paint filters selections, fully hidden layer-mask pixels and any existing nonzero Fill alpha,
preserving opaque/translucent paint exactly. It uses only the current drawing, not other layers.

`recordInk` prepares the paint patch before History/autosave notification, with one command for
closing ink plus Fill. Redo restores captured pixels rather than re-detecting under new settings.
QuickShape replacement undoes/replaces the associated paint through the same path. Layer masks
use the existing queued input/Residency decode path before pixels are read. Eraser, Smudge,
direct Fill painting, mask editing and Alpha Lock do not trigger automatic colour. Cancelled/
blurred/hidden/interrupted pen input keeps the existing ink policy while suppressing Auto Paint.

Work is bounded to **921,600 page pixels in Lite** and **4,194,304 in Full**. Oversize enable is
refused; an already enabled preference on an oversize page retains ink and reports skipped paint.
The feature remains opt-in. No workers, automatic gaps, gradients, all-layer references or new
track types were added. Standalone autosave/archives/My Assets keep the resulting editable data.

Changed this step: new `fill/autopaint.ts`, its unit tests, `ui/inkpaint.browser.ts`, responsive
wrapper and two HTML fixtures; updated `app.ts`, Bubbles, QuickMenu action catalog/UI, main target
label, CSS, manual/UPDATES, architecture/format/roadmap/test docs. QuickMenu and integrated painting
fixtures now isolate the Ink & Paint preference; QuickMenu verifies the new assignable toggle.
Earlier user/Claude changes are preserved. No commit/push/deploy or recording feature.

Fresh checks: **55 files / 457 unit tests passed**, strict TypeScript/production build and diff
check passed; existing large-chunk warning remains. The full unit run measured topology at 62 ms
for 1280×720, 131 ms for 1920×1080 and 106 ms for 2048×2048 on this desktop (JIT/load varies).
The direct real-App browser workflow passed 25 initial assertions, including a Full HD committed
stroke plus paint in 118 ms. Final responsive/residency checks passed **81 assertions**: 27 each
at real iframe viewports 390×844, 1024×768 and 768×390. These add decoded parked-mask input and
parked drawing Undo/Redo, with all colour/selection/mask/cancel/QuickShape/archive checks intact.
The phone/tablet runs measured total Full HD committed stroke plus paint at 110 ms. The separate
QuickMenu regression passed **34/0**, including the assignable Ink & Paint toggle; the existing
integrated Draw → Assets → Animate painting workflow passed **20/0**, for **135 browser assertions
passed this step** (81 + 34 + 20). Browser test
callbacks use real App input, PNG/compositor/history and in-memory FileUI/autosave, without opening
the user's project library. Test preferences are restored. Background browser timer throttling
slowed the inactive landscape fixture; bringing its page forward completed it. A few browser
state reads timed out then recovered; no failed check is being counted as passed.
These desktop timings do not establish physical iPad/Pencil/Safari performance or memory readiness.

Native built app, isolated 127.0.0.1:5201: created Ink Paint review, chose red Paint and separate
dark Ink, then drew three brush edges. The open outline stayed empty; closing it filled the
region. Ctrl-Z removed the closing line and its paint; Ctrl-Shift-Z restored both. Done, normal
autosave/reload, Assets → Edit reopened the same painted source, with mode/colour preferences
retained. Screenshot: `../artifacts/ink-paint-native.png`. A preliminary vector mouse-drag review
entered the existing hold/point-edit workflow, so the final native closure used Pixel Ink Brush;
vector/QuickShape behavior is covered by the real-App scripted fixture. User origins 5197/5200
were untouched. Native test source remains only on the isolated review origin.

**Next:** review the bounded automatic-paint workflow with real student drawings and physical
Pencil input before expanding gap closing, references or page sizes. Those expansions are later
decisions. The earlier user-deferred Clips/view fixture failures remain recorded below.

### Previous step: customizable QuickMenu and App settings

**Customizable QuickMenu and App settings, uncommitted after 086c7da.**
The user requested QuickMenu customization in app settings. Built the six-action ring for Draw
and Animate with an explicit edge button and Q, plus Menu → App settings → QuickMenu. Settings
choose six actions (clockwise from top), a left/right button edge and show/hide. Apply saves
`2dope.quickmenu` localStorage; Cancel discards the draft, and Restore defaults waits for Apply.
These preferences are device-only, independent of project/schema/History. Empty/repeated actions
are allowed, unknown stored actions repair per slot, and bad JSON falls back to defaults. Q keeps
the menu available when the button is hidden; all-empty rings focus Customize for recovery.

QuickMenu routes to the existing App tools, Undo/Redo, full-hold frame creation, duplicate/frame
navigation, view and playback, and existing Colour/Brushes/Layers/My Assets panels. Playback keeps
Pause accessible while edits/navigation disable. A backdrop consumes outside taps, focus returns
to canvas, Q/Escape/arrows/Tab work without leaking keys, and menus close on frame/layer/comp/
project/workspace changes, stroke input, blur, hidden page or resize. It avoids live strokes and
locked-layer New frame. The opener measures clear space around existing painting controls without
moving/refitting the canvas. Existing popovers dismiss before opening. This is separate from the
older Quick Animate view (`ui/quick.ts`); finger canvas holds retain their existing behavior.

Changed this step: new `core/quickmenu.ts`, `core/quickmenu.test.ts`, `ui/quickmenu.ts`,
`ui/settings.ts`, `ui/quickmenu.browser.ts`, `ui/quickmenu-responsive.browser.ts`,
`tests/quickmenu.html` and responsive wrapper; updated `main.ts`, `index.html`, CSS,
manual/UPDATES, architecture/roadmap/test docs and this handoff. All preceding uncommitted work
is preserved. No dependency, .2dope schema or persistence/export change; no commit/push/deploy.

Fresh checks: **54 files / 448 unit tests passed**, strict TypeScript/production build and diff
check passed. Existing large-chunk warning remains. **99 browser assertions passed**: 33 each at
real iframe viewports 390×844, 1024×768 and 768×390 on isolated localhost:5202. The actual App/
painting/Flipbook/Sidebar/Bubbles/Colour fixture covers settings drafts, persistence serialization,
ring/edge targets, keys/focus/outside taps, view/history preservation, real Line pixels and Undo/
Redo, full-hold New frame, popover handoff, callback routing, plane/tool compatibility, locked-layer
guards, stroke refusal, shared playback/Pause, Draw/Animate and stale-menu cancellation, hidden/
empty recovery and defaults. It opens no project library/autosave and restores its preferences.

Native built-app review on isolated 127.0.0.1:5201: Menu → App settings opened the six selectors.
Changed Action 3 to Colour, Action 6 to My Assets and edge to Left; Apply then reload retained
these choices. Native Q opened the saved ring, Colour opened the real picker, Q replaced the
picker with QuickMenu, and My Assets opened the existing device collection. No document edits
were needed. Evidence: `../artifacts/quickmenu-settings.png` (all six settings) and
`../artifacts/quickmenu-customized.png` (the saved ring). Test/native tabs were closed after checks;
user origins 5197/5200 were untouched. Physical iPad/Pencil/Safari and arbitrary crowded layouts
remain unverified. The earlier user-deferred Clips/view fixture failures are still recorded below.

**Immediate next feature: Ink & Paint / Auto Paint**, per `docs/next-phase.md`: detect only newly
enclosed regions after committed ink, preserve existing paint, honor selections/masks/residency,
and combine closing line plus automatic fill into one Undo. Test large-page/Lite cost before
enabling broadly. Recording is excluded. QuickMenu customization and My Assets are now built.

### Previous step: My Assets library management

**My Assets library management, uncommitted after 086c7da.**
The user confirmed this order: **My Assets → QuickMenu → Ink & Paint**, with recording still
excluded. Finished the library management pass before moving on to QuickMenu. Name search works
on card metadata, supports multiple case-insensitive words, displays counts/no-match recovery and
keeps Clear/search at 44px. Manage folds Rename and Remove under each saved card. Renaming changes
only the saved card; `libraryArtwork` supplies the new project/root name to future copies,
opened projects and portable downloads. Existing project artwork and frozen stored bytes remain
independent. Removal atomically reads/deletes both records; one full entry stays in memory for
Undo last removal until another successful removal or page reload. Closing/reopening the shelf
keeps Undo. A failed restore keeps its bytes for retry. Library edits do not enter project History.
IndexedDB version and project schema are unchanged. No commit/push.

Changed this step: `io/artworkstore.ts`, `io/artwork.ts`, their existing artwork unit test,
`ui/artworklibrary.ts`, its browser fixture, CSS, manual/UPDATES and architecture/format/roadmap/
test docs. Previous uncommitted work is preserved. Fresh unit checks: **53 files / 445 tests**
passed; strict TypeScript/production build and diff check passed (existing chunk-size warning).
**102 browser assertions passed:** 34 each at real iframe viewports 390×844, 1024×768 and 768×390
on isolated localhost:5202. These include the previous complete storage/reuse/autosave suite plus
search without package reads, no-match/Clear/focus, cancel/rename/fresh-connection/portable names,
44px Manage actions after scrolling, failed removal, failed restore/retry, Undo after shelf
closure, independent copy names and stale rename-dialog rejection. The fixture deletes only its
disposable artwork DB and restores preferences. Physical iPad/Pencil/Safari remain unverified.

Native built-app review on isolated 127.0.0.1:5201: searched Flipbook review (1 of 2), expanded
Manage, renamed to Flipbook library review, removed it, saw the fixed removal Undo, restored it,
and renamed it back. The project kept its independent Flipbook review source. Screenshot:
`../artifacts/my-assets-management.png`. User origins 5197/5200 were untouched. Fresh test/native
tabs were closed after checking; no viewport emulation or storage-clearing shortcut was used.

**Immediate next feature: QuickMenu, then Ink & Paint / Auto Paint.** Use a small explicit
on-canvas opener plus keyboard access; the proposed six actions/configuration are recorded in
`docs/next-phase.md`. Preserve Draw/Animate's shared state and canvas view. Quick Animate in
`ui/quick.ts` is an existing simplified workspace and is separate from the requested QuickMenu.
Auto Paint remains unimplemented: detect only newly enclosed areas after committed ink, preserve
existing paint and combine line plus fill into one Undo. No motion/performance recording.
The earlier short-screen Clips/view investigation remains deferred by the user.

### Previous step: first cross-project My Assets library

**First cross-project My Assets library, uncommitted after 086c7da.**
The user approved Assets and Ink & Paint, explicitly excluded motion/performance recording, and
deferred the older short-screen Clips/view fixture investigation. Built My Assets first; Auto
Paint remains the next approved feature direction, not an implemented feature of this step.

Assets → Save stores an independent source snapshot in My Assets, available in other projects
on this browser/device. The library has previews, Add copy, Open as project, Download and Import
artwork file. Sources keep editable layers, frames/holds, Line/Fill, vectors, masks, internal
comp sharing, parents/pins/overrides and audio links. The current project's sources/placements
still use their existing live links. Library snapshots do not update when a project is edited.

`io/artwork.ts` captures only the reachable graph into an ordinary complete schema-3 `.2dope`
archive; missing images/sounds fail the save. `io/artworkstore.ts` atomically writes card/package
records in separate `2dope-artwork` IndexedDB v1 storage, independent of project asset GC.
`view/artworkpreview.ts` decodes first-frame drawings for the stored preview, then releases them.
`ArtworkAssets.addPackage` adopts compatible-size sources with fresh IDs and complete byte data
through one project History command. Incoming image refs intentionally have null stored keys
until autosave writes them; otherwise a preview decode can incorrectly mark foreign keys saved.
Sounds get fresh pool IDs and source fps is retained. Undo removes the copied comp graph; Redo
keeps its pool drawings available. No project schema bump, external path or dependency added.

**First-version limits:** Add copy requires matching drawing canvas dimensions. Open as project
uses FileUI import and normal autosave to preserve native size, flushing the previous project.
An asset-marked main comp is an editable project rather than a pending source session, and
Assets → Save current artwork can save another snapshot. No resizing/cropping, live links across
projects, library search/folders/deletion, or automatic updating/replacing of saved snapshots.
Download provides a portable backup/share file; storage stays local to this browser origin.

Changed this step: new `io/artwork.ts`, `io/artwork.test.ts`, `io/artworkstore.ts`,
`view/artworkpreview.ts`, `ui/artworklibrary.ts`, `ui/artworklibrary.browser.ts`,
`ui/artworklibrary-responsive.browser.ts`, `tests/artworklibrary.html` and responsive wrapper;
updated `core/assets.ts`, its tests, `core/assetcopy.ts`, `ui/artworkassets.ts`, `main.ts`, CSS,
manual/UPDATES, format/architecture/roadmap/test docs and this handoff. Earlier uncommitted
source-position/QuickShape/Flipbook work below is preserved.

Checks this turn: **53 files / 443 unit tests passed**, strict TypeScript/production build and
diff check. The existing large-chunk warning remains. Eight new unit cases cover complete source
graphs, hidden exposures/masks/audio, capture-time metadata, missing/corrupt packages, immutable
store copies, import ID collisions/internal references/Undo, incompatible sizes/busy guards and
standalone artwork mains. **86 browser assertions passed**: 22 My Assets checks each at real
iframe viewports 390×844, 1024×768 and 768×390 (66), plus the existing 20 integrated painting
checks at 1467×633. The My Assets fixture uses actual FileUI/autosave with an in-memory project
store and a uniquely named disposable IndexedDB artwork database. It clears only its own project
image pool before import to catch foreign-key/autosave errors, checks PNG/frame pixels and normal
archive capture, original-project deletion, native-size opening, quota failure, portable import,
stale async reads and Save re-enabling after Add copy. Short screens scroll the shelf body while
navigation stays reachable. Fixtures restore preferences and delete only their own artwork DB.

Native Brave 127.0.0.1:5201: saved Workflow landscape (1280×720, 2 layers) and Flipbook review
(3 layers, 14 frames) to My Assets. Fresh app loading showed both saved snapshots and previews.
Open Workflow landscape as project created a separate normal autosaved artwork project with its
two layers; Assets exposed Save current artwork. Add copy of Flipbook review imported its three
layers/14 frames with Edit focused. Native Escape/Ctrl-Z removed it (Assets 0); Ctrl-Shift-Z
restored it (Assets 1). Screenshot: `../artifacts/my-assets-library.png`.

Browser emulation and download-event APIs stalled/reset the browser tool; fresh tabs and separate
iframe wrappers completed the responsive checks instead. The native download's emitted file was
not retrieved/verified; package serialization/readback and shared-file import were verified by
unit/browser fixtures. Older stalled agent tabs from this and the preceding review could not be
reclaimed through the tool; cleanup of those tabs/old viewport overrides remains unconfirmed.
Final phone/tablet/landscape, painting-regression and native walkthrough tabs were closed; the
remaining stale ids observed were 377726962, 377726959, 377726956, 377726952 and 377726949.
User origins 5197/5200 and their project storage were not touched. Physical iPad/Pencil/Safari,
large-library quota/performance and live cross-project sharing are not verified. No commit/push.

**Next after QuickMenu:** Ink & Paint / Auto Paint, following the requirements in
`docs/next-phase.md`: detect only newly enclosed areas after committed ink, preserve existing
paint, and combine line plus automatic paint into one Undo. Recording is excluded. The user
deferred the older Clips/view fixture failures; keep their record below without blocking feature
planning or silently claiming they passed.

### Earlier multi-frame Flipbook review

**Latest step: multi-frame artwork source / Flipbook review, uncommitted after 086c7da.**
Reviewed a three-drawing source, held frames, playback, source Done/re-entry and multiple tracks
on phone/tablet/short screens. `FlipMode` now keeps Play/Pause outside scrolling actions, uses
44px button targets, caps the track list at one row on short screens, and reveals the selected
track on selection or panel resize. A row ResizeObserver updates `--flip-h` and uses existing
refit behavior. Deferred build measurements ignore hidden rows rather than publishing 16px.
On short screens at least 420px wide, the expanded compact Brush recovery button stays beside
the Tools/Options recovery column; native testing found that it could cover Tools before this.
Manual folds and panned/zoomed views retain their existing behavior.

Duration handles now expose actual frame counts and own arrow/Shift/Home/Enter/Escape keys.
Arrows adjust one frame, Shift ten, Home one; Enter/Escape returns to canvas. Tap/drag focuses
the handle and rebuilds restore that focus. Keyboard changes preview then commit through the
same exposure History as pointer trimming. New holds cap at one million frames; previously
longer holds can be shortened and Undo still restores them. No schema/dependency changes.
Shared source playback, comp frame rates, linked rendering and source/shot return were retained.

Changed this step: `ui/flipmode.ts`, CSS, manual/UPDATES, architecture/roadmap/test docs and this
handoff; new `tests/flipbooksource.html` and `ui/flipbooksource.browser.ts`.
Prior source-position/QuickShape fixes and integrated painting fixture remain uncommitted below.

Checks this turn: **52 files / 435 unit tests passed**, strict TypeScript/production build and
diff check. Existing large-chunk warning remains. **78 new browser assertions passed** at isolated
origin 5202: 26 each at 354×767, 931×698 and 698×354 CSS. The actual App/Assets/Flipbook/Sidebar/
Bubbles/Strip fixture paints red/green/blue frames, changes holds, checks focus/Undo/Redo, keeps
Play hit-testable while actions scroll, observes source playback looping, returns to Animate
frame 7 while playing, resumes the stopped source frame, checks five-track selection/resize,
recovery-button hit testing, measured fitting and linked pixels with source fps 6 / shot fps 24.
The existing integrated painting workflow also passed its 20 phone assertions this turn.
Fixtures open no project library/autosave and restore their view/brush/colour preferences.

Additional check with unresolved failures: the existing `tests/paintinglayout.html` at 698×354
reported 14 passed / 2 failed (full Tracks canvas floor and Editor recovery budget) before its
Flipbook section. A temporary two-RAF settle experiment reported 13 / 3, additionally failing
Draw fold/view recovery; starting preferences may be involved, but that is not established.
An attempted clean-preference rerun could not be read after browser automation timed out.
Temporary edits to that fixture were reverted. Do not count this fixture as passed or assume
all short-screen Clips/view-preservation behavior is verified. Main Flipbook fixture's 78
assertions and native checks above completed before this interruption.

Production Brave 5201: native duration tap + Right + Shift/Right changed 1 → 2 → 12 with focus;
Escape focused canvas, Ctrl/Z restored 2 and Ctrl/Shift/Z restored 12. Painted three source
drawings, played the source, and Done stopped playback and restored the shot with canvas focus.
Created three source tracks; selecting Paint layer brought its row into the compact strip.
Tools/Options/Brush recovery toggles worked through native clicks after the overlap fix.
Evidence: `../artifacts/flipbook-source-phone.png` (phone with tools open) and
`../artifacts/flipbook-source-short-screen.png` (short screen with controls folded).
Short landscape still has little physical canvas height; use folds/Canvas view for painting.
Physical iPad/Pencil/Safari feel and long-project performance remain unverified.
Final browser cleanup was attempted, but automation timed out twice (including inventory after
the tool kernel reset), so viewport reset/tab closure could not be confirmed. Last known agent
tabs were production 5201 (`377726949`) and fixture 5202 (`377726952`) in Brave browser 3. User
origins 5197/5200 and their project storage were not touched.
No commit/push/deploy this step.

**Immediate next task (proposed; await user authorization):** reproduce the short-screen Clips
canvas-budget and Draw fold/view fixture failures on a responsive browser, with clean isolated
preferences; verify/finish browser cleanup. Then review save/reopen with animated sources and
multiple linked placements, including Undo followed by save. Full rail rewrite,
advanced docking, cross-project sharing and Auto Paint remain separate.

### Earlier integrated painting review

**Latest step: integrated painting/source-return review, uncommitted after checkpoint 086c7da.**
Reviewed New asset → Layers/Background → Colour/Brushes/size/opacity → paint → Done → Assets/Place
→ Animate/Edit source. Re-entry reset to the first paint layer rather than the background being
edited. `ArtworkAssets` now remembers the outgoing source's layer/frame on Done or direct source
switches, in session-only WeakMap state keyed by Project. Re-entry validates the remembered layer;
missing layers fall back to the first drawing/frame zero, and existing comp-clock bounds clamp a
shortened source. Source settings, shot/layer/frame/workspace return and document History remain
shared and unchanged. Editing positions are deliberately not persisted or added to the schema.

Native painting also exposed Edit shape remaining available after source Done while the last
history command still belonged to that source. `App.shapeEditable` now requires the current
editing drawing and plane, including mask drawing/Line when editing a mask. This hides the stale
control and rejects a stale `swapShape` action without touching the old source. Returning to the
same unchanged drawing/plane can resume its shape. No dependencies or stroke algorithms changed.

Changed this step: `core/assets.ts`, `core/assets.test.ts`, `app.ts`, manual/UPDATES,
architecture/roadmap/test docs and this handoff; new `tests/paintingworkflow.html` and
`ui/paintingworkflow.browser.ts`.

Checks this turn: **52 files / 435 unit tests passed**, strict TypeScript/production build and
diff check. Four new unit cases cover layer/frame/shot return with no history, direct source
switches, removed-layer/shortened-clock fallback and isolation between projects with reused ids.
Existing large-chunk warning remains. **90 browser assertions passed** at isolated origin 5202:
20 integrated checks each at 354×767, 931×698 and 698×354 CSS (60), plus the existing 30 navigation
checks at phone size. The new fixture combines actual Assets, Layers, Colour, Brushes, Sidebar,
Bubbles, Strip/Tracks and canvas: real opacity/Fill pixels and Undo/Redo, held QuickShape ownership,
rejected stale actions, restored background/frame 9, linked placement counts, shared repainting
through the shot compositor, Clips rails and shelf return without extra document history.
No project library/autosave is opened; brush store reads and view/brush/colour preferences use the
same isolated fixture conventions and preferences are restored. Native input remains separate.

Production Brave 5201: created Workflow landscape via the shelf, added a still Background, filled
it blue, painted a peak, returned and placed it in Animate. Before the fix, Edit source selected
the empty Paint layer; source Done also left Edit shape available from the previous drawing.
After rebuilding, native Background selection → Space on source Done → shelf Edit with Enter
restored Background, still painting Line, with Updates 1 placement. Phone/tablet evidence:
`../artifacts/source-resume-phone.png` and `../artifacts/source-resume-tablet.png`. Native Done
returned canvas focus; viewport override reset and active test tab closed. Physical iPad/Pencil/
Safari feel and long-project performance remain unverified. No commit/push/deploy this step.

**Immediate next task (proposed; await user authorization):** review source entry/return in
Flipbook, including short screens and playback, with a multi-frame artwork asset. Full rail
rewrite, advanced docking, cross-project sharing and Auto Paint remain separate.

### Earlier release checkpoint

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
