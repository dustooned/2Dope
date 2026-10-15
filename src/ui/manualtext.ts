/**
 * The student manual and the update notes, as data (rendered by ui/manual.ts). Plain words,
 * short steps. Keep it in step with the app: when a feature changes, change its section here and
 * add a line to UPDATES.
 */

/** A block of a section: a paragraph, a list of steps or tips, or a table of keys/gestures. */
/** `keys` rows may name an icon (a toolbar icon or a gesture glyph) shown before the label; `figure` is a picture from ui/manualfigs.ts. */
export type Block = string | { list: string[] } | { steps: string[] } | { keys: [string, string, string?][] } | { tip: string } | { figure: string };

export interface ManualSection {
  id: string;
  title: string;
  blocks: Block[];
}

export const MANUAL: ManualSection[] = [
  {
    id: 'overview',
    title: 'What 2Dope is',
    blocks: [
      '2Dope is a free 2D animation app that runs in your browser, made first for iPad and pencil, and also for computers and phones. You can plan a shot with a storyboard, draw it frame by frame, time it, put it together with moves and a camera, and export it as images, a storyboard PDF or a package for Blender.',
      'Everything you make is saved on this device automatically. Nothing is uploaded.',
      'The app has four workspaces, one for each stage of the work. Switch between them with the buttons at the top:',
      {
        list: [
          'Board: plan the shot. Panels with pictures, dialogue, action and timing (an animatic).',
          'Draw: draw your frames. Brushes, vector pen, fill, eraser, colours, layers.',
          'Time: change timing. Holds, frame order, notes, onion skin, the X-sheet.',
          'Motion: put it together. Move, scale and turn layers with keyframes, the camera, groups, Line and Fill parts.',
        ],
      },
      { figure: 'workspaces' },
      'All four show the same shot and the same clock. A change in one shows up in the others straight away.',
    ],
  },
  {
    id: 'start',
    title: 'Getting started',
    blocks: [
      {
        steps: [
          'Tap Projects (top left) to see your projects. Tap New to start one: pick a size and frame rate, or keep the defaults.',
          'You start in Draw. Draw on the page with your pencil (or mouse).',
          'Tap + Frame (or press N) for the next drawing. The faint drawings around yours are the onion skin.',
          'Press Play (or Space) to watch it.',
          'When it moves the way you want, use Menu > Export sequence to save it as PNG images.',
        ],
      },
      { tip: 'Want to plan first? Open Board and tap Start a storyboard. Want to just draw? Skip Board, it is optional.' },
      'Finger painting is off on iPad so your palm does not draw: the pencil draws and fingers move the page. Turn on Menu > Finger paints to draw with a finger.',
    ],
  },
  {
    id: 'gestures',
    title: 'Touch gestures',
    blocks: [
      {
        keys: [
          ['Two fingers: pinch, drag, twist', 'Zoom, move and turn the page', 'pinch'],
          ['Two-finger tap', 'Undo', 'tap2'],
          ['Three-finger tap', 'Redo', 'tap3'],
          ['Three-finger scrub', 'Clear this drawing fast (undo brings it back). The page does not move', 'scrub3'],
          ['Four-finger tap', 'Hide or show the interface', 'tap4'],
          ['Press and hold (or right-click)', 'A menu for what you are holding: a frame, a panel, a layer, the canvas', 'hold'],
          ['Hold the pencil at the end of a stroke', 'QuickShape: the stroke snaps to a shape (see Draw)', 'shape'],
          ['Hold and drag a number', 'Scrub the value up or down (Motion). Tap it to type instead', 'scrub'],
        ],
      },
    ],
  },
  {
    id: 'board',
    title: 'Board: storyboard and animatic',
    blocks: [
      'The board is where you plan. Each panel is a rough picture with its timing and notes. The board plays under your drawing as a guide and never shows in your final export (unless you ask it to).',
      { figure: 'board' },
      {
        steps: [
          'Open Board and tap Start a storyboard (or Import board images to turn pictures into panels).',
          'Draw the panel on the canvas above the cards.',
          'Type in the card: Dialogue (what is said), Action (what happens), Slugging (timing notes) and Notes.',
          'Press Return to jump to the same box on the next panel, so you can type a whole scene of dialogue in one go. Shift+Return makes a new line.',
          'Set how long a panel lasts with the number on its card (in frames).',
          'Tap + Panel (or press N) for a new panel. Duplicate, Delete and the arrows move panels around.',
          'Press Play to watch the animatic. Dialogue shows as subtitles.',
        ],
      },
      'Animate this shot takes you to Draw with the board showing faintly underneath, on the panel you were looking at. The first time, your animation layer gets one blank drawing per panel, each as long as its panel, so your frames start in step with the board. Yellow P1, P2… marks above the frame bar show where each panel starts.',
      { tip: 'Board and animation stay in sync (with Ripple on): make a panel longer and the animation under it gets longer too; add frames to the animation and the board panel makes room.' },
      {
        list: [
          'Export (in the Board bar) saves the storyboard as a PDF (2, 4 or 6 panels a page, Letter or A4) or as PNG images with a captions spreadsheet (CSV).',
          'In Draw, the Layers button lets you show, fade or hide the board.',
          'To put the board in your final export, tick Include the storyboard in Export sequence.',
        ],
      },
    ],
  },
  {
    id: 'draw',
    title: 'Draw',
    blocks: [
      'Draw is just for drawing: brushes, colours and layers. The bar at the bottom shows your frames.',
      {
        keys: [
          ['Brush (B)', 'Pixel brushes: pencil, ink, brush pen, fine liner, pixel ink and more. Pressure and tilt work with a pencil.', 'brush'],
          ['Pen (P)', 'Vector lines: always crisp, can be resized later without going blurry.', 'pen'],
          ['Eraser (E)', 'Erases pixels. On vector lines it cuts up to where lines cross (change this in the eraser options).', 'eraser'],
          ['Fill (G)', 'Fills areas closed by your lines. Tap or drag across areas, lasso around them, or brush over leftover gaps.', 'fill'],
        ],
      },
      'The circle at the top right is your colour. Tap it for the colour panel: a hue ring around a saturation / brightness square (Disc), or H, S, B sliders and a hex box (Values); the colour before and now (tap the old half to go back); Recent colours; and a Palette (+ adds the current colour, hold a swatch to remove it). System… opens your device’s own picker.',
      'The sliders on the left are brush size and opacity, with undo and redo under them.',
      { figure: 'linefill' },
      {
        tip: 'Line and Fill: every drawing has a Line part and a Fill part. Fill paints under your lines, so colouring never covers the ink. The LINE | FILL switch in the toolbar (or X) picks which one brushes paint on; a yellow FILL badge on the canvas reminds you when you are painting colour. In Layers, the layer you draw on shows its LINE and FILL with an eye each.',
      },
      'QuickShape: draw a line, circle, box or triangle roughly and keep the pencil still at the end. It snaps to a clean shape and keeps the pressure you drew with, thick and thin. Keep holding and move to adjust it: the start stays put and the pencil drags the other end. Touch a second finger (or hold Shift) to make it perfect: a circle, a square, an even polygon or a straight angle. Turn it off in the Brush panel under Assist.',
      { figure: 'quickshape' },
      { figure: 'onion' },
      {
        list: [
          'Flipbook mode: past your last drawing there is a blank page. Draw on it and a new frame is made for you.',
          'Onion skin (O) shows the drawings before and after. Lock (L) pins a frame so you can flip back to it.',
          'Layers: the Layers button shows your other layers around the one you draw on: Show, Fade or Hide them. Tap a layer to draw on it; the eye hides it, the lock protects it.',
          'Fill options: fill across the next drawings at once, close small gaps in your lines, and Use lines from other layers (ink on one layer, colour on another: the fill stops at the ink).',
          'Vector lines thicker or thinner after drawing: press and hold the canvas, then pick −50% … +100% under Vector lines.',
          'Brush panel (Menu > Brush / X-sheet panel): every brush setting, anti-aliasing (off gives hard pixel edges) and line smoothing.',
          'Steady lines (Brush panel > Stroke): StreamLine tidies slow strokes; Stabilisation steadies fast ones; Motion filter removes hand shake, and Expression gives some natural wobble back; Post-correct smooths the line after you lift.',
        ],
      },
    ],
  },
  {
    id: 'time',
    title: 'Time: timing and the X-sheet',
    blocks: [
      { figure: 'holds' },
      'Time is for changing when things happen. The X-sheet (exposure sheet) on the right lists every frame: which drawing shows and for how long.',
      {
        list: [
          'A hold is how many frames a drawing stays on screen. Drag the edge of a drawing in the frame bar, or press + and − (or 1, 2, 3, 4 to set it).',
          'Split (scissors) cuts a held drawing at the playhead: the frames after it get a copy to redraw as a new key.',
          'On touch, tap Select, then tap frames to add or remove them; tap Select again when done.',
          'Select frames, then Duplicate (D), Delete, Copy, Cut and Paste (Ctrl+C / X / V), or Alt+arrows to move them.',
          'On touch: press and hold a frame to select it, then drag to move it, or use the buttons that appear.',
          'Write notes and dialogue on frames in the X-sheet.',
          'The bar above the X-sheet holds onion skin settings, marks and the switches for each layer.',
        ],
      },
      { figure: 'ripple' },
      {
        tip: 'Ripple (on by default): when you make something longer or shorter, everything after it moves too, on every layer, so nothing slips out of sync. Switch it with the Ripple button or Shift+R. Hold Alt to do one edit without ripple.',
      },
      'While you drag an edge, or type a new length, a yellow line marks the frame you are changing, with a label like "out 24 · +3f". The shaded part is what will move.',
      'Tap any time readout to switch between frames, seconds + frames, and timecode. The rulers follow.',
    ],
  },
  {
    id: 'motion',
    title: 'Motion: putting the shot together',
    blocks: [
      { figure: 'motion' },
      'Motion is the last stage: each layer is a bar on the timeline, and you can move, scale, turn and fade it over time with keyframes.',
      {
        list: [
          'Tap a layer on the canvas to select it. Drag it to move it; the box hugs the drawing. Use the handles to scale and turn.',
          'Values (position, scale, rotation, opacity) can be typed, or held and dragged to scrub them.',
          'Keyframes: change a value at another frame and a key is made; the layer moves smoothly between keys.',
          'Line and Fill parts: each drawings layer has Line and Fill rows, so you can fade, tint or offset the ink and the colour separately.',
          'Drag the ends of a bar to trim a layer; Split (Ctrl+Shift+D) cuts a layer at the playhead.',
          'Group layers into a precomp (a shot inside a shot) and reuse it. Play it once, looped or back and forth.',
          'Add a camera to pan, zoom and turn across the whole shot.',
        ],
      },
    ],
  },
  {
    id: 'export',
    title: 'Saving and exporting',
    blocks: [
      'Your work saves itself on this device as you go. Menu > Versions… lets you go back to an earlier restore point.',
      {
        list: [
          'Export .2dope: a backup file of the whole project. Keep it safe or move it to another device (Import .2dope…).',
          'Export frame (PNG): the frame you are on, with a transparent background.',
          'Export sequence…: the whole shot as numbered PNG images in a .zip. Choose passes (everything, lines only, fills only, matte), size and background.',
          'Board > Export: the storyboard as a PDF or as panel images with a captions spreadsheet.',
          'Export for Blender: a package Blender opens with the 2Dope add-on (image planes, camera, groups, keyframes).',
        ],
      },
      { tip: 'Browsers can clear saved data if a device runs out of space. Export a .2dope backup now and then, especially before a deadline.' },
    ],
  },
  {
    id: 'device',
    title: 'Phones and older tablets (Lite mode)',
    blocks: [
      '2Dope checks what your device can handle. On phones and older tablets it starts in Lite mode: smaller pages, fewer drawings kept in memory, fewer onion skins and a shorter undo history, so it stays smooth.',
      'Change it in Menu > Device: Auto, Lite or Full. The change applies the next time 2Dope opens.',
    ],
  },
  {
    id: 'keys',
    title: 'Keyboard shortcuts',
    blocks: [
      {
        keys: [
          ['Space', 'Play / pause (hold Space and drag to move the page)'],
          ['← →', 'Previous / next frame'],
          ['↑ ↓', 'Next / previous drawing'],
          ['N', 'New frame (new panel in Board)'],
          ['D', 'Duplicate'],
          ['Delete', 'Delete the selected frames'],
          ['+ −, 1–4', 'Longer / shorter hold, or set it'],
          ['B, P, E, G', 'Brush, Pen, Eraser, Fill (Shift+G changes the fill mode)'],
          ['[ ]', 'Smaller / bigger brush'],
          ['X', 'Paint on Line or Fill (Shift+X shows the X-sheet)'],
          ['O, L', 'Onion skin, lock frame'],
          ['F, Shift+1, 0, H', 'Fit, 100%, straighten, flip the view'],
          ['Ctrl+Z, Ctrl+Shift+Z', 'Undo, redo'],
          ['Ctrl+C / X / V', 'Copy, cut, paste frames'],
          ['Alt+← →', 'Move the selected frames'],
          ['Shift+R', 'Ripple on / off (hold Alt for one edit)'],
          ['Shift (QuickShape)', 'Make the snapped shape perfect'],
          ['Tab, Shift+Tab', 'Quick Animate, hide the interface'],
          ['?', 'This manual'],
        ],
      },
    ],
  },
];

/** What changed, newest first. Add a line when something students would notice ships. */
export interface Update {
  date: string;
  title: string;
  items: string[];
}

export const UPDATES: Update[] = [
  {
    date: '2026-10-12',
    title: 'Storyboard export, QuickShape, ripple and this manual',
    items: [
      'Animate this shot lines your frames up with the board: one drawing per panel, same lengths, and P1, P2… marks above the frame bar. Board and animation timing stay in sync.',
      'QuickShape keeps your pressure (thick and thin) and adjusts from the start point.',
      'Board and animation stay in step both ways: adding or retiming frames in Draw (flipbook too), trimming a layer\'s end in Motion, or retiming the Board moves the other; deleting the first panel no longer shifts the shot before frame 0 (older projects are repaired when opened).',
      'Time has the frame bar with play and step controls; Draw has Split and touch Select.',
      'Every new project starts with its setup (name, size, frame rate), also the very first one and after deleting your last project.',
      'Procreate-style steady lines: Stabilisation, Motion filter and Expression join StreamLine in the Brush panel.',
      'LINE and FILL are clearer: always-labelled switch, a FILL badge on the canvas, Line / Fill rows in Layers, same names everywhere.',
      'Colour panel: hue ring and square, H/S/B sliders and hex, recent colours and a palette you build. Tap the colour circle.',
      'Fill can use the lines on your other layers (Brush panel > Fill > Use lines from other layers).',
      'Vector lines can be made thicker or thinner after drawing (press and hold the canvas).',
      'Typed lengths and + / − show the yellow edit line for a moment too.',
      'Three-finger scrub clears the drawing fast (undo brings it back); the page never moves while three fingers are down.',
      'The manual now has pictures: tool and gesture icons and small diagrams.',
      'Manual and What’s new (you are reading them): Menu > Manual, or press ?.',
      'QuickShape: hold the pencil at the end of a stroke to snap it to a line, arc, ellipse, rectangle or polygon. Drag to adjust from the start point; a second finger makes it perfect.',
      'Board > Export: storyboard PDF (2, 4 or 6 panels a page) or panel PNGs with a captions spreadsheet.',
      'Export sequence can include the storyboard.',
      'Ripple: making something longer or shorter moves everything after it on every layer. Shift+R switches it; Alt skips it once.',
      'One time format everywhere (frames, seconds + frames, timecode): tap a time readout to switch. Rulers on every timeline.',
      'Edit lines: a yellow line and label show the frame you are changing while you drag.',
    ],
  },
  {
    date: '2026-10-11',
    title: 'Board, workspaces, fill and ink',
    items: [
      'Board workspace: storyboard panels with dialogue, action, slugging and notes, played as an animatic with subtitles.',
      'Workspaces each have one job: Board plans, Draw draws, Time times, Motion puts it together.',
      'Layers in Draw: see the other layers around the one you draw on (Show, Fade, Hide).',
      'Fill: tap or drag across areas, lasso, leftover gaps, and fill across the next drawings.',
      'Crisp ink brushes (Ink, Brush Pen, Fine Liner, Pixel Ink) and a vector eraser that cuts to crossings.',
      'Line and Fill parts you can fade, tint and offset in Motion. Split a layer at the playhead.',
      'Press and hold anywhere for a menu; flipbook mode makes new frames as you draw; Lite mode for phones and older tablets.',
    ],
  },
];
