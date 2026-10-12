# 16. Toon Boom Storyboard Pro → 2Dope's Animatic mode

Study, 2026-10-11. Sources: the user's Storyboard Pro 24 install, readable data only (`resources\sb_menus.xml`
and the other settings files, which list the commands and their names), plus Toon Boom's public
documentation (links at the end). The `win64\bin` folder is compiled programs (124 DLLs, 15 EXEs)
and was not opened or decompiled. Behaviour and structure only; wording is ours.

## What Storyboard Pro is built around

| Concept | What it does (from the menus and docs) |
|---|---|
| **Act → Sequence → Shot (scene) → Panel** | The hierarchy. *New Panel / Panel Before / Shot / Shot from Selected Panels / Sequence / Start New Act*; *Split Current Shot*, *Break Current Shot*, *Join Selected Acts*. |
| **Panel** | One storyboard drawing with a duration, layers (vector, bitmap, group), and its own camera. *Duplicate Panels*, *Split Panel at Current Frame*, *Move Panel In/Out to Current Frame*, *Panel Duration…*, *Retime Panels…*, *Ripple Delete*. |
| **Captions** | Per panel: **Dialogue, Action Notes, Slugging** (timing notes for the animatic), **Notes** (headings, props, continuity); can be added or renamed; dialogue can come from a script. |
| **Thumbnails view** | All panels in order as cards: navigate, rearrange panels and shots. |
| **Timeline view** | The animatic: panels as blocks as wide as their duration, video and audio tracks, camera keys per panel ("relative to panels / to shot"), transitions, markers, playback ranges. **Animatic Editing Mode** and **Snapping** on the panel track. |
| **Camera per panel** | Start and end positions; *Copy Camera from Selected Panels*, *Paste and Fit / Repeat / Spread*; *End Position in Previous Panel*. |
| **Sound** | Import / record clips, *Split Clip at Current Frame*, gain, speed, waveform, volume envelope, *Link Clips to Panel* (the clip moves with its panel). |
| **Onion skin across panels** | Previous / next one to three panels. |
| **Pitch mode** | Play with one caption (dialogue by default) as subtitles. |
| **Thumbnailing page** | A page of numbered rough thumbnails; *Convert to Panels* turns it into timed panels. |
| **Conformation / export** | Movie, PDF pages, bitmaps, CSV, EDL/AAF/XML, audio, **To Harmony** (hand the shots to animation), track changes. |

## What 2Dope keeps, and how it maps onto what we already have

The goal is a lighter version that fits our model, so nothing new needs syncing.

| Storyboard Pro | 2Dope (already there → small additions) |
|---|---|
| Sequence | A **sequence comp** (the project's main comp) holding shots as precomp layers **laid end to end automatically** (`sequence: true`: changing a shot's length ripples the next shots). |
| Shot | A **comp** (precomp), the same thing you animate in. *New shot from selected panels* = group (we have it). |
| Panel | An **exposure on the shot's guide "Board" layer** (doc 15 §5): a drawing held for its duration. Duplicate, split, retime and ripple use the frame operations we already have (doc 13 step 1). |
| Captions | Exposure **notes grow into captions**: dialogue, action, slugging, notes (additive in the file; the X-sheet note becomes "notes"). |
| Thumbnails view | The **Animatic tab's board**: cards per panel, grouped by shot, captions under each card; drag to reorder; + panel / + shot; import images as panels. |
| Timeline view | Our **rails / Motion timeline** (doc 15 §4) with audio tracks (R6). |
| Camera per panel | **"Camera move" on a panel**: start and end framing as two camera keys at the panel's first and last frame; copy / paste to other panels. |
| Link clips to panel | An audio clip can be **tied to a panel or layer** (it moves when the panel moves) or left free; the same choice as R6. |
| Onion skin across panels | Our onion skin already skips holds (panels are drawings). |
| Pitch mode | **Play with subtitles** (the dialogue caption under the picture). |
| To Harmony | **No Harmony export** (user, 2026-10-11). Inside 2Dope, **"Animate this shot"** opens the shot in Draw with the board as the guide underneath (Show animatic), so animation starts on top of the boards. |
| Export movie / PDF | **PDF board pages** (panel number, picture, duration, captions; 1–3 panels per row; our own PDF writer, works offline and on iPad), **PNG zip** (one image per panel + captions CSV), animatic movie with the MP4 export. Final renders leave guide layers out unless switched on. |
| Acts, track changes, EDL/AAF, 3D, thumbnailing pages | Not now. |

## The flow in 2Dope

1. **Animatic tab:** add panels (draw roughly on each, or import board images), group them into
   shots, write dialogue / action / slugging under each, drop in audio, set durations. Play it with
   subtitles.
2. **Animate this shot** → Draw opens that shot with the boards faintly underneath. Or skip the
   animatic entirely and draw from the start, as today.
3. **Time / Motion** refine the shot. Every change to a shot's length ripples through the sequence,
   because it is all one set of comps on one clock.
4. **Export:** the final shot or sequence without the boards, or the animatic with them, when switched on.

## Quick panel input (user, 2026-10-11)

Each board card has its fields right under the picture: **dialogue, action, slugging (timing), notes,
duration**. Tap and type. Return moves to the same field of the next panel, so a scene's dialogue
can be typed in one run. The same fields appear as X-sheet columns.

## Priority (agreed order, 2026-10-11)

1. Workspace tabs: Board · Draw · Time · Motion; timing tools move to Time (Sonnet)
2. Storyboard core: board guide layer, panels with quick captions and durations, Show board in Draw (Opus)
3. Storyboard export: PDF pages, PNG zip + captions CSV (Opus)
4. Audio on the timeline, linked to a panel or free (Opus)
5. Shots end to end (sequence comps) and camera move per panel (Opus)
6. Clipping masks, rails in Draw, QuickShape, effects (iPad benchmark right before effects)
7. Colour panel, asset bin, brush import, phone layout, drawing assist, Blender last

## Plan (replaces R7 in doc 15)

| # | Step | Model |
|---|---|---|
| R7a | Guide layers (`guide: true`, skipped by exports unless switched on) + Show animatic in Draw | Opus |
| R7b | Captions on exposures (dialogue, action, slugging, notes), file + X-sheet columns | Opus |
| R7c | Sequence comps that lay shots end to end (ripple), new shot from panels | Opus |
| R7d | Animatic tab: board cards by shot, reorder, durations, captions, import images as panels, play with subtitles, Animate this shot | Sonnet |
| R7e | Camera move per panel (start / end framing, copy / paste) | Opus |

## Sources

- Toon Boom docs, caption fields: https://docs.toonboom.com/help/storyboard-pro-24/storyboard/caption/about-default-panel-caption.html
- Toon Boom docs, Thumbnails view: https://docs.toonboom.com/help/storyboard-pro-24/storyboard/reference/views/thumbnails-view.html
- Toon Boom docs, Timeline view: https://docs.toonboom.com/help/storyboard-pro-25/storyboard/reference/views/timeline-view.html
- Toon Boom docs, captions in pitch mode: https://docs.toonboom.com/help/storyboard-pro-7/storyboard/pitch/display-caption.html
- Toon Boom docs, thumbnailing page: https://docs.toonboom.com/help/storyboard-pro-25/storyboard/drawing/thumbnailing-page.html
- Local install: `resources\sb_menus.xml` (menu and command names)
