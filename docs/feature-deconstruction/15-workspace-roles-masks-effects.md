# 15. Workspace roles, clipping masks, layer effects, Dreams-style timeline

Evaluation, 2026-10-11, from the user's direction: each workspace gets its own tools, Draw layers get
clipping masks like Procreate Dreams and Toon Boom, Motion gets light After Effects-style effects,
and the drawing rails and Motion share Dreams' zoomable timeline feel. Builds on docs 07/08 (Dreams),
09 (EffectCraft), 10 (Harmony) and 11 (views).

## 1. One job per workspace (and it maps well to phones)

| Workspace | Job | Shows | Moves out |
|---|---|---|---|
| **Draw** | Make the drawings | Tools (brush, vector, fill, eraser, ink presets), colour, layers popover, sidebar (size / opacity / undo), a simple flipbook: frames, + frame, onion, flipbook, play | Hold / exposure inputs, K/B/I marks, onion fine settings → Time |
| **Time** | Get the timing right, write notes, compare versions | X-sheet as the main view (one column per drawing layer), holds, exposure (1s/2s/3s), marks, notes, onion settings, on/off toggles for layers, parts and effects ("does it read better without the glow?") | — |
| **Motion** | Final compositing and last edits | Layers and keys, camera, precomps, split, masks, effects, audio, export | — |

Phones (step 9) use the same split: Draw · Time (light: holds and notes) · Move (light Motion) · Export.

## 2. Clipping masks and mattes

What artists expect (behaviour, from the apps' public docs and doc 10):
- **Procreate / Dreams**: a layer set to *clipping mask* only shows where the layer below it has paint;
  several clipped layers in a row share the same base. Shadows and highlights stay inside the colour on
  every frame without re-cutting them.
- **Toon Boom Harmony**: *Cutter* / *Inverted Cutter* (a matte from another drawing), used for shading
  and tone; doc 10.
- **After Effects**: *track mattes* (alpha / inverted alpha, luma).

Design for 2Dope (additive in the file, no schema bump):

| Option | Effect | Use |
|---|---|---|
| `clip: true` on a layer | Shows only where the **layer below** (the base) has paint; consecutive clipped layers share that base | Shading, highlights, texture on a character |
| Part setting **Clip to Fill** (Line / Fill parts, doc 13 §5) | A layer clipped to the **Fill part** of the base only (not its lines) | Shadow inside the colour, lines stay on top clean |
| `matte: { layer, invert }` | Uses any layer's alpha (or inverted) as the matte; the matte layer can stay hidden | Reveals, wipes, "inside the window" shots |

Renderer: draw the base into a scratch canvas, draw each clipped layer onto it with `source-atop`
(or `destination-in` for a matte), then place the result with the base's opacity and blend. This is
cheap: one extra scratch per clipping group. It works in Motion, exports and Draw's other layers. The
Blender export bakes clipped groups to frames, the same as precomps on their own clock.

UI: layer menu and Layers popover → **Clipping mask** (the row shows indented with a ↳ like Procreate);
the Motion layer row gets a small matte picker.

## 3. Light effects on layers (After Effects-style, on drawings and precomps)

Effects stack per layer (`effects: [{ type, enabled, params }]`), with every number a keyable `Prop`.
They are on/off switchable in Motion and in Time.

| Effect | How | Cost |
|---|---|---|
| Blur | Canvas filter `blur()` | Medium; heavy at 4K |
| Glow | Blurred copy, added on top | Medium |
| Drop shadow | Canvas filter `drop-shadow()` or offset + blur | Low–medium |
| Colour adjust | brightness / contrast / saturation / hue filters | Low |
| Tint / fill colour | Same as the Part tint (source-in) | Low |
| Shake / wiggle | Procedural position and rotation noise, seeded, step every N frames | Free |
| Line boil | Tiny seeded offset and rotation per held step (the "on twos" boil look) | Free |
| Flicker / fade | Opacity presets (keys) | Free |

Risks:
- Canvas filters are fast in Chrome. In Safari they arrived recently, so this must be checked on the
  user's iPad. The fallback is a small WebGL pass for blur and colour.
- Lite mode (doc 13, step 2) previews blur and glow at half resolution and lets you switch effects off
  while drawing.
- Blender gets effected layers as rendered frames.

## 4. Dreams-style rails in Draw, and the same feel in Motion

- Draw's strip becomes **rails**: one row per drawing layer of the comp, with frame thumbnails. Tap a
  rail to draw on that layer (the same as the Layers popover). The active rail is highlighted. Hidden
  layers show dimmed.
- **Pinch** zooms time, and a two-finger vertical drag resizes the rows (Dreams). This uses the same
  zoom levels and handling as Motion, which already pinch-zooms time. Both share one small
  timeline-zoom helper.
- Selection, hold-to-lift, the context menus and drag to move (doc 13 step 1) work per rail.

## Plan (revised; Blender stays last)

| # | Step | Model |
|---|---|---|
| R1 | Workspace roles: slim Draw strip, timing tools to Time, effect / layer toggles in Time | Sonnet |
| R2 | Clipping masks (clip to layer below, clip to fill, matte / inverted), renderer + file + UI | Opus (model, renderer), Sonnet (UI) |
| R3 | Rails in Draw (one row per layer), pinch zoom and row height shared with Motion | Sonnet |
| R4 | Layer effects v1 (blur, glow, shadow, colour, tint, shake, boil, flicker), keyable, toggles | Opus |
| R5 | QuickShape (doc 14) | Opus |
| R6 | Audio in Motion and the X-sheet (waveform, scrub, tied to a layer or free) | Opus |
| then | Colour panel, asset bin, brush import, phone UI, the rest of drawing assist, **Blender last** | — |
