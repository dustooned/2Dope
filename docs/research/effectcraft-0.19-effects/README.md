# EffectCraft → 2Dope: effects, defaults and mograph settings

Reference study of a local EffectCraft checkout (`C:\Users\dusto\effectcraft`, MIT OR Apache-2.0)
for a Canvas 2D port into 2Dope. **Reference repo was read only** — no build, no run, no edits.
Ideas, parameter names, defaults and ranges only; no code is copied.

**Version caveat (read first).** The checkout is workspace version **0.6.0**
(`Cargo.toml:7`), `git describe` = `v0.6.0-169-g30aaddf` (latest tag `v0.6.0`; no `0.19` tag
exists). The requested folder name says `0.19`; the numbers below describe this checkout, not a
hypothetical 0.19. Treat the mismatch as unresolved (see *Gaps* at the end).

Everything below is grounded in source; anything computed at render time rather than declared is
marked **computed**, and any judgement of mine is marked *inference*.

---

## 0. Five findings that matter for 2Dope

1. **Roughen Edges exists and is alpha-only**: blur the alpha, offset the threshold by fBm noise, multiply alpha, never add pixels (`crates/effects/src/stylize2.rs:143`). Four numbers control the look: `border`, `edgeSharpness`, `scale`, `fractalInfluence`.
2. **Gaussian Blur is 3 box passes per axis**, so cost is radius-independent (`crates/raster/src/blur.rs:131`, `:154`) — the key cost fact for a JS port. `blurriness` is a radius, sigma = `blurriness/2` (`crates/effects/src/misc.rs:16`).
3. Effects **grow their buffer**: 3σ for Gaussian (`misc.rs:36`), 1.5·radius+2 for Glow (`:173`), distance+1.5·softness+2 for Drop Shadow (`:235`). Canvas 2D must pad the same way or edges clip.
4. Noise seeding = **the effect instance uid** (`crates/render/src/lib.rs:995`) plus per-effect `randomSeed`/`evolution` — exactly 2Dope's per-effect `seed`.
5. Comp motion blur: **180° / phase −90° / 16 samples / adaptive limit 128** (`crates/project/src/lib.rs:369`); phase −90° with 180° means a shutter **centred on the frame** (`render/src/lib.rs:507`). Keyframes are AE-exact speed+influence bezier (`crates/keyframe/src/lib.rs:43`), and a shipped panel defines **12 named ease curves** with exact numbers (`extensions/scriptui-panels/Ease Presets.jsx:33`).

---

## 1. Effect registry

| Fact | Value | Source |
|---|---|---|
| Effects shipped | **306** | `docs/effects.md:6` |
| Declared parameters | **3014** (2966 visible; `Hidden` params excluded from the table) | `docs/effects.md:6`, `crates/effects/src/catalog.rs:125` vs `:155` |
| Categories | **21**, in Effects & Presets order | `crates/effects/src/lib.rs:122` |
| GPU-capable | **280 / 306** | `docs/effects.md:8` |
| 32 bpc float | **306 / 306** | `docs/effects.md:9` |
| "Partial" implementations | **0** | `crates/effects/src/catalog.rs:10` |
| Id scheme | `ec.<category>.<name>`; params addressed `effects/#1/blurriness` | `docs/effects.md:12` |
| Doc generation | `docs/effects.md` is generated from the registry by a test | `catalog.rs:169` |

**Declaration mechanism.** One `EffectSpec { id, name, category, params: Vec<ParamSpec>, render,
gpu, float }` per effect (`lib.rs:408`), where `ParamSpec { id, name, default: Value, ui: ParamUi }`
(`lib.rs:146`). `registry()` concatenates ~47 `specs()` functions, then sorts by category+name
(`lib.rs:437`). There is no data file or macro DSL: effects are Rust values, so a port must
transcribe parameters by hand.

`ParamUi` is the whole widget vocabulary (`crates/project/src/props.rs:12`): `Number`,
`Slider{min,max,slider_min,slider_max,decimals}`, `Percent`, `Angle` (degrees, shown as revolutions),
`Pixels`, `Point`, `Point3`, `Color`, `Checkbox`, `Popup{options}`, `Layer`, `Mask`, `Path`, `Text`,
`Gradient`, `Hidden`. A `Slider` carries a **hard range** plus a narrower **slider range**
(`lib.rs:423`) — AE's "type a value past the slider" behaviour.

**Defaults.** Scalar defaults are literal; `Point` defaults are **fractions of the layer size**
(0.5 = centre) expanded at instantiation (`lib.rs:553`). Checkbox/popup/layer params are hold-only
(`lib.rs:583`); effect *groups* nest via `group/param` ids (`lib.rs:578`).

### 1.1 Every effect, grouped by category

| Category (n) | Effects |
|---|---|
| **3D Channel** (8) | 3D Channel Extract, Cryptomatte, Depth Matte, Depth of Field, EXtractoR, Fog 3D, ID Matte, IDentifier |
| **Audio** (13) | Backwards, Bass & Treble, Compressor, Delay, Distortion, Flange & Chorus, Gate, High-Low Pass, Modulator, Parametric EQ, Reverb, Stereo Mixer, Tone |
| **Blur & Sharpen** (16) | Bilateral Blur, CC Cross Blur, CC Radial Blur, CC Radial Fast Blur, CC Vector Blur, Camera Lens Blur, Camera-Shake Deblur, Channel Blur, Compound Blur, Directional Blur, Fast Box Blur, Gaussian Blur, Radial Blur, Sharpen, Smart Blur, Unsharp Mask |
| **Channel** (13) | Arithmetic, Blend, CC Composite, Calculations, Channel Combiner, Compound Arithmetic, Invert, Minimax, Remove Color Matting, Set Channels, Set Matte, Shift Channels, Solid Composite |
| **Color Correction** (40) | Auto Color, Auto Contrast, Auto Levels, Black & White, Brightness & Contrast, Broadcast Colors, CC Color Neutralizer, CC Color Offset, CC Kernel, CC Toner, Change Color, Change to Color, Channel Mixer, Color Balance, Color Balance (HLS), Color Link, Color Stabilizer, Colorama, Curves, Equalize, Exposure, Gamma/Pedestal/Gain, Hue/Saturation, Leave Color, Levels, Levels (Individual Controls), Lumetri Color, OCIO CDL Transform, OCIO Color Space Transform, OCIO Display Transform, OCIO File Transform, OCIO Look Transform, PS Arbitrary Map, Photo Filter, Selective Color, Shadow/Highlight, Tint, Tritone, Vibrance, Video Limiter |
| **Distort** (39) | Bezier Warp, Bulge, CC Bend It, CC Bender, CC Blobbylize, CC Flo Motion, CC Griddler, CC Lens, CC Page Turn, CC Power Pin, CC Ripple Pulse, CC Slant, CC Smear, CC Split, CC Split 2, CC Tiler, Corner Pin, Detail-preserving Upscale, Displacement Map, Liquify, Magnify, Mesh Warp, Mirror, Offset, Optics Compensation, Polar Coordinates, Puppet, Reshape, Ripple, Rolling Shutter Repair, Smear, Spherize, Transform, Turbulent Displace, Twirl, Twirl (Legacy), Warp, Warp Stabilizer, Wave Warp |
| **Expression Controls** (9) | 3D Point Control, Angle Control, Checkbox Control, Color Control, Dropdown Menu Control, Layer Control, Point Control, Slider Control, Stereo 3D Controls |
| **Generate** (26) | 4-Color Gradient, Advanced Lightning, Audio Spectrum, Audio Waveform, Beam, CC Glue Gun, CC Light Burst 2.5, CC Light Rays, CC Light Sweep, CC Threads, Cell Pattern, Checkerboard, Circle, Ellipse, Eyedropper Fill, Fill, Fractal, Gradient Ramp, Grid, Lens Flare, Paint Bucket, Radio Waves, Scribble, Stroke, Vegas, Write-on |
| **Immersive Video** (12) | VR Blur, VR Chromatic Aberrations, VR Color Gradients, VR Converter, VR De-Noise, VR Digital Glitch, VR Fractal Noise, VR Glow, VR Plane to Sphere, VR Rotate Sphere, VR Sharpen, VR Sphere to Plane |
| **Keying** (12) | Advanced Spill Suppressor, CC Simple Wire Removal, Color Difference Key, Color Range, Difference Matte, Extract, Inner/Outer Key, Key Cleaner, Key Light, Linear Color Key, Screen Key, Unmult |
| **Matte** (6) | Matte Choker, Mocha shape, Refine Hard Matte, Refine Soft Matte, Roto Brush & Refine Edge, Simple Choker |
| **Noise & Grain** (13) | Add Grain, Curl Noise, Dust & Scratches, Fractal Noise, Match Grain, Median, Median (Legacy), Noise, Noise Alpha, Noise HLS, Noise HLS Auto, Remove Grain, Turbulent Noise |
| **Obsolete** (9) | Basic 3D, Basic Text, Color Key, Gaussian Blur (Legacy), Lightning, Luma Key, Path Text, Reduce Interlace Flicker, Spill Suppressor |
| **Paint** (1) | Paint |
| **Perspective** (10) | 3D Camera Tracker, 3D Glasses, Bevel Alpha, Bevel Edges, CC Cylinder, CC Environment, CC Sphere, CC Spotlight, Drop Shadow, Radial Shadow |
| **Simulation** (18) | CC Ball Action, CC Bubbles, CC Drizzle, CC Hair, CC Mr. Mercury, CC Particle Systems II, CC Particle World, CC Pixel Polly, CC Rainfall, CC Scatterize, CC Snowfall, CC Star Burst, Card Dance, Caustics, Foam, Particle Playground, Shatter, Wave World |
| **Stylize** (25) | Brush Strokes, CC Block Load, CC Burn Film, CC Glass, CC HexTile, CC Kaleida, CC Mr. Smoothie, CC Plastic, CC RepeTile, CC Threshold, CC Threshold RGB, CC Vignette, Cartoon, Color Emboss, Emboss, Find Edges, Glow, Mosaic, Motion Tile, Posterize, **Roughen Edges**, Scatter, Strobe Light, Texturize, Threshold |
| **Text** (2) | Numbers, Timecode |
| **Time** (8) | CC Force Motion Blur, CC Wide Time, Echo, Pixel Motion Blur, Posterize Time, Time Difference, Time Displacement, Timewarp |
| **Transition** (17) | Block Dissolve, CC Glass Wipe, CC Grid Wipe, CC Image Wipe, CC Jaws, CC Light Wipe, CC Line Sweep, CC Radial ScaleWipe, CC Scale Wipe, CC Twister, CC WarpoMatic, Card Wipe, Gradient Wipe, Iris Wipe, Linear Wipe, Radial Wipe, Venetian Blinds |
| **Utility** (9) | Apply Color LUT, CC Overbrights, Cineon Converter, Color Profile Converter, Face Measurements, Face Track Points, Grow Bounds, HDR Compander, HDR Highlight Compression |

---

## 2. Deep detail

Notation: `Slider(hard min…max, slider min…max, decimals)` per `lib.rs:423`; `Angle` = degrees;
`Point` default is a fraction of layer size unless noted.

### 2.1 Roughen Edges — `ec.stylize.roughenedges` (13 params, GPU, 32 bpc)

Declared at `crates/effects/src/stylize2.rs:588-612`; implemented at `stylize2.rs:143-202`.

| # | Param id | UI name | UI type | Default | Range | Notes |
|---:|---|---|---|---|---|---|
| 1 | `edgeType` | Edge Type | Popup(8) | `Enum(0)` = Roughen | Roughen, Roughen Color, Cut, Spiky, Rusty, Rusty Color, Photocopy, Photocopy Color | drives a (freq, influence, sharpness, colored) multiplier table |
| 2 | `edgeColor` | Edge Color | Color | `0.55, 0.30, 0.10` (rust brown) | — | only used by the 3 "Color" types |
| 3 | `border` | Border | Slider | `8.0` | 0…500, slider 0…100, 1 dp | px; also the pre-blur sigma |
| 4 | `edgeSharpness` | Edge Sharpness | Slider | `1.0` | 0…10, 0…10, 2 dp | clamped to ≥0.01 (`:147`) |
| 5 | `fractalInfluence` | Fractal Influence | Slider | `1.0` | 0…1, 0…1, 2 dp | 0 = clean soft edge, 1 = full noise |
| 6 | `scale` | Scale | Slider | `100.0` | 10…1000, slider 10…300, 1 dp | **computed** cell size = `scale×0.1` px (`:149`) |
| 7 | `stretch` | Stretch Width or Height | Slider | `0.0` | −10…10, slider −5…5, 2 dp | + widens X, − heightens Y (`:155`) |
| 8 | `offset` | Offset (Turbulence) | Point | `0,0` (px here) | — | noise origin |
| 9 | `complexity` | Complexity | Slider | `2.0` | 1…10, 0 dp | fBm octaves; **+1 for Rusty types** (`:178`) |
| 10 | `evolution` | Evolution | Angle | `0.0` | — | 360° = one noise cycle (`:152`) |
| 11 | `evolutionOptions/cycleEvolution` | Cycle Evolution | Checkbox | `false` | — | cross-fades so 0° == cycle° (`:157`) |
| 12 | `evolutionOptions/cycle` | Cycle (in Revolutions) | Slider | `1.0` | 1…1000, slider 1…20, 0 dp | |
| 13 | `evolutionOptions/randomSeed` | Random Seed | Slider | `0.0` | 0…10000, slider 0…100, 0 dp | XOR-mixed into the instance seed (`:179`) |

**Per-Edge-Type multipliers** (index = `edgeType`, `stylize2.rs:166-175`), applied as
`freq`, `influence`, `sharpness`, `colored`:

| edgeType | 0 Roughen | 1 Roughen Color | 2 Cut | 3 Spiky | 4 Rusty | 5 Rusty Color | 6 Photocopy | 7 Photocopy Color |
|---|---|---|---|---|---|---|---|---|
| freq | 1.0 | 1.0 | 1.0 | 3.0 | 1.5 | 1.5 | 0.6 | 0.6 |
| influence | 1.0 | 1.0 | 1.0 | 1.0 | 1.5 | 1.5 | 1.2 | 1.2 |
| sharpness | 1.0 | 1.0 | **3.0** | 1.5 | 1.0 | 1.0 | 2.5 | 2.5 |
| colored | no | **yes** | no | no | no | **yes** | no | **yes** |

**The algorithm** (this is the whole effect, ~20 lines; `stylize2.rs:176-199`):

1. `d = gaussian_blur(alpha, border/2, border/2)` when `border > 0.05`, else `d = alpha`.
2. Per pixel with `alpha > 0`: `n = fbm(x/(scale·sx)·freq, y/(scale·sy)·freq, evolution, seed, octaves)`.
3. `s = d − 0.5 + (n − 0.5)·fractalInfluence·influence·0.5`
4. `m = clamp(s·sharpness·sharpMul·4 + 0.5, 0, 1)`; output alpha = `alpha·m`, colour preserved.
5. Colored types additionally blend the edge band toward `edgeColor` with
   `band = 1 − smoothstep(0.5, 0.9, d + (n−0.5)·influence·0.5)`.

**Consequences confirmed by the crate's own tests**: it only removes alpha, never adds, and a fully opaque interior stays 1.0 (`stylize2.rs:841-852`); `randomSeed`, `stretch` and cycle-evolution measurably change/hold the pattern (`:1017-1032`). No padding — the effect never grows the buffer.

### 2.2 Edge / boundary / matte tools that also exist

| Effect | Id | Params (name · type · default · range) | Source |
|---|---|---|---|
| Find Edges | `ec.stylize.findedges` | `invert` Checkbox false; `blend` Slider 0 (0…100) — 3×3 Sobel on luminance, output `1−edge` by default | `misc.rs:402`, spec `:644` |
| Simple Choker | `ec.matte.simplechoker` | `view` Popup(Final Output, Matte); `chokeMatte` Slider **0** (−100…100, slider −10…10, 2 dp) | `matte.rs:293-301` |
| Matte Choker | `ec.matte.mattechoker` | `geometricSoftness1` 4 (0…1000), `choke1` 75 (−127…127), `grayLevelSoftness1` 10 (0…100), `geometricSoftness2` 0, `choke2` 0, `grayLevelSoftness2` 100, `iterations` 1 (1…100) | `matte.rs:302-315` |
| Grow Bounds | `ec.utility.growbounds` | `pixels` Slider 0 (0…4000, slider 0…500) — pads the buffer only | `utility.rs:358` |
| Bevel Edges | `ec.perspective.beveledges` | `edgeThickness` 0.1 (0…0.5), `lightAngle` Angle −60, `lightColor` white, `lightIntensity` 0.25 (0…1) | `perspective.rs:389-399` |
| Stroke (generate) | `ec.generate.stroke` | 11 params (brush size, path, spacing…) | `docs/effects.md:214` |
| Bevel Alpha / Drop Shadow / Radial Shadow | `ec.perspective.*` | see §2.6 | `perspective.rs` |

Bounded negative: there is **no** "Outline", "Edge Detect" or "Roughen Edges (Legacy)"; Find Edges
lives under **Stylize**, not Blur & Sharpen.

### 2.3 Blurs

**Gaussian Blur** — `ec.blur.gaussian` (3 params), spec `crates/effects/src/misc.rs:552-561`.

| Param | Type | Default | Range | Notes |
|---|---|---|---|---|
| `blurriness` | Slider | `0.0` | 0…3000, slider 0…50, 1 dp | **radius**; sigma = `blurriness/2` (`:16`) |
| `dimensions` | Popup(3) | `Enum(0)` = Horizontal and Vertical | Horizontal and Vertical, Horizontal, Vertical | `dims_xy` maps 1→X only, 2→Y only (`:20`) |
| `repeatEdge` | Checkbox | `false` | — | false = zero-pad via `b.pad(ceil(3σ))` (`:36`) |

**Fast Box Blur** — `ec.blur.fastbox` (`misc.rs:562`): `radius` 0 (0…3000, slider 0…50),
`iterations` **3** (1…50, slider 1…5), `dimensions`, `repeatEdge` false. Pads `r·iters + 1`.

**Directional Blur** — `ec.blur.directional` (`misc.rs:574`): `direction` Angle 0,
`length` 0 (0…1000, slider 0…100); pads `ceil(len)+1`; 0° = vertical (`raster/src/blur.rs:162`).

**Radial Blur** — `ec.blur.radial` (`misc.rs:581`): `amount` **10** (0…100), `center` Point 0.5,0.5,
`type` Popup(Spin, **Zoom**… default `Enum(0)` = Spin), `antialiasing` Popup(Low, High) — kept for
compatibility only, "our blur is always fully anti-aliased" (`:589`). Fixed 32 taps (`blur.rs:191`).

**Camera Lens Blur** — `ec.blur.cameralens` (16 params, `blur2.rs:695`): `blurRadius` **10**
(0…500, slider 0…100), `irisProperties/irisShape` Popup(9 options, default `Enum(3)` = **Hexagon**),
`irisRoundness` 0, `irisAspectRatio` 1 (0.01…100), `irisRotation` 0, `diffractionFringe` 0 (0…500),
`blurMap/blurMapLayer` Layer(None), `blurMap/channel` Popup(Luminance, Alpha, Color),
`blurMap/placement` Popup(Center, Stretch) default Stretch, `blurMap/blurFocalDistance` 0 (0…255),
`blurMap/invertBlurMap` false, `highlight/specularBrightness` 0 (0…100),
`highlight/specularThreshold` **255**, `highlight/highlightSaturation` **100**, `repeatEdge` false,
`useLinear` false. **Two controls force the CPU path**: `diffractionFringe` and `blurMapLayer`
(`catalog.rs:86`).

**Sharpen** `amount` 0 (0…500, ÷50 internally); **Unsharp Mask** `amount` 50 (0…500),
`radius` 1 (0.1…500, slider 0.1…50), `threshold` 0 (0…255, compared in 0–255 units) — `misc.rs:594`.

### 2.4 Turbulent Displace — `ec.distort.turbulentdisplace` (11 params)

Spec `crates/effects/src/distort2.rs:726-743`; implementation `:86-159`; enums `:54` and `:68`.

| Param | Type | Default | Range | Notes |
|---|---|---|---|---|
| `displacement` | Popup(9) | `Enum(0)` = Turbulent | Turbulent, Bulge, Twist, Turbulent Smoother, Bulge Smoother, Twist Smoother, Vertical Displacement, Horizontal Displacement, Cross Displacement | Smoother variants use octave falloff 0.3 vs 0.5 (`:105`) |
| `amount` | Slider | **50.0** | −1000…1000, slider −200…200, 1 dp | px |
| `size` | Slider | **100.0** | 2…4000, slider 2…400, 1 dp | noise cell, px |
| `offset` | Point | 0.5, 0.5 | — | turbulence origin |
| `complexity` | Slider | **1.0** | 1…10, 1 dp | octaves |
| `evolution` | Angle | 0 | — | 360° = one cycle |
| `evolutionOptions/cycleEvolution` | Checkbox | false | — | |
| `evolutionOptions/cycle` | Slider | 1 | 1…1000, slider 1…20 | |
| `evolutionOptions/randomSeed` | Slider | 0 | 0…10000, slider 0…1000 | |
| `pinning` | Popup(15) | `Enum(1)` = **Pin All** | None, Pin All, Pin Horizontal, Pin Vertical, Pin Left, Pin Top, Pin Right, Pin Bottom, + the same 7 **Locked** variants | edge band = 10 % of min(w,h), 25 % when Locked (`:107`) |
| `resizeLayer` | Checkbox | false | — | pads by `ceil(|amount|)+1` |

Motion: `dx,dy` come from fBm — Turbulent displaces X and Y with independent seeds, Bulge/Twist use
noise **gradients** (`:123-138`). `Pinning` multiplies displacement by a distance-to-edge ramp, so
pinned borders stay put; the Locked variants additionally clamp the sample inside the layer (`:153`).
`pinning ≥ 8` (any Locked) drops the effect off the GPU path (`catalog.rs:99`).

### 2.5 Noise, Add Grain, Fractal Noise

**Noise** — `ec.noise.noise` (3 params, `misc.rs:686`): `amount` 0 (0…100, ÷100 internally),
`color` **true**, `clip` **true**. Per-pixel `hash_noise`, frame seed = `time×1000 ^ instance seed`
(`misc.rs:453`), so it re-rolls every frame; unclipped mode wraps values with `rem_euclid(1)`
(`:475`).

**Fractal Noise / Turbulent Noise** — `ec.noise.fractal` (26), `ec.noise.turbulent` (22);
shared param builder `crates/effects/src/noise3.rs:67-114`, enums `:33-36`.

| Group | Param | Default | Range | Notes |
|---|---|---|---|---|
| — | `fractalType` | `Enum(0)` Basic (Turbulent Noise: `Enum(1)`) | 9 options: Basic, Turbulent Smooth, Turbulent Basic, Turbulent Sharp, Dynamic, Dynamic Twist, Dynamic Progressive, Max, Strings | |
| — | `noiseType` | `Enum(2)` **Soft Linear** | Block, Linear, Soft Linear, Spline | interpolation between lattice values |
| — | `invert` | false | | |
| — | `contrast` | **100.0** | 0…10000, slider 0…400 | |
| — | `brightness` | 0.0 | −10000…10000, slider −200…200 | |
| — | `overflow` | `Enum(3)` Allow HDR Results (Turbulent: `Enum(0)` Clip) | Clip, Soft Clamp, Wrap Back, Allow HDR Results | |
| transform/ | `rotation` | 0° | | |
| transform/ | `uniformScaling` | true | | |
| transform/ | `scale`, `scaleWidth`, `scaleHeight` | 100 | 1…10000, slider 20…600 | |
| transform/ | `offset` | 0.5, 0.5 | | |
| transform/ | `perspectiveOffset` | false | | |
| — | `complexity` | **6.0** | 1…20, slider 1…10 | octaves |
| subSettings/ | `subInfluence` | **70 %** | 0…100, slider 25…100 | |
| subSettings/ | `subScaling` | **56 %** | 10…100, slider 25…100 | |
| subSettings/ | `subRotation`, `subOffset`, `centerSubscale` | 0°, 0,0, false | | Fractal Noise only |
| — | `evolution` | 0° | | |
| evolutionOptions/ | `turbulenceFactor` | 0.5 | 0…10, slider 0…2 | Turbulent Noise only |
| evolutionOptions/ | `seed` \| `randomSeed` | 0 | 0…100000, slider 0…1000 | |
| evolutionOptions/ | `cycleEvolution` + `cycle` | false, 1 | 1…1000, slider 1…30 | Fractal Noise only |
| — | `opacity` | **100 %** | 0…100 | |
| — | `blendingMode` | `Enum(1)` Normal | 24 modes (None, Normal … Luminescent Premul) | `noise3.rs:36` |
| — | `blend` | 0 % | 0…100 | *not in AE*, kept for old projects (`:111`) |

**Add Grain** — `ec.noise.addgrain` (32 params, `noise.rs:759`). Head: `viewingMode`
Popup(Preview, Blending Matte, **Final Output** = `Enum(2)`), `preset` Popup(6) default `Enum(0)`
None — the six presets are *EffectCraft's own film stocks*: None, Fine 35mm, Coarse 16mm,
Vintage 8mm, Video Noise, Monochrome High Speed (`noise.rs:219`). Then 5 Preview Region params
(`center` 0.5,0.5; `width`/`height` 200; `showBox` true; `boxColor` white), then:
`tweaking/intensity` **1.0** (0…100, slider 0…10), per-channel intensity ×3 (1, 0…10),
`tweaking/size` **1.0** (0.05…100, slider 0.1…10), per-channel size ×3, `softness` 0 (0…100),
`aspectRatio` 1 (0.05…20); `color/monochromatic` false, `saturation` 1, `tintAmount` 0 (0…1),
`tintColor` white; `application/blendingMode` Popup, `shadows`/`midtones`/`highlights` 1 (0…10),
`midpoint` 0.5; `animation/animationSpeed` **1.0** (0…100, slider 0…5), `animateSmoothly` **true**,
`randomSeed` 0 (`noise.rs:178-214`).

### 2.6 Glow, Drop Shadow, Tint, Fill, Colorama, Transform

**Glow** — `ec.stylize.glow` (14 params, `misc.rs:606-629`; body `:157-226`):
`based` Popup(Alpha Channel, **Color Channels** = `Enum(1)`), `threshold` **60** (0…100),
`radius` **10** (0…1000, slider 0…100), `intensity` **1.0** (0…255, slider 0…4), `operation`
Popup(**On Top**, Behind, None), `glowOperation` Popup(17 blend modes) default `Enum(1)` Add
(`misc.rs:124`), `colors` Popup(Original Colors, A & B Colors, Arbitrary Map),
`colorLooping` Popup(4, default `Enum(2)` **Triangle A>B>A**), `colorLoops` **1** (1…127, slider 1…10),
`colorPhase` 0°, `abMidpoint` 50 (0…100), `colorA` white, `colorB` black, `glowDimensions`
Popup(H+V, H, V), plus hidden `arbitraryMap` text. *Computed*: brightest-pass threshold
`k = (l − thr)/(1 − thr)`, blur sigma = `radius/2` (`:198`), pad `1.5·radius+2` (`:173`).

**Drop Shadow** — `ec.perspective.dropshadow` (6 params, `misc.rs:662-675`): `color` black,
`opacity` **50** (0…100), `direction` **135°**, `distance` **5** (0…32000, slider 0…120),
`softness` **0** (0…1000, slider 0…250), `shadowOnly` false. *Computed*: offset
`(sin dir, −cos dir)·distance`, blur sigma `softness/2` (`:249`), pad `distance+1.5·softness+2`.

**Tint** — `ec.color.tint` (3, `color_fx.rs:866`): `black` #000 ("Map Black To"),
`white` #FFF ("Map White To"), `amount` **100** (0…100).

**Fill** — `ec.generate.fill` (7, `color_fx.rs:985`): `fillMask` Mask 0, `allMasks` false,
`color` **red (1,0,0)**, `invert` false, `horizontalFeather` 0 (0…5000, slider 0…100),
`verticalFeather` 0 (0…5000, slider 0…100), `opacity` **100** (0…100).

**Colorama** — `ec.color.colorama` (20, `color_fx.rs:1093`): `inputPhase/mode` Popup(10: Intensity,
Red, Green, Blue, Hue, Lightness, Saturation, Value, Alpha, Zero), `addPhase` Layer(None),
`addPhaseFrom` same 10, `addMode` Popup(Wrap, Clamp, Average, Screen), `phaseShift` 0°,
`outputCycle/usePresetPalette` Popup(9: Hue Cycle, Ramp Grayscale, Fire, Ice, Ramp Red, Ramp Green,
Ramp Blue, Pastel Cycle, Custom — `:638`), `outputCycle/palette` Text default
`"0:1,0,0 0.1667:1,1,0 0.3333:0,1,0 0.5:0,1,1 0.6667:0,0,1 0.8333:1,0,1"`,
`cycles` **1** (0…100, slider 0…10), `interpolatePalette` true, `modify/modify` Popup(12),
`modifyAlpha` false, `changeEmptyPixels` false, `matchingColor` white, `matchingTolerance` 0,
`matchingSoftness` 0, `matchingMode` Popup(Off, RGB, Hue, Chroma), `maskLayer` Layer(None),
`maskingMode` Popup(Off, Luminance, Inverted Luminance, Alpha, Inverted Alpha),
`compositeOverLayer` true, `blend` 0 (0…100).

**Transform** — `ec.distort.transform` (12, `distort.rs:442-460`): `anchor` Point 0.5,0.5,
`position` Point 0.5,0.5, `uniform` **true**, `scaleHeight` 100 (−10000…10000, slider 0…600),
`scaleWidth` 100 (same), `skew` 0 (−70…70), `skewAxis` 0°, `rotation` 0°, `opacity` 100 (0…100),
`useCompositionShutterAngle` **true**, `shutterAngle` 0 (0…720), `sampling` Popup(Bilinear, Bicubic).
*Computed*: own-shutter samples are fixed at **16**, phase = −angle/2, clamped 2…64
(`transform_shutter`, `distort.rs:265`).

---

## 3. Motion / mograph settings

### 3.1 Composition

| Field | Default | Meaning | Source |
|---|---|---|---|
| `shutter_angle` | **180.0** | degrees | `project/src/lib.rs:369` |
| `shutter_phase` | **−90.0** | degrees; −90 with 180 = **centred** on the frame | `:370`, `render/src/lib.rs:507` |
| `motion_blur_samples` | **16** | Samples Per Frame: minimum 2D samples and the count for 3D layers | `:304`, `:371` |
| `motion_blur_adaptive_limit` | **128** | max samples when a layer travels far | `:307`, `:372` |
| `enable_motion_blur` | `true` | comp switch | `:375` |
| `enable_frame_blending` | `true` | comp switch | `:376` |
| `draft_3d`, `preserve_frame_rate`, `preserve_resolution`, `poster_time` | false / 0 | Advanced settings | `:319-329` |

Sample times: `t_i = t + (phase + angle·i/(n−1))·frame_duration` (`render/src/lib.rs:507`), i.e.
uniform across the **open** shutter. Draft quality forces **4** samples (`:1535`).
Adaptive count: `clamp(ceil(travel_px), clamp(samples,2,64), max(limit,16,256))` — one sample per
output pixel of motion (`render/src/lib.rs:2078`).

### 3.2 Layer switches (`project/src/lib.rs:583-621`)

`video`, `audio`, `solo`, `locked`, `shy`, `collapse`, `quality` (Best|Draft|Wireframe),
`sampling` (Bilinear|Bicubic), `effects`, `frame_blend` (Off|**FrameMix**|PixelMotion),
`motion_blur` (**false**), `adjustment`, `three_d`, `guide`. A layer only motion-blurs when
comp **and** layer switch are on (`render/src/lib.rs:1527`); collapsed precomps inherit the outer
comp's shutter (`:1424`).

### 3.3 Keyframe model (`crates/keyframe/src/lib.rs`)

| Concept | Representation | Source |
|---|---|---|
| Interpolation | per **side**: `Linear` \| `Bezier` \| `Hold`, default Linear | `:23`, `:107` |
| Ease | `Ease { speed: units/s, influence: 0…1 }`, default `{0, 1/6}` | `:43`, `:50` |
| Easy Ease | `EASE = { speed: 0, influence: 1/3 }` (33.33 %) | `:56` |
| Bezier solve | normalised speeds × influences, 8 Newton steps then 60 bisections | `:177`, `:220` |
| Spatial | cubic motion path with arc-length table (`ARC_N = 96`), per-key `spatial_in/out` tangents, `spatial_auto` default **true** | `:228`, `:79-86` |
| Continuous / auto-bezier | `continuous`, `auto_bezier` flags; icon shape = diamond/hourglass/circle/square | `:72-76`, `:136` |
| Roving | `roving` flag + `retime_roving()` | `:88`, `:394` |
| Key colour label | `label: u8` | `:91` |
| Ease commands | `easy_ease(k, in, out)`, menu Easy Ease / In / Out | `:580`, `engine/src/menus.rs:986` |

### 3.4 Named easing presets (shipped panel)

`extensions/scriptui-panels/Ease Presets.jsx:32-46`. Each curve is
`(outInfluence %, outSpeed, inInfluence %, inSpeed)` where **speed is a multiple of the segment's
average speed** (the panel divides Δvalue by duration itself, `:139-161`), so `speed 1` = linear and
`speed 0` = stopped. These numbers map 1:1 onto 2Dope's `Side.slope`/`Side.influence`.

| Preset | outInf % | outSpeed | inInf % | inSpeed |
|---|---:|---:|---:|---:|
| Linear | 33.33 | 1 | 33.33 | 1 |
| Smooth | 40 | 0.25 | 40 | 0.25 |
| Ease In-Out Soft | 25 | 0 | 25 | 0 |
| Ease In-Out | 50 | 0 | 50 | 0 |
| Ease In-Out Strong | 75 | 0 | 75 | 0 |
| Accelerate | 50 | 0 | 20 | 1.5 |
| Accelerate Strong | 80 | 0 | 15 | 2.5 |
| Decelerate | 20 | 1.5 | 50 | 0 |
| Decelerate Strong | 15 | 2.5 | 80 | 0 |
| Expo In-Out | 88 | 0 | 88 | 0 |
| Expo Accelerate | 75 | 0 | 12 | 7 |
| Expo Decelerate | 12 | 7 | 75 | 0 |

Semantics: the preset eases the **out** side of key *i* and the **in** side of key *i+1*, one undo
step, only for pairs of neighbouring selected keys (`:178-201`). Values are clamped to influence
0.1…100 % and speed ±100 (`:23-24`, `:55`). User presets persist as JSON under
`app.settings` section "Ease Presets" (`:20-21`).
Bounded negative: **no overshoot/bounce easing curve** is shipped; "Bounce" exists only as a *text
animator* preset (§4).

### 3.5 Graph editor (`crates/ui-egui/src/state.rs:386-407`)

| Setting | Default | Meaning |
|---|---|---|
| `graph_mode` | `"auto"` | Auto-Select Graph Type: **speed graph when every shown property is spatial**, else value graph; can be forced `value`/`speed` |
| `graph_show_selected` | true | only selected properties |
| `graph_auto_zoom` | **true** | auto-zoom graph height to visible curves |
| `graph_range` | none | manual value range when auto-zoom is off |
| `graph_snap` | true | drags snap to time, other keys and frames |
| `graph_reference` | false | faint other graph type behind |
| `graph_transform_box` | true | transform box for multi-key selection |

Keyframe Assistant extras: Exponential Scale, Time-Reverse Keyframes, Convert Audio/Expression to
Keyframes, Null tracing (`engine/src/menus.rs:982-996`).

### 3.6 Effect-level motion blur (alternatives to comp blur)

| Effect | Key params | Source |
|---|---|---|
| CC Force Motion Blur | `motionBlurLevels` **8** (2…64), `overrideShutterAngle` true, `shutterAngle` 180 (0…3600), `nativeMotionBlur` Off | `time_fx.rs:121-131` |
| Pixel Motion Blur | `shutterControl` Automatic/Manual, `shutterAngle` 180 (0…720), `shutterSamples` **16** (1…64), `vectorDetail` 20 (0…100) | `time_fx.rs:142-152` |
| CC Wide Time | `forwardSteps` 3, `backwardSteps` 3, `nativeMotionBlur` | `time_fx.rs:132-141` |
| Timewarp | own `motionBlur/shutterAngle` 180 + `shutterSamples` 5 | `time_fx.rs:106-109` |
| Transform (effect) | Use Composition's Shutter Angle (default on) / own 0…720, 16 samples | `distort.rs:455`, `:265` |

---

## 4. Presets & templates

| Question | Answer | Source |
|---|---|---|
| AE `.ffx` support? | **No.** Presets are EffectCraft's own JSON tagged `"effectcraftAnimationPreset": 1`, extension `*.ecpreset` | `commands/animation.rs:16`, `:84` |
| What is saved? | Selected leaf properties (path, value, keys, expression) **and** selected whole effect groups | `:49-87` |
| Time base | Key times are stored **relative to the earliest key**, so the preset applies at the CTI | `:68-69` |
| Apply | `anim.applyPreset` with `path` or inline `preset`; tags checked; recent list in prefs | `:90-111` |
| Default preset folder | **None found** — the path is whatever the file dialog returns; only *recent* paths are remembered | `prefs.rs:331`, `commands/app_more.rs:105` |
| Built-in preset library | 8 **text animator** presets in `crates/engine/presets/text_animators.json` (embedded with `include_str!`) | `commands/text_anim.rs:14` |
| Their names/ids | Typewriter, Fade Up Characters, Bounce In Words, Tracking In, Scramble, Blur In, Jitter, Drop In Lines | `presets/text_animators.json`, `menus.rs:968-976` |
| Preset format of those | `"format": "effectcraft.textAnimatorPresets/1"`, animators + range selectors + relative key times | `text_animators.json:2-4` |
| Motion/comp templates | Render-queue output templates only (`render_templates.rs`), not motion presets | `project/src/render_templates.rs:116` |
| Ease presets | The 12-curve ScriptUI panel (§3.4), user-extensible | `Ease Presets.jsx:33`, `:96` |

Bounded negative: searched `**/*.ffx`, `**/*.ecpreset`, `crates/engine/presets/`, `extensions/` and
`assets/` — no shipped effects-preset library, no `.ffx`, no downloadable pack names.

---

## 5. Render / quality facts that constrain a Canvas 2D port

| Fact | Detail | Source |
|---|---|---|
| Blur cost vs radius | Gaussian = **3 separable box passes per axis**, sliding-window accumulator ⇒ **O(1) per pixel per pass**, radius-independent | `raster/src/blur.rs:131-158`, `:82-107` |
| Box radii | Kovesi "boxes for Gauss": `w_ideal = sqrt(12σ²/n + 1)`, odd widths, split into `m` lower and `n−m` upper boxes | `:132-145` |
| Fast Box Blur | `iterations × radius`, both axes, also O(1)/px | `misc.rs:42` |
| Directional blur | `2·ceil(length)+1` taps, clamped 3…257 — **cost grows with length** | `blur.rs:168` |
| Radial blur | fixed **32** taps | `blur.rs:191` |
| Effect domain | every length is multiplied by the buffer `scale`, so parameters are resolution-independent | `misc.rs:29`, `stylize2.rs:146` |
| Padding (ROI growth) | Gaussian `3σ`; Box `r·it+1`; Directional `len+1`; Glow `1.5·radius+2`; Drop Shadow `dist+1.5·soft+2`; Turbulent (if Resize) `ceil(abs(amount))+1`; Roughen **none** | as cited above |
| Effect space | a layer's effect bounds = its source rect, or a comp-sized rect centred on origin for shape/text layers | `render/src/eval.rs:317` |
| CPU/GPU split | CPU reference implementation in Rust (rayon per-pixel); GPU compositor runs the same effects for **280/306**; a per-effect allow-list of "CPU-only controls" demotes an instance to CPU when off-default | `docs/effects.md:8`, `catalog.rs:65-108` |
| Determinism | `seed = effect instance uid` (stable in the project) XOR per-effect `randomSeed`; noise is integer-lattice value noise; `evolution` is the animation axis; `cycleEvolution` cross-fades `z` and `z−cycle` | `render/src/lib.rs:995`, `stylize2.rs:179`, `distort2.rs:108-119` |
| Frame-varying noise | plain Noise re-seeds from `time·1000` (new pattern every frame) | `misc.rs:453` |
| Motion blur cost | `samples` renders of the layer; adaptive count = 1 sample per output pixel of travel, capped; Draft = 4 | `render/src/lib.rs:2078`, `:1535` |
| Time effects read neighbour frames | via host re-render at other layer times (expensive by construction) | `effects/src/lib.rs:317` |

---

## 6. Port notes for 2Dope (Canvas 2D, per-layer stack, page-sized scratch)

Assumed baseline (verified): `EffectType` = boil/grain/texture/turbulence/dither, each effect carries `amount`, `size`, `hold`, `seed` and a `target` of line/fill/layer; rendering paints parts into page-size scratch canvases, reads back with `getImageData`, and caches finished frames (`beta/src/core/effects.ts:17-60`, `beta/src/view/effects.ts:19-60`, `:119`).

| Feature | Verdict | Concrete approach |
|---|---|---|
| **Roughen Edges** | **Cheap, high value** — do it | Same 20-line algorithm: blur the **alpha channel only** (3-box), then `alpha *= clamp((blurA − 0.5 + (fbm−0.5)·influence)·sharp·sharpMul·4 + 0.5)`. No padding needed. Reuses the existing `hash01`/noise and `hold`-based tick as `evolution`. |
| **Gaussian Blur** | **Cheap if done right** | Reuse EffectCraft's 3-box-pass radii formula (O(1)/px). Do **not** loop a kernel per pixel. Beware `ctx.filter='blur()'`: GPU-fast but unit-different and not obviously deterministic across browsers — *inference*, not verified here. |
| Blur + existing per-part targets | Natural fit | Blur `line` ⇒ stroke glow/soft focus; blur `layer` ⇒ defocus; blur `fill` ⇒ soft colour. But blurring `line` alone loses contact with `fill` — expose the existing `target` control. |
| Fast Box Blur / Camera Lens / Directional / Radial | Defer, except Directional | Directional is a cheap N-tap average and sells "speed"; Camera Lens needs a disc/iris kernel per pixel (expensive) — skip. |
| Turbulent Displace | **Moderate** — 2Dope already has `turbulence` | Keep the existing warp; optionally add `complexity` (octaves 1–4) and pinning-free edges. Bilinear sampling in JS is the cost, not the noise. |
| Fractal Noise / Add Grain | Overkill | 2Dope's `grain` covers the student need; do not port 26 params. |
| Glow / Drop Shadow | **Cheap via compositing** | Both are "blur a mask, composite" — Canvas 2D `shadowColor`/`shadowBlur` gives Drop Shadow almost free; Glow = blurred bright-pass drawn twice. Prefer these over per-pixel loops. |
| Tint / Fill / Colorama | Tint easy; Colorama overkill | Tint = two-colour lerp by luminance (3 params). Colorama's 20 params are not student material. |
| Comp motion blur (16 samples) | **Too expensive** at page size | Recommend shutter 180°, samples **4–8**, cap travel samples at 16, and only blur layers whose transform changed this frame. This is 2–4× the paint cost per frame, not 16×. |
| Frame blending | Cheap | Cross-fade (Frame Mix) only; skip Pixel Motion. |
| Named ease presets | **Highest value per line of code** | The 12 curves map straight onto 2Dope's `Side{slope, influence}`: `slope = speed`, `influence = influencePct/100`. Zero new math. |
| Graph editor auto-select/speed graph | Later | Auto-zoom (default on) and "speed graph when spatial" are good defaults to copy when a graph editor lands. |

**Suggested student-facing defaults** (EffectCraft value → 2Dope value, where they should differ):

| New setting | Take from EffectCraft | Suggest for 2Dope | Why |
|---|---|---|---|
| Roughen `border` | 8 px | **6 px** (range 0–40) | visible on a 1080p page without destroying thin ink |
| Roughen `edgeSharpness` | 1.0 | **1.0** (0–4) | keep |
| Roughen `scale` | 100 (×0.1 = 10 px cells) | **size 40–90 px** in 2Dope's existing `size` units | 2Dope's `size` is already "swirl/speck scale in px" |
| Roughen `complexity` | 2 | **2** (1–4) | 4+ octaves is invisibly slow |
| Roughen `edgeType` | 8 options | **4**: Roughen, Cut, Spiky, Photocopy | the Color variants need an edge colour picker |
| Roughen `fractalInfluence` | 1.0 | **0.8** | slightly calmer for hand-drawn line work |
| Gaussian `blurriness` | 0 | **0**, range 0–80 px, slider 0–24 | above ~24 px a student wants downscale, not a wider kernel |
| Gaussian `dimensions` | H+V / H / V | keep all three | cheap and useful for speed lines |
| Gaussian `repeatEdge` | false | **false** | transparent page edges should stay transparent |
| Motion blur samples | 16 | **6** (draft 3) | 16 layer repaints per frame is a slideshow on an iPad |
| Glow `radius` | 10 | **8**, intensity 1.0, threshold 60 % | keep |
| Drop shadow | dir 135°, dist 5, soft 0, opacity 50 | keep | already a sane AE default |

Implementation cautions:

- **Alpha-only vs colour**: Roughen Edges must multiply **alpha**, not darken colour, or thin lines turn grey instead of ragged (verified by the reference test, `stylize2.rs:841`).
- **Padding is a buffer-size change**, not a parameter; 2Dope's page-size scratch canvases already have the room, so pad by expanding the *dirty rect*, not by resizing the page.
- **Seeded evolution**: 2Dope's `hold` (pattern every N frames) is the natural analogue of Evolution; drive `evolution = tick · 360° / cycle` so a `hold` of 2 looks like boil-on-twos, which is exactly what 2Dope already does for `boil`.
- **Cache key** must include the new params (`border`, `sharpness`, `edgeType`, `blurriness`, `dimensions`) — 2Dope's `effectsKey` currently keys on amount/size/hold/seed/style (`beta/src/core/effects.ts`); forgetting this is a silent stale-frame bug.

---

## Sources

All reference paths are under `C:\Users\dusto\effectcraft`.

- `Cargo.toml` (workspace version); `docs/effects.md` (generated catalogue, 306 effects).
- Plumbing: `crates/effects/src/lib.rs` (`CATEGORIES`, `ParamSpec`, `EffectSpec`, `registry()`, `default_value`, `instantiate`), `catalog.rs` (`PARTIAL`, `CPU_ONLY_CONTROLS`, `gpu_supported`).
- Effects: `misc.rs` (Gaussian/Fast Box/Directional/Radial blur, Glow, Drop Shadow, Find Edges, Emboss, Noise, wipes), `stylize2.rs` (**Roughen Edges**, Scatter, Strobe, Texturize, Brush Strokes, Cartoon), `distort.rs` (Transform + `transform_shutter`), `distort2.rs` (**Turbulent Displace**, Displacement Map, Optics, Magnify), `noise.rs` (Add Grain, Match Grain, Median), `noise3.rs` (Fractal/Turbulent Noise), `color_fx.rs` (Tint, Fill, Colorama), `matte.rs` (Simple/Matte Choker), `perspective.rs` (Bevel Edges/Alpha, shadows), `blur2.rs` (Camera Lens Blur), `utility.rs` (Grow Bounds), `time_fx.rs` (Timewarp, CC Force Motion Blur, Pixel Motion Blur).
- Raster/render: `crates/raster/src/blur.rs` (box/Gaussian/directional/radial kernels, `box_radii`); `crates/render/src/lib.rs` (`Shutter`, `adaptive_samples`, dispatch + seed); `crates/render/src/eval.rs` (`effect_bounds`, `source_size`).
- Project model: `crates/project/src/lib.rs` (`Comp` shutter/samples/frame blending, `Switches`, `FrameBlend`), `crates/project/src/props.rs` (`ParamUi`, `Property`).
- Animation: `crates/keyframe/src/lib.rs` (`Interp`, `Ease`, `Keyframe`, `ease_progress`, `easy_ease`, `retime_roving`), `crates/ui-egui/src/state.rs` (graph-editor settings), `crates/engine/src/menus.rs`, `commands/animation.rs` (`*.ecpreset`), `commands/text_anim.rs` + `crates/engine/presets/text_animators.json`, `extensions/scriptui-panels/Ease Presets.jsx`.
- 2Dope side: `beta/src/core/effects.ts`, `beta/src/view/effects.ts`, `beta/src/core/anim.ts`.

### Gaps / unresolved

1. **Version mismatch**: checkout is `0.6.0` (+169 commits); no `0.19` tag exists, so the folder name cannot be validated against a release. Numbers here are for this working tree.
2. Preset **storage location** for `*.ecpreset` is user-chosen; no default folder or shipped pack, so no "preset pack names" exist to enumerate.
3. GPU kernels (`crates/gpu/src/fx_*.rs`) were only spot-checked; the report describes the CPU reference semantics that the catalogue documents as identical.
4. Per-effect internal constants (e.g. Turbulent's gradient epsilon `0.05`) are quoted where read, but not every kernel was traced pixel-by-pixel.
5. 2Dope cost estimates in §6 are *inference* from algorithm shape, not device measurements.
6. **Not finished**: no measurement of the reference renderer on this machine (repo is read-only, nothing was built or run), so all cost claims come from algorithm shape and declared tap counts.
