# Clip Studio vector layers: next features for 2Dope

2026-11-01 · follow-up to [VECTOR-BRUSH-REA-2026-10-30](../clip-studio-paint/VECTOR-BRUSH-REA-2026-10-30.md).
Reference only; no code changed here. Companion:
[Procreate brush system](../procreate-brush-system/README.md).

## Where the earlier pass left off

That study established: CSP vector tools are distinct operations (control point, connect, simplify,
fill, eraser), correction is more than moving points, brush-shape variety is a separate preset system,
and 2Dope already has editable vector strokes, point editing, joins, whole/crossing erase, selection
clipping and brush replacement. It listed seven concrete gaps; this doc turns them into work.

## Ranked features

| # | Feature | Why (evidence) | Shape | Effort |
|---|---|---|---|---|
| 1 | **Segment-accurate eraser hit test** | `touchedAt()` tests stored points, so an eraser can cross a long segment without a hit; reach uses base size, not the visible footprint | Distance from the eraser path to each segment (not each point), with the stroke's final width at that segment as the radius; keeps whole/crossing behaviour | S |
| 2 | **Cuts keep local width** | `vectorcut.at()` interpolates pressure/tilt/time but omits `w` — split ends lose a hand-set width | Interpolate `w` alongside the other channels in the same helper | S |
| 3 | **Simplify / smooth a vector line** | CSP's correction reduces control points after the stroke; 2Dope re-samples instead | `simplifyStroke(stroke, tolerance)` + `smoothStroke` over the stored points, one undo, keeps endpoints and width profile | S–M |
| 4 | **Authored handles and corner modes persist** | `pointModes`/`pointHandles`/`anchorCache` are app maps, not `StrokeRecord` data; saves round-trip sampled points only | Additive optional fields on the stroke: per-point mode and handle offsets; migration default = sampled; undo covers them | M |
| 5 | **Whole-line / intersection erase modes** | CSP offers touched-area, intersection and whole-line; 2Dope has whole and crossing | Add "Whole line" (delete a line the eraser touches at all) and "Only intersection" (erase where the eraser crosses, not where it merely starts) | S–M |
| 6 | **Vector settings parity** | The renderer ignores custom tips, grain, spacing, flow, opacity dynamics, tilt and anti-alias on vectors | Feed the existing `BrushSettings` channels into the vector renderer where they are cheap (spacing/tip/grain first); see the brush doc | M |
| 7 | **SVG export of a vector layer** | No SVG writer was found; CSP/SVG interchange is the standard handoff | Write path data + width profile + colour; one file per layer or per shot | M |
| 8 | **Vector fill (planar map)** | The largest gap; needs region detection between open lines | Detection + fill assignment; separate project | L |

## Implementation notes

- **Eraser (1)**: iterate segments; early-out by bounding box; use `distancePointToSegment`; radius =
  `w`-interpolated half-width (or brush size × pressure). Tests: a 300 px segment with points only at
  the ends must be hit mid-way; a thin tail must not be hit at base width.
- **Cuts (2)**: one helper already receives pressure/tilt/time; add `w`. Test: set a point width,
  erase through it, both new ends keep the interpolated width.
- **Simplify/smooth (3)**: reuse `anchorsOf()` but with a per-segment tolerance, not whole-stroke
  bounds — that also fixes the "small detail lost on a large stroke" gap. Tests: a 60-point wobbly
  line reduces below 15 points and stays within tolerance at every frame sample.
- **Handles (4)**: prefer optional fields over a new schema version: `points: [{x,y,p,t,w,mode?,hx?,hy?}]`.
  Unknown files still load; older builds ignore the new fields.
- **Modes (5)**: keep the current two behaviours as defaults; add the other two behind the existing
  eraser-mode control, and record which mode was used in undo labels.
- **SVG (7)**: path from the centreline + stroke width; no fills until (8). Round-trip test: export →
  re-import → same point count and bounds.

## Validation

A single fixture that draws: a long low-point line, a variable-width line, a crossing pair, and a
closed shape; then erases mid-segment, cuts through a width peak, simplifies, and exports SVG. Assert
hits, widths, point counts and exported path data.

## Limits

- CSP behaviour is from its shipped tool data and documentation (earlier study), not runtime
  measurement.
- Nothing here is a parity claim for CSP's correction algorithms; the tolerances are ours.
