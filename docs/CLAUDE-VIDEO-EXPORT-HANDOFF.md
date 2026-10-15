# Claude handoff: Quick Share video export

Prepared 2026-10-15. The user asked Codex to continue the queued video export while keeping Claude's checkout clear, and separately requested an urgent touchscreen undo fix and push.

## Checkout and delivery

- Main app: `E:\2026\Dev\Apps\2Dope\beta`, branch `main`.
- Feature worktree: `E:\2026\Dev\Apps\2Dope\codex-video-export`, branch `codex/video-export`.
- Feature base includes `3e71d9a02e6dd192d4534ff8ff6ff39565bb0bd2`, the deployed touchscreen hotfix. Find the feature commit with `git log --oneline main..codex/video-export`.
- Video export is prepared for review on the feature branch. It has not been merged into main or deployed. Do not copy files between checkouts or reset Claude's work to integrate it.
- Production preview used its own origin, `http://127.0.0.1:5183/`; Claude's launch configuration uses 5181. Test projects were created on the separate preview origin; existing user libraries were not cleared.

## User-facing change

Menu > Export video produces a silent MP4 (AVC/H.264) or WebM (VP9, falling back to VP8). Users choose 720p, 1080p or Original size, Standard/High quality, and white/black beneath transparent areas. Export displays progress, supports cancellation, then offers a native video preview and Save video download. Unsupported configurations explain smaller/alternative-format/PNG-sequence options.

It exports the main shot at its own frame rate even while editing a nested comp. Every frame is composed, including holds, with layers, parts, moves, precomps and camera. Export uses the existing guide inclusion flags, so the storyboard stays out unless the existing Include the storyboard setting is enabled. No onion skins or drawing-view overlays are included. Aspect ratio is preserved without upscaling; codecs receive even dimensions with at most small symmetric padding.

## Implementation map

| Files | Responsibility |
|---|---|
| `src/io/videoplan.ts`, `.test.ts` | Validate device preferences, choose main comp, calculate dimensions/bitrate/timing and reject oversized estimates. Six tests. |
| `src/io/exportvideo.ts`, `.test.ts` | Probe the actual encoder configuration, compose and encode offline with backpressure, residency pins, cancellation and cleanup. Nine tests. |
| `src/ui/videoexport.ts` | Modal settings, capability messages, progress/cancel, preview/download and object-URL lifecycle. |
| `src/main.ts`, `index.html`, `src/style.css` | Menu integration and responsive dialog styling. |
| `src/ui/manualtext.ts` | Export instructions and 2026-10-15 release note. |
| `package.json`, `package-lock.json` | Exact `mediabunny@1.61.4` dependency; existing dependency versions preserved. |
| `public/third-party/` | Bundled Mediabunny license and source-availability notice. |
| `ARCHITECTURE.md`, `README.md`, `HANDOFF.md` | Code map and handoff navigation. |

Mediabunny wraps browser WebCodecs and muxes the encoded packets. It is dynamically imported when checking/exporting video; its production chunk is about 223 KB (58 KB gzip). This avoids recording real-time playback and dropping frames when a device runs slowly. MP4 uses `fastStart: false` so packets are written as they arrive instead of retaining all encoded packets for a later fast-start pass. Completed downloads still preview and seek; progressive network playback optimization is outside this slice.

Source and license: the unmodified npm package includes its TypeScript source and MPL-2.0 license. `public/third-party/NOTICE.txt` links the exact package archive. The lockfile also corrects stale root package metadata (`beta@1.0.0` to the existing `2dope@0.0.1`). No unrelated package upgrade was made.

The plan rejects estimates above 64 MiB, or 32 MiB in Lite mode. Actual output writes also enforce that limit. These are encoded-output limits, not a guarantee that the entire browser's RAM stays below that amount; canvases, decoder/encoder internals, residency and buffer copies also consume memory. Larger exports should use lower settings or the PNG sequence path.

Residency is acquired frame by frame through `frameContent`, including nested references. Every acquired pin is released even when decoding fails. A cancel signal cancels the output; failures, constructor errors and normal completion release the export canvas and compositor scratch resources. The modal blocks editing and owns its keyboard controls. Export does not move the playhead or modify history, project storage, file schema 2 or IndexedDB version 2. Only per-device export preferences use a new localStorage key, `2dope.video-export`.

## Verification performed

- `npm test`: **24 files, 236 tests passed**. This includes the nine deployed touch-context tests and fifteen new video tests.
- `npm run build`: **passed**, including strict TypeScript and production bundling.
- Desktop Chrome production preview: exported and saved actual MP4 and WebM files from a 1280×720, 12 fps, 24-frame shot with two held drawings. Native preview reported 2 seconds, 1280×720 and no media error; seeking showed the changed final drawing. White MP4 and black WebM were exercised.
- Parsed those downloaded files with Mediabunny's demuxer: MP4 AVC and WebM VP9, each with **24 encoded video packets and 2-second duration**. Presentation timestamps follow 12 fps (WebM rounded to its millisecond timebase).
- A 720-frame WebM run was cancelled while encoding. The cancellation message appeared and settings/export controls were usable again; no partial download was offered.
- In-app Chromium production preview: entered a nested comp, changed its rate to 24 fps, and exported while still inside it. The export summary used the outer shot's 12 fps; the resulting preview reported its planned 1-second duration, 1280×720 and no media error. The existing automatic comp-length calculation changed the parent's length after the nested timing edit; video follows that model calculation.
- At a temporary **390×844 viewport**, settings and completed preview/save controls fit the dialog. The viewport override was reset afterward. This is layout verification in Chromium, not a physical phone test.
- No app warning/error entries were captured during the desktop Chrome checks. Browser-tool telemetry failures in the in-app browser were unrelated to 2Dope.

Local QA artifacts are in `C:\Users\dusto\.codex\visualizations\2026\10\15\01a13dd1-cb7e-7621-aad1-e96932098649`: `2dope-export-sample.mp4`, `2dope-export-sample.webm`, `2dope-video-mobile.jpg`, `2dope-video-ready.jpg`. They are review evidence outside Git, not application dependencies.

## Touchscreen hotfix already deployed

Commit `3e71d9a02e6dd192d4534ff8ff6ff39565bb0bd2` (`fix(input): keep touchscreen undo out of context menus`) was pushed to main on the user's explicit urgent request. GitHub Pages run [38683629416](https://github.com/dustooned/2Dope/actions/runs/38683629416) completed successfully. The feature branch already contains it.

`src/ui/touchcontext.ts`, installed in `App.bindEvents`, suppresses native/app context menus during multi-touch and for one second after release/cancellation. Intentional physical mouse/pen secondary presses and keyboard menu requests have exceptions. Non-passive canvas touchstart cancels the browser's multi-touch default; Pointer Events still handle app gestures. Nine regression tests and the then-current 221-test suite/build passed. Desktop Chrome preserved intentional mouse right-click. Physical touchscreen confirmation remains a user/device check.

Earlier maintenance commit `1ce6c29` repaired the manual string syntax that had blocked the production build and added the baseline maintenance docs; its Pages run [38682548165](https://github.com/dustooned/2Dope/actions/runs/38682548165) succeeded.

## Review and integrate safely

1. Check `git status --short --branch` in both checkouts and inspect `git log --oneline --all -8`. Preserve any later Claude/user edits. Main may have advanced since this handoff.
2. Review the feature diff against its base (`git diff 3e71d9a..codex/video-export`) and the new dependency. If main advances, integrate that work on the feature branch and rerun checks; resolve overlapping manual/menu/style changes deliberately.
3. Run `npm ci`, `npm test`, `npm run build` in the feature worktree for a fresh checkout. The development dependency audit findings reported during installation predate this feature; review Vitest/tinypool/mocker separately without an indiscriminate audit fix.
4. Test on a real iPad/Safari and the intended touchscreen browser: MP4 availability, preview/save, cancel, app responsiveness, then two-finger undo, three-finger redo and pinch with no unwanted context menu. Desktop Chromium does not establish these device results.
5. Merge/push main only as the coordinated release step; a main push runs the GitHub Pages deployment workflow. This feature branch alone does not change the live app.

## Next proposed slice

After video integration and device checks, timeline audio is the next substantial queued feature: local audio import, one basic audio track with offset/trim, playback sync and export muxing. Read the existing audio feature study before changing the project schema. Transparent video, audio, streaming very large exports, project ranges and shots/sequences organization are not implemented by this slice. PNG sequences remain the transparent production output.
