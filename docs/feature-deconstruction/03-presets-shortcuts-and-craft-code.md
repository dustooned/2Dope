# Deconstruction 03: Tool presets, shortcuts, and what our Craft code already has

Sources: Harmony `resources/toolpresets`, `shortcuts.xml` (620 entries), `toolbars.xml`; EffectCraft repo at `C:\Users\dusto\effectcraft` (Rust, MIT/Apache-2.0).
**Only EffectCraft has source on this machine.** ArtCraft, DesignCraft, FilmCraft are installed binaries only
(`AppData\Local\ArtCraft`, `Program Files\DesignCraft`, `Program Files\FilmCraft`). Point me at their repos to mine them too.
✅ in spec · ➕ gap · ❌ skip

## A. Harmony tool presets = named bundles of tool *options*
`TPV_ToolPresets.qsa` shows presets are just on/off option flags applied to the active tool:
- Brush: **Draw Behind**, **Auto-Create Colour Art**, **Auto-Flatten**, **Respect Protected Colour**, Drawing Magnifier
- Selection: marquee mode, snapping (contour / align / grid), permanent selection, select-by-colour
- Transform: peg-selection mode, snapping, show/hide manipulator controls
- Paint: paint-and-remove-texture, stored gradient, **select painted zones after painting**
- Line: **line building**, **line pushing**
2Dope:
- ➕ **Draw Behind** is exactly our "fill behind lines" idea, but for brushes too. Add as a brush toggle.
- ➕ **Auto-create colour art from brush** = a line stroke also fills its closed shape (quick cleanup).
- ➕ **Protected colour** = lock a palette color so brushes/fills can't overwrite it.
- ➕ **Select painted zones after fill** (feeds the wand/mask workflow).
- ➕ **Line building/pushing** = vector line tool extends/shoves neighbor lines. Defer (milestone 7).
- Implementation: tool options are `{bool|enum}` flags saved per tool; "preset" = named option set bound to a key. Cheap, scriptable via our command system.

## B. Harmony shortcuts worth copying (default keymap)
| Action | Harmony | 2Dope spec | Note |
|---|---|---|---|
| Play | Space | Space/Enter | Harmony uses Space for **Free Pan+Zoom** too (context) ✅ ours: Space-drag = pan |
| Zoom | Ctrl+= / Ctrl+- | wheel | ➕ add keys |
| Flip view H/V | 4 / 5 | flip view | ➕ add keys |
| Next/prev keyframe | ' / ; | n/a | ➕ add (timeline nav) |
| Extend exposure | F5 | `=` | ✅ ours simpler |
| Motion keyframe / stop-motion keyframe | Ctrl+K / Ctrl+L | n/a | ➕ **two key types**: interpolated vs. hold. Matches our per-key interpolation (linear/hold) |
| Select parent / child | B / Shift+B | n/a | ➕ ties to peg/null selection |
| Prev/next sibling | / and ? | n/a | ➕ |
| Resize pencil | O | `[` `]` | ✅ ours |
| Frame selection | Shift+F | `F` fit | ✅ |
| Convert strokes→pencil lines | Shift+F12 | n/a | ➕ vector→raster-ish |
| Join / split pencil line | Alt+Shift+J / K | n/a | ➕ vector milestone |
| Snap to contour | Ctrl+Alt+; | n/a | ➕ |
| Group | Ctrl+G | Ctrl+G | ✅ |
| Create peg / parent peg | Ctrl+P / Shift+Ctrl+P | null layer | ➕ "create parent null around selection" one key |
| Move pivot to cursor | Tab | anchor tool | ➕ |
| Fill selection | Ctrl+T | G | ✅ |
| Center on selection | O (in some contexts) | n/a | ➕ |
Observations:
- Harmony shortcuts are **context-conditioned** (`condition="paint"`, `not essentials`, per-flavour). Also offers keymap "flavours" (Harmony / Flash / Toon Boom Studio). ✅ our keymap presets idea is the same: add a `condition` field (tool/view) so one key can mean different things.
- 620 actions is the opposite of principle 2. Keep ours to ~60 actions.

## C. EffectCraft code we can reuse or learn from (same family, our own license)
| EffectCraft piece | Where | Use in 2Dope |
|---|---|---|
| **Paint effect**: strokes are non-destructive, animatable property groups (Path, Start/End, Diameter, Angle, Hardness, Roundness, Spacing, Opacity, Flow, per-vertex pressure, Duration: Constant / Write-On / Single Frame / Custom) | `crates/effects/src/paint.rs` | ➕ **Stroke-as-data** model: store brush strokes as vector paths + dynamics and re-render dabs. Gives write-on animation and animatable start/end for free. Strong fit with our vector layer + stamp engine |
| Dab rendering: ellipse (diameter × roundness, rotated), edge falloff by hardness, flow builds per dab, opacity caps stroke | same | ✅ reference algorithm for our stamp brush |
| Clone stroke (source layer, offset, time shift) | same | ➕ later: clone from another frame (cleanup aid) |
| Eraser modes: layer+paint / paint only / last stroke only | same | ➕ maps to our plane-aware eraser (active plane vs all) |
| **Variable-width stroke**: `Taper` (start/end length, width, ease), `Wave` (amount, cycles, wavelength, phase), dashes | `crates/path/src/varstroke.rs` | ➕ **Natural vector line** options: taper + wave + dash. Directly gives pressure-like lines on vector layers |
| **Path wiggle** (size, detail, smooth/corner, speed, correlation, phase, seed) | `crates/path/src/ops.rs` | ➕ **Line boil** = animated wiggle on path points, seeded (deterministic). Covers our "roughen edges"/boil preset for vector |
| Path ops: trim (start/end/offset), pucker-bloat, round corners, offset (joins, copies), twist, zig-zag | `crates/path/src/ops.rs`, `offset.rs` | ➕ Vector "animation" ops: Trim = write-on; round corners/pucker for shape morph feel |
| `feather.rs`, `fit.rs`, `trace.rs` | `crates/path/src` | ➕ `fit` = stroke smoothing/simplify; `trace` = raster→vector (our later-idea auto-trace) |
| Keyframe: temporal ease + spatial Bezier, roving, hold, velocity | `crates/keyframe` | ✅ matches spec interpolation; copy easing math; they also verified against AE (see docs/fidelity) |
| Expressions: boa JS with AE object model, seeded noise | `crates/expr` | ✅ our JS expressions; reuse noise.rs semantics for determinism |
| Lottie import/export | `crates/lottie` | ➕ cheap extra export target for UI motion |
| Time: integer tick (254,016,000,000/s) | `crates/time` | ➕ adopt exact-tick time so 24/25/29.97/30 never drift |
| Project: readable JSON `.ecproj`, schema + savedBy, atomic write, round-trip check before save | `docs/architecture.md` | ✅ confirms 2Dope JSON plan; add `schema` + `savedBy` + verify-read-back |
| Architecture: engine knows nothing about UI; command registry shared by UI, CLI, MCP | `docs/architecture.md` | ✅ same as our "command system" rule; add a CLI/MCP front-end for automation/teaching |

## D. "Natural brush" options to add for animation (consolidated wish list)
Raster: pressure/tilt/speed → size, opacity, angle; fade distance; stamp cycle; dual brush; paper-grain (aligned/additive); draw-behind.
Vector: taper start/end with ease; wave; dash; per-vertex pressure width; centerline smoothing; connect ends/trim overshoots; **animatable Start/End (write-on)**; **path wiggle (boil)**; round corners/pucker.
Both: strokes stored as data (re-renderable), seeded randomness.

## Decisions
- [ ] Store raster brush strokes as replayable stroke data (EffectCraft style) in addition to pixels? (big win: write-on, re-render at any res; cost: file size)
- [ ] Adopt exact-tick time base?
- [ ] Bring in EffectCraft `path` + `keyframe` crates directly (Rust → WASM) or rewrite in TypeScript? (spec says TS web app; EffectCraft already builds for wasm32)
- [ ] Send me repos for ArtCraft / DesignCraft / FilmCraft.

## Next
Node/compositing view · Export settings · Mining the three other Craft apps once source is available
