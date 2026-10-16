# Art effects: small, stackable, exportable

**Clipping/UI follow-up (2026-10-16):** [Layer/mask manual study](LAYERS-MASKS-AND-UI-STUDY.md) distinguishes clipping, Alpha Lock, grayscale masks and temporary selection; records the proposed layer-below UI and open base/effect/export rules. No clipping implementation is implied by existing alpha-preserving tint.

User direction · 2026-10-15 · proposal, not implemented

Purpose: give 2D artwork personality while keeping drawing and animation approachable and precise. The user likes After Effects-style stacking, but wants a limited art-focused set, not a general VFX system. Continue the existing Draw/Time/Motion/Board model and prepare usable output for advanced software.

## Student-first scope and clipping masks

User steering: keep the app easy for students and enjoyable while teaching drawing, timing, animation and compositing. Features earn their place by supporting a clear animation task; feature parity with reference apps is not the goal. Do not expose all advanced controls by default or turn the existing UI into a second effects workstation.

**Clipping masks are requested.** Proposed first version: a layer-menu toggle, **Clip to layer below**, with an indented row/arrow identifying the relationship. Use the nearest unclipped base for a consecutive clipped stack, constrained to the current comp. Paint, texture or animate shading on the clipped layer while retaining clean original art. An ordinary layer stays ordinary unless clipping is enabled; provide an obvious release action.

Fit this into existing rails/Line/Fill organization. The first mask is based on the base layer's composited alpha, not its bounding box. Define how base opacity/visibility, reordered or deleted bases, nested comps and blend modes affect the clipped stack. Ineligible/orphan clipping must have explicit behavior; never silently switch targets across a comp boundary. Whole-comp masks, arbitrary matte pickers, inverted/luma masks and mask painting can wait.

**Clip to Fill** is a useful later option for shading inside flat colors while preserving ink; distinguish it from clipping to the whole layer. It must identify the intended base drawing layer rather than treat Line/Fill children as independent timed tracks. Alpha Lock (restricting edits to existing pixels) is a different feature and must not be mislabeled as a clipping mask.

Before combining masks with effects, define whether effects are clipped before/after processing: a texture should normally remain inside its mask, while a glow may deliberately spread beyond it. Show that choice only where necessary. Verify one-step undo, timing changes, parent transforms, save/load, and consistent preview/export. Line/Fill export may need the base alpha even if the base is excluded from that output pass; do not derive clipping from whichever pass happens to be rendering.

Current `view/composite.ts` uses alpha compositing for part tint but has no general layer-clipping implementation established in this source review. Historical study 15 proposes masks; it does not prove they are implemented, cheap on every device, or compatible without a format migration. Revalidate storage and performance during implementation.

**Recommended lesson-sized workflow:** draw base colors → add a clipped shading/texture layer → adjust its opacity → animate or loop the shot → export. Start with layer-to-layer alpha clipping and its existing-menu UI before stacking advanced masks or broad effects. Keep numeric frame timing and detailed keys available in Time/Motion without requiring beginners to open them.

## Targets and controls

Support ordered, non-destructive stacks on **Line (including vectors)**, **Fill**, a **whole drawing layer**, and a **whole comp/precomp**. Collapse effects beneath the existing hierarchy; show the target clearly. Add, reorder, enable/bypass, duplicate and remove effects, with one undo step per completed edit. Keep common parameters short and expose detailed animation in Motion. Numeric parameters should use existing keyable properties where meaningful; seeds and effect types are discrete values.

Current source already has per-part tint, visibility, opacity and offset (`core/comp.ts`, `view/composite.ts`), layer blend modes and nested-comp compositing. It does not yet have a general ordered effects stack. Extend these boundaries instead of replacing the renderer. Drawing assets remain clean; effects belong to their usage/target so shared drawings can have different treatments in different layers.

## Focused candidate set

| Effect family | Art use | Minimal useful controls |
|---|---|---|
| Color overlay / duotone | Recolor ink, unify a palette, animate a color accent | Color(s), amount; preserve alpha |
| Grain / texture | Paper, pencil breakup, mottled paint on Line or Fill | Amount, scale, seed, texture space; protect transparency |
| Line boil / turbulent displacement | Imperfect living contours, hand-drawn wobble | Strength, scale, evolution, seed, hold interval |
| Glow / soft edge light | Luminous ink, magical accents, soft highlights | Color, radius, intensity, threshold |
| Sparkles / flicker | Brief decorative highlights and shimmer | Density, size, lifetime/rate, seed, color, emission region |

These are proposed families, not a promise of every effect at once. Noise here must distinguish texture/noise in color or alpha from geometric contour displacement. Sparkles can start as a bounded procedural accent rather than a particle simulation.

## Render and timing contract to settle before implementation

1. **Order:** part-level processing precedes merging Fill then Line/vectors; layer processing follows that merge; comp processing follows child compositing. Existing tint/opacity/offset, transform, blend, camera and comp-background ordering must be specified precisely and preserve old files. A whole-comp stack is different from an instance-only treatment of a precomp layer.
2. **Time:** evaluate at explicit layer/comp time, not elapsed wall-clock time. Seed plus target identity and time determines results for seek, reverse, loop, save/reload and export. A hold interval can produce stable boils on twos/threes instead of unwanted every-frame flicker. Define local versus parent time so looping precomps behave deliberately.
3. **Artwork:** a zero-strength/bypassed stack reproduces the current image. Default texture/overlay stays within the source alpha. Displacement may deform boundaries; glow/sparkles may extend beyond them. Define per-effect bounds/padding so edges are not silently cropped. Preserve alpha and avoid dark halos.
4. **Performance:** reuse bounded scratch surfaces and cache by content revision, target parameters, time and render size. Preserve residency/Lite budgets; do not allocate full-resolution canvases for every stack entry indefinitely. Benchmark a representative frame before selecting Canvas filters, CPU processing or a lazy GPU pass. Older study 15's backend/performance claims are proposals, not current-device evidence.
5. **Editing/export:** Draw can bypass effects to paint cleanly without disabling their final render. Playback and exports share the same evaluator. Clearly mark reduced-quality preview; never silently omit an unsupported effect. Persist stack order/keys/seeds through schema validation and migration, keeping `.2dope` self-contained for texture assets.

## Porting to advanced software

Offer clean original art and baked RGBA frames/passes with frame rate, timing, target identity and seeds recorded in a manifest. Preserve editable 2Dope stacks in the native project. Supported native-effect mappings can come later; do not promise that another application's turbulence or glow will match our parameters.

Line/Fill passes can carry their own part treatments. Effects applied after Line/Fill merge or across the whole comp may require an additional combined bake; independently exporting two passes is not guaranteed to reconstruct a nonlinear final effect. Label what is baked and what remains editable, and preserve composition alignment/padding. Reuse existing Blender/rendered-precomp export pathways where suitable, after checking their actual pass support.

## Recommended first slice

**Stack foundation + Color Overlay**, reusing current tint/alpha behavior as a compatibility reference. Prove target selection, order, bypass, keys, undo, save/reload, alpha and export consistency before adding expensive displacement. Follow with texture/line boil, then bounded glow and sparkles. This ordering is a proposal for review; no effects code, format change, dependency, merge or deployment is part of this note.

Related historical design: [study 15, effects section](feature-deconstruction/15-workspace-roles-masks-effects.md). Current direction broadens that older layer-only proposal to include Line, Fill and comp targets. It does not displace the pending shape-precision branch or approved timing work.
