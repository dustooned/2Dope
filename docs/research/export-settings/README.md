# Export settings: Procreate, Dreams, Harmony — and what 2Dope should expose

2026-10-31 · REA/static inspection for the next Share iteration. Reference only; nothing copied.
Companion: [layer systems](../layer-systems/README.md), [brief](../NEXT-ITERATION-BRIEF.md).

## What was inspected

| Source | Method | Evidence |
|---|---|---|
| Procreate 5.4.9 IPA | shipped `en.lproj/Localizable.strings` (229,535 B) + `LayersResources` decode | format/setting vocabulary below |
| Dreams 1.0.11 IPA | `en.lproj/Localizable.strings` (113,466 B) | Quick/Advanced export, codec, quality, bitrate |
| Harmony Premium (installed) | `%APPDATA%\Toon Boom Animation\Toon Boom Harmony Premium\Harmony Premium-pref.xml` | last export choices, as persisted |
| Storyboard Pro 24.0.1 | previously read `resources\*.xml` (see its README) | PDF/panel export, not re-read here |

Limits: strings give **labels**, not values. Where a control's options are code-built (Procreate's
export sheet has no nib), we know the name but not the list. Harmony's values are a real saved
configuration, but one user's last choices, not its full option set.

## 1. Procreate

Formats named in the shipped strings:

| Family | Names |
|---|---|
| Still | **PSD**, **PDF**, **JPEG**, **PNG** |
| Animated | **Animated GIF**, **Animated MP4**, **Animated HEVC**, **Animated PNG** |
| Layers | **Share layers**, **Shared Layers** (a layer-sharing flow, not a file format) |
| Time-lapse | **Time-lapse Recording**, **Time-lapse Replay**, **Export time-lapse video**, **Time-lapse settings** |

Settings present as labels:

- **Export Resolution** (values not stated in strings).
- **Choose PDF quality** with **Low quality**, **Good quality**, **Studio quality** seen in the table;
  which of the three belongs to PDF vs video is not established.
- **Video codec**, **Video quality**; codecs **H.264**, **HEVC**, **HEVC with alpha**.
- **Transparent background**.
- **Color profile** / **ICC color profile** / **Current color profile** / **Available color
  profiles**, with a warning that changing it affects the Time-lapse recording.

Read as a design: one Export sheet, a format picker, then only the settings that format needs
(quality for PDF, codec/quality/transparency for video, profile for stills). That is the opposite of
2Dope's current "all formats, one settings area" shape.

## 2. Procreate Dreams

Strings confirm a **two-tier export** and a fuller video settings set than Procreate:

| Control | Values / labels |
|---|---|
| Entry points | **Quick export**, **Advanced export** |
| Container/ext | **.mp4**, **.gif** |
| Codec | **H.264**, **HEVC** |
| Quality | **Best quality**, **Better quality**, **Good quality** |
| Also present | **Bitrate**, **frames per second** / **Frames per second**, **movie resolution**, **Transparent**, **Animated GIF** |
| Failure state | **Cannot fully render export**, **Export failed**, **Exporting** |

Dreams splits "just give me a movie" from "set codec/bitrate/fps/resolution". That is the single
most useful export pattern in the collection for a student app.

## 3. Harmony Premium (saved export preferences)

`Harmony Premium-pref.xml` persists the last movie-export choices under `EXPORTMMX_*`:

| Key | Observed value | Meaning |
|---|---|---|
| `EXPORTMMX_OUTPUTFORMAT` | `openH264` | codec choice, stored by name |
| `EXPORTMMX_OUTPUTFILE` | `…/TestHarmony3D.mov` | last file, `.mov` container |
| `EXPORTMMX_RANGESTART` / `RANGESTOP` | `1` / `30` | explicit frame range |
| `EXPORTMMX_RESOLUTION` | `0` | resolution stored as an index, not pixels |
| `EXPORTMMX_CUSTOMRESX` | `0` | custom width off |
| `EXPORTMMX_EXPORTALL` | `N` | export-all vs range |
| `EXPORTMMX_DISPLAY` | `Display` | display/render target |
| `EXPORTMMX_LASTCOLORSPACE` | empty | colour space choice, unset |
| `EXPORTMMX_AUDIOCONFIG` | empty | audio configuration, unset |

Design facts worth copying: **range** (start/end, export-all), **resolution as a preset index** with
an optional custom size, **codec by name**, **colour space**, **audio config**, and remembering the
last choices per user.

## 4. 2Dope today (from source)

`src/ui/exportdialog.ts` exposes nine formats: Video (MP4/WebM), Animatic, GIF, Animated PNG, PNG
frames, Picture, Storyboard, Blender, Project file. Video has a file picker and whatever size/file
settings the shared video options hold; there is **no codec, quality, bitrate, colour-profile,
alpha-for-video, or export-range control**, and no Quick/Advanced split. Every format shares one
settings area.

## 5. proposed 2Dope export model

Keep the nine formats; change the sheet to **format → only its settings**, and add four presets that
cover the teaching cases:

| Preset | Container | Size | Rate | Quality | Alpha | Audio |
|---|---|---|---|---|---|---|
| **Web video** (default) | MP4 · H.264 | fit 1080p | project fps | High | no | AAC 128–192 kbps |
| **Animatic** | MP4 · H.264 | 720p | project fps | Medium | no | AAC (existing burn-in/subtitles) |
| **Master** | MP4 · H.264/HEVC | full comp | project fps | Studio/High | optional (HEVC α / WebM VP9) | AAC 192–256 |
| **Frames** | ZIP · PNG RGBA | full comp | every frame | lossless | yes | — |

Controls to expose (keep it small): **Resolution** (Fit / Half / Full / Custom), **Quality** (Good /
High / Studio), **Format** (MP4 / WebM), **Alpha** only where the container supports it, **Range**
(all / work area), and one **Colour profile** note (sRGB for v1; P3 later). This mirrors
Procreate's "only what the format needs", Dreams' Quick vs Advanced, and Harmony's remembered
range/resolution/codec without exposing a render dialog.

Not recommended: bitrate as a raw number (Dreams has it; students do not need it), codec lists beyond
H.264/VP9/HEVC, or per-format advanced panels.

## 6. Unknowns

- Procreate's **Export Resolution** values and whether "Studio quality" is PDF or video.
- Whether Procreate's animated formats use the same codec/quality controls as still export.
- Harmony's full resolution list, codec list and colour-space list (only the last selected value is
  persisted).
- 2Dope's current encoder capabilities per format were not measured here.

## 7. Evidence

- `Payload/Procreate.app/en.lproj/Localizable.strings` — formats, quality, profile, codec labels.
- `Payload/Dreams.app/en.lproj/Localizable.strings` — Quick/Advanced, codec, bitrate, fps, quality.
- `%APPDATA%\Toon Boom Animation\Toon Boom Harmony Premium\Harmony Premium-pref.xml` — EXPORTMMX_*.
- Procreate/Dreams IPAs as identified in the layer-systems doc.
