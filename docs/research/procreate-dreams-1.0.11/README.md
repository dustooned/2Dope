# Procreate Dreams 1.0.11: what the shipped package shows

2026-10-26 · REA static inspection of a local Dreams `.ipa`. Reference only; nothing is copied into
2Dope. Companion to [feature-deconstruction 07/08](../../feature-deconstruction/07-procreate-dreams-handbook.md),
which were written from the public handbook only.

## What was inspected

| Item | Value |
|---|---|
| Source | `D:\Downloads\Compressed\Procreate-Dreams-v1-0-11.ipa` |
| IPA SHA-256 | `614c054c22bef0285eb74e8058ab516491a1ce21b7464e6040b6a86355053b7a` |
| ZIP members | 1,528 (1,493 distinct contents) |
| Bundle | `au.com.savageinteractive.Dreams`, 1.0.11 (17168), iOS 16.0 minimum, iPad only |
| App on disk | 1,090 MB after extraction; 41 compiled nibs, 11 resource bundles |
| Executable | `Payload/Dreams.app/Dreams`, 16,239,968 bytes, SHA-256 `87f2bde8…902c3f` |
| Info.plist | 10,165 bytes, SHA-256 `22189264…32c50390` |
| Repack markers | `LC_ENCRYPTION_INFO_64` `cryptid 0`, no `embedded.mobileprovision`, `_CodeSignature` present |

Thin little-endian ARM64 Mach-O, 75 load commands, `__text` at `0x100004000` (10,417,436 bytes).
Unlike Storyboard Pro there is no `Frameworks/` folder: the app is one binary plus resources, and all
of Swift's and Apple's frameworks come from the system.

## Document types and the project container

`Info.plist` declares two of its own document types and opens two media types:

- `si.savage.dreams.document` — "Dreams Document", extensions **`.dream` and `.drm`**.
- `si.savage.alpine.document` — "Alpine Document", extension **`.alpine`**, MIME `image/alpine`.
- Opens `public.mpeg-4` and `com.apple.quicktime-movie` as an alternate handler.

The three sample projects shipped in the app (`defaultArtworks50/Into The Future.drm`,
`defaultArtworks50/The Breach.drm`, `defaultArtworks100/Spark.drm`, 175/222/431 MB) all begin with
the 8-byte magic **`Valkyrie`**, then a small version header:

```
56 61 6c 6b 79 72 69 65   "Valkyrie"
00 00 00 00 00 00 00 00
01 00 00 00 00 00 00 00    version 1
03 00 00 00 00 00 00 00    version 3
...                        chunk table
```

The second sample differs in the byte after the magic (`0x01` instead of `0x00`), so the header
carries a format revision. The body is not plain JSON or ZIP; a scan of one 222 MB sample finds no
`"scene"`/`track`/`keyframe` text, but **399 JPEG and 20 PNG images** embedded in the container, so
drawings and thumbnails live inside the document file with the project data.

The `.drm` is therefore a **Valkyrie chunked container with embedded media**. The "Valkyrie" name is
the same family as the engine classes in the binary (and in Procreate 5.4.9), but this inspection did
not compare the layout with a `.procreate` file. The chunk table was not decoded further; that is the
obvious next step if we ever want import.

## Executable structure

- **1,243 Objective-C classes**: 716 Swift classes (`_TtC…`) across **70 Swift modules**, plus about
  430 `Valkyrie*` classes and a small `Silica*`/`Si*` utility group.
- Swift modules named in the runtime metadata: `TimelineSwift`, `TimelineGlue`, `DisplayListSwift`,
  `RenderSwift`, `PhoenixSwift`, `ViewerSwift`, `ViewerUI`, `ViewerUIExt`, `ViewerTheme`,
  `ViewerModuleTypes`, `Flipbook`, `Theatre`, `Stage`, `StorageSwift`, `TransactorSwift`,
  `DreamsTextUI`, `Dreams`, `MovieSettings`, `TopToolbar`, `PropertiesPopover`, `Layers`,
  `LayersProviderSwift`, `ColorPanel`, `Brushes`, `Paint`, `Import`, `DebugOverlay`,
  `FloatingWindows`, `ProControls`, `LeviathanSwift`.
- `Valkyrie*` is Procreate's rendering engine (the same class family as Procreate 5.4.9: cameras,
  composition renderer, layer effects, material layers, mesh scenes, Memoryless texture caches). Dreams
  reuses it rather than starting a second renderer.
- Metal shader libraries shipped beside the binary: **`ValkyrieMetal.metallib`**,
  **`PhoenixMetalShaders.metallib`**, **`DisplayListShaders.metallib`**,
  **`CompositorCommonShaders.metallib`** — four pipelines: brush/canvas, tiled image writing,
  display-list drawing, and compositing.
- `DisplayListSwift` classes are `LineBuilder`, `QuadBuilder`, `VectorBuilder`, `LineStripBuilder`,
  `MultiTexturedBuilder`, `TextBoundsCache`, `ColorSampler`, `Mask`, `Director`, `Pipeline` — a
  retained 2D display list for text/vector/quad drawing, separate from the raster brush engine.
- `PhoenixSwift/TileWriterExecutor` writes tiles (`WriteTilesParams`, `FillGuttersParams`) — the large
  canvas/export path.

## Data model, from Swift reflection strings

The binary's `__swift5_reflstr` section holds 5,616 distinct field/property names (10,512 entries).
They are names, not values, but they name the model precisely. Selection:

| Area | Names |
|---|---|
| Movie / scene | `scene`, `scene_reference`, `has_scene`, `scene_reference`, `frame_rate`, `duration`, `frames`, `frame_timings`, `frameAllocator`, `frame` |
| Tracks and content | `trackConfiguration`, `addTrack`, `content`, `contents`, `content_at_frame_limit`, `found_on_timeline`, `entitySpansMultipleFrames`, `isFirstEntityFrame`, `contentOffset` |
| Keyframes | `entityKeyframes`, `trackKeyframes`, `has_active_keyframe`, `active_keyframe`, `hitKeyframe`, `addKeyframe`, **`keyframe_as_attribute`**, **`allow_keyframe_subframes`**, `track_keyframe_icon_layer` |
| Perform | `perform`, `performing`, `ConcretePerformingProvider`, `PerformingToolbar`, `PerformingPopover` |
| Onion skin | `onionSkin`, `max_onion_skins_in_direction`, **`blendPrimaryFrame`** |
| Layers and masks | `layers`, `layer_count`, `layerType`, `layerTransform`, `mask`, `mask_idx`, `has_mask`, `isMask`, `is_clipped`, `canClip`, `clipping`, `canMergeMask`, `mergeMask`, `privateLayers`, `materialLayers`, `materialLayer` |
| Colour | `perFrameColorPalette`, `ColorPanel`, `colorPanel` |
| Export | `quickExport`, `quickExportMovie`, `quickExportAnimatedGIF`, `quickExportFramesAsImages`, `quickExportCurrentFrame`, `quickExportDreams`, `advancedExport`, `advancedExportCustomSettings`, `advancedFrameFormat`, `advancedFrameRescale`, `advancedFrameFileContainer`, `advancedDreamsUndoHistory`, **`export_codec_limit`**, `ExportSession`, `activeExportSession` |
| Undo | `undo`, `undoHistory`, `storedUndos`, `storedUndoSteps`, `rapidUndoDelay`, `enableUndoButtons`, `enableUndoGestures` |
| Selection / UI | `selectionMaskVisibility`, `timelineShapes`, `timelineThumbConfig`, `timelineSnapping`, `TimelineInteractor`, `TimelineSelectionActivity` |

Read as design evidence: keyframes are stored **as attributes** on entities and may carry
**subframes**; onion-skin direction is capped per side and has a "blend primary frame" mode; colour
palettes can be **per frame**; export has quick and advanced families with a codec limit; undo depth
and undo-gesture toggles are user settings.

## UI resources

41 compiled nibs. The Layers bundle alone has cells for `Layer`, `Group`, **`MaterialLayer`**,
**`Mesh`**, **`TextureSet`** and `Background` — Dreams layers are not only paint layers. The colour
panel resource bundle carries the same `classic`, `disc`, `harmony`, `palettes`, `value` views as
Procreate, and `ProControls` brings the numeric keypad and popover menu.

Five onboarding videos ship in the app: **welcome, draw, gestures, keyframe, perform** — exactly the
five topics doc 07 lists from the handbook.

The brush repository (`BrushSourceRepository.plist`) has 19 preset groups, beginning Recent,
Sketching, Inking, Drawing, Painting, Artistic.

## What this confirms, and what it does not

- **Confirms** the handbook's core model (scenes, tracks, content types, perform/keyframe split,
  onion skin options, per-frame palettes, export families) and adds detail the handbook does not
  spell out: keyframes as attributes with subframes, a codec limit for export, mesh/texture-set
  layers, and a Valkyrie document container.
- **Inferred:** that the display list is what draws timeline/text/vector overlays while Valkyrie
  renders the canvas; that the `.drm` chunk table maps scenes and media. Both follow from names and
  file structure, not from bodies.
- **Not established:** any method body (no decompilation; the binary is 16 MB of unsymbolised
  code), the `.drm` chunk layout, the export codec limit's value, or any runtime behaviour. Nothing
  was launched.

## Reproduce

1. `inspect_dreams_metadata.py <path to Dreams.app>` — standard-library only; prints a summary, or
   `--full` for every ObjC class, Swift symbol and reflection string. It reads the Mach-O header,
   class list and Swift sections; it never executes the app.
2. REA: `open_binary` the `.ipa` → `extract_artifact` → `open_bundle_resources` the extracted
   `Dreams.app` → `decode_interface_builder` (44 compiled documents, under the 64-document cap; the
   Layers and colour-panel cells are in the decoded set).
3. The `.drm` header and image counts come from a byte scan of the shipped sample projects.

## Evidence

| Evidence | Covers |
|---|---|
| `ev_b49fd53f7e54022282e8f349de9ed5caf9cbe84bfcb9cf85516ecbf339db16c3` | extraction of all 1,528 members |
| `ev_c251ba493e97ca06f29750b77a58bfeba3204452e8e32f8808789ee28d94abed` | Interface Builder decode of the app bundle |
| `ev_47da8082b7489911ea1102c29d1d31fff0ac318e54e3be4f72a8bf8ff509a8f0` | its summary view (44 documents, 2,055 nodes, 1,118 edges) |
| `inspect_dreams_metadata.py` | bundle keys, Mach-O facts, 1,243 classes, 2,374 symbols, 10,512 reflection strings |

## For 2Dope

Doc 08's rules already match the package on every point it states. Three additions are worth keeping:

- **Keyframes as attributes with subframes** is the model doc 08's D-rules imply; naming it now avoids
  a later schema migration.
- **A codec limit per export** (`export_codec_limit`) is a real product decision: Dreams caps codecs
  for device or licence reasons instead of exposing all of AVFoundation.
- **Mesh and texture-set layers** exist in Dreams' layer cell set; doc 08's "Drawings/Flipbooks" model
  is simpler, and that is a defensible 2Dope choice, not an oversight.
