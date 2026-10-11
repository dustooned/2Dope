# 08: Procreate Dreams, clean-room behavior spec

**Source:** the public handbook only (help.procreate.com/dreams/handbook, v2.1, all 35 pages re-read 2026-10-11). Nothing from the app, its files or its binaries. Everything below is our own wording of *observable behavior*, written as rules we can build and test.
Supersedes the summary in [07](07-procreate-dreams-handbook.md), which stays as the short version.

**Status key:** ✅ 2Dope has it · 🔶 partly · ⬜ not yet · ❌ we choose not to
**Milestone key:** M2 Blender handoff · M3 keyframes/compose/perform · M4 flipbook polish/mini · M5 tracks/groups/masks · M6 export/project polish

---

## A. Model: what the app is made of

| ID | Rule (behavior) | 2Dope |
|---|---|---|
| A1 | Four areas: **Theater** (project browser), **Timeline**, **Stage** (viewport), **Canvas** (paint mode). | 🔶 no Theater; recents list is a gap (M6) |
| A2 | A movie has **tracks** that stack like layers; higher track = nearer the front. Tracks hold **content**. | ⬜ M5 |
| A3 | Content types: Flipbook, Drawing, Text, Photo, Video, Audio. | 🔶 flipbook strip only |
| A4 | **Drawing** = one still that fills from the playhead to the movie end. **Flipbook** = self-contained frame-by-frame animation with its own tracks. | ⬜ Drawing as quick-create (M5) |
| A5 | **Stage** is the frame; **Backstage** is everything outside it. Content may be larger than the stage or animate on/off. Backstage visibility slider, default 20%; it never makes already-transparent content more opaque. | ⬜ M3 |
| A6 | A canvas has its own bounds (yellow outline) which can differ per Drawing/Flipbook; the Stage never moves. | ⬜ M3 |
| A7 | New movie presets: 16:9, 21:9, 9:16, 1:1, "screen size"; resolution tier per preset (4K default); start as **Flipbook** or **Empty**; per-preset FPS and duration override. | 🔶 fixed 1920×1080 |
| A8 | FPS presets 12 Frame-by-frame, 15 Anime, 24 Cinema, 30 TV, 50 PAL, 60 NTSC, 120 Mobile, or custom. Max resolution 3840×3840 (less on weak hardware). | ✅ presets; ⬜ names, custom |
| A9 | New Flipbook starts with exactly **FPS** frames (one second). | ⬜ M4 |
| A10 | Movie duration is a settable window; drag the end bar, type h/m/s, or **Fit to content**. | ⬜ M3 |

## B. Timeline

| ID | Rule | 2Dope |
|---|---|---|
| B1 | **Three modes** on one timeline: *Compose*, *Perform*, *Keyframe*. All modes can add, move, trim, multi-select. Keyframe rows show only in Perform and Keyframe. | ❌ as modes (principle 2); ✅ Record toggle idea, see D |
| B2 | Playhead is a full-height line in Compose, a **record dot** in Perform, a **clapperboard** in Keyframe. Tap/drag moves it; the content under it becomes active (bounding box on stage). | ⬜ M3 |
| B3 | **Flick the playhead left** = play from start. | ⬜ M4 |
| B4 | Playback modes: **Loop, Ping-pong, One-shot**. When the timeline is zoomed in, playback loops the *visible range* (optional). | 🔶 loop only (M4) |
| B5 | Move content along a track by hold-and-drag; dragging to another track changes depth. Moves stop at neighbors. | ✅ in strip, ⬜ across tracks (M5) |
| B6 | **Trim**: tap content, tap again, handles appear; red edge highlight on hold. Trim stops at the content's own max length or a neighbor. Non-destructive: extending later restores what was trimmed. | 🔶 hold resize ✅; non-destructive restore ⬜ |
| B7 | **Free Trim**: a second finger while trimming pushes/pulls the adjacent content so neighbors keep their offsets. Label shows at top. Keyboard "alt hold" does the same. | ⬜ M4 (ripple) |
| B8 | **Split** at playhead: new piece begins on the playhead frame; playhead lands on the second piece. | ✅ for holds |
| B9 | Fill duration: extend to the next content or the movie end. | ⬜ trivial, M4 |
| B10 | Remove empty section: close the gap where held, shift later content left. | ⬜ M4 |
| B11 | Keyboard nudging: *Nudge* moves one frame and **stops at neighbors**; *Push* moves one frame and **shoves neighbors**. Nudge cannot pass movie/group bounds; push can. Same for *Extend/Contract 1 frame* (min 1) and *Push/Pull 1 frame*. | ⬜ M4 |
| B12 | Zoom: pinch, quick-pinch = fit, double-tap = zoom closer there, 3-finger horizontal = time scale, 3-finger vertical = row height, slide on ruler = time scale. Keys: H/V zoom centered on playhead; hold to zoom smoothly; center on playhead. | 🔶 |
| B13 | Navigation keys: next/prev frame, next/prev content, ±1 second (uses FPS), go to start/end, up/down track, top/bottom track. | 🔶 frame ✅; rest ⬜ |
| B14 | Hover scrubbing with a hover-capable pen (toggle). | ⬜ pen hover event, cheap on iPad, M4 |
| B15 | Audio plays while scrubbing the flipbook; audio imports decode to 48 kHz PCM. | ⬜ audio is out of scope until after M6 |

## C. Selection and clipboard

| ID | Rule | 2Dope |
|---|---|---|
| C1 | **Multi-select by drawing** on the timeline with the pen. A glowing red trail; selected items get a red outline. Drawing across unselected items **adds**, across selected items **removes**. Works on tracks, content and keyframes in any mode, and on frames inside a flipbook. | 🔶 box marquee ✅; lasso + add/remove ⬜ (M4) |
| C2 | Finger fallback: setting "Multi-select with finger"; in a flipbook, tapping frames one by one also works. | ✅ click/shift |
| C3 | **Reload last selection**: long-press the Multi-select button restores the previous set (timeline and flipbook). | ⬜ cheap, M4 |
| C4 | Long-press on any selected item opens the menu for *that* type (hold a keyframe → keyframe menu). Menu: cut, copy, paste, duplicate, **Flip** (reverse order and positions), group, convert. | 🔶 |
| C5 | Dragging a selection moves it as one; dragging handles retimes all (Free Trim applies). In a flipbook, selected frames can be dragged to another track, placed respecting left-to-right then bottom-to-top. | ⬜ multi-track M5 |
| C6 | Paste keyframes: copy, move playhead to the target's relative start, paste; only parameters the target supports are applied. | ⬜ M3 |
| C7 | Paste in a flipbook goes to the **next free frame space** on the active track. Duplicate puts the copy directly right. | ✅ |

## D. Keyframes, Perform and easing

| ID | Rule | 2Dope |
|---|---|---|
| D1 | Keyframe types: **Move & Scale** (position, scale, rotation), **Warp** (mesh), **Distort** (corner skew), **Opacity**, **Gaussian blur**, **Sharpen**, **Noise**, **HSB**, **Lens blur**, **Volume** (video with audio only). | ⬜ M3: move/scale/rotate, opacity first; blur/HSB/noise next |
| D2 | Adding a first keyframe makes a **keyframe row** under the content and a keyframe at the playhead using the content's *current* value. | ⬜ M3 |
| D3 | **Add keyframe at start** (setting, default on): the first keyframe after frame 0 also drops one at the content's first frame so motion starts immediately. | ⬜ M3 |
| D4 | After a keyframe is set, moving the playhead to a new spot turns the marker **red** (unset); tapping it commits a keyframe there. Drag a keyframe to retime. | ⬜ M3 |
| D5 | Rows with several parameters (Move&Scale, Noise, HSB, Lens blur) are **one row that expands** into one row per parameter; delete a parameter row alone. | ⬜ M3 |
| D6 | Delete: hold a keyframe → delete keyframe; hold empty row → delete row. | ⬜ M3 |
| D7 | **Easing is per segment** (between two keys): Linear, Ease in (slow start), Ease out (slow end), Ease in-out. Holding between two keys shows the label and **tick marks showing frame spacing**. Holding one key sets the segment after it. New keys inherit the **last used** easing. **Set all easings** on a row; on a multi-param row it sets every parameter. | ⬜ M3 |
| D8 | **Reverse keyframes**: whole content (mirror about the content's center) or a selection (mirror about the selection's center). Copy+paste+reverse = ping-pong. | ⬜ M3 |
| D9 | **Perform**: with the record dot armed (slow pulse), any drag on stage or any filter slider writes keyframes **sampled at the project FPS** while the pen is down; lifting pauses; touching again resumes. Multiple passes stack (move, then scale). A pass **overwrites** an earlier pass of the same type. A performance longer than the content **extends** it when possible. | ⬜ M3 |
| D10 | Perform options: **Motion filtering** % (0 = every wobble kept, higher = smoother keys); **roll sensitivity** for barrel-roll rotation (toggleable). | ⬜ M3 (roll ❌ until hardware) |
| D11 | Transform handles in Perform/Keyframe: corner = uniform scale, side = non-uniform and **dragging past the opposite side flips**, handle above = rotate about the **anchor point**; rotation rotates from a tapped corner's handle. | ⬜ M3 |
| D12 | **Anchor point** per content, editable only in Perform/Keyframe; snaps to sectors with a second finger. Compose always rotates about the center. | ⬜ M3 |
| D13 | **Snapping** (second finger): stage center, edges; rotation snaps at 30° around the anchor. *The handbook also says 15° in Compose; the two pages disagree. We take 15° as the default and make it a setting.* | ⬜ M3 |
| D14 | Live filters are **non-destructive**; unavailable on content with *Passthrough* blend. Content-level opacity (options menu) multiplies *after* opacity keyframes. | ⬜ M3/M5 |
| D15 | Noise: Clouds, Billows, Ridges; amount, scale, octaves, turbulence; advanced: offset X/Y, **travel** (move through the third axis), additive (translucent), multichannel (color). | ⬜ M3+ |
| D16 | Lens blur: radius, brightness, contrast; bright areas bloom (unlike Gaussian). | ⬜ later |
| D17 | Warp: mesh drag; extra rows/columns can be added but **not undone** short of restarting that keyframe row. Distort: corner drag inside the bounding box. | ⬜ later (spec non-goal v1) |

## E. Compose (layout without disturbing animation)

| ID | Rule | 2Dope |
|---|---|---|
| E1 | In Compose, moving/scaling/rotating/flipping content on stage changes a **separate offset**, not keyframes. Keyframes are untouched; **Reset** clears the offset. | ⬜ M3: `layoutOffset` per item |
| E2 | Compose bounding box is blue; rotation handle above; rotation is always about the center; side-drag past opposite = flip. | ⬜ M3 |
| E3 | Flip horizontal/vertical from the box menu in every mode, about the anchor point. | ⬜ M3 |
| E4 | Stage nudge keys: small, 1 px, 100 px in each direction. | ⬜ M3 |

## F. Flipbook (frame-by-frame)

| ID | Rule | 2Dope |
|---|---|---|
| F1 | A flipbook has multiple **tracks** (3 visible at a time, scroll for more), each with its own frames. Active track marked in its left checkbox. Tracks: visibility, reorder by drag, add above current, default 100% Normal. | 🔶 one track; 2Dope has line/fill planes instead (M4/M5) |
| F2 | Track options (non-destructive): opacity, rename, **8 highlight colors**, blend mode, mask (clipping / alpha / luminance, invertible), cut/copy/paste/duplicate/delete; paste/duplicate land **above** the active track. | ⬜ M5 |
| F3 | **Luma** for the luminance mask = (R·a)·0.299 + (G·a)·0.587 + (B·a)·0.114. | ⬜ M5, formula taken as given |
| F4 | **Add frame** (the smart button): (1) on an empty (grey) frame → blank white frame there; (2) inside a hold → cut the hold here and start a new frame; (3) **press-and-hold** while inside a hold → jump to the hold's end and add after; (4) on the final frame → add one to *every* track, except when the last held frame of a track is also the last of the flipbook (then it just cuts and adds). | 🔶 simple add ✅; smart rules ⬜ M4 |
| F5 | **Insert frame**: new frame right of current, pushes the rest right. | ✅ |
| F6 | Frame menu: cut, copy, paste, duplicate, insert, split (on holds), fill duration, **frame duration (type a number)**, track options, clear (keeps frame), delete. | 🔶 |
| F7 | **Clear** empties a frame but keeps it. **Delete** removes it and pulls later frames left *until they hit a frame with content*; deleting inside a hold deletes the whole hold. | ⬜ M4 (gap-aware delete differs from ours) |
| F8 | Swipe frames to scrub (fast swipe = fast). Current frame highlighted. | ✅ |
| F9 | **Next/Prev drawing** skips holds; **hold** the button = last/first drawing. | ✅ step, ⬜ first/last (M4) |
| F10 | Painting on an empty frame **creates** it, but cannot extend past the flipbook length. | 🔶 |
| F11 | **Flip frames** (reverse the selected frames' order); duplicating a forward motion then flipping it makes a loop. | ✅ moveExposure; ⬜ explicit Flip, M4 |
| F12 | Converting: selected content → **Convert to Flipbook** (no audio); Flipbook → **Convert to tracks**. | ⬜ M5 |
| F13 | Double-tap the title (or handle) returns to the timeline / swaps docked and mini flipbook. | ⬜ M4 |

## G. Flipbook mini and scrub wheel

| ID | Rule | 2Dope |
|---|---|---|
| G1 | Flipbook UI **undocks** by its handle and floats; dropping near an edge softly locks it. Left/right edge = vertical (frames top→bottom), top = horizontal (left→right). Drag to bottom or double-tap handle = docked again. Remembers orientation until you leave the flipbook. It can be **thrown** and stops at the edge. | ⬜ M4 |
| G2 | The size/opacity sidebar swaps sides when the mini sits on that side. | ⬜ M4 |
| G3 | Mini controls: **scrub wheel** (notches), play/pause, prev/next drawing. Horizontal drag left = forward in time; vertical drag up = forward. | ⬜ M4 |
| G4 | **Paint while scrubbing**: pen draws on the frame under the wheel while a finger holds the wheel. | ⬜ M4 (the one to prioritize) |
| G5 | **Scrub lock**: tap the wheel to set a home frame (notch turns pink; toast names the frame). Dragging away fills a shaded span from home; **release snaps back**. | ✅ done (L key) in 2Dope; ⬜ wheel UI |
| G6 | Scrub speed: Precise / Medium (default) / Fast; notch spacing changes with the mode. | ⬜ M4 |
| G7 | Onions during scrubbing are a separate toggle ("scrub visibility"). | ⬜ trivial, M4 |

## H. Onion skins

| ID | Rule | 2Dope |
|---|---|---|
| H1 | Per-direction (backwards / forwards): frame count, opacity, tint on/off and color. | ✅ |
| H2 | **Blend primary frame**: include the current frame in the onion blend (helps when it is opaque). | ⬜ M4 |
| H3 | Toggles at track level and at movie level. | 🔶 movie only |

## I. Draw & Paint (canvas)

| ID | Rule | 2Dope |
|---|---|---|
| I1 | Tools **Paint, Smudge, Erase**; each remembers its own brush; tapping a selected tool opens its brush list. Hold an unselected tool to transfer the current brush. Pen double-tap swaps Paint/Smudge/Erase (Eraser → last tool). | ✅ paint/erase; ⬜ smudge, transfer |
| I2 | Size (upper) and opacity (lower) sliders on a sidebar (left or right): tap to jump, hold and **slide sideways** then up/down for fine steps. **Up to 4 memory points** per slider per brush, with keys to step to the next/previous memory; ±5% keys. | ⬜ M4 |
| I3 | Pressure curve, smoothing (**Stabilization** = moving average; **Motion filtering** = tremor compression; **Expression** = how much natural motion returns), all overridable per brush. | ✅ stabilizer; 🔶 |
| I4 | **Dynamic brush scaling**: brush keeps its on-screen size while zooming, or is *relative to canvas* (recommended for brushes designed that way). | ⬜ M4 |
| I5 | Cursor: show while hovering / painting / both; outline: high-contrast / active color / per-brush; hover shows size, shape, texture, tilt, azimuth. | 🔶 |
| I6 | Finger painting toggle (off by default for pen users). | ✅ |
| I7 | Drawing layers: groups, blend, opacity, alpha lock, clipping, mask, pinch-to-merge. | 🔶 our planes; ⬜ layers |
| I8 | Select tools: automatic (hold + drag right = bigger tolerance), freehand/polygon, rectangle, ellipse (2nd finger = square/circle). Selection mask opacity setting. | ⬜ M4+ |
| I9 | Transform: uniform, freeform, distort, warp. Filters (HSB, lens blur, Gaussian, noise, sharpen) are applied **on exit** from the canvas. | ⬜ later |
| I10 | Color: previous-color swap key, color panel, ColorDrop. | 🔶 |
| I11 | Crop & resize canvas, with resampling. Insert photo/file into canvas. | ⬜ later |
| I12 | Keyframe effects can be shown/hidden while editing a drawing. | ⬜ M3 |

## J. Project, history, export

| ID | Rule | 2Dope |
|---|---|---|
| J1 | **Undo** by 2-finger tap (hold = rapid, with a settable start delay); **redo** 3-finger tap; toggle in prefs. History survives closing the app. | 🔶 session-only history |
| J2 | **History depth** 10 / 20 / 50 / 100 / 250 / 1000 / infinite (bigger = bigger files). | ⬜ M6 |
| J3 | **Recovery points**: when you undo ≥3 steps and then do anything, a snapshot is stored. Newest **3** kept. Share = `.drm` snapshot without history. | ⬜ M6 (we have versions) |
| J4 | Full undo history only leaves the app via an explicit Theater share option. | ⬜ |
| J5 | Share presets: Video (.mp4, project settings), animated GIF, **frames as images** (folder named after the movie), current frame (PNG), native project, Advanced. | 🔶 frames ✅ |
| J6 | **Advanced export**: Preview button (greyed until a change), preview bar of thumbnails you scrub, preview window you can zoom/pan; Cancel / Share. | ⬜ M6 |
| J7 | Video: H.264, HEVC (alpha), ProRes variants (alpha on 4444, .mov only); container mp4/mov; one-shot or ping-pong; PCM or AAC audio; resolution presets (document, 720p, 1080p, 4K, custom locked to aspect). | ⬜ M6 (WebCodecs) |
| J8 | GIF: frame duration auto (1000/FPS rounded to 10 ms) or 10/50/200/500 ms; loop or ping-pong; dithering (diffuse = Floyd-Steinberg, stable = ordered matrix of 2×2 doubling per step, intensity); transparent with alpha threshold; palette size 2…256 or custom palette. | ⬜ M6 |
| J9 | Image sequence formats PNG, JPG, TIFF, TGA, BMP; transparency needs Stage → transparent background on. | 🔶 PNG; ⬜ TGA/TIFF |
| J10 | Stage prefs: background color, transparent background, backstage visibility, timecode readout (h:m:s:f) on/off. | 🔶 |
| J11 | Imports: JPG, PNG, TIFF, GIF (animated GIF → Flipbook), HEIC, TGA, `.procreate`; video H.264/HEVC/ProRes; audio list; fonts OTF/TTF/TTC. Separate audio from video onto a track above. | ⬜ GIF→flipbook cheap (M6) |

## K. Keyboard

- Fully remappable, searchable list; **up to four modifiers + one key**; assigning a taken key **unassigns the old one**. System keys (undo, redo, cut/copy/paste, duplicate) cannot be remapped.
- Groups: General, Timeline, Stage, Draw & Paint, System. The full command list is in the handbook (see section B13 and B11 for the timeline set, D/E for stage, I2 for draw).
- 2Dope: 🔶 fixed keys; remapping ⬜ M6.

---

## What this adds beyond doc 07 (new findings)

1. **Nudge vs push** semantics (B11) and **Free Trim** with a modifier (B7): clear, testable ripple rules for our strip.
2. **Add-frame smart rules** (F4) and **gap-aware delete** (F7): our delete currently closes the gap fully; Dreams stops at the next populated frame.
3. **Multi-select add/remove by drawing over** (C1) plus **reload last selection** (C3).
4. **Perform overwrites same-type passes and extends content** (D9). Define this precisely before M3.
5. **New keys inherit last easing** and **set-all-easings** (D7).
6. **Content-level opacity multiplies after keyframed opacity** (D14): matters for how our compositor orders operations.
7. **Backstage visibility** does not raise opacity of transparent content (A5).
8. Handbook inconsistency: Compose snap angle **15° vs 30°** (D13). Log it, make it a setting.
9. **Scrub lock shaded span** from the home notch (G5) is a nice cue we didn't have.
10. Recovery points are **undo≥3 then act, keep 3** (J3): cheap with our command journal.

## Suggested build order from here (for decision)

| Order | Slice | Why now |
|---|---|---|
| 1 | **Memory fix** (not from the handbook) | Real blocker found in testing; do it first |
| 2 | **M2 Blender handoff** | Spec principle 4; unique advantage Dreams lacks |
| 3 | **M4 flipbook polish**: scrub wheel + paint-while-scrubbing, mini flipbook, smart Add frame, ripple/Free Trim, lasso, size/opacity memory points | Highest animator value per effort; most pen-native |
| 4 | **M3 keyframes**: layout offset, transform keys, easing with spacing ticks, Perform, reverse | Biggest block; needs Opus-level data-model care |
| 5 | **M5 tracks/groups/masks**, **M6 export/project** | After the model settles |

## Clean-room rules we are following

- Handbook text is behavior description; we re-state it, never copy passages or images.
- We don't open, parse or reproduce `.drm` files or any app binary. If we ever want `.drm` import, that needs a separate legal review.
- Names we reuse are generic animation terms (Flipbook, Perform, Compose) only where the user wants the familiarity; the product can rename them (e.g. "Record" instead of "Perform").
