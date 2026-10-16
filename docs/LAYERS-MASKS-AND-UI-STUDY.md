# Layers, masks and the overall editing experience

2026-10-16 · design only · five official pages · one agent

Extends the saved studies, using main `7e275ac` and recognizing separate selection/fill `5caf0aa` and nested-entry/shape `65cf3e1` branches. No reference-app runtime, measured touch feel, mockups or application edits. Extend the existing app; no replacement UI shell.

## Manual evidence → existing 2Dope → gap

| Evidence | Documented behavior | Existing source / remaining capability |
|---|---|---|
| L1: [Dreams Drawing Layers](https://help.procreate.com/dreams/handbook/draw-and-paint/drawing-layers), Select/Group/Layer options | Highlights identify editing layers; multi-selection exposes bulk actions. Groups fold, reorder, ungroup or flatten. Visibility, blend and opacity are separate controls. | `ui/rails.ts` already folds Line/Fill and precomps. `ui/layerspop.ts` uses `App.drawLayers()`, which filters out precomps. Align the hierarchy exposed by these existing views. Organizational groups and nested comps are not equivalent. |
| L2: [Procreate Mask](https://help.procreate.com/procreate/handbook/layers/layers-mask), Alpha Lock/Layer Mask/Clipping Mask | Alpha Lock confines edits to existing pixels. Grayscale masks hide/reveal without erasure. Lower-layer shape/visibility controls clipped artwork above. Reordering a clipped layer changes its base. | `view/composite.ts` supports tint, opacity and nested compositing, but no general layer clipping was found. Its `source-in` tint and the branch's temporary fill-selection mask are different mechanisms. |
| U1: [Dreams Interface](https://help.procreate.com/dreams/handbook/interface-and-gestures/interface), Layout/Stage/Canvas | Project browsing, timeline, movie viewport and drawing-content editing are distinct contexts. Canvas belongs to the edited Drawing/Flipbook. | Board/Draw/Time/Motion already share one project. Make the current object and nested return path explicit; preserve the shared clock and existing workspaces. |
| U2: [Dreams Draw & Paint Settings](https://help.procreate.com/dreams/handbook/draw-and-paint/settings), Canvas/Onions/Prefs/Finish | Settings include selection-overlay opacity, onions while scrubbing, sidebar side, finger painting and scrub speed. Finish returns to Timeline; title double-tap offers another route. | Existing Quick Animate, onions, scrub lock and breadcrumbs cover parts of this workflow. Keep essentials and an explicit exit reachable while detailed settings remain contextual. |
| U3: [Dreams Flipbook mini](https://help.procreate.com/dreams/handbook/draw-and-paint/flipbook-mini), positioning/navigation/Scrub Lock | Mini retains the active track, docks at edges and supports playback/drawing stepping. Brush sidebar changes sides to avoid it. It returns to the docked editor; scrub lock returns to a chosen frame. | 2Dope already has drawing/frame stepping, lock and slim Quick Animate. A draggable/orientable mini editor remains separate work. First ensure existing controls cannot cover each other. |

**Source ambiguity:** L1 initially says clipping targets the layer underneath, then appears to reverse which layer controls visibility. L2 explicitly says the lower base controls the clipped artwork above. Use L2 for the proposed contract; Dreams' precise rendering order is not runtime-verified. Reuse the earlier group-blend study: folding is not blend isolation.

## Our proposed overall UI flow

These are design choices, not proof that a layout is faster or more attractive. Preserve the user's expandable hierarchy requirement; no automatic-collapse rule is approved.

| User moment | Improvement to existing controls |
|---|---|
| Open/create/resume | Keep Projects/setup. Distinguish local save status from exporting a portable file. |
| Enter drawing content | Show a compact real-state target label, e.g. `Shot › Character · Drawing 12 · Fill`. Distinguish the paint target from bulk selection. Line/Fill remain artwork parts, not independent timed clips. |
| Organize | Align Layers popover and rails. Separate disclosure, paint selection and visibility hit targets. Show a group's children on demand without changing their visibility or timing. Do not silently paint into an arbitrary child. |
| Select/edit | Identify pixels versus drawings/layers/keys. Show relevant Fill/Transform actions with scope and Clear/Apply/Cancel as appropriate. Fill options should be discoverable with Fill active; avoid putting every parameter into the top bar. |
| Time/animate/review/export | Retain shared transport, playhead, ripple indicators and breadcrumb. Clearly label any local playback scope. Keep Board panel-focused on the same clock. Detailed properties stay folded; future exports distinguish clean art from baked treatments. |

## Clipping contract to settle before coding

Propose **Clip to layer below** in existing layer options, with an indented arrow and visible base relationship. Keep source artwork editable. Start with compatible drawing layers inside one comp. Do not clip across comp boundaries or create separate timing for Line/Fill.

Decide consecutive clipped-layer base resolution; missing/hidden/locked base behavior; reorder/delete/ungroup rules; base-opacity participation; and transformed alpha evaluation. Selection-bound fill, Alpha Lock and grayscale masks remain separately named operations. **Clip to Fill** would be a later explicit part target.

Effect order needs its own rule: shading/texture normally stays inside base alpha; an outside glow is an explicit option. Evaluate on shared comp time, consistently in Draw/Motion/Board/export. Separated passes must retain the base as a masking input even when it is not visibly exported.

## Recommended small implementation order

1. **UI clarity/access:** paint-target and hierarchy/part cues; reachable undo/redo and transport in short windows, Full/Lite and Quick Animate. Earlier selection QA found Sidebar Redo beneath the timeline splitter; historical observation, not newly reproduced here. This first slice should avoid timing/schema changes.
2. **Current-drawing affine transform:** integrate the selection foundation first, then settle partial-vector and overflow rules from the [selection study](SELECTION-TRANSFORM-MANUAL-STUDY.md). Keep a layer-tree rewrite out of that feature.
3. **Clipping:** one agreed base-resolution rule, undoable toggles/reorders, compatible save/reload and matching viewport/export alpha. Warp, movable mini editor and effect stacks remain separate slices.

Review scenarios before implementation: pick Fill within a folded character group; hide Line without changing paint target; switch all four workspaces and return; enlarge the timeline in a short window; exit nested editing and Quick Animate; undo. Preserve artwork, timing, shared IDs and linked audio throughout. Actual device feel, mask performance and edge-case compositing remain unverified.
