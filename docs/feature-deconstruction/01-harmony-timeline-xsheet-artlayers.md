# Deconstruction 01: Harmony Timeline / Xsheet / Art Layers → 2Dope

Source: files in `F:\ToonBoom Harmony` (xsheet.dict, TL_TimelineMarker.ui, SCUI_DrawingSubLayer.ui)
plus general Harmony knowledge. **Not** verified against Harmony's binaries (REA had no Ghidra/IDA provider).
Status key: ✅ already in 2Dope spec · ➕ gap, consider adding · ❌ skip (violates a principle)

## 1. Core idea: one data model, two views
Harmony stores a grid: **column = layer, row = frame, cell = drawing id**. Timeline and Xsheet are two renderings of it.
- xsheet.dict fields per column: Name, Class, Column#, ID, ColumnAttr, CelsType, **Cels (one compressed string of all cell values)**, Group, Comment, Hidden flag, element type.
- 2Dope: ✅ spec already says "both views edit the same data". 
- ➕ Store cells as run-length (`[drawingId, holdLength]`) in project.json, not per-frame. Matches Harmony's compressed Cels and keeps diffs small.
- ➕ Per-column **Comment** and **Hidden** flags (cheap, useful for classes).

## 2. Timeline
| Harmony | 2Dope |
|---|---|
| Layers as rows, frames across | ✅ |
| Markers: Name, Colour, Note, Duration, Time (TL_TimelineMarker.ui) | ➕ spec lists markers only as in/out + waveform markers. Add the 5-field marker (it's also the classroom "review note" later-idea) |
| Layer thumbnails toggle (show/hide) | ✅ thumbnails; ➕ add the toggle |
| Sound layers are a layer type | ✅ media layer |

## 3. Exposure sheet
- Row per frame, column per layer, cell = drawing number, hold = continuing line. ✅ in spec.
- Harmony also has sound/phoneme columns and per-frame notes. ✅ in spec.
- ➕ Cell edit rules to copy: typing a number exposes that drawing; typing the same number again extends a hold; empty = blank.

## 4. "Art layers" (the part people confuse)
Two different things in Harmony:
1. **Timeline layers** = columns in the scene.
2. **Art layers inside one drawing**: Underlay, Color Art, Line Art, Overlay.
- Harmony's `SCUI_DrawingSubLayer.ui` has **"Convert to Synced Drawing Layer"** (pick a Parent Drawing Layer): a sub-layer becomes its own timeline layer kept in sync with the parent drawing.
- 2Dope mapping: ✅ planes (Line / Fill / Shade) = Color/Line art; ✅ "split & merge" = the synced conversion.
- ➕ Harmony has **Underlay/Overlay** (rough + cleanup planes that don't render). Add a non-rendering **Rough plane** (excluded from export) so animators can rough and clean up on one layer. Fits principle 1 (drawing).
- ➕ Make "synced" explicit: a split Line layer references its parent's drawing ids so exposure edits stay in lockstep.

## Open decisions
- [ ] Add Rough (non-rendering) plane in milestone 1, or defer?
- [ ] RLE cell storage format: `[id, hold]` pairs vs. `{start, id, length}`?
- [ ] Marker fields: take all 5 or just name/colour/time?

## Next deconstruction candidates
Drawing tools / brush properties · Camera & peg (parenting) · Node/compositing view · Export/render settings
