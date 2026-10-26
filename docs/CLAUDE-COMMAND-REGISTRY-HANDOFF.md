# Claude Code handoff — command registry for the options rows

2026-10-26. One registry of UI commands, filtered by context, with a persisted hidden set and a
variant hook — the Clip Studio Paint shape verified in
[research/clip-studio-paint](research/clip-studio-paint/README.md). First slice covers the **Select
row** only; later slices move the other rows and the tool bubbles.

Read first: `AGENTS.md`, current-state `HANDOFF.md`, and the CSP note above. Do not copy CSP content
or naming; we only take the four properties: **stable id, contexts, hidden bit, variant hook**.

## What exists today (anchors)

- Tool bubbles: `src/ui/bubbles.ts` `toolsFor(ws)` (~:325) returns hard-coded arrays per workspace.
- Options row: `optionsRow(this.optionsState())` (~:556) then a hand-written `if/else` per row
  (`select` at ~:643, transform ~:584, time ~:564, fill ~:621, paint ~:608, smudge ~:599).
- Visibility: `src/core/studentprefs.ts` `STUDENT_TOOLS` + `studentUI.tools` (tools only, part of
  student profiles); `src/core/quickmenu.ts` `QUICK_ACTIONS` is a third id list.
- Selection is the Fill tool in lasso mode plus `selectMoves`-style flags; the row's action chips are
  built inline with `this.chip(...)`.
- Menus: `src/ui/contextmenu.ts` `showContextMenu(x, y, items)` — items are objects, no ids.
- Nothing persists a per-command hidden set, and rows are not data.

## Design

Two new files, one persisted pref, one rendering change.

```ts
// src/ui/commands.ts  (presentation layer: it may import the App type)
export type CommandContext =
  | 'select' | 'fill' | 'transform' | 'smudge' | 'paint' | 'time' | 'points' | 'adjust'
  | 'layers' | 'assets' | 'board' | 'motion' | 'toolbar';

export interface Command {
  /** Namespaced, permanent: renaming the label never changes this. */
  id: `select.${string}` | `${string}.${string}`;
  label: string;
  title: string;
  icon?: string;
  contexts: readonly CommandContext[];
  /** Sort key inside a row; keep gaps of 10 so new commands can slot in. */
  order: number;
  run(app: App): void;
  isOn?(app: App): boolean;
  isEnabled?(app: App): boolean;
  /** Later slices: which parameter group this command shows in this context. */
  variant?(app: App): string;
}

export const COMMANDS: readonly Command[];
export function commandsFor(context: CommandContext, app: App): Command[];
```

```ts
// src/core/commandprefs.ts  (device-local, like quickmenu/student prefs; never in the project file)
export interface CommandPrefs { hidden: string[] }
export function readCommandPrefs(saved: unknown): CommandPrefs;
export function isCommandHidden(prefs: CommandPrefs, id: string): boolean;
export function setCommandHidden(prefs: CommandPrefs, id: string, hidden: boolean): CommandPrefs;
```

Rules for the registry:

- Ids are unique and stable; add a test that enforces uniqueness and the `namespace.name` form.
- `commandsFor` returns commands whose `contexts` include the context, ordered by `order`, minus
  disabled ones (`isEnabled` false), **not** minus hidden ones — hidden filtering is the renderer's
  job, so a "Customize" list can still show hidden entries.
- A command never reaches into DOM; it calls `App` methods only.

## Slice 1 — registry + Select row (do only this)

1. Add `src/ui/commands.ts` with the type, `commandsFor`, and the Select-row commands only:
   `select.transform`, `select.fill`, `select.copy`, `select.cut`, `select.duplicate`,
   `select.delete`, `select.invert`, `select.deselect`, `select.reselect`, `select.moveall`,
   `select.selectall`, `select.paste`. Copy the current labels, titles, icons and `run` bodies from
   `bubbles.ts` verbatim; the chips must look and behave exactly as today.
2. Add `src/core/commandprefs.ts` with the four functions above. Key:
   `2dope.commands.hidden`. Sanitize: unknown/malformed entries dropped, duplicates removed, cap 200.
3. In `bubbles.ts`, replace the action chips of `row === 'select'` (~:665-680) with
   `commandsFor('select', a).filter(c => !isCommandHidden(prefs, c.id))`. Leave the shape chips, the
   operation chips, `gradChips()` and the no-selection `Move all` / `Select all` split exactly as they
   are for now; the registry can express them later.
4. Hiding UI: right-click / long-press a registry chip opens `showContextMenu` at the chip with
   `Hide “Copy” from this row`. Store via `setCommandHidden`. Add a `Customize` chip at the end of the
   row that opens the same menu listing every Select command with a `✓`/blank and `Hide`/`Show`, so a
   hidden chip is recoverable without Settings.
5. Settings: add a short "Hidden controls" group to the tool-visibility page in `src/ui/settings.ts`
   listing hidden commands with a Show button. Device-local, not part of student profiles, not in
   `.2dope`.
6. The row signature cache (`sig` in `bubbles.update`, ~:520) must include the hidden set, or the row
   will not refresh when it changes.

**Acceptance.**
- With nothing hidden, the Select row is identical in labels, order, icons, pressed states and
  behaviour to the current build.
- Hiding any command removes exactly that chip; it survives a reload; Show restores it; other rows and
  the toolbar are untouched.
- No project-file change; `studentUI` profiles do not capture the hidden set.
- Keyboard shortcuts, QuickMenu actions and `spans`/layout widths are unaffected.

**Tests.** `src/ui/commands.test.ts`: unique ids, namespaced ids, order stability, context filtering,
disabled filtering. `src/core/commandprefs.test.ts`: garbage input, dedupe, cap, toggle round trip.
Fixture `tests/commandrow.html` + `src/ui/commandrow.browser.ts`: hide Copy → chip gone; reload the app
object → still gone; Customize → Show → back; a second fixture context (e.g. transform row) unchanged.
Model it on `tests/selectionpaint.html`.

Stop after Slice 1: `npm test`, `npm run build`, `git diff --check`, HANDOFF paragraph, report. No
commit or push.

## Slice 2 — move the other rows

Same treatment, one row per commit-sized step, verifying each by eye and in `commandrow.browser.ts`:
`transform` (~:584), `time` (~:564), `fill` (~:621), `smudge` (~:599), `paint` (~:608), `points`.
`layers` and `assets` build dynamic lists — leave them until Slice 3. Each row's `Customize` chip is
shared, so the hiding UI comes for free; keep the per-row signature in `sig`.

## Slice 3 — tools and menus

- `toolsFor(ws)` becomes `commandsFor('toolbar', a)` filtered by workspace and the existing student
  visibility; `STUDENT_TOOLS` stays the source of truth for student profiles, the registry references
  those ids rather than replacing them.
- Context-menu items gain optional `id`; `showContextMenu` filters hidden ids. Do not convert every
  call site at once — start with the canvas and frame menus.
- QuickMenu action ids stay unchanged; if they are re-registered, keep the stored strings.

## Slice 4 — variants

Add `variant?(app)` use: one command can present a parameter group (e.g. `select.shape` with
`variant` = `free|rect|ellipse|auto`, rendered as the existing chip group). This is the equivalent of
CSP's `NodeVariantID` without a database: the variant is a function of app state, computed at render
time. Do not add persistence for variants; state already lives on `App`.

## Guardrails

- A parallel session may be editing `app.ts`, `fill/`, `history.ts`, `brush/`. Stop and ask if those
  are dirty.
- Do not renumber or rename existing tool/QuickMenu ids; other code and saved preferences depend on
  them.
- Keep chips at their current 44 px target height and the row scroll behaviour at phone widths.
- No new dependency, no framework, no schema change.

## Verification

```
npm test
npm run build
git diff --check
```

Fixture on a separate origin (`npm run dev -- --port 5231`), visible tab or headless Chrome, stashing
local storage like the other fixtures. Report changed files, test/build totals, fixture PASS/FAIL
counts, and the exact place to resume at Slice 2.
