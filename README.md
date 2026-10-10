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
- **Tilt shading**: lean the pen and textured brushes (Pencil, Shading Pencil, Charcoal) switch to a broad, soft, grainy side-of-the-lead tip that follows the lean direction.

## M1 slice 4: autosave, recovery, versions, files

- **Autosave** to the browser (IndexedDB) about a second after every change (never mid-stroke). The status next to the project name shows Saved / Saving / Unsaved / error, and the storage meter shows how much space is used and whether the browser has promised not to clear it.
- **Recovery:** after a crash or a closed tab, the next start offers **Restore** (pixel-for-pixel) or **Start fresh** (the old session is kept under Versions).
- **Versions:** an automatic restore point every 10 minutes while you work (last 10 kept), before **Clear** and **Delete drawing**, and before opening, restoring or starting a new project. **Versions** also lets you save your own named ones (never auto-deleted).
- **Save / Open:** **Save** downloads a `.2dope` file (a zip you can keep; see `docs/project-format.md`). **Open** loads one. **Export JSON only** (in Versions) writes just `project.json` for scripts and diffing.
- **Backup reminder** after 30 minutes of work without a saved file, and a warning if 2Dope is open in two tabs (they would overwrite each other).

## M1 slice 3: line + fill planes, fill tool

- Every drawing has a **Line** plane (linework, on top) and a **Fill** plane (flat color, always under). The **On: Line | Fill** switch (or **X**) picks where brushes and the eraser write.
- **Fill tool (G):** click inside a shape. It reads the Line plane plus vector strokes and paints the Fill plane **under** the lines.
  - **No halo:** soft anti-aliased edges count as line, and the fill tucks under the line ("Under line" px) only through pixels the line covers, so it can never leak through a line or leave a white fringe.
  - **Close gaps:** gaps in the line up to N px do not leak (default 4). Larger gaps still leak, by design.
  - **Line edge:** line alpha that blocks the fill (lower = softer edges block too).
  - Fills never change the line art; recoloring a fill = fill again with another color. Fill, color and eraser are all undoable.
- Thumbnails, onion skins and PNG export show all planes together as one image.

## M1 slice 2: onion skin + scrub lock

- **Onion skin (O):** previous drawings tinted blue, next drawings red, fading with distance. Holds are skipped (you see distinct drawings). Strip controls: count before/after (0 to 5) and opacity. Hidden during playback.
- **Scrub lock (L):** marks the current frame as **home** (shown with a gold marker and "Home N" on the button). Drag the strip, or hold **Shift + arrows**, to flip through frames; when you let go (or release Shift) it snaps back to home. Press L on the home frame again to clear it.

## M1 slice 1: frames

- Flipbook strip: one block per drawing, stretched over its hold, with thumbnail and drawing number.
- Add (splits a hold, keeping timing), duplicate, delete, longer/shorter hold, next/prev frame and drawing.
- Playback at 12/15/24/25/30/60 fps, looping. All frame edits are undoable.

## Controls

| Action | Pen / touch | Mouse / keyboard |
|---|---|---|
| Draw | pen (fingers too if **Finger paints** is on) | left drag |
| Pan | one or two fingers | Space + drag, middle drag, Shift + wheel |
| Zoom | pinch | wheel, Z + drag |
| Rotate view | two-finger twist | R + drag; `0` resets |
| Undo / redo | two- / three-finger tap | Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) |
| Hide UI | four-finger tap | Tab |
| Tools | | B brush, E eraser, P vector, G fill |
| Draw on Line / Fill plane | **On** switch | X |
| Brush size | | `[` `]` |
| Fit / 100% / flip view | | F / 1 / H |
| Tilt shading (side of pencil) | tilt the pen past "Starts at" | hold **Alt** while drawing |
| Next / previous frame | strip: tap or drag | → / ← |
| Next / previous drawing | strip ⏭ ⏮ | ↑ / ↓ |
| Onion skin on/off | | O |
| Scrub lock set/clear | strip Lock button | L (then Shift + arrows to flip) |
| Play / pause | strip Play | Enter, or tap Space |
| New / duplicate / delete drawing | strip buttons | N / D / Delete |
| Longer / shorter hold | strip Hold + / − | = / − |

The stats line (bottom left) shows pointer type, pressure, tilt, input rate and coalescing: use it when comparing devices.

## Milestone 0 "done when"

Two animators draw for 15 minutes on an iPad and a PC and call the feel acceptable. Tuning happens by hand with the panel; record good settings with **Copy JSON**.

## Scripts

- `npm test`: unit tests (determinism, spacing, taper, smoothing, history)
- `npm run typecheck`
- `npm run build`

See `ARCHITECTURE.md`, `DECISIONS.md`, and `docs/feature-deconstruction/`.
