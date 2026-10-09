# Deconstruction 02: Harmony Brushes, Pressure, Pegs/Deform → 2Dope

Source: `F:\ToonBoom Harmony\resources` (penstyles_harmony.xml, DUI_*.ui forms). Behavior notes only; no code copied.
Not verified against binaries. ✅ in spec · ➕ gap · ❌ skip

## 1. Brush = one data-only "pen style" (195 presets in one XML)
Harmony brushes are pure parameter bags. Fields found in `penstyles_harmony.xml`:

| Group | Parameters |
|---|---|
| Tip shape | hardness, roundness, angle, randomAngle, flipX/Y, count, randomCount, spacing, randomSpacing, randomOffsetX/Y |
| Dynamics ("stylusFunction") | **size, opacity, angle can each be driven by pressure, tilt, speed, taper, fade**; each has min%, max, enabled, **inverted** |
| Smoothing | `smooth`, `centerlinesmooth` |
| Texture | brush texture (bitmap tip), **paper texture** (enabled / aligned / additive / scale), noise texture scale, opacity texture |
| Dual brush | dualBrushShapeEnabled + dualBrushBlendMode |
| Stamp | stampBrushCycle (cycle through several tip images) |
| Taper | taperType, start/end enabled, % and distance |
| Fade | fadeDistance |
| Flags | isEraser, eraseVector, antialiasing, adjustsTipToCamera |
| Type | style = pencil (raster/bitmap tip) vs vector brush image |

Compare to 2Dope spec (stamp engine: tip, spacing, pressure curves, jitter, scatter, rotation, taper, grain):
- ✅ tip, spacing, jitter/scatter (= random*), rotation, taper, grain.
- ➕ **Any dynamic can use pressure OR tilt OR speed.** Spec lists pressure curves only. Model each dynamic as `{source, min, max, inverted, curve}` so one schema covers all (cheap, powerful).
- ➕ **Inverted** toggle on every dynamic.
- ➕ **Fade distance** (stroke fades out over distance) besides taper.
- ➕ **Stamp cycle** (rotate through multiple tip images).
- ➕ **Dual brush** (second tip masks the first): maps to the Procreate/ABR import already planned.
- ➕ Two smoothing values: stroke smoothing vs **centerline** smoothing (vector fit). Fits raster stabilizer + vector simplify.
- ➕ Brushes are a flat parameter file → matches 2Dope native JSON brush format. Good validation of the plan.

## 2. Pressure editor
`DUI_PressureEditorPanel`: **Min Pressure, Max Pressure, Curve Preset** only. 
- ➕ Keep 2Dope's version this small: min, max, preset curve, optional custom bezier. Don't ship a big dialog.

## 3. Brush options panel (what's actually exposed up front)
Maximum Size · Centerline Smoothing · Flow · Opacity · snapping master switch.
- ➕ Per-tool options bar shows 4 things; everything else hides in the brush editor. Matches spec principle 2 (few panels).

## 4. Stroke tool (vector clean-up)
Options: Smoothness; Draw as straight lines; **Connect line ends; Trim extra lines; Align handles after trim**; apply to Line and Colour art.
- ➕ For the vector milestone (7): "connect ends" and "trim overshoots" as post-draw cleanup, matching spec's later idea "auto-close endpoints".
- ✅ "Apply to Line and Colour art" = our Line/Fill planes (tool writes both).

## 5. Pegs, deformation, IK (the "camera/peg" side)
- **Pegs** = Harmony's null/parent transform nodes. Scene-Planning tool has *Peg selection mode* vs *Control selection mode*. ✅ = our null layers + parenting. 
- Peg vs control distinction: ➕ select the parent controller handle separately from the child art on canvas (spec says null shows as small handles; add the two selection modes).
- **Deform panel**: modes Selection / Setup / Deform / Manipulator; curve type **Catmull, Bezier, Rounded Polyline**; Number of Intervals; Ease In %/Out %; **"Paste on next drawings"**; Copy/Apply. ❌ for v1 (spec non-goal: pin/puppet/warp). Note only: "paste on next drawings" is a fast cleanup trick, maybe reuse as "paste transform onto selected frames".
- **IK**: ease shape preset ("so your motion is not mechanical"), stiffness. ❌ (rigging is out of scope).
- Camera: Harmony camera is a peg + a camera node. ✅ our 2D camera layer is the same idea, simpler.

## 6. Stylus function (shared building block)
`DUI_StylusFunctionProperties` exists as one reusable editor for every pressure/tilt/speed mapping.
- ➕ Build one `DynamicsEditor` component and reuse it for size, opacity, angle, flow. 

## Decisions to add
- [ ] Adopt `{source: pressure|tilt|speed|none, min, max, inverted, curve}` as the dynamics schema?
- [ ] Include Fade + Stamp cycle in v1 brush format or reserve fields only?
- [ ] Peg/control dual selection mode: milestone 3?

## Next
Node/compositing view · Export/render settings · Tool presets (`toolpresets/`) · Shortcuts & menus (`shortcuts.xml`, `menus.xml`) for the keymap preset
