# Grab bag: which plug-ins are worth REA, and what each would answer

2026-10-31 · triage of `D:\Downloads\Misc\Applications\Plugins\Ultimate Mograph Plugins Grab Bag`
for the next research sessions. Reference only; nothing installed or executed.

## What is in the folder

| Type | Count | Size | Analysable how |
|---|---:|---:|---|
| `.js` | 4,669 | 139 MB | read directly (many are installer `node_modules`, not plug-in code) |
| `.aep` | 782 | 1.1 GB | project files; read only for presets/expressions |
| `.mogrt` | 695 | 425 MB | Motion Graphics templates; not REA |
| `.zip` | 316 | 6.2 GB | installers/packs; inner content varies |
| `.jsxbin` | 451 | 307 MB | **obfuscated JS** — REA does not decompile it; skip |
| `.ffx` | 264 | 13 MB | already mined (RIFX parser in `../ae-mograph-settings/_tools`) |
| `.aex` | ~90 | — | **native PE plug-ins — the real REA targets** |
| `.zxp` | 25 | — | ZIP archives; several contain plain `.jsx` source (read, no REA) |

Three different jobs hide behind "REA these":

1. **Native `.aex`** — Ghidra/REA gives effect class, parameter labels, popup lists, defaults.
2. **`.zxp` with plain `.jsx`** (After Ease, Anubis, feedbackpro, datamosh, expressionist, BeatEdit,
   bodymovin, …) — no REA needed; the source is readable. That is the cheapest evidence in the bag.
3. **`.jsxbin`** (Flow, EaseCopy, EasyBounce, Bendio script, Lazy 2, Influx, …) — obfuscated; REA and
   Ghidra do not apply. Treat as unavailable unless a deobfuscator is in scope.

## Ranked REA candidates (native `.aex`)

Sizes are on disk; "fit" is 2Dope value, not plug-in quality.

### Tier A — small, cheap, directly useful

| Plug-in | Size | What it appears to be | Question REA would answer | 2Dope fit |
|---|---:|---|---|---|
| **Bendio.aex** | 0.37 MB | bend / squash-stretch deform | parameters (bend amount, axis, falloff, preserve length?) and their ranges | **High** — Motion-side squash/stretch and a "Bend" effect |
| **BlockSwap.aex** | 0.63 MB | frame/block swap for stop motion | the swap model (drawing↔hold, offset, random?) and controls | **High** — Animate flipbook frame ops |
| **Auto_Crop.aex** | 0.23–0.30 MB | auto-crop to content bounds | threshold/padding controls and alpha handling | **High** — Draw/export trim, asset building |
| **AtomicStretch.aex** | 0.03 MB | stretch / smear | single-parameter surface, direction/amount | Medium — smear frame aid |
| **Comp2Clip.aex** | 0.06 MB | comp → clip | what it copies (timing, effects?) | Low–medium |
| **Effect Matte.aex** | 1.1 MB | matte helper | matte source/expand/feather controls | Medium — layer masks |
| **bskl_diffusae.aex** | 2.16 MB | diffusion/glow ("Diffusae") | diffusion radius, threshold, blend controls | Medium — soft bloom look |

### Tier B — medium, worth one session each

| Plug-in | Size | What it appears to be | Fit |
|---|---:|---|---|
| **AEPixelSorter2.aex** | 2.15 MB | pixel sorting | distinct stylised effect; medium |
| **Deep Glow.aex** / **Aura.aex** | 1.8 / 2.4 MB | glow / aura | the planned Glow/Bloom effect; parameter names only |
| **AfterCodecsAE.aex** | 10 MB | ProRes/H.264 export codecs | export preset vocabulary (quality, codec, alpha) |
| **Discotext.aex / Digit Fiddler.aex** | 1.1 / 0.36 MB | text animation | only if text animation is in scope |
| **ContrastUp.aex** | 0.56 MB | contrast | trivial; skip unless cheap |
| **DEFlicker series** | 12 MB each | deflicker / rolling bands | stop-motion and timelapse cleanup; niche |

### Tier C — large or low fit; do not start here

| Plug-in | Size | Why not |
|---|---:|---|
| Lockdown.aex | 52 MB | mesh warp/pin; huge, and Ghidra import time dominates |
| Blace-1-3-2.aex | 21 MB | unclear feature; need a name-level question first |
| mocha.dll / KeenTools / Continuum / Helium / FBXtoAE / Bokeh / DOF Pro / FastCameraLensBlur | 12–590 MB | tracking, 3D, lens/DOF suites; out of 2Dope's scope or already covered by our blur |

## Cheapest wins that are not REA

Before any Ghidra session, read the **plain-JSX** ZXP payloads. From the archive listing:

- `After Ease v1.1.3.zxp` — 1 `.jsx`, 16 `.js` (the earlier report already used its ease vocabulary).
- `Anubis.zxp` — 4 `.jsx`, 19 `.js`; `feedbackpro_v1.0.0.zxp` — 1 `.jsx`, 52 `.js`;
  `datamosh_v2.1.2.zxp` — 1 `.jsx`, 182 `.js`; `expressionist_v1.5.5.zxp` — 1 `.jsx`, 885 `.js`.
- `AEInfoGraphics_v2.0.3.zxp`, `BeatEditAe_v2.1.009.zxp`, `ClipsExporter_v1.6.0.zxp`,
  `AutoMotionTrackerForObjects_v1.1.5.zxp`, `coco_v1.2.1.zxp` — plain `.jsx` present.

These answer "how does the tool build the animation" without disassembly — same evidence class as the
EffectCraft source read. The `.jsxbin`-only tools (Flow, EaseCopy, EasyBounce, Influx, copypasta,
filehunter, bg_renderer_max, AnimationStudio) cannot be read this way.

## Suggested queue

1. **Bendio** — smallest real effect, answers a Motion gap (squash/stretch).
2. **BlockSwap** — answers an Animate gap (frame/block swapping).
3. **Auto_Crop** — answers a Draw/export gap (trim to content).
4. Read the plain-JSX ZXP set (no REA) and extract the ease/loop vocabulary.
5. Revisit Deep Glow/Aura only when the Glow/Bloom slice is scheduled.

Method for each: `open_binary` the `.aex` → `search_strings` for control-like words → if sparse,
`list_procedures`/`analyze_function` on the parameter-setup routine; record PE SHA-256, parameter
labels, popup lists and defaults. Expect string-only evidence for GPU plug-ins (as with B.Fringe).

## Limits

- Plugin names are matched to folders, not proven by execution; "what it appears to be" is a
  name-level hypothesis until the REA pass reads its parameter setup.
- `.aex` UI labels may be constructed in code rather than stored (PixStipple in `wunk` is an example
  where nothing was recoverable); a sparse result is a bounded negative, not absence.
- Installers, cracks, `.aep` and `.mogrt` were not executed or opened.
