# Deconstruction 07: Procreate Dreams (official handbook)

Source: public handbook at help.procreate.com/dreams/handbook (v2.1, ~35 pages, read 2026-10-09). Summarized in our own words.
**No public API or scripting exists.** Only file I/O: `.drm` projects, `.brushset/.brushlib` brushes, `.procreate` import.
✅ in spec · ➕ gap · ❌ skip

## 1. Structure: two levels
- **Movie timeline** (top level): **tracks** hold **content** (Flipbook, Drawing, Text, Photo, Video, Audio). Upper track = foreground. Content previews draw along the track. Content can be **grouped** (collapsible, with Passthrough blend so it can blend outside the group).
- **Flipbook** (inside one content block): its own multi-track frame-by-frame cel animation with frames, holds, track opacity/blend/masks. Opens in Draw & Paint.
- **Drawing** = a single painted still that fills to the end of the movie; meant for backgrounds you keyframe.
2Dope: ✅ Flipbook ≈ precomp/clip; Drawing ≈ raster layer with one frame. ➕ make "Drawing" (single still) a first-class quick create; ➕ **Convert selection → Flipbook** and **Flipbook → tracks** (= precompose / un-precompose).

## 2. Three timeline modes (their big idea)
| Mode | Purpose |
|---|---|
| **Compose** | arrange/trim content; stage moves here do NOT touch keyframes (a separate offset layer); "Reset" clears compose changes; rotation always around center |
| **Perform** | playhead becomes record; drag/scale/rotate/warp/filter sliders on stage → **recorded live as keyframes** at project FPS. Motion filtering % smooths input; Pencil Pro barrel roll → rotation. Can layer passes (move, then scale). Same-type pass overwrites |
| **Keyframe** | add/edit keyframes, anchor point, easing |
2Dope:
- ➕ **Compose offset separate from animation** = a static "layout transform" on top of keyframes. Very useful: reposition an animated element without breaking its keys. Add as a per-item `layoutOffset`.
- ➕ **Perform (live recording)** for transform AND any slider (opacity, blur…). Ties to EffectCraft's Motion Sketch (doc 04). Include motion-filtering amount. Strong fit with "everything keyframable".
- ❌ Separate modes as UI: keep one timeline (principle 2), but a "Record" toggle gives Perform's power.

## 3. Keyframes & easing
- Keyframe types: Move&Scale (pos/scale/rot), Warp (mesh, add rows/cols), Distort (corner pin), Opacity, Gaussian blur, Sharpen, Noise (clouds/billows/ridges; amount, scale, octaves, turbulence, offset X/Y, **travel = Z through 3D noise**, additive, multichannel), HSB, Lens blur, Volume.
- Multi-param tracks collapse into one row; **Expand** to per-parameter rows.
- "Add keyframe at start" option: first keyframe after start also drops one at content start (instant motion).
- Easing per segment: Linear, Ease in, Ease out, Ease in-out. **Tick marks between keys show spacing** (cadence). "Set all easings" per track. New keys reuse last easing.
- Copy/paste keyframes at playhead onto other content; **Reverse keyframes** (whole content or selection) → ping-pong trick.
2Dope:
- ✅ easing presets + bezier. ➕ **spacing ticks between keyframes** (animators read spacing charts this way; teaches easing visually).
- ➕ "Add keyframe at start" toggle. ➕ Reverse keyframes command. ➕ collapsed/expandable multi-param keyframe rows.
- ➕ Noise "travel" (evolve through 3D noise) param for grain/boil effects.
- Defer: warp mesh/distort keyframes (spec non-goal for v1 puppet/warp) — but corner-pin distort is cheap; consider.

## 4. Flipbook frame editing
- Frames on tracks; current frame highlighted; swipe to scrub; audio scrubs while scrubbing frames.
- **Add frame** smart rules: on empty → new blank; inside a hold → cut hold and new frame; hold the button → jump to end of hold then add; on last frame → adds to every track.
- Frame menu: cut/copy/paste/duplicate, insert, **split held frame**, **fill duration** (extend to next drawing/end), **frame duration** (type a number), clear, delete (deletes whole hold).
- **Free trim**: tap twice → edge handles; drag to change hold; with multi-select, all selected frames retime together (twos/fours fast).
- **Multi-select by drawing a lasso** across frames/tracks with the pencil; then move, copy, **Flip frames** (reverse order).
- Next/prev **drawing** (skips holds); long-press = first/last.
- Track options: opacity, rename, 8 highlight colors, blend mode, **clipping / alpha / luminance mask** (luma = premultiplied 0.299R+0.587G+0.114B).
2Dope: ✅ marquee, holds, exposure, flip/reverse, masks. ➕ the smart Add-frame rules; ➕ **lasso selection on timeline** (pen-native, better than box on iPad); ➕ "fill duration"; ➕ 8 label colors; ➕ luminance mask formula as spec.

## 5. Flipbook mini + scrub wheel (standout UX)
- Timeline strip **undocks** into a floating mini flipbook; snaps to any edge (vertical on sides, horizontal top). Throw to move. Double-tap handle to dock/undock.
- **Scrub wheel** with notches; speed Precise / Medium / Fast.
- **Paint while scrubbing**: hold the wheel with one hand, draw on frames with the pencil (rapid inbetween ideas).
- **Scrub lock**: tap wheel to set a home frame; scrub away to flip, release → snaps back (digital page flipping between keys!).
- Painting on an empty frame auto-creates it.
2Dope: ➕➕ **Scrub lock + flip wheel** is the single best animator feature here. Add to Quick Animate. ✅ our flipbook strip; ➕ make it detachable/edge-snapping.

## 6. Onion skin settings
Per direction (backwards/forwards): frame count, opacity, **color tint toggle + color**; **blend primary frame** option; **show onions while scrubbing** toggle; per-track and movie-level settings.
➕ add "blend primary frame" and "onions while scrubbing" toggles; ✅ rest.

## 7. Draw & Paint
- Tools: Paint, Smudge, Erase (all use any brush); hold an unselected tool to **transfer current brush to it**.
- Sidebar size + opacity sliders with **up to 4 memory points each per brush**; fine-adjust by dragging sideways then up/down.
- Brush libraries → sets → brushes; import `.brushset`/`.brushlib`; search; Recent set. 200+ animation brushes (sketch, ink, paint, texture, pattern, environment, "Wiggle", "Looper").
- Settings: pressure curve, smoothing, **dynamic brush scaling** (relative to canvas vs screen), brush cursor (hover/paint, high contrast / active color / per brush), finger painting toggle, scrub speed.
- Layers inside a drawing: groups, blend, opacity, **alpha lock**, clipping, layer mask, merge (pinch two layers), flatten group.
- Select: automatic (hold + drag to change threshold, same as our hold-and-slide), freehand/polygon, rect, ellipse (second finger = square/circle).
- Filters (destructive in drawing): HSB, lens blur, gaussian, noise, sharpen.
2Dope: ➕ **size/opacity memory points**; ➕ precision slider (drag sideways for fine); ➕ **brush scaling relative to canvas vs screen**; ➕ hover cursor styles; ➕ "transfer brush to tool" (paint/erase same brush); ✅ alpha lock, clipping, masks; ✅ hold-drag threshold (our wand gesture matches).

## 8. Gestures & keys
- 2-finger tap undo (hold = rapid), 3-finger redo, quick pinch = fit, 4-finger tap = fullscreen preview, double-tap timeline = zoom to area, **3-finger horizontal = time scale, vertical = track height**, flick playhead left = play from start, second finger while dragging = snapping (stage center/edges, rotation 15°/30°).
- Undo history persists after closing; **Recovery points** auto-saved when you undo 3+ then act (last 3 kept, shareable as file). History depth setting (10…infinite).
- Keyboard: fully remappable, search, up to 4 modifiers, conflict → old binding becomes unassigned. Rich timeline nav set (next/prev content, ±1 second, zoom H/V, nudge).
2Dope: ✅ most gestures already in spec. ➕ **auto recovery point on "undo 3+ then edit"** (protects against branch loss; cheap with our command journal); ➕ persistent undo across sessions; ➕ 3-finger time-scale / track-height; ➕ flick-to-play.

## 9. Project & export
- FPS presets 12/15/24/30/50/60/120 + custom; resolution up to 3840²; Stage + **Backstage** (area outside frame for off-screen elements).
- Playback: Loop / Ping-pong / One shot; zoomed timeline loops visible range.
- Export: Video (H.264, HEVC w/ alpha, ProRes incl. 4444 w/ alpha; mp4/mov), GIF (loop/ping-pong), current frame, frames as images; resolution presets; ping-pong export; PCM/AAC audio; preview with scrub bar before render.
2Dope: ✅ mostly covered. ➕ Backstage view (show outside canvas dimmed); ➕ ping-pong playback + export option; ➕ export preview scrubber.

## Not in Dreams (2Dope advantages to keep)
X-sheet view, expressions, precomp time remap, line/fill planes and auto fill, vector layers, Blender handoff, mattes/passes, parenting/nulls, open JSON format, web/no-install.

## What the 1.0.11 package confirms (2026-10-26)

Static REA pass over the local `.ipa` — no launch, no decompilation. Details and evidence:
[research/procreate-dreams-1.0.11](../research/procreate-dreams-1.0.11/README.md).

- The app ships five onboarding videos named exactly **welcome, draw, gestures, keyframe, perform** —
  the five topics above are the product's own first-run curriculum.
- Bundle `au.com.savageinteractive.Dreams`, 1.0.11 (17168), iPad-only. Its documents are
  **`.dream`/`.drm`** (`si.savage.dreams.document`) and **`.alpine`** (`si.savage.alpine.document`).
  A `.drm` starts with a `Valkyrie` chunk header and embeds JPEG/PNG frames with the project data.
- The engine is Procreate's **Valkyrie** renderer (430 classes) plus **Phoenix** tile writing,
  **DisplayList** vector/text drawing and a **Compositor** shader set — four Metal libraries.
- Swift metadata names the model: tracks, content, entity/track keyframes, `keyframe_as_attribute`,
  `allow_keyframe_subframes`, `onionSkin` with `blendPrimaryFrame` and
  `max_onion_skins_in_direction`, `perFrameColorPalette`, masks and clipping, `export_codec_limit`,
  and quick/advanced export families.
- The layer cell set includes **Mesh**, **TextureSet** and **MaterialLayer** besides paint layers; the
  brush repository ships 19 preset groups (Recent, Sketching, Inking, Drawing, Painting, Artistic…).

Nothing here contradicts the handbook; it adds the data-model names and confirms the onboarding and
brush grouping.

