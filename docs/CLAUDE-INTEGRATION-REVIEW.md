# Combined feature review — 2026-10-16

## Review location and safety

Checkout: `E:\2026\Dev\Apps\2Dope\codex-integration`.
Branch: `codex/integration-review`, started from freshly fetched `origin/main` at `7e275ac`. Main still has the same application baseline; its pending documentation and Claude's work were not replaced. This branch has no upstream configured, and nothing was pushed, merged into main or deployed.

## Included work

| Original feature commit | Integration commit | Contents |
|---|---|---|
| `5caf0aa` | `ad882d7` | Spatial lasso selection, direct selected-area fill, bounded region/Leftovers filling |
| `82d9100` | `7658928` | Paint-target cue, shared layer folding/group entry, stage-fitting sidebar |
| `9fe07f9` | `88694f8` | Line selects vector Pen; Fill selects Bucket Tap/drag, including same-part resets |
| `65cf3e1` | `4868ec2` | Ellipse/line precision fixes, nested rail entry, geometry regressions |
| `1104e93` | `d566836` | Cached stereo waveforms, independent sound IDs/edits, Board audio rows, audio export/preflight fixes |

The selection branch is already an ancestor of UI clarity; its feature was included once. Cherry-picking QuickShape required resolving `HANDOFF.md` by preserving both reports and `ui/rails.ts` by keeping exactly one group-entry click handler. Manual and audio/CSS changes combined automatically and were checked in the build. No application behavior was rewritten to resolve the overlap.

Copied all 11 pending research Markdown documents from main into this review checkout byte-for-byte and verified matching hashes, preserving their originals. They are historical evidence/proposals, not implementation status. Start at [manual queue](MANUAL-REA-QUEUE.md), [layers/UI study](LAYERS-MASKS-AND-UI-STUDY.md) and [selection/transform study](SELECTION-TRANSFORM-MANUAL-STUDY.md). Earlier branch handoffs remain intact; their separate/not-integrated status is superseded only for this review branch.

## Fresh verification of the combined build

- **264 tests across 28 files passed.** Strict TypeScript + Vite production build passed. Diff whitespace check passed. Used the existing lockfile, no dependency upgrades.
- Production browser: desktop Chromium, separate origin `http://127.0.0.1:5201`. Test project Integration QA, 1280×720, 12fps, initial drawing held 24 frames. Pointer fixtures are scripted pen events through normal input handlers, not physical Pencil evidence.
- Line control selected vector Pen; scripted 4:1 oval snapped to Ellipse. Fill control selected Bucket; a lasso bounded its region fill to the mask on that same artwork. Mouse undo/redo worked; target showed Fill and artwork survived reload.
- Imported the generated 2-second stereo `qa/integration-sound.wav` twice. Board rendered distinct clip IDs **a1/a2** at separate vertical rows (36px apart). First clip: Start 1, Source in 0.25s, Source out 2s, Volume 35%. Second: Start 5, Source in 0s, Source out 2s, Volume 70%. Reload retained those independent values and two waveforms. Waveforms remained visible with both Settings folded.
- With Audio expanded and both settings edited, undo/redo centers hit their own buttons and stayed inside the stage. Earlier focused UI branch also checked narrow/Lite/Quick Animate; those broader checks were not all repeated here.
- Created a storyboard through existing Board controls; its Timeline showed separate audio rows. Existing Motion Group placed Drawing in Character, leaving the Board guide/audio in the parent comp. Draw entered through the rail, showed `Shot › Character › Drawing`, and shared Line/Fill folding with Layers. Part Fill selected Bucket. Draw → Time → Motion → Draw retained nested context; breadcrumb returned to the parent with both clips. Playback advanced the shared playhead and paused normally. First-frame composed artwork rendered in Motion and Draw.

Reproduce the pen fixtures by serving the checkout root, opening `qa/quickshape.html` or `qa/selection-fill.html`, and creating a disposable test project. The QuickShape fixture was resized to fit the test viewport. The stereo WAV is a generated sine signal with varying amplitude, not third-party audio.

## Limits to retain in review

- Native `.2dope` download observation timed out in browser automation. **No archive download/import round trip was verified for this combined build.** Unit serialization/audio-ID tests and browser autosave/reload passed; previous audio-only archive/export results remain historical.
- QA logs captured an unattributed `MutationObserver.observe` Node-type error without source URL/stack, also seen in earlier branch checks. Tested flows completed; do not claim a clean console or assign the error to app/browser without evidence.
- No fresh MP4/WebM export, Safari/iPad/Pencil, physical audio sync, memory-pressure or mobile-hardware check. Existing audio/video unit tests passed; earlier real exports are not new integration evidence.
- No new transforms, warp, clipping masks, brush import, media decoder, timeline model or Rust runtime. Original nested-time semantics and device budgets were reused, not broadly revalidated.

Screenshots are in `C:\Users\dusto\.codex\visualizations\2026\10\15\01a13dd1-cb7e-7621-aad1-e96932098649`: `2dope-integration-art-check.png` (nested artwork/target) and `2dope-integration-review-check.png` (parent composition with both waveforms).

**Stop point:** combined code is available for review on this branch. Confirm archive round-trip/device behavior before release; main integration and deployment are separate actions.
