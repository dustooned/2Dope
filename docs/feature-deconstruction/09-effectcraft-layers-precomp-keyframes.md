# 09: EffectCraft: layers, precomps, keyframes

Source: EffectCraft source (`C:\Users\dusto\effectcraft`, Apache-2.0; crates `project`, `keyframe`, `render`, `engine`, `ui-egui`), read 2026-10-11. We reuse the **ideas and data shapes**, and would credit the project if we ever port code. EffectCraft follows After Effects semantics closely, so this doc also describes the AE model.
✅ in 2Dope · ➕ take · ❌ skip

## 1. Project, comp, layer

- A **project** is a flat map of **items** by id: folders, **comps**, footage, solids. Items never nest by pointer, only by id, so one comp can be used many times.
- A **comp** owns: size, pixel aspect, frame rate, duration, background, work area, markers, motion-blur settings and `layers` (**top of the stack first**).
- A **layer** owns: name, **source**, label color, `start_time`, `in_point`/`out_point`, `stretch` (%), switches, blend mode, track matte, **parent**, markers, and a **property tree**.
- Layer **source** is one of: footage, **comp (precomp)**, solid, text, shape, null, camera, light, 3D model/primitive.
- Time is an integer count of ticks (254 016 000 000 per second), so every common frame rate is exact. Matches our "exact integer time base" decision (README #10).

➕ 2Dope shape: `Comp { size, fps, duration, layers[] }` and `Layer { source: Drawings | Comp | Null | Image, start, in, out, stretch, parent, blend, opacity, matte, props }`. Our present project is exactly **one comp with one Drawings layer**.

## 2. Precomp = a layer whose source is another comp

- The nested comp is a full comp with its **own size, fps, duration, work area**. The outer layer places it on the outer timeline.
- **Time mapping** (the whole trick):
  - `layer_time = (comp_time − start_time) × 100 / stretch`. Stretch 50 % = twice as fast; negative = reversed.
  - If **Time Remap** is on, that layer property *replaces* the formula: its value is the nested time to show. Keyframes on it = speed ramps, freeze frames, loops. *Freeze Frame* = one hold key.
  - If the nested comp is set to **preserve frame rate**, the shown time snaps to the nested comp's own frames (a 12 fps drawing stays on its own twelve even inside a 24 fps shot).
- **Collapse transformations** switch: off = the nested comp renders to one flat image, then that image is transformed/blended as a unit. On = nested layers draw straight into the parent (their blend modes, 3D and motion blur pass through).
- **Preserve resolution when nested**: the nested comp renders at full size even when the parent previews smaller.
- Nothing is drawn before the nested comp's start or after its end.

## 3. Making and editing a precomp

- **Pre-compose, "move all attributes"**: selected layers move into a new comp; one new layer replaces them at the position of the topmost selected one. Parents or mattes that were *outside* the selection are cut. Optionally trim the new comp to the span of the selected layers (and shift their times so it starts at 0). Optionally open it.
- **Pre-compose, "leave all attributes"** (one layer only): the layer's *source* goes into a new comp sized to it; the outer layer keeps its transform, masks, effects and timing.
- Open/close: double-click a precomp layer to open its comp; the viewer shows tabs/breadcrumb. (UI detail, not in the crates.)
- Duplicating a precomp **layer** makes another **instance** of the same comp (shared content). A comp can be duplicated to make it unique.

## 4. Essential Graphics: adjusting a precomp from outside

- A comp can **expose** chosen properties of its layers as controls (slider, checkbox, color, point, angle, dropdown, text, plus media-replacement slots, comments and groups). Controls can be renamed and mirrored.
- Every layer instance of that comp gets an **Essential Properties** group showing those controls. Editing one marks it **overridden for that instance only**; non-overridden ones follow the comp. The renderer builds a per-instance copy with overrides applied.
- This is the answer to "adjust it like a precomp without diving in": **pin the few knobs that matter**.

➕ Take it, simplified: star ★ a property inside a comp → it appears as a slider on every instance.

## 5. Property tree

- Layers hold a **tree of groups and properties** addressed by path: `transform/position`, `transform/opacity`, `effects/#1/blurriness`, `masks/...`, `timeRemap`.
- Each property has: stable uid, match id, display name, static value, optional **keyframes**, optional **expression**, a **UI type** (slider with soft and hard range, percent, angle, point, color, checkbox, popup, layer picker, path…), flags (spatial, hold-only, 2D/3D-only).
- A UI type decides the control drawn for it. One engine, many editors.

➕ 2Dope: same tree, small. Start with `transform/{position,scale,rotation,anchor,opacity}` and `timeRemap`. Everything keyframable (spec principle).

## 6. Keyframes and interpolation

- A key: `time`, `value`, **in/out interpolation** (Linear / Bezier / Hold), and for Bezier a per-dimension **speed** (units/second) and **influence** (fraction of the neighbouring segment, 0.1 %–100 %). Those are the numbers After Effects' Keyframe Velocity dialog shows.
- **Easy Ease** = speed 0, influence 33.3 %. Easy Ease In/Out apply to one side only.
- **Spatial** properties (position, anchor) additionally follow a **motion path**: spatial tangents per key, auto-bezier from neighbours, optional **roving** keys (retimed to keep the speed even). Speed is measured along the path via an arc-length table, so ease works in pixels/second along the curve.
- Key icon shape shows the interpolation on each side (diamond = linear, circle = auto-bezier, square = hold, etc.).
- Helpers: `time_reverse` for a selection of keys, `set_key` (insert or replace at time), `key_at`, `velocity`, `speed`.
- **Value graph and speed graph** both exist in the Graph Editor (Shift+F3); you edit the Bezier handles in either.

### Mapping to what we already specced
| Dreams (touch) | EffectCraft (data) |
|---|---|
| Linear | Linear/Linear |
| Ease in (slow start) | out: Bezier speed 0, influence ~33 %; in: Linear-ish |
| Ease out (slow end) | in: Bezier speed 0, influence ~33 % |
| Ease in-out | Easy Ease both sides |
| spacing ticks | sample `ease_progress` at each frame; draw a tick per frame |
| Hold | Hold |

So the **four friendly easing buttons are just presets over one bezier model**, and the graph editor can come later without changing the data. Blender maps cleanly too: speed/influence → handle position.

## 7. Timeline UI parts worth stealing (touch-adapted in doc 11)

- **Columns**: name, switches, parent, duration, in/out, stretch; each can be hidden. Switches/Modes toggle swaps the switch strip for blend-mode and matte pickers.
- Layer **bars** for duration; **keyframes** in property rows; **CTI** (playhead); **work area** bar; **navigator** (the grey bar with end handles that scrolls/zooms the visible time); marker bin.
- **Shy** layers + "hide shy" = tidy the outline without deleting.
- **Labels** (color per layer/key).

## 8. Not studied yet
Expressions (`crates/expr`), masks and rotobezier, effect parameter evaluation, the render queue. Out of scope for 2Dope v1 except the idea that any property may later accept a formula.

## What 2Dope takes / skips
| Take | Skip |
|---|---|
| Comp/layer/precomp model, time mapping formula, preserve frame rate, collapse = "blend through" | 3D layers, cameras, lights, motion blur, adjustment layers (later) |
| Move-all vs leave-all precompose | Responsive-design time protection |
| Exposed (★) properties with per-instance override | Full Essential Graphics templates/media replacement |
| Bezier speed/influence under four friendly easings; spatial tangents later | Expression language (v1) |
| Time remap as a layer property (freeze, loop, ramp) | Proxy/footage management |
