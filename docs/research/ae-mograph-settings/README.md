# AE plug-in / preset research: settings worth adopting in 2Dope

Read-only survey of a local After Effects plug-in and preset collection, used to choose a
small, student-friendly effects + motion-settings set.

**Nothing in this document was verified by running a plug-in.** No AE install is present
(see §2), no `.aex`/`.jsxbin` was decompiled or executed, and third-party parameter
behaviour is taken from preset data and documentation text only.

## 0. Evidence classes used

| Class | What it is | Trust |
|---|---|---|
| **FFX** | `.ffx` animation presets. These are **RIFX binary**, not XML — parsed with a custom chunk reader (`_tools/ffx_extract.py`) that decodes `tdmn` match names, `tdsn` display names, `cdat` float64 values, `tdum`/`tduM` slider min/max and `pdnm` popup choices. | Highest: literal stored values |
| **DOC** | Manual / readme / help text (`*.html`, `*.txt`) | High for control names, medium for ranges |
| **NAME** | `.aex` / `.jsx` / `.jsxbin` filenames only | Names only, no parameters |
| **INFER** | My own mapping from evidence to a 2Dope feature | Explicitly marked |

## 1. `.ffx` inventory (the main evidence)

| Where | Count | Notes |
|---|---|---|
| `Ultimate Mograph Plugins Grab Bag` (recursive) | **264** found | 262 parsed as RIFX; 2 unreadable (§8) |
| `After Effects` (small pack) | 0 | pack ships `.aex` + PDFs only |

Effect match names appearing in the 262 parsed presets (counts = presets referencing them):

| Effect (match name) | Presets | Family |
|---|---|---|
| `ADBE RM Plug-in` → Diopter | 62 | lens / reflection / grain look library |
| `ADBE Root Vectors Group`, `ADBE Transform Group`, `ADBE Text Properties`, `ADBE Slider Control`, `ADBE Angle Control`, `ADBE Checkbox Control` | 8 / 4 / 4 / 3 / 1 / 1 | shape + text rigs, not looks |
| `VIDEOCOPILOT 3DArray` → Element | 3 | 3D, out of scope |
| `Pseudo/Handy` (Handy Hands 2: simple / stroke / taper / separated) | 3 | stroke-draw rigs |
| `Pseudo/<hash>` cloner + effector set (Grid, Linear, Radial, Path, Custom 1D/2D/3D, Plain/Random/Step/Pulse/Noise/Path/Path-Ends/Layer/Wiggle effector, Linear/Radial/Spherical Falloff) | 2 each | motion-graphics systems |
| `Pseudo/e3d_*` (E3D Cloner/Effector/Fracture/MoText) | 1 each | 3D, out of scope |
| `Pseudo/CTE_Pseudo_*` Body/Common/Hands/Legs Controller | 2 each | character rig, out of scope |
| `Pseudo/CT*` (Wave, Bend, Bubbles, Cloud, Dust, Fire, Smoke, Falloff, Main Controller v2.0/v3.0) | 1 each | **procedural look controllers** |
| `Pseudo/5e36uID/ACM_*` (AutoCircularMotion) | 1 | circular/orbital motion |
| `Pseudo/925fuID/AutoSway_*` | 1 | sway / wind motion |
| `Pseudo/KMLS Inner Shadow` + `ADBE Layer Styles` | 1 | layer style UI wrapper |
| `ADBE Brightness & Contrast 2`, `ADBE Find Edges`, `ADBE Color Balance (HLS)`, `ADBE Invert` | 1 each | the **only** built-in colour effects used |

**No preset in the collection wraps `Roughen Edges`, `Gaussian Blur` or `Turbulent Displace`**
(verified by scanning all 262 for those match names). So for the two headline effects the
task asked about, this collection provides **no parameter evidence at all** — see §8.

## 2. Built-in effect names (filenames only)

`C:\Program Files\Adobe\Adobe After Effects 2026\Support Files` contains `Plug-ins` and
`Scripts` but **no `AfterFX.exe`**, and its `Plug-ins` folder holds only 284 files, all from
the small pack. So the real AE built-in `.aex` set is **not present on this machine** and
built-in effect names cannot be confirmed from filenames here. What does exist:

| Path | `.aex` found |
|---|---|
| `...After Effects 2026\Support Files\Plug-ins` | `B.Carve`, `B.Fringe`, `PixDither`, `PixStipple`, `Effects\Fryer`, `ntsc-rs-windows-afterfx\ntsc-rs-ae`, `PixyHalftone_V1.0\Win\PixyHalftone`, `Plugin_Windows\RetroDither`, `VideoCopilot\FXConsole` |
| `C:\Program Files\Adobe\Common\Plug-ins\7.0\MediaCore` | `FilmConvertNitrate`, 20 `Zaebects\signal.aex`, plus `BorisFX\Sapphire Plug-ins` (≈200) and `Trapcode`, `EasyComp`, `Format`, `ntsc-rs` |

Sapphire filenames are useful as a *taxonomy of "few knobs, strong look" effects* (names
only, no parameters): `S_HalfTone`, `S_HalfToneColor`, `S_HalfToneRings`, `S_PixelSort`,
`S_Mosaic`, `S_Posterize`, `S_Diffuse`, `S_EdgeDetect`, `S_Glow`, `S_UltraGlow`,
`S_DropShadow`, `S_Vignette`, `S_Shake`, `S_WarpVortex`, `S_WarpPolar`, `S_SoftFocus`,
`S_ZDefocus`, `S_RackDefocus`, `S_BlurDirectional`, `S_Grain`. Grab-bag `.aex` adds
`Bendio`, `AtomicStretch`, `Fold`, `Aura`, `Deep Glow`, `FastBokeh`, `HeatDistortion`,
`FractalNoise3D`, `FalseColor`, `Blace`, `Discotext`.

## 3. Real parameter surfaces read from preset XML-equivalent data

### 3.1 Procedural "wave" controller — `presets\CT_Wave_Preset.ffx`

Effect `Pseudo/CT Wave Controller`, 10 knobs (unnamed row 0000 is a hidden pivot):

| Control | Default | Range (`tdum`..`tduM`) |
|---|---|---|
| Color | 255,255,255,255 | — |
| Width | 30 | 0..100 |
| Loop Time (frames) | 25 | 0..100 |
| Amplitude | 0 | 0..100 |
| Number Of Waves | 2 | 0..10 |
| Length | 100 | 0..200 |
| Start | 0 | 0..100 |
| End | 100 | 0..100 |
| Offset | 0 | 0..360 |

This is the archetype to copy: **one effect, ≤9 sliders, every slider 0..100-ish, one
0..360 phase offset, one integer count.** A whole animated look from that.

### 3.2 Layer-style shadow — `Inner Shadow v1.1.ffx`

Two stacked effects: `Pseudo/KMLS Inner Shadow` (the friendly UI) driving `ADBE Layer Styles`.

| Control | Stored value | Range | Note |
|---|---|---|---|
| Blend Mode | 0 (`Normal`) | 30-entry popup incl. Multiply, Screen, Overlay, Soft Light, Color Dodge, Linear Burn, Hard Mix | full Photoshop blend list is in the `pdnm` chunk |
| Shadow Color | RGBA | — | |
| Opacity | 100 | 0..100 | expression: `effect("Inner Shadow").enabled ? … : 0` |
| Direction | 0 | — | |
| Distance | 40 | 0..100 | |
| Softness | 100 | 0..100 | |
| (driven) blur | — | — | expression `Softness / 2` |
| (driven) localLightingAngle | — | — | expression `Direction * -1 - 90` |
| chokeMatte, noise | 0, 0 | — | extra layer-style-only params |

Transferable pattern: **5 visible controls, and the "hard" underlying values are derived by
expression** (`softness/2`, `-direction-90`). Few knobs, derived internals.

### 3.3 Sway — `AutoSway_v1.86\AutoSway_ffx\ASL.ffx` (effect `AutoSway Lay`)

| Control | Value | Range |
|---|---|---|
| Sway type / Z axle / Position only / position and rotation | mode flags | — |
| Sway distance | 200 | 0..200 |
| Sway roundness | 30 | 0..100 |
| Sway Speed | 201 | 0..201 |
| Sway Decay | 0 | 0..100 |
| Offset | 0 | 0..100 |
| Lag factor | 540 | 0..540 |
| Scale X / Y | 0 / 0 | -100..100 |
| Wind strength | 10 | 0..100 |
| Wind interval | 1 | 0..100 |
| Wind loop period (seconds) | 100 | 0..100 |
| Twist motion Y / Z | 0 / 0 | 0..100 |

### 3.4 Circular / orbital motion — `AutoCircularMotion_v1.03\AutoCircularMotion_ffx\ACM.ffx`

| Control | Value | Range |
|---|---|---|
| Pendulum + Pendulum ON | off | — |
| Angle (Pendulum only) | 180 | — |
| Speed(XYZ) | 100 | -100..100 |
| Speed XY / Speed Z | 0 | -100..100 |
| Scale XY | 12.5 | — |
| Scale Z | 250 | -100..100 |
| Offset / Shift | 0 | -100..100 |
| Decay(Scale) | 0 | **-100..0** |
| Lag factor | 0 | — |
| Opacity(0~100) | 100 | 0..100 |
| Bounce X / Y / Z | 0 | — |
| AutoRotation X/Y/Z, ReverseRotation | 0 | flags |

Note `Decay` is expressed as a **negative-only range (-100..0)** — a "slow down" slider, not
a physics sim. That is the cheap version of bounce/overshoot.

### 3.5 Ease tooling — `Kease_1_2_6\html\KeaseSettings.html`, `KeaseIndex.html` (DOC)

Readable control names: **Preset Library (Simple and Extended Presets)**, **Speed Pass
option is 'ON' at start (recommended)**, **Text below each Simple/Extended Preset**,
**"The Ease Shortcut works only on the middle section of your keyframe selection"**,
plus a curve editor ("Click on a curve to save it", Export Mode). 200+ `.ffx`-adjacent
`0*_KeaseEaseShortcut.jsx` / `00_KeaseCopyShortcut.jsx` shims exist at the grab-bag root
(NAME only; the `.jsxbin` bodies were not read).

Inference (INFER): Kease's model is *two ease tiers* — a short "simple" list for students and
an "extended" list for power users, with a speed multiplier that scales the whole curve.

### 3.6 Diopter — 62 presets, a ready-made preset-naming taxonomy (FFX + NAME)

`Diopter v1_0_4 [Monter Group]\Presets\Diopter Presets\*.ffx` (also duplicated at
`presets\Diopter Presets\`). File names encode the whole taxonomy, grouped by prefix:

| Prefix | Presets |
|---|---|
| `LENS` | Standard, Macro, Macro slow, Tilt Shift, Tilt Shift slow, Tilt Shift I, Tilt Shift I slow |
| `REFLECT` | Glass, Divine, Discreet, Burn, Tear, Tear slow |
| `SHAPE` | Vignette, Scope, Super8 |
| `SUBTLE` | Glow, Flare, Bokeh, Bubble, Sky, Sea, Wall |
| `GRAPHIC` | Glitch, Hallu, Party, Shine, Speed, Avatar, Flashback |
| (none) | Default |

Transferable: **prefix families + an intensity word, and a "slow" variant of the same look.**
That naming alone is a shippable preset browser.

## 4. Ranked taxonomy for a Motion panel (INFER, grounded in the above)

Score = value/effort for a touch-first student app. "Evidence" points at the settings actually
seen in this collection.

| # | Feature | What it is | Settings/values seen | Why it fits students | Effort |
|---|---|---|---|---|---|
| 1 | **Ease presets** | Named in/out curves applied to a selection | Kease: Simple vs Extended preset library, Speed Pass on, ease applies to "middle section" only (§3.5) | One tap, instantly better-looking motion; no graph editor needed | S |
| 2 | **Ease on/off + amount** | A single 0..100 "ease amount" that blends linear→curve | Implied by Kease Speed Pass; AutoSway/ACM both expose a single `Lag factor` (0..540) as the smoothing knob (§3.3, §3.4) | Slider is touch-friendly, understandable | S |
| 3 | **Overshoot / back** | Ease past the target and settle | `Decay(Scale) -100..0` (ACM), `Decay 0..100` (AutoSway) are the "settle" halves of this | The "snappy" look students ask for, one parameter | S |
| 4 | **Bounce (light)** | 1–3 decaying bounces on arrival | ACM `Bounce X/Y/Z` + `Pendulum` + `Angle=180` (§3.4) | Reads as physical without a physics engine | M |
| 5 | **Loop / perfect loop** | Cycle a value over N frames with phase offset | CT `Loop Time (frames) = 25`, `Offset 0..360` (§3.1); grab-bag `CT_loop_Preset.ffx`, `CT_loopInOut_Preset.ffx`, `CT_Perfect_Loop_Preset.ffx` (FFX, names) | Every student makes a loop; phase offset makes it feel designed | S |
| 6 | **Stagger / delay** | Offset the same animation across N items | cloner effector set incl. `Step Effector`, `Random Effector`, `Pulse Effector` (§1); AutoSway `Lag factor 0..540`, `Offset 0..100` | Turns "all at once" into mograph | M |
| 7 | **Wiggle** | Noise-driven offset | cloner `Noise Effector`, `Wiggle Effector` (FFX names); grab-bag `Help\wiggle.html` (DOC, not read in depth) | Hand-drawn/organic feel with 2 numbers (amount, speed) | S |
| 8 | **Squash & stretch** | Non-uniform scale tied to motion | ACM `Scale XY 12.5`, `Scale Z 250`, `Scale X/Y -100..100` (AutoSway) (§3.3, §3.4); `AtomicStretch.aex` (NAME) | Classic animation principle, teachable | M |
| 9 | **Sway / wind** | Looping drift over a pivot | `Sway distance 0..200`, `roundness 0..100`, `Speed 0..201`, `Wind strength 0..100`, `Wind interval`, `Wind loop period 0..100 s` (§3.3) | Makes static illustrations feel alive | M |
| 10 | **Circular / orbit** | Move around a centre with pendulum option | `Speed(XYZ) -100..100`, `Angle 180`, `AutoRotation`, `ReverseRotation` (§3.4) | One-slider orbit, very demo-able | M |
| 11 | **Camera / parallax** | Fake depth move across layers | `Help\looper.html`, `autoParallax_v1.0.jsxbin`, `AE Camera Morph v1.2.2.jsxbin`, `autoParallax` (NAME); no numeric evidence read | Big perceived production value | M–L |
| 12 | **Roughen / distressed edge** | Perturb a stroke or fill edge | **no evidence in this collection** (§8); nearest name-level cousins `S_EdgeDetect`, `S_Diffuse`, `HeatDistortion` | Strong "hand-made" look | M |
| 13 | **Gaussian blur / glow** | Soft blur, optional bloom | **no preset evidence** (§8); Sapphire name-level: `S_Blur`, `S_Glow`, `S_UltraGlow`, `S_SoftFocus`, `S_ZDefocus`, `FastBokeh.aex` | Cheap, always-useful polish | S |
| 14 | **Halftone / dither / pixel** | Stylise into dots or pixels | Small pack: `PixDither`, `PixStipple`, `PixyHalftone`, `RetroDither` (NAME); Sapphire `S_HalfTone`, `S_HalfToneColor`, `S_HalfToneRings`, `S_Mosaic`, `S_PixelSort` (NAME); grab-bag `AESweets Halftone v1.1.1` | Very "few knobs, strong look"; great student demo | M |
| 15 | **Text / typewriter** | Per-character reveal | `cz_Typewriter_v1.ffx`, `AM_Typewrite Text v1.0.jsxbin` (NAME) | Common classroom need | M |
| 16 | **Particle systems** | Emitters, forces, sprites | `Pseudo/AE` particle presets not present; `Trapcode` (NAME only) | Too much surface area for v1 | XL |

Cut list (INFER): 3D (Element 3D `VIDEOCOPILOT 3DArray`, E3D cloner/effector/fracture),
character rigs (`CTE_*` Body/Hands/Legs controllers, BAO Bones/Joint), camera tracking
(`GeoTracker`, `Lockdown`), and physics solvers.

## 5. The 12 most transferable settings

| # | Setting | Value / shape to copy | Source |
|---|---|---|---|
| 1 | Single 0..100 intensity slider per effect | every CT controller knob is 0..100 or 0..200 | §3.1 FFX |
| 2 | Phase offset 0..360° | `Offset` 0..360 on a looping wave | §3.1 FFX |
| 3 | Loop length in frames, not seconds | `Loop Time (frames) = 25` | §3.1 FFX |
| 4 | Integer count knob with small max | `Number Of Waves 2`, range 0..10 | §3.1 FFX |
| 5 | Start/End trim pair 0..100 | `Start 0`, `End 100` | §3.1 FFX |
| 6 | Softness → blur derivation | `blur = Softness / 2` | §3.2 FFX expression |
| 7 | Angle derivation from direction | `localLightingAngle = Direction * -1 - 90` | §3.2 FFX expression |
| 8 | Shadow distance in 0..100 UI units | `Distance 40`, `Opacity 100`, `Softness 100` | §3.2 FFX |
| 9 | Lag/smoothing as one 0..540 factor | `Lag factor` | §3.3 FFX |
| 10 | Decay as negative-only slider | `Decay(Scale) -100..0` | §3.4 FFX |
| 11 | Two-tier ease preset library | Simple vs Extended, Speed Pass on by default | §3.5 DOC |
| 12 | Prefix-family preset naming with "slow" variants | `LENS … slow`, `SUBTLE Glow`, `GRAPHIC Glitch` | §3.6 NAME |

## 6. What this implies for 2Dope (INFER)

- Ship **one effect = ≤6 sliders**, all normalised 0..100, one integer count, one 0..360
  phase. That is the dominant pattern across every usable preset here.
- Derive internals from a friendly control (softness→blur, direction→lighting angle) rather
  than exposing both.
- For motion, ship **lag + decay + bounce** as three sliders on the same "settle" model
  instead of a physics panel; that covers ease, overshoot and bounce with one mental model.
- Presets should be named `<FAMILY> <Look> [slow]`, matching the Diopter scheme.

## 7. Files read

| File | Class | What was taken |
|---|---|---|
| `D:\Downloads\Misc\Applications\Plugins\Ultimate Mograph Plugins Grab Bag\**\*.ffx` (264, 262 parsed) | FFX | effect inventory, parameter names/values/ranges, popup lists |
| `…\presets\CT_Wave_Preset.ffx` | FFX | §3.1 full knob table |
| `…\Inner Shadow v1.1.ffx` | FFX | §3.2 blend list, values, expressions |
| `…\AutoSway_v1.86\AutoSway_ffx\ASL.ffx` | FFX | §3.3 sway table |
| `…\AutoCircularMotion_v1.03\AutoCircularMotion_ffx\ACM.ffx` | FFX | §3.4 orbit table |
| `…\Diopter v1_0_4 [Monter Group]\Presets\Diopter Presets\*.ffx` (29) | FFX/NAME | §3.6 taxonomy |
| `…\Kease_1_2_6\html\KeaseSettings.html`, `KeaseIndex.html` | DOC | §3.5 control names |
| `D:\Downloads\Misc\Applications\Plugins\After Effects\README.txt` | DOC | pack is a plain `.aex` copy; effect lives under `Effect > BGRA` |
| `C:\Program Files\Adobe\Adobe After Effects 2026\Support Files\Plug-ins\**` | NAME | §2 inventory, absence of built-ins |
| `C:\Program Files\Adobe\Common\Plug-ins\7.0\MediaCore\**` | NAME | Sapphire/Trapcode name list |
| `D:\Downloads\Misc\Applications\Plugins\Ultimate Mograph Plugins Grab Bag\**\*.aex` (73) | NAME | §2 name list |

Helper scripts written for this survey (read-only over the sources):
`_tools\ffx_extract.py` (RIFX chunk parser), `_tools\aggregate.py` (cross-preset roll-up),
`_tools\ffx_probe.py` (chunk tree dump), `_tools\pdf2txt.py` (PDF text attempt).

## 8. Gaps

- **Roughen Edges and Gaussian Blur: no evidence.** No preset in the 262 parsed `.ffx`
  references `ADBE Roughen Edges`, `ADBE Gaussian Blur 2` or `ADBE Turbulent Displace`, and
  the built-in `.aex` set is not installed here (`AfterFX.exe` absent). Their parameter names
  and ranges are **not documented in the files read** — do not quote numbers for them from
  this report.
- **Small-pack parameter surfaces not read.** `B.Carve`, `B.Fringe`, `PixDither`,
  `PixStipple`, `PixyHalftone`, `RetroDither`, `ntsc-rs-ae` ship PDFs
  (`RetroDither.pdf`, `PixyHalftone_V1.0\readme.pdf`, `Installation.pdf`, `EULA.pdf`) whose
  text is converted to outlines / Type3 glyphs; extraction returned no readable parameter
  names or ranges. Printable strings in the `.aex` files contained no UI labels either, and
  the binaries were not decompiled (out of scope). So: **controls and ranges for these seven
  effects are unknown**, not "few knobs" by assumption.
- **`.jsxbin` not read** (451 files): compiled/obfuscated AE script bytecode. This includes
  `EaseCopy.jsxbin`, `EasyBounce.jsxbin`, `Bendio`, `AutoParallax`, `Lazy 2`, `Moshun`,
  `Influx`, `Flex`, `Kangaroo`. Their actual easing/bounce parameter names are unknown.
- **`.zxp` not read** (encrypted/signed CEP packages): `After Ease v1.1.3\…zxp`,
  `AnimationStudio.zxp`, `BeatEditAe_v2.1.009.zxp`, `expressionist_v1.5.5.zxp`, plus many
  others. After Ease's ease-curve set is therefore unverified.
- **Flow v1.4.2** (`Aescripts Flow v1.4.2 (WIN+MAC)\flow-v1.4.2\panel\js\panel.js`, 1.6 MB)
  ships its named curves inside minified/obfuscated panel code; no preset JSON is present on
  disk. Flow's actual curve names and speed/influence values were **not recovered**.
- **PDF manuals generally unreadable**: `AutoSway_Guide_eng.pdf`,
  `AutoCircularMotion_Guide_English.pdf`, `EaseCopyInstallation1.7.pdf`,
  `Bendio\Tutorial.mp4` region docs all failed text extraction (mixed glyph shifts, no
  ToUnicode maps). Only `.html` docs yielded clean text.
- **`.mogrt` (695) and `.aep` (782) not opened** — project binaries, out of scope.
- **No execution verification.** Every value here is a stored preset default or range, not a
  tested behaviour. A preset's stored value is not proof of what the effect does on render.
