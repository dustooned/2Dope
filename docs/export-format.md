# PNG sequence export

Versioned vector appearances (2026-10-30) render through the same `drawVectorStroke` dispatcher
in drawing, thumbnails, onion skins, playback, nested artwork, masks and export. Custom tips
are synchronous inline alpha data; export has no dependency on the current brush library.
Ink/chisel union coverage and material-tip coverage receive whole-stroke opacity once, including
self-crossings. Fill references use the marks’ visible alpha at the existing fill threshold;
there is no hidden continuous barrier behind dotted/textured lines. The existing Close gaps
setting can deliberately bridge small holes. Lines and Combined retain the saved selection clips.
The bounded scratch resolution described in `project-format.md` applies consistently to exports.

**Export…** (top bar, or **More → Export sequence…** in Quick Animate) writes one `.zip`:

```
shot/export.json
shot/combined/shot_0001.png ...     the finished image
shot/lines/shot_lines_0001.png ...  Line plane + vector strokes only (alpha)
shot/fills/shot_fills_0001.png ...  Fill plane only (alpha)
shot/matte/shot_matte_0001.png ...  white silhouette of the whole drawing (alpha)
```

- Passes come straight from each drawing's planes, so Lines and Fills are exact (nothing is guessed from darkness).
- All PNGs are RGBA with true alpha. **Background: White** applies to the Combined pass only; Lines, Fills and Matte always stay transparent so they can be composited.
- **Size** 100 / 75 / 50 / 25 %. **Frames**: all, or just the selected drawings. **First number** sets the first file number (1001 is common for compositing). Numbers are zero-padded to 4 digits.
- A held drawing is rendered once and the same bytes are written for each frame it lasts.
- The zip opens in any tool; the PNG sequences open in After Effects, DaVinci Resolve, Premiere, Unity, Godot and Blender.

## export.json

```jsonc
{
  "format": "2dope-export", "version": 1, "savedBy": "2Dope 0.0.1",
  "name": "shot", "fps": 24,
  "canvas": { "width": 1920, "height": 1080 },
  "size":   { "width": 960,  "height": 540 },   // after the Size option
  "scale": 0.5, "background": "transparent",
  "frames": 120, "firstNumber": 1001, "numberPadding": 4,
  "passes": { "combined": { "folder": "combined", "pattern": "shot_####.png" }, "lines": { "folder": "lines", "pattern": "shot_lines_####.png" } },
  "exposures": [ { "drawing": 1, "fromFrame": 0, "length": 2, "role": "key" } ]   // timing of the whole project
}
```

This is the seed of the Blender hand-off manifest (milestone 2): it already says where each pass lives, the frame rate, the size and how drawings are timed.


## Export and finish / GIF (2026-10-16)

Top-bar Export, the workspace layout row, or Menu → Export and finish opens the format hub. Existing direct menu/Quick sequence paths remain available. Video, current PNG, PNG passes, storyboard PDF/images, Blender package and editable .2dope backup retain their existing exporters; storyboard is disabled until a board exists.

GIF renders the **main shot**, including nested compositions/camera/transforms and the existing storyboard export flag, using the shared compositor and per-frame residency. It never changes the playhead or document. Silent infinite loop, opaque white background, fixed RGB332 256-colour palette, no dithering. Whole-shot export only: maximum 15 seconds, roughly 12 output samples per second, longest edge 480 px (320 in Lite), without upscaling. Centisecond delays are rounded cumulatively to preserve total duration within 5 ms. No frame selection/range or transparency in this first slice.

A deliberately simple GIF89a writer emits 9-bit literal LZW codes with a clear every 250 pixels; this is valid but less compact than dictionary compression. Preflight and actual byte caps are 24 MiB Full / 12 MiB Lite, with only one frame canvas/resident drawing set plus bounded encoded output retained. Dense/longer GIFs can hit the cap before 15 seconds: choose video/PNG instead. Cancel releases pins, canvas/scratch and partial output; preview URLs are released on close. No new dependency, archive schema or migration.

Reference: [GIF89a specification](https://www.w3.org/Graphics/GIF/spec-gif89a.txt), image data, graphic control and application extension blocks. Palette, reset frequency, export limits and UI are our design decisions. GIF and Graphics Interchange Format are CompuServe service marks.
