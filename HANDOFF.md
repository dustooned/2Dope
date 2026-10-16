# 2Dope maintenance handoff

## Current state (2026-10-16)

`main` at `542be38` is pushed. Everything Codex built is merged: spatial selection and fill, paint-target cues and shared layer folding, Line selects Pen / Fill selects Bucket, QuickShape precision, audio waveforms, per-workspace Tools/Timeline folding, the Export and finish hub with GIF export. Claude added optional **hear-while-scrubbing** (box in the Audio lane, off by default). The per-feature Codex branches and worktrees were deleted; their reports stay in `docs/CLAUDE-*-HANDOFF.md` as history.

- Checked after the merge: 276 tests and the production build. In desktop Chromium: audio scrub (slices only while scrubbing, none after release), `.2dope` export and re-import (clip, sound and drawings kept), MP4 export with audio decoded.
- Still not checked: iPad/Apple Pencil/Safari, memory pressure on weak devices, Blender import. An unattributed `MutationObserver.observe` error appears in some QA logs.
- **Not built yet:** selection transform and warp, clipping masks, effect stacks, brush tips and `.abr`/`.brushset` import, a free-arrangement timeline with cross-rail moves, general media/video import, Rust desktop.

**Design studies (evidence and proposals, not features):** [layers/masks/UI](docs/LAYERS-MASKS-AND-UI-STUDY.md), [selection/transform](docs/SELECTION-TRANSFORM-MANUAL-STUDY.md), [manuals vs source](docs/MANUAL-TO-SOURCE-COMPARISON.md), [timeline/media/UI direction](docs/TIMELINE-AND-MEDIA-DIRECTION.md), [art effects and clipping](docs/ART-EFFECTS-DIRECTION.md), [brush import](docs/NATIVE-BRUSH-IMPORT-DIRECTION.md). The free-timeline request needs concrete changes confirmed before structural work; do not treat the standalone timeline mockup as a spec.

Prepared 2026-10-14; updated 2026-10-16 so another assistant can continue without a previous chat.

## Start here

- Workspace: `E:\2026\Dev\Apps\2Dope`.
- **Application and Git root:** `E:\2026\Dev\Apps\2Dope\beta`.
- `reference/` beside it contains separate Craft reference projects, not the app or its dependencies.
- Read `AGENTS.md`, then `ARCHITECTURE.md`, then relevant source. Preserve user/Claude edits visible in `git status`.
- Current source, tests, and manual are stronger evidence of present behavior than an early milestone paragraph or a proposed feature study.

## Checked baseline

The repository began this review clean on `main`, at `92bb08fcd42dc30dd5727cdcdf6593fab995b4f0` (2026-10-14): Motion end trims keep the board and animation in step. Upstream status was local Git information; the remote/deployed site was not checked.

Recent preceding work includes two-way Board/Draw timing, adding/retiming/deleting the last panel, deleting the first panel without shifting animation before frame 0, repaired older files, Time's frame bar, Draw's Split/touch selection, and finishing interrupted pointer strokes.

Environment: Node `v24.20.0`, npm `11.19.0`, existing installed dependencies and lockfile. CI uses Node 22. No dependency upgrades or clean reinstall were performed.

| Check on 2026-10-14 | Result |
|---|---|
| `npm test` | 21 files, **212 tests passed**. |
| Initial `npm run build` | Failed on an unescaped apostrophe in `src/ui/manualtext.ts`, in the update note about a layer's end. |
| Build after the one-line fix | **Passed:** strict TypeScript check and Vite production output. |
| Production browser smoke check | **Passed** in desktop Chrome on a separate loopback origin; scope below. |

The sole application-code change in this review escapes that apostrophe. The displayed sentence is unchanged. Other changes document the current implementation and maintenance workflow. This baseline describes the local review; consult Git history and GitHub Actions for subsequent commits and deployment status.

## Run and check

Run from the application root in PowerShell:

```powershell
Set-Location 'E:\2026\Dev\Apps\2Dope\beta'
git status --short --branch
npm test
npm run build
```

For a clean install use `npm ci`. For editing use `npm run dev`: port **5180** by default, but read Vite's printed URL if busy. Claude's `.claude/launch.json` explicitly uses **5181** with `--strictPort`.

To check a production build on a separate origin:

```powershell
npm exec -- vite preview --host 127.0.0.1 --port 5182 --strictPort
```

`npm run dev:lan` enables the HTTPS LAN configuration for device testing; it is a development server. `dist/` and `node_modules/` are ignored/generated. Edit source and rebuild. Pushing `main` triggers `.github/workflows/pages.yml`: Node 22, `npm ci`, tests, build, GitHub Pages deployment.

Browser libraries are tied to their origin. `localhost`, `127.0.0.1`, different ports, and the deployed site have separate libraries. Keep the same origin to see an existing library, or transfer an exported `.2dope` file. Avoid clearing site storage while investigating a missing project.

## Current product

A browser-based 2D drawing, animation, and storyboard app intended for pen/touch as well as desktop:

- **Board:** guide-layer panels, captions, duration, animatic playback, Animate this shot, PDF or PNG/CSV export.
- **Draw:** raster/vector pen, eraser, fill, Line/Fill planes, brush dynamics/smoothing, QuickShape, layers, flipbook, onion skin, Quick Animate.
- **Time:** X-sheet, holds, drawing selection/order/roles/notes, frame bar, shared time formats and ripple timing.
- **Motion:** layers, transforms, keyframes/easing, parenting/nulls/camera, precomps, pins/overrides and playback modes.
- **Projects:** local IndexedDB library, folders, autosave, versions, standalone `.2dope` files, Lite/device limits and parked drawings.
- **Output/help:** PNG frames and sequence passes, storyboard PDF/images/CSV, Blender package/importer, searchable student manual and update notes.

No application backend is present. Raster planes are saved as pixels; vector strokes retain point data. Do not assume raster stroke replay/editing survives a file round trip.

## Where to make a change

| Request | Start with | Related checks |
|---|---|---|
| Pen feel, smoothing, QuickShape, interrupted strokes | `src/app.ts`, `src/brush/`, `src/core/brush.ts`, `src/core/quickshape.ts` | Core/ink/stabilize/QuickShape tests; real pen and cancellation gestures. |
| Fill/eraser, Line/Fill | `src/fill/fill.ts`, `src/app.ts`, `src/core/vectorcut.ts`, `src/view/composite.ts` | Fill tests; canvas output, undo, saved images. |
| Exposure, Board sync, insert/delete/hold/ripple | `src/core/timeline.ts`, `src/core/ripple.ts`, `src/app.ts`, `src/compedit.ts` | Timeline/ripple/editor tests; the same edit across workspaces and undo/redo. |
| Board cards/captions/export | `src/ui/board.ts`, `src/ui/boardexport.ts`, `src/io/storyboard*.ts`, `src/io/pdf.ts` | Storyboard tests; actual exported PDF/images/CSV. |
| Layers, keys, camera, precomps | `src/compedit.ts`, `src/core/comp.ts`, `src/core/anim.ts`, `src/ui/motion.ts` | Editor/comp/anim tests; composed playback/export. |
| Save/open, versions, gallery, file format | `src/ui/files.ts`, `src/ui/gallery.ts`, `src/io/{schema,projectio,persist,autosave,zip}.ts` | IO/autosave tests; browser reload and standalone file round trip. |
| Memory/older devices | `src/core/residency.ts`, `src/core/device.ts`, `src/view/` | Residency/device tests; target-device stress testing. |
| Blender | `src/io/blender.ts`, `src/io/blenderpack.ts`, `blender/2dope_import.py` | Planning tests; import/render in intended Blender version. |
| Layout/controls/manual | `index.html`, `src/main.ts`, `src/style.css`, relevant `src/ui/` | Build and desktop/touch-width flows; update the manual when behavior changes. |
| Draw/Time timeline rails | `src/ui/rails.ts`, `src/ui/strip.ts` | Rows follow comp order and the strip's cell width; the editable row keeps the strip's own pointer logic. |
| Audio | `src/core/audio.ts`, `src/audio.ts`, `src/io/sound*.ts`, `src/ui/audiotracks.ts`, `src/io/exportvideo.ts` | Audio tests; import, playback sync, save/reload, video export with sound. |

## Invariants

1. One document/clock across workspaces. Layer keys/exposures use layer time; start/in/out use comp time. Reuse timing/content-frame functions.
2. One undo step per gesture. Preview, cancel, undo, and redo must preserve document state and autosave/render notifications.
3. Parked drawings have no live pixels. Use residency for canvas access, declare pixel-dependent command drawings, and preserve assets needed by history.
4. Fill stays under ink. Guide boards stay out of final export unless included. Check both plain-flipbook and compositor export paths when relevant.
5. File schema 2 and IndexedDB version 2 are separate. Breaking file changes need migration; standalone archives need every referenced asset's bytes.
6. Brush randomness stays seeded, predicted points are never committed, and interrupted pointers must finish/cancel their stroke so frame changes cannot stay blocked.
7. Device limits, touch workflows, and the student manual are product requirements.

## Browser verification scope

Desktop Chrome, production build at `http://127.0.0.1:5182/`, a new `Codex maintenance check` project at 1280-by-720 and 12 fps:

- First-run New project dialog rendered and created the named project.
- Added a frame (1 -> 2), undid it (2 -> 1), redid it (1 -> 2).
- Board, Time, and Motion controls rendered; Time/Motion showed the same two-frame shot.
- What's new rendered the repaired sentence correctly.
- Reload reopened the named project and both frames from browser storage.
- A mouse stroke drew on the canvas; after autosave and reload, it visibly reopened intact.
- No warning/error console entries were captured during the checks. A screenshot was saved outside the repository in this chat's visualization directory.

This is a smoke check, not full regression coverage. Tests include mock App/canvas/storage components. `docs/test-report-m1.md` and `docs/blender.md` describe historical checks, not new device/Blender verification from this review.

## Open work and evidence gaps

- **Video export** exists (Quick Share MP4/WebM with audio, plus looping GIF). A higher-quality transparent export is still queued in `DECISIONS.md`; confirm formats and devices before building it.
- **Latest timing fixes need repeatable browser regression coverage:** both ends of layers, two-way board/animation synchronization, undo/redo. Pure timeline/ripple tests include first-panel deletion, but there is no checked-in end-to-end browser runner.
- **Real iPad/Apple Pencil checks remain necessary:** pressure/tilt, palm rejection, touch conflicts, playback feel, long-project memory. Desktop/mocked tests do not establish these results.
- **Blender import/render was not rerun.** `docs/blender.md` records earlier checks and simplifications: non-normal blend modes, animated anchors, nested cameras, combined Line/Fill images.
- **PDF Unicode is limited:** the custom PDF writer uses WinAnsi; unsupported characters become `?`. PNG/CSV export preserves text.
- **Version labels:** `package.json` and `APP_VERSION` in `src/io/projectio.ts` both say `0.0.2` (reconciled 2026-10-15). Neither is the schema version.
- **Large coordinating files:** `app.ts`, `compedit.ts`, `ui/motion.ts`. Keep fixes narrow; preserve command, event, timing, and residency boundaries during any later extraction.
- **Historical future-tense documentation remains:** README milestone prose, format examples, the old test report, feature studies. Earlier memory findings were followed by residency work and should not automatically be treated as current defects.

Proposals in `docs/feature-deconstruction/` (audio, shot organization, masks/effects, drawing assists and more) are design studies. They do not establish a new implementation request or current feature support.

## Next-session prompt

> Continue 2Dope in `E:\2026\Dev\Apps\2Dope\beta`. Read AGENTS.md, HANDOFF.md and ARCHITECTURE.md, check git status for concurrent changes, then implement the requested adjustment within the existing architecture. Preserve shared timing, undo/autosave, residency, device limits and file compatibility. Run relevant tests and the production build, verify the affected browser flow, and distinguish new verification from historical reports.
