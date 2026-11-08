# Claude iteration 3 — brush accuracy and vector features

2026-11-01. Read first: `AGENTS.md`, the top dated `HANDOFF.md` section, then
[Procreate brush system](procreate-brush-system/README.md) and
[Clip Studio vector next](clip-studio-vector-next/README.md).
Excluded from this round: Moho deep dive (later), storyboard-pro, more `.jsxbin` mining.

Standing rules: preserve other sessions' uncommitted work; no commit/push; one undo step per edit;
update `manualtext.ts` + `UPDATES`; `npm test` + `npm run build` + affected fixtures on
`127.0.0.1:5217`; never clear project storage; Windows `spawn EPERM` → rerun outside the sandbox.

## A. Brush import accuracy (why "texture" and "feel" differ)

The corpus: Procreate 5.4.9 Signature archive (124 keys) and 241 Dreams `.brush` archives with
min/median/max per key. 2Dope's importer takes only 7 settings; the renderer supports more than it
receives.

- **A1 dynamics curves**: import `dynamics…Curve.points` into `Dynamic.curve`, negative
  `dynamicsPressureSize`/`dynamicsSpeedSize` into `invert`, and `…Response`/`…Speed` where the model
  can hold them. Test: a brush with a reversed pressure size imports as inverted and a stroke tapers
  the same way at the same pressures.
- **A2 mapping gaps**: `plotSmoothing` → `smoothing`, `plotMovingAverageStabilization` → `stabilize`,
  `dynamicsJitterSize` → `sizeDyn.jitter`, taper `Start/End`, `Size`, `Opacity`, `Pressure`, `Shape`,
  `SizeLinked`; widen the scatter clamp to the corpus range (0–8) if the renderer can take it.
- **A3 grain parity**: read `bundledGrainPath` from the brush folder, map `grainBlendMode`,
  `grainDepth`, `grainDepthMinimum`, `textureScale`, `textureMovement`, `textureZoom`,
  `textureRotation`, `textureOrientation` into the grain pass. Start with the blend modes the corpus
  actually uses (1 and 28 dominate; list the rest as unsupported), and make grain scale follow brush
  size.
- **A4 unsupported-key report**: a debug listing where every archive key is either mapped or
  explicitly listed as unsupported. No silently dropped settings.

Acceptance: import ten representative brushes (2B pencil, Acrylic, Airbrush, Dry Ink, Grainy Shader,
Chalk, Spray, Watercolour, Inker, Marker); grain visible and scaled, pressure ramp matches the
archive curve, taper ends match, no crash on a malformed archive.

## B. Vector features (from the CSP study)

Order is deliberate: fix correctness before adding tools.

1. **Eraser hit test on segments, not points** — distance to each segment, radius = interpolated
   stroke width; test a 300 px two-point segment hit mid-way.
2. **Cuts preserve local width** — interpolate `w` in `vectorcut.at()`; test a cut through a width
   peak.
3. **Simplify / smooth a vector line** — tolerance-based point reduction and smoothing, endpoints and
   width profile kept; test a wobbly 60-point line → under 15 points within tolerance.
4. **Authored handles and corner modes persist** — additive optional per-point fields (`mode`, `hx`,
   `hy`), old files load, undo covers edits.
5. **Erase modes** — add "Whole line" and "Only intersection" beside the existing whole/crossing.
6. **SVG export of a vector layer** — centreline path + width; round-trip test (point count, bounds).

Acceptance: the fixture (long low-point line, variable-width line, crossing pair, closed shape)
erases mid-segment, cuts through a width peak, simplifies, and exports valid SVG.

## Decisions to confirm

- Grain blend mapping: start with Procreate modes 1 and 28 and list the rest unsupported — confirm
  before guessing the rest.
- Scatter clamp: raising it changes existing imported brushes' look; decide whether that is a
  migration or only for new imports.
- Handles: additive fields rather than a schema bump.

## Done when

Both packages pass tests/build/fixtures; the brush import report exists for the ten brushes; the
vector fixture passes; manual + `UPDATES` + HANDOFF updated. No commit or push.
