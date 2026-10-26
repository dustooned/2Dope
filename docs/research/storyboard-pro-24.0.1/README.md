# Storyboard Pro 24.0.1: what the installed binaries show

2026-10-26 · REA static inspection of `F:\ToonBoom SBP\win64\bin`. Reference only; nothing is copied
into 2Dope. Companion to [feature-deconstruction 16](../../feature-deconstruction/16-storyboard-pro-animatic.md),
which was written from the readable `resources\*.xml` files and the public documentation.

## What was inspected

| Item | Value |
|---|---|
| Folder | `F:\ToonBoom SBP\win64\bin` — 152 items: 15 executables, 124 DLLs |
| Main program | `StoryboardPro.exe`, 21,093,968 bytes, PE32+ x64 |
| SHA-256 | `22440d133840678b93a8f8a277908d4416574a1d80f8351d3c1c1c953b35e6f7` |
| Version | 24.0.1.23015 (file and product version agree) |
| Build path in the image | `Build\24.0.1.23015\tu\win64\bin\StoryboardPro.pdb` (no PDB shipped) |
| Scene core | `ToonBoomSceneCore.dll`, 10,543,616 bytes, 23,312 named exports |
| Licence shell | `StoryboardPro_libFNP.dll`, 9,966,080 bytes, 2 exports — a FlexNet Publisher wrapper |
| Other tools | `lmgrd.exe` / `lmutil.exe` / `lmtools.exe` (FlexNet 11.18.2), `LicenseWizard.exe`, `StoryboardDaemon.exe`, `Swfimport.exe`, `Swf2tvg.exe`, `toonboom.exe` (2.4 MB, "DEMO daemon") |

An overall byte entropy of 6.48 with no packed-text signature says the executable is not encrypted;
the protected modules are the `*_libFNP.dll` shells, which hold the real code behind FlexNet
activation and expose almost nothing statically.

## Build facts

The executable imports 76 DLLs (16,691 functions). The stack it names directly:

- **Qt 6** — `Qt6Core`, `Qt6Gui`, `Qt6Widgets`, `Qt6Network`, `Qt6OpenGL`, `Qt6Pdf`, `Qt6PdfWidgets`,
  `Qt6PrintSupport`, `Qt6UiTools`, `Qt6Xml`, `Qt6Core5Compat`, plus **`QtScript`** and
  **`QtScriptTools`** (script engine and debugger).
- **Toon Boom's own modules** — `ToonBoomSboardCore`, `ToonBoomPlayback`, `ToonBoomMultimediaEx`,
  `ToonBoomDrawToolCore`, `ToonBoomCommand`, `ToonBoomGraphito` (drawing), `ToonBoomLayout`,
  `ToonBoomModelCore`, `ToonBoomElement`, `ToonBoomSceneCore`, `ToonBoomSceneContext`,
  `ToonBoomWidgets`, `ToonBoomBaseUiApplication`, `ToonBoomFlash`, and the persistence/preferences set.
- **Platform** — `libhunspell` (spell-check, for captions and notes), `countly.dll` (telemetry:
  sessions, breadcrumbs, crash reports), `FNP_Act_Installer` + the FlexNet tools (licensing), TBB,
  `zlib`, MSVC 2015+ runtime.

The folder also ships `libfbxsdk.dll`, the Intel IPP image libraries (`ippi*`, `ippvm*`, `ipps*`) and
OpenSceneGraph (`vsg`, `vsgXchange`, `OSGSystem`) for other modules; they are not direct imports of
the executable. `resources\` next to the binaries holds `menus.xml` (Harmony-style) beside
`sb_menus.xml` (the Storyboard Pro menu tree already used in doc 16), plus `sb_export.xml`, which
lists the file types Storyboard Pro can hand to Harmony: BMP, DPX 8/10/12/16, DTEX, EXR, JPG, OPT,
PAL, PDF, PNG/PNG4, PSD, SGI, TGA, TIF, TVG, VAR, YUV.

## Project and scene formats

- The command line accepts `-project <file>` with the filter `projectFile(*.sboard)` — the native
  project file is **`.sboard`**.
- Interchange/derived scene folders are named `scene.xstage`, `scene.tstage`, `scene.tboard` and
  `scene.tbup` (plus `.anim` and `.digital` for older scene pieces). `.xstage` is the Harmony scene
  extension; the same export code path also names the `.tstage`, `.tboard` and `.tbup` variants, and
  what each one contains was not opened.
- `ToonBoomSceneCore.dll` is the shared Toon Boom object model, not a Storyboard-Pro-only library.
  Its 23,312 exports include `SC_SceneCmds`, `SC_ProjectCmds`, `AT_AbstractSceneSeq`,
  `AT_TransitionSeq`, `AT_ColumnMarker(Manager)`, `markers@tu_timedvalue`,
  `sound@tu_timedvalue`, and `TUElementTimedValue` — a scene graph of **timed values** (sound,
  markers, elements), sequences and transitions, edited through **command objects** (the `*Cmd`
  classes), which is how undo/redo is expressed at this layer.
- No export names for captions or panels appear in SceneCore; those live in the executable
  (`SBU_CaptionData`, `SBU_CaptionsData`, `SBU_DragPanels`), i.e. captions are a Storyboard Pro
  concept on top of the generic scene model.

## Export and import, from the shipped class names

`StoryboardPro.exe` carries readable RTTI names for its own classes, which is enough to map the
pipeline without decompiling it:

| Area | Classes / strings |
|---|---|
| Editing export | `exportToAAF`, `exportToNLE`, `createEDL`, `createAAF`, `createXML`, `generateVideoFiles`, `copyAudioFiles`, `exportToHarmony`; dialog fields `setExportScenesReferenceTrack`, `setHandlesLength`, `setOneMoviePerPanel`, `setRenderImageAndVideo`, `setExportResolution`; literal `EDL`, `AAF`, `FCP`, `MOVIEPERPANEL`, `CREATEVIDEO`, `COPYAUDIO`; `forms/SBUI_ExportEditingDialog.ui` |
| Movie export | "Generating Quicktime Movies", "Generate QuickTime Movie", the `openh264` and `prores` tokens, `.mov` |
| Boards / pages | `SBU_ExportPDF`, `SBU_ExportPDFManager`, `SBU_ExportPDFJob`, `SBU_ExportPDFAnalyseJob`, `SBU_ExportPDFPreviewJob` (a background worker with progress), `SBU_ExportTB`, `SBU_ExportCSV`, `SBU_ExportEDL`, `SBU_ExportFD` |
| Import | `SBU_FinalDraftImporter`, `SBU_FinalDraftV7Importer`, `SBU_FinalDraftV8Importer` (`.fdx`, `.xml`), `SBU_ImportCSV`, `SBU_ImportFCP`, `SBU_ImportAnimatic`, `SBU_HarmonyScenesImporter` |
| Pitch mode | `AUTO_SAVE_DISABLED_WHILE_IN_PITCH_MODE`, `onExitPichMode`, `exitPitchMode` (the typo is the binary's) |

Two things this adds to doc 16: **PDF export runs as a job with a preview pass** (the preview job
renders a worker and reports progress in the export dialog), and there is a **Final Cut Pro XML
import** in addition to EDL/AAF export.

## Scripting exists

The executable links `QtScript.dll` and `QtScriptTools.dll`, ships a Script Manager
(`forms/SCR_ManagerScript.ui` with `scriptFilesList`, `functionList`, `toolbarButtonList`, add and
remove buttons), and registers a family of script interfaces:

`SBU_SboardScript`, `SBU_MotionScript`, `SBU_PrjMgtScript`, `SBU_ExportScript`, `SBU_SelectionScript`,
`SBU_LayerScript`, `SBU_CaptionScript`, `SBU_ColorScript`, `SBU_FunctionScript`, `SBU_GameScript`,
`SBU_ImportScript` — plus the matching `SBU_*ScriptInterface` classes and `SBU_PrjMgtScriptManager`.
Strings such as "No scene to execute script on" and "your inline script does not…" show scripts can
be run from a file or inline.

So Storyboard Pro 24 has a **QtScript (ECMAScript) automation surface** that the public documentation
does not foreground. It is not Python and not the Harmony node-scripting language. This matters if
2Dope ever promises import from a storyboard tool: a project can be scripted, and a script can drive
exports.

## What this does and does not establish

- **Observed:** versions, hashes, the DLL/EXE inventory, import/export class names, the export format
  list in `sb_export.xml`, the `.sboard` project extension, the FlexNet wrapping, and the QtScript
  surface.
- **Inferred:** that PDF preview uses a background analyse/render pass before the real export; that
  "one movie per panel" and handle length are first-class export options; that captions are stored
  outside the generic scene core.
- **Not established:** any method body (no decompilation was run — see below), the exact caption
  fields, the PDF page layout, how an animatic is timed internally, or whether a script can create
  panels. Nothing here was executed; the app was not launched.

No method-level decompilation was run. The executable is 20 MB with about 16,700 imported functions
and no symbols, and the Storyboard-Pro-specific DLLs are FlexNet-wrapped shells; a per-function pass
needs a concrete question (for example "how is the PDF page grid laid out") before it is worth the
import. That remains available.

## Reproduce

1. `inspect_pe_imports` on `StoryboardPro.exe` with `max_functions: 20000` (the default 8,192 cap is
   below this image's 8,193-entry first descriptor).
2. `inspect_pe_resources` (version block, icons), `inspect_byte_entropy` (packing check).
3. `inspect_native_exports` on `ToonBoomSceneCore.dll` (23,312 names) and on one `*_libFNP.dll`
   (2 names) to see the wrapper.
4. String evidence in this note comes from a byte scan of the executable for the quoted literals;
   treat it as data, not as documentation.

## Evidence

| Evidence | Covers |
|---|---|
| `ev_e8024c284b143aea61ab5fcb8f8e7a24f39fcedf3b6dfdc2b7dd4c8b2f81026c` | PE imports (76 DLLs, 16,691 imports), identity, imphash limitation |
| `ev_12e8dc284d2d4c1fc32c082be4c8f4e6f1cf11ba8abcebe25a56b5b64153025a` | PE resources (44 resources, icon groups) |
| `ev_729a266a6f2d54314d2efce3332f90f05d65b30b4361d3a6b08ef2c6144e40bd` | byte entropy (6.4844 file-wide, block profile) |
| `ev_f7e05f95881b9d35516a5324ab61da2f7874b8ee1351194ec76c981359846988` | SceneCore export table (23,312 entries) |
| `ev_40eb053f1423d012d6557df0d1b210e7984c3b6872308aefda221eddcbf763fa` | `StoryboardPro_libFNP.dll` export table (2 entries) |

## For 2Dope

Doc 16's plan holds. Three specifics worth keeping:

- Board pages with a **preview-then-export** flow are what a real PDF export does; our writer can
  stay synchronous because it is cheap, but the UI can still show a page preview before writing.
- **One movie per panel** and **handles** are export options, not timeline concepts — useful to know
  if the animatic export grows a "per-shot" or "per-panel" variant.
- Captions and script import (Final Draft) are separate from the scene core, which supports our
  choice to model captions as exposure notes with structured fields rather than a second document
  model.
