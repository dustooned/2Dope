# 13. Clip Studio Paint: fill, ink, layers, brush import, phone mode (plus Dreams colour panel)

Clean-room study, 2026-10-11. Sources are Clip Studio's public manual, official tips articles and
Celsys announcements, plus the Procreate Dreams handbook for the colour panel (links at the end).
Behaviour only: nothing decompiled, no code or assets copied. Wording is ours.

What the user asked for, in one line each:

1. Fill and paint inside detected lines, fast, on separate layers (Clip Studio style).
2. Crisp, clean ink lines that are easy to make.
3. Import brushes.
4. A better colour wheel (Procreate Dreams style).
5. Transform box should hug the drawing, not the page. **Done** (commit fb468ba).
6. X-sheet: touch selection, move, delete, copy, add frames.
7. Line and fill as sub-parts of every frame, controllable separately in Draw, Time and Motion.
8. Phone detection and a streamlined, CapCut-like phone mode: draw, fill/clean up, light motion, export.

---

## 1. Fill (Clip Studio's fill family)

### What Clip Studio does

| Feature | Behaviour |
|---|---|
| Fill sub tools | *Refer only to editing layer*, *Refer other layers*, *Enclose and fill*, *Lasso fill*, and a leftover pen (*Paint unfilled area*). |
| Refer other layers | Fill on the colour layer while the lines live on another. You pick which layers count: all, a marked **reference layer**, or the layers in a folder. This is the standard way to keep lines and colour apart. |
| Drag to fill | Drag across several closed areas and each one the finger passes over gets filled. One gesture colours a whole character. |
| Close gap | Treats small breaks in the lines as closed. The strength sets the largest gap bridged. |
| Fill narrow areas | With a big close gap, sharp corners and slim slivers count as gaps too and still get filled. |
| Area scaling | Grows the fill past the detected edge by N px (or shrinks it with a negative value), so no thin unpainted rim is left under anti-aliased lines. |
| Tolerance / colour margin | How different a colour may be and still count as the same area. |
| Enclose and fill | Lasso around a region; every enclosed area inside the lasso is filled, and the gaps between lines are ignored. Good for hair and detailed areas. |
| Lasso fill | Lasso a shape and fill it flat, ignoring the lines. |
| Paint unfilled area | Scrub over leftovers (1 px slivers, hair tips, corners) and the small closed holes under the brush get filled with the colour around them. It also cleans fills that went where they shouldn't. |
| Colour target | Fill only transparent pixels, or areas closed by any colour, and so on. |

### What 2Dope has

- Line and Fill **planes** inside each drawing. The fill reads the line plane as its barrier and
  grows under the line, so it can't halo or leak (DECISIONS, slice 3).
- Close gap (`gap`), soft-edge threshold, growth under the line (`under`, which is our area scaling).

### Gaps and design

| Add | How |
|---|---|
| **Drag fill** | Hold the fill tool and drag: each new region the finger enters fills as you go (one undo step). It needs a fast region lookup, see *Speed*. |
| **Speed** | Cache the barrier and distance map per drawing revision (`rev`). The second tap on the same drawing skips detection, and a fill becomes one flood (a few ms). Later this moves to a worker. |
| **Enclose fill** | Lasso, then fill every closed region whose seed lies inside the lasso. It reuses the same flood per region. |
| **Leftover brush** | A brush that, under the finger, fills any closed hole smaller than N px² with the most common neighbouring fill colour. |
| **Fill narrow areas** | After closing, give back slivers narrower than the gap radius when they touch the filled region (we already give back the closing band; this extends it). |
| **Refer to** | The barrier can come from this drawing's line plane (today), from every visible layer at this frame, or from one marked **reference** layer (for example a rough colour-separation line that never renders, as with Harmony's colour lines). |
| **Fill the same spot across drawings** | Tap once with "Next N drawings" on: the same seed point fills on each following drawing whose region contains it. This speeds up flat colour on a whole run. |
| **Recolour everywhere** | Swap one fill colour for another across the layer or the shot. This is cheap because fills are flat, and it sets up palette-linked colours later. |

## 2. Ink: crisp, clean lines

### What Clip Studio does

- **Vector layers**: lines stay editable. You can change width after drawing (scale up/down by brushing over a part), erase "up to intersection" (erasing stops where lines cross, which cleans overshoots in one stroke), or erase a whole line. Lines can also be pulled and smoothed afterwards.
- **Stabilisation** while drawing, and **post-correction**, which smooths the stroke after the pen lifts.
- **Anti-aliasing levels**: none, weak, medium, strong. "None" gives pixel-hard lines that fill perfectly.
- **Taper** at the start and end of strokes.

### What 2Dope has

Raster brushes with taper, pressure and two stabilisers (exponential and pulled string); a minimal vector pen
(pressure width only); strokes recorded as data.

### Design

| Add | How |
|---|---|
| **Ink presets** | "Ink: crisp", "Ink: brush pen" and "Ink: pixel" (no anti-aliasing). Each is a hard round tip with taper, a pressure curve tuned for line art, and strong stabilisation. |
| **Post-correction** | When the pen lifts, fit the stroke with least-squares Béziers (the vector pen question in DECISIONS → *Open*) and re-render it. A slider sets the strength; 0 turns it off. |
| **Anti-alias setting per brush** | Off renders the dab coverage hard at 50 %. This is what makes fills lock tight. |
| **Vector eraser: up to intersection** | On vector strokes: find the crossing points along the touched stroke and cut the piece between the two nearest ones. |
| **Line width after the fact** | Vector strokes only: brush over a part to scale the pressure-width up or down. |
| **Display sharpness** | Optional: on iPad, show the canvas at device pixel ratio so lines don't look soft at high zoom. It costs memory, so it is off in Lite mode. |

## 3. Brush import

### What Clip Studio does

Imports its own `.sut` files and Photoshop `.abr` files (one ABR file can hold many brushes, and they
arrive as a group). The fallback for files that won't import is to register the brush tip as an
image "material" and put it on a copy of an existing brush.

### Formats for 2Dope (interop: we read the user's own files)

| Format | What's inside | Plan |
|---|---|---|
| **PNG / JPG as tip or grain** | One image | First. It works for any brush from anywhere and is the same fallback Clip Studio uses. |
| **Procreate `.brush` / `.brushset`** | A zip: shape image, grain image, a binary-plist settings archive | Read the shape and grain, then map the common settings we have (spacing, size, jitter, pressure, taper). Ignore what we lack and report it. |
| **Photoshop `.abr`** | Sampled tips (grayscale bitmaps) plus dynamics descriptors | Read the sampled tips (v1/v2 and v6+ `samp` blocks) and approximate spacing and size. Written from the format's public notes, without copying GPL code. |
| **Clip Studio `.sut`** | An SQLite database | Later, and optional: needs an SQLite reader (about 1 MB of wasm). |

Engine change needed first: **image tips and image grain** in `brush/dabs.ts`. Today tips are
procedural (hardness, roundness, angle) and grain is generated noise.

## 4. Colour panel (Procreate Dreams, from its handbook)

- **Disc**: an outer hue ring around an inner saturation/brightness disc that zooms for fine touch picks.
- **Classic**: a square plus hue, saturation and brightness sliders.
- **Harmony**: complementary, split complementary, analogous, triadic and tetradic suggestions from the current colour.
- **Value**: precise sliders, numbers and hex.
- **Palettes**: swatch sets that can be imported or made. The default palette shows under the other tabs.
- **History**: the last 10 colours. **Primary and secondary** colours sit side by side (tap to swap).

For 2Dope: the same five tabs, with Disc as the default. It opens as a popover from the colour chip and
as a bottom sheet on phones. Hold on the canvas to pick a colour. Palettes import Procreate `.swatches` and
Adobe `.ase`. The fill and the brush share the colour; a "fill colour" chip can split them later.

## 5. Layer system: line and fill as parts of every frame

Clip Studio's animation folder holds cels. A cel can itself be a folder (line, colour, shadow
layers), and the timeline shows the cel by name. Its light table adds reference cels from any
folder that never export.

2Dope already stores **Line** and **Fill** planes inside every drawing. The change is to expose
them as **parts** of a drawings layer, settable per layer and visible in every workspace:

| Workspace | What you see |
|---|---|
| Draw | The Line/Fill switch becomes a two-row part picker with an eye and opacity per part. Fill can show in "flat check" colours to spot holes. |
| Time / X-sheet | Unchanged timing: both parts always share the drawing's timing, which keeps lip sync and swaps simple. |
| Motion | A drawings layer expands into **Line** and **Fill** sub-rows. Each has opacity, a tint (recolour the lines of the whole shot, or animate a flash), visibility, and an optional offset (position, scale, rotation relative to the layer). All of it can be keyed. |
| Export | Already exports Lines / Fills passes. Blender gets separate line and fill planes later. |

Model (additive, no schema bump): `DrawingsLayer.parts?: { line?: PartSettings; fill?: PartSettings }`
with `PartSettings = { visible, opacity: Prop<number>, tint: Prop<color|null>, offset?: Transform }`.
One renderer change in `composite.ts`: draw the fill plane, then the line plane, each through its part's
matrix, opacity and tint. A third part (shade or highlight) can come later.

## 6. X-sheet touch editing

Today: tap or drag to select, type numbers, notes. Missing: making and moving frames by touch.

**Pure frame-range operations** in `core/timeline.ts`, all tested and each one undo step:

- **Insert blank**: before or after the selection.
- **Duplicate**: copy the selected drawings as new drawings, placed right after.
- **Delete frames**: removes frames, not drawings, and splits holds at the range edges.
- **Clear**: empty cells.
- **Copy / cut / paste**: exposures by reference ("paste as same drawings") or as copies.
- **Move**: move the selected block up or down by N frames, pushing others (ripple).
- **Hold**: +1 / −1 on the selection.

**Touch UI**: select by drag (exists) → a floating action bar beside the selection (Insert,
Duplicate, Copy, Paste, Delete, Hold ±). Long-press and drag the selection to move it, with a ghost and
an insertion line. The strip gets the same bar, so both views behave the same.

## 7. Phone mode (Clip Studio's Simple mode, CapCut-like)

Clip Studio 2.0.5 added a smartphone **Simple mode**: the canvas gets most of the screen, a small set
of core tools switches fast, smart fill handles closed areas, two- and three-finger taps undo and redo,
and export is a share sheet. The full "Studio mode" is one switch away, and the app remembers the mode
per project.

**2Dope Lite** = one device profile driving both the phone mode and the low-memory mode (the
user's earlier idea for students on weak iPads):

```
device.ts  →  { form: phone | tablet | desktop, tier: low | normal | high, limits }
  form   from: smallest screen side < 600 css px and a coarse pointer (plus userAgentData.mobile when present)
  tier   from: navigator.deviceMemory (if present), hardwareConcurrency, iOS model class, and screen size
  limits: max canvas (720p / 1080p / 4K), residency budget, onion count, undo depth, preview scale,
          max layers, display sharpness on or off
```

The user can always override it (Settings → Device: Auto / Lite / Full).

**Phone UI** (portrait first):

- A bottom tab bar: **Draw · Fill · Move · Export**.
- Draw: brush, eraser, ink preset, colour chip, and the flipbook strip with one-tap Add frame and onion.
- Fill: drag fill, leftover brush and recolour.
- Move: light Motion. Pick a layer and drag, pinch or twist on the canvas; tap ◆ to key; choose from 3 easing presets. No graph and no X-sheet.
- Export: MP4 (WebCodecs, where available), GIF or a PNG zip, through the share sheet.

Workspaces, precomps and the Blender export stay in Full, and a project opens fine in either mode.

---

## Plan (recommended order)

| # | Step | Model |
|---|---|---|
| 0 | Transform box hugs the drawing, pivots on it | done (fb468ba) |
| 1 | X-sheet and strip touch editing: frame-range operations (pure + tests), then the action bar and long-press move | Opus for the operations, Sonnet for the UI |
| 2 | Device profile + Lite limits (phone and low memory share it) | Opus |
| 3 | Parts: line/fill settings, compositor, schema (additive) | Opus |
| 4 | Parts in Draw and Motion (sub-rows, tint, opacity) | Sonnet |
| 5 | Fill: cached detection, drag fill, enclose fill, leftover brush, refer to, across drawings | Opus |
| 6 | Ink: presets, anti-alias off, post-correction fit, vector eraser to intersection | Opus |
| 7 | Colour panel (Disc, Classic, Harmony, Value, Palettes, history) | Sonnet |
| 8 | Brush import: image tips/grain in the engine (Opus); PNG, `.brushset`, `.abr` (Opus); import UI (Sonnet) | mixed |
| 9 | Phone mode UI + MP4/GIF export | Sonnet (Opus for the MP4 muxer) |
| 10 | Back to Blender: line/fill planes per part | Opus |

## Sources

- Clip Studio manual, Fill tool: https://help.clip-studio.com/en-us/manual_en/420_fill/Fill_Tool.htm
- Tips: cel shading with the fill tool: https://tips.clip-studio.com/en-us/articles/6331
- Tips: mastering the fill tool (basics): https://tips.clip-studio.com/en-us/articles/590
- Tips: base colours fast: https://tips.clip-studio.com/en-us/articles/6283
- Tips: mastering vector layers: https://tips.clip-studio.com/q/articles/600
- Clip Studio manual, animation cels and light table: https://help.clip-studio.com/en-us/manual_en/600_animation/Animation_cels_palette_and_Light_table.htm
- Clip Studio manual, importing and exporting tools: https://help.clip-studio.com/en-us/manual_en/150_tools/Importing_and_exporting_tools.htm
- Clip Studio FAQ, importable brush files: https://support.clip-studio.com/en-us/faq/articles/20200233
- Celsys, smartphone Simple mode (Ver. 2.0.5): https://celsys.com/en/topic/20230613
- Tips: Simple mode on smartphone: https://tips.clip-studio.com/en-us/articles/8358
- Procreate Dreams handbook, colours: https://help.procreate.com/dreams/handbook/draw-and-paint/colors
