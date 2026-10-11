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

## M1 slice 7: PNG sequence export (milestone 1 complete)

**Export…** writes the whole shot as PNG sequences with alpha in one zip (see `docs/export-format.md`): pick **Combined / Lines / Fills / Matte** passes, size (100/75/50/25%), background (transparent or white, combined pass), all frames or the selected drawings, and the first file number (e.g. 1001). Progress bar and **Cancel**; held drawings are rendered once. Settings are remembered. **PNG** still saves just the current frame.

**Milestone 1 "done when":** a 5-second hand-drawn shot is drawn, timed and exported with transparency.

## M1 slice 6: X-sheet and Quick Animate

**X-sheet** (the **X-sheet** tab in the side panel, or **Shift+X**): the same timeline as a numbers grid, one row per frame. The drawing number sits on the frame where it starts; a line runs through the frames it is held; a heavier rule marks each second; a notes column sits on the right.
- Click or drag down the rows to select drawings (Shift+click extends); **Up/Down** moves the frame; **Ctrl+A** selects all.
- **Type a number** (or double-click a cell, or press Enter) to show that drawing from this frame to the end of its hold. A number with no drawing yet creates a blank one. Esc cancels. Later frames keep their timing.
- **Notes:** click the note column to type a note (dialogue, an action). It stays with its drawing when you retime or reorder, and is saved in the project.
- Frame numbers show as **Frames**, **Sec + frames** (1+12) or **Timecode** (00:00:01:11).
- Exposure, roles, delete, undo and autosave all work here exactly as on the strip: same data, two views.

**Quick Animate** (**Tab**, or the **Quick Animate** button): the canvas, a slim strip, and one floating bar (brush, eraser, fill, color, size, undo/redo, play, add frame, 1s/2s/3s, fps, onion). **More** has everything else (vector pen, Line/Fill plane, duplicate, delete, lock, fit, flip, export PNG, save). The bar and strip fade while the pen is down and return when it lifts. The mode is remembered on this device. **Shift+Tab** hides all interface.

## M1 slice 5: timeline, exposure, roles

- **Timeline blocks** are as wide as their hold. **Drag a block's right edge** to change its hold (if several are selected they all take the new length). **Drag a block** to reorder. Each drag is one undo step.
- **Select:** click a block (**Shift**+click adds), drag on empty space for a **marquee**, **Ctrl+A** for all. Click empty space to deselect. Drag on the **ruler** (top strip) to scrub.
- **Exposure:** **1s 2s 3s 4s** buttons (or keys **1 2 3 4**, or type a number + Enter) set how many frames each selected drawing is held, without deleting anything; going back to 1s restores the spacing. The readout shows **mixed** when the selection differs. With nothing selected it acts on the current drawing. (**Shift+1** is now 100% zoom.)
- **Mark K / B / I:** label drawings as **key**, **breakdown** or **inbetween** (badge on the block; click again to clear). **Keys only** limits onion skin to key drawings.
- **Zoom** slider for long shots. **Delete** removes all selected drawings (undoable).

## Library and memory (after M1)

- **Projects** (☰ menu): every project stays on this device and is always saved, like Procreate Dreams' Theater. Open, rename, duplicate (shares images, no extra space), delete, and sort into **folders**. 2Dope reopens the last project on start; there is nothing to "restore".
- **New project** keeps the current one in Projects (an untouched empty one is removed). **Import .2dope** adds a file as a new project; **Export .2dope** downloads a self-contained copy.
- **Versions** are per project.
- **Long shots no longer run out of memory**: drawings away from the playhead are packed away and come back in a few milliseconds when shown (their thumbnail fills in meanwhile). Undo, export and onion skins bring them back automatically.

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
| Quick Animate on/off | Quick Animate button | Tab |
| Hide all interface | four-finger tap | Shift+Tab |
| X-sheet / Brush tab | side-panel tabs | Shift+X |
| Tools | | B brush, E eraser, P vector, G fill |
| Draw on Line / Fill plane | **On** switch | X |
| Brush size | | `[` `]` |
| Fit / 100% / flip view | | F / Shift+1 / H |
| Exposure of selection | strip 1s 2s 3s 4s | 1 / 2 / 3 / 4 |
| Select all drawings | | Ctrl+A |
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
