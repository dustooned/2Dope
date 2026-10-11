# 11: Design: three workspaces, one model, precomps by touch

Decision doc. Builds on 07/08 (Dreams), 09 (EffectCraft), 10 (Harmony). **Proposal, not built.**

## 1. The idea in one line

**One project, one playhead, one selection. Three workspaces are different arrangements of the same views.** Nothing is converted when you switch.

| Workspace | Feels like | Front view | Best for |
|---|---|---|---|
| **Draw** | Procreate Dreams flipbook | Canvas + flipbook strip (+ scrub wheel) | Drawing, inbetweening, quick timing |
| **Time** | Harmony Xsheet | X-sheet grid (+ small canvas) | Exact timing, holds, notes, lip-sync |
| **Motion** | After Effects | Layers list + property rows + keyframes (+ canvas) | Moving, scaling, fading, parenting, camera-like moves |

Harmony itself ships workspaces this way (Hand-Drawn / Animating / Compositing), so it is a proven pattern (doc 10 §1).

## 2. The model that makes them synchronous

```
Project
 └─ Comps[]                       // a "shot" and every precomp
     Comp { id, name, size, fps, duration, workArea, layers[] }   // layers: top first
      Layer { id, name, source, start, in, out, stretch,
              timeRemap?, parent?, blend, opacity, matte?, switches,
              props: PropTree }
      source = Drawings { exposures[], drawings }      // what we have today
             | Comp { compId }                         // precomp (instance)
             | Null | Image | (later) Text, Camera
      PropTree: transform/{position, scale, rotation, anchor, opacity}, timeRemap, exposed ★
      Prop: value, keys[], (later) expr
      Key: time, value, interp in/out, ease {speed, influence}, spatial tangents
```
- Today's project loads as **one comp with one Drawings layer**. No data loss, schema bump with a migration (we have the hook).
- **Views read this tree; they never own data.** Strip and X-sheet edit a Drawings layer's exposures. Motion edits layer times and props. All of it goes through the command/undo system.
- **Precomp = a Comp layer.** Mapping, collapse, preserve-fps and time remap follow doc 09 §2.
- Time stays integer-exact.

## 3. How the views connect (the "click a layer, go to its original editor" rule)

Each layer has a **home editor** based on its source:

| Tap this | Goes to | Because |
|---|---|---|
| a Drawings layer's cells (Motion view) | **Draw** with that layer active | edit the drawings |
| a Drawings layer's name in Time | Time | edit the timing |
| a Comp layer: **double-tap** | **enter** that comp (breadcrumb), landing in the workspace you were in | edit inside the precomp |
| a property row (position, opacity) | stays in Motion, row opens its keys | animate it |
| a key | selects it; long-press = easing menu | |

Switching workspace never changes what is selected. Entering a comp changes **which comp is current**; the breadcrumb `Shot › Walk cycle` is always on screen, and the ☰ dock has **Back out** so you cannot get stuck.

## 4. Precomps by touch (the hard part)

**Make one.** Select layers (tap, or lasso with the pen), then an action chip appears: **Group into comp**. Default is "move all attributes" (doc 09 §3): the layers vanish into a new comp, replaced by one layer at the top-most position. A second chip, **Keep look outside**, is "leave all attributes" for a single layer. One undo reverses it.

**Go inside.** Double-tap the comp layer. A short push-in animation says "you're inside". **Exit** by tapping the breadcrumb, the Back chip, or a two-finger pinch-out on the canvas.

**See context.** While inside, the outer comp's other layers show dimmed behind (Flash-style "edit in place"), so position and timing make sense. Toggle in the ☰ menu.

**Adjust from outside, without diving in.** Inside, long-press any property → **★ Pin**. A pinned property shows as a slider (or toggle/color) on every instance layer row. Dragging it **overrides on that instance only** (a small dot marks overridden); a ↺ chip resets it (doc 09 §4). This replaces deep digging for the usual cases: speed, color, offset, scale.

**Reuse.** Duplicate a comp layer → another **instance** (same content, own timing and pins). **Make unique** copies the comp. **Ungroup** puts the layers back into the parent (Harmony's "explode").

**Retime.** Drag the layer bar's ends = trim. Drag a handle on the bar's edge = **stretch** (speed). A **Loop** switch repeats the comp. **Time remap** is a property row that appears when asked (freeze frame = one hold key).

## 5. Touch rules for the Motion view

| Rule | Detail |
|---|---|
| Targets | 44 px minimum; layer rows 48 px; row height adjustable (3-finger vertical drag, Dreams' idea) |
| Left column (frozen) | eye, lock, name, parent chip, ★ pins. Collapsible to just icons |
| Time area | bars and key diamonds. Pinch = zoom time; two-finger drag = pan; ruler drag = scrub; tap ruler = jump |
| Select | tap; **pen lasso** adds/removes (draw across selected to remove) |
| Move/trim bar | long-press then drag, or drag edge handles. Snaps to playhead, markers, neighbour bars (hold a second finger to turn snapping off) |
| Properties | tap a layer's chevron → rows for position/scale/rotation/opacity. Only **animated** properties show by default ("U" in AE); a **+ Animate** chip adds others |
| Numbers | drag a number sideways to scrub it; drag sideways first then up/down for fine steps (Dreams slider trick). Tap to type |
| Keys | tap = select, drag = retime, long-press = menu: Easing (Linear / Ease in / Ease out / In-out / Hold), Copy, Paste, Reverse, Delete |
| Easing display | **spacing ticks** between keys (one tick per frame, from the ease curve) so timing is visible without a graph |
| Add key | change a value with ◆ armed (auto-key), or tap ◆ on the row |
| Record (Perform) | red ● toggle: drag on the canvas and keys are written every frame while the pen is down; Motion filtering slider; same-property pass overwrites (doc 08 D9) |
| Graph | later: tap a row's curve icon → a full-screen sheet with value graph and speed graph (Bezier handles). Not needed for v1 |

Everything is also a **keyboard shortcut** and a command (doc 03/04 pattern).

## 6. Phases

| # | What | Needs | Switch model first? |
|---|---|---|---|
| P0 | **Memory fix** (only the current drawing and onion neighbours live as canvases; others compressed) | independent | **Opus high** |
| P1 | **Model**: Comp/Layer/Prop/Key, migrate old files, commands + undo, tests | P0 helps | **Opus high** |
| P2 | **Workspace switcher** (Draw / Time / Motion presets) + Motion view with transform rows and 4 easings + spacing ticks | P1 | Sonnet medium |
| P3 | **Precomp**: group into comp, enter/exit, breadcrumb, instances, context dimming | P1, P2 | Opus high for the model parts, then Sonnet |
| P4 | **Pins/overrides**, time remap, loop, stretch | P3 | Sonnet |
| P5 | **Record mode** (+ motion filtering) | P2 | Sonnet |
| P6 | **Blender add-on** reads the same tree: Drawings layer → image plane with frame switching; Comp layer → empty with children; keys → F-curves (speed/influence → handles) | P1 | Opus high |
| P7 | Graph editor sheet; parent chains polish; mattes | later | Sonnet |

Blender note: because the **manifest is just this tree**, doing P1 well makes the add-on (M2) nearly mechanical. That is why I'd do P1 before building the add-on.

## 7. Risks and how we limit them

| Risk | Limit |
|---|---|
| Scope: three UIs | One model, views are thin, ship P2 with just transform rows |
| Nested time mapping bugs | Port the exact formula from doc 09 §2; property-test it (round trip: frame at comp time t equals frame at nested time) |
| Memory with nested comps | Comps hold *references* to drawings; lazy canvases from P0 |
| Touch precision on bars/keys | 44 px targets, snapping, row zoom, undo always one tap |
| Users get lost inside comps | Breadcrumb + Back in ☰ + dimmed context |
| File format churn | Schema 2 with migration and tests; keep JSON open and diff-friendly |

## 8. Decisions I need from you
1. **Names**: Draw / Time / Motion OK? (Or Flip / Sheet / Layers.)
2. **Instances share content by default** (edit one, all change), like AE and Harmony symbols. Yes?
3. **Motion view first scope**: transform + opacity only, then precomps. OK?
4. Should the **Blender export** treat a precomp as a **collection instance** (shared, light) or flatten it (simple, heavier)? I lean instance.
