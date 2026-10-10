# PNG sequence export

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
