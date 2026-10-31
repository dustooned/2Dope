# Mode context and customizable workspaces

2026-10-30 · accepted direction; mode-context workspace implementation completed locally.

The user selected **Mode-first** from the interactive layout exploration and asked
that extra settings remain available, with easy ways to move tools and add other
controls. The mockup establishes direction, not finished functionality. This note
records requirements and the implementation scope below.

## Implemented locally

Draw and Animate now use ordered, mode-specific painting toolbars and a separate More
tools drawer. Workspace settings supports per-mode pinning, drag/Move reordering,
top/left/right docking, brush edge, optional labels and explicit ink/colour targets.
Student profiles capture these preferences; Apply, Cancel, storage-failure recovery and
restoring class defaults remain outside artwork History. Existing source editing,
Flipbook/Clips, selection and transform commands remain editable through the same model.
Story writing fields now have permanent visible and accessible labels. Recovery controls
live in the bottom bar; narrow toolbars scroll with More reachable, and short landscape
spacing keeps the Flipbook stage usable. Freely floating arbitrary tool groups and a
general panel builder are not implemented; tools move through the workspace editor,
with the existing Reference/Flipbook windows retaining their own movement controls.

See the current `HANDOFF.md` section for actual checks and remaining device limitations.

## Working areas

- **Draw:** canvas first, accessible size/opacity, the artwork's own paint layers,
  and quick access to raster and vector brushes. Procreate is the interaction reference.
- **Animate:** stage plus Flipbook / Clips views; drawing controls while drawing,
  placement and clip controls while arranging. Procreate Dreams is the reference.
- **Story:** retain the panel cards; use permanent Action, Dialogue / narration,
  Camera / framing labels and short prompts. Timing and production notes are optional.
- **Timing:** prioritize holds and exposure.
- **Motion:** prioritize the selected placement's transforms and keys; distinguish
  changing this placement from editing its shared artwork source.

Keep navigation, Assets access and essential completion/recovery actions predictable.
The asset flow is Place → Edit source → Done → return to the same shot and playhead.

## Experience requirements

The user reinforced that closeness to Procreate in Draw and to Procreate Dreams in
Animate / Flipbook is a core requirement. Judge the proposed experience through
everyday actions and transitions as well as the layout. These are 2Dope design goals,
not claims of verified parity with either reference application.

- **Draw:** brush, smudge, erase, colour and artwork layers are immediately reachable;
  size/opacity and Undo stay accessible while the canvas remains dominant. Selections,
  transforms and adjustments clearly identify their target and provide an easy finish
  or cancel path. Brush variety and editable vectors remain available within that flow.
- **Animate / Flipbook:** drawing frames, stepping between them, onion-skin controls
  and playback form a short, coherent loop. Switching to Clips exposes arrangement
  controls without losing the shot or playhead. Returning to drawing should recover
  the applicable brush, paint target and view rather than require setup again.
- **Editing flexibility:** keep source paint layers, editable vector marks, shared
  asset reuse, placement transforms and undoable edits available. Label shared-source
  edits separately from placement edits. Switching modes or customizing the workspace
  must never flatten artwork or create duplicate assets merely to change the view.
- **Extra controls:** frequent actions stay direct; deeper options are reachable from
  their tool/panel and can be pinned. Students can rearrange the workspace while each
  mode retains a clear default identity and a reliable route back to class defaults.

## Required customization

1. Start with a balanced class layout in each mode. Students can create their own
   arrangement without changing the class starting layout or their artwork.
2. Provide an explicit **Edit workspace** setting for moving and reordering tool
   groups, choosing left/right controls, and adding or removing shortcuts and panels.
   Offer tap/keyboard Move actions as well as dragging. Normal drawing gestures must
   not accidentally rearrange the interface.
3. Let students pin extra tools, including Vector and adjustments, and personalize
   QuickMenu. Keep the full tool and settings catalog available through More/Settings
   even when a tool is not pinned. A small default toolbar must not remove capabilities.
4. Remember layout and pinned tools per mode. Changing the Draw setup should not
   rearrange Animate, Story or Motion. Preserve applicable context when switching modes.
5. Expose advanced settings on demand, close to the relevant tool or panel. Separate
   tool choice, painting target and operation scope. Replace ambiguous "Whole" with
   explicit labels such as Current layer, Selected marks or Entire artwork.
6. Keep optional visible tool labels and a clear **Restore class defaults** action.
   Hidden controls remain recoverable; Done/Cancel, navigation and recovery actions
   must remain reachable. Restoring the workspace never resets artwork or brushes.
7. Adding controls must reflow or dock them without overlapping the canvas, other
   controls or the timeline. Preserve touch targets and usable canvas space on small
   screens and short landscape layouts.

Build on existing student profiles, visibility preferences and QuickMenu. Inspect their
current implementation before extending storage; workspace choices are preferences,
not document History edits or artwork-format changes. Exact docking mechanics and any
freely floating panels remain implementation decisions to review in a working slice.
This direction does not settle or silently reverse existing Line/Fill auto-tool behavior.

## Implementation order and acceptance

Begin with Draw plus the shared Assets/source return flow; carry that structure into
Animate, then refine Story writing, Timing and Motion. For each slice, demonstrate:
pin/unpin, reorder/move, reopen an extra setting, switch modes and return, reload the
saved setup, and restore defaults without changing artwork. Verify narrow and landscape
layouts, keyboard/tap alternatives, and source-edit return at the same frame.
Also walk through a Draw selection/transform/adjustment and an Animate draw/step/
onion-skin/playback/Clips/source-edit loop. Check that extra settings are reachable and
that editable artwork, per-mode setup and applicable painting context survive the loop.

The earlier mockup checks were design-only. The implementation has its own real-App
workspace/storage/profile fixtures and responsive checks; existing painting, source-edit,
selection and playback fixtures remain the regression coverage. Physical tablet feel is
not established by browser automation. No dependency or project-format change is included.
These implementation notes predate release authorization; see the current handoff release
scope and Git history for delivery status.
