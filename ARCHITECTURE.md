# Architecture (milestone 0)

TypeScript + Vite, no UI framework. Canvas 2D for M0; WebGL2 renderer comes with compositing.

```
src/
  core/        pure data + logic, no DOM except where noted
    brush.ts     BrushSettings (native brush JSON), Dynamic, presets, evalDynamic
    stroke.ts    StrokePoint, StrokeRecord (strokes are data)
    rng.ts       hash01(seed, index, salt): deterministic jitter
    history.ts   Command + History (undo/redo)
  brush/
    smoothing.ts Smoother: exponential or pulled-string stabilizer, catch-up on pen-up
    dabs.ts      DabWalker: points -> dabs (spacing, dynamics, taper, scatter); incremental + deterministic
    raster.ts    RasterEngine: dabs -> stroke buffer -> layer (opacity vs flow, grain, eraser); tip sprites
    vector.ts    pressure-width vector stroke outline
  view/
    viewport.ts  Viewport: zoom/pan/rotate/flip matrix, screen <-> document
  ui/
    panel.ts     brush tuning panel + live preview
  app.ts       App: input (pen/mouse/touch), gestures, shortcuts, render loop
  main.ts      wiring
```

## Data flow for one raster stroke

pointer events (coalesced) → `toPoint` (doc space, pressure, tilt, time) → `Smoother` → recorded in
`StrokeRecord.points` → `DabWalker` → `RasterEngine.addDabs` (stroke buffer) → screen shows
layer + buffer at stroke opacity → on pen-up, `commit()` re-renders the stroke from data (end taper
now known), composites onto the layer, and returns before/after pixels → `History`.

Predicted events are drawn as a one-frame "ghost" (cloned walker), never stored.

## Rules

- Strokes are data; pixels are a cache. Same record + seed → same pixels.
- All randomness via `hash01`; no `Math.random` in rendering.
- Every change is a `Command` through `History`.
- `core/` and `brush/dabs.ts`, `brush/smoothing.ts` stay free of UI code (unit-tested in Node).
