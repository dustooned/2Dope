# CLIP STUDIO PAINT vectors and custom brushes: REA study

Date: 2026-10-30 (America/Los_Angeles). Research for 2Dope; no application implementation in this change.

## Finding

**A practical direction for 2Dope is editable strokes with replaceable brush appearances.** The current app already retains points, pressure, tilt, time, local width, a brush snapshot and a random seed. Its vector renderer, however, turns these into one smooth solid outline. More presets alone will not provide the requested range of vector styles.

CLIP STUDIO PAINT (CSP) provides an instructive combination: drawing with familiar brushes, retaining editable line geometry, changing a line's appearance later, and cleaning intersections without redrawing. REA establishes separate tool parameters for these operations and a separate database of brush-shape presets. It does **not** establish the proprietary algorithms from those parameters alone.

The implementation proposal is in [VECTOR-BRUSH-IMPLEMENTATION-PLAN.md](VECTOR-BRUSH-IMPLEMENTATION-PLAN.md). The original UI-registry study remains in [README.md](README.md); its description of 2Dope's command UI predates the later registry changes.

## Evidence boundaries

| Label | What it establishes | What it does not establish |
|---|---|---|
| REA / shipped data | Exact SQLite schemas, selected committed rows, file digests, preset labels and numeric settings | Runtime enum meaning, whether an option is enabled for vector targets, rendering math |
| REA / native static | Executable identity and any completed string/reference/function observations recorded below | Latency, stylus response, execution of a code path |
| Official documentation | Published user-visible behavior, with version drift possible | Matching implementation inside the local 5.0.4 binary |
| 2Dope source | Behavior and limitations visible in the current implementation | Passing tests or physical-device validation in this investigation |
| Proposal | An original design for 2Dope | A recovered CSP data model or implemented feature |

No original CSP source was available. No proprietary brush art, material images or executable code is installed into 2Dope. Native code and shipped configuration remain reference evidence. No usable live drawing or physical tablet comparison was captured in this pass.

### Target identity

- Executable: `C:\Program Files\CELSYS\CLIP STUDIO 1.5\CLIP STUDIO PAINT\CLIPStudioPaint.exe`.
- Windows version metadata: file `5.0.4.0`, product `5.0.4`; installation-directory name is not the product version.
- Size: 93,357,664 bytes; x86-64 PE as identified by REA `open_binary`.
- SHA-256: `11a8ceab708dfac1efea4b85d9febc52a7de8a5e8c37de59cc17dc53b93e0b89`.
- Native provider selected: Ghidra 12.1.4. Opening the binary identifies the target; completed queries are required before claiming code analysis.
- English tool database: `Settings\PAINT\Tool\english\EditImageTool.todb`, 893,952 bytes, SHA-256 `c06ba91bf341f099aa5bda1004d05c99d660dbb45c9acd01a9a8d2ef7a21a77e`.
- English brush-shape database: `Settings\PAINT\BrushPreset\english\BrushPreset.bfps`, 135,168 bytes, SHA-256 `dfdd42c6470a2ec4c170d8bad167128e23ba09b3aa6cd62ae1e77509ca9fdf13`.
- REA SQLite inspector: SQLite 3.53.4; both databases report UTF-16LE; no sibling WAL observed.

Raw evidence is retained in [vector-brush-rea-2026-10-30.evidence.json](vector-brush-rea-2026-10-30.evidence.json). Preserve the full records, including limitations, when reusing the findings. Database rows have unspecified order. The requested limits returned all 255 tool nodes, all 406 sampled tool variants, all 15 brush-preset nodes and all 28 sampled brush-preset variants, with `truncated: false`. A one-row schema query is intentionally not a complete row inventory.

### Question checklist

| Question | Status | Evidence / remaining work |
|---|---|---|
| What vector editing operations are shipped? | Answered for tool declarations; documented for UI behavior | Tool Node/Variant rows; official vector-layer manual |
| Are brush appearances separate reusable presets? | Answered for shipped storage | Separate BrushPreset.bfps Node/Variant database |
| Which styles have materially different settings? | Answered for selected shipped examples | Calligraphy, dashed line, chains, dry ink, chalk and marker rows |
| What are the exact native geometry and rendering algorithms? | Partly answered in the legacy companion; modern tool use unresolved | Three decompiled functions below; primary-executable tracing and runtime corroboration remain separate |
| How does CSP feel with a stylus? | Unresolved empirically | Requires pressure-capable device, measured live/committed strokes and latency comparison |
| What already exists in 2Dope? | Answered by source audit | Editable records, solid outlines, point editing, joining, crossing erase, selection clipping |
| Can 2Dope support custom editable brushes? | Feasible design, not implemented | Versioned renderer, material replay, durable path/channel storage and packaging work |
| Is full CSP brush/file compatibility established? | No | No .sut/.clip importer or proprietary material decoder was built |

The canonical REA bundle also retains two open residual questions: modern vector-rendering internals (`unk_4e7e4f54fdce452373f512cf4de73260d8ac511b1b801d9ab05cde0bc7e7dd2c`) and measured physical-pen feel (`unk_f53a94ff53bd33475ae02aa6fb6e8c80f391b0c5322aefb322c86afb38410eed`). They require new native or controlled-replay evidence respectively; this study does not mark either resolved.

## REA findings from shipped tool data

### 1. Vector tools are distinct operations

`Node` identifies the visible tool and links its `NodeVariantID` to the parameter record. The following links were returned by REA, not inferred from screenshots:

| Shipped node | Variant ID | Input / output operation IDs |
|---|---:|---:|
| Control point | 175 | 80 / 80 |
| Pinch vector line | 177 | 82 / 82 |
| Simplify vector line | 181 | 10 / 81 |
| Connect vector lines | 461 | 10 / 81 |
| Adjust line width | 183 | 10 / 83 |
| Redraw vector line | 487 | 85 / 85 |
| Redraw vector line width | 489 | 84 / 84 |
| Object | 37 | 45 / 45 |
| Vector (eraser) | 173 | 12 / 12 |

Evidence: `ev_67c9cf111d4c42abd438f4806edfd282bbdb9ebdb8a67c7b1a19f9f8a4df07f2`.

Do not implement these integers as a guessed public API. They identify the local installation's stored tool declarations. They suggest a reusable tool/parameter system, with different processing operations for geometry and line appearance.

### 2. Correction is more than moving points

The 504-column tool `Variant` schema contains separate families:

- **Pinch:** `VectorPinchOperation`, `VectorPinchLevel`, `VectorPressureForPinchLevel`, `VectorPinchArea`, `VectorAddVeretexByPinch`, `VectorConnectByPinch`.
- **Simplify / join:** `VectorUseSmooth`, `VectorSmoothLevel`, `VectorSmoothCorner`, `VectorWholeForSmooth`, `VectorUseConnect`, `VectorConnectLevel`, `VectorConnectDifferent`, `VectorUseDust`, `VectorDustSize`.
- **Width:** `LineWidthOperation`, add/subtract/multiply/divide/constant values, `LineWidthRemainCoreLine`, `VectorAddVertexByLineWidth`, `LineWidthSmoothLengthValue`.
- **Object behavior:** `ObjectVectorChangeWidth`, `ObjectVectorOperation`, alongside object selection/transform fields.
- **Eraser / snapping:** `BrushUseVectorEraser`, `BrushVectorEraserType`, `BrushVectorEraserReferAllLayer`, `BrushUseVectorMagnet`, `BrushVectorMagnetPower`.
- **Fill reference:** `FillReferVectorCenter`, `FillIncludeVectorCenter`, `IncludeFillUseTouchVectorLine`.

Spelling such as `Veretex` is preserved from the shipped schema. Field existence establishes a stored concept, not its processing algorithm or exact UI unit.

Selected parameter contrasts give more useful evidence than an undifferentiated field list:

| Variant | Selected observed values | Bounded interpretation |
|---|---|---|
| Pinch 177 | level 10, area 30, add-vertex 0, connect 0 | Pinch influence and connection are separate settings |
| Simplify 181 | use-smooth 1, smooth level 10, use-connect 0 | Simplification can be configured independently from joining |
| Connect 461 | use-smooth 0, use-connect 1, connect level 10, connect-different 0 | Same broad processor family, different preset intent |
| Width 183 | brush size 40; add 1; multiply 1.1; divide 0.9; constant 5; add-vertex 1; smooth length 70 | Width modification has several stored quantities and can request additional vertices |
| Eraser 173 | use-vector-eraser 1, eraser-type 1 | A specific vector eraser preset exists; numeric type meaning needs independent corroboration |
| Redraw line 487 | pinch-operation 1, connect-by-pinch 0, smooth-level 5, flicker-reduction 6 | Redraw has its own entry and stored correction settings |

Evidence: schema `ev_d8b3abac022066f7bcbd36caabbaa7fdf1a415161d01fe57a77d292c62bfb64c`; selected rows `ev_4c05b202e9cfc74dc3eccf1ac42e6f936641e69ffb6113409e0e0eee352c213c`.

### 3. Custom-style variety involves different mark construction

REA returned these tool variants:

| Tool | Variant | Size | Thickness | Rotation | Pattern image | Ribbon | Other useful contrast |
|---|---:|---:|---:|---:|---:|---:|---|
| G-pen | 6 | 10 | 100 | 0 | 0 | 0 | flicker reduction 6 |
| Calligraphy | 91 | 50 | 18 | 60 | 0 | 0 | A flat, oriented tip is declared separately from pressure response |
| Dashed line | 259 | 5 | 100 | 0 | 1 | 1 | Pattern + ribbon configuration |
| Thin chain | 679 | 20 | 100 | 0 | 1 | 1 | flicker reduction 15 |
| Chain | 685 | 60 | 100 | 90 | 1 | 1 | use-revision 1, revision 20 |
| Bead chain | 687 | 50 | 100 | 90 | 1 | 1 | interval 102.5, order-type2 1 |

Evidence: the Node links and selected Variant rows above. Numeric intervals, rotations and thicknesses are recorded values; their scaling/units and effect on every target type were not experimentally determined. In particular, a ribbon flag does not prove the native tessellation strategy.

The tool schema also separates tip images, tip order/reversal, rotation dynamics, density/flow, paper texture, spray particles, dual-brush data, correction, and starting/ending behavior. Effectors are binary blobs. Their presence does not justify guessing their internal layout or copying numeric settings into 2Dope's different parameter ranges.

### 4. Brush-shape presets are stored separately

`BrushPreset.bfps` is another SQLite database with `Manager` (12 columns), `Node` (24), `Variant` (189), and `sqlite_sequence`. It has no declared indexes, views or triggers. Its preset nodes are:

| Preset | `NodeVariantID` | `NodeInitVariantID` |
|---|---:|---:|
| Dotted line | 61 | 62 |
| Dashed line | 63 | 64 |
| Airbrush | 65 | 66 |
| Watercolor | 85 | 86 |
| Rough wash | 87 | 88 |
| Gouache | 89 | 90 |
| Dry ink | 91 | 92 |
| Chalk | 93 | 94 |
| Pencil (Ver. 3.1) | 95 | 96 |
| Flat marker | 97 | 98 |
| Textured pen | 99 | 100 |
| Real G-Pen | 101 | 102 |
| Pen | 103 | 104 |
| Rough pen | 105 | 106 |

These are 14 named presets plus a root node, not 28 named brushes. A focused follow-up verified both explicit links: each preset has a variant reference and an initial-variant reference, accounting for all 28 rows. The association is established by fields, not just adjacent numeric IDs. The exact runtime reset/apply logic is still untraced.

Selected preset rows show actual variety: Dry ink 91 uses a pattern image and interval 0.97; Chalk 93 uses a pattern image, thickness 50 and texture density 80; Flat marker 97 uses thickness 30, rotation 90 and interval 0.1; Rough pen 105 has pattern-image and ribbon flags set. These are schema/value observations, not proof of full vector compatibility. Some referenced presets also contain dual-brush flags; that alone does not establish which secondary settings are used on a vector layer.

Evidence:

- Inventory `ev_ef442d939c331e66899e7a95f83b364591642dc155468465cdbdc276d61e9281`.
- Variant schema `ev_4551c68306e63389c00fbf0a9994e3bea9b4561fe6f43594f1c295ab0c5921e7`.
- Preset nodes `ev_b7b18d9c55d73220631722ced9d16fdc1284090fe519de7e471d815dcc17c520`.
- Preset values `ev_c9cd7e7b257db88bee757a579114112cbab0da8d57d20ecabe4b73775f86e51d`.
- Explicit variant/initial-variant links `ev_51bfcfe5464ad941997be54a35225ccdf2eebfebbf7c3c8762ab9bbee7313c8e`.

**Design consequence:** a personal brush library and an explicit operation for applying an appearance to existing selected lines are separate features. 2Dope needs both. Editing a library brush should not silently alter old drawings.

## Native-code findings

### Completed native export and import inspection

REA's portable PE inspector completed native export inventories for the executable and three explicitly selected installed companions. This does not depend on Ghidra finishing auto-analysis.

| File | Observed exports | Scope |
|---|---:|---|
| CLIPStudioPaint.exe | 2 | Export table is not a useful inventory of its internal drawing functions |
| QmPdkDll.dll | 56 | Shipped library declarations; no vector algorithm established |
| rtwUtl.dll | 332 | 32-bit library, including `rtImageToVector`; current 64-bit drawing-path use unverified |
| iswCoreTG.dll | 5,919 | Contains extensive named vector, geometry, pressure and rendering declarations |

`iswCoreTG.dll` is 4,540,888 bytes, x86-64, SHA-256 `1817e2b0f7ce49ded2c3fe6360ee9d4f68bf19186faf32835ac6b1c0ce6d227f`. Its Windows version resource identifies it as **IllustStudio Libraries For Trigraph**, file/product version **1.10.0.0**, product name CLIP STUDIO. This is an important legacy-component boundary: its presence beside CSP 5.0.4 does not make its implementation the current drawing engine. Its complete REA export record is `ev_c418e43f6479433c706588dec38da5c24288fd799f8d048f8f4d2f05fefad36e`. A filtered [vector export index](shipped-vector-export-index.json) retains names and PE virtual addresses from that record.

Useful declared entry points include:

| Exported class / operation | Virtual address in this exact DLL | What the declaration establishes |
|---|---|---|
| `CSVStroke::ChangePenHead(CSVPenHead*)` | `0x1245fe20` | A stroke appearance-reference replacement entry point exists |
| `CSVCurve::AddLineScale(float,float)` | `0x1225aac0` | A separate curve-associated line-scale record type exists |
| `CSVEC4OPERATION::CalcLineScaleFromT(...)` | `0x1246d020` | A parameter-to-line-scale operation is declared |
| `CSVEC4OPERATION::DivideCurve(...)` | `0x1246d970` | Curve division has a declared entry point |
| `CSVEC4OPERATION::DivideStroke(...)` | `0x1246e2f0` | Stroke division has a declared entry point |
| `CSVec4Cut::DivideStrokeAtIntersect(...)` | `0x1245d160` | Intersection-driven cutting is a declared operation |
| `CSVec4Draw::RenderCurve(...)` | `0x12466e50` | Curve rendering accepts a curve and pen-head reference |
| `CSVec4Draw::RenderCurveByConvex(...)` | `0x12468370` | Another rendering entry is declared; the algorithm is not proven by its name |
| `CSVec4Connect::MergePressure(float)` | `0x12457d00` | Joining has a separate declared pressure-merging operation |

Exports also distinguish `CSVectorSampling::AddCurve(_VCURVE)` from `AddPres(_VVPRESSURE)` and expose conversion/read/write methods. This is **declaration-level evidence in a shipped companion**, supporting further investigation of separate path, pressure and appearance concepts. It is not a recovered `.clip` schema or a proof that the current tool executes these methods.

REA inspected the main executable's import and delay-import tables completely: 65 DLL descriptors, 1,614 functions, no delay-import descriptors (`ev_4c6ca897bd2fbead051cd8bb6cf25da047bbda97d25b2c77edd32ebc71c03952`). `iswCoreTG.dll` is absent from those static imports. Dynamic loading and indirect use through other modules were not established. Therefore **the companion's functions must not be presented as the confirmed active renderer for CSP 5.0.4**. `ClipPreview.dll` imports were also inspected (`ev_0191c0cee910392ff29649054aca5c84522852b344e6764ad1def95861fab693`); its name alone does not resolve that reachability question.

A focused dependency check did establish a file-plugin boundary: `TGXPGPlugInCore.dll` statically imports 257 functions from `iswCoreTG.dll`, including the exact `CSVEC4OPERATION::DivideCurve` export analyzed below. Its Windows description is `XPG File PligIn For Trigraph`, version 1.10.0.0 (spelling preserved from its resource). REA's complete import record is `ev_2f0891a329fea2e688de0f3e3ff538695844f9fcb56e2c2594ff4c944bf1b4f1`; 12 DLL descriptors, 485 imported functions, no delay imports. This establishes a shipped file-plugin dependency on the legacy vector code. It does not prove that this is its only use, or connect it to the current live inking tool.

### Ghidra analysis status

The first main-executable string query did not finish import/auto-analysis before REA's 330,000 ms startup deadline. REA returned `provider_timeout`, incomplete output and no confirmed out-of-memory event. See [the compact failure record](native-analysis-attempt-1.json). This is a failed analysis attempt, not a successful string search or evidence that the searched features are absent.

After exporting completed evidence and checking `cleanup_pending: false`, the REA runtime startup setting was raised to 1,800,000 ms for a new attempt. The host connection then canceled the call at its separate **450-second client deadline**, before a REA result arrived. No string-search records were retained from it. See [the client-deadline record](native-analysis-attempt-2.json). The MCP binary session was closed after preserving completed evidence. The investigation then used an explicit local REA stdio session with a longer call deadline, without changing persistent client configuration.

The default-analysis local pass was deliberately ended after roughly 14 minutes of continuing analysis so the investigation could focus on the requested references and selected functions. Process cleanup was checked before starting a reduced profile. The focused profile disables **Stack**, **Decompiler Switch Analysis**, **Decompiler Parameter ID**, and **Call Convention ID**; installed Ghidra source supplied the exact analyzer names, and its log confirmed all four were disabled. This sacrifices global stack/signature inference and switch-target recovery. String discovery and resolved references remain bounded by the resulting profile; selected-function decompilation remains available. The separate default-profile companion results above are not retroactively assigned this reduced profile.

**Final main-executable outcome:** the focused pass also returned `provider_timeout`, after its **1,800,000 ms (30-minute)** startup window. The exact target digest remained unchanged. No out-of-memory error was confirmed. Profile digest: `c5919e3258e315d5591f6ca7b38b1cdf17b4e2d47c293767def489623f3261e7`. See [the compact outcome](native-analysis-attempt-3.json) and [the complete diagnostic response](native-main-strings.result.json). These are failure diagnostics, not successful native Evidence records. The queued string-reference/function follow-ups were not executed after the error.

Consequently, this pass establishes **no modern main-executable vector-rendering algorithm**. The completed primary-executable facts are identity and portable PE import/export observations. Do not infer feature absence or renderer equivalence from incomplete Ghidra work. The optional Rizin string-listing route passed approval after verifying that the connector had no active binary session, but its configured provider could not launch (`capability_unavailable`, `ERR_REA_WINDOWS_NATIVE`); it supplied no target observations.

The local helper stopped on failure and closed its owned REA session. A process check confirmed zero remaining task-owned Ghidra analysis processes and zero local research runners. The original connector's temporary startup setting was reset to its 330,000 ms launch default. No persistent client configuration was edited.

### Completed function analysis: replacing a pen head

REA CLI/Ghidra successfully decompiled `CSVStroke::ChangePenHead` at `0x1245fe20` in the exact shipped `iswCoreTG.dll` above. The full [function evidence](shipped-core-change-pen-head.evidence.json) is separate from the MCP session bundle: `ev_64b88713ea2b2e468a3a9b5b179b947266e3d8341f74c7600bfcf4f6e33c8b1d`. Ghidra reports a 203-byte function, 58 instructions, 17 basic blocks and an available, untruncated native value-flow record. Its pseudocode is decompiler output, not original source.

Observed in the recovered instructions and pseudocode:

1. Read two floating-point properties from the old and new pen-head references. Compute one difference and one old/new ratio. Negative differences are adjusted by 360.
2. Walk a stroke-associated linked list and nested per-item list. Depending on two stroke flag bits, assign or combine those values with two stored floating-point properties.
3. Replace the stroke's pen-head pointer and set flag bits `0x0c`.
4. Ghidra resolves two direct call sites inside `CSVec4Connect::MergeTwoStroke` (`0x1245859b`, `0x124585a7`) to this method. No callees or unresolved calls are reported inside the small method.

**Inference:** the wrapped difference is angular compensation and the ratio is scale compensation. Exact semantic field names, units other than the evident 360-degree cycle, and the complete object's layout have not been established. This supports the narrower conclusion that appearance-reference replacement in this library includes local-value normalization; it is not just a pointer swap. It does not prove the current CSP Object tool invokes this method, nor that it covers arbitrary modern custom brushes.

**2Dope consequence:** explicitly choose whether restyling preserves existing line width/orientation or adopts the new brush's defaults. Joining strokes with different appearances also needs a defined conversion rule. Copying the first stroke's brush onto the second is not sufficient to promise preservation.

### Completed function analysis: splitting geometry and its channels

REA decompiled `CSVEC4OPERATION::DivideCurve` at `0x1246d970–0x1246df88`: 1,561 bytes, 365 assembly rows, 48 basic blocks, seven resolved callers and nine resolved callees. The retained value-flow capture reports `truncated: false`. Full [split-function evidence](shipped-core-divide-curve.evidence.json): `ev_f8252a34ad14ee1d1199823f31bf298380900ccfb7763405f8b986234538c668`.

Observed behavior:

- Construct a `CSBezier` from a curve and call its `Divide` helper; create two replacement curve records, insert them into the parent's linked curve structure and unlink the original. The helper's own subdivision math was not inspected.
- Process a separate linked sequence of four-float auxiliary sample records. If `s` is the split coordinate and `t` a source sample coordinate, map the left side to `t/s` and the right side to `(t-s)/(1-s)`.
- At a split between two samples, compute an interpolation factor, linearly interpolate two scalar fields, and use `CalcDirectionBetweenTwo` for a direction-like field. Store matching values at left endpoint coordinate 1 and right endpoint coordinate 0.
- Handle coordinates close to an existing sample with a 0.001 tolerance and ensure endpoint samples are present.
- Resolved callers include `CSVec4Cut::MakeEraserEdge`, `DivideStroke`, `DivideTooSharpCurve`, `DivideLongCurve`, `CSVec4Sampling::CreateBezierCurve` and `ModifyEndShape`.

This is substantive static evidence for keeping editable geometry and associated channels coherent through a split. The sample coordinate is a normalized curve parameter; **arc length, texture phase and stamp identity are not established**. The exact scalar meanings are unresolved from this function alone; the renderer below further constrains one to an extent-like multiplier. Calling them recorded pressure, opacity or texture channels would exceed this evidence.

**2Dope consequence:** a cut must interpolate every appearance channel and reparameterize the resulting records, rather than only cutting the centerline. In particular, the current omitted `w` at new endpoints is a concrete gap. Material-phase preservation is a further design requirement; it was not recovered from this function.

### Completed function analysis: a geometric curve renderer

REA decompiled `CSVec4Draw::RenderCurve` at `0x12466e50–0x12468360`: 5,393 bytes, 1,241 assembly rows, 175 basic blocks and 18 resolved callees. Full [renderer-function evidence](shipped-core-render-curve.evidence.json): `ev_d4baab6242c98b33a1144c67c827f7cc48d93f556968a56e8da8b112f47fe43e`. Its high-p-code value-flow capture **is truncated**, with an omitted-operations lower bound of 1 and 46 known omitted edges. The retained pseudocode and instruction listing are available; the data-flow graph is not exhaustive.

In the inspected body, one curved branch estimates length with `CSBezier::CalcLengthFast`, chooses at least two parameter steps, evaluates points/tangents and interpolates auxiliary samples as it traverses the curve. It calls `CSVPenHead::CalcFarestPoint` to produce offsets, adds those to path positions, stores boundary points and calls `FillPolygon`. Other branches handle straight geometry, corners, endpoints and transforms. Several choices are controlled by stored flags.

Cross-checking this function with `DivideCurve` shows the same auxiliary sample layout. One scalar (`+0x10`) multiplies a nominal geometric extent before the pen-head query, narrowing its role to a width/extent-like channel here. Its origin as pressure, authored width or a combined value is unknown. The pen-head helper receives tangent, direction-like and scale-like inputs, whereas 2Dope currently constructs round-normal offsets.

The length estimate controls a uniform **parameter** increment, not proven uniform distance sampling. One inspected curved branch evaluates a quadratic Bernstein point expression; this does not establish the representation of every CSP curve. A conditional small-extent branch adjusts geometric extent and the packed-color high byte together, suggesting coverage compensation; a complete anti-aliasing algorithm was not recovered. `CSVec4Draw::RenderStroke` is a resolved same-library caller.

**Bounded interpretation:** this is an outline/envelope construction path in the legacy companion. The inspected function does not establish modern material-tip or ribbon rendering, and the truncated graph cannot establish absence of other behavior. No renderer parity or modern runtime reachability follows from this result.

## Documented behavior to reproduce

The following are published behavior targets, not runtime measurements of the installed executable.

- CSP vector layers retain editable lines. Object editing can change their shape and appearance. The Control point tool includes movement, insertion, removal, corner switching, width, opacity and splitting. Filling belongs in a separate raster workflow. SVG interchange carries line geometry with substantial appearance limitations. See the official [vector-layer manual](https://help.clip-studio.com/en-us/manual_en/180_layers/Vector_layers.htm).
- An existing vector line's brush shape can be replaced through Object settings. See official support, [editing vector lines](https://support.clip-studio.com/en-us/faq/articles/20200066).
- Brush-shape presets, image-material tips, multiple tips, thickness and angle are configurable. This supports a richer appearance system than a single round outline. See [Brush shape / Brush tip settings](https://help.clip-studio.com/en-us/manual_en/810_subtools/B.htm).
- Stabilization and post-correction are separate controls. Post-correction acts after the stroke and can reduce vector control points; speed and view scale can affect correction. See [Correction settings](https://help.clip-studio.com/en-us/manual_en/810_subtools/C.htm).
- Vector erasing includes touched-area, intersection and whole-line options; intersection reference can include other layers. A transparent brush mark can remain an editable mark, which differs from using an eraser. See [Eraser tools](https://help.clip-studio.com/en-us/manual_en/240_brushes/Eraser_tools.htm).
- Ribbon appearance deforms an image along a curved line, while stamp-like repetition keeps individual elements. See the official creator's [decoration-brush lesson](https://tips.clip-studio.com/en-us/articles/680).

Current online documentation may describe features added after local 5.0.4. Do not import later-version Smart Shape behavior into a claim about this executable.

## What 2Dope already has

The source audit began at HEAD `7287a478b9503da73355e60a2615f4811c8642c5` with concurrent pen-settings work in progress. That separate work was subsequently committed as `30fd0e579ea097e9fb3e075fb1dd8228c134a5a4` (pen and tablet settings); the renderer, tip exclusion, cut interpolation and anchor-function findings were rechecked there. This audit was read-only. File line numbers can move; function names are stable navigation anchors. The pen-settings changes and their reported tests are not products of this REA study.

| Area | Source anchor | Existing capability / boundary |
|---|---|---|
| Stroke data | `src/core/stroke.ts`, `StrokePoint`, `StrokeRecord` | Position, pressure, tilt, time, local `w`, brush snapshot, color, seed |
| Cel model | `src/core/project.ts`, `Drawing`, `paintDrawing` | Mixed drawing: raster Fill → raster Line → editable vectors |
| Vector appearance | `src/brush/vector.ts`, `vectorWidths`, `drawVectorStroke` | Pressure/tilt-driven width, taper, local width, global opacity; solid filled outline with round caps |
| Brush exclusion | `src/app.ts`, `beginStroke` | Pen records explicitly remove `tipImage` and `grainImage` |
| Point editing | `src/app.ts`, `enterPointEdit`, `togglePoint`, `setPointWidthLive` | Handles, curve/straight modes, line/point/section widths |
| Endpoint joins | `src/core/vecedit.ts`, `joinStrokes`; App point drag | Existing joins; first stroke supplies the combined style and seed |
| Eraser | `src/core/vectorcut.ts`, `eraseVectors` | Whole and crossing modes; sampled-polyline geometry |
| Selection | `src/core/vectorclip.ts`, `clipStrokeToMask`, `eraseVectorsInMask` | Centerline splitting/clipping and selection-restricted erasing |
| Transform | `src/core/selxform.ts`, `transformVectors` | Whole-stroke selection test, brush-size scaling; crossing strokes are not split for transform |
| Library | `src/ui/brushlib.ts`, `saveCurrent`; `src/io/brushstore.ts` | Existing custom-brush management and storage |
| Persistence | `src/io/schema.ts`, `point`, `stroke`; `src/io/projectio.ts` | Native stroke data round-trips; schema currently 3 |
| Shared output | `src/core/project.ts`, `src/view/composite.ts`, `src/io/exportseq.ts` | Vector drawing participates in rendered output; no SVG writer found in the audited IO tree |

### Concrete gaps that affect feel and style

1. **Vector settings do not equal raster settings.** `drawVectorStroke` ignores custom tips, grain, spacing, flow, flat-tip roundness/angle, follow-direction, scatter, opacity dynamics, color variation, wet mix, tilt shading and the anti-alias setting. `vectorWidths` supplies `speed: 0`, so speed dynamics do not respond to the recorded stroke speed. A vector preview can faithfully show this simple renderer while still exposing controls that have no effect.
2. **Authored curve semantics are temporary.** App's `pointModes`, `pointHandles` and `anchorCache` are maps outside `StrokeRecord`. Geometry edits save as sampled points, but exact authored handles and corner modes do not round-trip as document data. Undo restores stroke arrays rather than these maps.
3. **Cuts can lose local width.** `vectorcut.at()` interpolates pressure, tilt and time but omits `w`. New split endpoints can lose the user's local-width adjustment. Selection clipping also uses this helper.
4. **Sparse geometry can miss eraser hits.** `touchedAt()` tests stored points against the eraser path, so an eraser can cross a long segment between samples without a hit. Crossing boundaries use polylines and exclude self-intersections. Reach uses base brush size rather than the final visible variable-width/custom-tip footprint.
5. **Rendering can discard expression.** The renderer thins points at 1.5 document pixels before computing widths. A short pressure/width peak can disappear. Random width reduction is indexed by the retained point number, so resampling or splitting can change the variation.
6. **Anchor extraction is approximate.** `vecedit.anchorsOf()`, called and cached by `App.anchorsFor()`, uses Ramer–Douglas–Peucker tolerance related to the whole stroke bounds. Small intentional details on a large stroke can be omitted. Durable add/delete/split-anchor operations require more than a renderer change.
7. **Material assets need complete lifecycle support.** A custom tip must work after save/reopen, library deletion, My Assets import, undo, export and drawing residency changes. Synchronous callers of `drawVectorStroke` cannot simply acquire asynchronous image dependencies during rendering.

### Input feel worth retaining

`src/brush/smoothing.ts` already has motion filtering with expression recovery, time-window stabilization, exponential and pulled-string smoothing, endpoint catch-up, and post-stroke smoothing over distance. App already handles coalesced samples and preview-only predicted points. These are reusable mechanisms; they have not been measured against CSP on a physical stylus here.

Concurrent `core/pen.ts` and pen-settings work should be re-audited before changing pressure calibration. A second global pressure curve added by this research would risk applying calibration twice.

## Feasibility and priorities

**High confidence:** clean variable-width ink, oriented flat/chisel marks, custom-tip replay along an editable path, explicit brush replacement, stronger point editing, and improved vector erase are achievable with the existing project foundation. This is an engineering assessment, not demonstrated CSP parity.

**More demanding:** deforming ribbon materials, preserving pattern phase across splits/joins, per-point opacity, efficient editing of dense styled lines, and export/residency parity across animated scenes.

**Unproven:** exact native brush dynamics, binary brush-file compatibility, pixel-identical rendering, wet-paint behavior on vectors, and matching stylus latency. A textured editable stroke may use raster tip images; that does not make its centerline non-editable or guarantee infinitely sharp texture at arbitrary zoom.

Start with an isolated specimen that re-renders the **same path** as clean ink, a flat marker, an original dry tip and a dotted/pattern mark, then lets the user move a point and replace its brush. This will test the desired ability directly. Implementing every correction tool first would not resolve the current brush-variety gap.

## Validation state

Actual work in this study: REA target identification; eight completed SQLite evidence records; native import/export inspection; three completed companion-function analyses; source inspection; official-document cross-checks; main-executable investigation as reported above. No application source was changed by this study, no application tests/build were run for these documentation changes, and no commit, push or deployment was performed by this study. The separate pen-settings work was preserved.

Checks completed on the research artifacts: all local Markdown links resolve; every cited Evidence ID is present in the retained static and companion bundles; REA authenticated and imported the static bundle; the local REA helper passes `node --check`; scoped `git diff --check` passed (Git reports only its usual HANDOFF line-ending conversion notice). These checks validate the research package, not application behavior.

Before claiming similar feel, compare slow curves, fast flicks, corners, pressure ramps, taps, reversals and long lines on the same physical device. Record live-to-committed shape changes, pressure response and frame time. Use [the implementation plan](VECTOR-BRUSH-IMPLEMENTATION-PLAN.md) for the proposed acceptance cases.
