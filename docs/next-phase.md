# Next phase: a balanced, simpler UI, with Draw split from Animate

Student profiles are built (2026-10-23): App settings can save up to 20 named device-local setups
with tool/control visibility, Focus/Simple/Full, drawing options, QuickMenu and range gesture.
Selection, creation, rename/deletion and setup edits are drafts until Apply. Brush/App settings
remain available, active tools remain visible until switched away, and Show all tools restores
visibility. The same choices filter floating and Full painting toolbars. This is an interface
preference system, not account management or feature permissions. Project files are unchanged.

**Approved order (2026-10-23): My Assets → QuickMenu → Ink & Paint. Motion/performance recording is
excluded from the current plan.** My Assets' first version now saves device-local snapshots,
adds independent editable copies across same-size projects, downloads/imports standalone artwork
files and opens different-size artwork as a native-size project. It preserves source layers and
frames; live cross-project linking and canvas-size conversion remain later decisions.
The library now also offers name search and Manage → Rename / Remove with Undo. Renames apply
to future copies, opened projects and downloads, preserving artwork already used in projects.
QuickMenu is now built with six configurable actions, a left/right edge button and Q keyboard
access in Draw/Animate. Menu → App settings → QuickMenu saves its action slots, button edge and
visibility on this device; Customize opens the same settings from the ring. Apply/Cancel and
Restore defaults keep preference edits separate from the document. The first Ink & Paint / Auto
Paint implementation is now built: opt-in on Line, editable ink plus selected paint colour,
conservative newly enclosed regions, separate planes and combined Undo. See HANDOFF.md for checks.

Playback range is now built (2026-10-23): Range in Flipbook, Clips/Timing and Motion opens
inclusive Start/End fields with Use current, Apply/Cancel and Whole animation. Each shot/source
saves its own preview interval with Undo/autosave; audio and visual playback use the same edges.
Ruler bands show the range in Flipbook/Clips. Preview-only ranges do not trim content or exports.
Repeat-cycle authoring remains a separate future step; motion/performance recording stays excluded.
The optional hold-and-drag range gesture is available in App settings → Gestures. It starts off;
Flipbook/Clips ruler holds preview a range and lifting commits through the same range command.
Quick ruler drags continue scrubbing. General gesture remapping remains a later feature.

Implementation status (2026-10-23, release checkpoint): the rendering consistency fix and first
Draw/Animate workspace layouts are built. Draw offers Canvas/Flipbook; Animate offers
Flipbook/Clips with simplified tools and recoverable control handles. Clips currently reuses
the exposure timeline. The first project-local Assets shelf and layered source/linked-placement
editing loop are built, including autosave and standalone archives. The My Assets snapshot library
and portable artwork sharing are now built. Live cross-project linking,
advanced docking and the new rail remain planned. See HANDOFF.md for actual checks and gaps.

Asset UI polish now includes an edge panel with artwork previews, compact icon controls and
folded placement actions. Direct selection/move/resize of placed artwork is now built in
Animate's explicit Move assets tool, with a placement picker, Edit source, Copies and Done.
It uses existing comp transforms/history. Clips now has selected-instance Start/Hold/End,
Follow shot end, edge preview jumps and visible asset intervals on the shared shot clock.
Direct asset clip movement and edge trimming are now built with live previews and one Undo per
gesture. Asset clips now repeat cached source-frame-one artwork previews, with source/placement
labels and linked counts. Separate Rename placement and Rename source actions are now built in
the Names menu and Assets cards, preserving custom placement names and shared links with Undo.
Copies → Make independent is now built: it copies editable source graphs, drawings, masks and
vectors for the selected placement, with one Undo restoring the original link. Copies also
retains Duplicate placement for linked instances. Parked artwork reuses immutable PNG data;
each copy owns its decoded canvases and editing metadata. No file-format change is needed.
Replace source is now built using the existing preview shelf. It changes only the selected link,
keeps name/timing/transform, resets old source-layer overrides, and restores the original with one
Undo. Automatic one-shot endings stay put. The placement actions stay together and use a single
row of labeled icons on phones. Both sources remain editable and included in project backups.
The tablet layout pass now gives Move assets a compact picker/Options/Done bar, with source
actions and optional timing in scrolling details. Full Tracks reserves roughly 45% canvas in
painting modes (280px minimum when feasible). Editor recovery/viewport resizing reapplies the
budget, and user folds/track changes preserve zoom and playhead. Fit canvas clears the header and
compact asset bar; Reset layout folds asset details as well.
The first complete Draw → Assets → Animate input review found and fixed native-control keyboard
conflicts: Enter on Asset options exited placement, and Space started playback. Native controls
now retain their keys, and source entry/Done and canvas input restore useful canvas focus.
New placements focus their picker. The real App/UI regression covers creation, pen-style pixels,
Undo/Redo, source return, touch move-to-pinch cancellation and keyboard routing without storage.
Direct source access is now built (2026-10-23): Edit source stays in the compact placement row
beside the picker, Options and Done. The phone button retains a visible Edit label and 44px target;
the row keeps its height. Source editing and Done use the existing shot/frame return path.
Source identity is now visible while painting (2026-10-23): the header shows the artwork name and
Updates N placements across the project, or Not placed yet. Narrow screens give it the workspace
selector's space until Done returns to the shot. Long names shorten within the row; full identity
and edit behavior remain in the accessible description/tooltips. Rename Undo/Redo refreshes it.
The first background-painting review now fixes Line/Fill unexpectedly replacing Brush with
Vector/the bucket. Plane selection keeps Brush, Eraser and Smudge; explicit Vector/bucket choose
their supported planes, and selecting the opposite plane returns to Brush. Layers now has larger
Line/Fill/opacity targets and a Close action. Opacity/blend commits preserve focus and list scroll.
The browser painting fixture exercises separate real pixels, compositor opacity/visibility and
background/paint-layer Undo at phone/tablet sizes.
Colour now has an explicit Done row outside scrolling controls, retaining colour/tool/plane and
returning focus to the canvas. Escape works from Hex colour and yields to nested palette dialogs.
The panel tracks its toolbar opener after colour changes rebuild Bubbles, so toggling it closed
and positioning after resize continue to work. Closing also clears an unfinished disc drag.
Brushes now has a fixed Done header identifying the selected brush, tool and Line/Fill target.
Done/Escape/opener-toggle return to the canvas with those choices intact; card/category refreshes
retain keyboard focus and scroll. Actions have larger targets, and collections/cards scroll
independently. Studio, double-tap, imports and collection behavior remain available.
Brush size/opacity controls now show labels and pixel/percent values with larger touch targets.
Touch retains slider focus, arrows use actual units, Enter/Escape return to drawing, and a short
usable canvas gets a compact row. Brush settings remain separate from drawing Undo.
The integrated painting/Assets/Animate review now preserves each source's layer/frame on Done
and re-entry during the session. QuickShape editing is scoped to the current drawing and plane,
so the old source's action is unavailable after returning to the shot or switching paint targets.
The multi-frame Flipbook source review is now built: persistent Play/Pause beside scrolling
44px actions, a one-row track list on short screens, active-track reveal, measured panel height
and keyboard/accessible hold editing through the existing timing history. Source playback and
Done/resume continue to use the shared clock. See HANDOFF.md for checks and remaining device gaps.

Ink & Paint / Auto Paint now has its first implementation, with conservative newly
enclosed-region detection and a single Undo for line plus paint. Motion/performance recording is excluded. The
user deferred the existing short-screen Clips/view fixture investigation; retain it in HANDOFF.md.
Targeted iPad/Pencil checks of the complete asset loop remain necessary before claiming device readiness.
This is not authorization for the full rail rewrite.

Student feedback (2026-10-20): the UI still feels tedious and unbalanced. The flipbook, the
background sublayers, the layer stack and the toolbars all live in Draw and crowd each other.
Layers overlap and some stop responding. Layer, Line and Fill opacity don't respond while drawing.

Goals:
1. Draw is a complete, simple painting/drawing system with a Procreate-inspired, original interface and an optional flipbook. It is where students make backgrounds and reusable assets.
2. Animate keeps its canvas and drawing tools in a simplified, Dreams-inspired interface. Toggle between Flipbook and Clips views of the same animation; Draw's assets are available locally without a manual export/import round trip.
3. Every mode uses the same balanced layout.
4. Two interfaces, as in Clip Studio Paint: Simple (fixed, for tablets and phones) and
   Advanced (dockable panels). Focus becomes a hide-everything view. It must be easy to
   adjust your view and how you work.
5. Lite is a minimalist version of the same layout.

## Latest direction (2026-10-22; takes precedence over earlier proposals)

**Draw:** a self-contained painting workspace, useful even without making a larger animation.
Create a new background, prop, character drawing or other asset, ink/paint it in layers, and
optionally open a flipbook to animate it. The full drawing workflow stays here; the flipbook
is an addition that can be hidden, not a reason to move drawing capability out of this mode.

**Animate:** a canvas with drawing tools and a simpler Dreams-inspired arrangement. Students
can draw/paint animation frames directly, place assets made in Draw, and switch the bottom
editor between **Flipbook / Clips**. Both are views of the same content, selection and clock;
switching does not copy drawings or convert the document. Motion remains available for deeper
compositing and keyframe work.

**Assets:** New asset in Draw creates locally saved, editable artwork. An Assets shelf makes it
available to Animate in the same project as soon as it is created: add/place it, reopen it in
Draw to change it or add layers, and return to Animate with edits preserved. Start with assets
inside the project/local library and package their data in `.2dope` backups. Do not depend on
watching OS folders or asking students to export/reimport for each change. Cross-project asset
files/import are now available through My Assets snapshots. Preserve source layers and animation when reusing an asset;
linked placements share edits, while an explicit Make independent copy is a separate action.

**Controls:** the canvas stays central in both modes. Toolbars, menus, layers, colour and the
bottom editor can be shown/hidden easily and tucked against a chosen screen edge. A collapsed
panel leaves a small, labelled handle to bring it back; no setting can strand the controls off
screen. On touch devices, use explicit handles/buttons rather than gestures that conflict with
canvas drawing or navigation. Keep one home per action, remember the arrangement per mode, and
provide Reset layout. Simple uses restrained edge trays; Advanced may additionally dock/float
panels. Opening or collapsing a tray preserves the canvas zoom, rotation and current artwork.

Borrow familiar workflow principles from Procreate/Dreams while making 2Dope's interface,
icons and visual design original. These are requested design requirements, not implemented
features in full yet. The workspace shell and first local asset loop now exist. Auto Paint is
noted for later.

**Implemented first slice:** the connected Draw → New asset → Add in Animate → Edit
in Draw → Return loop, with a canvas and drawing tools in both modes, an optional Draw flipbook,
and Animate's Flipbook/Clips switch. It reuses existing painting/flipbook behavior. Validate
undo, autosave/reopen, standalone backup, mode/view changes and edge-tray recovery before adding
more tools or rewriting the rail for performance. The cleanup/layout work below supports this
slice; it must not remove Draw's optional animation or Animate's drawing canvas.

## Original diagnosis (2026-10-20; rendering items fixed in the 2026-10-22 working tree)

The first three rendering bullets below record the original problem. The current working tree
uses the shared layer compositor and removes the 25% floor; see HANDOFF.md for fresh checks.

- **Opacity bug (confirmed).** The layer being drawn on is painted by its own path in
  `App.render` (`paintActive` / `paintMasked`, src/app.ts ~5540–5656), not by
  `view/composite.ts`. Outside a clipping group it is called with `partScale = 1`, so **the
  active layer's own opacity and blend mode are ignored while you draw on it**. They come back
  as soon as another layer is active.
- `partAlpha()` forces the plane you paint on to at least 25 % (`Math.max(a, 0.25)`), so Line or
  Fill opacity set below 25 % appears not to respond on that plane.
- Line and Fill are each drawn at their own alpha straight onto the page, not as one layer, so at
  part opacity below 100 % the line shows the fill through it (double blending).
- "Layers stepping over each other": Draw's view mixes three models (paint stack via `cel`,
  flipbook tracks, timeline layers) and two renderers. Each feature added a special case
  (`alwaysShown`, `keep`, notes, guides, `flipbookView`).
- Imbalance: controls are added where there was room, not by a rule. Modes, tools, an options
  bar, the paint-target label, the layer bubble, the side sliders, the flipbook header and the
  Full top bar each own a strip, and the levels show different subsets in different places. So
  the top-right is crowded, the bottom is heavy in Draw, and the left is nearly empty.

## Modes

**Story · Draw · Animate · Timing · Motion · Share**

| | Draw | Animate |
|---|---|---|
| Purpose | Complete painting/drawing workspace for backgrounds and assets, with optional animation | Draw/paint frames and arrange assets in a simpler animation workspace |
| Bottom | Optional flipbook; hidden while painting a still asset | Toggle Flipbook / Clips; either can collapse to an edge handle |
| Layers | Procreate panel: groups, opacity, blend, clip, mask, alpha lock, merge | one row per track in the flipbook; the layers panel for the current frame |
| Time | The asset's frames when its optional flipbook is open | The shot's shared clock |
| Tools | Full painting, ink/colour, layers, selection, transform and adjustments | Canvas and simplified drawing tools, onion, + Frame and timing; extra options in edge trays |

- **One shared document.** A Draw asset is editable artwork with paint layers and optional frames (building on the existing `cel` /
  `importLayered` model). In Animate or Motion it shows as one layer: a background or a held
  drawing, or a frame-based asset. Double-tap it (or ✏️ Edit) to open it in Draw; Done goes back.
  Backgrounds are reusable assets, not a separate painting system.
- **A plain sketch.** The gallery can start a picture only, with no shot, which opens in Draw.
- **Shared tool state.** Brush, colour and size are the same in Draw and Animate.
- **Existing projects** open in Animate, unchanged. Conversion comes later (step 5).

## One layout for every mode (the balance rule)

Every mode puts each kind of control in the same zone:

```
┌───────────────────────────────────────────────────────────┐
│ [Gallery][✏️ Draw ▾][✏️/🎞][Actions][Adjust][Select][Move]   [Brush][Smudge][Erase][Layers][●] │  ← left = document and mode, right = tools
│ ┌─┐                                                         │
│ │S│                                                         │
│ │i│            canvas (always the biggest thing)            │
│ │z│                                                         │
│ │e│                                                         │
│ ├─┤  ← modify (eyedropper)                                   │
│ │O│                                                         │
│ │p│                                                         │
│ ├─┤                                                         │
│ │↶│ undo / redo                                             │
│ └─┘                                                         │
│          (optional Draw flipbook / Animate Flipbook·Clips)  │
└───────────────────────────────────────────────────────────┘
```

- **Top left:** where you are and what you do to the document. Gallery, the mode button, Actions (share, canvas, settings, help),
  Adjustments, Selection, Transform.
- **Top right:** what you draw with. Brush, Smudge, Eraser, Layers, Colour. Fill and Pen go
  into the brush tool's options, the way Procreate keeps them out of the main row. In Animate,
  Onion joins this row.
- **Left edge:** a thin sidebar with size, eyedropper, opacity and undo/redo. It can move to the
  right edge for left-handed students, as in Procreate.
- **Bottom:** time-based UI only: optional flipbook in Draw, Flipbook/Clips in Animate, the ruler
  in Timing and timeline in Motion. Each editor can tuck to its edge without changing content.
- **Popovers, not bars.** Tool options, layers, colour and adjustments open as popovers from
  their button and close on a tap outside. No options bar stays on screen. This removes the
  bar that changes height and pushes the canvas around.
- **One source of truth.** A single per-mode list (button, zone, levels it shows at) drives the
  bubbles, the Advanced toolbar and Lite, so the layouts can't drift apart again.

## Simple and Advanced (like Clip Studio Paint), with Focus as a view

Clip Studio Paint has two interfaces: **Simple mode** for tablets and phones (a fixed, big-button
layout with only what you need) and the **standard, advanced** layout (panels you dock, resize and
rearrange). 2Dope does the same, so it fits portable pads without losing power on a desk.

| | **Simple** (default on tablets and phones) | **Advanced** (default on computers) |
|---|---|---|
| Layout | fixed: the zones above, nothing moves | the same zones, but panels can be **docked** at a side and stay open |
| Panels | popovers that close on a tap outside | Layers, Colour, Brush settings and Effects can be pinned as a docked column (left or right), resized, or floated |
| Buttons | one row each side, large touch targets | more buttons in the same rows (Smudge, Pen, Fill, QuickShape, symmetry, guides), plus a customisable toolbar |
| Options | the essentials of each tool | every setting |
| Animate | mini or docked flipbook | full flipbook header or the classic timeline |

- Switch anytime from **Actions → Interface → Simple / Advanced**. On the first run the device
  picks: a touch tablet or phone starts in Simple, a computer in Advanced.
- Both use the same per-mode control list. Each entry says whether it shows in Simple,
  Advanced or both, so they can never drift apart.
- **Focus is a view, not a third interface.** One tap on ◐ (or a four-finger tap) hides
  everything except the canvas, the mode button, the tool row and the sidebar. It works in Simple and
  Advanced and comes back the same way. This replaces today's ○ ◐ ● cycle: two layouts plus
  one hide-it-all toggle.

### Easy to adjust your view and work

A **View** button (an eye, top-left, also in Actions) opens one panel with everything about
the screen:

- **Canvas:** Fit, 100 %, Reset rotation, Flip horizontally, the zoom % (tap to type).
  Pinch, rotate and quick-pinch-to-fit stay as gestures.
- **Interface:** Simple / Advanced, Focus, sidebar left or right (left-handed), button size
  S / M / L, light or dark.
- **Panels (Advanced):** dock Layers / Colour / Brush to the left or right, or float them;
  Reset layout.
- **Per mode:** each mode remembers its own panel layout and zoom, so moving between
  production steps puts each "app" back the way you left it.

## Less tedium: fewer taps, fewer decisions

Start with a **tap-count audit**: list the 15 things students do most (new frame, change brush,
pick a colour, undo, hide a layer, play, change opacity, fill, add a track, export...). Count the
taps today and aim for one or two each. Anything that takes more needs a gesture, a shortcut or a
better default. Ideas, roughly in order of payoff:

1. **QuickMenu (first version built 2026-10-23).** An explicit edge button or Q opens a ring
   of six actions in Draw and Animate. Students choose all six in Menu → App settings → QuickMenu
   (defaults: Undo, Redo, Eraser, Eyedropper, New frame, Flip view), as well as the button's edge and
   visibility. Q stays available with the button hidden. Settings are local device preferences,
   with Apply/Cancel and Restore defaults. Canvas holds retain their existing drawing/navigation
   behavior; a hold-to-open gesture remains a later consideration.
2. **Recent brushes and colours.** The last five brushes sit at the top of the brush popover,
   and the last eight colours under the colour dot. Most work uses three brushes.
3. **Colour drop.** Drag the colour dot onto the canvas to fill (hold to adjust the threshold),
   so Fill needs no tool switch.
4. **Touch and hold the canvas to pick the layer under your finger** (Procreate's layer select),
   instead of opening Layers to find it.
5. **Undo instead of "Are you sure?".** Deleting shows "Deleted · Undo" for a few seconds, with no
   confirm dialogs. Nothing modal sits over the canvas.
6. **Short menus.** Two levels at most. Tool options show the three settings students change
   (size, opacity, smoothing); the rest is under "More".
7. **Search.** A 🔍 in Actions: type "flip", "onion" or "gif" and run it. Students find
   features without learning where they live, and teachers can say "search for X".
8. **One name per thing.** Pick one word each for frame / drawing / track / layer and use it
   everywhere (UI, manual, menus). Today the same thing has two names in places.
9. **Smart defaults.** Onion on in Animate, layers and tracks named for you, a new frame after
   the last drawing, the last export settings remembered, and each mode's zoom and panels
   remembered.
10. **Class presets (teacher).** A project template sets canvas size, fps, length and starting
    layers, and can **hide features the class doesn't need yet** (effects, Motion, vectors).
    Students see less until the lesson needs it.
11. **First-time tips, once.** A small tip the first time a student opens each mode, never again
    (Help → Tips brings them back). No tours.
12. **Feedback without interruptions.** Notices are small toasts at the bottom that never cover
    tools, and they stack and fade.

## Animate: closer to Procreate Dreams

Already there: flipbook tracks, holds with a trim handle, free trim, ripple, pinch-to-zoom time,
mini flipbook, onion skin, masks and clipping per track, Dreams-style hotkeys, audio waveforms,
keyframes (in Motion).

Missing, in order of value for students:

1. **Performance recording.** Press Record, then drag, scale or turn a drawing while it plays:
   the movement is recorded as keyframes in real time (Dreams' signature feature). It turns
   Motion's keyframes into something students can just act out. It's built on the existing
   keyframe model, with a smoothing pass so a shaky finger gives a clean curve.
2. **Keyframes in Animate.** A small ◆ row under a track shows its Motion keys. Tap one to jump,
   drag one to retime. The detailed editing (easing, values) stays in Motion. This connects the
   two "apps" without merging them.
3. **Play range.** Drag two flags on the ruler to loop just a section while drawing and
   checking timing. Double-tap the ruler flags to clear.
4. **Draw while it plays.** Strokes made during playback land on the frame under the playhead,
   and an option advances to a new frame after each stroke. This is the fastest way to block
   out a rough.
5. **Animate on 2s / 3s.** A default hold for + Frame and auto-new-frames (1, 2, 3), shown in
   the flipbook header. Most student work is on 2s.
6. **Cycles.** Select drawings → Repeat ×N (or "loop to the end"), with linked copies: edit one
   and all repeats change. Walk and run cycles become a minute's work.
7. **Better onion skin.** Per-track onion on/off, before/after counts and colours in one small
   popover from the Onion button, and an option to onion only the current track.
8. **Track groups.** Fold tracks into a group (a character: body, head, arms) that moves, hides
   and trims together, with a fold arrow on the track row.
9. **Audio scrub.** Hear the sound while scrubbing (short grains), for lip sync. Add
   dialogue markers on the ruler.
10. **Snapping.** Drags and trims snap to the playhead, other tracks' edges and the play range
    flags (hold a second finger to turn snapping off).
11. **A quick camera in Animate.** A Camera track with pan/zoom keys made by pinching the stage
    while recording (item 1). Full camera control stays in Motion.

First up, small and high-value: 3, 5, 7. Bigger: 1 and 2, which are what make it feel like
Dreams. Then 6, 4, 8, 9, 10, 11.

### What Dreams' own app package confirms (checked 2026-10-21)

From the English UI text and file names in a local Dreams 1.0.11 package (read with REA and a
script; reference only, nothing copied into 2Dope):

- **Rail gestures:** pinch to zoom the timeline, a **three-finger swipe to stretch time or
  track height**, a quick pinch to fit the whole movie, a **double-tap to focus in**, and a
  **flick to send the timeline away** for more drawing room. Two- and three-finger taps undo
  and redo. → Add the three-finger stretch and the flick-away to the rail design; 2Dope's mini
  flipbook handle is our flick-away.
- **Settings students can change:** whether a finger can edit the timeline (vs pencil only),
  whether pinch also rotates the stage, and whether the undo/redo gestures are on. → Add
  these three to Preferences → Gestures.
- **Tracks:** add, duplicate, cut/copy/paste tracks, **solo and mute**, show/hide, groups,
  "convert layers to tracks", and timeline **content** blocks (split, group, lock, rename).
  → It matches our track plan; add **Convert layers to tracks** for the Draw → Animate handoff.
- **Timing:** Trim start, Trim end, **Free Trim**, Fill duration, hold frame length,
  **Snapping** (a toggle), Loop and **Bounce** playback. → Add Bounce (ping-pong) to the play
  range.
- **Flipbook is a mode you open on a piece of content** (not on text, video, audio, a group
  or an empty spot), with a Close Flipbook. → It matches our "double-tap to edit" model.
- **Keyframes:** ease in, out, in-and-out, with "set all easings" at once, plus warp and
  distort keyframes. → Add "set all easings" to Motion.
- **Performing** records move, scale, rotate, opacity, hue, saturation, brightness, blur,
  sharpen, noise, warp, distort and volume live. → Performance recording should cover more
  than transforms: start with move, scale, rotate and opacity.
- **Onion skin:** number of frames, opacity, separate forward and backward colours, and a
  "blend primary frame" option. → It matches the onion popover plan.
- **Stage and Backstage:** the area outside the frame can be shown or hidden. → Add a
  Backstage toggle to the View panel (useful for pans that start off-screen).
- **Onboarding** is five short videos: welcome, draw, gestures, keyframe, perform. → Our
  first-run tips can follow the same five topics.

## Procreate tools in both Draw and Animate

Draw and Animate share **one tool engine**: the same brushes, smudge, eraser, selection,
transform, adjustments and colour, in the same places (top-left and top-right zones). Animate
only adds the rail and its buttons. Procreate's toolset, as the checklist to audit against
(mark have / partial / missing in step 3, then fill the gaps):

- **Painting:** Brush, Smudge, Eraser with any brush. StreamLine and stabilisation
  (smoothing exists). Wet mix and colour pickup, dual brush, grain that moves or stays put (to
  finish once test brushes arrive). Pressure and tilt curves.
- **Assists:** QuickShape (have), drawing guides with Drawing Assist (2D, isometric,
  perspective, symmetry; partly there), and the eyedropper on touch-and-hold.
- **Colour:** Disc, Classic, Harmony, Value and Palettes tabs in one popover. ColorDrop with
  threshold. Recent colours.
- **Adjustments (top-left ✨):** Hue/Saturation/Brightness, Colour balance, Curves, Gradient
  map, Gaussian and motion blur, Sharpen, Noise, Liquify, Clone. Each works on a layer, or on a
  selection, with a "Pencil" mode to paint the adjustment in. In Animate, add "Apply to this
  frame / all frames on the track".
- **Selection:** Automatic, Freehand, Rectangle, Ellipse, with Feather, Invert, Copy &
  Paste and Save.
- **Transform:** Freeform, Uniform, Distort, Warp, with snapping and flip.
- **Layers:** Alpha lock, Clipping mask, Mask, Blend modes, Opacity, Groups, Merge,
  **Reference** (fill other layers using this one's lines), Select (pixels), Copy.
- **Text:** a Text layer with fonts, size and alignment (titles, speech for storyboards).
- **Gestures (Procreate defaults):** two-finger tap undo (hold for rapid undo), three-finger
  tap redo, three-finger swipe down for Copy & Paste, four-finger tap Focus, touch-and-hold
  eyedropper, a quick pinch to fit. A **Gesture controls** page in Actions → Preferences lets
  students change them, as Procreate does.

### What Procreate's own app package confirms (checked 2026-10-21)

From the English UI text and file names in a local Procreate 5.4.9 package (read with REA and a
script; reference only, nothing copied into 2Dope):

- **Gesture controls are a matrix.** Each action (Smudge, Erase, Assisted drawing, Eyedropper,
  QuickShape, QuickMenu, Full Screen, Clear layer, Copy & Paste, Layer select, Clone) can be
  triggered by any of: a finger touch, a **⎇ modifier button** (the square on the sidebar) +
  touch, touch and hold, a four-finger tap, a three-finger swipe down, or Apple Pencil double-tap,
  each with a delay setting (Eyedropper Delay, QuickShape Delay, Rapid undo delay). → Build
  Preferences → Gestures the same way: one row per action, one trigger each, and conflicts flagged.
  The ⎇ button is the "modify" square in our left sidebar.
- **Pencil hover:** hovering the Pencil with a finger on the screen changes brush opacity, and a
  pinch changes brush size. → Add this where the browser reports hover (`pointermove` with
  pen and no buttons), as an option.
- **Interface preferences:** dark or light, a **right-hand interface** (the sidebar on the
  other side), the **Size & Opacity sidebar**, **auto-hide the interface** after a delay
  while drawing, and **"Fit canvas inside the interface"** (the canvas fits in the free space,
  or under the bars). → Add the last two to the View panel; they solve "the UI covers my
  drawing".
- **Pocket layouts** (the phone version) have their own small layouts and keyboards. → It confirms
  Lite as a separate, smaller layout of the same app, not just hidden buttons.
- **Drawing Assist, Page Assist, Animation Assist.** Animation Assist is Procreate's small
  timeline, with onion frames, onion opacity, onion colours and a **per-frame colour palette**.
  → Per-frame palettes are a nice extra for Animate (colour scripts).
- **Palettes:** palette from an image, import, and copy to a new palette. Harmony picker modes.
  → Add "Palette from image" to the colour popover (great for matching a reference).
- **Selection:** feathering, add to and subtract from, invert, save and load selections, and
  selection mask visibility.
- **Transform:** uniform, non-uniform (freeform), distort, warp and advanced (mesh), with
  **Magnetics** and snapping in degree steps. → Magnetics belongs in our transform popover.
- **Liquify modes and Clone** (with clone lock and finger or Pencil choice).
- **Time-lapse:** recording quality, on for new documents, export as a video, and disable it per
  document. → It matches the time-lapse plan, plus a per-project off switch for privacy.
- **Canvas:** crop and resize, resample, canvas info, presets and custom sizes. → It matches
  the Actions → Canvas plan.
- **Pressure & Smoothing** is an app-wide page (pressure curve, sensitivity, StreamLine
  amount and pressure, stabilisation), with a reset. → One page in Preferences, not per brush.

## Painterly animation

Painting each frame, like Dreams or paint-on-glass, not only ink-and-colour cels:

- **Painted frames.** A drawing on a track can be a small paint stack (several layers in one
  frame). The rail still shows it as one cell. Double-tap it to paint it in Draw with every
  Procreate tool, with the neighbouring frames' onion skin visible there too. Done goes back to
  the same frame.
- **Paint over the last frame.** + Frame can start from a copy of the previous frame (an option
  next to "on 2s"). Most painterly animation repaints the previous frame rather than starting
  blank.
- **Lightbox.** The previous and next frames show at low opacity in full colour (not tinted),
  so colour and texture can be matched. It's a third onion style next to the tinted ones.
- **Texture that boils or holds.** A brush option: grain moves with each frame (a living,
  painterly boil) or stays fixed to the canvas (steady texture). The Film grain and Texture
  effects already cover the whole shot.
- **Smudge and blend across a frame's layers**, and wet mix, so frames can be truly painted.
- **Memory:** painted frames cost more. Lite caps layers per frame (for example 3) and warns
  early. The residency system parks frame layers as it does drawings today.

## Combined drawing workflow (requested 2026-10-22)

The user wants a mode that combines drawing lines and painting: after drawing lines, the app
detects newly enclosed areas and fills them automatically. This is a drawing workflow, in
addition to the track types below; merely keeping Line and Paint in one track does not satisfy it.

Proposed name: **Ink & Paint — Auto Paint**. Draw with Brush or Vector; on pen-up, detect areas
that this stroke newly enclosed and paint underneath the ink. Keep Line and Paint separate
internally for editing, undo, masks and exports, while presenting one combined drawing experience.

Implementation requirements:
- An open stroke does not flood the background. Existing enclosed areas are not recoloured just
  because a later stroke was drawn elsewhere. Existing paint is preserved.
- The closing stroke and its automatic paint are one undo/redo step and autosave as one edit.
- Honour selections, locked layers, masks and residency. Mask editing, erasing and smudging do
  not trigger automatic painting. Predicted pointer points never define a committed enclosure.
- Detection runs after the stroke, without delaying live ink. Check the cost on Lite and large
  pages before enabling it broadly; do not assume the current tap-fill operation is cheap enough
  to scan a whole page after every stroke.
- Include raster and vector outlines, shapes closed across multiple strokes, cancelled strokes,
  undo/redo and save/reopen in verification. Gap closing needs a conservative, explicit rule.

Approved after My Assets and QuickMenu on 2026-10-23. Initial proposed default: black ink and the selected
colour for automatic paint; both colours remain editable. The user expressed no strong colour
preference. Auto Paint's first version is **implemented**, opt-in through Options or a configured
QuickMenu action. It uses only the active drawing's raster/vector ink, a fixed alpha barrier of 24,
no gap closing, and before/after border connectivity. Existing paint is retained byte-for-byte;
selections limit painting without serving as walls, and fully masked pixels are excluded. Ink,
paint and QuickShape replacements use one History command. Detection runs after the committed
stroke, with no pre-stroke page scan, and is capped at 1280×720 page pixels in Lite and 2048×2048
in Full. Cancelled input, mask editing, erasing, smudging and Alpha Lock do not trigger paint.
The on/off and ink-colour preferences are device-only; normal Line/Fill files need no schema change.
Other-layer references, gap closing, gradient automatic paint and worker-based scanning remain later work.

## Track types: Ink & Paint, Plain, Painted

Line + Fill stays, but becomes one choice, not the only way. **+ Track** asks which kind of
track (and remembers the last choice):

| Type | What it is | Fill |
|---|---|---|
| ✏️ **Plain** (the neutral default) | one paint surface per drawing, like Procreate or Dreams | fills on the same surface. Mark another track as **Reference** to fill using its lines. |
| 🖋 **Ink & Paint** (today's Line + Fill) | lines on top, colour underneath, kept apart | fills go under the lines automatically |
| 🎨 **Painted** | each drawing is a paint stack (see Painterly) | per layer, as in Draw |

- Change type anytime from the track menu. Ink & Paint → Plain merges the two (looks the same).
  Plain → Ink & Paint puts everything on the line, with an empty fill.
- The Line/Fill switch only appears for Ink & Paint tracks, so students who never use it never
  see it. This also removes the paint-target label from the canvas.
- Saved per track in `io/schema.ts`; existing tracks open as Ink & Paint (no change).

## Backgrounds and assets: painted in Draw, placed in Animate, moved in Motion

Each of the three modes has one job for the same picture:

1. **Draw: create it.** New asset makes a background, prop or character sheet as a **Picture**, a paint
   stack with its own layers. Pictures live in the project's **Pictures** shelf (a small
   library), automatically available locally without exporting/importing. One picture can be
   used in many shots. Edit it once and linked placements update. Draw also offers an optional
   flipbook for frame-based assets and simple animation.
2. **Animate: place it.** Drag a picture from the shelf onto the rail (or + Track → 🖼 Picture).
   It becomes a **static track**: one long bar held for the whole shot, locked by default so
   you can't draw on it by mistake. You animate over and under it. Double-tap the bar to open
   it in Draw. Its position and size can be set here (Transform), but not animated.
3. **Motion: move it.** The same track gets keyframes: pan, zoom, parallax, effects. For a
   **multiplane** look, "Split into layers" turns a picture's layers into separate depth
   tracks (sky, hills, trees) that each move at their own speed.

So yes: backgrounds are static in Animate and animatable in Motion. Placing a picture in Animate
is what lets you draw against it. Performance recording (Dreams) can still move it live from
Animate, which writes Motion keys.

Today's background paint stacks (`cel`-linked layers) migrate into Pictures (step 5).

## Showing and hiding: fast and the same everywhere

Toggling tracks and layers on and off must be one gesture and must react everywhere at once:

- **One visibility state.** The rail, the Layers panel and Motion all read and write the same
  `visible` flag and redraw together. No mode keeps its own list. (Today the flipbook's
  "always shown" rules and the Others setting can disagree with what Layers says.)
- **Swipe the eyes.** Drag down the column of eye boxes on the rail (or in Layers) to hide or
  show every track you pass, as in Photoshop. The first box decides: hide or show.
- **Solo.** Press and hold an eye, or Alt + click it, to show only that track. Do it again to
  bring everything back exactly as it was.
- **Groups toggle together.** A group's eye hides or shows all of its tracks, and the children
  keep their own states inside.
- **One-tap filters in the rail header:** 🖼 hide all pictures (backgrounds), 📝 hide notes,
  📐 hide guides, the most common "get it out of my way" toggles.
- **Lock works the same way:** a lock column next to the eyes, which you can also swipe.
- **Toggles are not undo steps.** Showing and hiding is how you look at the work, not an edit.
  It's saved with the project, but Undo skips it, so undoing a stroke never brings back a
  track you just hid.
- **Hidden tracks are easy to read:** dimmed rows with a crossed eye, and a ⋯ to collapse all
  hidden rows when the rail gets long.
- Keys: V (show/hide, have), Alt+V solo, Shift+V show all.

## Story: faster boards, a real animatic, a clean handoff

Story already has panels with shot, camera, dialogue, action and notes, an animatic
timeline, a PDF and shot-list export, and Blender markers. To make it the fast first step:

1. **Three views of one board (the priority).** One toggle in the Story header switches
   **Grid · Strip · Present**. All three show the same panels; nothing is copied.
   - **Grid:** the wall of panels, as big thumbnails with the shot number and the first line
     of the caption. Drag to reorder (others slide aside). Pinch to change how many fit per row
     (2 to 8). Tap a panel to select it; double-tap to draw it. Hold for its menu (duplicate,
     insert before or after, delete, "Animate this"). Scenes fold here (see 6).
   - **Strip:** the animatic timeline, one row of panels sized by their length. Drag a panel's
     edge to time it, with snapping to seconds, and scrub to play. It uses the same rail as
     Animate (pinch zoom, momentum, lift-and-drag), so it feels the same.
   - **Present:** full screen, panels playing at their timing with the dialogue and action
     shown underneath (captions can be turned off). Tap to pause, swipe for the next or
     previous panel. Made for pitching to the class.
   - The panel editor (drawing and caption fields) is a side sheet over Grid or Strip, not a
     separate screen. Fields keep their size while typing.
   - Each view remembers its zoom and scroll; Story opens in the last view used.
2. **Draw panels with the same tools.** The one tool engine works in panels: sketch right in the
   panel, or double-tap it to draw full screen in Draw and come back.
3. **Script to panels.** Paste a script (plain or Fountain): each scene heading starts a scene
   and each action or dialogue line makes a panel with its caption filled in.
4. **Shot and camera stickers.** Shot types (WS, MS, CU, OTS, POV) as quick chips, and camera-move
   arrows (pan, tilt, zoom, truck) you drag onto a panel. They fill the Camera field and show
   in the PDF.
5. **Simple panel moves for the animatic.** A Ken Burns pan or zoom per panel (two handles:
   start and end frame), so the animatic moves without going to Motion.
6. **Scenes.** Group panels into scenes with a colour label. The grid folds by scene, and the
   shot list numbers shots per scene (1A, 1B…), matching the Blender markers.
7. **Framing guides.** Aspect-ratio masks (16:9, 2.39:1, 4:3, 9:16), title and action safe
   areas, and rule of thirds. They also show in Animate and print in the PDF.
8. **Panel → shot in one tap.** "Animate this" opens Animate with the panel as a locked rough
   track (a guide), at the panel's length, so key poses start on the board drawing.
9. **Export, consolidated** in Share's cards: board PDF (1, 3 or 6 per page), animatic video with
   captions burned in, shot list (CSV), Blender.

Not planned (decided 2026-10-21): scratch audio recording per panel, teacher/peer review
notes on panels.

Order: 1 (views) first, then 3 (script to panels) and 8 (panel → shot), then the rest.

## More consolidation (Procreate's shape, with 2Dope's extras)

1. **One Actions menu (🔧), Procreate's tabs:** Add · Canvas · Share · Video · Preferences ·
   Help. Every scattered menu folds into it: the ☰ menu, the Full top bar's extras and the
   settings dialogs.
   - **Add:** photo, file (PSD, ORA, GIF, image sequence), text, a picture from the shelf, audio.
     It replaces the separate import buttons.
   - **Canvas:** size, fps, length, background colour, guides. One place, instead of spread
     across Story and Timing.
   - **Video:** time-lapse replay and export.
   - **Preferences:** interface (Simple / Advanced), handedness, button size, gestures, pencil
     pressure curve, Lite, autosave.
2. **Tap a tool again for its library.** Tap Brush once to pick it and again to open the brush
   library, as Procreate does. The same goes for Smudge, Eraser and Colour. Separate "library" and
   "settings" buttons go away.
3. **Every panel is the same panel.** One popover component (title, optional tabs, a handle to
   dock it in Advanced) for Layers, Colour, Brushes, Effects, Onion, View and Actions. Students
   learn it once.
4. **Selection and Transform are temporary modes.** While one is active, its small toolbar
   appears at the bottom; tap the tool again (or Done) and it disappears. Nothing about them
   stays on screen otherwise.
5. **Each brush remembers its size and opacity** (Procreate does). Double-tap the size or
   opacity slider to type a value, and press and hold a slider to add a favourite size.
6. **Time-lapse replay.** Record the drawing process automatically (cheap: the strokes are
   already recorded). Play it back from Video and export it. Students love it, and teachers get
   evidence of the process for marking.
7. **Gallery like Procreate's:** stacks (drag one project onto another), swipe for Share /
   Duplicate / Delete, and a press and hold to preview the animation playing in its thumbnail.
8. **Share as cards:** 🎓 Hand in, 🎞 GIF, 🎬 Video, 🧊 Blender, 🖼 Frames. One tap uses the
   last settings, and ⋯ on a card opens its options. Fewer forms.
9. **Timing stays its own mode (decided 2026-10-21)** for teaching with X-sheets. To avoid
   doubling, Timing owns the X-sheet and the exact frame counts. Animate's rail owns drawing and
   rough timing (trim, move). Both edit the same exposures, so a change in one shows in the
   other at once. Timing's toolbar holds only timing tools, not drawing tools.
10. **Help where you are.** Press and hold any button for its name and a one-line tip, with
    "More in the manual" (opens the right section). Hold ⌘ / Ctrl on a keyboard to see the
    shortcuts for the current mode (iPadOS style).
11. **A one-screen first run.** Choose Simple / Advanced and handedness, then pick a template
    (class preset, blank, sketch). That's it; no tour.

## One home per action (remove the redundancy)

**Rule:** in each mode, every action has **one** button home. It can also have a gesture and a
key, but no second button somewhere else. Context menus (press and hold) may repeat an action
because they appear only where you touch.

Doubles seen while building (to confirm with a full audit in step 3; each line says where it
should live):

| Action | Where it is today | One home |
|---|---|---|
| Play / pause | flipbook header, timeline strip, Timing transport, Full top bar | the rail header in Animate, the transport in Timing and Motion |
| Previous / next / + Frame | flipbook header **and** the strip row above the timeline | the rail header |
| Onion skin | flipbook header, strip row, bubble options | the rail header (its popover holds the settings) |
| Share / export | Share mode, the Full top bar's Share, the menu's "Share and export…" | Share mode only, plus an ⤴ in Actions that opens it |
| Layer opacity / blend / rename / effects | Layers panel, flipbook track menu, Motion layer options | the Layers panel. The track menu keeps only track things (hide, colour tag, move, delete) and links to Layers. |
| Frame options (duplicate, insert, clear) | strip "More", flipbook frame menu, X-sheet | the frame's hold menu on the rail; the X-sheet keeps its own grid edits |
| Line / Fill | the label on the canvas, bubble buttons, X | one Line/Fill switch in the brush popover (Ink & Paint tracks only), plus X |
| Fit view | flipbook Fit button, F, the view menu | the View panel, plus F and a quick pinch |
| Effects | bubble, layer options, track menu | the Effects panel (opened from Layers) |

Two layouts (Simple / Advanced) reading one control list is what keeps this from creeping back:
a control is listed once, with one zone.

## Smooth UI everywhere

The same feel rules as the rail, for every panel and button:

- **Nothing jumps.** No bar changes height and pushes the canvas around. Popovers float over it.
  The canvas fit only changes when you ask (or rotate the device). Reserve space for things
  that come and go, or overlay them.
- **Short, consistent motion.** Popovers and panels open with one shared 150 ms ease (scale
  from their button, fade). Lists reorder with a slide. Mode switches cross-fade in about 200 ms
  and keep the canvas still. With "Reduce motion" set on the device, everything is instant.
- **Instant response.** A button shows pressed on touch-down (not on release). Expensive work
  (thumbnails, saves, rebuilding lists) runs after the gesture or when idle, never during a
  stroke, drag or pinch.
- **Update, don't rebuild.** Panels change only the rows that changed (today several panels
  rebuild everything on every change: the flipbook strip, layer cards, effects). Long lists
  (brushes, layers, frames) only draw what's visible.
- **A frame budget.** UI work per frame stays under 4 ms on desktop (so an iPad keeps 60 fps),
  measured with a small debug overlay (frame time, long tasks) that's dev-only.
- **One look.** One set of sizes (touch targets ≥ 44 px), radii, spacing and icon sizes, as CSS
  tokens, instead of per-panel values. That's what makes the screen feel balanced.

## The rail (flipbook timeline): smooth like Dreams

This is the part students touch most in Animate, so it needs to feel physical: zoom, pan and
move things at 60 fps on an iPad, with the content following the fingers exactly.

### What holds it back today (from the code)

- **Zoom rebuilds everything.** `zoomTo()` clears the signature and `build()` recreates every
  track row, cell and thumbnail canvas for the whole shot, on every pinch step. That's fine on
  a desktop and a short shot, but it will stutter on an iPad with a long shot.
- **Pinch only zooms.** Two fingers can't zoom and pan at the same time, and there's no
  momentum, so a flick stops dead.
- **Drawings can't be picked up and moved.** You can trim the end of a hold, but you can't drag
  a drawing to another time or track, drag several at once, or trim the start.
- **Scrubbing and scrolling compete.** One-finger swipes scrub time, the ruler sets the
  playhead, and the strip scrolls natively, so a gesture sometimes does the other thing.

### The design

- **Draw the rail on a canvas** (one `<canvas>` for the cells and ruler, with a thin DOM layer for
  the track headers). Zoom and pan become a transform. Only the visible frames are drawn, and
  thumbnails come from a cache, so the cost doesn't grow with the length of the shot.
- **Gestures, like Dreams:**
  - Two fingers: pinch to zoom time **and** drag to pan, together, anchored under the fingers.
    Pinching vertically changes track height (Dreams' row size).
  - A flick pans with momentum and a soft edge bounce.
  - One finger on empty rail: scrub (unchanged). On the ruler: set the playhead.
  - **Touch and hold a drawing to lift it** (it pops up slightly). Then drag it in time or to
    another track. Other drawings slide aside if ripple is on. Release to drop, as one undo
    step.
  - **Tap more drawings while one is lifted** to carry several together.
  - **Trim both ends:** handles on the left and right of the selected drawing. A second finger
    gives free trim (as now).
  - Dragging near the left or right edge auto-scrolls, faster the closer you get.
  - **Snapping:** to frames always, and to the playhead, other drawings' edges and the play
    range, with a small tick when it snaps. Moving fast skips the magnets.
- **The rules that make it feel solid:**
  - The thing under your finger never jumps. Zoom anchors there, drags keep the grab offset.
  - Everything animates for 120–180 ms (cells sliding aside, a drop settling), never snaps
    instantly. A drag-in-progress follows the finger with no animation.
  - A gesture commits once, on release, as one undo step. No rebuilds while a finger is down.
  - A clear "zoom level" range, from a whole shot on screen to one frame filling ~140 px. A quick
    pinch-in fits the shot (as now); a double-tap on a drawing zooms to it.
- **Mouse and keyboard:** the wheel scrolls, Ctrl or Alt + wheel zooms at the pointer, and a
  drag moves drawings the same way (Alt + drag = free trim).

### How we know it's good

- A test page with a 1,000-frame shot, 8 tracks and real thumbnails. Pinch, pan and drag hold
  60 fps on desktop Chromium with CPU throttled 4×, as a stand-in for an iPad.
- Unit tests for the move, trim-both-ends and snapping maths (pure functions in
  `core/timeline.ts`, as `addFrameHere` and `fillHold` are today).
- Then a real iPad check with Pencil and fingers before it ships.

This should come **right after the Draw / Animate split (step 4)**, before the new Dreams
features, because performance recording, keyframes in Animate, play range and cycles all
sit on this rail.

## Lite (minimalist)

Lite is for phones and older tablets. It uses the same zones with fewer things in them:

- Top right: Brush, Eraser, Colour, Layers. Top left: Gallery and one ⋯ menu. No adjustments
  or effects buttons; they live in ⋯.
- No left sidebar: size and opacity are a small two-row popover from the brush button.
- Animate: the mini flipbook only (one track row, Play, + Frame, Onion).
- Fewer brushes shown (a starter set) and no live effects preview, which keeps memory and CPU low.
- Always Simple (no Advanced). Focus still works; docked panels are off.

## Last fixes for simplicity

1. **"Why can't I draw?" answered on the canvas.** When a stroke can't land (locked layer,
   hidden layer, a picture track, an empty mask, the frame past the end in a timeline view),
   show one line where the pencil touched, with a fix button: "Layer is hidden · Show it",
   "Locked · Unlock". Drawing on a hidden layer never silently does nothing. This covers most
   "layers don't react" reports.
2. **Always know where you're drawing.** The Layers button shows the active layer's thumbnail
   and name (and, on Ink & Paint tracks, a small Line/Fill mark). It's the one place, instead of
   a floating label on the canvas.
3. **Popovers get out of the way.** Any open popover closes the moment the pencil touches the
   canvas, and the stroke still draws (today some panels have to be closed first).
4. **One icon rule.** Line icons for tools and buttons (consistent weight and size). Emoji only
   for things you pick from (Share cards, track types, effect names, the Add menu). In Simple,
   buttons show an icon and a short word; in Advanced, an icon (with the word on hold).
5. **A quiet tint per mode.** Each mode has a subtle accent (the mode button and selection
   colour), so it's always clear which "app" you're in without reading.
6. **Portrait and landscape.** On an iPad in portrait, the rail gets shorter rows and the
   sidebar shrinks; the zones stay the same. Rotating never loses the selection or zoom.
7. **Empty states that point forward.** An empty track, board or gallery shows one line and
   one button for the next step ("Draw your first frame", "Add a panel", "New project").
8. **Defaults over switches.** Toggles almost nobody changes (ripple, auto new frames, snapping)
   are on by default and live in their panel's ⋯, not on the main bars.
9. **Autosave you don't watch.** No "Saving…" flashes; a small ✓ in Actions shows the last save,
   and a warning appears only if saving fails.
10. **Reset the interface.** Preferences → Reset layout and settings, for when a docked layout
    or a student's changes get confusing.
11. **Accessibility basics.** Contrast that passes WCAG AA in light and dark, visible
    keyboard focus, labels for screen readers, and touch targets of at least 44 px.

## Ideas from the app packages

**Simpler to use (go into Phase 2, the layout):**

1. **A modifier button (⎇) for touch.** It's the square in the left sidebar. Hold it and touch
   the canvas for the eyedropper. Held during a drag, it does what Alt or a second finger does
   today: free trim, a perfect QuickShape, keeping a layer pinned. One on-screen key gives
   tablet users every modifier trick without a keyboard. Gesture controls can assign other
   actions to it.
2. **Auto-hide the interface while drawing.** Bars and the sidebar fade during a stroke and come
   back after a short delay (Preferences: off, 0.5 s, 1 s, 2 s). On by default in Focus.
3. **"Fit canvas inside the interface"** (View panel). The canvas fits in the free space,
   or uses the whole screen under the bars. This replaces the per-bar CSS offsets
   (`--top-clear`, `--fit-top`, `--flip-h`, `--tools-bottom`) that cause the "fit doesn't clear
   the toolbar" bugs: one function measures the free rectangle.
4. **Timeline editing with the pencil only** (option, Dreams). When on, fingers on the rail
   only scroll and zoom, and resting hands can't move or trim frames.

**Features (go into Phases 3, 5, 6 and 8):**

5. **Convert layers to tracks.** A layered Draw picture becomes one track per layer in Animate,
   in one tap. It's the Draw → Animate handoff (Phase 3).
6. **Fill layer.** A solid-colour layer, filling the canvas, that takes its colour from a swatch.
   It's the simplest background (Phase 5).
7. **Colour per frame or scene.** A palette attached to a frame or a Story scene (Procreate's
   per-frame palette). It gives a colour script in Story and keeps characters consistent in
   Animate (Phase 6).
8. **Sample projects.** Two or three small projects in the gallery: a bouncing ball, a walk
   cycle and a short storyboard. They're open to explore and copy, and teach faster than the
   manual (Phase 8).
9. **A few bundled fonts** with open licences (OFL) for text layers and Story captions, so titles
   look the same on every school iPad (Phase 5, with Text).
10. **Small animated tips, not videos.** The five first-run topics (welcome, draw, gestures,
    keyframes, perform), each as a short animated demo drawn by the app or a small looping
    animation. Dreams uses about 58 MB of video for this; we stay light, especially in Lite
    (Phase 8).

**Bigger, later (Phase 9):**

11. **GPU compositing.** Both apps composite on the GPU (Metal). Once the rail is done, run a
    trial of WebGL2 (WebGPU where Safari supports it) for layer compositing and effects, keeping
    Canvas 2D as the fallback, and measure it on an iPad. Painted frames, many tracks and live
    effects are where Canvas 2D will run out.

Further digging into the packages isn't planned: the UI text and layouts were the useful part.

## Quick cleanup of what's there now (checked in the app, 2026-10-21, Simple level, desktop)

Small fixes that don't wait for the redesign:

1. **Timing shows most controls twice.** The top bar has hold 1–4, − / +, Key / Breakdown /
   In-between, Play, Onion, New / Duplicate / Delete. The X-sheet panel repeats hold 1–4, − / +,
   K / B / I and onion, and the bottom strip repeats Play, New, Duplicate, Delete and Onion. →
   The top bar keeps only the timing tools (hold, marks). The X-sheet panel keeps its grid and
   the frame actions. The bottom strip keeps the transport. Each control appears once.
2. **"Fill" means two things in Draw.** The paint-bucket tool and the Fill plane (next to Line)
   have the same name, side by side. → Rename the plane **Paint** (Line / Paint, matching the
   "Ink & Paint" track type) everywhere: buttons, tooltips, the manual and the X key's notice.
3. **The transport is in a different order in each mode.** Draw: Play, ◀, ▶. Motion: ◀, Play,
   ▶. Timing: Play in the top bar and again at the bottom. → One transport component (◀ Play ▶
   and the frame count) in the same place in every mode.
4. **Ambiguous icons.** Motion's "look through the camera" uses an eye (the same eye as show /
   hide), and auto-key is a bare diamond. In the mode bar, Timing (a grid) and Motion (↔) are
   hard to tell apart. → A camera viewfinder icon for camera view, "Auto-key" written on its
   button, and mode buttons with their emoji and the name under the icon at Simple (📋 Story,
   ✏️ Draw, ⏱ Timing, 🎬 Motion, 📤 Share).
5. **Draw's tool row is ten buttons on one side.** Brush, Smudge, Vector, Eraser, Fill, Select,
   Adjust, Colour, Layers and Reference all sit at the top right. → Move Select and Adjust to the
   top left now (Procreate's split: document actions left, painting tools right). It's the first
   step of the new layout.
6. **The "🖌️ Brushes" chip repeats the Brush button.** → Tapping Brush again opens the library
   (Procreate) and the chip goes away.
7. **The flipbook's track box hides the track name.** The 46 px eye/tick box sits over the
   name ("Drawing" is barely visible). → The name beside the box, cut off with … if long, with
   the full name on hold.
8. **Undo and redo are dim** at the bottom of the sidebar, though they're the most used buttons.
   → Full contrast, and the same size as the eyedropper.
9. **A pink chip under Motion's tools looks like a button** ("Move from start"). → Hints get
   their own quieter style (outline, no fill) so they never look tappable.
10. **The canvas shrinks when a side sheet opens** (Timing's X-sheet). → The sheet floats over
    the canvas edge in Simple, or docks without refitting in Advanced (the refit is what makes
    the page jump).

These can ship before Phase 1 or alongside it; each is small and visible to students.

## Roadmap (each step its own commit, with tests and the build each time)

**Phase 0: quick cleanup** (see above, items 1–10)

**Phase 1: make what's there behave**
1. Fix rendering: paint the active layer through the same compositor as every other layer
   (Line and Fill into a scratch canvas, then layer opacity, blend and mask applied once). Drop
   the 25 % floor. Add a render test.
2. One renderer: move the live-stroke overlay into `composite.ts`, so Draw, Animate and Motion
   show layers identically.
3. One visibility state, swipe the eyes, solo, toggles that are not undo steps.
4. "Why can't I draw?" messages (Last fixes 1) and the Layers button showing where you draw.

**Phase 2: the layout**

5. A per-mode control list (zone; Simple, Advanced or both), driving the bubbles, the Advanced
   bar and Lite. The mode button, the left sidebar, popovers instead of the options bar, and the View
   panel. Simple / Advanced switch, Focus view.
6. The redundancy audit ("One home per action"), the Actions menu, the shared panel component,
   motion and size tokens, the icon rule, and the smooth-UI rules (update, don't rebuild).
6b. The ⎇ modifier button, auto-hide while drawing, one "free rectangle" fit in place of the CSS
    offsets, and pencil-only timeline editing (Ideas 1–4).

**Phase 3: the split**

7. Add `'animate'` to `Workspace`. Keep canvas/drawing tools in both modes: Draw has the fuller
   painting/asset workflow and an optional flipbook; Animate has simplified tools and a
   Flipbook/Clips toggle over the same shot. Reuse the current flipbook; do not remove it from
   Draw. Timing keeps the X-sheet. Existing projects remain intact and can open in Animate.
8. Track types (Plain, Ink & Paint, Painted) in `io/schema.ts`.
9. New asset in Draw and the local Assets/Pictures shelf; add a linked asset in Animate,
   reopen it in Draw, edit/add layers and return without a manual file round trip. Support
   held pictures first and preserve optional asset frames. Migrate old background stacks only
   with compatibility/round-trip checks. Convert layers to tracks is a separate explicit action.

**Phase 4: the rail**

10. The canvas-drawn rail with Dreams gestures (pinch-pan, momentum, lift-and-drag, trim both
    ends, snapping, auto-scroll), and the 1,000-frame performance test.

**Phase 5: Draw like Procreate**
11. The Procreate layers panel in Draw; Advanced docked panels.
12. Tool gaps from the checklist (adjustments, selection modes, transform modes, text,
    colour tabs, Reference layers, Fill layer, Text with bundled fonts), one at a time.
13. QuickMenu, recent brushes and colours, ColorDrop, hold to select the layer, brushes that
    remember their size, tapping a tool again for its library, gesture controls.

**Phase 6: Animate like Dreams**

14. Quick wins: play range (first version built 2026-10-23), animate on 2s and 3s, the onion popover, colour per frame or scene.
15. Keyframes in Animate. Performance recording was excluded by the user on 2026-10-23.
16. Cycles, draw while it plays, track groups, snapping, audio scrub, a quick camera.

**Phase 7: Story**

17. Grid · Strip · Present views.
18. Script to panels, then "Animate this".
19. Shot and camera stickers, scenes, framing guides, panel moves, export cards.

**Phase 8: finishing**

20. Painterly animation (painted frames, paint over the last frame, lightbox, boiling grain).
21. Lite pass, time-lapse replay, Gallery stacks, search, help on hold, the first-run screen
    with animated tips, class presets, sample projects.

**Phase 9: performance**

22. GPU compositing trial (WebGL2, then WebGPU), with Canvas 2D as the fallback, measured on an iPad.

Every phase: update the manual and UPDATES. Every phase that touches input or layout: a test
in the browser on a separate origin, and an iPad pass (Pencil, memory, Lite) before pushing.

## Decided

- **Mode switching: one mode button at the top-left (option B).** `[✏️ Draw ▾]` sits next to
  Gallery and opens the list of the six modes. Next to it, a small ✏️ / 🎞 toggle flips between
  Draw and Animate in one tap. Lite has the button only. There is no permanent row of modes.
- **The guiding principle.** Each mode feels like its own app for one production step (story,
  painting, animating, timing, compositing, delivery), with only that step's controls on
  screen. They share one project, so moving between them is seamless. When deciding where a
  control goes: if it doesn't serve this step, it isn't in this mode's bars. It's one mode away.

## Still to decide

- Should Fill stay one tap away at Focus? Students fill a lot; in Procreate it is a colour drag.
  Proposal: drag the colour dot onto the canvas fills (Procreate's ColorDrop) at every level,
  and the Fill button shows in Advanced.
