# Dreams + Procreate: drawing and timeline design addendum

2026-10-15 · design only · one agent · five additional official pages

Read with [the timeline specification](TIMELINE-INTERACTION-SPEC.md) and [user direction](TIMELINE-AND-MEDIA-DIRECTION.md). This pass expands the drawing/UI design; it does not authorize implementation or narrow the user's larger timeline goal to audio alone.

## Evidence boundary

Behavioral reverse engineering from documentation using the REA skill's observation/inference/unknown distinction. No REA binary/runtime tools were used: no Dreams/Procreate executable or runtime was supplied, and these questions can be studied from manuals. No internal code, data structure or measured interaction performance is claimed.

The five successful pages below use the unversioned official handbook routes. They showed no older-version banner when read; no installed application version was verified. One guessed Prefs URL returned 404; its actual link was then followed. No sixth content page was studied. Earlier Dreams 2.0 findings retain their older-version limitation; this pass does not revalidate all of them.

## 1. Findings from five pages

| Evidence | Documented behavior | Design implication (our inference) |
|---|---|---|
| E1: [Dreams: Track and Content Options](https://help.procreate.com/dreams/handbook/tracks-and-content/tracks-and-content-options) | Track and content holds open different menus; content options depend on type/selection. Remove empty section closes a gap on that track. Video audio can be separated onto a track above. Group blending is isolated unless Passthrough is selected. | Identify the action's target and scope. Distinguish gap closing from ripple trimming. Grouping requires a rendering policy as well as a folder UI. |
| E2: [Dreams: Prefs](https://help.procreate.com/dreams/handbook/movie-settings/prefs) | Preferences expose undo/redo buttons, rapid-undo delay, keyboard shortcuts, finger multi-select and several device gestures. Pencil hover can preview timeline positions. | Essential actions need visible controls and optional gestures. Hardware-dependent shortcuts cannot be required. Hover preview and intentional audio scrubbing should be separate paths. |
| E3: [Procreate: Organize Layers](https://help.procreate.com/procreate/handbook/layers/layers-organize) | One primary layer receives paint; secondary layers participate in bulk actions. Groups fold and move together. Painting with a group selected invokes layer selection. Layer Select can identify overlapping layers on the canvas. | Show a single paint target separately from the edit selection. Selecting a group must never silently paint into an arbitrary child. |
| E4: [Procreate: Selections Interface and Gestures](https://help.procreate.com/procreate/handbook/selections/selections-interface) | A Selection toolbar defines an area. Switching tools commits the selection mask; painting/editing then stays inside it. The selection and chosen tool can both remain highlighted. Tapping Selection again cancels it. | Spatial masks and timeline selections need separate state and feedback. A persistent mask must remain obvious when returning to painting. |
| E5: [Procreate: Interface](https://help.procreate.com/procreate/handbook/interface-gestures/interface) | Painting tools, editing tools and sidebar controls occupy distinct areas. Size/opacity and undo/redo stay accessible. The sidebar can change sides; full-screen hides the interface with an exit control. | Keep frequent creation controls stable; show contextual detail only when needed. Preserve an obvious way out of a focused canvas layout. |

## 2. Proposed shared interaction contract

These are proposed 2Dope choices, not implemented features or inferred proprietary internals.

| State/action | Draw | Time | Motion | Board |
|---|---|---|---|---|
| Active paint target | One drawing layer + Line/Fill part | Same active layer when returning to Draw | Selecting a transform target does not silently choose another paint layer | A panel selection does not redirect painting without an explicit drawing action |
| Edit selection | Drawing spans/rails | Exposures | Spans/keys | Panels/linked content |
| Spatial selection | Visible drawing mask | Retained but does not select time cells | Retained but does not become a key selection | Does not select panels |
| Context actions | Target drawing/span/rail/group | Target exposures or rail | Target keys or spans | Target panels or sound; label ripple scope |

1. **Selection feedback:** display the active layer/part near drawing tools and the edit-selection count near timeline actions. If a selected group has no explicit paint target, prompt for a child on the canvas or rail. Switching workspaces retains applicable selection by stable IDs; do not manufacture equivalent keys/panels for incompatible selections.
2. **Groups:** folding only hides detail. For organizational grouping, preserve the current rendered result and absolute timing. Do not map grouping blindly to an isolated precomp: E1 shows why blending could change. Define transform inheritance, audio membership and ungrouping before schema work. Line/Fill remain drawing parts, not duplicate content tracks.
3. **Timing actions:** expose Trim, Ripple trim and Close gap as distinct commands. Preview affected spans and linked sound. Close gap is explicitly scoped; it must not inherit project-wide panel ripple accidentally. A group collapsed during an edit must still disclose affected children. One gesture commits one history entry; cancellation restores the preview.
4. **Context UI:** keep Create/Import, playback, time readout and undo/redo stable. Use a compact contextual action area for the current target and an accessible menu button as an alternative to hold/right-click. Keep masks, selection and ripple indicators visible; show detailed properties on demand. Preserve the existing touch-context-menu fix.
5. **Media:** an eventual import pipeline can share placement while retaining type-specific actions and budgets. Video/audio separation is a later candidate, not a promise for the first import slice. Selection, hierarchy and timing should reference assets without duplicating decoded media.

## 3. Review scenarios before structural implementation

| Scenario | Proposed expected result |
|---|---|
| Two rails selected; paint a stroke | Only the explicitly active drawing/part changes; selection remains available for bulk edits. |
| Group selected, no active paint child | Pick a child before painting; no hidden child is chosen automatically. |
| Group multiply-blended artwork, then ungroup | Organizational grouping preserves appearance and absolute timing both ways. Rendering groups require separate explicit semantics. |
| Close a six-frame gap on one rail | Preview names affected later spans; unrelated rails/fixed sound remain in place. Linked sound follows its anchor once. Exact stop/lock rules still need approval. |
| Leave Draw with a spatial mask; return | Mask status remains visible; Time/Motion/Board operations did not reinterpret it as a temporal selection. |

## 4. Remaining unknowns and next step

The reviewed manuals do not establish exact gesture thresholds, audio-preview duration/reverse processing, an audio-scrub toggle, or complete ripple behavior across gaps/locks/nested groups. E1 describes gap closing differently from the earlier proposed contiguous-span ripple rule; keep them separate. Blend isolation cannot be reproduced by folding alone. Device feel and performance require actual hardware checks.

**Next design deliverable:** review one compact timeline layout against the five scenarios above before approving the structural timeline redesign. This study provides the behavior contract; it does not substitute for that layout review.

**Smallest independently buildable feature remains Audio scrub on/off**, using the earlier specification, if the user chooses it. The 80 ms/20 Hz values there are proposed tuning values, not Dreams measurements. No broader redesign, selection tool, media decoder or Rust rewrite is authorized by this research task.

Local baseline: `beta/main` at `7e275ac`, existing documentation edits preserved. Application code/dependencies unchanged; no build/tests, fetch, merge or deployment performed. Documentation whitespace checked. Claude should read this addendum together with the earlier spec before starting a feature, then check live Git state again.
