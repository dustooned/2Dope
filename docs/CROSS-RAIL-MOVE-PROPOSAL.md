# First cross-rail move: small change proposal

2026-10-15 · source-backed proposal · not implemented or approved

## User steering: layer organization before transfer implementation

The user asked whether this could interfere with other features and emphasized a well-organized, Dreams-like Line/Fill layer presentation. Do not treat this proposal as approved. Continue targeted manual-to-model comparison; no replacement app shell is needed.

Two official pages checked on 2026-10-15:

- [Dreams Drawing Layers](https://help.procreate.com/dreams/handbook/draw-and-paint/drawing-layers): drawing layers build one content item; the selected layer is highlighted; layers have visibility, names, blend/opacity controls and folding groups. These drawing layers are distinct from timeline tracks.
- [Procreate Layers Interface](https://help.procreate.com/procreate/handbook/layers/layers-interface): thumbnails identify contents, selection highlights the active layer, and tapping an already selected layer opens contextual options.

**Proposed adaptation:** retain existing timed drawing rails as parents, with compact, indented **Line** and **Fill** child rows, separate previews and visibility controls, and an unmistakable active paint part. Expand/collapse should keep the timeline uncluttered. Expose existing part opacity/settings where supported; do not suggest that each part has independent timing or supports every generic layer operation. Whole-exposure moves transfer the complete drawing, including vectors, rather than detaching Line from Fill.

This presentation can improve the existing rails without changing their document semantics. Arbitrary extra drawing sublayers/groups, per-part blend modes, masks and independent part moves are a larger model request and remain undecided. The manuals do not establish 2Dope's fixed Line/Fill architecture; that is our design.

**Interactions requiring verification:** shared drawing IDs can make later paint edits appear at other reused exposures; destination layer transforms/parts/blending can change appearance; source blanks can change onion skins and navigation; transfers can affect audio links and repeated occurrences; paired exposure edits must not invoke ripple independently. Save/load, export, residency and undo asset retention must preserve the same result. Existing source checks establish these dependencies, not that the proposed operation is regression-free.

Recommended next design decision: agree how the current Line/Fill parts should appear and be selected inside the existing layer hierarchy, then refine the transfer command around that hierarchy. No implementation or broad manual reread is authorized by this note.

**Recommended behavior:** move one complete drawing exposure to another drawing rail at the same composition time. Leave an equally long blank exposure behind. Reject a destination that contains artwork; do not overwrite or ripple.

## Concrete example and two rules to approve

At 24 fps, move a 12-frame drawing from rail A to rail B, beginning at comp frame 48:

| State | Rail A, frames 48–59 | Rail B, frames 48–59 | Other timing |
|---|---|---|---|
| Before | Selected drawing | Blank | Unchanged |
| After | Blank | Same drawing, same 12-frame hold | Unchanged |
| Undo | Original drawing restored | Original blank timing restored | Unchanged |

1. **Source rule:** the vacated interval becomes blank. Later drawings, keys, panels and fixed audio do not move. This operation is a transfer, independent of the existing Ripple switch; leave that preference unchanged and label the operation accordingly.
2. **Destination rule:** only a completely blank or uncovered interval is allowed. If any affected destination drawing contains artwork, reject the move with an explanation and offer a new drawing rail. Never silently replace artwork, create overlap, or insert time.

These rules are 2Dope choices proposed for review, not claims that Dreams uses this exact implementation.

## Why this fits the existing app

- `core/timeline.ts` already represents blank drawings and timed exposures, but has no free-standing clip-start field. Preserve total timing by substituting a blank drawing ID on the source; split destination holds only at the two interval boundaries. Pad uncovered destination time with blank exposures as needed. Do not mistake an empty drawing for a missing asset or for a new schema-level gap.
- Reuse the original drawing ID, with its Line, Fill and vector data. Do not flatten or copy pixels. Reusing a drawing preserves current shared-drawing semantics; independence/duplication is a separate action.
- Existing `ui/rails.ts` supplies target rows, `App.pickLayer` supplies active-target switching and `CompEditor` supplies multi-layer history patterns. `App.commitExposures` is single-layer and may invoke ripple: do not call it independently for each rail.
- `core/history.ts` allows pixel-dependent commands to declare drawings. Blank-destination checks must request residency for the actual affected drawings, inspect all planes/vectors, and remain bounded by device limits. No project-wide image scan.

## First-slice scope

One whole exposure, two unlocked, non-guide drawing layers in the same active comp. Start with ordinary once/1× playback, no time remapping or animated transforms, and compatible static transform/parent/part/blend settings. Different appearance/timing mappings require a later conversion design; reject them clearly rather than changing the rendered drawing unexpectedly. A new rail can inherit the source's applicable settings, with a finite visible end at the transferred span's end.

The interval must be fully visible, remain within the current shot, and retain its original comp-frame start and duration. Do not extend the shot or modify layer keys. Blank destination checks include partial overlaps and hidden artwork. Keep unselected neighboring holds and all reused drawings intact. Captions travel with the selected exposure; blank replacement gets no copied captions.

Start with a **Move to rail…** action in the existing drawing context menu: target picker, exact time readout and non-destructive placement highlight. Confirm commits; Escape/cancel makes no document change. This delivers the shared command before adding a vertical-drag gesture. Dragging between existing rows can reuse the same planner afterward; it is not required to prove the first transfer operation.

This is a deliberately bounded first slice, not the complete freely arranged clip system. Multi-exposure transfers, nested-comp boundaries, arbitrary horizontal relocation and replace/insert/ripple destination modes remain outside it.

## Synchronization and undo contract

Plan both rails from a snapshot. Apply both exposure arrays and any audio-link updates in one command. A linked sound attached to the moved exposure must follow its identity to the destination layer at unchanged comp time; resolve the exact repeated-drawing occurrence. Recompute affected occurrence links on both rails so unrelated repeated drawings keep their original anchors. If identity cannot be resolved without ambiguity, reject during planning.

Fixed sound, other panels and comp duration remain unchanged. Select the moved exposure on the destination rail while retaining the playhead. Undo/redo restores both arrays, relevant links and valid active selection; notify render, workspace timing and autosave. Protect original and new blank drawing assets for history and standalone save. Do not change the file schema merely to add a UI command.

## Verification required for implementation

1. Transfer into blank/uncovered ranges, split destination boundaries and preserve comp start/duration across different layer starts. Preserve other holds and reject occupied, locked, guide or unsupported transformed/timed destinations.
2. Check repeated/shared drawing IDs, captions, Line/Fill/vectors and linked-audio identity. Confirm one undo/redo restores both rails and links; cancellation changes nothing.
3. Save/reload and `.2dope` round trip; compare Draw, Time, Motion and Board after transfer. Verify existing Ripple preference and shot/panel lengths stay unchanged.
4. Run relevant tests and production build, then the affected browser flow on a separate origin. Report physical touch/iPad checks separately.

Preparation checked `beta/main` at `7e275ac`; pending documentation preserved. No application changes, dependency changes, new mockup, implementation tests/build, merge or deployment. Implement only after the two behavior rules and bounded scope are accepted, in a separate worktree/branch.
