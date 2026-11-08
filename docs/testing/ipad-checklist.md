# iPad and Apple Pencil checklist (November 2026 updates)

Desktop Chromium checks cannot prove these flows. Allow about 30 minutes for this pass.
Use a test project; do not clear the iPad's existing 2Dope storage.

**Setup.** Either open 2dope.xyz after the build is pushed, or run `npm run dev:lan` on the computer and
open the HTTPS address it prints in iPad Safari, accepting the local certificate. Record the iPad model,
iPadOS version, and whether the app was opened in Safari or from the Home Screen.

Mark each line ✅, ❌ (add what happened) or – (not tried).

## Drawing and Transform
- [ ] Pencil pressure changes line width; a palm on the screen draws nothing.
- [ ] Draw a shape, tap Transform: the handles appear around the artwork without making a selection first.
- [ ] Drag a corner (Uniform) and the top knob (rotate); the size/angle badge follows the Pencil.
- [ ] While Transform is open, two fingers pan and zoom the canvas and do not move the artwork.
- [ ] Freeform, Distort and Warp handles can all be grabbed with a fingertip as well as the Pencil.
- [ ] Tap the Brush tool: the transform applies; one Undo puts it back.
- [ ] More tools → Smudge works with the Pencil and stays inside a selection.

## Next pose (vector tweening)
- [ ] Animate → Vector: draw a line, then tap Next pose. Edit points opens on a new drawing.
- [ ] Drag a point with the Pencil and with a finger, then tap Done.
- [ ] Scrub the Flipbook between the two drawings: the line moves smoothly between the poses.
- [ ] Play: the move is smooth with no flicker on the first or last frame.
- [ ] One Undo removes the whole Next pose step (the copy, the longer hold and tweening).
- [ ] Draw two separate poses (no Next pose), turn on Motion → Layer → Tween vector lines, play.

## Animate along a path (Motion)
- [ ] Select a layer, choose Animation → Animate along a path…, then draw a route with the Pencil. A dashed line follows the Pencil.
- [ ] Do the same with one finger. The page does not scroll or zoom while you draw.
- [ ] The dialog fits on screen with the onscreen keyboard open. Change Time, tick Turn to face the way it travels, then tap Animate.
- [ ] Play: the layer moves steadily along the route and turns to follow it. One Undo restores the layer.
- [ ] Draw a loop that ends where it started; the layer goes around smoothly with no jolt at the join.
- [ ] Choose Animate along a path…, then use the existing-line option on a vector line you drew earlier in Draw.
- [ ] Start drawing a path, then press Esc on a keyboard (if one is attached) or choose Cancel drawing the path: nothing changes.

## Cycles and the Flipbook
- [ ] Select three drawings, open the frame menu (press and hold), choose ×3 under Repeat as a cycle.
- [ ] Edit one of the repeated drawings: every repeat shows the change.
- [ ] To end fills the shot; a second To end says the drawings already reach the end.
- [ ] Pinch to zoom the Flipbook on a long shot (open a sample or repeat a cycle to the end). Note whether it stutters.
- [ ] Drag the Flipbook divider up and down; it keeps its height after reloading.

## Clipboard
- [ ] Copy a selection in Procreate (or Photos), switch to 2Dope, Paste: the art arrives as an asset at the playhead.
- [ ] Main menu → Copy Visible, then paste into Notes or Procreate: a transparent PNG arrives.
- [ ] Note any permission prompt iPadOS shows, and whether Paste works on the first try.

## Panels that load on first use
Test this on a slow connection: Settings → Wi-Fi, or tethering with a weak signal.
- [ ] Open Share the first time: it appears within a second or two, with no blank screen.
- [ ] Open Story → Present, the Reference window, Motion presets, Titles and Camera moves once each.
- [ ] Turn Wi-Fi off after the app has loaded, then open a panel not yet opened: a clear message
      ("That panel could not load…") appears and the app keeps working. Turn Wi-Fi back on and the panel opens.

## Memory and keyboard
- [ ] Work in a 300+ frame project for 10 minutes; the tab is not reloaded by Safari.
- [ ] In Story, type dialogue with the onscreen keyboard; the text field stays visible above the keyboard.
- [ ] Rename a layer with the onscreen keyboard; Done/Return confirms it.

## Report
Send the marked list along with screenshots or screen recordings of each ❌. Add the device result to the
current section of `HANDOFF.md` and keep it dated.
