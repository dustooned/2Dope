# Focused workspaces and export handoff

2026-10-16. Branch `codex/workspace-export`, checkout `codex-workspace-export`, based on reviewed integration `38a8468`. Single agent. No merge, push or deployment. Claude/main source and the other worktrees preserved.

## Implemented

- Existing four workspaces retained. Tools and Timeline toggle independently in a slim layout row, with separate per-workspace local preferences. Tools folds the drawing tool/part/colour controls and brush sliders, retaining undo/redo and paint target. Timeline folds that workspace's timeline and audio lane without changing the clock, content or playback. Quick Animate ignores these folds to preserve its essentials. Draw's Brush/X-sheet panel now opens explicitly on desktop too; Time still opens X-sheet by default. No shared-model/timing edits.
- Motion's existing extra auto-key, easing, camera-view and zoom/row controls now sit in a remembered native disclosure. Layer/transport/group controls and existing property twirls remain available. This is organization, not a new effects engine.
- Export and finish gathers existing formats, with a new real looping GIF exporter and preview/Save GIF link. Existing direct export routes remain. Storyboard export is unavailable until a board exists. See [export contract and limits](export-format.md).
- GIF uses the shared main-shot compositor and residency, with bounded output and frame-by-frame yielding/cancellation. No dependencies or .2dope schema changed. Fixed RGB332 palette/opaque white background, no audio; max 15 seconds, about 12 samples/sec, 480 px Full / 320 Lite. Explicit conservative 24/12 MiB caps can reject high-area clips below 15 seconds. Simple literal/reset LZW favors predictable implementation/memory over compression; better quantization/compression is a separate future improvement.

## Verified now

- **276 tests / 30 files pass**; strict TypeScript + production build pass. GIF tests independently decode LZW across clear/sub-block boundaries, check palette/header/loop metadata, main-comp selection, Lite sizing, budget rejection, cumulative delays, frame sampling, abort and pin/read-failure cleanup. Existing shared timing/history/archive tests remain passing.
- Production desktop Chromium, isolated origin `127.0.0.1:5202`: created disposable 1280×720/12fps/24-frame project, painted a dot; folded tools and timeline independently, retained Undo; Motion extra disclosure exposes auto-key; returning to Draw restores its own folds; reload retains preferences and art. Brush panel opens on desktop. Quick Animate retains its strip despite regular timeline folding, and exiting restores the prior fold.
- Real GIF rendered, browser preview decoded **480×270** successfully; Save GIF produced `D:/Downloads/Workspace-export-QA.gif`, **3,528,321 bytes**, 24 frames / 2 seconds. Browser download helper unexpectedly took about 14 minutes despite its timeout argument; avoid repeating it. This checks an actual GIF, not just a UI success message.
- Embedded 390×760 layout (`qa/workspace-layout.html`): normal Tools/Timeline/Export controls reachable; Export button right edge 260 px within 390 px; export hub readable. Narrow entry defaults to existing Quick Animate; Menu provides export access and exit. Narrow same-origin tab was closed to avoid simultaneous autosave.
- Cancellation is covered by lifecycle tests. A browser cancellation click missed because the short GIF finished before the click; do not claim a manual cancellation demonstration. No physical iPad/Pencil/Safari or memory-pressure verification, no fresh MP4/Blender/PNG/archive round trip in this task. Their exporters were routed, not rewritten. The prior combined-review limits still apply.

## Integration

Review this branch on top of `codex/integration-review`. Do not apply directly to an older Claude main without including/reconciling the integration features first. Relevant files: `main.ts`, `index.html`, `style.css`, `ui/motion.ts`, `ui/exporthub.ts`, `io/gif.ts`, `io/exportgif.ts`, the two GIF tests, manual/update text and export docs. Layout preferences are device-local only. Root handoff links here; no merge/push authorized.
