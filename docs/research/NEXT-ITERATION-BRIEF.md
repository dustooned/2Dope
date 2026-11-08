# Next iteration brief (for Claude Code)

2026-10-31 · implementation brief derived from REA. Read the two companion reports first:
[layer systems](layer-systems/README.md) and [export settings](export-settings/README.md), plus the
existing [motion/draw synthesis](motion-mograph-integration-2026-10-31.md).

Work in `E:\2026\Dev\Apps\2Dope\beta`. Read `AGENTS.md`, the top dated section of `HANDOFF.md`, then
`git status --short --branch`. The tree may contain another session's Story/layer work: preserve it.

## Goal

Move Draw's layer system toward Procreate and Animate's layer stack toward Dreams-with-Harmony:
tracks you can scan, art layers you can see, and effects where you work. Export gets a smaller,
format-aware sheet in the same pass (or the next one).

## A. Draw layer panel (Procreate-like) — no schema change first

From the REA: the row carries state inline; destructive actions hide behind a slide.

1. **Row anatomy** (`src/ui/layercards.ts`, `src/style.css`): thumbnail · name (+ inline rename) ·
   secondary state line (opacity/blend) · visibility · lock · alpha lock · clipping indicator ·
   depth shading. Keep the existing actions working.
2. **Swipe actions**: Duplicate, Clear, Delete (Procreate's set; add "Select Contents" only if the
   selection model supports it). One undo step each.
3. **Reorder**: long-press drag, with the dragged row lifted; no accidental paint gestures.
4. **Header**: `+ Layer`, layer options as a popover: Select All, Merge Down, Clipping Mask toggle,
   Reference layer on/off, Blend mode.
5. **Alpha lock + clipping** already exist in the model (`core/comp.ts`); surface them as toggles and
   badges. Do not build new mask maths.
6. **Layer groups**: second commit, behind a deliberate schema addition (see "Decisions").

Acceptance: a student can reorder, duplicate, merge, clear, lock, alpha-lock, clip and rename without
opening Motion; every action is one undo step; the panel keeps working on phone width and with the
Lite layer limit.

## B. Animate layer/track panel (Dreams + Harmony)

From the REA: Dreams is track-first (`add/delete/duplicate/solo/mute/hide track`, track options,
"convert drawing layers to tracks") and its tracks have types; Harmony separates line and colour art.

1. Panel lists **tracks** (existing comp layers) with: name, type, visibility, lock, mute/solo for
   drawing tracks, and a disclosure control.
2. Expanding a drawing track shows its **art layers**: Ink and Colour rows, each with visibility,
   tint/opacity summary and an **Effects** entry that opens the existing effects panel for that layer.
3. Tracking state must stay in sync with Motion and Timing (one model, no copies).
4. Track type is labelled (drawing / media / camera / anchor) so painting and Flipbook can refuse
   the wrong kind with a clear message, as Dreams does.

Acceptance: from Animate, a student can see which track and which art layer they will paint on, hide
Ink or Colour, open that layer's effects, and the same state shows in Motion — with one undo step per
change.

## C. Export settings (Share)

1. Split the sheet by format: show only the settings that format needs (Procreate's pattern).
2. Add presets: **Web video** (MP4 H.264, fit 1080p, project fps, High), **Animatic** (720p,
   Medium), **Master** (full size, H.264/HEVC, optional alpha), **Frames** (PNG RGBA ZIP).
3. Expose a small set: Resolution (Fit/Half/Full/Custom), Quality (Good/High/Studio), Format, Alpha
   where supported, Range (all/work area). Do not add raw bitrate.
4. Keep every existing format working; no new encoders required.

Acceptance: the summary line still predicts size/format; the chosen preset is remembered per device;
GIF/APNG/PNG/Blender/backup paths unchanged.

## D. UI cleanup (only what this pass touches)

Mode bar labels at all widths; transport order (Play · ◀ frame ▶ · Range) consistent across Draw,
Animate, Timing, Motion; the Draw bottom bar ≤ 8 items. Do not start the Ink/Colour rename — the
naming decision is still open.

## Decisions needed from the owner

- **Layer groups**: schema change. Options: (a) additive optional `group` id on layers + one level of
  nesting, (b) full nested tree. Recommend (a) first.
- Whether "Select Contents" is worth building before multi-select lands.

## Constraints

- Preserve: one undo step per completed edit, autosave notification, residency before pixels,
  deterministic randomness, Line/Fill separation, `.2dope` migration, Lite limits, touch workflows.
- Effects: the two new ones (roughen, blur) still need a browser pixel fixture; add it if you touch
  the effects panel.
- Checks: `npm test`, `npm run build`, then the affected fixtures on a dev server at
  `127.0.0.1:5217` (`npm run test:browser -- --base http://127.0.0.1:5217`). Never clear an existing
  project's storage. If a build/test dies with `spawn EPERM` on Windows, rerun outside the sandbox.
- Update `src/ui/manualtext.ts` + `UPDATES`, and the dated `HANDOFF.md` section. No commit or push.

## Suggested order

1. Draw row anatomy + swipe actions + reorder (A1–A3).
2. Animate track + art-layer panel (B).
3. Export presets (C).
4. Groups (A6) after the panel is settled.
5. Cleanup (D) in the gaps.
