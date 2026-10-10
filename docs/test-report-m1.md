# Milestone 1 test report (2026-10-10)

Automated: 72 unit tests (timeline, fill, zip/schema, autosave, export planning, brush engine). All pass.
Scripted in a real browser (desktop Chromium, hidden preview pane): every slice, then a combined pass.

## Passed
- Drawing, fill (no halo, no leak, line plane untouched), onion, scrub lock, timeline drags, exposure, roles, X-sheet typing, notes, Quick Animate, export passes with alpha, `.2dope` save/open, versions, crash restore (pixel-faithful).
- Undo walks back to the exact starting pixels across strokes, fills, timeline edits, roles, duplicate and delete; redo returns.
- Delete every drawing leaves one blank drawing; undo brings them all back.
- Typing in the project-name box does not trigger shortcuts. Six rapid Tab presses end in a consistent state. No JavaScript errors or rejections in any run.
- A 60-drawing shot (5 s at 12 fps) with fills on a third of them: 27 ms per drawing to draw, autosave and Save OK (4.3 MB file, opens in 0.7 s).
- Production build boots; the 404 page and the "did not start" banner work.
- Layout checked at desktop, iPad-portrait and phone widths (single scrollable bars, overlay panel, Quick Animate by default under 900 px).

## Findings (not fixed yet), most important first
1. **Memory.** Every drawing keeps full-size canvases alive: about 8 MB for the line plane plus 8 MB when it has a fill. The 60-drawing test needs roughly 640 MB of canvas memory. Desktop copes; **iPad Safari limits total canvas memory (often around 250-400 MB) and may reload the tab or crash around 30-45 drawings.** Fix: keep only the current drawing and its onion neighbors as live canvases, hold the rest as compressed images (or sparse tiles) and decode on demand. Quick mitigation: let New project pick 1280×720 (3.7 MB per plane).
2. **Playback not verifiable in the hidden preview pane** (animation frames are paused there). The timing logic is verified (frame 12 at 1 s at 12 fps, loops correctly); please check by eye on a real screen.
3. **Export speed** in a background tab is limited by the browser (about 1 s per batch of images), so 120 images took 21 s there. A visible tab should be much faster; confirm on the iPad.
4. Colors and pen feel could not be judged by script: needs a human on a real pen (see checklist).

## Manual checklist for the iPad (about 15 minutes)
1. Open the site, add to Home Screen. Does it start in Quick Animate? Is the bar easy to reach with a thumb?
2. Draw with Apple Pencil: pressure, tilt shading (lean the pencil with Pencil or Charcoal), smoothing. Note any lag or wobble.
3. Two fingers: pinch, pan, twist. Two-finger tap = undo, three-finger tap = redo. Does a resting palm draw?
4. Draw 12 frames of a bouncing ball. Onion skin, scrub lock (Lock, then drag the ruler and let go), 2s exposure, play.
5. Fill a shape with a small gap in the line. Does it leak?
6. Export a PNG sequence (More, Export sequence). Does the zip download and open?
7. Keep going until it slows or reloads: how many drawings did it take?
