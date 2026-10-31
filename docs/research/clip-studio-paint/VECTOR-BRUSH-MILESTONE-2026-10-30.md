# Editable vector brushes: implemented milestone

2026-10-30. Implemented locally in 2Dope; uncommitted and unreleased. This continues the
[Claude assignment](../../CLAUDE-VECTOR-BRUSH-HANDOFF.md). The [REA study](VECTOR-BRUSH-REA-2026-10-30.md)
remains reference evidence; this is original code, not a recovered modern CSP engine.

## Recovered starting point

Claude session `fc2bb431-0754-4284-a884-cf7fc33e8042` ended after reading the implementation and
drafting architecture notes. There was no unfinished application code to merge. The notes were
recovered from the session's Write-tool input because its side-session notes file was absent.
Used the useful renderer/channel/control findings; replaced the proposed unbounded global PNG
registry with portable bounded alpha snapshots and bounded render caches.

## Delivered behavior

- One editable path can use expressive ink, an oriented chisel nib, original dry/pencil material,
  spaced dots/dashes or a custom image tip. The existing library has a Vector collection; Studio
  supports the new modes and hides unused raster settings. Custom recipes save in My brushes.
- Stroke snapshots are independent of the current or deleted library entry. Custom tips decode
  at import into synchronous alpha data, packaged in projects and My Assets.
- Apply brush to lines previews a point-edited line or complete selected paths. It preserves
  color, pressure, recorded speed and weight by default; brush defaults optionally replace weight,
  local width and taper. Uniform transformed weight is preserved exactly; nonuniform weight uses
  the square root of the absolute matrix determinant. Restyle establishes a new distance domain.
  The detached preview cannot enter autosave, and commits one context-guarded History step.
- Canvas selections clip complete visible marks, including scatter and nib overhang. A restricted
  restyle keeps the original brush outside the selection. Completely invisible strokes create no
  record/History step; a visible overhang is retained even if its path centre is outside.
- Authored anchor indices, corner modes and handles persist and restore on undo/redo/load. Geometry
  remains sampled and editable; legacy paths are never refitted on open.
- Cut interpolation retains pressure, tilt, time, width, material distance and recorded speed.
  Sparse stroke/eraser segments intersect geometrically. Material grid indices and seed identity
  remain stable on surviving fragments. Styled whole/intersection erase uses a conservative nib,
  scatter and width envelope, with saved-clip-aware hit checks; it does not inspect every tip hole.
- Rotation, reflection and nonuniform stretch transform the whole mark in canonical coordinates,
  including clips and authored handle offsets. A selected restricted stroke can move even when its
  hidden path extends beyond its stencil. Point edits stretch the existing material domain.
- All existing vector consumers retain `drawVectorStroke`: legacy appearance remains its original
  function; new marks use union ink/chisel coverage or deterministic material dabs. Whole-stroke
  opacity composites once. Fill uses visible alpha and the existing Close gaps setting.

## Owning sources

| Area | Files |
| --- | --- |
| Domain, captured channels, validators, transforms | `src/core/vectorstyle.ts`, `stroke.ts`, `brush.ts` |
| Legacy dispatch and new coverage renderer/cache | `src/brush/vector.ts`, `vectorstyled.ts` |
| Channel-preserving eraser/clips and whole-mark selection | `src/core/vectorcut.ts`, `vectorclip.ts`, `selxform.ts` |
| Creation, persistent point controls, restyle commands | `src/app.ts`, `src/ui/vectorrestyle.ts` |
| Existing library/Studio integration | `src/core/brushlib.ts`, `src/ui/brushlib.ts`, `panel.ts`, `commands.ts`, `src/style.css` |
| Conditional schema 4 and portable project capture | `src/io/schema.ts`, `projectio.ts` |
| Regression and review specimen | `src/core/vectorstyle.test.ts`, `src/io/io.test.ts`, `src/brush/vectorbrushes*.browser.ts`, `tests/vectorbrushes*.html` |

The project/export format and architecture documents describe exact fields and limits. The manual
and UPDATES explain the user workflow. The fixture runner now prints measured performance rows.

## Actual validation

`npm test`: **68 files / 559 tests passed**. `npm run build`: passed; existing >500 kB chunk warning
remains (main chunk approximately 761 kB / 240 kB gzip). `git diff --check`: no whitespace errors.

Complete Chromium suite on isolated `http://127.0.0.1:5230`: **37/37 fixtures passed**. New specimens
passed **46 checks each** on desktop and a 390×844 iframe. These cover:

- Legacy dispatch versus the unchanged original renderer at 25%/50% opacity; deterministic replay
  and self-crossing opacity caps for all four visible styles.
- Actual production pen input, authored point drag/mode/handle persistence, project capture/model
  reload and correct undo/redo/autosave callbacks.
- Detached preview, cancel, apply, stale-frame refusal, kept weight after scaling and restrictions
  that preserve the original brush outside the canvas selection.
- Wide/scattered selection-edge clipping, reflection, nonuniform chisel footprint, invisible
  strokes, visible tip overhang and cache invalidation after geometry edits.
- Actual image-file import through Brush Studio, existing brush-store round trip, library deletion,
  and identical portable-tip pixels on a separate `localhost` storage origin with different pen
  settings. Desktop synthetic input does not establish physical pressure feel.
- Exact shared-compositor and PNG Lines parity, styled vector layer-mask/nested playback coverage,
  nested PNG export and standalone My Assets packaging.

Stress measurements in that run: an uncached 1,500-point dry line took median **8.9 ms**, worst
**11.6 ms**, across eight renders. Twelve dense material lines took median **1.4 ms/frame** after
coverage caching, with a cold/worst frame of **107.8 ms**. Before caching, the same playback specimen
measured about **163 ms/frame**. Browser timings vary; the cold-frame cost remains a real limit.

## Limits and follow-up scope

The scratch surface holds about one million pixels, maximum side 2048. Large/high-zoom marks can
soften at that resolution. Committed coverage is an LRU of at most 16 records / 2,097,152 pixels
(8 MiB RGBA); decoded tips use a 16-entry LRU. The commit visibility check reads at most 512² pixels
at once. Clips allow 16 restrictions and 65,536 spans each. Styled lines allow 20,000 samples and
12,000 material marks; very long paths capture expanded spacing. Inline resources/control state
have a 64 MiB project estimate, checked before edits and at file validation. Inline repetitions can
increase JSON size. Canvas pools and residency keep their existing limits.

Advanced multi-style joins are deliberately disabled while endpoint snapping remains available.
True deforming ribbons, pinch/redraw/simplify and a separate vector-layer creation policy remain
later milestones. No modern CSP source recovery, pixel-equivalence claim, physical stylus latency
comparison or iPad Safari memory verification was performed. No commit, push or deployment.

## Review

Start the existing Vite dev server, then open `/tests/vectorbrushes.html`. Drag the middle of any
specimen to reshape all four appearances, or use Move middle point. The expandable test surface
contains the production App and Studio. `/tests/vectorbrushes-responsive.html` runs the phone view;
`?size=tablet` and `?size=landscape` select other viewport wrappers (the recorded final run used phone).
