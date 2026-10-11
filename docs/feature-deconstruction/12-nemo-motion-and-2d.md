# 12: Nemo (open-source motion design + 2D animation)

Source: `nemo-main.zip` (github.com/mysteropodes/nemo, v0.7.0-alpha.4), read 2026-10-11: README,
`docs/FUNCTIONAL_GAPS.md`, `engineering/animation/ADR-001-curve-runner.md`, and parts of
`src/js/app.js`, `src/js/motion.js`, `src/js/domain/component/exposed-properties.js`.

**License: GPL-3.0-or-later.** We study behaviour and design only. Copying Nemo code into 2Dope
would make 2Dope GPL as well, so none is copied. (2Dope has no license chosen yet; see DECISIONS.)
REA was not needed: this is readable source, not a compiled app.

✅ 2Dope has it · ➕ take · ❌ skip

## What Nemo is

Two modules on **one document**: *Animation 2D* (vector frame-by-frame with automatic
inbetweening, X-sheet prototype, onion skin) and *Motion* (After Effects-style keys, easing
curves, graph editor, parenting, cameras, rigging, effects). That is the same bet as our
Draw / Time / Motion workspaces (doc 11), from someone who has shipped it. Tauri desktop app
plus a WebGPU web build; Rust/WASM for heavy geometry; snapshot undo with an anti-flood guard on
drags (✅ same as our CompEditor).

## Components (their precomps): the useful parts

| Nemo | What it means | 2Dope |
|---|---|---|
| Double-click to enter, own camera, time remap | as ours | ✅ enter/exit, camera per comp; time remap ➕ |
| **Play mode per instance**: `once` (default: play once then hold the last frame), `loop`, `single` (show one chosen frame), plus `speed` and a placed-at frame | lets one comp be a walk cycle (loop), a one-shot (once) or a **replacement library** (single) | ➕ replace our `loop` flag with `play: once / loop / pingpong / single` + `frame` + `speed` |
| A key on the outer timeline can **pick the component frame** shown for its whole hold | Flash/Harmony "graphic symbol" swaps: mouth charts, hand poses, blinks timed from the parent's X-sheet | ➕ big win for lip sync: a precomp of mouth drawings, swapped from the shot's X-sheet |
| Lesson recorded in their code: a fresh component must **not loop by default** (it made the parent timeline look short) | default `once` | ➕ adopt (our default is loop = off, keep it) |
| **Exposed properties on strokes**: fill colour, stroke colour, opacity, **visibility** of one stroke inside the component, overridden per instance | recolour one character instance, hide an accessory per shot | ➕ extend our pins to paint: fill colour / line colour per drawing plane, and visibility per layer |
| Time remap overrides every play mode (one chokepoint resolves "which inner frame") | freeze, hold, reverse, ramps from one curve | ➕ add `timeRemap` prop to comp layers, evaluated in `nestedFrame` |

## Motion ideas worth taking

- **Key loops after/before the keyed range**: `cycle`, `pingpong`, `offset` (each pass continues
  from the last), `continue` (straight on at the last speed). One implementation for both
  directions. ➕ a per-property "after last key" setting; covers bounces and idles without keys.
- **Parent in time**: a child's in/out offsets linked to its parent. ➕ later (time-parenting).
- **Weighted blend between two parents** (beyond After Effects): hand-offs (a ball passed from
  one hand to the other). ➕ later.
- **One curve evaluator** shared by tweens, motion, camera and pressure, kept pure and tested in
  isolation (their ADR-001). ✅ our `core/anim.ts` is that seam; keep it pure.
- Graph editor (value + speed). ➕ planned.
- Camera export to After Effects as a `.jsx` script; Lottie/Rive/OCA exports. ➕ OCA (Open
  Cel Animation) is worth adding next to the Blender handoff: Krita and others read it.

## Where 2Dope is already ahead (their own gap list)

- **Touch pinch-zoom: missing in Nemo.** 2Dope is touch-first.
- **X-sheet: only a Labs prototype in Nemo.** Ours is a production view.
- **Custom shortcuts: missing** in both; ours is planned (doc 08 K).
- **Blender handoff**: Nemo has none. That stays our headline.
- Memory: Nemo uses a bounded LRU image cache (✅ same idea as our residency).

## Skip

Expressions and mograph duplicators (v1 non-goals), 3D layers with vertex projection, WGSL
effects, Kitsu integration, Figma/PSD import (later, maybe), Labs.

## Proposed next steps from this

1. Precomp play modes (`once` / `loop` / `pingpong` / `single` + frame + speed) and time remap.
2. "Pick component frame" on the shot's X-sheet (lip-sync swaps).
3. Paint pins (colour, visibility) on top of our transform pins.
4. Key loops after the last key.
5. OCA export beside the Blender add-on.
