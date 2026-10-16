# Timeline, media and UI direction

User direction recorded 2026-10-15 for Claude and Codex. This is a planning handoff, not a report of implemented features. It supersedes selection tools / brush import as the assumed next priority; those remain queued, not cancelled.

## User requirements

- Add an audio scrubbing toggle so users can choose whether moving the playhead previews sound.
- Import media generally, rather than treating audio as a separate, rigid exception.
- Make animation timeline interaction more free flowing, with Procreate Dreams as the interaction reference named by the user.
- Give Draw a freely arranged timeline: users create rails and groups spanning the animation, place content in time, and work with ripple editing.
- Preserve expandable groups, layers and sublayers so detail can be revealed without overwhelming the timeline.
- Carry the same structure and timing naturally between Draw, Time and Motion; Board should stay synchronized with the shared project.
- Clean up the UI so making and iterating on work requires less friction.
- Prepare for a Rust version after this version is ready. Rust is a future implementation target, not a request to begin a rewrite now.
- Keep the browser version lightweight and responsive, including touch workflows.

The reference describes the desired feel. Exact gestures, menus, import formats and behavior still need a concrete design and confirmation; do not assume parity with another product.

## Proposed behavior to make reviewable before implementation

### Selected-area fill (user steering, 2026-10-15)

The user wants filling to follow the area chosen with the drawing Selection tool rather than depend on automatic enclosed-region detection. This is a spatial selection, distinct from selected timeline exposures.

- **Fill selected area:** apply the current color throughout the selected mask, even without a closed ink boundary. Keep Line and Fill separate; retain the existing Fill-plane destination unless a different target is explicitly designed. No enclosed-region, gap-close or line-threshold test should shrink or expand this direct selected-area operation.
- **Leftovers:** retain its purpose of cleaning missed/unfilled spots, but intersect the result with the active selection so it never changes pixels outside it. Preserve existing painted areas and the established surrounding-color behavior unless separately changed. Hole growth under ink must also respect the selection boundary.
- **Fill and drag (confirmed by user):** fill connected regions under the pointer, bounded by the active spatial selection. This remains region-based filling, not direct painting along the dragged path. Intersect every result, including under-line growth, with the selection; preserve the established behavior outside an active selection. Direct Fill selected area remains a separate operation that fills the entire selected mask without region detection.

Current source: `App.selection` is temporal, not a persistent drawing mask. The existing Fill Lasso calls `lassoFill`, which detects closed line-art regions mostly inside the polygon; it does not simply color the selected polygon. A reusable drawing selection/mask is therefore a real missing piece, not a label change. Reuse the existing polygon mask geometry as appropriate; preserve one-gesture undo, cancellation, residency, selection feedback and save/export consistency. Persistent mask behavior on drawing/frame changes and across-frame fill must be specified before coding.

This records the requested direction only. No fill algorithm, tool behavior or application code changed in this pass.

### Draw selection, transform and warp (user steering, 2026-10-15)

User request: lasso artwork in Draw, transform the animation/artwork, and offer basic and advanced mesh warp controls inspired by Procreate. This belongs to the same reusable spatial Selection tool requested for selected-area Fill, not a separate lasso implementation for every action.

**Manual evidence checked:** [Procreate Warp](https://help.procreate.com/procreate/handbook/transform/transform-warp) describes dragging corners, sides or the mesh, with Advanced Mesh exposing individual intersection nodes. [Dreams Draw & Paint Transform](https://help.procreate.com/dreams/handbook/draw-and-paint/transform) describes Uniform, Freeform, Distort and Warp on drawings/Flipbook layers or selections, with Advanced Mesh only in Warp. This establishes reference interactions, not their implementation or an exact grid resolution.

**Proposed 2Dope workflow:** Select → move/rotate/scale → optionally Distort or Warp → Apply/Cancel. Default to proportional scaling; expose independent-axis scale, flips and numeric position/size/angle plus pixel nudges for precision. Offer a simple grid first, with Advanced Mesh revealing finer node control in the same context. Keep advanced controls folded until requested. Reset restores the transform session's original state.

**Make scope explicit:** Current drawing, Selected drawings, or Whole rail/precomp. The last can reuse Motion's existing non-destructive layer transform; it is not the same as modifying cel pixels. Whether “animation” means selected frames or the whole object still needs confirmation before a multi-frame implementation. Never transform all frames implicitly, change holds, shift panels or move sound merely because a spatial selection is active.

Preserve Line/Fill separation and vector records; provide explicit part targeting, with combined artwork moved together when that is selected. Affine selected-vector edits can use geometric points; bitmap extraction/coverage and nonlinear warp need their own rendering policy. Do not silently flatten vector artwork or lose pixels outside the selection. Preview from the unchanged source so repeated handle drags do not repeatedly resample and blur it. Define interpolation, edge coverage, mesh folds/overlap and out-of-canvas handling before implementation.

Current source already has Motion layer transforms and vector erasing, but no persistent spatial selection or mesh warp was established in the checked Draw paths. Reuse `polygonMask` for geometry where suitable; keep drawing masks distinct from temporal exposure selection. Shared drawing IDs and held/repeated exposures require an explicit edit-shared/make-unique policy; apply a batch edit once per intended drawing rather than repeatedly per held frame.

**Staged implementation proposal:** (1) reusable lasso selection plus direct Fill and move/rotate/scale on the current drawing, (2) basic Warp with bounded preview and one undoable Apply, (3) Advanced Mesh and explicitly scoped multi-drawing operations. Animated/keyframed mesh deformation is a separate later capability, not implied by a drawing warp. All stages preserve cancellation, residency/device limits, save/export and existing Motion keys. This is recorded direction; no selection/transform/warp code has been added.

### Shared timeline model

Use one underlying timing and group model, with workspace-specific views. Draw emphasizes drawing and arranging content; Time exposes frame/exposure precision; Motion exposes transforms and keys; Board emphasizes panels and shot timing. Switching workspace must retain placement, duration, hierarchy and the playhead without conversion or duplicated timing records.

Make selecting, moving, trimming, splitting and grouping content direct timeline actions. Support gaps, overlapping content on separate rails, time zoom and folding. Distinguish a rail (organizational track) from a clip/content span and from a nested composition; settle how existing layers map onto this structure before changing the file format.

Define ripple scope explicitly: which selected rails/groups participate, whether later content and linked audio move, and how boundaries, keys and storyboard panels follow. Avoid an implicit project-wide ripple that moves unrelated work. Each completed gesture should produce one undo step, and cancellation should restore the starting state.

### Media and sound

Propose one Import media entry point with clear supported formats. Candidate content types are audio, still images, image sequences and video; this list is a proposal, not a claim that all are supported or approved for the first implementation slice. Decide video treatment, frame-rate handling, transparency, asset limits and unsupported-format feedback before promising import behavior.

Propose a discoverable audio scrub on/off control shared across timeline views. Define short preview behavior for slow movement, fast movement, reverse movement and touch dragging; avoid queuing stale sounds. Scrubbing preferences must not alter normal playback or exported audio. Verify timing and responsiveness on actual target devices.

### UI cleanup and Rust preparation

Review the whole create/import/select/edit/play loop before rearranging individual buttons. Keep common actions close to the canvas and timeline, use contextual controls, and retain access to detailed settings without keeping every panel open.

Stabilize the document model, timing rules, undo commands, asset ownership and file compatibility in the browser version. Keep these boundaries explicit and covered by useful tests so a later Rust implementation can reproduce the same behavior. User reaffirmed on 2026-10-16 that the future Rust target includes a desktop app, explored after web stability. No desktop framework, renderer, or degree of UI reuse has been selected. Do not add a second runtime or begin a speculative rewrite during this work.

## Suggested sequence (proposal)

1. Integrate the completed audio polish after checking both checkouts for concurrent changes.
2. Design and review the shared timeline/media interaction, including ripple scope and a Draw/Time/Motion mapping. Confirm this before the structural timeline implementation, as the user previously requested.
3. Implement bounded audio scrubbing and the agreed first media-import slice.
4. Implement the shared timeline structure and editing commands in slices, verifying cross-workspace sync, undo and saved-project compatibility.
5. Apply the UI cleanup around those tested workflows, then assess browser-version readiness for Rust work.

## Starting evidence and checks

- At this note's creation, `beta/main` is clean at `7e275ac`; this note does not change application behavior.
- Existing rails, Board views and audio provide a starting point, not proof that the free-arrangement requirement is complete.
- Audio polish is on `codex/audio-waveforms`, commit `1104e93`, in the sibling `codex-video-export` worktree. The prior handoff reports it pushed but not merged or deployed; recheck before integration.
- Preserve the shared project/clock, residency, device limits, undo/autosave and standalone `.2dope` assets. Format changes require validation and migration.
- Future source changes need relevant tests and a production build; input/layout/media changes also need the affected browser flows. Desktop checks do not establish touchscreen, iPad/Safari, pen feel or audio quality.
