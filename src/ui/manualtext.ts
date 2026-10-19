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
      '2Dope is a free 2D animation app that runs in your browser, made first for iPad and pencil, and also for computers and phones. Plan a shot with a storyboard, draw it frame by frame in a flipbook, time it, put it together with moves, a camera and effects, then watch it and share it as a video, GIF, pictures, a storyboard PDF or a package for Blender.',
      'Everything you make is saved on this device automatically. Nothing is uploaded.',
      'The mode bubbles at the top left take you through a shot, one stage at a time:',
      {
        list: [
          '🗂️ Story: plan the shot. Panels with pictures, dialogue, action, timing, shot and camera notes (an animatic).',
          '✏️ Draw: draw frame by frame in the flipbook, with every drawing tool, layers and tracks.',
          '🎞️ Timing: holds, marks and the X-sheet. No brushes here: drag on the page to scrub, tap it to play.',
          '↔️ Motion: put it together. Move, scale and turn layers with keyframes, the camera, groups, Line and Fill colours and effects.',
          '📤 Share: watch the movie, check it, then save or send it.',
        ],
      },
      { figure: 'workspaces' },
      'All of them show the same shot and the same clock. A change in one shows up in the others straight away.',
      {
        list: [
          'How much the screen shows: tap the round button at the top right (○ ◐ ●). Focus is just the canvas, a few tools and the flipbook; Simple adds the mode and tool bubbles; Full is every control, with the classic top bar.',
          'Lost a panel or a bar? Press and hold that same button: the screen goes back to how it started (nothing in your project changes).',
          'A bar that does not fit shows ‹ › at its ends: tap them to slide along, or swipe the bar.',
        ],
      },
    ],
  },
  {
    id: 'start',
    title: 'Getting started',
    blocks: [
      {
        steps: [
          'Tap the menu (☰, top left) > Projects to see your projects, or New project to start one: pick a size and frame rate, or keep the defaults.',
          'You start in Draw with the flipbook along the bottom. Draw on the page with your pencil (or mouse).',
          'Tap + Frame for the next drawing. The faint drawings around yours are the onion skin.',
          'Tap Play in the flipbook (or press Space) to watch it. Tap it again to pause.',
          'When it moves the way you want, open 📤 Share, check the preview and tap Make.',
        ],
      },
      { tip: 'Want to plan first? Open 🗂️ Story and tap Start a storyboard. Want to just draw? Skip it: Story is optional.' },
      'On iPad the pencil draws and fingers move the page, so your palm never draws. To draw with a finger, turn on Menu > Finger paints.',
      'Stuck? Menu > Manual opens this guide (or press ?), and Menu > What’s new lists the latest changes.',
    ],
  },
  {
    id: 'gestures',
    title: 'Touch gestures',
    blocks: [
      'On the page:',
      {
        keys: [
          ['Two fingers: pinch, drag, twist', 'Zoom, move and turn the page', 'pinch'],
          ['Two-finger tap', 'Undo', 'tap2'],
          ['Three-finger tap', 'Redo', 'tap3'],
          ['Three-finger scrub', 'Clear this drawing fast (undo brings it back). The page does not move', 'scrub3'],
          ['Four-finger tap', 'Hide or show the interface', 'tap4'],
          ['Press and hold (or right-click)', 'A menu for what you are holding: the canvas, a frame, a panel, a layer, a track', 'hold'],
          ['Hold the pencil at the end of a stroke', 'QuickShape: the stroke snaps to a shape (see Draw). A second finger makes it perfect', 'shape'],
          ['In Timing: drag on the page', 'Scrub through time; a tap plays or pauses', 'scrub'],
        ],
      },
      'In the flipbook (Draw):',
      {
        keys: [
          ['Swipe the tracks left or right', 'Move through time (left goes forward). A quick swipe goes further', 'scrub'],
          ['Tap or drag the frame numbers', 'Jump the playhead there; drag and it follows your finger', 'scrub'],
          ['Flick the frame numbers to the left', 'Back to frame 1 and play', 'scrub'],
          ['Pinch the tracks', 'Zoom time in or out. A quick pinch in shows the whole shot', 'pinch'],
          ['Double-tap the frame numbers', 'Zoom in there', 'tap2'],
          ['Tap a frame', 'Go there and draw on that track. Tap the current frame again for its options', 'tap2'],
          ['Press and hold a frame', 'Frame options: duplicate, insert, split, fill to the end, hold length, copy, paste, clear, delete', 'hold'],
          ['Drag the pink handle on the current frame', 'Make it last more or fewer frames; the frames after it move along', 'scrub'],
          ['Drag the pink handle with a second finger down (or Alt)', 'Free trim: the next drawing gives or takes the frames, so everything after it stays put', 'scrub'],
          ['Tap a track’s box', 'Hide or show the track. Hold it for track options; drag it up or down to reorder', 'hold'],
          ['Drag the bar on top of the flipbook', 'Float a mini flipbook anywhere; drag it to the bottom or double-tap the bar to dock it', 'pinch'],
        ],
      },
      'In panels and lists:',
      {
        keys: [
          ['Layers: swipe a layer right', 'Add it to the selection (then Group, Merge, Hide, Duplicate, Delete)', 'scrub'],
          ['Layers: swipe a layer left', 'Quick actions: Lock, Duplicate, Delete', 'scrub'],
          ['Layers: hold a layer, then drag', 'Move it up or down the stack', 'hold'],
          ['Layers: two-finger tap a layer', 'Its options, opacity first', 'tap2'],
          ['Effects: drag ☰, swipe a card left', 'Reorder effects; Duplicate, Merge down, Reset, Delete', 'scrub'],
          ['Brushes: drag a brush sideways', 'Move it onto a collection (a built-in brush is copied)', 'scrub'],
          ['X-sheet: slide a hold sideways', 'Make that drawing longer or shorter; tap it to type the number', 'scrub'],
          ['Motion: hold and drag a number', 'Scrub the value up or down. Tap it to type instead', 'scrub'],
          ['Reference: drag its top, drag its corner', 'Move it, resize it. Swipe the picture to step through your pictures', 'pinch'],
        ],
      },
    ],
  },
  {
    id: 'board',
    title: 'Story: storyboard and animatic',
    blocks: [
      'Story is where you plan. Each panel is a rough picture with its timing and notes. The storyboard plays under your drawing as a guide and never shows in your final movie unless you ask it to.',
      { figure: 'board' },
      {
        steps: [
          'Open 🗂️ Story and tap Start a storyboard (or import pictures to turn them into panels).',
          'Draw the panel on the canvas above the cards.',
          'Fill in the card: 🎬 Shot (say “Sc 1 · Sh 2”), 🎥 Camera (type it, or pick Wide, Close-up, Pan left, Dolly in…), 💬 Dialogue, 🏃 Action, ⏱ Timing and 📝 Notes.',
          'Press Return to jump to the same box on the next panel, so you can type a whole scene in one go. Shift+Return makes a new line.',
          'Set how long a panel lasts with the number on its card (in frames).',
          'Tap + for a new panel; the other bubbles duplicate, delete, import pictures, play the animatic and export.',
        ],
      },
      {
        list: [
          'Three views: Panels shows the cards; Timeline shows the panels on the clock with the audio underneath; Both shows the two.',
          'In Timeline: drag the right edge of a panel to make it longer or shorter (everything after it moves too); drag a panel sideways to move it; tap to go there; press and hold for its menu. Pinch or Ctrl / ⌘ + wheel zooms time.',
          'A sound linked to a panel moves with it: drag it on the Timeline to line it up.',
        ],
      },
      'Animate this shot takes you to Draw with the storyboard showing faintly underneath. The first time, your animation gets one blank drawing per panel, each as long as its panel, so your frames start in step with the board.',
      { tip: 'Board and animation stay in step: make a panel longer and the animation under it gets longer too; add frames to the animation and the panel makes room.' },
      {
        list: [
          'Export (the last bubble, or Share > Storyboard): a PDF (2, 4 or 6 panels a page, Letter or A4) or the panel pictures with a captions spreadsheet. Shot and Camera are in both.',
          'For 3D: Share > Blender takes the storyboard along as timeline markers in Blender (one per panel, named with its shot and camera) and a “2Dope storyboard” text with every caption, ready to block the key poses.',
        ],
      },
    ],
  },
  {
    id: 'draw',
    title: 'Draw and the flipbook',
    blocks: [
      'Draw is for drawing. Under the canvas is the flipbook (as in Procreate Dreams): one row per track, each frame of time a cell, held drawings stretched over their frames, the current frame in pink.',
      {
        list: [
          'Play / Pause, ‹ › previous and next drawing (hold for the first or last frame), the frame count, + Frame, Onion, + Track, Fit and Timeline are along its top.',
          '+ Frame adds a new drawing right after the current one ends (after its whole hold). Hold + Frame to end the hold at the playhead instead.',
          'Drawing past the end of a track makes a new frame right there; the drawing before it holds up to it.',
          '+ Track adds a track right above the one you draw on, starting as one frame at frame 1. Every track shows while you draw on any of them.',
          'Hold a track’s box for its options: show or hide, opacity, blend, a colour tag, clipping mask (show only over the track below), a mask to paint (paint hides, the eraser shows), rename, effects, move up or down, duplicate and delete.',
          'Prefer a classic timeline? Tap Timeline at the end of the flipbook; 📖 Flipbook on the timeline brings it back.',
          'Mini flipbook: drag the bar on top of the flipbook upward. It floats anywhere with Play, frames, + Frame, Onion and the track you draw on, and the page gets the whole height. Drag it to the bottom, or double-tap the bar, to dock it.',
        ],
      },
      'The tools (bubbles at the top right; in Full, the top bar):',
      {
        keys: [
          ['Brush (B)', 'Pixel brushes: pencil, ink, brush pen, fine liner, pixel ink and more. Pressure and tilt work with a pencil.', 'brush'],
          ['Smudge', 'Drag the paint under your stroke along.', 'brush'],
          ['Vector pen (P)', 'Crisp lines you can resize later without going blurry.', 'pen'],
          ['Eraser (E)', 'Erases pixels; on vector lines it cuts up to where lines cross.', 'eraser'],
          ['Fill (G)', 'Tap or drag across regions to fill them, one colour or a gradient.', 'fill'],
          ['Select', 'Freehand, rectangle, ellipse or automatic; then move, transform, copy, fill or delete what you selected.', 'fill'],
          ['Adjust', 'Hue, saturation, brightness or blur of this drawing.', 'brush'],
          ['Colour', 'The colour circle: tap for the colour panel.', 'fill'],
        ],
      },
      'The bar under the tools shows the options of the tool you have: brush library, Line or Fill, symmetry and guides for brushes; fill styles for Fill; selection modes for Select.',
      {
        tip: 'Brush library: tap 🖌️ Brushes (or the tool you are already using). Brushes come in Sketching, Inking, Painting, My brushes and your own collections, each with a preview stroke; the list scrolls. Tap to use one, double-tap for all its settings (Studio). ＋ Save brush keeps the brush you tuned. ＋ New makes a collection (hold it to rename or delete). Drag a brush sideways onto a collection to move it there, or hold a brush for Move to, Copy to, Duplicate, Rename and Delete. ⤓ Import brings in Procreate (.brushset, .brush) and Photoshop (.abr) brushes; a set gets its own collection.',
      },
      'The colour circle opens the colour panel: a hue ring around a saturation and brightness square (Disc), or H, S, B sliders and a hex box (Values); before and now (tap the old half to go back); recent colours; and palettes (+ adds the colour, hold a swatch to remove it). I (or the dropper on the left) picks a colour from the page.',
      'The sliders on the left are brush size and opacity, with undo and redo under them.',
      { figure: 'linefill' },
      {
        tip: 'Line and Fill: every drawing has a Line part and a Fill part. Fill paints under your lines, so colouring never covers the ink. Choose LINE or FILL in the options bar (X switches). The label on the canvas shows which layer and part you are painting on; tap it for Layers.',
      },
      {
        list: [
          'Gradient fills: in Fill options pick Linear or Radial and a second colour (Swap flips them). After a fill, drag the round handles to set where it starts and ends; tap ✓ (or do anything else) to keep it, ✕ to cancel.',
          'Fill options also fill the next drawings at once, close small gaps in your lines, fill Leftovers (missed specks), and Use lines from other layers (ink on one layer, colour on another).',
          'Selection: Select, then draw around what you want (or a rectangle, an ellipse, or tap for automatic). Then Transform to move, scale, rotate or flip it (Apply keeps it as one undo step, Cancel puts it back), or copy, fill or delete it.',
          'Symmetry and guides (in the brush options): mirror as you draw, or draw along a grid, perspective or isometric guide. Hold the guide button to place it.',
          'Onion skin (O) shows the drawings before and after. Lock (L) pins a frame so you can flip back to it.',
          'Vector lines thicker or thinner after drawing: press and hold the page, then pick −50% … +100% under Vector lines.',
          'Steady lines (Studio > Stroke): StreamLine tidies slow strokes, Stabilisation steadies fast ones, Motion filter removes hand shake.',
        ],
      },
      'QuickShape: draw a line, circle, box or triangle roughly and keep the pencil still at the end. It snaps to a clean shape and keeps the pressure you drew with. Keep holding and move to adjust it. Touch a second finger (or hold Shift) to make it perfect. Edit shape (at the top) switches it to another shape, or Keep my stroke undoes the snap.',
      { figure: 'quickshape' },
      { figure: 'onion' },
      'The 🖼️ Reference bubble (also Menu > Reference) opens a small window you can move and resize, as in Procreate. 🖼️ Images shows pictures you add (+, or drop them on it; several at once): step through them with ‹ ›, a swipe or the arrow keys, and 💧 then tap one to take its colour. 🎨 Canvas shows the whole frame, live, while you work zoomed in. The pictures stay for this session only.',
    ],
  },
  {
    id: 'layers',
    title: 'Layers, backgrounds and notes',
    blocks: [
      'The Layers bubble (or the label on the canvas) opens the layer cards: front layer on top, each with a picture of the frame on screen, its name and an eye.',
      {
        list: [
          'Tap a layer to draw on it; tap the one you draw on for its options: opacity, blend, Line and Fill, Alpha Lock, Clipping mask, Reference (fills use its lines), Edit mask, and tiles for Fill, Clear, Flip, Mask, ✨ Effects, Select, Group, Merge, Art layer, Duplicate, Rename, Lock and Delete.',
          'Swipe layers right to select several (Ctrl- or Shift-click with a mouse): a bar offers Group, Merge, Hide or Show, Duplicate and Delete. The layer you draw on stays the main one, and Motion sees the same selection.',
          'Others (the eye at the top of Layers) shows, fades or hides the other layers while you draw. In the flipbook every track always shows.',
          '+ adds a layer: Animation (a track with its own frames), Background, Object, 📝 Notes or Media.',
        ],
      },
      'Backgrounds are paint stacks, as in Procreate: 🖼️ Background shows with its layers under it. Tap + Paint layer to add another on top and tap any of them to paint on it. Each has its own opacity, blend, clipping and alpha lock; Merge down joins two. The stack’s eye hides it all; its arrow folds it away. A drawing with art layers (🎞️) works the same way.',
      '📝 Notes is a layer for corrections: a teacher or a classmate draws over your animation in red. Notes always show while you work and never go into a video, GIF, PNG or Blender export. + Frame in the flipbook gives a frame its own note.',
      {
        list: [
          'Bring in art (+ Media, in Layers or the Motion bar): pictures (PNG, JPG, WebP), movies (one drawing per frame, with their sound), sounds, and animated GIFs (frame by frame, each frame held as long as in the GIF).',
          'Layered pictures keep their layers: Photoshop .psd (also saved by Procreate, Krita, Clip Studio, Affinity and GIMP) and OpenRaster .ora come in as a paint stack with each layer’s name, opacity, blend, visibility and clipping. One whose bottom layer fills the page goes to the back as a background. Save CMYK or compressed PSDs again as plain RGB if they will not open.',
        ],
      },
    ],
  },
  {
    id: 'time',
    title: 'Timing and the X-sheet',
    blocks: [
      { figure: 'holds' },
      'Timing is only for timing and review: no brushes. Drag on the page to scrub through time; tap it to play or pause. The X-sheet (exposure sheet) on the right lists every frame: which drawing shows and for how long.',
      {
        list: [
          'A hold is how many frames a drawing stays on screen. In the options bar tap ⏱ Hold 1, 2, 3 or 4 (frames, not seconds), or − and + to change it by one. The keys 1–4 and + − do the same.',
          'Mark drawings as 🔑 Key, Breakdown or In-between; the marks show in the X-sheet and the onion skin.',
          'In the X-sheet: tap the drawing number of the selected row to change which drawing shows; slide a row’s Hold sideways to make it longer or shorter, or tap it for − and + and a box to type in.',
          'Select frames (tap Select, then tap frames; Shift-click with a mouse), then Duplicate (D), Delete, Copy, Cut and Paste (Ctrl+C / X / V), or Alt + arrows to move them.',
          'Split cuts a held drawing at the playhead: the frames after it get a copy to redraw.',
          'Write notes and dialogue on frames in the X-sheet. The bar above it holds onion skin settings and the layer switches.',
        ],
      },
      { figure: 'ripple' },
      { tip: 'Ripple (on by default): make something longer or shorter and everything after it moves too, on every layer, so nothing slips out of step. Shift+R switches it; hold Alt for one edit without it.' },
      'While you drag an edge or type a new length, a yellow line marks the frame you are changing. Tap any time readout to switch between frames, seconds + frames and timecode.',
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
          'Tap a layer on the page to select it; drag it to move it; the handles scale and turn it.',
          'Values (position, scale, rotation, opacity) can be typed, or held and dragged to scrub them. With Auto-key on, every change writes a keyframe at the playhead. Move from start keeps where things were at the first frame, so they move from the start instead of jumping to the first key.',
          'Easing (Keyframes, easing and view options): Linear, Ease in, Ease out, Ease in and out, or Hold.',
          'Line and Fill rows under each drawing layer: fade, offset or recolour the ink and the colour separately. Tap ▬ for one colour, again for ◢ Linear and ◎ Radial gradients with a second colour; hold the row for the direction and to add a ✨ texture to just that part.',
          'Drag the ends of a bar to trim a layer; Split cuts it at the playhead. ↑ Up and ↓ Down change the order.',
          '+ Anchor adds an invisible anchor other layers can follow (a null). Group layers into a group (a shot inside a shot) and play it once, looped, back and forth, or on one frame.',
          'Add a camera to pan, zoom and turn across the whole shot; Look through the camera shows what it sees.',
          '📖 Flipbook opens the selected drawing layer in Draw’s flipbook.',
        ],
      },
      'Effects (✨ in Motion, or a layer’s Effects tile): 〰️ Line boil, 🌊 Ripple, 📺 Film grain, 🧻 Texture (paper, hatching, dots, canvas) and 👾 Retro pixels (old-console colours and dot patterns). Each works on the Line, the Fill or the whole layer.',
      {
        list: [
          'The Effects card is a stack, like layers: the top runs first. Tap an effect’s name to open its settings; its switch turns it on or off.',
          'Drag ☰ to reorder; swipe a card left (or tap ⋯) for Duplicate, Merge down (two of the same join, their amounts add up), Reset and Delete.',
          'Simple shows each effect’s main slider; Advanced shows every setting (what it works on, size, how often it changes, patterns).',
          'Effects show in Motion, in Share and in every export; Draw shows your clean drawing while you work.',
        ],
      },
    ],
  },
  {
    id: 'audio',
    title: 'Audio',
    blocks: [
      'Sound plays on the same clock as everything else. Each sound is a row under your layers with its waveform.',
      {
        steps: [
          'Tap + Media (or + Audio) and pick a file (WAV, MP3, M4A, OGG or FLAC, up to 2 minutes). Sounds start at frame 1.',
          'Tap a sound for its card: Start frame, Source in and out (trim, in seconds), Volume and Mute. Enter applies a typed value; Escape cancels it.',
          'Link current panel ties the sound to the storyboard panel you are on: move or retime the panel and the sound goes with it. Handy for dialogue.',
        ],
      },
      'Hear while scrubbing: tick the box in the Audio lane to hear a short slice of sound at each frame as you scrub.',
      { tip: 'Audio is saved in the project and in .2dope files, and it goes into videos. GIFs, animated PNGs and PNG frames are pictures only.' },
    ],
  },
  {
    id: 'export',
    title: 'Share, saving and handing in',
    blocks: [
      '📤 Share is where you watch the movie and make the file. The preview plays the whole shot (↺ back to the start, Play, and a slider to pick a frame); the Check list says what the file will hold. Pick what to make, set it, tap Make, then Save or Share it.',
      {
        keys: [
          ['Video', 'MP4 (plays everywhere) or WebM, with sound. 720p, 1080p or original size; white, black or see-through (see-through is always WebM).', 'play'],
          ['GIF', 'Loops anywhere; 256 colours, no sound; see-through with hard edges if you tick it.', 'play'],
          ['Animated PNG', 'Loops in browsers and many apps, full colour, soft see-through edges.', 'play'],
          ['PNG frames', 'A ZIP of numbered pictures: everything, lines only, fills only or a matte; any size; start at 1001 for VFX.', 'play'],
          ['Picture', 'This frame as a PNG.', 'play'],
          ['Storyboard', 'A PDF or panel pictures with a captions spreadsheet.', 'play'],
          ['Blender', 'An editable scene package (planes, camera, groups, keyframes, storyboard markers); open it with the add-on inside it.', 'play'],
          ['Project file', 'A .2dope backup of the whole project, to keep or move to another device.', 'play'],
        ],
      },
      'Advanced (under the settings) has the size, quality and file format. 🎓 Hand in puts your name, class and today’s date in the corner of a video, GIF, animated PNG or picture (PNG frames stay clean).',
      'Your work saves itself on this device as you go. Menu > Versions… keeps restore points (one every 10 minutes and before risky edits), and you can save your own with a name and go back to any of them. Menu > Export .2dope and Import .2dope… move a project between devices.',
      { tip: 'Saved work lives in this browser. A private tab, clearing your browser history, or a school iPad that is wiped overnight loses it. Make a Project file in Share at the end of each class, especially before a deadline.' },
    ],
  },
  {
    id: 'device',
    title: 'Phones and older tablets (Lite mode)',
    blocks: [
      '2Dope checks what your device can handle. On phones and older tablets it starts in Lite mode: smaller pages, fewer drawings kept in memory, fewer onion skins, a smaller effects cache and a shorter undo history, so it stays smooth.',
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
          ['← →', 'Previous / next frame (in Reference: previous / next picture)'],
          ['↑ ↓', 'Next / previous drawing'],
          ['N', 'New frame (new panel in Story)'],
          ['D', 'Duplicate'],
          ['Delete', 'Delete the selected frames'],
          ['+ −, 1–4', 'Longer / shorter hold, or set it'],
          ['B, P, E, G', 'Brush, Pen, Eraser, Fill (Shift+G changes the fill mode)'],
          ['I', 'Eyedropper: pick a colour from the page'],
          ['[ ]', 'Smaller / bigger brush'],
          ['X', 'Paint on Line or Fill (Shift+X shows the X-sheet)'],
          ['O, L', 'Onion skin, lock frame'],
          ['F, Shift+1, 0, H', 'Fit, 100%, straighten, flip the view'],
          ['Ctrl+Z, Ctrl+Shift+Z', 'Undo, redo'],
          ['Ctrl+C / X / V', 'Copy, cut, paste frames'],
          ['Alt+← →', 'Move the selected frames'],
          ['Shift+R', 'Ripple on / off (hold Alt for one edit)'],
          ['Enter, Esc', 'Apply or cancel a transform, a gradient or an edit'],
          ['Shift (QuickShape)', 'Make the snapped shape perfect'],
          ['Tab, Shift+Tab', 'Quick Animate, hide the interface'],
          ['?', 'This manual'],
        ],
      },
      'In the flipbook (Draw), these work too:',
      {
        keys: [
          ['N, Shift+N', 'New frame after the drawing you are on, new track above'],
          ['Shift+↑ ↓', 'Track above / below'],
          ['Ctrl+↑ ↓', 'Top / bottom track'],
          ['Shift+← →', 'Back / forward one second'],
          ['Home, End', 'First / last frame'],
          ['S', 'Split the hold at the playhead'],
          ['Shift+F', 'Fill the drawing to the end of the shot (1 makes it one frame again)'],
          ['V', 'Show / hide the track'],
          ['F2', 'Rename the track'],
          ['M', 'Frame options'],
          ['C', 'Put the playhead in the middle'],
          ['Alt+= , Alt+− , Alt+0', 'Zoom time in, out, whole shot'],
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
  { date: '2026-10-19', title: 'Pencil strokes no longer go missing', items: ['A stroke started the moment you reach a frame (while its drawing is still loading, most often on iPad) used to be ignored. Now 2Dope keeps the pencil’s path and paints it as soon as the drawing is ready, quick strokes in order.', 'On iPad, Scribble, the text loupe and double-tap zoom can no longer take over the pencil on the page.'] },
  { date: '2026-10-19', title: 'Flipbook hotkeys and gestures', items: ['Pinch the flipbook to zoom time; a quick pinch in shows the whole shot, and a double-tap on the frame numbers zooms in there. Zoomed far out, frames show as colour and the numbers thin out.', 'Flick the frame numbers to the left to go back to frame 1 and play.', 'Free trim: drag the pink handle with a second finger down (or Alt) and the next drawing gives or takes the frames, so the rest of the track stays put.', 'Keys in the flipbook, after Procreate Dreams: Shift+N new track, Shift+↑↓ change track, Shift+←→ a second, Home / End, S split, Shift+F fill to the end, V hide, F2 rename, M frame options, C centre, Alt+= / Alt+− / Alt+0 zoom.'] },
  { date: '2026-10-19', title: 'A new manual', items: ['The manual is rewritten for how 2Dope works now: the five modes (Story, Draw, Timing, Motion, Share), the flipbook, layers and paint stacks, notes, effects, brushes and collections, Reference, bringing in art from other programs, and handing in.', 'Touch gestures has every gesture in one place: on the page, in the flipbook, and in Layers, Effects, Brushes, the X-sheet, Motion and Reference.', 'Share and export\u2026 in the menu, and Share in the Full top bar, now open Share (the same screen as the Share mode).'] },
  { date: '2026-10-19', title: 'Flipbook: scrubbing and new frames', items: ['The frame numbers above the tracks are a ruler: tap one to jump there, or drag along it and the playhead follows your finger. Swiping the tracks still moves through time, and a quick swipe now goes much further.', '+ Frame adds the new drawing right after the current one ends (after its whole hold). Hold + Frame to end the hold at the playhead instead.', 'A new track starts as one frame at frame 1. Drawing past the end of a track makes a new frame right there, with the previous drawing held up to it.'] },
  { date: '2026-10-19', title: 'Brush collections', items: ['Fixed: with many brushes (after an import) the cards no longer squeeze together; the list scrolls with a finger or the mouse wheel, and so does a long list of collections.', 'The brush library has collections of your own (like Procreate brush sets): tap \uff0b New, and hold a collection to rename or delete it (its brushes go back to My brushes, nothing is lost).', 'Drag a brush sideways onto a collection to move it there; a built-in brush is copied instead. Hold a brush for Move to, Copy to (also into a new collection), Duplicate, Rename and Delete.', 'An imported brush set (.brushset or .abr with several brushes) gets a collection named after the file. Saving a brush while a collection is open saves it there.'] },
  { date: '2026-10-19', title: 'Flipbook tracks', items: ['Fixed: + Track now puts the new track right above the one you draw on and starts it at frame 1 (it used to start at the playhead and land elsewhere). It holds one blank drawing for the whole shot; + Frame makes new drawings on it.', 'Drag a track\u2019s box up or down to move the track, or hold it for \u2191 Move up and \u2193 Move down.', 'Fixed: in the flipbook, picking a track no longer hides the others; every track shows while you draw (as in Procreate Dreams), whatever Others is set to. The timeline view keeps the Others setting.', 'Hold (or right-click) a track\u2019s box for its options: show or hide, opacity, blend, a colour tag, clipping mask, a mask to paint on (paint hides, the eraser shows), rename, effects, duplicate and delete. A tagged track shows its colour; \u21b3 marks a clipped track and \u25d0 a masked one.'] },
  { date: '2026-10-18', title: 'For class: notes and handing in', items: ['Layers + Notes adds a \ud83d\udcdd Notes layer on top for corrections: a teacher or classmate draws over your animation in red. Notes always show while you work (even with Others hidden) and never go into a video, GIF, PNG or Blender export. + Frame in the flipbook gives one frame its own note.', 'Share has \ud83c\udf93 Hand in: tick it and type your name and class; they go in the corner of the video, GIF, animated PNG or picture with today\u2019s date. PNG frames for compositing stay clean.', 'Versions (Menu > Versions\u2026) keeps restore points: one every 10 minutes and before risky edits, or save your own with a name.'] },
  { date: '2026-10-18', title: 'Mini flipbook', items: ['The flipbook has a handle on top (as in Procreate Dreams). Drag it up and the flipbook floats as a small panel you can put anywhere: Play, previous and next drawing, + Frame, Onion and the track you draw on. The page gets the whole height.', 'Drag it back to the bottom, or double-tap the handle, to dock it again. Draw remembers where you left it.'] },
  { date: '2026-10-18', title: 'Bring in art from other programs', items: ['+ Media now takes animated GIFs: they come in frame by frame on a new layer from frame 1, each frame held as long as it was in the GIF.', 'Layered pictures keep their layers: Photoshop .psd (also saved by Procreate, Krita, Clip Studio, Affinity and GIMP) and OpenRaster .ora (Krita, MyPaint, GIMP) come in as a paint stack with each layer\u2019s name, opacity, blend, visibility and clipping. A picture whose bottom layer fills the page goes to the back as a background.', 'PSD: RGB or greyscale, 8 or 16 bits; ZIP-compressed PSDs and CMYK need saving again as plain RGB. Pictures (PNG, JPG, WebP) come in as before.'] },
  { date: '2026-10-18', title: 'Reference window', items: ['Draw has a \ud83d\uddbc\ufe0f Reference bubble (also Menu > Reference), like Procreate: a small window you can drag anywhere and resize from its corner.', '\ud83d\uddbc\ufe0f Images: add several pictures at once (+, or drop them on it) and step through them with \u2039 \u203a, a swipe or the arrow keys. \ud83d\udca7 then tap the picture to take its colour.', '\ud83c\udfa8 Canvas: the whole frame, live, so you see all of it while you draw zoomed in. Pictures stay for this session; they are not saved in the project.'] },
  { date: '2026-10-18', title: 'Storyboard for the hand-off', items: ['Fixed: the storyboard\u2019s text boxes no longer shrink to a sliver while you type (also with an on-screen keyboard); the card scrolls instead and keeps the box you type in in view.', 'Each panel has \ud83c\udfac Shot and \ud83c\udfa5 Camera boxes (Camera offers quick picks: Wide, Close-up, Pan left, Dolly in\u2026). They go into the PDF, the CSV and the panel images.', 'Share > Blender now takes the storyboard to 3D: a timeline marker per panel (named with its shot and camera) and a \u201c2Dope storyboard\u201d text with every caption and picture, ready to block key poses.'] },
  { date: '2026-10-18', title: 'Paint backgrounds in layers', items: ['A background is now a stack of paint layers, as in Procreate. In Layers it shows as \ud83d\uddbc\ufe0f Background with its layers under it; tap + Paint layer to add one on top (Paint 2, Paint 3\u2026) and tap any of them to paint on it straight away.', 'Each paint layer has its own opacity, blend, clipping mask and alpha lock; Merge down joins two of them. The stack\u2019s eye hides or shows all of it, and its arrow folds it away.', 'A drawing with art layers shows the same way (\ud83c\udf9e\ufe0f), and the layers of the stack you paint on always show, even with Others hidden.'] },
  { date: '2026-10-18', title: 'Motion: Fill and Line colours', items: ['In Motion, a layer\u2019s Fill and Line rows can now recolour with a gradient as well as one colour: tap \u25ac for \u25e2 Linear, again for \u25ce Radial, and set the second colour beside it. Hold or right-click the row for the direction (8 ways) and to add a \u2728 texture to just that part.', 'Fixed: a frame whose Fill or Line opacity, offset or colour changes is no longer merged with the held frame before it in exports.'] },
  { date: '2026-10-18', title: 'Draw is the flipbook', items: ['Flip and Draw are one mode now, as in Procreate Dreams: Draw opens with the flipbook under the canvas (frames as pages, tracks, swipe to scrub), with every drawing tool. The modes are Story, Draw, Timing, Motion and Share.', 'Prefer a traditional timeline while you draw? Tap \ud83c\udf9e\ufe0f Timeline at the end of the flipbook; \ud83d\udcd6 Flipbook on the timeline brings it back. Draw remembers your choice.', 'At the Focus level Draw is just the canvas, Brush, Eraser, Fill, Colour and the flipbook (Play, frames, + Frame, Onion).', 'Layers + Animation makes a new track with its own frames.'] },
  { date: '2026-10-18', title: 'Select several layers', items: ['In Layers, swipe a layer right to add it to the selection (Procreate style); swipe again to take it out. With a mouse, Ctrl- or Shift-click. The layer you draw on stays the main one.', 'With more than one picked, a bar offers Group, Merge (layers next to each other with the same frames), Hide or Show, Duplicate and Delete. Motion sees the same selection.', 'The Effects icon is now sparkles \u2728.'] },
  { date: '2026-10-18', title: 'Effects stack like layers', items: ['The Effects card is a scrolling stack like Procreate\u2019s layers. Each effect folds to one row with its name, what it works on and an on/off switch; tap the name to open its settings.', 'Drag \u2630 to reorder (the top runs first). Swipe a card left, or tap \u22ef, for Duplicate, Merge down (two of the same effect join and their amounts add up), Reset and Delete.', 'Simple shows each effect\u2019s main slider; Advanced shows every setting (what it works on, size, how often it changes, patterns). Your choice is remembered.'] },
  { date: '2026-10-18', title: 'Flip works like Procreate Dreams', items: ['Flip is a flipbook docked at the bottom: up to three tracks (your drawing layers, front first) on one frame ruler. Held drawings span their frames; the current one is pink. Swipe the strip to move through time; tap a frame to go there and draw on that track.', '+ Frame adds a page after this frame. On a held drawing the hold ends here; hold the button to add after the whole hold. + Track adds a drawing layer.', 'Tap the current frame again, or press and hold any frame, for its options: Duplicate, Insert, Split here, Fill to the end, Show for 1 to 8 frames, Mark, Copy, Paste, Clear and Delete. Draw\u2019s strip and the X-sheet use the same menu.', 'Drag the pink handle on the current frame to show it for more or fewer frames (one undo step). Tap a track\u2019s box to hide or show it; hold it for track options and effects.', 'Flip is at every interface level (a Flip button in Full\u2019s top bar), and Motion has \ud83d\udcd6 Flipbook to open the selected drawing layer in it.'] },
  { date: '2026-10-18', title: 'Plainer words', items: ['Labels say what they do: Timing\u2019s holds read \u23f1 Hold 1 2 3 4 (frames, not seconds) with \ud83d\udd11 Key, Breakdown and In-between; Motion\u2019s Null is now Anchor and Key at start is Move from start; Flipbook in the strip is New page; Export and finish is \ud83d\udce4 Share.', 'Effects have friendlier names: \u3030\ufe0f Line boil, \ud83c\udf0a Ripple, \ud83d\udcfa Film grain, \ud83e\uddfb Texture and \ud83d\udc7e Retro pixels, with colours and dot patterns described in plain words.', 'Timing\u2019s bar is shorter: frame by frame stays on the bar under the canvas.'] },
  { date: '2026-10-18', title: 'Layout polish', items: ['Fixed: the Play bubble could not pause playback (it was rebuilt on every frame, so taps were lost). It now shows Pause while playing.', 'The page now always fits clear of the floating tool options (Timing’s holds, Fill’s gradient bar) and of the layer label, at every interface level.', 'On an upright tablet the tool row moves under the mode row instead of overlapping it.'] },
  { date: '2026-10-18', title: 'More layer effects', items: ['Layer effects now include Noise (film grain that changes every frame), Texture (paper, hatching, dots or canvas weave in a fill) and Turbulent displace (rippling, swirling distortion) and Dither (retro limited colours: 1-bit, Game Boy, CGA, EGA, C64, ZX Spectrum, PICO-8, with ordered and error-diffusion patterns and a chunky pixel size), next to Line boil. Open a drawing layer\u2019s Effects card to add them.'] },
  { date: '2026-10-18', title: 'Full level has everything', items: ['At the Full interface level the chosen tool\u2019s options now show at the top of the canvas too (gradient styles and handles, selection modes, symmetry, guides, Adjust, Smudge, Timing holds, Motion easing), the top bar has Smudge, Select and Adjust, and Layers opens the layer cards (groups, masks, effects, Line and Fill) at every level.', 'Full level: with the top bar hidden or its tools folded, the mode and tool bubbles show instead, and the Tools button brings the whole bar back.'] },
  { date: '2026-10-18', title: 'Gradient handles', items: ['After a gradient fill its handles stay on the canvas, like in Affinity: drag the start (your colour) or the end (the second colour) to change it, or drag the line between them to move the whole gradient. Changing either colour, or Linear / Radial, updates it. Done (or a tap elsewhere, or another tool) keeps it as one undo step; Cancel or Undo puts the area back.'] },
  { date: '2026-10-18', title: 'Gradient fills', items: ['The Fill bar has Solid, Linear and Radial. A gradient runs from your colour to the second colour (the circle next to them; Swap changes them round). Tap an area to fill it top to bottom (Radial: from its middle), or tap and drag to set the direction (Radial: from the centre to the edge), shown as you drag; one undo step. Fill selection, ColorDrop and Fill across use the gradient too.'] },
  { date: '2026-10-18', title: 'Effects: line boil', items: ['Layers can have effects. Open them from the fx bubble in Motion, Effects… in a layer’s ⋯ menu, or the Effects tile in the layer cards. Line boil makes lines wobble like hand-drawn boil: aim it at the Line, the Fill or the whole layer; set Amount and Size; choose how often it changes (every frame, on 2s, 3s or 4s); New pattern picks a different wobble. Effects show in Motion, on the other layers in Draw, in Share and in every export; the layer you draw on stays clean while you draw.'] },
  { date: '2026-10-18', title: 'Flip, Draw and Timing each do one job', items: ['Flip is now a full flipbook (like Procreate Dreams): every drawing tool, Line and Fill, the layer cards with clipping masks and visibility; a new layer there belongs to every page. Draw keeps drawing with the timeline; its Flipbook button moved under More.', 'Timing is for timing and review only: no brushes. Drag across the canvas (one finger, the pen or the mouse) to scrub, tap it to play or pause; two fingers still move the view. Its bubbles are Play, Onion, New drawing, Duplicate, Delete and Layers; its bar has holds (1s to 4s, \u2212 / +), K / B / I marks and frame stepping.', 'X-sheet: each drawing shows its hold in the Hold column. Slide the number sideways to change it, or tap it for \u2212, a number and +. Tap the drawing number of a selected drawing to change which drawing shows there.'] },
  { date: '2026-10-18', title: 'Every export in Share', items: ['Share lists every format: Video, GIF, Animated PNG, PNG frames (a ZIP), Picture (this frame), Storyboard, Blender and Project file. Each shows its main choice; Advanced holds the rest (size, quality, passes, numbering, file name).', 'See-through output: Video can be see-through as WebM (where the browser can encode it), Animated PNG keeps full colour and soft see-through edges, and PNG frames and Picture are see-through by default. The preview shows a checkerboard where it will be see-through.'] },
  { date: '2026-10-18', title: 'Easier to get around', items: ['Bars that scroll sideways show arrows at their ends: tap one to move along, hold it to keep going (swiping still works).', 'Quick Animate (⚡) has an Exit button at the start of its bar, and no longer switches itself on for small screens.', 'Hold the interface button (top right) to reset the screen: Simple level, Quick Animate and Flip off, panels closed, the timeline back. Your work is unchanged.'] },
  { date: '2026-10-18', title: 'Share mode', items: ['Share is the last mode bubble (after Motion): watch the whole shot as it will come out, with its sound; choose Video or GIF and their settings; read the checks (hidden layers, muted sound, sound past the end, a very short shot); then Make it, watch the result, and Save it or Share it (the share sheet on iPad: Photos, AirDrop, Classroom). More formats has PNG frames, the storyboard, Blender and a project backup.'] },
  { date: '2026-10-18', title: 'Colour dynamics and wet mix', items: ['Brush Studio > Colour and wet mix: Hue, Saturation and Brightness jitter make the colour vary on every dab (or once per stroke with the switch), like Procreate\u2019s Color dynamics. Wet mix: pull picks up the colour already on the canvas as you paint over it. Imported Procreate brushes bring these settings across when they have them.'] },
  { date: '2026-10-18', title: 'Brush import: more brushes, closer look', items: ['Procreate brushes that use Procreate’s own round shape now come in (they were skipped), Reset backups inside a set are no longer read as extra brushes, and one unreadable file inside a set no longer stops the rest. There is no 60-brush limit per file any more.', 'Grain pictures come across and texture the paint like Procreate’s grain (with its depth and scale); Invert shape and Invert grain are honoured; pressure opacity, size and opacity jitter, Rotation (follow the stroke), roundness, tapers and StreamLine map where the brush has them. Photoshop brushes get their preset names, size and spacing.', 'My brushes are now kept in the browser’s database instead of its small settings storage, so big imports no longer disappear after a reload.'] },
  { date: '2026-10-17', title: 'Fewer buttons in Select', items: ['The selection shape (Freehand, Rectangle, Ellipse, Automatic) and how it combines (New, Add, Subtract) are one button each: tap to step to the next (a small dot marks buttons that step). On a tall screen the page fits below the tool bars.'] },
  { date: '2026-10-17', title: 'Layer masks', items: ['Layer options > Mask adds a mask to the layer: paint on it to hide parts of the layer without erasing them, use the Eraser to bring them back. It works on every frame of the layer (handy for hiding a character behind a wall). While Edit mask is on, the label at the top says Mask and what it hides shows in red; switch Edit mask off to draw on the art again. Delete mask shows everything again.'] },
  { date: '2026-10-17', title: 'Drawing guides', items: ['The Guide button in the Brush, Vector and Eraser bar steps through Grid, Isometric, 1-point and 2-point perspective. Assist makes strokes follow the guide: a stroke settles on the closest guide direction as it starts and stays straight along it. Edit lets you drag the vanishing points and the horizon (or drag up and down to change a grid’s size); tap Edit again to draw.'] },
  { date: '2026-10-17', title: 'Palettes and harmony', items: ['The colour panel keeps named palettes: pick one from the list; the dots make a new palette, a palette from a picture (its main colours), rename or delete one. Your old palette is kept as My palette.', 'Harmony shows colours that go with yours: complementary, split complementary, analogous, triadic or tetradic. Tap one to use it.'] },
  { date: '2026-10-17', title: 'Selection and transform tools', items: ['Select has Procreate’s modes: Freehand, Rectangle, Ellipse and Automatic (tap an area between lines), and New, Add or Subtract to build up a selection. With something selected: Transform, Fill, Copy, Cut, Duplicate, Delete, Invert and Deselect; Paste puts copied art on any drawing or frame, selected and ready to move. Select all selects the whole drawing.', 'Transform has Freeform (corners stretch on their own instead of keeping proportions), 45° turns, Flip, Fit to the page and Reset. Exact selections (Automatic, combined, pasted) stay exact after a transform.'] },
  { date: '2026-10-17', title: 'Layer groups, Line and Fill, Select', items: ['Group (in layer options) puts the layer and the one below into a folder; linked art layers come along so they stay in step. Tap a group to fold it open, tap a layer inside to draw on it; the rest of the shot still shows around it. ‹ Shot at the top of the cards backs out. The dots on a group: Ungroup, Duplicate, Rename, Lock, Delete. The timeline rows show the same groups.', 'Layer options have a Line row and a Fill row: tap the name to paint on it, the eye to show or hide it, the slider for its opacity.', 'Select (layer options) selects exactly what the drawing has and starts moving it. A two-finger tap on a layer card opens its options with Opacity ready.'] },
  { date: '2026-10-17', title: 'Onion skin fix', items: ['With Keys only on, the onion skin showed nothing unless drawings were marked as keys (K), so it looked broken. Now Keys only shows the key drawings when there are some nearby, and the neighbouring drawings otherwise.'] },
  { date: '2026-10-17', title: 'Layer options, X-sheet, Focus', items: ['Layer options (tap the layer you draw on) are tidier: Opacity and Blend, then switches for Alpha Lock, Clipping mask and Reference, then icon tiles. New tiles: Fill (fills the drawing with your colour, on FILL), Clear, and Flip left-right or top-bottom (Line, Fill and vector lines; undo puts it back).', 'The X-sheet’s frame actions are grouped icons (blank before / after, duplicate, copy, paste, earlier, later, delete); the Hold box shows the current hold, and the onion row is labelled.', 'The interface button opens a menu: Focus (just the canvas and your tools), Simple (modes, tools and the timeline) or Full (every control). Focus now keeps your tools, colour and brush sliders; only the modes and the timeline step aside. On small phones the Draw tools fit one row.'] },
  { date: '2026-10-17', title: 'Tidier screen', items: ['The canvas no longer starts 40 px down after an update (the menu button took a row). The page fits below the bubble rows (and above Flip’s drawing row), however many rows they wrap to on a phone; the brush sidebar and layer label sit below them too. The interface button stays on the canvas side instead of covering the X-sheet tab. Motion shows easing, Reverse and Delete key only when keys are selected. Buttons no longer read “+ + Null”, and the layer cards close when you change mode.'] },
  { date: '2026-10-17', title: 'Import brushes', items: ['Brushes > Import brings in Procreate brushes (.brushset, .brush) and Photoshop brushes (.abr) into My brushes. Each brush keeps its name (Photoshop v6+ brushes are numbered) and its tip shape; size, opacity, spacing, scatter and pressure size come across where the file has them. Grain textures, dual brushes and other special settings do not, so imported brushes look close, not identical. Up to 60 brushes per file.'] },
  { date: '2026-10-17', title: 'Adjust, Symmetry, Reference layer', items: ['Adjust (the wand bubble in Draw): Colour changes hue, saturation and brightness, Blur softens the drawing (Gaussian blur). Slide to preview, Apply keeps it (one undo step), Cancel puts it back; double-tap a slider name to reset it. It changes the current drawing, Line and Fill, and recolours vector lines.', 'Symmetry (in the Brush, Vector and Eraser bar): Mirror left-right, top-bottom, Quadrant or Radial. Brushes mirror as you draw; vector lines get mirrored copies. Tap again to step through, back to off.', 'Reference (layer options): Fill and ColorDrop on any layer use that layer\u2019s lines as their edges, even while it is hidden. One Reference layer per shot.', 'A zoomed or turned canvas now stays as you left it: touching the canvas, opening the timeline or changing the interface level no longer snaps it back to fit (tap Fit, or press F, to fit it). On the simple screen the frame buttons share the timeline bar, one row instead of two.'] },
  { date: '2026-10-17', title: 'Media as tracks', items: ['+ Media (timeline bar, the layer + menu, Motion) brings in pictures, movies and sounds, each as its own track from frame 1, like Procreate Dreams. A picture is an object layer for the whole shot (move or scale it with Select); a movie becomes a layer of frames (up to 12 seconds) with its sound as a clip; a sound is a clip. Sounds now start at frame 1. Drag a sound on the timeline to move it, drag one of its ends to trim it, tap it for its settings. Motion shows sounds as rows the same way.'] },
  { date: '2026-10-17', title: 'A calmer Motion', items: ['On the simple screen, Motion lists the selected layers, their linked layers and cameras; the rest fold into one row (tap to see all). Its toolbar keeps frame stepping, fps, + Null, up / down, Select and Delete; adding layers and cameras, grouping and splitting are in the Motion bubbles.'] },
  { date: '2026-10-17', title: 'A calmer timeline', items: ['The timeline rows in Draw and Timing show the layer you draw on, its linked art layers and the board; every other layer folds into one row (▸ 9 more layers). Tap it to see them all, tap Fewer layers to fold them again. The X-sheet Show line opens the layer cards instead of listing every layer.'] },
  { date: '2026-10-17', title: 'Image brush tips', items: ['Brush Studio > Tip: Import image uses a picture as the brush tip (like Procreate’s shape source); white or opaque parts paint, black or see-through parts do not. Round goes back to the round tip. Save the brush to My brushes to keep it. Brush files (.abr, .brushset) come next.'] },
  { date: '2026-10-17', title: 'Smudge', items: ['The Smudge bubble (next to Brush) drags the paint under your stroke along, on Line or Fill, at the brush size. Softer and Stronger set how much paint it carries. Each smudge is one undo step.'] },
  { date: '2026-10-17', title: 'Merge Down, swipe for quick actions', items: ['Layer options gain Merge down: the layer flattens into the one below, frame by frame (Line onto Line, Fill onto Fill, with its opacity and blend; vector lines come along). It needs both layers to have the same frames and placement, like two still layers or linked art layers. Swipe a layer card left for Lock, Duplicate and Delete.'] },
  { date: '2026-10-17', title: 'Eyedropper and ColorDrop', items: ['The dropper button in the left sidebar (or I) picks the next colour you tap on the canvas, as you see it. ColorDrop: drag the colour bubble onto an area of the drawing and let go to fill it (on Fill, inside a selection if there is one). A tap on the colour bubble still opens the colour panel.'] },
  { date: '2026-10-17', title: 'Clipping mask and Alpha Lock', items: ['In a layer’s options: Clipping mask shows that layer only where the first unclipped layer below has paint (it sits indented with an arrow), so shading and texture stay inside the art. It works live while you draw, in every view and in exports. Alpha Lock lets brushes change only pixels that already have paint; the eraser still erases.'] },
  { date: '2026-10-17', title: 'Background and object layers, layer options', items: ['Layers + now offers Animation, Background and Object. Background and Object are still layers: one drawing shown for the whole shot, like a Procreate layer (a background goes to the bottom). Tap the layer you draw on for Opacity, Blend mode, Duplicate (with its own copies of every drawing), Paint Line or Fill, Art layer, Rename, Lock and Delete. Flip uses the same layer cards.'] },
  { date: '2026-10-17', title: 'Select moves, steadier point editing', items: ['The Select bubble works like Procreate: draw a loop and the transform starts straight away; Move all picks up the whole drawing. Point editing: points are easier to hit with a finger, a tap that misses only leaves editing (it never draws), and choosing another shape in Edit shape keeps its points open.'] },
  { date: '2026-10-17', title: 'Linked layers stay in step everywhere', items: ['Moving or trimming a linked art layer in Motion now moves its partners too, in one undo step. Duplicating a cel copies the art on its linked layers instead of leaving them blank.'] },
  { date: '2026-10-16', title: 'Tidier simple screen', items: ['The row above the timeline keeps previous / next frame, new, duplicate, delete, flipbook and onion as icons; More shows the rest (layer, frame count, fps, split, select, scrub lock, zoom). The label on the canvas says just the layer and Line or Fill. After a QuickShape snap, Edit shape sits in the options bar instead of floating on the canvas. Options bars stay one row and scroll sideways if needed.'] },
  { date: '2026-10-16', title: 'Layer cards in Draw', items: ['The Layers bubble in Draw opens layer cards like Procreate: a thumbnail of each layer at the playhead, its name and an eye. Tap a card to draw on it; tap the one you draw on for Paint Line or Fill, Art layer (linked), Rename, Lock and Delete. Hold a card and drag it to reorder. + adds a layer; the eye at the top shows, fades or hides the other layers. Linked layers have a yellow edge. Flip keeps the simple layer chips.'] },
  { date: '2026-10-16', title: 'Point editing polish', items: ['Point editing controls are icons now (hold or hover for their names). Tapping empty canvas leaves point editing and draws as usual. A message like Tap a point first shows once, not for every movement.'] },
  { date: '2026-10-16', title: 'Curve handles and section thickness', items: ['Tap a curved (round) point to show its two Bezier handles; drag one to reshape the curves on both sides, the other turns to keep the point smooth. Straight (square) points have no handles: just move them. Tap the line between two points to pick that section (tap more for several, tap again to drop one); the Width chip switches to Sections so the meter, Thinner and Thicker change only those parts.'] },
  { date: '2026-10-16', title: 'Width at a point', items: ['While editing points, the Width chip switches between Whole line and This point. With This point, tap a point and Thinner, Thicker or the meter change the line only around it, fading out towards the next points. Saved with the drawing.'] },
  { date: '2026-10-16', title: 'Straight or curved points, snapping and joining', items: ['Hold a vector line to snap it and its points appear by themselves. Hold a point to switch it between curved (bends smoothly) and straight (square handle, straight lines to its neighbours); All straight tidies the whole line. Dragged points snap onto the points of other lines on the same drawing, and dropping a line end onto another line end joins them into one line. The gear chip holds the on/off settings: new points straight, snap points, merge on snap, points after hold (also in the Edit shape menu).'] },
  { date: '2026-10-16', title: 'Transparent GIFs', items: ['Export and finish > Looping GIF has a Transparent background option. GIF transparency is on or off per pixel, so soft edges become hard; use a PNG sequence for soft transparency.'] },
  { date: '2026-10-16', title: 'Edit vector points, handles on selections', items: ['With the Vector pen, Edit points shows the corners and bends of a line: drag one and the line bends with it. Thinner and Thicker, or pull the meter up or down, set its width. Tap another vector line to switch to it; Done or Enter finishes. Each change is one undo step. A selection now has marching ants, and while transforming, drag a corner to scale or the round knob to rotate (it snaps to 15 degrees).'] },
  { date: '2026-10-16', title: 'Linked art layers', items: ['Tap the Layers bubble in Flip or Draw to see the layers of these cels. + Layer adds an art layer with the same frames and timing and its own drawing, so ink, colour and extras can sit on separate layers. Adding, deleting or retiming a cel on one of them changes all of them, in one undo step. Flip now has Vector and Fill too.'] },
  { date: '2026-10-16', title: 'Flip: draw first, time later', items: ['The first mode bubble, Flip, is for starting out: a big canvas, brush, eraser and colour, and a row of drawing bubbles at the bottom. Tap + for a fresh page, tap a bubble to go back to it, Play to watch it move. Onion skin is on. After six drawings it offers the timeline, where you can time them.'] },
  { date: '2026-10-16', title: 'Bubbles and a simpler screen', items: ['Mode bubbles at the top left (Draw, Animate, Move, Story) and only that mode tools at the top right; a small bar under them shows just what the chosen tool needs. The round button at the top right steps the screen between clean, simple and full (the classic layout with every button). Flipbook now opens a fresh blank page straight away.'] },
  { date: '2026-10-16', title: 'Tracks sheet in Draw and Time', items: ['One touch-friendly bar above the timeline: tap to step closed / half / full, drag, or swipe down to close; Play and the time stay visible when closed. Sounds are rows under the layers, and their settings open in a card you can close with a tap outside or a swipe.'] },
  { date: '2026-10-16', title: 'Transform a selection', items: ['After Select area, tap Transform to move, scale, rotate or flip what is inside the selection on this drawing. Apply keeps it as one undo step; Cancel puts it back.'] },
  { date: '2026-10-16', title: 'Hear audio while scrubbing', items: ['A new box in the Audio lane plays a short slice of sound at each frame you scrub to. Off by default; it stops when you let go.'] },
  { date: '2026-10-16', title: 'Focused workspaces and Export and finish', items: ['Tools and Timeline fold independently and remember each workspace. Motion keeps its extra keyframe/easing controls under a disclosure. Export and finish gathers existing formats and adds a previewable, silent looping GIF (up to 15 seconds, 12 fps, 480 px; 320 px in Lite).'] },
  {
    date: '2026-10-16',
    title: 'Line selects Pen; Fill selects Bucket',
    items: ['Choosing Line automatically activates the vector Pen. Choosing Fill activates the Bucket in Tap / drag mode, even after using Select area or Leftovers. Toolbar, layer parts, rails, Quick Animate and X share this behavior; visibility eyes do not switch tools.'],
  },
  {
    date: '2026-10-16',
    title: 'Clear paint targets and consistent layer folding',
    items: ['The canvas identifies your comp, layer, drawing and actual Line/Fill destination, including hidden/locked warnings. Tap the label for Layers. Layers now includes groups, explicit edit-inside navigation, child previews and the same fold state as the rails. The sidebar fits the canvas height so undo/redo remain reachable when the timeline grows.'],
  },
  {
    date: '2026-10-15',
    title: 'Select an area before filling',
    items: ['Fill > Select area creates a visible lasso selection. Fill selected area colors the entire selection without detecting closed ink. Tap / drag and Leftovers stay inside it. Clear selection or Esc removes it; changing frames or layers clears it. Each fill remains one undo step.'],
  },
  {
    date: '2026-10-15',
    title: 'Shape precision and drawing inside groups',
    items: [
      'QuickShape fits narrow and rotated ellipses without shrinking their long axis, uses the full stroke for straight-line direction, and preserves rectangle edge alignment in Edit shape.',
      'Draw and Time: tap a group name in the existing timeline rails to edit its drawings inside. The back-out breadcrumb returns to the shot; Motion retains its playback and speed controls.',
    ],
  },
  {
    date: '2026-10-15',
    title: 'Clearer audio waveforms',
    items: [
      'Audio waves stay visible with clip Settings folded shut. Trims and volume update the wave, stereo peaks are included, and the Board timeline stacks overlapping sounds in separate rows.',
      'Audio settings remember their folded state while switching workspaces. Enter or leaving a number field applies it; Escape cancels a typed edit. Multiple imported sounds now keep distinct clip IDs so they save independently.',
    ],
  },
  {
    date: '2026-10-15',
    title: 'Timeline audio and Quick Share video export',
    items: [
      'Menu > Export video makes an MP4 or WebM of the whole shot, with its audio. Choose size, quality and background; watch the progress, cancel if needed, then preview and save your video.',
      'Brush library: tap the tool you are using again. Categories with preview strokes, double-tap for all settings, save your own brushes into My brushes.',
      'QuickShape Edit shape: after a snap, tap the button at the top of the canvas to switch the shape (Line, Arc, Ellipse, Circle, Rectangle, Square, Polygon…) or keep your own stroke.',
      'Board views: Panels, Timeline (panels on the clock with the audio underneath: drag edges to retime, drag panels to reorder, drag sounds to line them up) and Split.',
      'Draw timeline rails: every layer stacked as a row like Procreate Dreams, LINE / FILL and groups fold open and closed (▾ All / ▸ All), pinch or Ctrl + wheel zooms time.',
      'Audio: open the Audio lane under any workspace and tap + Audio (WAV, MP3, M4A, OGG or FLAC, up to 2 minutes). Move it with Start, trim it with Source in / out, set its volume or mute it. Link current panel ties a clip (say a line of dialogue) to a board panel so it follows that panel when you retime the board.',
      'Video keeps the shot frame rate and holds, including camera moves and precomps. PNG sequences remain the option for transparent production output.',
    ],
  },
  {
    date: '2026-10-14',
    title: 'Touchscreen undo stays out of the right-click menu',
    items: ['Two-finger undo and other multi-finger canvas gestures no longer also open a right-click menu. Mouse right-click, pen-button menus and one-finger press-and-hold still work.'],
  },
  {
    date: '2026-10-12',
    title: 'Storyboard export, QuickShape, ripple and this manual',
    items: [
      'Animate this shot lines your frames up with the board: one drawing per panel, same lengths, and P1, P2… marks above the frame bar. Board and animation timing stay in sync.',
      'QuickShape keeps your pressure (thick and thin) and adjusts from the start point.',
      "Board and animation stay in step both ways: adding or retiming frames in Draw (flipbook too), trimming a layer's end in Motion, or retiming the Board moves the other; deleting the first panel no longer shifts the shot before frame 0 (older projects are repaired when opened).",
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
