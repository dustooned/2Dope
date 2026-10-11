# 2Dope feature deconstruction

Studying how other tools work, to decide what 2Dope builds. **Behavior and public docs only; no proprietary code is copied.**
Open-source Craft repos (Apache-2.0) may be reused with attribution.

| # | Doc | Source |
|---|---|---|
| 01 | [Timeline, Xsheet, Art Layers](01-harmony-timeline-xsheet-artlayers.md) | Toon Boom Harmony (shipped files) |
| 02 | [Brushes, pressure, pegs](02-harmony-brushes-camera-pegs.md) | Harmony pen styles + UI forms |
| 03 | [Tool presets, shortcuts, EffectCraft code](03-presets-shortcuts-and-craft-code.md) | Harmony + EffectCraft source |
| 04 | [Craft apps command catalogs](04-craft-apps-command-catalogs.md) | DesignCraft/FilmCraft/EffectCraft CLIs (`craft-commands/`) |
| 05 | [Drawing data model + timesheet markers](05-harmony-drawing-api-and-timesheet.md) | Harmony scripting API docs |
| 06 | [Craft source: brushes, vectors, audio](06-craft-source-brushes-vectors.md) | photocraft, vectorcraft, soundcraft source |
| 07 | [Procreate Dreams](07-procreate-dreams-handbook.md) | Official public handbook (no API exists) |
| 08 | [Dreams clean-room spec](08-dreams-cleanroom-spec.md) | Full handbook re-read as testable rules, mapped to 2Dope status and milestones |

Reference clones: `E:\2026\Dev\Apps\2Dope\reference\` (+ `C:\Users\dusto\effectcraft`).

## Top spec changes (proposed, ranked by value for effort)
1. **Strokes stored as data** (points with x, y, pressure, tilt, time + brush settings + seed), pixels as a cache. Gives replay, write-on, deterministic export, resolution-independent re-render. (03, 04, 06)
2. **One `Dynamic` struct** `{control: off|pressure|tilt|speed|direction|fade, min, jitter, inverted, curve}` for every brush param. (02, 06)
3. **Brush settings = PhotoCraft section layout** (core, shape, scatter, texture, dual, color, transfer, smoothing w/ pulled-string). Procedural tips for instant natural media. (06)
4. **Drawing roles: key / breakdown / inbetween** badges on thumbnails + X-sheet; inbetween placeholders; onion "keys only". (05)
5. **Planes: add non-rendering Rough and Overlay** beside Line/Fill/Shade. (01, 05)
6. **Vector: variable-width profiles (L/R), calligraphic nib, continue/close by endpoint, smooth brush, path eraser, blob brush.** (04, 06)
7. **Vector region fill via planar map** (fill between lines without closed paths). (06)
8. **Run-length cells** + 5-field markers (name, color, note, duration, time) + typed namespaced markers/metadata. (01, 05)
9. **Commands with JSON params + CLI + MCP**, gestures replay through the command journal. (03, 04, 06)
10. **Exact integer time base** and quantized vector coordinates for clean diffs. (03, 05)
11. **Scrub lock + flip wheel** in Quick Animate (page-flip between keys, paint while scrubbing). (07)
12. **Record mode**: perform transforms/sliders live → keyframes, with motion filtering. (04, 07)
13. **Layout offset** separate from keyframes (move animated items without breaking keys). (07)
14. **Spacing ticks between keyframes** to show easing visually. (07)
15. **Auto recovery point** when the user undoes 3+ steps then edits. (07)

## Still to do
- Harmony node/compositing view, export/render settings, preferences (onion skin, light table).
- REA/Ghidra pass on `toonboom.exe` after app restart (DLLs unsupported by REA on Windows).
- Procreate Dreams: handbook done (07); add hands-on notes from the owner's own use if anything differs.
- Decide: port Craft algorithms to TypeScript vs. compile Rust crates to WASM.
