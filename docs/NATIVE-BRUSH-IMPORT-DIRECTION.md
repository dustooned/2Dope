# Built-in ABR and Procreate brush import

2026-10-15 · feasibility and proposed scope · not implemented

The user wants to open brush files directly in 2Dope. Target an **Import brushes** action in the existing brush library, with local parsing and conversion into 2Dope brush settings/assets; no external converter or required account. Direct import does not imply identical rendering across different brush engines.

## Confirmed basis

- Adobe documents importing Photoshop `.abr` brushes: [Adobe import guide](https://helpx.adobe.com/ca/photoshop/desktop/apply-painting-techniques/brushes-presets/import-brushes-brush-packs.html).
- Procreate lists `.brush`, `.brushset`, `.brushlibrary` and `.abr`: [Procreate Import and Share](https://help.procreate.com/procreate/handbook/brushes/brushes-share). These usage docs identify formats, not their binary layouts or permission to assume compatibility with every version.
- Current `core/brush.ts` supports size, hardness, spacing, opacity/flow, angle/roundness, scatter, pressure/tilt/speed dynamics, taper, smoothing and procedural grain. `brush/raster.ts` generates tip sprites and grain; no imported image-tip asset path was established in this read.
- Existing `core/brushlib.ts` and `ui/brushlib.ts` supply library previews, custom presets and per-device JSON storage. They are a starting point, not ABR/Procreate decoders.

## Build order

1. **Image tip / texture assets:** support a sampled alpha tip and grain texture in the raster brush engine. Define asset ownership, bounded decoded caches and brush snapshots; protect old drawings/strokes and Lite budgets. Keep preset metadata separate from image bytes.
2. **ABR importer:** inspect representative files, identify supported versions/record types, extract names and tip assets, then map verified settings. Reject unsupported versions explicitly. Establish a useful sampled-tip import before promising complete preset dynamics.
3. **Procreate importer:** inspect real `.brush` and `.brushset` fixtures, decode their actual resources/metadata, then map supported properties. A `.brushlibrary` is a separate later target unless its container is verified. Do not assume identical layouts from file extensions or manufacture a decoder from manual prose.
4. **Compatibility review and library integration:** show previews, preserve sets/names, allow selecting brushes to import, avoid name collisions, and distinguish supported, approximate and unsupported characteristics. No silent substitution of every brush with a round tip.
5. **Persistence and portability:** retain tip/texture assets in the brush library and embed assets required to reproduce saved project strokes in standalone `.2dope` files. Round-trip without relying on brushes remaining installed on the original device. Version/validate format additions as required.

## Compatibility contract

Candidate mappings include tip shape, texture, spacing, angle, scatter, opacity/flow, and pressure/tilt response; each must be verified against the decoded source. Dual brushes, wet mixing, proprietary texture blending and unusual dynamics may need approximations or additional engine work. Do not advertise pixel-identical Photoshop/Procreate output.

Image brushes primarily extend raster painting/erasing. Do not silently change vector output, QuickShape geometry, Line/Fill order or other tools to simulate unsupported brush behavior. Keep stochastic behavior seeded, previews bounded, imports cancellable, and existing presets usable throughout.

## Evidence needed before format implementation

Use a small permitted fixture set containing at least a basic tip, a textured brush and a pressure-sensitive brush, across available ABR and Procreate examples. Record source version when known, decoded fields and unresolved properties. Real app binaries are not needed; brush files are the appropriate artifacts for this task. Manuals alone cannot establish their encoding.

Verify parser outputs, real tip/texture rendering, pressure mapping, malformed/oversized input handling, library save/reload, project asset round trips and preview/export consistency. Opening a file successfully is not proof of brush fidelity. Physical Pencil feel remains a separate device check.

No format fixtures were inspected in this feasibility pass; there is no parser or fidelity claim. Existing queued image brush tips/import work remains the right starting point. Application code, dependencies and Git branches unchanged; no merge/deployment.
