# The .2dope project format (schemas 3–6)

## Editable title snapshots and portable presets (2026-11-03)

`DrawingsLayer.title` is version 1 metadata: `{v:1,text,font:'system-ui',size,weight,align,fill,
stroke,strokeWidth}`. Text has 1–280 Unicode code points and at most four lines; size 8–512 px,
weight 400/700, alignment left/center/right, six-digit hex fill and optional stroke, width 0–16.
Unknown fields/versions, blank text and invalid appearance are refused. A title is an independent
still drawings layer with one exposure; guides, linked cels and adjustment layers cannot carry it.
Its ordinary transparent Fill PNG is authoritative during playback/reopen/export. Load never
re-rasterizes text. An explicit edit allocates a new drawing; Undo retains the exact old pixels.
Conversion removes metadata only. Normal transforms, masks, blending and effects use existing
rendering paths; Blender gets an image and a title-specific Check note. Title captures require
schema 6, including titles nested in reusable sources. Ordinary captures still use 3/4/5.

Presets do not add project fields or change project schemas. `2dope-presets` is a separate
IndexedDB version-1 store with at most 40 records per kind. Portable JSON uses
`{format:'2dope-preset',version:1,id,name,kind,...}` and is capped at 1 MiB. Effects embed 1–16
validated concrete effect records without keyframes. Motion stores FPS, frame duration, camera
compatibility and animated transform/zoom properties with existing key/Side data. Position deltas
are normalized by source comp size, scale/rotation/zoom are deltas and opacity is absolute.
Applying bakes ordinary project props/effects with fresh effect identities, independent of later
library edits. Whole-record preflight refuses unknown fields/types/settings. There are no URLs,
images, expressions or project-to-library links in the portable preset format.

## Applied look snapshots, camera moves and bundles (2026-11-03)

Layers may additionally store `styleOrigin:{v:1,name,effects}` after applying an Effects preset.
This is the complete concrete stack immediately after Apply, including previous effects and
animation retained by Append. Reset uses this embedded snapshot with fresh effect ids and one
History command; it never re-reads the device library. The optional metadata round-trips on
normal layers, adjustments, groups, assets and titles. Unsupported origin versions/effect types
are refused. It does not change rendered appearance or raise the minimum schema: older readers
keep ordinary `effects` and may omit this optional Reset facility. Editable title files still
require 6; all other minimum-version rules remain 3/4/5.

Camera Move stores ordinary existing position/zoom props and Side easing on a normal camera.
There are no camera-generator fields or live dependencies. Keys use layer time, the selected
inclusive range is converted from the UI’s one-based shot frames, and new-camera creation plus
keys is one command. Other channels and keys outside the affected interval are preserved.

Hand-in bundles are STORE ZIPs with `*-video.mp4`, `*-poster.png`, `*-gif.gif`, optional
`*-project.2dope`, and `manifest.json`. The manifest is `{format:'2dope-hand-in',version:1,...}`
with `complete`, one-based inclusive range, FPS/duration, poster frame, video dimensions, explicit
GIF excerpt range/duration/dimensions/loop/audio flag, filenames and missing steps. Partial saves
have `complete:false`, a missing-files list and an `incomplete` filename. They are never advertised
as complete. The optional project is a full standalone archive captured with all referenced assets;
its original main-comp identity is retained even when an asset is the chosen export shot.

One immutable archive capture supplies every member. Video timestamps start at zero while its
picture and sound use the selected absolute comp range; GIF samples the same original clock.
Poster removes composition background colours but retains artwork/alpha, masks and effects.
Output limits are 64 MiB Lite / 256 MiB normal or a smaller allowance from the device’s remaining
render budget. The estimate includes owner canvases, snapshot assets, decoded audio, padded nested
scratch surfaces and four copies of staged output for Blob/byte/ZIP allocations. Frame pins have
a separate remaining allowance and immutable snapshot pixels are released after each frame.
Effect caching is temporarily disabled for each serial writer and its prior budget restored.
These checks are conservative estimates, not a guarantee of available hardware RAM. Large jobs
are refused with recovery choices; there is no automatic quality downgrade or persistent output
cache. None of these exports modify project history, active timeline, playhead or autosaved art.

## Device library metadata (2026-11-03)

My Assets cards may add `kind` (`drawing`, `vector`, `clip`), `collection` (a bounded name) and
`updated` (timestamp). These are optional IndexedDB card metadata in the existing `2dope-artwork`
database; there is no database-version change, project schema change or new archive requirement.
Older cards remain readable: multi-frame sources default to clip and unclassified stills to
drawing until saved again. Collections are device-library organization, not document folders in
portable artwork packages. Explicit replacement atomically updates the card and archive only if
the chosen card still exists, preserving its id, saved name, original date and collection. Project
copies remain independent. Project gallery pictures reuse the existing `ProjectMeta.thumb` field;
view-only thumbnail writes do not change head JSON, modified dates or restore points.

## Imported vector objects (2026-11-03)

The reader accepts schemas 1–6 and normalizes loaded metadata to 6. New captures still write the
minimum required reader: 3 for ordinary drawings, 4 for vector appearances/controls/clips, and 5
when a vector contains `shape`, or 6 when any layer contains editable `title` metadata. Artwork packages retain the same minimum-version rule.

`StrokeRecord.shape` holds `{path, matrix, fill, stroke, width, rule, cap, join, miter}`. `path` is
SVG path geometry (curves remain curves), `matrix` is a finite invertible six-number affine
transform, fill/stroke are null or six/eight-digit hexadecimal colours, and paint attributes match
Canvas fill/stroke semantics. The record's brush opacity fades the object. Its sampled `points`
are conservative transformed bounds for whole-object selection, not editable brush anchors.
Selection transforms compose the shape matrix; persistent selection clips restrict the rendered
object. Path editing/restyling and brush vector erasing deliberately exclude these objects.
Rasterize imported vectors flattens the Ink vector stack in one undoable pixel command.

Validation bounds each path string to 1,000,000 characters, checks paint and coordinate/matrix
limits, and counts two bytes per path character in the existing 64 MiB vector-resource budget.
Import additionally caps input at 8 MB, 2,000 painted paths and bounded group/reference recursion.
Paths are rendered synchronously through cached Path2D objects; no source HTML, scripts, external
images, stylesheet or network resource is inserted into the app. Basic shapes, transforms, solid
paints, local references and inherited/inline paint styles are supported. Unsupported SVG text,
gradients, masks, clipping, dashed strokes and special appearances are refused with a conversion
message instead of silently discarded. EPS uses a bounded data parser for path/colour/transform
operators, not a PostScript runtime. CMYK colours are approximated as RGB for screen artwork.

Layers of kind `comp` may carry the existing effects stack. Their numeric settings use the same
layer-time key schema as drawing effects, and frame-content keys include the instance's own effects
so rendered-frame deduplication cannot freeze an animated group effect. Groups and adjustment
layers process one flattened input: effect targets are treated as Composite at render time.
Partial-opacity adjustments interpolate premultiplied original/processed pixels, including alpha.
These effect changes add no fields to the existing layer format.

## Editable vector appearances (2026-10-30)

The appearance feature introduced a reader accepting schemas 1–4 (now superseded above). Captures containing
only the earlier sampled outlines continue to write schema 3; any `style`, authored `controls`,
or persistent `clips` requires schema 4 so older readers refuse rather than discard appearance.
Older geometry is never refitted. The versionless outline renderer remains unchanged.

Each vector can carry `style: { v: 1, mode: "ink" | "flat" | "stamp", tip: "dry" | "pencil" |
"dot" | "dash" | "custom", step, matrix? }`. `step` is captured distance spacing in the material
domain. Custom tips additionally contain `mask: { width, height, alpha }`: at most 128 × 128 alpha
pixels, two hexadecimal characters per pixel. These are inline immutable snapshots, not links to
device brushes or external image URLs. No asynchronous tip decode is needed when opening,
rendering, exporting or undoing. Inline masks favor a simple self-contained format over deduplication;
repeated custom tips can increase project JSON size.

Styled points retain calibrated pressure, tilt, time and local `w`, plus `u` (ordered absolute
material distance) and `speed` (normalized, captured once after correction). Cuts interpolate these
channels. Stamps use `seed` and the absolute grid index `u / step`, retaining phase and random
identity on fragments. Point edits keep `u` and recorded speed, stretching the material domain over
the new path; explicit restyle resets distance on that path and preserves speed. Width edits do not
re-space existing marks. The initial spacing expands for extremely long paths to stay within
12,000 marks. Styled lines allow up to 20,000 input samples; legacy limits remain unchanged.

`controls: { anchors: number[], modes: { [pointIndex]: "curve" | "straight" }, handles:
{ [pointIndex]: { inx, iny, outx, outy } } }` records authored editing state. Handles are offsets in
document coordinates. Newly styled paths and point edits persist it; width/corner/handle/point
undo restores the corresponding state. Legacy cuts discard stale control indices while retaining
sampled channels; eraser fragments initialize their controls when edited again.

`clips` is an intersected list of at most 16 immutable pixel restrictions. Each is `{ runs, matrix }`:
`runs` contains ordered triples `[rowY, startX, exclusiveEndX, ...]`, at most 65,536 spans, with an
invertible six-value affine matrix. Clips restrict visible paint, not only path centres, survive
later edits and travel with transforms. Inside/outside restrictions preserve both appearances when
restyling through a canvas selection. Styled clipping retains the sampled path under a clip rather
than approximating a textured mark by cutting only its centreline.

Full-mark transforms compose `style.matrix`, move path points and handle offsets, and transform
the clips. The renderer evaluates the original nib in its canonical coordinates and applies the
affine matrix, preserving rotation, reflection, nonuniform scale and material identity. Legacy
outlines keep their existing scalar width rule. Multi-style joins are deferred; snapping remains.

Validation refuses unsupported renderer versions, invalid or invisible tips, unordered/missing
channels, singular transforms, malformed controls/clips and work limits. The estimated project
budget for inline tip hex, clip numbers and authored controls is 64 MiB; new strokes and restyle
check it before changing the drawing. Undo keeps immutable assets reachable with its records.
The renderer shares one scratch coverage surface (about one million pixels, maximum side 2048)
and an LRU of 16 decoded tips. Large marks or high zoom may soften at that bounded resolution.

Brush recipes use optional `BrushSettings.vectorStyle` in the existing device library. Stroke
creation snapshots it into `style` and strips unused raster images and the working recipe from
the stored brush. Selecting a recipe affects future strokes. Explicit restyle uses a detached
preview and commits one History step; cancellation never mutates the shared project.
Keeping weight during restyle accounts for any old full-mark matrix: uniform scaling is preserved
exactly; a nonuniform transform uses the square root of its absolute determinant (area-equivalent
weight). A newly chosen nib cannot preserve all directional widths of the old stretched mark.

Committed immutable marks have an LRU coverage cache capped at 16 records and 2,097,152 pixels
(8 MiB RGBA), in addition to the shared scratch surface. Pointer previews do not enter it; edits
replace records and therefore invalidate cached coverage, and loading a project clears it.
An exact visible-alpha check before committing styled strokes uses 512 × 512 readback tiles and
stops at the first painted pixel. A stroke hidden entirely by its selection adds no record/history.

Brush working memory, Favorites and Recent use device-only `2dope.brushes.preferences`
(version 1: bounded name/size/opacity entries, favorite names, five recent names). No brush image
bytes are duplicated there. The current brush and saved personal brush definitions retain their
existing stores. These preferences are outside project files, My Assets, student profiles and
document Undo; no project or brush format migration is needed.

Student profiles are device preferences, not project fields. `2dope.student.profiles` stores a
version-1 list of named settings snapshots plus the last applied profile id; `2dope.student.ui`
stores current tool/control visibility, and `2dope.student.fingerPaint` stores finger drawing.
Profiles include current interface level, QuickMenu, range gesture, QuickShape and Ink & Paint
switches via their existing preference keys. They are not serialized into `.2dope` or My Assets
archives, do not rename/modify artwork and do not require a project schema migration.

Comps may contain `playbackRange: { start: 4, end: 8 }`: zero-based inclusive start and
exclusive end, so the UI shows frames 5–8. Omission means whole-animation preview. Edges are
integers, `0 <= start < end <= 1000000`; malformed supplied intervals are rejected. Valid saved
edges may exceed a shortened comp's current length: preview clamps at runtime without changing
the saved values. The optional field is additive under schema 3, round-trips through archives,
autosave and My Assets, and affects only live preview, never comp duration, nested placement
timing, frame-image rendering or export ranges. Each comp has an independent interval.
The optional ruler gesture is a device preference (`2dope.playback.rangeGesture`, boolean,
default false). It is not written into the project; completed gestures set the same comp interval.

Ink & Paint uses the same existing Line PNG, Fill PNG and vector records. Its combined Undo
is runtime command state; the resulting artwork autosaves and archives normally, including in
My Assets. The opt-in mode and separate ink colour are device preferences (`2dope.inkpaint`),
not fields in project.json. Opening an older file requires no migration.

A `.2dope` file is a ZIP archive:

```
project.json            the project (plain JSON, see below)
assets/<hash>.png       one PNG per non-empty pixel plane (transparent RGBA)
assets/<hash>.wav       normalized PCM audio assets
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
  "schema": 3,                       // schema 1/2 files are upgraded on open
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
          // optional exposure captions (storyboard panels): "shot", "camera", "dialogue", "action",
          // "slug", "note". "dialogue" holds one subtitle per line, "Speaker: words" when someone is
          // named (core/dialogue.ts); free text from older files reads as lines without a speaker.
          // The animatic shares a panel's frames between its lines by length; nothing extra is stored.
          // optional, drawings and comp layers: "play" once | loop | pingpong | single (default once),
          // "speed" (default 1), "single" (the held frame, 0-based), "timeRemap" (keys: which content
          // frame to show, 0-based; hold keys = swaps; overrides play and speed)
          "play": "loop",
          // optional, drawings layers: Line / Fill part settings that differ from the defaults
          // (visible true, opacity 100, own colours, offset [0, 0]); keys in layer time
          "parts": { "line": { "tint": "#203040" }, "fill": { "opacity": { "value": 60 }, "offset": { "value": [4, 0] } } }
        },
        {
          "id": "P", "name": "Walk cycle", "kind": "comp", "comp": "c2", "play": "loop",
          "overrides": { "L1:rotation": { "value": 30 } },   // this instance's values for the comp's pinned properties
          "start": 0, "in": 0, "out": null, "parent": null, "visible": true, "locked": false, "label": 0, "blend": "normal",
          "transform": { /* ... */ }
        }
      ]
    },
    "c2": { "name": "Walk cycle", "width": 1920, "height": 1080, "fps": 12, "duration": 8, "background": null, "folder": "f1", "layers": [ /* ... */ ],
            "pins": [ { "layer": "L1", "prop": "rotation" } ] }   // properties shown on every instance
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

### Reusable artwork sources (2026-10-22)

An optional `asset: true` on a comp marks editable artwork for the project-local Assets shelf.
Its layers, drawings and optional frames use the existing comp representation. Placements are
ordinary `kind: "comp"` layers referencing that comp ID, with `play: "loop"` and `locked: true`
initially. All comps' referenced drawings are saved, including sources with no placements.
The marker is additive in schema 3; missing/unknown values mean an ordinary comp. Older builds
can read the underlying comps and placements but may discard the shelf marker when resaving.
Source editing location and return navigation are session state, not file fields. Opening a
project starts in its main shot. There is no external file path or live cross-project asset link.

### My Assets snapshots (2026-10-23)

My Assets stores standalone schema-3 `.2dope` archives in a separate IndexedDB database,
`2dope-artwork` version 1. `cards` holds thumbnail/size/layer/frame metadata; `packages` holds
archive bytes by card ID. Both are written atomically. Project garbage collection does not touch
these archives. There is no external path, new project schema field or live link between projects.

Library search reads card names only. Rename updates the card in one transaction; the frozen
archive bytes stay unchanged. `libraryArtwork` applies the current card name to the archive's
project/root comp when adding a copy, opening a project or writing a portable download. This
keeps shared files and future copies consistent with the shelf without rewriting large packages
for a name edit. Removal reads and deletes the card/package records atomically. The UI retains
one complete removed entry in memory for Undo until the next successful removal or page reload;
restore writes both records atomically, retaining the entry for retry if storage fails. These
library operations do not enter the project's drawing History or alter placed artwork.

Each archive is rooted at its artwork comp (`main`, with `asset: true`) and contains only its
reachable source graph, drawings/masks and audio assets. Folder links are cleared. Capture uses
the normal synchronous project snapshot and complete archive asset collection; missing images
or sounds refuse the save. A main comp marked as artwork opens as an ordinary editable project,
rather than a source session waiting for Done. It can be saved back as a new library snapshot.

Add copy requires the current project's drawing canvas dimensions to match. It remaps comp,
layer, drawing, cel, sound and audio-clip IDs, internal parents/pins/overrides and audio panel links.
PNG and sound bytes travel with the copy, without relying on the original project's asset pool.
Only the imported root appears as a source in that project's Assets shelf. One History command
adds/removes the copied comp graph; drawing/audio pool objects survive Undo for Redo, like other
project commands. Open as project offers native-size editing for different canvas dimensions.

Make independent gives one placement a copied comp graph and fresh drawing IDs. Line/Fill PNG
assets may share content-addressed keys while unchanged; each drawing decodes into its own
canvases and stores changed bytes under new keys. Vectors, masks and editing metadata are copied,
and nested source/pin/parent/cel/audio-panel references remap to the copied graph. Audio bytes stay
immutable shared assets. Placement name, timing and transforms remain unchanged. This uses the
same schema 3 fields and standalone archive capture; no external dependency or new field is added.

Replace source changes one placement's comp ID and clears its old source-layer overrides. Name,
transform, parent, playback settings and start/in stay. Explicit out stays; a finite automatic
one-shot ending is materialized into out before swapping sources so duration/fps changes do not
retime the placement. Looping shot-followers keep null out. Source comps and drawings are retained.
Undo restores the previous link, overrides and out through existing history; no new file fields.

### How a frame is built

- A layer's matrix is `T(position) · R(rotation) · S(scale/100) · T(−anchor)`, multiplied by its parents' matrices
  (opacity is not inherited). Keys are in layer time: comp frame − `start`.
- **Keyframes**: between two keys the value moves along one progress curve. Each side of a key is `linear`, `hold`
  or `bezier` with a normalised `slope` (0 = eased to a stop, 1 = linear speed) and `influence` (0.01–1, how far the
  handle reaches into the segment). Blender handles: right handle of key A = (f + influence·Δf, v + slope·influence·Δv),
  left handle of key B = (f − influence·Δf, v − slope·influence·Δv).
- **Camera**: the topmost visible camera frames the comp. It maps comp space to the frame as
  `T(comp centre) · S(zoom/100) · R(−rotation) · T(−position)`: a centred camera at 100 % changes nothing.
- **Precomps and drawings layers** show content frame `floor((comp frame − start) × speed × content fps ÷ comp fps)`,
  wrapped by `play` (loop: modulo; pingpong: bounce; once: ends, or holds the last frame when `out` is later;
  single: the `single` frame). `timeRemap` keys, when present, give the frame directly (rounded, clamped).
  Early schema-2 files wrote `"loop": true`; it reads as `"play": "loop"`.
  A comp may not contain itself (refused on open).
- Layers draw bottom to top with their blend mode; a layer with opacity or a blend mode is flattened first.
- A drawings layer's **parts** draw fill first, then line (line plane + vector strokes), each shifted by its offset,
  at its opacity, and with `tint` every painted pixel takes that colour (its alpha kept). A hidden part is not drawn.

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

## Audio fields (schema 3)

Project-level `sounds` maps each sound ID to `{ name, path, duration }`: the path is a validated
`assets/<hash>.wav` entry and duration is in seconds (up to 120). Each comp can contain an `audio`
array with clip records `{ id, asset, name, start, trimIn, trimOut, gain, muted, link }`.
`start` is a zero-based comp frame; source trims are seconds and gain is a linear 0–2 multiplier.
A null link keeps the clip fixed. A panel link is `{ layer, drawing, occurrence, offset }`, with
its offset measured in comp frames relative to the linked panel. A removed panel silences the
linked clip until the panel returns or the clip is unlinked.

Audio assets participate in library/version references and garbage collection just like PNGs.
Standalone archive capture must include every referenced WAV. Schema 1/2 files migrate to 3;
older app versions refuse schema 3, protecting audio from being silently stripped on a save.
Waveform caches and clip-settings disclosure state are UI/runtime data and are not stored here.
