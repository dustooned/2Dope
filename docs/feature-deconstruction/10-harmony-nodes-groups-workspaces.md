# 10: Harmony: node graph, groups, symbols, workspaces

Source: Toon Boom Harmony's shipped files (`F:\ToonBoom Harmony`: `resources/editors/*.xml`, `resources/layouts/harmony/*`, `resources/scripts/*.js`, `help/script/*.html`), read 2026-10-11. Behavior and public script names only; no binaries opened.
✅ in 2Dope · ➕ take · ❌ skip

## 1. One project, several views (the important finding)

Harmony shows the same scene through different editors at the same time:

| View | What it is |
|---|---|
| **Timeline** | layers as rows, drawings as cells; the animator's view |
| **Xsheet** | the same columns as a grid of frame numbers; the timing view |
| **Node View** | the same scene as a graph; the compositing/rigging view |
| Camera / Drawing | where you look at and draw it |

The shipped **layouts** are workspace presets over those views:
- **Hand-Drawn**: Xsheet-heavy (four xsheet references), Library, Tool Properties, Node View hidden.
- **Animating**: Timeline on top, Camera big, Colour / Tool Properties / Node View stacked on the side.
- **Compositing**: Camera + Timeline, a visible **Node View**, Node Library, Layer Properties, Function (curve) editor and Perspective views.

Nothing in these changes the data. A workspace is only *which views are open and where*. **This is the pattern to copy for your "modes" idea.**

## 2. Node types visible in the shipped scripts

READ (a drawing layer), **PEG** (a transform node: position, scale, rotation, skew, pivot, 3D), COMPOSITE, CUTTER / CUTTER-MASK (matte), WRITE (render), DISPLAY, MULTIPORT, deformation and bone modules (rigs), and **group** nodes.
- PEG editor tabs: *Transformation* (position, scale, rotation, skew, pivot), *Advanced* (angle limits).
- Pegs chain: a drawing's transform is a **parent chain** of pegs. Equivalent to After Effects parenting, Blender empties/parent.
- Attribute editors carry `visible="not essentials"` / `advanced` flags: the UI has **tiers** (Essentials, Advanced). Same node, fewer controls by default.
- Any attribute can be **linked to a function column** (`linkedColumn`): numbers are driven by keyframe curves, the same everything-keyframable idea.

## 3. Group and symbol = Harmony's precomp

- **Group** (`createGroupFromSelected`): selected nodes move into a group node with Input and Output modules. The group is one node in the parent graph and one layer in the timeline (a `TIMELINE_MODULE` option exists on the group editor). You double-click to go inside; a path shows where you are.
- **Symbol** (`onActionCreateSymbolFromSelection`, scripts `explodeSymbol`): turns a selection of drawings/cells in the timeline into a **reusable animated clip**: place instances anywhere, each with its own timing. *Explode* converts instances back into plain layers with a naming prefix. This is the hand-drawn flavor of precomp: a looping walk cycle placed many times.
- **Bake nodes / Bake to external project**: flatten a rig down to plain drawn frames or hand a clean project to another tool.
- **Composition builder** script: walks node branches and builds a displayable tree, treating READ as renderable, READ/PEG as animated, CUTTER as mattes, bones and deformers as special. A real example of "the scene is a tree of typed nodes with rules per type".
- **Export to grouped layers / sprite sheets / layout / camera to After Effects (`importTBCamera.jsx`)**: interchange by scripts. Same spirit as our Blender add-on.

## 4. Mapping to 2Dope

| Harmony | 2Dope |
|---|---|
| READ column + cells | Drawings layer (exposures) ✅ |
| PEG chain | `parent` link + transform props ➕ (no node UI) |
| Group node | **Comp layer** (precomp) ➕ |
| Symbol | Comp used by several layers (**instances**), each with own timing ➕ |
| Explode symbol | "Make unique" / "Ungroup" ➕ |
| CUTTER | track matte, later |
| Node View | ❌ not as a graph. The **layer list with parent column** is the touch-friendly version |
| Workspaces | **Draw / Time / Motion** presets ➕ |
| Essentials vs Advanced tiers | Quick Animate vs full UI ✅, extend to property rows ➕ |
| Bake | Export passes ✅, "Bake comp to drawings" later |

## 5. Why not copy the Node View

A node graph needs precise wire dragging and a lot of screen. On an iPad it is the slowest way to do what a **layer list with a Parent column and Enter-comp** does. Harmony users need it for rigs and effect chains, which 2Dope does not have in v1. We keep the *ideas* (typed nodes, groups, symbols, tiers, workspace presets) and drop the wires.

## What 2Dope takes
1. Workspaces as presets over shared views. 2. Group/Symbol semantics for precomps (instances, explode). 3. Tiered controls. 4. Parent chains instead of pegs. 5. Script-style interchange (our Blender add-on).
