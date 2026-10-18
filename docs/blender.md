# 2Dope → Blender

**☰ → Export for Blender** downloads `<shot>-blender.zip`:

```
scene.json           what to build (format "2dope-blender", version 1; types in src/io/blender.ts)
drawings/<id>.png    each drawing once (fill, line and vector strokes together, transparent)
renders/<comp>_<layer>/NNNN.png   frames of precomps 2Dope rendered itself (see below)
2dope_import.py      the Blender add-on (also in this repo: blender/2dope_import.py)
README.txt           install steps, plus notes for this scene
```

## In Blender (4.2 or newer; tested on 4.5 LTS and 5.1)

1. Edit → Preferences → Add-ons → the ⌄ menu → **Install from Disk…** → `2dope_import.py`. Enable it. Once.
2. **File → Import → 2Dope scene** → pick the `.zip` (it unpacks next to itself) or `scene.json`.
   Option: *Pixels per metre* (default 100).

## What you get

| 2Dope | Blender |
|---|---|
| Drawings layer | A plane facing the camera (front view, XZ plane), origin at the layer's anchor, with an **image sequence** that already contains its timing: holds, loops, ping-pong, held frames and swaps. Frames where it shows nothing use a transparent image. |
| Position, scale, rotation, opacity keys | **F-curves** with the same Bezier handles (Linear, Ease in/out, Hold → CONSTANT), so motion matches frame for frame. Opacity drives a value node in the plane's material. |
| Null | An empty; children keep their parent. |
| Camera | An **orthographic camera** (pan, roll; zoom becomes ortho scale, keyed every frame because it is 1/zoom). No camera in 2Dope → one that frames the shot exactly. |
| Precomp shown as is (starts with the shot, normal speed, plays once, same fps, no pinned overrides) | A **collection instance**: the comp is built once in a hidden "2Dope comps" collection and every such instance shares it. |
| Precomp on its own clock (offset in time, looping, retimed, frame-picked, or with pinned overrides) | A plane with frames **rendered by 2Dope** (identical frames once). Blender collection instances cannot run on their own clock. |
| In / out points | `hide_render` / `hide_viewport` keys (on the instance object too: hiding a parent does not hide its children in Blender). |
| Comp size, fps, length, background | Render resolution, fps (fractional via fps_base), frame range starting at 1, film transparent (or world colour). EEVEE, view transform Standard (colours as in 2Dope). |
| Storyboard (the Story board) | **Timeline markers**, one per panel at its first frame, named with the panel number, shot and camera (or its action). A **"2Dope storyboard" text** (Text Editor) lists every panel's frame, length, shot, camera, dialogue, action, timing and notes, and its picture in `drawings/`. For 3D students blocking key poses. |

Layers are stacked 1 cm apart along Y (top layer closest to the camera).

## Units and axes

`x_blender = (x − ref_x) / ppu`, `z_blender = −(y − ref_y) / ppu` where `ref` is the comp centre for
top-level layers or the parent's anchor for children; rotation (clockwise on screen in 2Dope) is +Y
rotation seen from the front; scale % / 100. Key frames: 2Dope frame + 1.

## Simplified for now (the README in the package lists what applies to a scene)

- Blend modes other than normal export as normal.
- An animated anchor point exports as its first value.
- Cameras inside precomps only affect 2Dope's own renders.
- Lines and fills are one image per drawing (separate line/fill planes later).

## Verified

`scene.json` planning is unit-tested (`src/io/blender.test.ts`). An end-to-end test built a shot
(eased ball, rotating null parent, zooming camera, one instanced and one looping precomp),
imported it headless in Blender 5.1.1 and 4.5.4 LTS, rendered frames 1, 4, 7, 10 and 12, and
compared them with 2Dope's own PNG export: no pixel differed by more than 25 % in any frame.
