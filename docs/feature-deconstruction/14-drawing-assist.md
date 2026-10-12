# 14. Drawing assist: Procreate first, Lazy Nezumi rulers as extras

Study, 2026-10-11. Sources: the Procreate handbook (Guides, Drawing Assist, QuickShape, public pages)
and Lazy Nezumi Pro's own manual and preset names from the user's install
(`C:\Program Files (x86)\Lazy Nezumi Pro\docs` and `presets`). Behaviour only. The `plugins` folder
holds two compiled Photoshop hook files (`MouseHookPro*.8li`) that only route the mouse; they say
nothing about the drawing tools and were not opened. Nothing was decompiled or copied.

The user prefers Procreate-style drawing assist; Lazy Nezumi adds ideas on top.

## What Procreate does

| Feature | Behaviour |
|---|---|
| **Drawing Guides** | One guide per canvas: **2D Grid** (square), **Isometric** (triangular, no foreshortening), **Perspective** (1, 2 or 3 vanishing points you place and drag), **Symmetry** (vertical, horizontal, quadrant, radial; optional rotational). Colour, opacity, thickness and size are adjustable. Shown on screen only, never exported. |
| **Drawing Assist** | A per-layer switch: strokes on that layer follow the guide (grid → horizontal / vertical; isometric → the three axes; perspective → toward a vanishing point; symmetry → mirrored copies). |
| **QuickShape** | Draw, then **hold** at the end of the stroke: it snaps to a clean line, arc, ellipse, rectangle or polygon. Adding a second finger while holding constrains it (circle, 15° steps). Then you can edit the shape with handles. |

## What Lazy Nezumi adds (rulers and smoothing, from its manual)

| Idea | Behaviour | For 2Dope |
|---|---|---|
| **Accuracy** (all rulers) | 1 = fully on the ruler; lower mixes some of your real line back in for a natural look. | Yes: one "Assist strength" slider. |
| **Ellipse ruler** | Degree (90 = circle) and rotation; size from where the pen goes down; *auto-fit* from a sketch; option to join the ends cleanly. | Later; QuickShape covers most of it. |
| **Radial lines** | Lines from a centre point, optionally curved. Used for motion and impact. | **Yes**: speed lines and impact frames for animation. |
| **Parallel lines** | One angle; rotate it around the pen. | Yes (rain, speed lines, hatching). |
| **Connected lines** | Each new line starts at the start, middle or end of the last one. | Later. |
| **Isometric / linear perspective** | Auto-detect the axis from the first motion; optionally switch axis mid-stroke; **box mode** clamps to a box so corners close without overshoot. | Auto-detect yes; box mode later. |
| **Fisheye, vanishing-lines match, perspective ellipse, Bézier rulers** | Specialised. | Later or never. |
| **Smoothing modes** | Moving average with catch-up, exponential, pulled string, **inertia / weighted** (mass and drag; pressure from speed gives tapered lines). | We have exponential + pulled string; add inertia. |
| **Pressure shaping** | Gain, softness, min / max, speed-based gain (thicker when fast or slow). | Partly covered by brush dynamics; a global pressure curve is on the open list. |
| **Scripting, L-systems, pattern rulers** (sine / saw along a path) | A scripting language for line effects. | No. |

## Design for 2Dope

**Guides belong to the project** (saved in project.json, additive) and show in Draw and Time over the
page, under the onion skin colour, never in exports. They live in **☰ → Drawing guide**: Off · Grid ·
Isometric · Perspective · Symmetry, plus colour, opacity and size. Vanishing points and the symmetry
centre are dragged on the canvas while the guide editor is open.

**Assist is per drawings layer** (like Procreate), a toggle in the canvas menu and the layer menu, with
an Assist strength (Lazy Nezumi's accuracy).

| Guide | Assist does |
|---|---|
| Grid | The stroke locks to horizontal or vertical, picked from its first few pixels of motion. |
| Isometric | Locks to the nearest of the three axes (auto-detect). |
| Perspective | Locks to the line toward the nearest vanishing point, or vertical (2-point). |
| Symmetry | Every stroke is drawn 2, 4 or N times, mirrored (or rotated) around the centre. The copies are part of the same stroke, so one undo step. |
| Radial (from Lazy Nezumi) | Locks each stroke to the ray from the centre: instant speed lines. |
| Parallel (from Lazy Nezumi) | Locks to one angle. |

**QuickShape** works with every brush and needs no guide: hold still at the end of a stroke for about
half a second and the stroke is replaced by the best fit among line, arc, ellipse, rectangle and
polygon (least-squares fits; pick the one with the lowest error per point within a tolerance). It is
one undo step with the stroke, because strokes are data and get re-rendered. A second finger while
holding gives a perfect circle, square or 15° line. Editing handles come later.

How it fits the engine: all of these change the stroke's **points** before rendering, the way post-correction already does
(DECISIONS, step 6). Raster and vector strokes both get them, and replay stays exact.

## Plan

| # | Step | Model |
|---|---|---|
| A | QuickShape (line, ellipse/circle, arc, rectangle, polygon fits; hold to snap; second-finger constraint) | Opus |
| B | Guides: model + overlay (grid, isometric, 1/2/3-point perspective, symmetry, radial, parallel) | Opus |
| C | Assist: per-layer toggle, snapping per guide, symmetry copies, strength | Opus |
| D | Guide editor UI (☰ → Drawing guide, drag points on canvas) | Sonnet |
| E | Inertia smoothing mode, box mode | later |

## Sources

- Procreate handbook, Guides: https://help.procreate.com/procreate/handbook/5.0/guides
- Procreate handbook, creating a guide: https://help.procreate.com/procreate/handbook/guides/guide-create
- Procreate Pocket handbook, Guides: https://help.procreate.com/pocket/handbook/guides
- Lazy Nezumi Pro manual (local install, `docs\LazyNezumiProDoc.pdf`) and stock preset names
