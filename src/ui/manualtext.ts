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
      '2Dope is a free 2D animation app that runs in your browser, made first for iPad and pencil, and also for computers and phones. You can plan a shot with a storyboard, draw it frame by frame, time it, put it together with moves and a camera, and export it as video, images, a storyboard PDF or a package for Blender.',
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
      {
        list: [
          'Three views (buttons in the Board bar): Panels shows the cards; Timeline shows the panels on the clock, as long as they last, with the audio underneath; Split shows both.',
          'In Timeline: drag the right edge of a panel to make it longer or shorter (Ripple moves everything after it, the animation too); drag a panel sideways to move it; tap to go there; press and hold for its menu.',
          'Drag a sound on the Timeline to line it up with a panel (a sound linked to a panel moves with it). Pinch or Ctrl / ⌘ + wheel zooms time.',
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
        list: [
          'The timeline shows every layer as a row (rails), front layer on top, on one clock. The layer you draw on is the big row with its frames; tap another row name to draw on that layer.',
          'The arrow by a layer name folds open its LINE and FILL rows (each with an eye; tap LINE or FILL to paint on it). A group folds open to show the layers inside.',
          '▾ All opens every row, ▸ All folds them back to one row per layer. Folding only tidies the timeline: it never hides a layer or changes playback.',
          'Zoom time with the Zoom slider, a two-finger pinch on the timeline, or Ctrl / ⌘ + mouse wheel. Drag the line above the timeline to make it taller or shorter.',
        ],
      },
      {
        keys: [
          ['Brush (B)', 'Pixel brushes: pencil, ink, brush pen, fine liner, pixel ink and more. Pressure and tilt work with a pencil.', 'brush'],
          ['Pen (P)', 'Vector lines: always crisp, can be resized later without going blurry.', 'pen'],
          ['Eraser (E)', 'Erases pixels. On vector lines it cuts up to where lines cross (change this in the eraser options).', 'eraser'],
          ['Fill (G)', 'Tap or drag across connected regions. Select area draws a lasso boundary; Fill selected area colors all of it. Leftovers cleans missed specks.', 'fill'],
        ],
      },
      {
        tip: 'Brush library: tap the Brush (or Vector, or Eraser) tool you are already using. Brushes are sorted into Sketching, Inking, Painting and My brushes, each with a preview stroke. Tap to use one, double-tap to open all its settings (Studio). Tune a brush and tap ＋ Save brush to keep it in My brushes; hold a brush to duplicate, rename or delete it.',
      },
      'The circle at the top right is your colour. Tap it for the colour panel: a hue ring around a saturation / brightness square (Disc), or H, S, B sliders and a hex box (Values); the colour before and now (tap the old half to go back); Recent colours; and a Palette (+ adds the current colour, hold a swatch to remove it). System… opens your device’s own picker.',
      'The sliders on the left are brush size and opacity, with undo and redo under them.',
      'The paint-target label on the canvas shows the comp path, drawing layer, drawing number and Line or Fill destination. It warns when the target is hidden or locked; tap it to open Layers. With no drawing layer in the open comp, New layer on paint means a new layer will be created when you draw, rather than painting into a child group.',
      'Layers and timeline rails share their folding: expand a drawing to reveal Line and Fill, or expand a group to preview its children. Tap a group name to edit inside, then use the breadcrumb to go back. Folding never changes visibility or timing. Undo and redo stay inside the canvas area when the timeline gets taller; in a very short canvas the sidebar becomes horizontal.',
      'Fill selection: in Fill options choose Select area, then draw a loop. This only selects: tap Fill selected area to color everything inside, even across open ink. Tap / drag fills connected regions inside the selection; Leftovers keeps its cleanup behavior within that boundary. Clear selection or Esc removes the boundary. It is temporary, applies only to this frame, and clears on frame/layer/project changes. Next drawings is suspended while selected. Brushes remain unrestricted; selection transforms and warp are not available yet.',
      'Transform selection: with a selection made, tap Transform. Drag the canvas to move it; Scale and Rotate sliders and the Flip buttons change it about its centre. Whole vector lines inside the selection come along. Apply (or Enter) keeps it as one undo step; Cancel (or Esc) puts everything back. It works on this drawing only, and you cannot change frames or layers while it is open.',
      { figure: 'linefill' },
      {
        tip: 'Line and Fill: every drawing has a Line part and a Fill part. Fill paints under your lines, so colouring never covers the ink. Choosing LINE selects the vector Pen; choosing FILL selects the Bucket in Tap / drag mode. X switches between them. This also works in Layers, rails and Quick Animate. To brush or erase on either part, choose that part first, then Brush or Eraser. The canvas label shows the actual tool destination. Each part has a separate visibility eye.',
      },
      'QuickShape: draw a line, circle, box or triangle roughly and keep the pencil still at the end. It snaps to a clean shape and keeps the pressure you drew with, thick and thin. Keep holding and move to adjust it: the start stays put and the pencil drags the other end. Touch a second finger (or hold Shift) to make it perfect: a circle, a square, an even polygon or a straight angle. Turn it off in the Brush panel under Assist.',
      'Shape precision: lines fit the direction of the whole stroke rather than a shaky endpoint. Narrow and tilted ovals fit their outline, and choosing Rectangle keeps a recognized square or rectangle aligned with its drawn edges.',
      'Edit shape: after a snap, a button at the top of the canvas shows what it became (say “Ellipse · Edit shape ▾”). Tap it to switch to Line, Polyline, Arc, Ellipse, Circle, Rectangle, Square or Polygon, or Keep my stroke to undo the snap. Your pressure is kept, and it stays one undo step. The button goes away after a few seconds or when you do something else.',
      { figure: 'quickshape' },
      { figure: 'onion' },
      {
        list: [
          'Flipbook mode: past your last drawing there is a blank page. Draw on it and a new frame is made for you.',
          'To draw inside a grouped animation, tap its group name on the timeline rail. Use the back-out breadcrumb to return to the shot. In Motion, the group Playback menu controls once, loop, ping-pong, hold a frame and speed.',
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
    id: 'audio',
    title: 'Audio',
    blocks: [
        'Sound plays on the same clock as everything else, in every workspace. Open the Audio lane under the canvas to see each clip as a waveform. The wave stays visible while its Settings are folded shut; folding the whole Audio lane gives the canvas more room.',
        'Tracks in Draw and Time: the bar above the timeline holds Play, the time and + Audio. Tap the bar to step closed, half and full; drag it to any height, or swipe it down to close. Each sound is a row under your layers with its waveform. Tap a sound for its settings card; close it with the X, Escape, a tap outside, or a swipe down on its top.',
        'Hear while scrubbing: tick the box in the Audio lane to hear a short slice of sound at each frame as you drag the timeline or Shift-step. It is off by default, remembered on this device, and stops the moment you let go.',
      {
        steps: [
          'Tap + Audio and pick a file (WAV, MP3, M4A, OGG or FLAC, up to 2 minutes). It starts at the frame you are on.',
            'Open the clip\'s Settings. Start frame moves the clip. Source in and Source out trim the sound itself (in seconds). Press Enter or leave the field to apply an edit; Escape cancels a typed edit.',
            'Set Volume, or Mute a clip while you work. The waveform follows the source trim and volume, shows both stereo channels, and turns grey when muted. Tap the waveform lane to move the playhead.',
          'Link current panel ties the clip to the board panel you are on: retime or move that panel and the clip goes with it. Handy for dialogue.',
        ],
      },
      { tip: 'Audio is saved inside the project and in .2dope files, and it goes into video exports. PNG sequences are pictures only.' },
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
          'Export video…: an MP4 or WebM with audio of the whole shot, at its own frame rate. Pick 720p, 1080p or Original size, Standard or High quality, and a white or black background for transparent areas. Preview it, then Save video. It includes layers, moves, the camera and precomps, even while you are editing inside one. Your drawing view and its onion skins are not exported.',
          'Board > Export: the storyboard as a PDF or as panel images with a captions spreadsheet.',
          'Export for Blender: a package Blender opens with the 2Dope add-on (image planes, camera, groups, keyframes).',
        ],
      },
      'Export and finish gathers video, looping GIF, PNG frame/sequence, storyboard, Blender and .2dope backup. GIF uses simplified 256 colours and no audio, on white or (tick Transparent background) see-through with hard edges; limits keep browser memory bounded. It exports the whole main shot even inside a group. Preview before saving. Tools and Timeline controls remember their folding separately in each workspace; the Panel button opens Brush settings or the X-sheet. Motion keeps keyframe/easing/view options folded until needed.',
      'Video export needs a secure browser tab with video encoding support. If a format or size is unavailable, try the other format or a smaller size. Cancel stops encoding and lets you try again. Videos have an opaque background and include the audio clips of the shot (AAC in MP4, Opus in WebM); use a PNG sequence for transparent production files. The storyboard stays out unless Include the storyboard is already on in Export sequence.',
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
