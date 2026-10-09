# Deconstruction 04: Craft apps (from their CLI command catalogs)

`C:\Program Files\{DesignCraft,FilmCraft,EffectCraft}` hold compiled `.exe` only (no source).
Each ships a `*-cli.exe commands` listing every command with its parameters, which is a clean, legit feature catalog.
Full dumps saved next to this file in `craft-commands/` (designcraft 4471 lines, filmcraft 675, effectcraft 665).
- EffectCraft source: `C:\Users\dusto\effectcraft` (see doc 03).
- DesignCraft source: `github.com/storytold/designcraft` (from its CLI). Others likely same org; not downloaded.
- ArtCraft (`AppData\Local\ArtCraft`, v0.41.0) is a Tauri app for AI generation (Sora etc.); no `--help`, no drawing tools. Low relevance to 2Dope.
✅ in spec · ➕ gap · ❌ skip

## EffectCraft: brushes and animated strokes
**`paint.stroke`** is the best single template for a 2Dope stroke record:
`points [[x,y,pressure]]`, `time|frame`, `duration` (drawing time, for write-on), color, diameter, angle, hardness, roundness, spacing, opacity, flow, blend mode, channels (RGBA/RGB/Alpha), **durationMode: constant | writeOn | singleFrame | custom**, eraseMode (layer+paint / paint only / last stroke), **sizePressure + minSize, opacityPressure, flowPressure**, clone source/offset/time shift.
- ➕ Record **point timestamps** while drawing → "replay as write-on" for free (great for teaching + motion graphics).
- ➕ `durationMode` maps to animation: singleFrame = normal drawing frame; constant = stays forever (background/held element); writeOn = animates in.
- ➕ Paint overlay options: `overlayOpacity`, `overlayDifference` (show a source frame in difference mode) → **light-table / onion-skin difference mode** for checking in-betweens.

Vector stroke options (shape layers):
- ➕ `shape.stroke.taper`: start/end length, start/end width %, start/end ease %. units px or %.
- ➕ `shape.stroke.wave`: amount, wavelength or cycles, phase. (Animate phase = crawling line.)
- ➕ `shape.dashes`, and shape items: trim, repeater, round corners, offset, pucker, twist, zigzag, **wiggle**, merge.
- ➕ **`motion.sketch`**: draw a path with the pen in real time → becomes position keyframes (captureSpeed %, smoothing). Animator-friendly; add to 2Dope transforms (milestone 3).
- ✅ `layer.timeStretch` (percent/duration, hold in/current/out, reverse), `enableTimeRemap`, `freezeFrame` = our clip time settings.
- ✅ Animation presets (`anim.savePreset/applyPreset`) = our effect/expression preset library; ➕ also store keyframe presets.

## DesignCraft: vector editing gestures
- ➕ **`path.smooth`**: drag a brush along part of a path → refits just that stretch with fewer, smoother anchors (tolerance). Ideal cleanup tool for vector animation lines.
- ➕ **`path.erase`**: drag along a path to delete only that stretch.
- ➕ `path.split` (scissors), `path.close`, `path.addAnchor/deleteAnchor/convertAnchor/moveAnchors`, `object.cornerOptions`, `object.pathfinder` (boolean ops), stroke styles (`strokeStyle.new`: reusable dash/line styles).
- Takeaway: give 2Dope's vector layer **gesture-based** edits (smooth brush, erase brush, scissors) instead of point fiddling. Fits pen-first design.

## FilmCraft: timing and editorial
- ✅ `clip.frameHold` / `frameHoldOptions` (hold on in/out/playhead) / `insertFrameHoldSegment` = our hold frames.
- ✅ `clip.speedDuration` with reverse + ripple; `timeline.rateStretch` (drag edge to change speed).
- ➕ **Time interpolation per clip: frameSampling | frameBlending | opticalFlow**. For 2Dope: sampling only (animation must stay crisp); keep as an explicit, default-off option for imported video reference.
- ➕ Slip / slide / roll / ripple edits on clips (`timeline.slip|slide|roll`, `trim.rippleNext`). Slip = change which frames of a cycle play without moving the clip. Valuable for our clips (milestone 5).
- ✅ Markers: name, comment, color, durationFrames (same as Harmony; confirms doc 01 marker fields).
- ✅ `audio.toggleScrubbing`, `clip.generateAudioWaveform` = our live scrub + waveform layer.
- ➕ `transcript.generate`: speech → text. Later idea: dialogue notes auto-filled into the X-sheet sound column.
- ✅ Interchange exports (EDL, FCP XML, OTIO, AAF). ➕ OTIO export of the 2Dope timeline is cheap and opens in many editors.

## Shared pattern across all four apps (adopt this)
- Every action is a **command with an id + JSON params**, listed by `commands`, described by `describe`, runnable from CLI, a localhost control port, and **MCP**.
- ✅ 2Dope spec already routes everything through a command system. ➕ Expose the same three front-ends (UI, CLI, MCP) and a `commands` listing. Makes testing, teaching scripts, and Claude/Codex automation trivial.

## Decisions
- [ ] Stroke record = EffectCraft `paint.stroke` shape (with per-point timestamps)?
- [ ] Vector gesture tools (smooth brush, erase brush, scissors) in milestone 7?
- [ ] Motion sketch in milestone 3?
- [ ] Clone the open-source Craft repos (DesignCraft is public on GitHub) for deeper reading?
