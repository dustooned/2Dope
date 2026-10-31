# Procreate 5.4.9: draw mode and Animate/Animation Assist (continuation)

2026-10-31 · second local pass on the same package read in
[README.md](README.md) (2026-10-26). That pass covered selection and transform; this one reads the
**brush engine parameter surface**, **stabilisation**, **drawing guides / Drawing Assist / QuickShape**
and **Animation Assist**. Same method: shipped Objective-C metadata and strings only. No method body,
shader, default value or runtime behaviour is claimed. Nothing from the package is copied into 2Dope.

## What was inspected

| Item | Value |
|---|---|
| Source | `D:\Downloads\Misc\Compressed\Procreate_5.4.9_Pro.ipa` |
| Bundle | `au.com.savageinteractive.procreate`, 5.4.9 (57074), iPad, minimum iOS 16.3 |
| Information.plist | 23,882 B, SHA-256 `f2991e3a…812533` (unchanged from the first pass) |
| Executable | 19,148,752 B, SHA-256 `3c10dce0b2de599ea126e553bf77a16b713917acc108bba3f61d8a2c45c5130d` |
| Class list | 1,732 entries, 1,732 named, 0 unresolved |
| Selected classes | 17, 926 method records, 1 method list unresolved (`SilicaBrush`, a Swift-only class) |

New local tools (both standard-library Python, supplementary, **not** REA native Evidence):

- `inspect_draw_metadata.py` — the Mach-O/chained-fixup reader from the first pass, extended to dump
  every class name and the full method list of classes matching a regex.
- `strings_scan.py` — literal ASCII/UTF-16 string scan of the executable, for UI labels and key names.

Reproduce:

```powershell
cd beta\docs\research\procreate-5.4.9
python inspect_draw_metadata.py "D:\Downloads\Misc\Compressed\Procreate_5.4.9_Pro.ipa" --names classes.txt
python inspect_draw_metadata.py "…\Procreate_5.4.9_Pro.ipa" --match '^(ValkyrieBrush|ValkyrieStrokeOptions|…)$' --output draw.json
python strings_scan.py "…\Procreate_5.4.9_Pro.ipa" 'streamline|stabilis|smoothing' --limit 120
```

## 1. The brush parameter surface (`ValkyrieBrush`, 539 methods)

`ValkyrieBrush` is the brush document: one property pair per control, so the selector list is a
near-complete inventory of Procreate's Brush Studio. Grouped as read:

| Group | Properties (selector prefixes) |
|---|---|
| Stroke | `plotSmoothing`, `plotSpacing`, `plotSpacingJitter`, `plotSpacingSpeed`, `plotStabilization`, `plotMovingAverageStabilization`, `plotFFTSmoothingAmount`, `plotFFTSmoothingBias`, `plotFFTSmoothingKind`, `streamlinedWindowPointCount`, `dynamicsPressureSmoothing`, `pencilPressureSmoothing` |
| Taper | `pencilTaperStartLength/EndLength`, `pencilTaperSize`, `pencilTaperOpacity`, `pencilTaperPressure`, `pencilTaperShape`, `pencilTaperSizeLinked`, and the same set with `fingerTaper…` |
| Shape | `shapeImage`, `shapeCount`, `shapeCountJitter`, `shapeRotation`, `shapeRoundness`, `shapeScatter`, `shapeAngle`, `shapeAzimuth`, `shapeFlipXJitter`, `shapeFlipYJitter`, `shapeNoise`, `shapeRandomise`, `shapeFilter` / `shapeFilterMode` |
| Grain | `grainPath` / `grainTexture`, `grainBlendMode`, `texturizedGrainFollowsCamera` |
| Texture | `heightTexture`, `heightAmount`, `heightScale`, `metallicTexture`, `metallicAmount`, `metallicScale`, `metallicGrainInverted`, `roughnessTexture`, `roughnessAmount`, `roughnessScale`, `roughnessGrainInverted`, `textureDepth`, `textureDepthJitter`, `textureDepthMinimum`, `textureDepthTilt`, `textureBrightness`, `textureContrast`, `textureMovement`, `textureRotation`, `textureZoom`, `textureOrientation`, `textureFilter` / `textureFilterMode` |
| Wet | `wetEdgesAmount`, `dynamicsWetPull`, `dynamicsWetnessJitter` |
| Smudge | `smudgeSize`, `smudgeOpacity`, `dynamicsSmudgePull`, `savedSmudgeSizes/Opacities` |
| Erase | `eraseSize`, `eraseOpacity`, `savedEraseSizes/Opacities` |
| Clone | `cloneSize`, `cloneOpacity`, `cloneOffset` |
| Colour dynamics | jitter + tilt for hue, saturation, lightness, darkness, opacity (`dynamicsJitter*`, `dynamics*Tilt*`, `hueJitterTiltAngle`, `bleedTiltAngle`, …), plus a `curveTable`/`curveAtIndex` for response curves |
| Flow / mixing | `renderingMaximumFlow`, `renderingMaxTransfer`, `renderingModulatedTransfer`, `renderingRecursiveMixing`, `dynamicsLoad`, `dynamicsDilution`, `dynamicsBlur`, `dynamicsGrade`, `dynamicsFalloff`, `dynamicsAttack` |
| Blend | `blendMode`, `dualBlendMode`, `blendGammaCorrect`, `secondaryBrush`, `secondaryColorJitter*`, `editingSecondary` |
| Sizing | `minSize`/`maxSize`/`maximumMaxSize`, `minOpacity`/`maxOpacity`, `paintSize`/`paintOpacity`/`smudgeSize`/`eraseSize` and their per-tool `sizeForTool:` / `opacitiesForTool:` variants |

Design reads (inference, from names and grouping):

- **Taper is per input device, not global**: Apple Pencil and finger each get their own start/end
  length, size, opacity, pressure and shape; `…SizeLinked` ties size to the stroke.
- **Wet mix and smudge pull are separate dynamics** (`dynamicsWetPull`, `dynamicsSmudgePull`) from
  the static amounts, i.e. the effect can be pressure/velocity-modulated.
- **Textures are a 4-map set** (grain, height, metallic, roughness) with independent scale/amount and
  a triplanar option (`texturizedGrainFollowsCamera`), so the same brush changes with viewing scale.
- **Response curves exist per dynamic** (`curveTable`), which is how "pressure → size" is shaped.

## 2. Stabilisation is a pipeline, not one slider

Strings and selectors agree on a layered model:

| Piece | Evidence |
|---|---|
| **StreamLine**: windowed control-point smoothing with a strength, a pressure strength and a window | `streamlineControlPoint:strength:pressureStrength:window:i:count:current:predicted:`, `streamlinedWindowPointCount`, "Amount of StreamLine", `_streamlineCache` |
| **Moving-average stabilisation**, separate amount | `plotMovingAverageStabilization`, "Amount of moviing average stabilisation." |
| **FFT smoothing** with amount, sample rate and bias, and a *kind* | `ValkyrieStrokeFFTSmoothing -initWithAmount:sampleRate:bias:`, `smoothPoints:…kind:result:`, `plotFFTSmoothingKind`, `globalPlotFFTSmoothingKind` |
| **Zoom compensation** and catch-up | `smoothingZoomCompensation`, `smoothingCatchup`, `smoothingCatchupAtEnd`, `smoothingRadiusMode`, `smoothingValue` |
| **Global vs per-brush** | `globalStabilization`, `globalPlotFFTSmoothing*` next to the per-brush `plot*` values |
| **Prediction** | `accumulatePlots:intoCommitted:predicted:`, "Predicted stroke" paths in `ValkyrieStrokeMode` |

Inference: Procreate smooths the incoming plot stream in more than one stage (moving average, then a
windowed control-point pass, then an FFT pass), keeps predicted plots for latency hiding, and lets a
document-level stabilisation override per-brush values. A single "Smoothing: 0–100" slider is a
simplification of this, not a match.

## 3. Drawing guides, Drawing Assist, Symmetry, QuickShape

- **Guide kinds**: 2D Grid ("2D Grid Settings", `gridSize`, `gridThickness`, `gridOpacity`), Isometric,
  and Perspective with nodes, horizon angle, thickness, opacity and per-node colours
  (`ValkyrieDrawingGuideParameters`: `nodes`, `nodeColors`, `color`, `opacity`, `thickness`, `zoom`,
  `zoomUnit`; `DocumentDrawingGuidePerspectiveLines`).
- **Drawing Assist is per layer and a toggle**, with a Pencil double-tap shortcut: "will toggle
  Drawing Assist on the current layer", "Double-tap on compatible Apple Pencil will toggle Drawing
  Assist…", "Drawing Assist on/off", `primaryLayerAssistedOnEntry`, `assistedValueForFinish`.
- **Symmetry types**: `vertical`, `horizontal`, `quadrant`, `radial`, `rotational`
  (`drawingGuide-symmetry-*` strings, `DrawingGuideSymmetryOptionsPopover`).
- **QuickShape is a detector with error metrics** (`ValkyrieShapeDetection`: `line`, `arc`, `circle`,
  `ellipse`, `triangle`, `equilateralTriangle`, `quadrilateral`, `rectangle`, `square`, `polyline`,
  each with an `…Error`, plus `fit*` methods and `haveDetected*`). There is a user-facing
  **QuickShape delay** (`quickShapeDelaySlider`, `quickShapeDelayValue`) and a notification that
  offers the *possible* shapes (`displayOrUpdateQuickShapeNotificationForShape:possibleShapes:`).

## 4. Animation Assist (`ValkyrieDocumentAnimation` + `DocumentAnimationController`)

| Setting | Evidence |
|---|---|
| Onion skins on/off, count, opacity | `onionSkinEnabled`, `onionSkinCount`, `onionSkinOpacity`, `onionSkinSlider*`, "Onion skin frames" |
| **Previous and next frame tint colours** | `onionSkinPreviousFrameColor`, `onionSkinNextFrameColor`, "Onion skin colors", "animation-settings-editOnionSkinColors" |
| Onion skin blend mode and "primary mixed" | `onionSkinBlendMode`, `onionSkinPrimaryMixed`, `_onionSkinBlendColor` |
| Opacity distribution across the stack | "Control onion skin opacity distribution across layers." |
| Frame rate | `frameRate` |
| Playback modes | "Looped playback of the current animation", "One-shot playback…", "Ping-pong looped playback…", `playbackMode`, `playbackDirection` |
| Playback transport | `startPlaybackWithFrames:andCommand:`, `stopPlayback`, `tickPlayback:`, `_playbackStarted/Progresses/Ended` |
| Frame addressing | `setFrame:subIndex:`, `setFrameInternally:subIndex:andIntraFrame:`, `ValkyrieDocumentAnimationIndex` (`itemsForFrameIndex:inItems:`, `frames`, `count`) |
| Compose for playback | `ValkyrieCompositeModePlayback*` classes, "Composite Playback" |

Inference: frames are addressed with a sub-index and an intra-frame position, so several drawings can
share a frame (hold/exposure), and playback composites the frame list rather than replaying strokes.

## 5. Smudge, Clone, Liquify

- **Smudge** is a kernel with state carried between plots: `ValkyrieKernelSmudge` plus
  `ValkyrieKernelSmudgeInitialize` carry `albedo`, `metallic`, `roughness` and their `…Carryover1/2`
  buffers, `recursive:`, `smudgeBufferSize`, `singleChannel:`, `previous:`.
- **Glaze** is a smudge-family strength: strings `lightGlaze`, `heavyGlaze`, `intenseGlaze`,
  `dynamicsGlaze`, `dynamicsGlazedFlow`, `glazeOpacity`, `isGlazed`; UI "How much this brush smudges".
- **Clone** has `cloneOffset`, `cloneSize`, `cloneOpacity`, a **Clone Puck**, and "A finger will always
  clone / smudge" input rules (`initOnDevice:symmetry:clone:`).
- **Liquify** is a separate brush mode with radius/pressure (absolute and relative), a radius curve,
  `chaos` and `momentum` (`ValkyrieLiquifyBrushSettings`, `ValkyrieCanvasPaintableLiquifyPuck`).

## What this adds to 2Dope, and what it does not

2Dope already has: grid/isometric/perspective guides (`core/guides.ts`), QuickShape recognition
(`core/quickshape.ts`), symmetry, a stroke smoother/stabiliser (`brush/smoothing.ts`,
`brush/stabilize.test.ts`), taper (`brush/dabs.ts`), and an onion-skin toggle with a device-capped
count (`core/quickmenu.ts`, `core/device.ts`). The useful *gaps* this pass exposes are narrower than
the full surface:

1. **Stabilisation quality**: a windowed StreamLine pass with pressure-aware strength and zoom
   compensation, on top of the existing smoother, is the single biggest feel upgrade named here.
2. **Wet mix / smudge pull as brush dynamics** (pressure- or velocity-modulated), not only static.
3. **Onion skin colours** (previous/next tint) and **opacity distribution** across the stack.
4. **Animation Assist playback modes** (loop / one-shot / ping-pong) and a per-document frame rate.
5. **QuickShape delay** as a user setting, and "possible shapes" rather than one guessed shape.
6. **Drawing Assist as a per-layer toggle** with a double-tap shortcut (2Dope has guides; the
   per-layer assist switch is the missing piece).

Items deliberately not recommended: the 4-map PBR texture set, metallic/roughness, dual brush,
clone puck and liquify chaos/momentum are large surface area for a student app and do not fit the
current brush model.

## Limits of this pass

- Selectors, property names and localized strings are **metadata**. They do not give default values,
  ranges, curves, shader behaviour, performance, or which controls are exposed in 5.4.9's UI.
- `SilicaBrush` (Swift) exposes no Objective-C method list, so the brush *editor* UI surface is not
  covered.
- Reachability from a user action is not established; no app code was executed.
- The package is a repack (`cryptid 0`, no `embedded.mobileprovision`); authenticity is unchanged
  from the first pass and still unverified.

## Evidence

| Evidence | Covers |
|---|---|
| `procreate-draw.json` (regenerate; transient) | 17 classes, 926 method records, full selector lists |
| `procreate-classes.txt` (regenerate) | all 1,732 class names |
| `inspect_draw_metadata.py`, `strings_scan.py` | the two local parsers above |
| First pass: `ev_4bde216f…`, `ev_eaac8fba…`, `ev_9471599e…`, `ev_4eba314e…` | archive inventory, extraction, Interface Builder decodes (see README) |
