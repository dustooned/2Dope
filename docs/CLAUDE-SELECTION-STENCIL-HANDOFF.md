# Claude Code handoff — selection as a painting stencil (2026-10-26)

Read first: `AGENTS.md`, the current-state section of `HANDOFF.md`, and
`docs/DRAW-CAPABILITY-AUDIT-2026-10-26.md` (the source for this slice). Background only:
`docs/research/procreate-5.4.9/README.md` records why the reference behaves this way. Do not open
the `.ipa` again for this task.

## Goal

Make a selection a dependable stencil for raster painting, and make Select an explicit tool rather
than a mode that immediately turns into Transform. One slice, no schema change.

Baseline: `main` at the commit recorded in `HANDOFF.md`, working tree may already contain the
user's uncommitted work — preserve it. `npm test` is 59 files / 488 tests and `npm run build`
passes (existing large-chunk warning) before you start; re-check, don't assume.

## Scope

**Must**

1. A new selection stays a selection. Select no longer auto-enters Transform; the existing
   **Transform** chip is the only way in from the selection row.
2. Shape (Freehand / Rectangle / Ellipse / Automatic) and combination (New / Add / Subtract) are
   explicit chips with a visible pressed state, not one cycling button each.
3. Brush and Eraser paint only inside the active selection, with hard pixel edges. A stroke that
   touches no selected pixel produces no pixels and **no undo step**. A stroke that crosses the
   boundary is clipped, and one Undo removes exactly that stroke.
4. The live preview is clipped too (`displaySource`), so a stroke never flashes outside the
   boundary while the finger is down.
5. Deselect, frame/layer/project change and Cancel behave as they do today and leave no stale clip.

**Stretch**

6. Smudge is clipped by masking each dab; ship it only if it passes the pixel check below.
   If it does not, leave Smudge unrestricted and say so in the hint, manual and release note.

**Out of scope** (later slices from the audit): saved selections, feather, a threshold slider,
selection-construction undo, vector clipping, adjustment-tool clipping, transform precision,
distort/warp, persisted selections.

## Why it looks broken today

- Select is implemented as the Fill tool in lasso mode plus a flag:
  `bubbles.ts:362-366` sets `setTool('fill')`, `setFillMode('lasso')`, `selectMoves = true`.
- `endFill` (`app.ts:2392`, lasso branch `:2398-2407`) and `autoSelect` (`app.ts:1513-1526`) call
  `beginTransform()` whenever `selectMoves && selectOp === 'new'`, so the selection row is replaced
  by the transform row immediately after a new selection.
- `panel.ts:430` documents the current truth: "Selection bounds fills on this frame; brushes stay
  unrestricted."
- Raster strokes composite in `RasterEngine.apply` (`brush/raster.ts:467-476`) with no mask.

## Implementation

### 1. Selection state and UI

- `src/ui/bubbles.ts:643-680` (the `row === 'select'` branch): replace the two cycling chips
  (`shapeChip`, `opChip`, `:645-662`) with one chip per choice, `aria-pressed` on the current value.
  Keep the icons already declared in `shapes`/`ops`. Keep the row scrollable; check the Simple and
  Full interface levels and a phone-width layout.
- `src/ui/bubbles.ts:362-366`: entering Select stops setting `selectMoves = true`. Remove the flag
  or leave it permanently false and delete the dead branches in `endFill`/`autoSelect`; do not leave
  a path that silently re-enables auto-transform.
- `app.ts:1213` comment ("goes straight into transform") must be corrected.
- Keep **Move all** and **Select all / Select contents** working: they call `beginTransform()`
  directly and are explicit actions.
- Make **Transform** the first action chip in the selection row so the new flow reads
  "select → Transform".

### 2. One pure helper, unit tested

New `src/brush/clip.ts`:

```ts
/** True when any pixel of the rect is selected. Pure; used as a cheap early-out. */
export function anySelected(mask: Uint8Array, width: number, rect: { x: number; y: number; w: number; h: number }): boolean
```

It must clamp to the mask bounds and return false for empty/degenerate rects. Add
`src/brush/clip.test.ts` covering: all selected, none selected, partly selected, rect touching only
an unselected column, rect clipped at the right/bottom edge.

Also put the browser-only helper here so both raster paths share it:

```ts
/** 1-bit alpha canvas of a document mask (255 inside, 0 outside). Reused per stroke. */
export function maskCanvas(mask: Uint8Array, width: number, height: number): HTMLCanvasElement
```

Do not unit-test canvas behaviour in vitest (no canvas in the node environment); prove it in the
browser fixture.

### 3. Clip in `RasterEngine` (`src/brush/raster.ts`)

- Add `private clipMask: Uint8Array | null`, `private clipImageCanvas` (full document size), and a
  `private clipReady: boolean` flag.
- `begin(record, clip?: Uint8Array | null)` takes the mask, with three-valued semantics:
  `undefined` keeps the current mask, `null` clears it, an array sets it. `cancel()` clears it.
- `resize()` also resizes the clip canvas; `bind()` must not reset the clip.
- In `apply(target, r)`: if `clipMask` is set,
  - return early when `anySelected(clipMask, this.width, r)` is false;
  - otherwise draw `strokeImage(r)` into a dedicated **stencil** canvas (add one in the constructor
    and in `resize()`; do not reuse `scratch`, `grained`, `work` or `buffer`) restricted to `r`, set
    `globalCompositeOperation = 'destination-in'`, draw the mask canvas built once per stroke into
    it, restore the composite mode, and draw the stencil canvas onto the target with the existing
    alpha/composite rules.
- Never mutate `buffer`, `grained`, `scratch` or `work` in place: they are reused by preview and by
  the taper re-render in `commit`.
- In `commit()`, after applying, compare `before`/`after`; when every byte is equal, return null so
  no history step is pushed. Keep the returned `StrokeCommit` shape otherwise.
- The eraser path goes through the same `apply` (`destination-out`), so clipping must not special-case
  it. Verify that erasing outside the selection does nothing and inside removes only inside.

### 4. Wire it in `app.ts`

- In `beginStroke` (`app.ts:4433`), compute the selection **before** creating the record:
  `const sel = this.spatialSelection;` and pass `sel?.mask ?? null` to `raster.begin(...)` at
  `:4527`. Only when `!this.editingMask` — mask editing draws on the mask drawing, and the artwork
  selection must not clip it.
- Do not read `spatialSelection` again mid-stroke; the clip is fixed at pen-down.
- Alpha Lock post-processing in `onUp` (`:4634-4642`) runs on `after` pixels; it must stay after the
  clip, not replace it.
- Nothing else in the selection actions (`fillSelectedArea`, `copyArt`, `cutArt`, `deleteSelectedArt`,
  transform) changes.
- Symmetry dabs are produced in `addDabs` and share the same buffer, so they are clipped by the same
  pass; verify in the fixture rather than adding symmetry-specific code.

### 4b. The stroke is replayed twice — keep the clip

Three code paths rebuild the same stroke through `RasterEngine`, and every one must keep the mask or
a snapped/edited stroke escapes the selection:

- `redrawShape` (`app.ts:637-657`, `begin` at `:652`) re-renders the live QuickShape on every pointer
  move. It runs while the clip is still set, so `undefined` = keep is enough — but only if `begin`
  never silently clears the mask.
- `swapShape` (**Edit shape**, `app.ts:550-633`, raster `begin` at `:602`) runs after the original
  stroke was committed and cancelled. Store the mask on `lastShape` (`:535`) as `clip?: Uint8Array`
  and pass it to `begin` there, or Edit shape will paint unclipped.
- The final commit in `onUp` (`app.ts:4633`) uses the buffer the live re-render filled, so it
  inherits the same clip.

Add a fixture check for both: hold to snap a QuickShape inside a selection, then use **Edit shape →
Keep my stroke**; nothing may appear outside the selection.

### 5. Smudge (stretch)

`beginSmudge` (`app.ts:1077`) writes dabs straight to the plane canvas. If implemented: build the
selection mask canvas once at `beginSmudge`, and in `smudgeDab` (`:1089`) apply it to the dab with
`destination-in` and `drawImage(maskCanvas, -(x - r), -(y - r))` before the final `drawImage`.
`endSmudge` history and cancel stay as they are. If this does not produce clean edges, stop and
document the limitation instead.

### 6. Copy that must change with the behaviour

- `src/ui/panel.ts:430` hint.
- `src/ui/manualtext.ts`: the Select description (`:237`), the tool-bar line (`:222`), and a new
  `UPDATES` entry (top of the list, around `:435`) with `date: '2026-10-26'` or the day you finish —
  say what changed, that Vector is not clipped, and that a new selection stays a selection.
- `HANDOFF.md`: a new dated subsection with changed files, checks actually run, and remaining gaps.

## Acceptance checks

Browser fixture `tests/selectionpaint.html` + `src/ui/selectionpaint.browser.ts`, modelled on
`tests/paintingworkflow.html` / `src/ui/paintingworkflow.browser.ts` (in-memory `Project`, no
library/autosave, `check(name, ok)` into `#report`). A 128 × 128 project is enough.

1. Rectangle select (e.g. x 40–88) does **not** enter Transform; the Transform chip is present.
2. Shape and operation chips set the value directly and show `aria-pressed`.
3. Brush across the boundary at y = 64: alpha 0 at x = 30, > 0 at x = 64, 0 at x = 100.
4. Undo once: both sides return to their previous alpha.
5. Brush entirely outside (x 4–24): no pixels change and `app.history.canUndo` is unchanged.
6. Eraser across the boundary removes paint only inside.
7. While the pointer is down (between move and up), the rendered preview shows nothing outside the
   boundary — assert on `displaySource` or the composited canvas, not only on commit.
8. Deselect → the same stroke paints on both sides again. Change frame → the old selection is
   invalidated and painting is unrestricted.
9. Alpha Lock on: colour changes only inside the selection and coverage outside is untouched.
10. Symmetry (vertical) + selection: mirrored dabs are clipped too.
11. Vector pen inside a selection still draws its whole stroke (documented limitation, not a bug).
12. QuickShape snap inside a selection, then Edit shape → Keep my stroke: still clipped, one undo.

Do not add a fixture that clears or overwrites an existing project's storage. Follow the
stash/restore pattern at the top of `paintingworkflow.browser.ts`.

## Verification

Run from `beta/`:

```
npm test
npm run build
git diff --check
```

Then a separate test origin with a fresh profile, for example:

```
npm run dev -- --port 5231
# open http://127.0.0.1:5231/tests/selectionpaint.html
```

Report the PASS/FAIL counts from `#report`, plus the unit-test and build totals. A hidden tab does
not run `requestAnimationFrame`; use a visible or headless Chrome, as the existing fixtures note.

## Invariants and pitfalls

- `buffer`, `grained`, `scratch` and `work` are shared, reused canvases. Copy before masking.
- The mask is a document-pixel `Uint8Array` of `docW * docH`, 1 = selected. Never assume a bounding
  box clip is enough; use the mask.
- Do not allocate a full-page ImageData per pointer event. Build the mask canvas once per stroke;
  the per-apply scratch draw is acceptable.
- Keep Lite memory in mind: one extra full-size canvas and one mask canvas, resized with the engine.
- Keep Line and Fill separate, keep vector records editable, keep seeded randomness (`core/rng.ts`).
- Do not flatten vectors, do not transform every shared occurrence, do not touch `.2dope` schema.
- Preview, commit and Cancel must agree: `displaySource` and `commit` share `apply`.
- Do not reformat unrelated code, do not touch `reference/`, do not commit or push.

## Report back

Changed files, what each check proved, the exact `npm test` / `npm run build` totals, fixture
PASS/FAIL counts, screenshots if useful, and anything not verified (iPad/Pencil, Lite memory
pressure, real device feel). If a must-have criterion cannot be met, stop and explain rather than
shipping a partial clip.
