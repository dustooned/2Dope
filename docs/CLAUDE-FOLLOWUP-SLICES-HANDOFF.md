# Claude Code directions — follow-up slices (2026-10-26)

Three independent slices, in order. Each one ends with tests, build, a `HANDOFF.md` paragraph and a
**stop for review**; do not roll into the next slice without being asked. No commit and no push
unless the user asks.

Read first: `AGENTS.md`, the current-state section of `HANDOFF.md`, and the two research notes this
builds on — [procreate-5.4.9](research/procreate-5.4.9/README.md) and
[DRAW-CAPABILITY-AUDIT-2026-10-26.md](DRAW-CAPABILITY-AUDIT-2026-10-26.md).

## Before anything

1. `git status --short --branch` and `git log --oneline -3`. The selection work landed in `2298783`
   (stencil) and `6491434` (colour selection, Reselect, copy/cut to layer). A parallel session may be
   editing `src/app.ts`, `src/fill/`, `src/core/history.ts` or `src/brush/`. **Do not revert or
   reformat another session's work.** If those files are dirty, stop and ask the user.
2. Run `npm test` and `npm run build` once to record the baseline.
3. Work on a branch, one per slice: `codex/vector-selection`, `codex/saved-selections`,
   `codex/onion-lightbox`.

---

## Slice 1 — vector strokes respect the selection

**Why.** The stencil slice clips raster Brush, Eraser and Smudge. Vector pen strokes, and the
Line-plane vector eraser, still ignore the selection. That is documented as a limit in `HANDOFF.md`
and is a correctness hole, not a missing feature.

**Design.**

- New pure module `src/core/vectorclip.ts`:

  ```ts
  /** Split a vector stroke into the parts whose centres fall inside the mask. */
  export function clipStrokeToMask(
    rec: StrokeRecord, mask: Uint8Array, width: number, height: number,
  ): StrokeRecord[];
  ```

  - Sample mask coverage at each point centre; walk segments and bisect a boundary-crossing segment
    (8 iterations is plenty) to find the crossing parameter, so the cut lands on the mask edge.
  - Emit one piece per inside run. Preserve pressure/tilt/time; reset `taperStart`/`taperEnd` on cut
    ends, as `src/core/vectorcut.ts` `piece()` already does. Reuse its `at()` helper by exporting it
    (or duplicating the tiny interpolation).
  - Fully inside → return the original record unchanged (same `id`). Fully outside → `[]`.
    Pieces get ids like `${rec.id}~c${k}` — `vectorcut.ts` uses `~${k}`, so keep the namespaces
    distinct.
  - Symmetry copies are separate records; clip each.

- Wire in `app.ts` where a pen stroke is committed (the `if (rec.tool === 'pen')` branch around
  `:4765`): when `this.spatialSelection` is non-null and `!this.editingMask`, clip `rec` and its
  symmetry copies before `d.vectors = [...]`. If nothing survives, skip the history push and say once
  "The stroke is outside the selection." — do not add an undo step.
- Vector eraser: in the same commit path, `eraseVectors(...)` (`src/core/vectorcut.ts:102`, called
  around `app.ts:4798`) currently cuts anywhere the eraser path touches. When a selection exists,
  clip `vAfter` through the same function, and if the eraser touched only vectors outside the
  selection produce no vector change (the raster half of the stroke still clips as it does today).
- Auto Paint reads committed line pixels; a clipped vector still contributes its visible part, so no
  extra work — but check `inkpaint.browser.ts` still passes.

**Acceptance.**
- A vector stroke crossing the boundary exists as two records, both ends on the mask edge; no point
  outside the selection survives.
- A vector eraser entirely outside the selection changes no vector and adds no undo step.
- Undo restores the original single record.
- Editing points afterwards works on each piece.

**Tests.** `src/core/vectorclip.test.ts`: inside, outside, one crossing, two crossings, closing a
loop, taper reset, symmetry copy. Add checks 13–14 to `tests/selectionpaint.html` (or a
`selectionvector` fixture) driven like the existing fixture.

---

## Slice 2 — saved selections, then feather

### 2a. Saved selections (do this first: no mask format change)

- In-memory store on `App`, keyed by drawing id:
  `{ id, name, area: Area, thumb: string /* data URL */, createdAt }`, at most 12 per drawing.
  Reuse the existing selection thumbnail/outline code if there is one; otherwise draw `area.mask`
  into a small canvas.
- UI in the Select row: `Save selection…` (asks a name), and a `Selections` sheet listing thumbnails
  with Load / Rename… / Delete. Loading sets `this.spatial` exactly as `takeSelection` does and
  enters no transform.
- Ownership and invalidation: the store follows the drawing, not the frame. Changing frame or layer
  keeps the store but clears the live selection (existing rule). Opening another project clears the
  store. `Reselect` keeps its current meaning (the last dropped selection) and must not be replaced
  by this list.
- **Session only.** No `.2dope` schema change; say so in the hint, the manual and the release note.
- Tests: unit for the store (cap, per-drawing keying, clear on project change) and fixture checks —
  save, change frame, come back, load, paint; delete; rename.

### 2b. Feather, in two phases

Feather is fractional coverage. `Area` is `{ mask: Uint8Array; x0..y1 }` (`src/fill/fill.ts:247`) and
every consumer treats `mask[i] === 1` as inside. Plan:

**Phase 1 — coverage for paint.**
- Add `coverage?: Uint8Array` (0..255, same dimensions) to `Area`; absent means binary. Add
  `featherArea(area, radius): Area` in a new `src/core/feather.ts` using three box passes
  (separable), clipped to the area box, pure and unit-testable.
- Consumers for phase 1: the raster stencil (`maskCanvas` in `src/brush/clip.ts` — write
  `coverage[i]` as alpha instead of 0/255), Smudge's dab mask, `fillFrom`'s mask argument, and
  `cutOut` in `app.ts:1644` (multiply alpha by coverage/255).
- UI: a `Feather` chip in the Select row opening a 0–24 px slider with a live preview of the
  selection outline; applying recomputes `coverage` and re-renders. No undo step (selection edits are
  not in history today — do not invent one here).
- Tests: unit for `featherArea` (edge ramp sums, radius 0 = binary, clipped at canvas edge); fixture
  pixel checks: a stroke across a feathered edge has alpha between 0 and 255 at the ramp, and a fill
  clipped by feather shows the same ramp.

**Phase 2 — coverage everywhere (only if phase 1 is solid).**
`transformMask`, copy/delete/cut vectors, adjustment blending, and `exact` selections after a
transform. Same rule: coverage multiplies alpha, never re-binarises. If any consumer cannot honour
fractional coverage without a redesign, stop and report instead of mixing soft and hard behaviour.

---

## Slice 3 — Animate: lightbox onion, then per-frame palette

### 3a. Lightbox onion style (small, no schema change)

- `OnionSettings` (`src/view/onion.ts:4`) gains `style: 'tint' | 'lightbox'`; add it to
  `DEFAULT_ONION` and to the persisted object (`ONION_KEY`). `OnionCache.ghost(d, color)` already
  accepts `color: null` and returns an untinted ghost, and the cache key covers it.
- Render with `color = null` when `style === 'lightbox'`; keep the same opacity and falloff.
- UI: one chip in the onion row (`src/ui/strip.ts` ~:172-208) switching Tint / Lightbox; update the
  manual and add a release note.
- Tests: unit for the settings round trip; fixture check that a lightbox ghost keeps its own colour
  (sample a coloured previous drawing) while a tinted ghost does not.

### 3b. Per-frame palette (schema work — get confirmation first)

Dreams stores `perFrameColorPalette`; 2Dope has only device-local palettes in `colorpanel.ts`.
Recommended shape: `Drawing` gains `palette?: string[]` (max 24), persisted through `io/schema.ts`
with a migration that leaves old files valid, edited through `History` so it undoes like other
document edits, and included in archive export.

- UI: a "Frame palette" group in the colour panel for the active drawing — add the current colour,
  hold a swatch to remove, tap to use.
- Shared drawings share their palette (state that in the hint).
- Tests: schema round trip + old-file migration, unit for add/remove/cap, browser check that
  switching frames switches the palette.

Do not start 3b until the user agrees to the schema change; 3a is independent and can ship alone.

---

## Verification for every slice

```
npm test
npm run build
git diff --check
```

Browser fixtures on a separate origin (`npm run dev -- --port 5231`), visible tab or headless Chrome,
fresh profile, stash/restore local storage like the existing fixtures. Report PASS/FAIL counts.

## Report back

Changed files; what each acceptance check proved; `npm test` totals (files/tests) and build result;
fixture counts; anything not verified (iPad/Pencil, Lite memory, real device); and the exact place to
resume. Keep new limits in `HANDOFF.md`, not only in the code.
