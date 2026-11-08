# Comic lettering and captions: design direction

2026-11-08 · proposal, not yet implemented. Recommended next step: phase 1 below. A roadmap here
does not authorise building the whole plan; see `AGENTS.md`.

## Goal

Give students comic-book control of their lettering, using balloons, fonts, spacing and shapes. Keep
it streamlined: one tap places an editable balloon, presets animate it, and Story dialogue can become
timed captions.

## What exists today (checked in source, 2026-11-08)

- **Titles** (`core/title.ts`, `ui/titles.ts`): a `TitleSpec` on a drawings layer. It allows system-ui only,
  weight 400/700, left/centre/right alignment, a fill and an optional outline, and up to 4 lines and
  280 characters. The text is painted once into the drawing's pixels. Painting on it offers Convert to
  paint.
- **Vector shapes** (`core/vectorshape.ts`): imported SVG/EPS paths with a fill, stroke, width, joins
  and a matrix, edited in Vector objects. No balloon tool and no link to text.
- **Masks**: clipping masks and layer masks (`core/comp.ts`) already composite in every view and export.
- **Motion**: opacity/transform keys, Fade in/out presets (`core/presets.ts`), effects including Drop
  shadow and Glow, motion paths, and the pick whip.
- **Story dialogue** (`core/dialogue.ts`): `who` and `text` lines already timed as cues on the shot's clock.
- **Missing**: fonts, tracking, kerning, line spacing, balloon shapes and tails, text that stays live,
  and text animation (typewriter, write-on, per-letter effects). `drawVectorStroke`'s `totalLength` only
  tapers line ends. It is not a reveal.

## The design: one live Caption layer

A caption is one layer that holds a **balloon** and its **lettering**. Both stay live vectors and are
rendered at composite time, not baked to pixels. Students can change the words, font or shape at any
time.

### 1. Placing a caption in one tap
- The **Caption** tool: tap the canvas, and a balloon appears with a text cursor.
- Style chips: **Speech** (oval with a tail), **Thought** (cloud with trailing dots), **Shout**
  (jagged burst), **Whisper** (dashed outline), **Caption box** (narration rectangle), **Sound
  effect** (no balloon).
- The balloon grows with the text. Drag the **tail tip** to point at the speaker, or
  **pick-whip the tail to a character layer** so it follows them.

### 2. Lettering
- **Fonts**: a small built-in set of SIL Open Font License comic fonts (classic comic, hand-lettered,
  bold sound effect, clean caption), Latin subsets, loaded on first use. Imported fonts (.ttf, .otf,
  .woff2) are stored in the project as assets so it stays portable. Students are responsible for the
  font's licence.
- **Spacing**: tracking per line, **kerning** per letter pair (Alt+arrows at the cursor, or a drag
  handle), line spacing and alignment.
- **Fit to balloon**: wraps text into the classic comic diamond, with short lines top and bottom and
  long lines in the middle.
- **Emphasis**: an ALL CAPS switch, inline `*bold*` and `_italic_`, and colour for individual words.
- **Ink**: text fill, outline colour and width, and the existing Drop shadow effect.

### 3. Hand-drawn balloons
- Draw an outline with the Vector brush and choose **Use as balloon**. 2Dope closes the line,
  smooths it and fits the text inside.
- Fill colour, ink colour, ink width and dashed outlines stay editable.
- Tails can be single, multiple (two speakers) or linked between balloons.

### 4. Animating with presets instead of keyframes
- **In**: Fade, Pop (slight overshoot), Grow from tail, Typewriter (letters appear one at a time),
  Wipe.
- **Out**: Fade, Shrink, Pop away.
- **While showing**: Shake (shouting), Wave, Jitter (a hand-lettered boil).
- Duration chips. Captions made from Story dialogue start and end with that line's cue. Ordinary
  Motion keys (position, scale, opacity) still work on top.
- Presets are caption parameters evaluated at render time, so every view and export (video, GIF,
  frames, Blender plane renders) shows the same thing.

### 5. Masking and drawing on text
- **Draw on the letters**: a drawing layer clipped to the caption puts paint only inside the letters
  (halftone, scratches, gradients) while the text stays editable. It uses the existing clipping masks.
- **Write-on**: letters are inked stroke by stroke. This needs real glyph outlines (phase 3).
- **Convert to paint or vectors**: for full freedom once the wording is final, the same as Titles today.

### 6. Sound effects
- Lettering can follow a Vector line (a tap or the pick whip, as in Animate along a path).
- Arc and bulge warps.
- A thick outline and a stacked offset copy give the classic 3D "POW" look.

### 7. Classroom profiles
- **Simple**: the style chips, font, size, colours, and the Fade/Pop/Typewriter presets.
- **Full**: adds kerning, tracking, custom balloons, text on a path and per-letter effects.

## Revision (2026-11-08): a Letter tool, consistent sizing and shape detection

The owner's direction: make lettering a **tool** that automates the work (not an effect), keep sizes
accurate and consistent so they cannot drift or blow up, detect custom balloon shapes as they are
drawn, and keep the code portable for a later comics-specific app.

### The Letter tool (beside Brush, Eraser, Vector and Fill)
One tool, three gestures, each automatic:

| Gesture | What happens |
|---|---|
| **Tap** empty canvas | A balloon in the current style, sized to the text, with the cursor ready |
| **Draw a closed loop** | The shape is recognised (below), becomes the balloon and the cursor opens inside |
| **Draw a line out of a balloon** | It becomes that balloon's tail, ending where the line ends |
| **Tap a balloon** | Edit its text; drag its edge to resize it; the text reflows |
| **Draw through two balloons** | Links them with a connector (one speaker, two balloons) |

The style chips (Speech, Thought, Shout, Whisper, Box, Sound effect) set what a tap makes. A drawn
shape overrides the chip.

### Shape detection inside the tool
This builds on `core/quickshape.ts`, which already recognises ellipses, rectangles, polygons and lines
in pure geometry. A closed loop is classified by its radial profile (distance from its centre against
angle):

| Drawn | Recognised as | Test |
|---|---|---|
| Rough oval | **Speech** | `fitEllipse` residual is small |
| Rough box | **Caption box** | `rect` from QuickShape |
| Loop with bumps all bulging outward | **Thought cloud** | 5–14 regular outward scallops in the profile |
| Zigzag star | **Shout burst** | Profile alternates sharply in and out, 6–20 spikes |
| Any other closed loop | **Custom balloon** | Kept as drawn: closed, smoothed and simplified |
| Dashed or very light pressure | **Whisper** (optional) | Many short segments, or low average pressure |

- The recognised balloon is rebuilt cleanly (a true ellipse, an even cloud, a regular burst) using
  the drawn size and angle. A **Keep as drawn** chip appears for a moment for students who want
  their wobbly line.
- Detection only ever *suggests*. One tap undoes it, and the raw stroke is kept for that.
- Thresholds live in one tested table, with fixtures for each shape drawn badly, so recognition stays
  predictable.

### Sizing that stays consistent
Comic letterers use one lettering size for the whole book. The tool works the same way:
- **Three named sizes per project**: Body, Small and Big (sound effects use their own). Each is
  stored as a fraction of the page height, so a 720p and a 4K project letter identically. Changing
  Body updates every caption that uses it. Individual captions do not drift.
- **The text sets the balloon, never the reverse.** Balloons fit the text plus fixed padding (a
  fraction of the lettering size). Dragging a balloon edge reflows the text inside. It never stretches
  or squashes letters.
- **Hard limits that cannot be crossed:**
  - Text never shrinks below a readable floor (set by the project's output size). Past that, the
    balloon grows instead.
  - A balloon can never be smaller than its text, or larger than the frame plus overscan.
  - Tracking is limited to −100…+300 and kerning to ±500, both in thousandths of the letter size
    (em/1000), so values mean the same at every size.
  - Font size snaps to the named sizes unless the Full profile unlocks a free size.
- **Motion scaling is uniform only.** Scaling a caption layer in Motion keeps its proportions. An
  optional **Keep lettering size** keeps the text the same on screen while the balloon scales with
  the shot.
- **Every number is in page units**, never screen pixels, so zoom, device and export resolution
  cannot change the layout.

### Built to move into a comics app later
- The lettering code lives in `src/lettering/`, as pure TypeScript with no DOM and no App imports:
  - the caption model (`LetterSpec`, versioned on its own),
  - layout (the font measurer is passed in),
  - balloon and tail geometry, returning paths,
  - shape detection (using QuickShape),
  - animation evaluation (deterministic, seeded).
- 2Dope adds a thin adapter: tool input, canvas rendering, layer storage, History and Motion. A
  comics app would add its own adapter around the same core.
- `LetterSpec` JSON is the exchange format, so captions can be copied between the two apps.
- An import guard (a unit test that scans the folder's imports) keeps `src/lettering/` free of app code.

### Caption properties appear automatically in Motion
When the Letter tool makes a caption, it is a normal Motion layer with its **own property group**,
ready to keyframe. There is no setup step, and nothing is hidden inside an effect. It uses the same
keying the effects panel uses: an effect setting is keyed as `fx:<effect>:<setting>`, and a caption
setting would be keyed as `cap:<setting>`, with a `Prop` and keys like any other row.

Shown under the layer's Transform rows as **Caption** (folded until opened, like Line/Fill):

| Row | What it animates | Range (clamped) |
|---|---|---|
| **Reveal** | How much of the text shows, 0–100%: typewriter by letter, or wipe | 0–100 |
| **Balloon** | Balloon scale around its tail tip (grow from tail) | 0–150% |
| **Tail tip** | Where the tail points (2D, page units; draggable on canvas) | inside frame + overscan |
| **Tracking** | Letter spacing for the whole caption | −100…+300 em/1000 |
| **Line spacing** | Space between lines | 80–200% |
| **Text opacity** / **Balloon opacity** | Fade the letters and the balloon separately | 0–100 |
| **Fill** / **Ink** colour | Balloon fill and outline colour (stepped or blended) | — |
| **Ink width** / **Ink start** / **Ink end** | Outline thickness and how much of it is drawn (draw-on) | width within limits; 0–100% |
| **Fill opacity** / **Under-fill offset** | Fade the balloon fill; move the drop colour | 0–100; within lettering-size limits |
| **Shake** / **Wave** / **Jitter** | Per-letter motion amounts (seeded, repeatable) | 0–100 |
| **Write-on** (phase 3) | How far each letter's strokes are inked | 0–100 |

- **Presets just write keys.** Choosing In: Typewriter puts two keys on **Reveal**, and Pop puts
  keys on **Balloon**. They show in the timeline as normal diamonds that students can drag, ease or
  delete. One system, nothing secret.
- **Auto-timing from dialogue.** A caption made from a Story line gets its In keys at the cue's
  start and its Out keys at the cue's end. Moving the cue in Story offers to move the keys.
- **Size limits stay in force.** Rows that touch size (Balloon, Tracking, Line spacing) are clamped
  to the limits above. A keyframe cannot push text below the readable floor or a balloon past the
  frame. Lettering size itself is not a row: it comes from the project's named sizes, so it cannot
  drift per frame.
- **Graph editor, easing, presets library, pick whip and Blender export** work on these rows like
  any other. Blender receives the rendered caption as a plane, with these values baked per frame
  where needed.
- The text itself is not keyframed. Changing words happens in the caption, once. A different line
  later in the shot is a second caption, or a **Swap text at frame** key (phase 2) for dialogue
  that changes in place.

### Prototype findings (2026-11-08)
Two throwaway spikes in `docs/research/lettering-prototype/` (plain Node, not app code) test the
riskiest ideas.

**Shape detection works with simple geometry.** Over 1,800 synthetic sloppy drawings per run (300
of each kind, with wobble, pen jitter, rotation, stretch, unclosed or overshooting loops and uneven
pen speed), the classifier was **97.4–98.8% correct across four seeds**. Speech, box, cloud, burst
and open lines are each about 98–100%. The main miss is lumpy blobs read as speech ovals (about
10% of blobs), which the **Keep as drawn** chip covers. The features that separate the kinds:

| Feature | Speech | Box | Cloud | Burst | Custom blob |
|---|---|---|---|---|---|
| Solidity (area ÷ hull) | ≥ 0.989 | ≥ 0.98 | 0.93–0.98 | 0.65–0.81 | 0.82–0.99 |
| Straight share of outline | ≤ 0.20 | ≥ 0.32 | ≤ 0.04 | ≤ 0.06 | ≤ 0.18 |
| Inward dents | 0–3 | jitter only | 6–13 | 7–16 | 1–5 |

The first naive version (radial profile only) scored 83%. Straightness and dent counting raised it
to about 98%. Synthetic drawings are not real ones: the thresholds must be checked against real
student strokes on iPad before they are trusted, and kept in one tested table.

**The text can set the balloon without squeezing it.** With the lettering size fixed, a search
over line counts and a balanced line-break pass finds the smallest speech oval that holds the text.
At Body size on a 1920×1080 page (3.2% of page height):
- "HEY!": 1 line, 165×110.
- A 40-character line: 4 lines, 369×246, with line widths 166, 207, 228 and 166. That is the
  classic diamond (an early top-down fill gave a single 893-wide line).
- A 113-character line: 7 lines, 556×371.
- A 599-character paragraph: refused as too long for one balloon. The tool would offer to split
  it, never shrink the text.

Real fonts need the browser's `measureText` (or font outlines in phase 3) in place of the
monospace stand-in. Tails, thought clouds and bursts need their own inset shapes for fitting.

### Tails: open or closed, added or drawn
A tail is its own small object on the balloon: a **tip**, an optional **bend** (curve), a **width**
at the base (a fraction of the lettering size, so it matches the text) and a **join**:

| Join | Look | Use |
|---|---|---|
| **Merged** (open) | The balloon outline flows into the tail with no line across the base | Standard speech |
| **Seam** (closed) | The tail is its own closed shape over the balloon edge | Hand-lettered or retro styles, and the fallback when merging is impossible |
| **Bubbles** | A row of shrinking circles from the edge to the tip | Thought |
| **Lightning** | A zigzag line in the balloon's ink | Radio, phone, robot |
| **None** | No tail | Narration boxes, off-panel voices |

Ways to add one, all with the Letter tool:
- **Automatic**: each style comes with its usual tail pointing down-left. Drag the tip handle.
- **Drag from the edge**: press on a balloon's edge and drag out to make a new tail there.
- **Draw it**: draw a line out of the balloon. A straight or curved line gives a wedge that follows
  it (its middle sets the bend). A zigzag gives lightning. Small loops in a row give bubbles. A small
  closed wedge drawn touching the edge becomes a merged tail, with **Keep seam** as one tap.
- **Point at the speaker**: pick-whip the tip to a character layer and it follows them.
- **Several tails**: one balloon, two speakers. Each tail is separate, merged in turn.
- Tapping a tail shows its chips: Merged, Seam, Bubbles, Lightning, None, Curve, and Width (Thin,
  Normal, Wide).

**Prototype result** (`tails.mjs`): a merged tail is spliced into the outline where each side of the
wedge leaves the balloon. It needs no general shape-union library. Over 1,000 random tails each:
- On ovals: 999 clean merges, and 1 safe fallback to Seam.
- On lumpy custom balloons: 979 clean, 19 fallbacks, and **2 broken outlines**.

So the real code must check the result for self-crossing and fall back to Seam when it fails. A
seam tail must start just inside the balloon edge, not at the inner base: the first prototype
showed its outline across the balloon's inside. Connecting two balloons (one speaker, two
balloons) does need a real union of two outlines. That is a small polygon-union step for phase 2.

### Converting a vector or pixel layer into a caption
Students often draw the balloon first. **Make caption** (in Draw's layer menu and the selection
row) turns that drawing into a live caption layer, keeping the original until confirmed (one Undo
step):

- **From vector lines** (the Vector brush or imported paths): the largest closed line becomes the
  balloon, run through the shape detector. Conversion defaults to **Keep as drawn**, with Clean up
  as a chip. Open lines that start inside or on the balloon become tails (same rules as drawing
  tails). The line colour becomes the ink and any Fill inside becomes the balloon fill. Other lines
  stay on the original layer.
- **From pixels** (Brush or Fill): tap inside the drawn balloon. 2Dope finds the enclosed area the
  way Fill does, closing small gaps automatically, traces the outside edge of that area plus its
  ink, and detects the shape. Two choices:
  - **Trace as vector**: a clean, editable balloon replaces the drawing (the default).
  - **Keep drawing as the balloon**: the hand-drawn pixels stay as the balloon's look. The traced
    shape is used only to fit the text inside. Good for scratchy or painted balloons.
  A tail drawn joined to the balloon is part of the traced outline and stays as drawn. A tail drawn
  apart is not traced in phase 1.
- **From a Title layer**: the text, font settings and colours become a caption with no balloon.
- **The other way**: Convert to vector lines (editable paths) or Convert to paint, the same as
  Titles today.

**Prototype result** (`trace.mjs`): 900 pixel drawings (60 of each kind, three seeds), drawn with
a 6 px pen and gaps of up to 7% of the outline. **881 (97.9%) became the right balloon kind.** Three
lessons:
- A fixed gap closer missed about 40% of drawings. Adaptive closing (6 px first, widening up to
  about a sixth of the drawing's size) caught all of them. The median closing was 6 px, the 90th
  percentile 24 px.
- Tracing only the inside of the area rounded off burst spikes, turning 17 of 60 bursts into clouds.
  Tracing the outside of area plus ink kept them (58–60 of 60).
- Remaining misses are lumpy blobs read as ovals or clouds, which Keep as drawn covers.

### Fill, ink and stroke length on the caption
Every part of a caption has its own paint, set from the style chips or the colour panel (project
swatches included) and kept as caption settings, not effects:

| Part | Controls |
|---|---|
| **Balloon fill** | Colour, opacity |
| **Balloon ink** | Colour, width (a fraction of the lettering size, within limits), line style (Solid, Dashed, Dotted, with dash length and gap), corners (Round or Sharp) |
| **Under-fill** | A second copy of the balloon shape behind it, offset (x, y) in its own colour: the classic comic drop colour or 3D backing. Off by default |
| **Paint order** | Fill under ink (default) or ink under fill (a thinner, inside-looking line) |
| **Ink length** | Start, End and Offset of the outline as percentages (Trim Paths in After Effects). 0→100% draws the balloon on |
| **Letters** | Fill colour, outline colour and width. The outline sits behind the fill so letters stay crisp, the comic standard. A letter under-fill (offset copy) gives sound-effect 3D |

- **Animation**: Ink start/end, Ink width, Fill opacity, Under-fill offset and letter outline width
  join the automatic Caption rows in Motion. Colours step or blend between keys. A typical
  "draw on": Ink end 0→100% over 10 frames, then Fill opacity 0→100%, then Reveal for the text.
- **Limits**: ink width and letter outline are clamped relative to the lettering size, so a
  thick-ink style still scales correctly between Body and Big.
- **Vector layers too**: the same Start/End/Offset belongs on ordinary Vector-brush layers as Line →
  **Trim** rows in Motion, using the stroke records' exact geometry. That is the general write-on
  for drawn lines, and phase 3's letter write-on uses the same mechanism.

### New Motion effects: Fill and Outline (any layer)
The effect list (`core/effects.ts`) has Drop shadow and Glow but no Fill or Stroke. After Effects
and EffectCraft both have them (EffectCraft's Generate group lists Fill, Stroke and Write-on).
Both fit the existing effect model: Amount and Size are keyable, extras take colour, range, choice
and toggle, and they target Line, Fill or the whole layer.

**Fill**: recolours everything visible, keeping its shape and edge softness.
- Settings: Colour; Opacity (keyable, so colour can fade in or out); Mode: **Replace** (flat colour),
  **Tint** (keeps the light and dark shading), **Multiply**.
- Targets: Line only (recolour the ink), Fill only, or the whole layer. Works on drawings, clips,
  titles and captions.
- Use: silhouettes, flashing hit colour, a character turning red, a quick recolour without repainting.

**Outline**: a coloured line around the edge of whatever is visible (After Effects' Stroke layer style).
- Settings: Width (keyable); Colour; Position (**Outside**, **Centre**, **Inside**); Opacity;
  Softness; Corners (Round or Sharp); **Outline only** (hides the art for hollow shapes and letters).
- Two Outlines stacked give the double sticker outline that comic sound effects use.
- Width is padded like Drop shadow, so the outline is never clipped at the layer edge.
- Implementation: a distance field of the layer's alpha (exact Euclidean distance transform, done
  once per frame on the effect's working area) gives every pixel its distance to the edge. The
  outline is the band at the chosen width and position, softened by Softness. It runs after the
  spatial effects, like Drop shadow, and the export, Share preview and Motion canvas share one path.
- Checks needed: a pixel test (an outline of width w on a disc covers exactly the expected ring at
  each position), keyed width, Outline only, and a speed check at 1080p within the effect cache budget.

These two effects are independent of captions and can ship before them. Captions keep their own
ink and fill settings, because those are vector-exact and set the text-fitting padding. The Fill
and Outline effects are the pixel tools for everything else.

## Phases

1. **Core captions.** The Letter tool (tap to place, draw an oval or box to detect it), a Caption layer with the six balloon styles, the three named sizes and the limits above, a draggable tail, live text, bundled
   comic fonts, tracking, line spacing, alignment, fit to balloon, fill and ink colours, Fade/Pop/
   Typewriter in and out written as keys on the automatic Caption rows in Motion (Reveal, Balloon, Tail tip, Tracking, Line spacing, Text/Balloon opacity), and Story → **Make caption from this dialogue line**. This needs a
   project-format addition (a new reader version, validated and migrated in `io/schema.ts`).
2. **Hand control.** Cloud, burst and custom-shape detection, drawn tails (wedge, lightning, bubbles) with Merged/Seam joins, Make caption from vector and pixel layers, joined balloons, per-pair kerning, inline bold/italic/colour, a tail
   pick-whipped to the speaker, imported fonts, sound effects on a path, Shake/Wave/Jitter.
3. **True vector letters.** Glyph outlines from the font file (a font-parsing library loaded on
   demand), write-on, convert to editable vector shapes, and real text in SVG export.

## Technical notes

- **Layout**: phase 1 can place glyph by glyph with Canvas `measureText`/`fillText`. That works with
  any CSS font, and kerning becomes per-pair offsets added to the measured advance. Phase 3 replaces
  measuring with glyph outlines so text can be vector-accurate in SVG export and write-on.
- **Rendering**: a caption renders in the composite like vectors do, with a per-frame cache keyed by
  the caption's parameters and the animation phase. It must respect residency, deterministic
  randomness (`core/rng.ts`, for Jitter and Shake) and the existing export paths.
- **Undo**: each edit (typing session, style change, tail drag, preset) is one History step with
  autosave notification, following `AGENTS.md`.
- **Fonts offline**: bundled fonts are subset and served with the app. Project-embedded fonts travel
  in standalone archives with the other assets.
- **Titles**: phase 1 can treat an existing title as a caption with no balloon. That leaves one text
  system and keeps old projects readable (convert on edit, never silently).

## Decisions needed from the owner

- Which 4–6 Open Font License fonts to bundle, and whether students may import their own.
- Whether Caption replaces Titles (recommended: a title is a caption without a balloon) or sits
  beside it.
- Whether write-on matters enough to bring phase 3 forward.
