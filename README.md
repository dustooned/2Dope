# 2Dope (beta)

A small, free 2D animation tool for 3D animators: draw, time, tweak, send to Blender.
This folder is **milestone 0: the pen-feel prototype** (a "pen lab"). No timeline yet.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5180.

### On an iPad or another device (same Wi-Fi)

```bash
npm run dev:lan
```

1. Vite prints a `Network:` address like `https://192.168.1.20:5180`. Open that on the iPad in Safari.
2. The certificate is self-signed: tap **Show Details → visit this website** to continue.
3. If Windows asks about the firewall for Node, allow it on **private** networks.
4. For a full-screen feel: Share → **Add to Home Screen**, then open it from the home screen.

## What's in M0

- Pressure canvas with Pointer Events (coalesced + predicted events), pressure, tilt.
- **Raster brush**: stamp engine, opacity vs flow, hardness, spacing, roundness, angle, scatter, paper grain, start/end taper, stabilizer (smooth or pulled-string).
- **Dynamics**: size, opacity and flow can each follow pressure, tilt or speed, with min, curve, jitter, invert.
- **Vector pen**: pressure-width strokes kept as points (editable later).
- Eraser, undo/redo (commands), clear, PNG export with alpha.
- View: zoom, pan, rotate, flip; fit / 100%; pixel grid at high zoom.
- Brush panel with live preview; settings persist in the browser; "Copy JSON" gives the native brush format.

## Controls

| Action | Pen / touch | Mouse / keyboard |
|---|---|---|
| Draw | pen (fingers too if **Finger paints** is on) | left drag |
| Pan | one or two fingers | Space + drag, middle drag, Shift + wheel |
| Zoom | pinch | wheel, Z + drag |
| Rotate view | two-finger twist | R + drag; `0` resets |
| Undo / redo | two- / three-finger tap | Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) |
| Hide UI | four-finger tap | Tab |
| Tools | | B brush, E eraser, P vector |
| Brush size | | `[` `]` |
| Fit / 100% / flip view | | F / 1 / H |

The stats line (bottom left) shows pointer type, pressure, tilt, input rate and coalescing: use it when comparing devices.

## Milestone 0 "done when"

Two animators draw for 15 minutes on an iPad and a PC and call the feel acceptable. Tuning happens by hand with the panel; record good settings with **Copy JSON**.

## Scripts

- `npm test`: unit tests (determinism, spacing, taper, smoothing, history)
- `npm run typecheck`
- `npm run build`

See `ARCHITECTURE.md`, `DECISIONS.md`, and `docs/feature-deconstruction/`.
