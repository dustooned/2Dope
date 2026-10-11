# The .2dope project format (schema 1)

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
  "schema": 1,                       // bumped only for breaking changes
  "savedBy": "2Dope 0.0.1",
  "name": "Bounce",
  "created": "2026-10-10T09:00:00.000Z",
  "modified": "2026-10-10T09:41:12.000Z",
  "canvas": { "width": 1920, "height": 1080 },
  "fps": 12,
  "layers": [
    {
      "id": "layer1",
      "type": "drawing",
      "name": "Drawing",
      // run-length timing: show drawing "d1" for 2 frames, then "d2" for 1 frame
      "exposures": [ { "drawing": "d1", "length": 2, "note": "walks in" }, { "drawing": "d2", "length": 1 } ]   // note is optional (max 200 characters)
    }
  ],
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

## Rules

- **Additive changes** (new optional fields) keep `schema` unchanged; readers ignore fields they do not know.
- **Breaking changes** bump `schema` and add a step to `migrate()` (`src/io/schema.ts`). Older files are upgraded on open;
  the app keeps what you had as a restore point first.
- **Newer files are refused** with a clear message instead of being half-read.
- The reader is defensive (files get shared between students): sizes are capped, asset paths must look like
  `assets/<name>.png`, archive entry names that could escape the folder are rejected, checksums are verified,
  and a project whose references do not resolve is refused.
- Coordinates and pressures come from input devices as-is today; quantizing them for tidier diffs is planned.
- Only the first layer is opened by this version. Multi-layer projects arrive with compositing (milestone 3).

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
