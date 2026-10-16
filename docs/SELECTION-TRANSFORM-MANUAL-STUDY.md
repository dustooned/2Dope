# Selection and transform: focused manual study

2026-10-16 · design only · three official pages · one agent

Extends the saved studies rather than restarting them. No reference-app installation or runtime evidence. No application changes, new mockups, merge or deployment.

## Evidence → current 2Dope → remaining capability

| Official documentation, paraphrased | Checked 2Dope behavior | Remaining capability |
|---|---|---|
| **D1: [Dreams Select](https://help.procreate.com/dreams/handbook/draw-and-paint/select)**, Selection modes / Add / Remove / Invert: selection addresses the current drawing layer(s) in a Drawing or Flipbook frame; automatic, freehand, rectangle and ellipse modes support different ways to isolate artwork. | Main `7e275ac` has temporal exposure selection and old enclosed-region Lasso Fill. Separate branch `codex/selection-fill`, `5caf0aa`, adds a temporary freehand spatial mask, not yet integrated. | Add/subtract/invert and geometric selections are candidates, not implemented parity. Temporal selection must remain distinct. |
| **D1**, Color Fill / Clear / Copy & Paste: fill colors the selected area; Clear removes the mask, not artwork. Copy & Paste uses only the active drawing layer, even though broader selection targeting exists. | The feature branch supplies direct mask fill, bounded region/Leftovers fills and Clear selection. Its brushes remain unrestricted; frame/layer changes clear the mask. | Layer scope must be explicit for every operation. Neither multi-layer copy nor mask persistence across frames can be inferred from these paragraphs. |
| **P1: [Procreate Transform: Interface and Gestures](https://help.procreate.com/procreate/handbook/transform/transform-interface-gestures)**, Bounding Box / Numeric input: visible handles and dimensions support positioning and precise size/rotation entry. Reset restores the session; Simplified Undos normally consolidates its edits after exit. | Draw has no selected-area transform. Motion already transforms whole layers/precomps; that must not be mistaken for moving selected cel artwork. | Current-drawing move/rotate/scale, numeric controls, Reset and one undoable Apply/Cancel. Preserve separate Line/Fill/vector content. |
| **P1**, Fit to Screen: the Magnetics variant can overflow the canvas, with overflow cropped on commit. This is a specifically documented operation, not proof of every transform's boundary behavior. | Drawing raster canvases have fixed dimensions. No selected-transform overflow policy exists. | Decide and disclose clipping versus retained off-canvas artwork before implementation; do not promise lossless recovery merely because preview shows an overflow. |
| **P2: [Procreate Interpolation, version 5.3](https://help.procreate.com/procreate/handbook/5.3/transform/transform-interpolate)**, How Interpolation Works: repeated resizing can degrade raster edges; sampling choices trade sharp edges against smoothness. | No selected bitmap transform/resampling path is implemented. Existing vector records require their own geometry treatment. | Preview from unchanged source; resample only when applying. Test line/fill edges and translucent pixels, not just solid rectangles. |

## Our proposed choices, not reference facts

Start with **current drawing only**, proportional scale by default, explicit Apply/Cancel, one undo step. Keep whole-rail/precomp transforms in Motion and preserve the shared clock, holds, Board panels and linked audio. Preserve editable vector records; never silently flatten selected lines to make the first implementation easier.

The branch's fill-only mask is an intentional limited foundation, not complete Dreams selection behavior. Reuse it for transform targeting, but first agree whether Line, Fill, or both are selected and how partially intersected vector strokes split. Do not change brush clipping as a side effect of adding transforms.

Warp/Advanced Mesh remain later work. Reuse the two previously checked Warp/Draw & Paint Transform sources in [the direction note](TIMELINE-AND-MEDIA-DIRECTION.md); this pass does not establish a mesh algorithm, grid resolution or fold order.

## Unknowns and version limits

- P1 says initial Transform mode is Freeform; the previously read Dreams Transform page says Uniform. Our proposed proportional default is a product decision.
- P1 says interpolation defaults to Nearest; its interpolation link resolves to P2, explicitly marked older, which says Bilinear. Do not turn this discrepancy into a universal default or runtime claim. No fourth page was fetched to resolve it.
- These manuals do not specify 2Dope's mixed raster/vector boundary extraction, shared-drawing instance policy, retained overflow storage, or multi-frame edit scope. The source model must answer those separately.

**Smallest next implementation after integration:** current-drawing affine selection transform, preserving separate art components, with numeric placement, Apply/Cancel and one undo. Settle partially selected vectors and off-canvas behavior first; additive masks and warp are separate slices.
