# UI clarity handoff — 2026-10-16

## Integration and scope

Branch `codex/ui-clarity`, checkout `E:\2026\Dev\Apps\2Dope\codex-ui-clarity`, based on selection/fill `5caf0aa`. Includes that foundation through ancestry. No merge, push or deployment; main and Claude's application source preserved. Separate audio/QuickShape branches are not merged here. The simple rail group-entry handler overlaps the equivalent change in QuickShape `65cf3e1`; retain it once when integrating. Preserve all feature manual/update notes when resolving overlaps.

## Changes

- Replaces the transient Fill badge with a compact Draw paint-target button: comp path, layer, drawing number, actual tool destination, hidden/locked warnings. Fill tool targets Fill; vector pen targets Line; selection mode says Area selection. Empty comps say **New layer on paint** instead of implying an arbitrary child is selected. Tap opens Layers; this replaces the old badge's switch-to-Line shortcut. Existing Line/Fill controls and X remain.
- Layers now includes precomp/group rows. Disclosure previews immediate drawable children; tapping the name explicitly enters through existing `CompEditor.enter`. Child preview rows are informational, not direct cross-comp editing. Breadcrumb exit is unchanged. Cameras/nulls remain Motion controls.
- Layers and rails share one `RailState`, using the existing per-device storage key. Fold changes update both; no document history, timing or visibility changes. Drawing disclosures reveal Line/Fill. Picking an inactive drawing's part selects that drawing explicitly; part visibility controls remain restricted to the active drawing. Group names on the root rail can also enter the comp.
- Sidebar height is bounded by the actual stage. Sliders shrink before undo/redo; below 220px stage height it becomes horizontal. A stage ResizeObserver responds to timeline/audio growth, not only window resize. Layer list can scroll within its popover.
- Student manual and update notes describe the changes. QA fixture adds narrow/desktop iframe controls for repeatable layout checks.

No dependencies, project schema, compositor, timing, undo commands or autosave model changed. No affine transforms, clipping masks, new group model or floating Flipbook implemented.

## Verification

- **250 tests in 27 files passed.** Production build passed, including strict TypeScript; final label/manual changes received a fresh successful build. `git diff --check` passed. UI-only changes verified through browser flows rather than implementation-mirroring tests.
- Production desktop Chromium on isolated loopback origin `http://127.0.0.1:5199`, using a disposable UI Clarity QA project. Scripted ink fixture used normal pen pointer handlers; subsequent actions used real application controls.
- Mouse Undo/Redo reachable and working; geometry/hit tests confirmed both buttons inside the stage. Expanded timeline produced a 218.8px stage: compact sidebar and both button centers hit their own controls instead of the splitter. In a 390px iframe, target stayed within bounds and undo/redo remained reachable.
- Picked Fill, independently hid/restored it, and locked/unlocked the drawing: label and part state updated correctly. Popover disclosure expanded the same rail. Existing Motion Group created Character; Draw showed it, previewed children, entered explicitly and displayed `Shot › Character › Drawing`. Breadcrumb returned out.
- Switched Draw/Time/Motion, then root Board/Draw; verified nested path and return. Quick Animate kept the target cue, and More > Exit Quick Animate returned normally. Reload preserved saved artwork and fold state. Full and Lite (`lite form-desktop`) both checked; no real mobile hardware evidence.
- QA logs captured two untraced `MutationObserver.observe` Node-type errors, without source URL/stack. Similar error was recorded in earlier QuickShape QA. Do not claim a clean console or assign it to the browser/app without evidence; tested flows completed. No separate archive round-trip, Safari/Pencil, pressure-memory or physical-touch test in this slice.

Screenshot: `C:\Users\dusto\.codex\visualizations\2026\10\15\01a13dd1-cb7e-7621-aad1-e96932098649\2dope-ui-clarity-check.png`.

Next separately scoped work: current-drawing affine transform after deciding partial-vector and off-canvas rules. Masks/warp/Rust remain queued. Existing nested time round-trip semantics were reused, not redesigned or broadly validated.
