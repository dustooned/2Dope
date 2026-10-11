# The .2dope project format (schema 2)

A `.2dope` file is a ZIP archive:

```
project.json            the project (plain JSON, see below)
assets/<hash>.png       one PNG per non-empty pixel plane (transparent RGBA)
```

- Assets are **content-addressed**: the file name is a hash of the bytes, so identical drawings share one file
  and an asset never changes once written.
- `project.json` is readable and diffable on its own ("Export JSON only" in the Versions dialog writes it without images).
- Anyone can read it with any zip tool and a JSON parser. Entries are stored (not compressed) because PNG is already compressed.
  Archives written by other tools (deflate) also open.

## project.json

```jsonc
{
  "format": "2dope",
  "schema": 2,                       // bumped only for breaking changes (schema 1 files are upgraded on open)
  "savedBy": "2Dope 0.0.2",
  "name": "Bounce",
  "created": "2026-10-10T09:00:00.000Z",
  "modified": "2026-10-10T09:41:12.000Z",
  "canvas": { "width": 1920, "height": 1080 },   // the page size of every drawing
  "fps": 12,                         // the main comp's fps, repeated for simple readers
  "main": "c1",                      // the comp that is "the shot"
  "folders": { "f1": { "name": "Characters", "parent": null } },   // project bin
  "comps": {
    "c1": {
      "name": "Shot", "width": 1920, "height": 1080, "fps": 12,
      "duration": null,              // frames, or null = as long as its content
      "background": null,            // "#rrggbb" or null (transparent)
      "folder": null,
      "layers": [                    // top of the stack first
        {
          "id": "cam", "name": "Camera", "kind": "camera",
          "start": 0, "in": 0, "out": null, "parent": null,
          "visible": true, "locked": false, "label": 0, "blend": "normal",
          "transform": { /* as below; the camera uses position (what it looks at) and rotation */ },
          "zoom": { "value": 100 }   // 100 = the comp as is, 200 = twice as close
        },
        {
          "id": "L1", "name": "Ball", "kind": "drawings",
          "start": 0,                // comp frame where the layer's frame 0 is (keys and exposures are in layer time)
          "in": 0, "out": null,      // visible comp frames [in, out); out null = until its content ends
          "parent": null,            // another layer's id: this one moves with it
          "visible": true, "locked": false, "label": 0,
          "blend": "normal",         // normal | multiply | screen | overlay | darken | lighten | add
          "transform": {
            "anchor":   { "value": [960, 540] },          // in the layer's own pixels
            "position": { "value": [960, 540], "keys": [   // where the anchor sits in the comp
              { "f": 0,  "v": [960, 540],  "in": { "interp": "linear" }, "out": { "interp": "bezier", "slope": 0, "influence": 0.333 } },
              { "f": 12, "v": [1400, 540], "in": { "interp": "linear" }, "out": { "interp": "linear" } }
            ] },
            "scale":    { "value": [100, 100] },          // percent
            "rotation": { "value": 0 },                    // degrees, clockwise
            "opacity":  { "value": 100 }                   // percent
          },
          "exposures": [ { "drawing": "d1", "length": 2, "note": "walks in" }, { "drawing": "d2", "length": 1 } ],
          "loop": false
        },
        {
          "id": "P", "name": "Walk cycle", "kind": "comp", "comp": "c2", "loop": true,
          "start": 0, "in": 0, "out": null, "parent": null, "visible": true, "locked": false, "label": 0, "blend": "normal",
          "transform": { /* ... */ }
        }
      ]
    },
    "c2": { "name": "Walk cycle", "width": 1920, "height": 1080, "fps": 12, "duration": 8, "background": null, "folder": "f1", "layers": [ /* ... */ ] }
  },
  "drawings": {
    "d1": {
      "num": 1,                      // the cel number shown in the UI
      "line": "assets/2eid…-3fq8.png",   // Line plane (on top), or null if empty
      "fill": "assets/18hm…-znj.png",    // Fill plane (always under the line), or null
      "role": "key",                  // optional: "key" | "breakdown" | "inbetween" (unknown values are ignored)
      "vectors": [ /* StrokeRecord: tool, brush settings, color, seed, points {x,y,pressure,tiltX,tiltY,t} */ ]
    }
  }
}
```

Display order of a drawing: fill, then line, then vector strokes.

### How a frame is built

- A layer's matrix is `T(position) · R(rotation) · S(scale/100) · T(−anchor)`, multiplied by its parents' matrices
  (opacity is not inherited). Keys are in layer time: comp frame − `start`.
- **Keyframes**: between two keys the value moves along one progress curve. Each side of a key is `linear`, `hold`
  or `bezier` with a normalised `slope` (0 = eased to a stop, 1 = linear speed) and `influence` (0.01–1, how far the
  handle reaches into the segment). Blender handles: right handle of key A = (f + influence·Δf, v + slope·influence·Δv),
  left handle of key B = (f − influence·Δf, v − slope·influence·Δv).
- **Camera**: the topmost visible camera frames the comp. It maps comp space to the frame as
  `T(comp centre) · S(zoom/100) · R(−rotation) · T(−position)`: a centred camera at 100 % changes nothing.
- **Precomps**: a `comp` layer shows its comp at `(comp frame − start) × nested fps ÷ parent fps`, repeating with `loop`.
  A comp may not contain itself (refused on open).
- Layers draw bottom to top with their blend mode; a layer with opacity or a blend mode is flattened first.

## Rules

- **Additive changes** (new optional fields) keep `schema` unchanged; readers ignore fields they do not know.
- **Breaking changes** bump `schema` and add a step to `migrate()` (`src/io/schema.ts`). Older files are upgraded on open;
  the app keeps what you had as a restore point first.
- **Newer files are refused** with a clear message instead of being half-read.
- The reader is defensive (files get shared between students): sizes are capped, asset paths must look like
  `assets/<name>.png`, archive entry names that could escape the folder are rejected, checksums are verified,
  and a project whose references do not resolve is refused.
- Coordinates and pressures come from input devices as-is today; quantizing them for tidier diffs is planned.
- The flipbook strip and X-sheet edit one drawings layer at a time; the layers view (next) edits the rest.

## Local storage (not part of the file)

The project library lives in the browser's IndexedDB (`2dope` database, version 2):

| Store | Holds |
|---|---|
| `projects` | one card per project: name, folder, dates, frame/drawing counts, size, fps, a small PNG thumbnail |
| `heads` | the latest autosaved `project.json` of each project (read only when it is opened) |
| `versions` | restore points, each tagged with its `project` (indexed) |
| `refs` | the asset paths each head (`h:<id>`) and version (`v:<id>`) uses |
| `assets` | PNG bytes by content hash, shared by every project and version |
| `folders` | gallery folders |
| `meta` | small settings (`lastProject`) |

A save writes its new assets, card, head and refs in one transaction. Assets no head, version or
drawing in memory refers to are cleaned up about once a minute. A database from before the library
(version 1: one `meta/autosave` plus versions) is turned into the first project on open.

### Memory: parked drawings

Only the drawings in use keep live canvases (current, onion neighbours, playback look-ahead, and the
most recent ones within a budget: about 200 MB on iPad, 900 MB on desktop). The others are
**parked**: canvases shrink to 0×0 and the pixels stay as stored assets (or PNG bytes until the next
autosave). Opening a project decodes nothing up front; drawings come back as they are shown.
See `src/core/residency.ts`.
