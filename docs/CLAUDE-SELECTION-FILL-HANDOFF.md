# Selection fill handoff — 2026-10-16

## Integration

Isolated checkout: `E:\2026\Dev\Apps\2Dope\codex-selection-fill`, branch `codex/selection-fill`, based on main `7e275ac`. No merge, push or deployment. Main and Claude's application source were preserved. This branch does not include the separate QuickShape or audio-polish commits; retain their changes when integrating, especially manual/handoff edits.

## Implemented scope

- Fill > **Select area** replaces the previous automatic enclosed-region Lasso Fill interaction with a temporary lasso mask and visible boundary. Selecting alone changes no pixels and creates no undo step. The legacy stored mode value `lasso` still works.
- **Fill selected area** paints the complete mask on Fill, independent of ink closure, threshold, gap closing or under-line growth. Line pixels and vector records remain separate.
- Tap/drag still fills connected regions crossed by the pointer. Flood traversal, gap-band recovery and under-line growth cannot cross selection bounds. Outside seeds do nothing. Without a selection, ordinary bucket/drag behavior remains.
- Leftovers retains existing small-hole detection and color choice; intersect its final pixels, including under-line growth, with the mask. It does not become general painting or direct selection fill.
- Selection is scoped to project, comp, layer, drawing and current frame. Esc/Clear selection removes it; changing frame/layer/project invalidates it. Brushes are unrestricted. Selected fills never repeat onto following drawings, even when the saved Next drawings preference is nonzero. Shared drawing IDs still share pixel edits, as before.

Each paint gesture or direct fill uses existing pixel history/residency/autosave. Fill gestures now count as active strokes; cancel restores pixels, cancelled lasso preserves the prior selection, and window/pointer interruption cannot leave the fill gesture stuck. The fill panel's frame callback is retained by `main.ts` so buttons immediately follow selection validity. No schema, dependencies, timeline timing or export evaluator changes.

## Verification

- Full suite: **250 tests across 27 files**, including 5 selection tests; strict TypeScript + Vite production build passed. `git diff --check` passed. Final callback wiring was followed by a fresh successful production build and browser check.
- Desktop in-app Chromium at separate test origin `http://127.0.0.1:5198`, production app inside authored `qa/selection-fill.html`. Synthetic pen paths use normal pointer handlers; not physical Pencil evidence.
- Verified: selection without painting; direct fill across an open divider without leaking; tap fills only the selected side of ink; drag fills both crossed regions within bounds; undo removes only fill; keyboard Ctrl+Shift+Z restores it; pointer-cancel restores pixels/retains prior selection; Leftovers leaves the large open unfilled region unchanged; Esc and frame navigation clear the mask; corrected controls disable after a frame change. Filled pixels survived autosave/reload and temporary selection cleared.
- No captured console errors in the tested tab. `.2dope` browser download observation stalled; archive export/import round trip **not verified** in this run. Existing file-format tests passed; no format changes.
- The short iframe viewport places the existing Sidebar Redo button beneath the timeline splitter. Mouse click therefore did not reach it; shortcut redo verified. An early reload after that ineffective click showed the correctly saved undone state, not a proven autosave loss. Flag the sidebar layout for UI cleanup; this feature does not change it.

## Limits and next slice

No affine transforms, warp, additive/subtractive selections, selection persistence or multi-drawing mask propagation. No iPad/Safari/Pencil, Lite memory-pressure or detailed Leftovers hole-edge browser fixtures. Keep those claims separate from desktop checks. The next selection feature should add current-drawing affine Apply/Cancel using this spatial mask while preserving Line/Fill/vector semantics; do not silently flatten artwork or transform every shared occurrence.

Future Rust desktop exploration remains queued until web stability. Framework/renderer/UI reuse are undecided; no Rust work started.
