# Claude handoff: editable vector brushes for 2Dope

## Assignment

Implement the first usable vector-brush milestone described below. The goal is natural freehand drawing with editable lines and custom brush styles, informed by CLIP STUDIO PAINT's capabilities. Build an original 2Dope implementation using the existing project and animation system.

This is an implementation assignment when the user gives it to you. The earlier research and roadmap alone did not authorize application changes. Complete the milestone, including validation and documentation; do not stop after an architecture proposal or the initial prototype. Committing, pushing, merging and deploying are outside this assignment.

## Read first

Work in `E:\2026\Dev\Apps\2Dope\beta`, the application repository. The parent directory is not a repository. `../reference/` projects are separate references, not app dependencies.

Read these before editing:

1. `AGENTS.md`, the latest current-state section of `HANDOFF.md`, and `ARCHITECTURE.md`.
2. `docs/research/clip-studio-paint/VECTOR-BRUSH-REA-2026-10-30.md`.
3. `docs/research/clip-studio-paint/VECTOR-BRUSH-IMPLEMENTATION-PLAN.md`.
4. `docs/project-format.md` and `docs/export-format.md` before changing persistence or rendering output.

Check current Git status and owning source. Preserve all pre-existing changes, including research files and pen/tablet work. Historical handoff test results are not your validation. Avoid switching a shared checkout underneath concurrent work or including unrelated changes in your delivery.

## Evidence boundary

REA verified shipped tool and brush-preset databases and decompiled three vector functions in `iswCoreTG.dll`. That DLL identifies itself as a legacy IllustStudio component and has an observed XPG file-plugin dependency. Its use by CSP 5.0.4's live brush renderer was not established. The modern executable's Ghidra analysis did not complete, including a 30-minute reduced-profile attempt.

Use the research to understand capabilities and engineering constraints. Do not describe the legacy functions as the recovered modern CSP engine, claim pixel-identical behavior, or copy extracted brush artwork into the app. Exact modern internals and measured physical pen feel remain open questions.

Do not rerun the lengthy native analysis as a prerequisite to implementing this milestone. The saved evidence is sufficient for the proposed original design.

## Milestone to complete

Deliver usable custom vector brushes inside 2Dope with these capabilities:

- A clean expressive ink renderer.
- An oriented flat/chisel-tip renderer.
- Deterministic material-tip strokes suitable for original dry ink, pencil/chalk texture and dotted/decorative marks.
- Importing or choosing a custom tip image, saving the vector brush in the existing library, and using it for new strokes.
- Explicitly applying a brush appearance to selected vector lines without redrawing them.
- Editing the resulting lines while preserving their supported stroke attributes through save/reopen, undo/redo, clipping and cuts.
- Consistent rendering in drawing, playback, thumbnails, masks and export.

Start with a small isolated specimen: the same editable path displayed as clean ink, chisel, an original dry tip and a dotted/pattern mark. Moving a point and swapping styles must work. Use this to settle renderer/channel decisions, then continue into the production milestone in the same assignment. Keep a browser fixture or small test page as a reviewable demonstration.

True deforming ribbon brushes, pinch/redraw/simplify tools, advanced multi-style joins and a dedicated vector-layer creation policy are later milestones. A repeated stamp pattern must not be advertised as a deforming ribbon. Do not expand this assignment into a replacement animation/layer architecture.

## Recheck the existing foundation

Navigate by functions, because line numbers have moved during concurrent work:

| Source | Relevant behavior |
|---|---|
| `src/core/stroke.ts` | `StrokePoint` and `StrokeRecord`: sampled geometry, pressure, tilt, time, local `w`, brush snapshot and seed |
| `src/brush/vector.ts` | `vectorWidths`, `drawVectorStroke`: existing solid outline renderer and legacy appearance |
| `src/app.ts` | `beginStroke` strips custom tip/grain images for vector pen records; point/handle state also lives in temporary App maps |
| `src/core/vecedit.ts` | `anchorsOf`, `joinStrokes`; approximate anchor extraction and existing endpoint joining |
| `src/core/vectorcut.ts` | `at`, `touchedAt`, `eraseVectors`; cut endpoint interpolation currently omits `w`, and sparse segments can miss eraser hits |
| `src/core/vectorclip.ts` | Selection clipping and selection-restricted vector erasure |
| `src/core/selxform.ts` | Vector transformation and existing scalar brush-size scaling |
| `src/brush/smoothing.ts` | Existing live correction, endpoint catch-up and post-correction |
| `src/core/pen.ts`, `src/ui/pensettings.ts` | Existing device calibration and tablet controls; preserve the latest implementation |
| `src/ui/panel.ts`, `src/ui/brushlib.ts`, `src/io/brushstore.ts` | Existing brush editing and library flows |
| `src/core/project.ts`, `src/view/composite.ts`, `src/io/exportseq.ts` | Shared rendering and output consumers |
| `src/io/schema.ts`, `src/io/projectio.ts` | Validated native persistence and project adoption |

Confirm these findings against current source before changing them. Preserve recent Ctrl/Cmd+A, Delete, canvas zoom and tablet-button fixes described in the latest handoff.

## Implementation requirements

### Preserve existing artwork

Give the existing vector renderer an explicit legacy route. Records without a new renderer version must continue to use its existing appearance, including thinning, taper and width-floor behavior. Capture meaningful reference images before changing dispatch; do not silently improve old strokes into a different appearance.

Separate editable geometry, recorded attribute channels and immutable brush appearance. Persist authored anchors/handles/corner modes for new editable paths; do not rely on App-only maps to reconstruct the user's exact editing state after reload. Retain sampled legacy geometry without automatically refitting it.

Snapshot a versioned brush definition into a stroke, or reference an immutable definition packaged with the project. Changing or deleting a library brush must not alter saved artwork. Decide the required format/schema migration from current source before writing new records. Validate new fields, assets and versions; never silently read an unsupported renderer as a plain outline.

### Make custom styles visibly different

Support actual tip aspect/angle for chisel marks and actual material/texture behavior for dry or pencil styles. Renamed round outlines do not satisfy the milestone.

Use original or user-owned tips. Show only controls that the active renderer supports. Reuse the existing Brush Studio/library and native DOM design; avoid a second disconnected brush-management system.

Keep per-dab flow/density, local attributes and whole-stroke opacity distinct. Composite a stroke at its opacity once, with bounded buffers, so stamp overlap does not accidentally increase whole-stroke opacity. Test self-crossings and overlap at 25% and 50% opacity.

### Preserve attributes during edits

Complete channel-preserving cuts before production material brushes are enabled: selection clipping already runs during stroke creation. Preserve local width at interpolated endpoints, along with every other supported channel. Keep the material domain, seed identity and repeat phase coherent on surviving fragments.

Place stamps by path distance and carry spacing remainder across input batches. Avoid random values keyed only by a mutable retained-point index. Specify how material behaves under point edits, reversal, joining and size changes; do not promise phase preservation without testing it.

Fix sparse-segment eraser misses and define a tested hit-footprint policy for styled lines. Existing whole-line and intersection erase must remain useful. Do not silently flatten styled lines into raster pixels to make editing work.

Account for rotated tips, reflection and nonuniform transforms. Choose whether a full mark transforms affinely or a brush is reapplied to transformed geometry, then implement and test that policy consistently.

Selection restrictions must apply to visible custom marks, not just centerline samples. A wide or scattered tip must not leak outside the selection. Use a persistent clip representation or another complete solution where geometric splitting alone is insufficient, and preserve that representation in saved projects and later edits.

### Respect input and document behavior

Reuse the existing pen calibration and smoothing pipeline. Do not apply device pressure calibration a second time during replay/reopen or restyle. Changing device settings must not change old artwork. Preserve pressure/width peaks when simplifying geometry. If speed affects appearance, retain its intended recorded meaning rather than manufacturing a new speed from reshaped geometry and old timestamps.

Make brush replacement explicit. Selecting a library brush changes future strokes; an **Apply brush to selected lines** action previews and commits a restyle. Default to preserving the line's weight, with clearly defined behavior for adopting brush defaults. Distinguish line selection from the canvas's spatial selection and respect selection/mask restrictions.

One completed drag or restyle preview must produce one History step. Cancellation restores the original geometry, channels and appearance. Undo/redo must notify document changes for autosave. Guard previews against navigation to a different project, frame, source or layer.

### Use the shared rendering system

Keep the existing mixed cel structure and Fill → Line → vectors ordering. Preserve shared drawing pools, comp timing, artwork sources, residency and animation behavior.

Route all vector consumers through the appropriate renderer: live preview, committed drawing, playback, compositor, thumbnails, onion skins, masks, fill references, board views, nested assets and export. Review direct `drawVectorStroke` calls as well as `paintDrawing`.

Acquire materials before synchronous rendering. Export must wait for required assets and produce the same appearance as the canvas. Pack custom tips/textures into portable projects and My Assets. Keep assets reachable for undo/redo after library deletion. Bound decoded image sizes, total memory and rendering work, including Lite mode.

Decide fill-reference behavior explicitly: a textured stroke's visible alpha and a continuous centerline barrier are different choices. Do not turn a dotted line into an invisible fill wall accidentally.

## Validation and completion

Use deterministic specimens: tap, straight line, slow and fast curves, pressure ramp/pulse, corner, loop, reversal, self-crossing, sparse segment and a stroke crossing a selection edge.

Verify at minimum:

1. Legacy appearance before/after save/reopen, undo/redo and export.
2. Live preview versus committed output; predicted samples remain preview-only.
3. Determinism across replay, changed input batching, playback, export and reopen.
4. Saved authored controls survive reload and undo.
5. Cutting/clipping/erasing preserves supported endpoint channels and material continuity.
6. Selecting, restyling, cancellation and editing create correct History steps and autosave changes.
7. The custom brush still renders after its library entry is deleted and the project opens on a fresh test origin with different pen calibration.
8. Rotation, reflection, nonuniform stretch, masks, nested artwork and exports agree with the chosen semantics.
9. Oversized/missing materials, unsupported versions and work limits fail without damaging the project.
10. Desktop and narrow touch layouts remain usable; unsupported controls are not misleading.

Run `npm test`, then `npm run build`, and the affected browser fixtures/flows on an isolated test origin. Do not clear the user's existing browser storage. Use meaningful rendering, editing and persistence checks; fixture success alone does not establish physical pen feel. Measure long/dense strokes and playback rather than asserting performance from a small specimen.

Update `HANDOFF.md`, `ARCHITECTURE.md` and the relevant format documents for the final implementation. Update the manual and `UPDATES` for user-facing behavior. Report changed files, actual checks, remaining limits, and where to open the demonstration.

Finish with a concrete, tested milestone. State which later features remain deferred and which hardware comparisons were unavailable. Do not claim CSP equivalence or real Wacom/Apple Pencil validation from synthetic browser input. Leave the work reviewable and uncommitted unless the user separately requests a commit or release.
