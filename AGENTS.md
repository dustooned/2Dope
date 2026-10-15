# Working on 2Dope

Read `HANDOFF.md` for the checked baseline, `ARCHITECTURE.md` for the code map, and the relevant format document before editing persistence or export. `DECISIONS.md` is a historical log; older "not yet" statements may have been superseded.

## Development

- TypeScript, Vite, Canvas 2D, native DOM; no UI framework or application server.
- Run commands from this directory: `npm test`, then `npm run build` (includes strict TypeScript checking). Use the existing lockfile; `npm ci` is the clean-install path.
- Check `git status` first and preserve concurrent Claude or user changes. Keep changes scoped; avoid broad formatting or refactors during a fix.
- Edit source/config files. `dist/` is generated and ignored. The sibling `../reference/` projects are outside the application's build.

## Preserve these behaviors

- Board, Draw, Time, and Motion share one project, comp clock, and drawing pool. Put timing logic in shared model/commands rather than separately in each UI.
- Use `History` commands for undoable document edits; preview a drag live and commit one undo step. Notify document changes so autosave runs, including on undo and redo.
- Use residency before reading or writing drawing pixels. A parked drawing has 0-by-0 canvases. Commands needing pixels declare their drawings; protect undo-required assets from garbage collection.
- Keep Line and Fill separate, vectors above Line, and storyboard guides out of final exports unless included.
- Keep brush randomness deterministic through `core/rng.ts`. Predicted pointer points are preview-only.
- Preserve `.2dope` compatibility through `io/schema.ts`, validation and migration as needed; standalone archives include all referenced assets.
- Preserve Lite/device limits and touch workflows when changing layouts or memory behavior.
- Update `src/ui/manualtext.ts` and `UPDATES` when user-facing behavior changes. Release notes must remain valid TypeScript strings.

## Verification and delivery

- Run meaningful checks, including tests and production build for source changes. Passing unit tests alone does not prove the entry point compiles.
- For input, layout, storage, or rendering changes, check the affected browser flow using a separate test origin. Never clear an existing project's browser storage as a testing shortcut.
- Distinguish new checks from historical reports. Desktop Chromium does not verify Apple Pencil feel, iPad Safari memory, or Blender import/render behavior.
- Report changed files, actual checks, and limitations. Committing or pushing `main` is a separate action; its push workflow deploys to GitHub Pages.
