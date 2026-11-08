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

## Phases

1. **Core captions.** A Caption layer with the six balloon styles, a draggable tail, live text, bundled
   comic fonts, tracking, line spacing, alignment, fit to balloon, fill and ink colours, Fade/Pop/
   Typewriter in and out, and Story → **Make caption from this dialogue line**. This needs a
   project-format addition (a new reader version, validated and migrated in `io/schema.ts`).
2. **Hand control.** Hand-drawn balloons, per-pair kerning, inline bold/italic/colour, a tail
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
