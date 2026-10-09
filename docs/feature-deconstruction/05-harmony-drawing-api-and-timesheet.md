# Deconstruction 05: Harmony drawing data model + Japanese timesheet tools

Source: Harmony's shipped scripting docs and JS (`Plugins/ScriptingInterfaces/resources/js/Drawing/index.js`,
`packages/JapaneseToolbar/*.js`). Public API docs, behavior only. ✅ in spec · ➕ gap

## 1. Drawing data model (from the Drawing scripting API)
- A drawing has **4 art layers by index: 0 Underlay, 1 Colour Art, 2 Line Art, 3 Overlay**. Each art holds **layers**, each layer holds **strokes** (addressed `{layer, strokeIndex}`).
- Paths are Bezier point lists `{x, y, onCurve}` (onCurve=false = control point).
- Geometry helpers exposed: fit bezier to points (`oneBezier` option), discretize at precision 0–100, path intersections, evaluate at params, insert/split at params, point-in-closed-path, nearest point within `maxDistanceSq`, bounding box.
- Coordinates snap to a **rounding quantum of 1/64**.
- **Per-drawing metadata**: key/value strings with an `owner` id in reverse-DNS (e.g. `com.toonboom.x`), so tools/plugins can store data without collisions.
- Drawings have a **pivot** (per-drawing pivot point, separate from layer anchor).
2Dope:
- ✅ planes ≈ arts. ➕ map: `rough` (Underlay, non-rendering), `fill` (Colour), `line` (Line), `overlay` (Overlay, non-rendering notes/corrections).
- ➕ Vector strokes addressable by stable id, not index, so expressions/clips can reference them.
- ➕ **Namespaced metadata on drawings, frames, items** (`owner` reverse-DNS key). Lets classroom tools, Blender add-on, and future plugins store data safely in project.json.
- ➕ **Per-drawing pivot** (rotation point for that pose) besides layer anchor. Useful for swapping poses.
- ➕ Quantize vector coords (e.g. 1/64 px) so files diff cleanly and stay deterministic.

## 2. Timesheet cell markers (anime workflow)
The Japanese toolbar adds typed, namespaced markers on xsheet cells (`com.toonboom.timesheet.*`):
| Marker | Meaning | 2Dope |
|---|---|---|
| key | key drawing (marked + exposed) | ➕ drawing role: key |
| breakdown | breakdown drawing | ➕ role: breakdown |
| actioninbetween | inbetween to be drawn | ➕ role: inbetween (placeholder/TODO frame) |
| reverseinbetween / reversereference | reuse a drawing in reverse | ➕ |
| repeatedzone + repeater | "repeat this cycle N times" | ✅ = clip loop; marker shows it in X-sheet |
| cameraease / fairing, camera pan/point A-B-C, fade in/out, crossfade | camera instructions on the sheet | ➕ camera notes column |
| slidemarker A/E/I/O/U | lip-sync vowel marks | ➕ sound column phoneme marks |
Tools also: rename drawings sequentially, generate timings, export PDF timesheet, export JSON, TOEI import/export.

2Dope takeaways:
- ➕ **Drawing roles (key / breakdown / inbetween)** shown as small badges on thumbnails and X-sheet cells. Huge for teaching: students see their key/BD/IB structure. Onion skin can be set to "keys only".
- ➕ "Inbetween placeholder": a role-only empty frame that marks work to do (assignment checklist).
- ➕ **Printable PDF X-sheet** export (classroom/industry handout).
- ➕ Typed markers use the same namespaced `owner/type` scheme as metadata.
- ➕ "Rename drawings sequentially" command (cleanup after retiming).
