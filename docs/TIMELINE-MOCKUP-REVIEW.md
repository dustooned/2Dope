# Shared timeline mockup review

2026-10-15 · design only · not an application feature

Preview: [local review copy](../../timeline-design-preview.html). Editable inline source: `C:\Users\dusto\.codex\visualizations\2026\10\15\01a13dd1-cb7e-7621-aad1-e96932098649\2dope-shared-timeline.html`. The root-level review copy is a generated standalone wrapper; edit the source and regenerate it, not 2Dope application files.

## What to review

1. Use **Example → Before / After** for Move, Trim beside neighbor, Ripple trim, Close gap and Group. These are proposed outcomes, not measurements of Dreams.
2. Switch **Draw / Time / Motion / Board**. Time shows frame counts, Motion reveals a key row, and Board adds panels. Shared placement and paint target remain recognizable. These are deliberately simplified views, not full X-sheet or Motion editors.
3. Fold groups or reveal Line/Fill using the arrows. Fixed music stays separate. The active paint target remains explicit even when a group is selected.
4. Review **Create / Import** placement and **Scrub audio** near playback. Those controls illustrate entry points: they do not import files or produce sound. Video is labeled for later.
5. Decide whether this composition supports the user's workflow before structural coding. Pointer dragging, zoom, real masks, decoding, persistence, gesture arbitration and undo belong to implementation, not this preview.

## Proposed timing examples

All examples use an eight-second, 24-fps composition (192 frames); the playhead stays at frame 36.

| Action | Before | After |
|---|---|---|
| Move | A: 24–71, B: 120–167 | A: 48–95, B unchanged |
| Trim | A: 24–71, B: 72–119 | Extension blocked by B; no overwrite or ripple |
| Ripple trim | A: 24–71, B: 72–119 | A: 24–83, B: 84–131; B's linked voice moves once |
| Close gap | A: 24–71, B: 96–143 | B: 72–119; its linked voice follows; fixed music stays |
| Group | Character and Scenery separate | Shot group wraps them without changing placement, appearance or paint target |

Group rendering, arbitrary clips per layer and broader ripple scope remain design decisions from [the addendum](DREAMS-PROCREATE-DESIGN-ADDENDUM.md). This preview is not an approved schema design. Its generated wave pattern is illustrative, not source audio.

## Actual verification

JavaScript syntax checked. Separate loopback preview checked in desktop Chromium: all five After outcomes, Time's changed frame lengths, Motion's keys, Board's panel view, folding, Line/Fill reveal, scrub-toggle status and workspace changes. No captured warning/error entries. Screenshot saved beside the inline source as `2dope-timeline-design-check.png`. Physical touch, responsive-device layouts and audio behavior were not verified. No application tests/build were needed for this separate design preview.

Application code, dependencies, Claude's source and existing edits were preserved. No merge, deployment or fresh reference research. Next user decision: layout and interaction corrections, or approval to scope one implementation slice; no structural feature starts automatically.
