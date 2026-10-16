# Shape precision and nested drawing entry

2026-10-15 · branch `codex/quickshape-precision` · based on `main` at `7e275ac`

Worktree: `E:\2026\Dev\Apps\2Dope\codex-quickshape`. This is separate from Claude's `beta/main` and the completed `codex/audio-waveforms` worktree. No merge, push or deployment requested or performed.

## User intent and existing features

The user wants a balance of approachable drawing, nested flipbook/rail editing, easy Motion looping and precise timing. The app is already built. This change fixes demonstrated QuickShape geometry problems and connects an existing nested-editing path; it does not introduce a replacement timeline or claim reference-app parity.

Source inspection found existing Flipbook blank-page creation, frame/drawing stepping, holds, split, onions and scrub lock. Motion already exposes precomp Go inside/Ungroup and Once/Loop/Ping-pong/Single/Speed. These are retained, not rebuilt. The new entry point lets Draw/Time rail names open a top-level nested comp through `CompEditor.enter`; the existing global breadcrumb returns to the shot. It refuses entry during a live drawing stroke.

## Reproduced precision faults and fixes

| Reproduction | Before | Now |
|---|---|---|
| Exact 2:1 oval, intended radii 120/60 | Automatic radii approximately 110/64.6 | Approximately 119.99/60.00 |
| Exact 4:1 oval, intended radii 120/30 | Automatic recognition can return Polygon; explicit Ellipse approximately 103.4/33.6 | Recognized as Ellipse; approximately 119.99/30.00 |
| Nearly straight stroke with a shaky last point | Line direction comes directly from the two endpoints | Whole-stroke principal-axis fit reduces endpoint-angle bias |
| Rectangle choice on a rotated square | PCA direction is unstable when axes have equal variance | Reuse detected edge geometry for recognized rectangles/squares |

`core/quickshape.ts` fits ellipse boundaries with a normalized five-parameter conic and a small pivoted solver. The previous PCA radius formula described point distribution, which is biased by uniform distance sampling on elongated ellipses. Invalid/non-elliptic/degenerate fits are rejected. Automatic and explicit Ellipse use the same fitter; pressure, shape constraints, rendering, one-step Edit shape replacement and file format stay on their existing paths. Closed-stroke Line conversion uses the fitted axis extent rather than collapsing to almost coincident endpoints.

Five new regression tests cover aspect ratios 1/2/4/6 at several rotations, contour geometry, noisy narrow ovals, endpoint wobble/direction reversal, rotated square orientation, and degenerate/closed conversions. Existing scribble, polygon, arc, rectangle, pressure and constrain cases still pass.

## Manual evidence and remaining work

[Procreate QuickShape](https://help.procreate.com/procreate/handbook/guides/quickshape) documents draw-and-hold recognition, perfect forms, scaling/rotation and post-release edit nodes. It establishes behavior, not our fitting algorithm. Earlier project studies document Dreams Flipbook and mini Flipbook. No binary analysis or broad manual reread was needed.

Still not implemented in this slice: post-release draggable shape nodes, a floating/vertical mini Flipbook, a dedicated embedded editor inside every rail, arbitrary drawing sublayers, cross-rail transfer, audio scrubbing, or full reference-app gesture parity. These remain separate reviewed changes. Existing nested enter/exit time mapping for loops/speed/time-remap deserves a precise round-trip contract before a larger nested editing redesign; checking playback setting retention is not proof of every clock mapping.

## Verification

- **250 tests across 26 files passed; production build passed** (strict TypeScript + Vite). Whitespace check passed. These counts are for this branch, not the separate audio-polish branch.
- Production app served on a separate loopback origin. `qa/quickshape.html` supplies labeled scripted pointer fixtures against the actual app iframe: draw narrow oval / noisy line, wait through the existing hold timer, release through the normal handler. These are synthetic pen inputs, not physical-device measurements.
- Browser: raster oval recognized as Ellipse; vector noisy line recognized as Line; Keep my stroke, Circle conversion and undo/redo worked. Saved drawings reopened.
- Browser: create precomp via existing Motion action → Draw → tap group name → edit nested frames → breadcrumb back. Loop and 0.5× speed remained selected after entering/exiting and reload. No new playback controls were introduced.
- One captured browser `MutationObserver.observe` error lacked source attribution. App source has no direct observer; the built entry includes Vite's module-preload observer, which observes `document`. Observed app flows completed, but the error's originating call/stack was not established. Attribution remains unresolved; this is not a clean-console result.
- Evidence screenshot: `C:\Users\dusto\.codex\visualizations\2026\10\15\01a13dd1-cb7e-7621-aad1-e96932098649\2dope-precision-nested-check.png`.
- Physical iPad/Pencil/touch feel, Safari, responsive layouts and production deployment were not checked. Desktop geometry tests do not prove that precision matches Procreate on a device.

To repeat the browser fixture: build, serve this worktree with a loopback HTTP server, open `/qa/quickshape.html`, create a test project, and use its two fixture buttons. Preserve real libraries; do not clear browser storage.

## Integration

Inspect live changes before integrating. This branch changes `core/quickshape.ts`, its tests, `ui/rails.ts`, the manual/update notes, and adds the QA fixture plus this handoff. The audio-polish branch independently edits the manual; preserve both sets of notes during integration. Review before any main push, which deploys Pages.
