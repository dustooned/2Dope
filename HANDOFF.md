# 2Dope maintenance handoff

## Current state (2026-10-26) — read this first

**Latest step: easy delete for imported sounds and movies.**
The user authorized committing and pushing this to main on 2026-10-26.
The user reported no easy way to delete imported sound and video. Sounds could only be deleted from
the folded Settings controls; movies/pictures are ordinary drawing layers whose delete sat in the
Flipbook hold menu, Layers and Motion. No data/format change: delete reuses the existing audio
History edit and `CompEditor.deleteLayers`.

- `core/audio.ts` `withoutClip` (2 unit tests). `AudioTracks.deleteClip` (one "Delete sound" undo
  step, closes the card, notice "Deleted … Undo brings it back.") and `soundMenu` (Settings…,
  Mute, Delete sound). Trash buttons on Clips rail sound rows, Motion sound rows, Audio lane rows
  and the sound card header; the controls' "Delete clip" is now "Delete sound". Hold/right-click
  menus on sound blocks (Clips/Motion) and Story timeline sounds (`Board.setSoundMenu`).
- `rails.ts`: hold/right-click on a top-level layer name tag in Clips offers Rename… and Delete
  layer (confirm, undoable). Import notices for movies, pictures and sounds say how to remove them.
- Manual (Layers media list, Audio) and release note "Easy delete for sounds and movies".

Checks: 59 files / 488 unit tests, strict TypeScript and build passed. Browser on 127.0.0.1:5217 with a generated 1 s WAV and a
generated WebM: the Clips trash, the block menu, the card trash, the Motion trash, the Audio lane
trash and the Story timeline menu each removed the sound, with one Undo restoring it. The Clips
layer menu's Delete layer confirmed and removed the movie layer; Undo restored it. Not checked on
touch hardware (hold timing) and the movie had no sound track, so movie+sound import was not re-run.

### Earlier step (2026-10-26): shared workspace navigation, ebee0fc

The user reviewed and authorized committing and pushing this to main on 2026-10-26.
The user asked to move Draw/Animate workspace switching into the shared mode bubbles, fix tool
options leaking across workspaces (repro: Fill in Draw, then Motion showed Fill options), audit
the visible buttons per workspace, and keep changes local.

- Navigation: `paintingworkspace.ts` drops the workspace `<select>` and Draw/Animate shortcut
  (constructor loses its `share` argument; 13 browser fixtures updated). The shared mode row shows
  in Draw/Animate at every level (it stays hidden at Focus elsewhere, as before). Share lights
  while open and the name beside the row reads Share. `.painting-header` now holds only New asset /
  Assets / source editing. `Bubbles.placePaintingRows` places it right of the mode row when it
  fits (desktop, 768px tablet), else under it (phone), and moves the tool row down only on overlap.
  On phones New asset is now an icon button instead of `display: none`.
- Options row: new pure `optionsRow` / `toolChoice` in `core/workspace.ts`; `bubbles.ts` routes
  every options branch through it. Fill, Select, Smudge, Adjust, transform, point editing, asset
  arranging and QuickShape Edit shape only appear in Draw/Animate. Adjust now wins over the Fill/
  Select tool under it (previously its sliders/Apply/Cancel never showed after Fill or Select).
  Gradient Done/Cancel also show under Select (Fill selection with a gradient style had none).
- `App.setWorkspace` calls `settleTemporaryEdits`: applies an open transform and adjustment and
  exits point editing (each one existing undo step). Gradient edits were already applied.
- Feedback instead of silent no-ops: Earlier/Later at the first/last panel or drawing; Fill
  selection, transform and Edit points on a locked layer or a still-loading drawing. QuickMenu's
  key handler no longer throws for keys dispatched on document/window (noted on 2026-10-24).
- Manual (Draw and Animate, workspaces), release note "One way to switch workspaces",
  ARCHITECTURE note added.

Audit (127.0.0.1:5217, disposable 1080p project, desktop): every Story, Timing and Motion tool
bubble and options chip was clicked and its effect recorded (history label, layers, workspace,
notice or panel). All acted; Effects with a camera selected falls back to the first drawing layer;
Split outside a layer already explained itself. Draw tools and their chips were exercised too.
Not changed: Move assets with nothing placed still enters arranging with only its hint.

Checks: 59 files / **486 unit tests** (4 new options-row tests), strict TypeScript and production
build passed. Browser on 127.0.0.1:5217: Fill→Motion shows Motion options, Timing/Story their own;
Adjust after Select shows Apply/Cancel/Colour/Blur; transform and HSB adjustment are kept on a
workspace switch and one Undo removes each; first-panel Earlier shows its notice; Share lights.
No overlaps among dock, modes, asset header, tools, options, level and edge handles in Draw and
Animate at all three levels at 1440x900, 768x1024 and 375x812. Fixtures: paintingworkflow 20/0,
paintingplanes 36/0, artworkworkflow 30/0, brushcontrols 26/0, inkpaint 27/0, paintinglayout
16/0, quickmenu 34/0, studentprofiles 28/0, brushreturn 24/0, colourreturn 16/0, playbackrange
50/0. flipbooksource fails "Source playback advances and loops…" and artworklibrary stays on
Running… — both identical on an unchanged HEAD copy (127.0.0.1:5218), so not from this change.
Note: my audit clicks saved symmetry/guide/fill prefs on the 5217 test origin, which broke
fixtures until those keys were removed there; reset test-origin prefs before fixture runs.
Point-edit settle was not exercised with a real vector line, and physical iPad/Pencil was not tested.

### Earlier step (2026-10-26): menu workspace names, 1f3d413

The user authorized committing and pushing this rename to main on 2026-10-26.
The user asked for the menu's Board and Time buttons (`index.html`, `data-ws` board/time) to be
renamed Story and Timing, the names that the mode bubbles, the painting switcher and the manual
already use. Only the button labels changed; the `data-ws` values, layer names ("Board" guide
layer), the export option and historical release notes are untouched. A line was added to the
2026-10-26 release note. Checks: 59 files / 482 tests, strict TypeScript and build passed. On
127.0.0.1:5217, the menu shows Story / Draw / Animate / Timing / Motion, and each button opens
its workspace (ws-board, ws-draw, ws-animate, ws-time, ws-motion).

### Earlier step (2026-10-26): sizing, corner and text-size pass, 8b0fd1f

The user authorized committing and pushing this pass to main on 2026-10-26.
The user reported the live site looked unchanged and asked to also fix the button sizes and the
corner/text-size drift. The deployed CSS/JS did contain f94e90a (checked by fetching the live
assets); Pages sends `Cache-Control: max-age=600`, so a browser can show the old page for up to
10 minutes. A hard refresh loads the new one.

- Menu dock and level button: 40px to 44px. They now sit 5px below the 8px bar top, which centres
  them on the 54px bubble rows and painting header (desktop centre 35px in every workspace and
  level). Over the Full top bar (`ui-full`, not quick/hidden/collapsed/painting) the dock sits at
  4px and the top bar's min-height is 52px. At 480px and below, the 46px bubble rows outside the
  painting workspace use +1px. Neighbouring offsets moved from 56px to 60px: bub-modes, bub-tools, bub-ctx,
  painting header, and the `bub-stack` width check in `bubbles.ts`. Also: the top bar's left padding
  is 60px, the menu sits at +55px and the level menu at 63px.
- Corners: new `--radius-xs` 4px, `--radius` 8px, `--radius-md` 12px, `--radius-lg` 16px, `--pill`.
  Every `border-radius` maps onto them: 3-5px go to xs; 6, 7, 10 and 11px go to 8px (controls in
  panels); 14-28px panels go to 16px; pill-shaped controls use `--pill`; 1-2px hairlines and 50%
  are kept. The boot-failure box in index.html is now 12px.
- Text: 9px to 10px (5 labels); a manual h4 and the colour panel title went from 14px to 15px.
  The App settings title (17px) and Share title (18px) are now 16px, like other dialog titles.
  16px inputs are kept to stop iOS zooming in.
- Release note: the 2026-10-26 entry gained an item.

Checks: 59 files / 482 tests, strict TypeScript and build passed. On 127.0.0.1:5217 at
1440x900, all five workspaces at all three levels have the dock, level button and adjacent bar
sharing a centre line, with an 8px gap. At 375x812 the Draw and Time centres match
(35 and 31), there is no horizontal page overflow, and there are no console errors. Browser
fixtures were not re-run, and the Board, gallery, share and effects panels were not inspected
one by one.

### Earlier step (2026-10-26): UI consistency pass, f94e90a

The user authorized committing and pushing this checked pass to main on 2026-10-26.
The user asked to clean up inconsistent UI. Scope was styling and one class bug; no behaviour,
data, file format or History changes.

- `style.css`: new `:root` tokens `--on-accent` (#fff), `--key` (#ffd24a), `--board` (#f0c040)
  and `--danger` (#ff7b7b). Text on accent backgrounds was split between #1d1d22/#15151b (classic
  toolbar, pressed buttons, tabs, Play, primary, menu dock, gallery check, video save) and white
  (bubbles, painting views, dialogs); all now use `--on-accent`. Role chips (key/breakdown/
  inbetween) keep dark text on purpose. Near-duplicate yellows (#ffd25a, #e8c45a) now use `--key`,
  #ff6b6b uses `--danger`, and hardcoded #ff5a8a / rgba(255, 90, 138, a) now derive from
  `--accent` (via `color-mix`). Greens (#3fbf8f group/sound, #4ade80 share OK) and the canvas/
  tag palettes in TypeScript were left alone.
- QuickMenu trigger: `quickmenu.ts` replaced `className`, dropping `has-ico`, so the icon and label
  sat at different heights. It now adds the class; radius/font match the other edge handles.
- Menu: the five workspace buttons use a new `.menu-grid.workspaces` (3 + 2) instead of a
  4-column grid that left Motion alone on a row. Sidebar eyedropper radius matches Undo/Redo.
- Release note "More consistent controls" added. `.claude/launch.json` gained a `2dope-test`
  entry serving 127.0.0.1:5217 as an isolated test origin.

Not changed: the 40px menu dock and level buttons (their offsets line up with the top bar, bubbles
and painting header in different modes), and general radius/font-size drift across panels.
Contrast note: white on #ff5a8a is about 3:1; setting `--on-accent` to #1d1d22 would give about
5.7:1 if that is preferred.

Fresh checks: **59 files / 482 unit tests**, strict TypeScript and production build passed
(existing large-bundle warning). Dev server on isolated 127.0.0.1:5217, new 1080p test project at
1440x900: QuickMenu icon and label centred on the same line, workspace grid 3 + 2, selected menu
button text white, no console errors. Browser fixtures were not re-run; Board, Time, Motion,
share and gallery panels were not reviewed visually.

**Next:** user review of the colours and menu layout.

### Previous step (2026-10-24): code and UI cleanup after 206e7fb

The user authorized committing and pushing this checked cleanup to main on 2026-10-24.
The user asked to clean up the code and UI. The scope was dead code, dead CSS and leftover
colour emoji. No behaviour, data, file format or History changes.

Code: removed unused `isResident` (core/project), `contextMenuOpen` (ui/contextmenu) and the
`LayerKind` type (core/comp). Constructor parameters that were stored but never read are now plain
parameters in AssetClipDrag, QuickBar, Splitter and XSheet. `tsc --noUnusedLocals
--noUnusedParameters` now reports only `assetTimingChange`'s unused `comps`, which was kept so
it matches the signature of `assetClipTimingChange`.

CSS: removed rules with no matching element: `.logo`, `.hold-readout`, `.role-text-*`, `.dfoot`
(the `.vfoot` half of that rule is kept), `.share-seg`, `.fx-del`. Classes built from templates
are still live (`role-${r}`, `painting-${key}-handle/-folded`, `ui-${level}`), so treat any
"unused class" scan with care.

UI: the focus bar's Tools/Timeline/Share buttons use `data-icon` (panel/time/export) instead of
emoji. Motion layer and part eyes use the SVG `eye` icon, and an empty gallery folder uses the
`folder` icon. Emoji were removed from:
- effect and dither palette labels
- storyboard caption placeholders
- Key role chip and frame-menu label
- Board view chips
- Effects/texture menu items
- layer-card tags (a still stack now shows "still ·")
- gallery Move-to folders
- the Hand in legend
The flipbook key-drawing marker is now ◆. The Studio preset option for a personal brush reads
"Name (My brushes)" instead of using ⭐, which now means Favorites. Monochrome text symbols
(✓ ✕ ★ ♪ ☰ ✎) and the flipbook colour-tag dots were kept on purpose, as was the default
"📝 Notes" layer name, because it is saved in project data. Release note added.

Changed: index.html, style.css, core/{comp,dither,effects,project}.ts, ui/{assetclipdrag,
board,bubbles,contextmenu,flipmode,framemenu,gallery,layercards,manualtext,motion,panel,quick,
share,splitter,xsheet}.ts, this handoff.

Fresh checks: **59 files / 482 unit tests**, strict TypeScript and production build passed
(existing large-bundle warning remains). Dev-server review on isolated `127.0.0.1:5216` used a
new 1080p test project:
- The focus bar at Full level shows the SVG icons with intact labels and aria-labels.
- The Timeline toggle folds and unfolds and keeps its icon.
- The Motion eye toggles between the icon and – both ways.
- No app console errors.

A synthetic Escape dispatched on `document` threw in QuickMenu's key handler
(`target?.closest` on a non-Element). Real key events target an element, so it was not fixed.
Browser fixtures were not re-run, and the effects, board and gallery labels were not checked
visually. User project storage was not touched.

Committed and pushed to main as 97e6e1e. Pages run 40119614142 succeeded for exact SHA
`97e6e1ecab1a4641019818f2ede88669b598e6ac`, and the public site served the new "Tidier labels" note.

**Next:** user review of the cleaned-up labels and icons.

### Previous step: brush memory, Favorites and Recent release, following 586f67d
The user authorized committing and pushing this checked release to main on 2026-10-23.
The user approved this bounded next Draw improvement. Each brush recalls its working size and
opacity when selected through the library or Studio preset selector. Draw/Animate and painting
tools share the existing brush identity. Other Studio changes still require Save brush to keep
a reusable definition; saving over a personal brush supplies its exact new values.

Brushes adds Recent (five unique choices, latest first) and Favorites ahead of the existing
collections. The fixed header has a 44px pressed Favorite button, and the existing hold menu
offers Add/Remove from Favorites for any card. Favorites reuse original cards/definitions, with
star marks and helpful empty states. Selecting Recent keeps focus on its moving card; removing
a favorite through the menu recovers to its card or the category. Rename carries preferences;
delete removes them and selects Pencil when deleting the active personal brush.

`core/brushprefs.ts` validates bounded metadata in device-only `2dope.brushes.preferences`:
version 1, up to 610 name/size/opacity entries and favorites, five recent names. No image data,
document fields, schema migration, drawing Undo, student-profile fields or extra canvases.
Existing current-brush and personal-definition stores remain in place. Changed: new core
preferences/tests, App, BrushLibrary, icons/CSS, browser/responsive fixtures, four existing fixture
preference guards, manual/UPDATES, architecture/project-format/test docs and this handoff.

Fresh checks: **59 files / 482 unit tests**, strict TypeScript/production build and diff check
passed (existing large-bundle warning remains). On isolated `127.0.0.1:5214`, new workflow
**21/0 each** at desktop, 390×844, 1024×768 and 768×390; brush return **24/0**, brush controls
**26/0**, integrated painting **20/0** = **154 browser assertions**. The initial new fixture caught
context-menu focus loss (fixed) and a fractional 44px measurement (uses existing 43.9 tolerance).
Brush-controls previously expected an explicit same-name definition to reset values; it now
uses the same exact-definition bypass as Save brush while new tests cover ordinary recall.

Native built review on isolated `127.0.0.1:5215` created a 720p test project, favorited Textured
Paint, adjusted it to 11px/30%, switched to Marker and back through Favorites, and reloaded:
brush, values, favorite and selected Favorites category retained. Corrected a selected-button
theme clash discovered visually. Screenshot: `../artifacts/brush-memory-favorites.jpg`.
User project storage was not cleared. Release prepared for the authorized main push; verify
Pages for the exact pushed SHA. Physical iPad/Pencil/Safari review
and earlier deferred Clips/view fixture failures remain separate.

**Next:** user review of brush shortcuts; selection feathering/saved selections were the next
suggested Draw improvement, not implemented or otherwise authorized by this step.

### Previous step: raster taper and textured paint release

**Latest step: raster taper and textured paint release, including the preceding UI icon cleanup.**
The user authorized committing and pushing these checked changes to main on 2026-10-23.
The user chose brush feel over Procreate parity work. Raster tapers now use a smooth finite-slope
profile with enough length for wide brush tips, a subpixel end stamp at the recorded endpoint,
and a visible full-sized mark for finished taps. Short flicks do not inflate into broad blobs.
Start-only tapers also rebuild on commit. Existing vector outline code and saved raster pixels
are unchanged; no project/brush format fields or migration were added.

Grain now modulates each dab before it accumulates in the coverage buffers, instead of punching
a fixed texture out of the finished stroke. Light pressure retains texture, stronger pressure
and overlapping passes fill paper valleys, and stroke opacity remains the final ceiling. This
reuses the existing scratch plane and cached paper patterns, clipping work per stamp with no
additional document-sized canvases or per-stamp readbacks. Prediction remains preview-only.
Also fixed image-tip rotation at full roundness, grayscale decoding before letterboxing,
rotated commit/Undo bounds, collision-prone colour-tip cache keys, and colour-jitter index reset
when taper/post-correction replays a stroke. Added **Textured Paint** to Brushes → Painting.

Changed this step: `brush/dabs.ts`, `brush/raster.ts`, `core/brush.ts`, the painting category
mapping in `core/brushlib.ts`, new `brush/dabs.test.ts`, `brush/feel.browser.ts` and
`tests/brushfeel.html`, manual/UPDATES, architecture and test docs. The previous icon cleanup is
preserved. Fresh verification: **58 files / 477 unit tests**, strict TypeScript/production build
and diff check passed (existing bundle-size warning remains). New brush-feel fixture **23/0**,
brush return **24/0**, Ink & Paint **27/0**, integrated painting workflow **20/0**: **94 browser
assertions** on isolated `127.0.0.1:5211`. A long 720p textured stroke measured about 46–63ms on
this desktop. An earlier brush-return attempt lost its context menu while the viewport changed;
the stable rerun passed all 24 checks. No app change was made to bypass that fixture.

Built preview on isolated `127.0.0.1:5212`: chose Textured Paint from Painting, confirmed its
48px Brush/Line identity and return to canvas, drew real mouse strokes with an overlapping pass,
and visually checked tapered tips, texture and coverage buildup. Reload retained the strokes,
Textured Paint selection and 48px size. Test-only artwork remains on
that origin; user project storage was not cleared. Samples/screenshots:
`../artifacts/brush-taper-textured-paint.png`, `textured-paint-preset.png`,
`textured-paint-native-strokes.png`. Release prepared for the requested main push; verify Pages
for the exact pushed SHA. Physical iPad/Pencil feel and Safari
performance remain unverified; earlier deferred Clips/view fixture failures remain deferred.

**Next:** user review of Textured Paint and tapered strokes on the intended stylus/device.

### Previous step: UI icon cleanup

**UI icon cleanup, implemented after published release 94bd127.**
Replaced the main emoji/generic placeholders with the existing 24px current-colour SVG system.
Brushes and its category/collection tabs, Import/Studio/Save/New actions, Reference modes/navigation/
eyedropper/close, and Flipbook in Clips and Motion now use shared icons. Added distinct Ink & Paint,
palette, playback range, reset rotation, import, download, save and folder icons; Settings uses a
cog. QuickMenu reuses these icons and changes its Play icon to Pause during playback. Range labels
and selected frame numbers remain visible in the Simple strip/navigation toolbar after icon updates.
Effects has plain text names, SVG add/close/more controls and 44px close/more targets. Reference
buttons also have 44px minimum targets. Kept accessible labels/tooltips and existing action paths.

Changed: `src/ui/icons.ts`, Bubbles, BrushLibrary, Reference, Strip, Motion, PlaybackRangeControl,
QuickMenu, ArtworkAssets/ArtworkLibrary, EffectsPanel, core brush category/QuickMenu presentation
catalogs, index/CSS, manual/UPDATES and brushreturn/paintingworkflow fixture label selectors.
This is presentation work; project data, category IDs, preferences and History behavior are unchanged.

Fresh verification: **57 files / 470 unit tests**, strict TypeScript/production build and diff check
passed; existing large-bundle warning remains. Browser checks on isolated `127.0.0.1:5209`:
Brush return **24/0**, phone QuickMenu **34/0**, phone range/gesture **50/0**, integrated painting
workflow **20/0** = **128 assertions**. Built-app review on isolated `127.0.0.1:5210` checked brush
categories and actions, Reference mode switching/all header targets, saving a source to My Assets
and its import/download icons, Motion Flipbook/Range, and Effects add/more/Escape/close. Verified
Reference and Effects targets at least 44px, and labels/icons remain intact after reload.
Screenshots: `../artifacts/ui-icons-brush-library.png`, `ui-icons-reference.png`, `ui-icons-assets.png`,
`ui-icons-effects.png`. Test projects/preferences remain only on isolated review origins. User project
storage was not cleared. No commit or push this step. Physical iPad/Pencil/Safari review remains pending;
older deferred Clips/view fixture failures stay deferred.

**Next:** user review of the icon cleanup; follow their direction for publishing or further work.

### Previous step: published release cleanup (94bd127)

**Final release cleanup, committed/pushed to main as 94bd127; Pages build/deploy succeeded.**
App settings now keeps Student profiles first and groups Visible tools and controls, Drawing
options, QuickMenu and Gestures into collapsible sections. QuickMenu Customize opens its section
directly. Profile guidance distinguishes updating the selected profile from saving a separate
setup. Updated `src/ui/settings.ts`, manual/UPDATES and test-document headings; no model or file
format changes in this cleanup. All accumulated My Assets, QuickMenu, Ink & Paint, playback-range,
gesture and student-profile work since 086c7da is included in this release.

Fresh cleanup verification: **57 files / 470 unit tests passed**, strict TypeScript and production
build passed, and staged diff check passed after trimming extra fixture EOF blank lines. The
existing large-bundle warning remains. Fresh browser release checks: student profiles **28/0
each** at phone and landscape sizes, QuickMenu **34/0**, playback range/gesture **50/0** at tablet,
My Assets **34/0**, Ink & Paint **27/0**, and integrated painting workflow **20/0**: **221 assertions**.
Native built-app review on isolated `127.0.0.1:5205` confirmed all four settings groups initially
collapsed, the saved Background painting profile retained, and QuickMenu Customize directly
opening its section; Cancel returned without applying changes. Screenshot:
`../artifacts/release-settings-cleanup.png`. Tests do not clear user project storage. Physical
iPad/Pencil/Safari and audible output remain separate checks; older deferred Clips/view fixture
failures remain deferred. Pages run 40029682128 succeeded for exact SHA
`94bd127a1b6cf0f9d066f78fb21ea8fa46901e8c`; the public site served the new cleanup/profile text.

### Previous step: student tool profiles

**Student tool profiles, implemented after 086c7da.**
The user requested tool/setting choices and named profiles in App settings. Built Student profiles
with a chooser, profile name, Save as new profile, Rename and Delete. Profile selection previews
its values; all profile/setup mutations stay in the dialog draft until Apply settings. Applying
updates the selected named profile; Cancel/Close/Escape discard the complete draft. Current setup
handles unnamed/customized preferences. Names are trimmed/collapsed, limited to 40 characters and
unique ignoring case; up to 20 profiles. Profile write failure leaves the draft open, live settings
and persisted profiles unchanged. Status/errors stay in the fixed footer beside Apply/Cancel.

Visible tools and controls chooses painting tools, Line/Fill, Ink & Paint, symmetry and guides.
Drawing options holds Focus/Simple/Full, automatic Ink & Paint, QuickShape and finger drawing.
Profiles also capture the existing QuickMenu slots/edge/button and playback-range gesture. These
are device setups, not student accounts or feature permissions. Shortcuts/QuickMenu remain
available. Brush cannot be hidden; a hidden active tool remains visible until switched away,
including Focus. Guide-edit completion controls are retained. Show all tools and controls resets
visibility as a draft. App settings itself remains reachable. No brushes/colours/device limits,
document modes, project pixels, schema or exports are included in a profile.

`core/studentprefs.ts` owns validated catalogs/setup/profile data. App loads student visibility,
finger preference and existing interface level; Bubbles shares that interface state via an App
callback and filters floating painting tools/options. Main filters classic Full toolbar controls
from the same state and synchronizes the finger menu checkbox. Active-tool recovery applies to
the painting toolbar at all levels. Settings only invokes changed setters, so QuickMenu-only edits
do not refit the canvas. Opening refuses active strokes/transforms/adjustments and pauses playback.
QuickMenu Customize focuses its section; normal App settings opens at Student profiles.

New device keys: `2dope.student.ui`, `2dope.student.profiles` (version 1),
`2dope.student.fingerPaint`. Existing QuickMenu/range/QuickShape/Ink & Paint/interface keys remain
live preference sources. Profile snapshots are outside Project/History and all portable artwork.
No-op Apply does not add drawing history; profile tests verified zero document notifications.

Changed this step: new `core/studentprefs.ts` and unit tests, student profile browser fixture,
responsive wrapper and HTML pages; updated App, Bubbles, App settings, QuickMenu, main/index,
CSS, manual/UPDATES, architecture/format/roadmap/test docs. Existing QuickMenu/range fixtures now
isolate the added preference keys. All earlier user/Claude work preserved. No commit/push/deploy.

Fresh verification: **57 files / 470 unit tests passed**, strict TypeScript/production build and
diff check passed; existing large-bundle warning remains. Real-App student profile checks **28/0
each** at 390×844, 1024×768 and 768×390 = **84 assertions**: create/rename/delete staging,
Apply/Cancel, switching/update, independent snapshots, Draw/Animate/Focus visibility, active-tool
recovery, options/QuickMenu, device persistence, fixed actions, names, storage failure, show-all
and unchanged document/portable capture. Existing QuickMenu **34/0**, integrated painting workflow
**20/0** at 898×910, and range/gesture workflow **50/0** at 1024×768: **188 browser assertions
passed this step**. Physical iPad/Pencil/gesture arbitration remains unverified.

Native built review on isolated `127.0.0.1:5205`: created Background painting with Vector/Smudge
and Line/Fill controls hidden, saved/applied, reloaded and verified the selected profile. Updated
its interface to Full and confirmed painting controls retained those visibility choices; reload
retained Full, the profile name and checkboxes. The classic top bar remains hidden by the existing
painting workspace layout, so the visible Full-level review used its floating painting controls.
Screenshot: `../artifacts/student-profiles-native.png`. The test profile remains only on the
isolated review origin. Tests used separate origins without clearing user project storage.

**Next:** user direction for further profile options or repeat-cycle authoring. Physical device
review remains pending; old deferred Clips/view failures stay deferred.

### Previous step: optional playback-range gesture

**Optional playback-range gesture, uncommitted after 086c7da.**
The user requested a gesture option. Menu → App settings → Gestures now offers **Hold ruler to
set playback range**, default off. Apply settings saves the boolean device preference
`2dope.playback.rangeGesture`; Cancel discards the draft. QuickMenu preferences remain separate,
and Restore QuickMenu defaults does not reset gestures. Range dialogs include a short settings hint.

In Flipbook or Clips/Timing, hold still on the frame-number ruler for the existing 450ms hold
threshold, then drag in either direction and lift. A dashed ruler band and a Loop start–end hint
preview inclusive bounds; a stationary hold selects one frame. Pointer-up calls the existing
App range command once, with normal Undo/autosave. The preview does not mutate the document.
Quick ruler drags retain scrubbing and native pinch bookkeeping stays active. Drawing/row gestures
are not reassigned. Whole animation remains in Range; the gesture does not change export scope.

`ui/playbackrangegesture.ts` shares the input lifecycle across FlipMode and Strip, with callbacks
to end their native scrub state after activation (without snapping scrub-lock home). It rejects
stale project/comp/layer/workspace/length/zoom or changed range owners. Escape, extra fingers,
pointer cancel/lost capture, blur/hidden, resize and disabling the preference cancel the preview.
Pointer cleanup handles releases outside the ruler. Ruler-only touch-action/user-select/callout
rules support touch holds while retaining other row interactions. Saved range ruler bands exclude
the transient preview so frame notifications cannot remove it.

Changed this step: new `ui/playbackrangegesture.ts`; updated core playback preference/test,
App, App settings, range dialog/band selector, FlipMode/Strip integration, CSS, playback-range
browser fixture, manual/UPDATES, architecture/format/roadmap/test docs. Earlier dirty work preserved.
No dependency/project schema change, commit, push, deploy or recording feature.

Fresh verification: **56 files / 464 unit tests passed**, strict TypeScript/production build and
diff check passed (existing bundle-size warning). Expanded real-App range/gesture browser fixture
**50/0 each** at actual 390×844, 1024×768 and 768×390 iframe viewports = **150 assertions**.
Existing QuickMenu/App settings fixture **34/0** at 898×910: **184 browser assertions passed**.
These cover device-only Apply/Cancel, ordinary scrub, hold preview/commit/Undo/Redo, reverse and
single-frame ranges, interruption paths, Clips layer offsets and project replacement, alongside
the prior range/audio/archive checks. An initial run while editing had four first-hold assertions
fail; fresh final-handler runs passed at all three sizes. Desktop scripted touch PointerEvents
do not establish physical Pencil/iPad Safari hold, pinch or callout behavior.

Native built app on isolated `127.0.0.1:5205`: enabled the checkbox through Menu → App settings,
applied, reloaded and reopened settings; it remained enabled. Screenshot:
`../artifacts/playback-range-gesture-settings.png`. Native physical hold-and-drag was not tested.
Only separate test/review origins were used; existing user project origins were untouched.

**Next:** physical touch/Pencil review of hold-versus-scrub/pinch; repeat-cycle authoring remains
a separate proposed feature requiring user direction. Prior deferred fixtures remain deferred.

### Previous step: playback range

**Playback range, uncommitted after 086c7da.**
The user approved playback range. Built Range controls in Draw/Animate Flipbook, Clips/Timing
and Motion using a shared `ui/playbackrange.ts` native dialog. Start/End are inclusive UI frame
numbers; Use current sets either edge. Apply validates whole frames and commits one History
command/document notification; Cancel/Escape discards the draft; Whole animation clears it.
Unchanged Apply is a no-op. Opening pauses playback and restores focus on close. Stale dialogs
close on project/comp/workspace/length changes. Controls have 44px targets and match existing UI.

`Comp.playbackRange` is optional zero-based `[start,end)` metadata. `core/playback.ts` clamps
preview bounds against current comp length without overwriting saved edges, so restoring a
shortened duration restores the range. App Play from outside begins at the range start; Play
inside resumes there. Paused scrubbing remains unrestricted. One-frame ranges work. The shared
clock, seek/fps clock rebasing and residency look-ahead use the same bounds. Flipbook and Clips
rulers outline the interval (Clips accounts for the active layer start). Sources and shots keep
independent ranges; nested placements, content duration and exports retain normal timing.

The audio queue includes both edges in its restart key and uses a nonzero loop origin in
`mixSound`, so queued chunks crossing an edge sample the selected section. Scrub audition and
exports retain their existing full-comp/default sampling. `io/schema.ts` validates and copies
the additive optional comp field under schema 3; autosave, portable files and My Assets captures
preserve it. Range Undo resolves the comp by id rather than retaining a potentially stale object.

Changed this step: new `core/playback.ts`, unit tests, shared range UI and four browser fixture
files; updated App, audio/mixer, comp/schema, FlipMode/Strip/Motion, CSS, manual/UPDATES,
architecture/format/roadmap/test docs. All earlier user/Claude changes preserved. No commit/push.

Fresh verification: **56 files / 463 unit tests passed**, strict TypeScript/production build
passed (existing chunk-size warning), and diff check passed. New browser fixture **31/0 each**
at actual iframe viewports 390×844, 1024×768 and 768×390 = **93 passing assertions**, including
clock/seek/fps/single-frame edges, validation/cancellation/focus/layout, Undo/Redo/no-op,
shortened duration, source independence, ruler origins, autosave/portable import, replacement
comp objects and stale dialogs. A deterministic AudioContext substitute exercises real queued
mix samples/stop behavior without playing sound. Existing integrated painting workflow **20/0**
at 898×910: **113 browser assertions passed this step**. No audible-output or physical Pencil/
iPad Safari claim. User-deferred Clips/view fixture failures remain recorded below.

Native production review on isolated `127.0.0.1:5205`: created a named 720p/24-frame review shot,
set frames 5–12 with Enter, played/paused inside the interval, reloaded and verified the saved
range, cancelled a changed draft with Escape, and switched to Clips with the same range. Screenshot:
`../artifacts/playback-range-native.png`. Normal user origins were untouched. Browser connection
to the sandbox server was blocked; an approved external local review server resolved it. Only
test-created browser tabs were used. The review shot remains on the isolated production origin.

**Next:** repeat-cycle authoring is a separate proposed next feature, requiring user approval.
Physical Pencil/iPad review of the existing drawing/Ink & Paint workflows remains outstanding;
do not expand auto-fill gaps/references/page limits or resume deferred fixtures implicitly.

### Previous step: first Ink & Paint / Auto Paint workflow

**First Ink & Paint / Auto Paint workflow, uncommitted after 086c7da.**
The user said Go after My Assets and customizable QuickMenu. Built optional Ink & Paint in
Draw/Animate Options, also assignable to QuickMenu. Switching it on selects Line with Brush or
Vector; Ink has its own editable colour and the main Colour supplies solid automatic paint.
It starts off. On/off and ink colour use device-only `2dope.inkpaint`; ordinary project/asset
Line, Fill and editable vectors remain unchanged, with no new schema/dependency.

`fill/autopaint.ts` uses the difference between before/after border-connected empty pixels:
newly enclosed regions only, threshold 24, no gap closing, no selection/page edge as a wall and
two pixels of growth only beneath actual ink. It is tested against a separate pixel-flood oracle
over 150 randomized small maps. `App.inkAlpha` reconstructs before-ink from the existing raster
commit patch and old vector list after pen-up. No page scan delays pen-down/live ink. Automatic
paint filters selections, fully hidden layer-mask pixels and any existing nonzero Fill alpha,
preserving opaque/translucent paint exactly. It uses only the current drawing, not other layers.

`recordInk` prepares the paint patch before History/autosave notification, with one command for
closing ink plus Fill. Redo restores captured pixels rather than re-detecting under new settings.
QuickShape replacement undoes/replaces the associated paint through the same path. Layer masks
use the existing queued input/Residency decode path before pixels are read. Eraser, Smudge,
direct Fill painting, mask editing and Alpha Lock do not trigger automatic colour. Cancelled/
blurred/hidden/interrupted pen input keeps the existing ink policy while suppressing Auto Paint.

Work is bounded to **921,600 page pixels in Lite** and **4,194,304 in Full**. Oversize enable is
refused; an already enabled preference on an oversize page retains ink and reports skipped paint.
The feature remains opt-in. No workers, automatic gaps, gradients, all-layer references or new
track types were added. Standalone autosave/archives/My Assets keep the resulting editable data.

Changed this step: new `fill/autopaint.ts`, its unit tests, `ui/inkpaint.browser.ts`, responsive
wrapper and two HTML fixtures; updated `app.ts`, Bubbles, QuickMenu action catalog/UI, main target
label, CSS, manual/UPDATES, architecture/format/roadmap/test docs. QuickMenu and integrated painting
fixtures now isolate the Ink & Paint preference; QuickMenu verifies the new assignable toggle.
Earlier user/Claude changes are preserved. No commit/push/deploy or recording feature.

Fresh checks: **55 files / 457 unit tests passed**, strict TypeScript/production build and diff
check passed; existing large-chunk warning remains. The full unit run measured topology at 62 ms
for 1280×720, 131 ms for 1920×1080 and 106 ms for 2048×2048 on this desktop (JIT/load varies).
The direct real-App browser workflow passed 25 initial assertions, including a Full HD committed
stroke plus paint in 118 ms. Final responsive/residency checks passed **81 assertions**: 27 each
at real iframe viewports 390×844, 1024×768 and 768×390. These add decoded parked-mask input and
parked drawing Undo/Redo, with all colour/selection/mask/cancel/QuickShape/archive checks intact.
The phone/tablet runs measured total Full HD committed stroke plus paint at 110 ms. The separate
QuickMenu regression passed **34/0**, including the assignable Ink & Paint toggle; the existing
integrated Draw → Assets → Animate painting workflow passed **20/0**, for **135 browser assertions
passed this step** (81 + 34 + 20). Browser test
callbacks use real App input, PNG/compositor/history and in-memory FileUI/autosave, without opening
the user's project library. Test preferences are restored. Background browser timer throttling
slowed the inactive landscape fixture; bringing its page forward completed it. A few browser
state reads timed out then recovered; no failed check is being counted as passed.
These desktop timings do not establish physical iPad/Pencil/Safari performance or memory readiness.

Native built app, isolated 127.0.0.1:5201: created Ink Paint review, chose red Paint and separate
dark Ink, then drew three brush edges. The open outline stayed empty; closing it filled the
region. Ctrl-Z removed the closing line and its paint; Ctrl-Shift-Z restored both. Done, normal
autosave/reload, Assets → Edit reopened the same painted source, with mode/colour preferences
retained. Screenshot: `../artifacts/ink-paint-native.png`. A preliminary vector mouse-drag review
entered the existing hold/point-edit workflow, so the final native closure used Pixel Ink Brush;
vector/QuickShape behavior is covered by the real-App scripted fixture. User origins 5197/5200
were untouched. Native test source remains only on the isolated review origin.

**Next:** review the bounded automatic-paint workflow with real student drawings and physical
Pencil input before expanding gap closing, references or page sizes. Those expansions are later
decisions. The earlier user-deferred Clips/view fixture failures remain recorded below.

### Previous step: customizable QuickMenu and App settings

**Customizable QuickMenu and App settings, uncommitted after 086c7da.**
The user requested QuickMenu customization in app settings. Built the six-action ring for Draw
and Animate with an explicit edge button and Q, plus Menu → App settings → QuickMenu. Settings
choose six actions (clockwise from top), a left/right button edge and show/hide. Apply saves
`2dope.quickmenu` localStorage; Cancel discards the draft, and Restore defaults waits for Apply.
These preferences are device-only, independent of project/schema/History. Empty/repeated actions
are allowed, unknown stored actions repair per slot, and bad JSON falls back to defaults. Q keeps
the menu available when the button is hidden; all-empty rings focus Customize for recovery.

QuickMenu routes to the existing App tools, Undo/Redo, full-hold frame creation, duplicate/frame
navigation, view and playback, and existing Colour/Brushes/Layers/My Assets panels. Playback keeps
Pause accessible while edits/navigation disable. A backdrop consumes outside taps, focus returns
to canvas, Q/Escape/arrows/Tab work without leaking keys, and menus close on frame/layer/comp/
project/workspace changes, stroke input, blur, hidden page or resize. It avoids live strokes and
locked-layer New frame. The opener measures clear space around existing painting controls without
moving/refitting the canvas. Existing popovers dismiss before opening. This is separate from the
older Quick Animate view (`ui/quick.ts`); finger canvas holds retain their existing behavior.

Changed this step: new `core/quickmenu.ts`, `core/quickmenu.test.ts`, `ui/quickmenu.ts`,
`ui/settings.ts`, `ui/quickmenu.browser.ts`, `ui/quickmenu-responsive.browser.ts`,
`tests/quickmenu.html` and responsive wrapper; updated `main.ts`, `index.html`, CSS,
manual/UPDATES, architecture/roadmap/test docs and this handoff. All preceding uncommitted work
is preserved. No dependency, .2dope schema or persistence/export change; no commit/push/deploy.

Fresh checks: **54 files / 448 unit tests passed**, strict TypeScript/production build and diff
check passed. Existing large-chunk warning remains. **99 browser assertions passed**: 33 each at
real iframe viewports 390×844, 1024×768 and 768×390 on isolated localhost:5202. The actual App/
painting/Flipbook/Sidebar/Bubbles/Colour fixture covers settings drafts, persistence serialization,
ring/edge targets, keys/focus/outside taps, view/history preservation, real Line pixels and Undo/
Redo, full-hold New frame, popover handoff, callback routing, plane/tool compatibility, locked-layer
guards, stroke refusal, shared playback/Pause, Draw/Animate and stale-menu cancellation, hidden/
empty recovery and defaults. It opens no project library/autosave and restores its preferences.

Native built-app review on isolated 127.0.0.1:5201: Menu → App settings opened the six selectors.
Changed Action 3 to Colour, Action 6 to My Assets and edge to Left; Apply then reload retained
these choices. Native Q opened the saved ring, Colour opened the real picker, Q replaced the
picker with QuickMenu, and My Assets opened the existing device collection. No document edits
were needed. Evidence: `../artifacts/quickmenu-settings.png` (all six settings) and
`../artifacts/quickmenu-customized.png` (the saved ring). Test/native tabs were closed after checks;
user origins 5197/5200 were untouched. Physical iPad/Pencil/Safari and arbitrary crowded layouts
remain unverified. The earlier user-deferred Clips/view fixture failures are still recorded below.

**Immediate next feature: Ink & Paint / Auto Paint**, per `docs/next-phase.md`: detect only newly
enclosed regions after committed ink, preserve existing paint, honor selections/masks/residency,
and combine closing line plus automatic fill into one Undo. Test large-page/Lite cost before
enabling broadly. Recording is excluded. QuickMenu customization and My Assets are now built.

### Previous step: My Assets library management

**My Assets library management, uncommitted after 086c7da.**
The user confirmed this order: **My Assets → QuickMenu → Ink & Paint**, with recording still
excluded. Finished the library management pass before moving on to QuickMenu. Name search works
on card metadata, supports multiple case-insensitive words, displays counts/no-match recovery and
keeps Clear/search at 44px. Manage folds Rename and Remove under each saved card. Renaming changes
only the saved card; `libraryArtwork` supplies the new project/root name to future copies,
opened projects and portable downloads. Existing project artwork and frozen stored bytes remain
independent. Removal atomically reads/deletes both records; one full entry stays in memory for
Undo last removal until another successful removal or page reload. Closing/reopening the shelf
keeps Undo. A failed restore keeps its bytes for retry. Library edits do not enter project History.
IndexedDB version and project schema are unchanged. No commit/push.

Changed this step: `io/artworkstore.ts`, `io/artwork.ts`, their existing artwork unit test,
`ui/artworklibrary.ts`, its browser fixture, CSS, manual/UPDATES and architecture/format/roadmap/
test docs. Previous uncommitted work is preserved. Fresh unit checks: **53 files / 445 tests**
passed; strict TypeScript/production build and diff check passed (existing chunk-size warning).
**102 browser assertions passed:** 34 each at real iframe viewports 390×844, 1024×768 and 768×390
on isolated localhost:5202. These include the previous complete storage/reuse/autosave suite plus
search without package reads, no-match/Clear/focus, cancel/rename/fresh-connection/portable names,
44px Manage actions after scrolling, failed removal, failed restore/retry, Undo after shelf
closure, independent copy names and stale rename-dialog rejection. The fixture deletes only its
disposable artwork DB and restores preferences. Physical iPad/Pencil/Safari remain unverified.

Native built-app review on isolated 127.0.0.1:5201: searched Flipbook review (1 of 2), expanded
Manage, renamed to Flipbook library review, removed it, saw the fixed removal Undo, restored it,
and renamed it back. The project kept its independent Flipbook review source. Screenshot:
`../artifacts/my-assets-management.png`. User origins 5197/5200 were untouched. Fresh test/native
tabs were closed after checking; no viewport emulation or storage-clearing shortcut was used.

**Immediate next feature: QuickMenu, then Ink & Paint / Auto Paint.** Use a small explicit
on-canvas opener plus keyboard access; the proposed six actions/configuration are recorded in
`docs/next-phase.md`. Preserve Draw/Animate's shared state and canvas view. Quick Animate in
`ui/quick.ts` is an existing simplified workspace and is separate from the requested QuickMenu.
Auto Paint remains unimplemented: detect only newly enclosed areas after committed ink, preserve
existing paint and combine line plus fill into one Undo. No motion/performance recording.
The earlier short-screen Clips/view investigation remains deferred by the user.

### Previous step: first cross-project My Assets library

**First cross-project My Assets library, uncommitted after 086c7da.**
The user approved Assets and Ink & Paint, explicitly excluded motion/performance recording, and
deferred the older short-screen Clips/view fixture investigation. Built My Assets first; Auto
Paint remains the next approved feature direction, not an implemented feature of this step.

Assets → Save stores an independent source snapshot in My Assets, available in other projects
on this browser/device. The library has previews, Add copy, Open as project, Download and Import
artwork file. Sources keep editable layers, frames/holds, Line/Fill, vectors, masks, internal
comp sharing, parents/pins/overrides and audio links. The current project's sources/placements
still use their existing live links. Library snapshots do not update when a project is edited.

`io/artwork.ts` captures only the reachable graph into an ordinary complete schema-3 `.2dope`
archive; missing images/sounds fail the save. `io/artworkstore.ts` atomically writes card/package
records in separate `2dope-artwork` IndexedDB v1 storage, independent of project asset GC.
`view/artworkpreview.ts` decodes first-frame drawings for the stored preview, then releases them.
`ArtworkAssets.addPackage` adopts compatible-size sources with fresh IDs and complete byte data
through one project History command. Incoming image refs intentionally have null stored keys
until autosave writes them; otherwise a preview decode can incorrectly mark foreign keys saved.
Sounds get fresh pool IDs and source fps is retained. Undo removes the copied comp graph; Redo
keeps its pool drawings available. No project schema bump, external path or dependency added.

**First-version limits:** Add copy requires matching drawing canvas dimensions. Open as project
uses FileUI import and normal autosave to preserve native size, flushing the previous project.
An asset-marked main comp is an editable project rather than a pending source session, and
Assets → Save current artwork can save another snapshot. No resizing/cropping, live links across
projects, library search/folders/deletion, or automatic updating/replacing of saved snapshots.
Download provides a portable backup/share file; storage stays local to this browser origin.

Changed this step: new `io/artwork.ts`, `io/artwork.test.ts`, `io/artworkstore.ts`,
`view/artworkpreview.ts`, `ui/artworklibrary.ts`, `ui/artworklibrary.browser.ts`,
`ui/artworklibrary-responsive.browser.ts`, `tests/artworklibrary.html` and responsive wrapper;
updated `core/assets.ts`, its tests, `core/assetcopy.ts`, `ui/artworkassets.ts`, `main.ts`, CSS,
manual/UPDATES, format/architecture/roadmap/test docs and this handoff. Earlier uncommitted
source-position/QuickShape/Flipbook work below is preserved.

Checks this turn: **53 files / 443 unit tests passed**, strict TypeScript/production build and
diff check. The existing large-chunk warning remains. Eight new unit cases cover complete source
graphs, hidden exposures/masks/audio, capture-time metadata, missing/corrupt packages, immutable
store copies, import ID collisions/internal references/Undo, incompatible sizes/busy guards and
standalone artwork mains. **86 browser assertions passed**: 22 My Assets checks each at real
iframe viewports 390×844, 1024×768 and 768×390 (66), plus the existing 20 integrated painting
checks at 1467×633. The My Assets fixture uses actual FileUI/autosave with an in-memory project
store and a uniquely named disposable IndexedDB artwork database. It clears only its own project
image pool before import to catch foreign-key/autosave errors, checks PNG/frame pixels and normal
archive capture, original-project deletion, native-size opening, quota failure, portable import,
stale async reads and Save re-enabling after Add copy. Short screens scroll the shelf body while
navigation stays reachable. Fixtures restore preferences and delete only their own artwork DB.

Native Brave 127.0.0.1:5201: saved Workflow landscape (1280×720, 2 layers) and Flipbook review
(3 layers, 14 frames) to My Assets. Fresh app loading showed both saved snapshots and previews.
Open Workflow landscape as project created a separate normal autosaved artwork project with its
two layers; Assets exposed Save current artwork. Add copy of Flipbook review imported its three
layers/14 frames with Edit focused. Native Escape/Ctrl-Z removed it (Assets 0); Ctrl-Shift-Z
restored it (Assets 1). Screenshot: `../artifacts/my-assets-library.png`.

Browser emulation and download-event APIs stalled/reset the browser tool; fresh tabs and separate
iframe wrappers completed the responsive checks instead. The native download's emitted file was
not retrieved/verified; package serialization/readback and shared-file import were verified by
unit/browser fixtures. Older stalled agent tabs from this and the preceding review could not be
reclaimed through the tool; cleanup of those tabs/old viewport overrides remains unconfirmed.
Final phone/tablet/landscape, painting-regression and native walkthrough tabs were closed; the
remaining stale ids observed were 377726962, 377726959, 377726956, 377726952 and 377726949.
User origins 5197/5200 and their project storage were not touched. Physical iPad/Pencil/Safari,
large-library quota/performance and live cross-project sharing are not verified. No commit/push.

**Next after QuickMenu:** Ink & Paint / Auto Paint, following the requirements in
`docs/next-phase.md`: detect only newly enclosed areas after committed ink, preserve existing
paint, and combine line plus automatic paint into one Undo. Recording is excluded. The user
deferred the older Clips/view fixture failures; keep their record below without blocking feature
planning or silently claiming they passed.

### Earlier multi-frame Flipbook review

**Latest step: multi-frame artwork source / Flipbook review, uncommitted after 086c7da.**
Reviewed a three-drawing source, held frames, playback, source Done/re-entry and multiple tracks
on phone/tablet/short screens. `FlipMode` now keeps Play/Pause outside scrolling actions, uses
44px button targets, caps the track list at one row on short screens, and reveals the selected
track on selection or panel resize. A row ResizeObserver updates `--flip-h` and uses existing
refit behavior. Deferred build measurements ignore hidden rows rather than publishing 16px.
On short screens at least 420px wide, the expanded compact Brush recovery button stays beside
the Tools/Options recovery column; native testing found that it could cover Tools before this.
Manual folds and panned/zoomed views retain their existing behavior.

Duration handles now expose actual frame counts and own arrow/Shift/Home/Enter/Escape keys.
Arrows adjust one frame, Shift ten, Home one; Enter/Escape returns to canvas. Tap/drag focuses
the handle and rebuilds restore that focus. Keyboard changes preview then commit through the
same exposure History as pointer trimming. New holds cap at one million frames; previously
longer holds can be shortened and Undo still restores them. No schema/dependency changes.
Shared source playback, comp frame rates, linked rendering and source/shot return were retained.

Changed this step: `ui/flipmode.ts`, CSS, manual/UPDATES, architecture/roadmap/test docs and this
handoff; new `tests/flipbooksource.html` and `ui/flipbooksource.browser.ts`.
Prior source-position/QuickShape fixes and integrated painting fixture remain uncommitted below.

Checks this turn: **52 files / 435 unit tests passed**, strict TypeScript/production build and
diff check. Existing large-chunk warning remains. **78 new browser assertions passed** at isolated
origin 5202: 26 each at 354×767, 931×698 and 698×354 CSS. The actual App/Assets/Flipbook/Sidebar/
Bubbles/Strip fixture paints red/green/blue frames, changes holds, checks focus/Undo/Redo, keeps
Play hit-testable while actions scroll, observes source playback looping, returns to Animate
frame 7 while playing, resumes the stopped source frame, checks five-track selection/resize,
recovery-button hit testing, measured fitting and linked pixels with source fps 6 / shot fps 24.
The existing integrated painting workflow also passed its 20 phone assertions this turn.
Fixtures open no project library/autosave and restore their view/brush/colour preferences.

Additional check with unresolved failures: the existing `tests/paintinglayout.html` at 698×354
reported 14 passed / 2 failed (full Tracks canvas floor and Editor recovery budget) before its
Flipbook section. A temporary two-RAF settle experiment reported 13 / 3, additionally failing
Draw fold/view recovery; starting preferences may be involved, but that is not established.
An attempted clean-preference rerun could not be read after browser automation timed out.
Temporary edits to that fixture were reverted. Do not count this fixture as passed or assume
all short-screen Clips/view-preservation behavior is verified. Main Flipbook fixture's 78
assertions and native checks above completed before this interruption.

Production Brave 5201: native duration tap + Right + Shift/Right changed 1 → 2 → 12 with focus;
Escape focused canvas, Ctrl/Z restored 2 and Ctrl/Shift/Z restored 12. Painted three source
drawings, played the source, and Done stopped playback and restored the shot with canvas focus.
Created three source tracks; selecting Paint layer brought its row into the compact strip.
Tools/Options/Brush recovery toggles worked through native clicks after the overlap fix.
Evidence: `../artifacts/flipbook-source-phone.png` (phone with tools open) and
`../artifacts/flipbook-source-short-screen.png` (short screen with controls folded).
Short landscape still has little physical canvas height; use folds/Canvas view for painting.
Physical iPad/Pencil/Safari feel and long-project performance remain unverified.
Final browser cleanup was attempted, but automation timed out twice (including inventory after
the tool kernel reset), so viewport reset/tab closure could not be confirmed. Last known agent
tabs were production 5201 (`377726949`) and fixture 5202 (`377726952`) in Brave browser 3. User
origins 5197/5200 and their project storage were not touched.
No commit/push/deploy this step.

**Immediate next task (proposed; await user authorization):** reproduce the short-screen Clips
canvas-budget and Draw fold/view fixture failures on a responsive browser, with clean isolated
preferences; verify/finish browser cleanup. Then review save/reopen with animated sources and
multiple linked placements, including Undo followed by save. Full rail rewrite,
advanced docking, cross-project sharing and Auto Paint remain separate.

### Earlier integrated painting review

**Latest step: integrated painting/source-return review, uncommitted after checkpoint 086c7da.**
Reviewed New asset → Layers/Background → Colour/Brushes/size/opacity → paint → Done → Assets/Place
→ Animate/Edit source. Re-entry reset to the first paint layer rather than the background being
edited. `ArtworkAssets` now remembers the outgoing source's layer/frame on Done or direct source
switches, in session-only WeakMap state keyed by Project. Re-entry validates the remembered layer;
missing layers fall back to the first drawing/frame zero, and existing comp-clock bounds clamp a
shortened source. Source settings, shot/layer/frame/workspace return and document History remain
shared and unchanged. Editing positions are deliberately not persisted or added to the schema.

Native painting also exposed Edit shape remaining available after source Done while the last
history command still belonged to that source. `App.shapeEditable` now requires the current
editing drawing and plane, including mask drawing/Line when editing a mask. This hides the stale
control and rejects a stale `swapShape` action without touching the old source. Returning to the
same unchanged drawing/plane can resume its shape. No dependencies or stroke algorithms changed.

Changed this step: `core/assets.ts`, `core/assets.test.ts`, `app.ts`, manual/UPDATES,
architecture/roadmap/test docs and this handoff; new `tests/paintingworkflow.html` and
`ui/paintingworkflow.browser.ts`.

Checks this turn: **52 files / 435 unit tests passed**, strict TypeScript/production build and
diff check. Four new unit cases cover layer/frame/shot return with no history, direct source
switches, removed-layer/shortened-clock fallback and isolation between projects with reused ids.
Existing large-chunk warning remains. **90 browser assertions passed** at isolated origin 5202:
20 integrated checks each at 354×767, 931×698 and 698×354 CSS (60), plus the existing 30 navigation
checks at phone size. The new fixture combines actual Assets, Layers, Colour, Brushes, Sidebar,
Bubbles, Strip/Tracks and canvas: real opacity/Fill pixels and Undo/Redo, held QuickShape ownership,
rejected stale actions, restored background/frame 9, linked placement counts, shared repainting
through the shot compositor, Clips rails and shelf return without extra document history.
No project library/autosave is opened; brush store reads and view/brush/colour preferences use the
same isolated fixture conventions and preferences are restored. Native input remains separate.

Production Brave 5201: created Workflow landscape via the shelf, added a still Background, filled
it blue, painted a peak, returned and placed it in Animate. Before the fix, Edit source selected
the empty Paint layer; source Done also left Edit shape available from the previous drawing.
After rebuilding, native Background selection → Space on source Done → shelf Edit with Enter
restored Background, still painting Line, with Updates 1 placement. Phone/tablet evidence:
`../artifacts/source-resume-phone.png` and `../artifacts/source-resume-tablet.png`. Native Done
returned canvas focus; viewport override reset and active test tab closed. Physical iPad/Pencil/
Safari feel and long-project performance remain unverified. No commit/push/deploy this step.

**Immediate next task (proposed; await user authorization):** review source entry/return in
Flipbook, including short screens and playback, with a multi-frame artwork asset. Full rail
rewrite, advanced docking, cross-project sharing and Auto Paint remain separate.

### Earlier release checkpoint

**Release checkpoint (2026-10-23):** the user requested publishing the accumulated Draw/Animate,
project-local Assets, source/placement editing, rendering and painting-control work. This checkpoint
includes the dated implementation/test records below, browser fixtures and Claude entry guidance.
Fresh release checks: 52 files / 431 unit tests and strict TypeScript/production build passed;
the existing large-chunk warning remains. The latest 102 browser assertions were verified during
the preceding implementation step, not rerun for this push. Historical "uncommitted" and
"No commit/push/deploy" labels below describe those earlier steps. Pushing main starts the
existing GitHub Pages workflow; check its result before claiming the deployed build is live.

**Latest step: brush size/opacity controls, included in this checkpoint.** Phone review reproduced 26px-wide
unlabeled sliders, `aria-valuenow="100%"` being read as zero, and pointer input leaving focus on
BODY. Sidebar now visibly labels Size (px) and Opacity (%), with ≈48px-wide slider targets and
44px buttons. ARIA values are numeric with separate value text, ranges and vertical orientation.
Size uses the existing squared mapping over 1–500px, matching canvas size shortcuts; opacity now
reaches 0–100%. Zero opacity makes new strokes invisible. Brush selection/settings/persistence
still use the existing `brushChanged` path; no model/schema/dependency or stroke-algorithm changes.

Pointer input focuses its slider. Arrows adjust 1px/1%, Shift adjusts 10, Home/End reach limits,
and Enter/Escape return to canvas. Slider keys do not navigate frames/start playback. Fine dragging
is retained; cancel/lost capture/blur/hidden stop the gesture and retain its latest value. Under
300px of usable stage height, the sidebar becomes a bottom row above a docked flipbook. CSS
publishes preferred top/bottom clearances; stage/root resize and stage-style observation refresh
the layout. The expanded Brush controls toggle moves to the right edge, clear of that row.

Changed this step: `ui/sidebar.ts`, CSS, manual/UPDATES, architecture/roadmap/test docs and this
handoff; new `tests/brushcontrols.html` and `ui/brushcontrols.browser.ts`.

Checks this turn: **52 files / 431 unit tests passed**, strict TypeScript/production build and
diff check. Existing large-chunk warning remains. **102 browser assertions passed** at isolated
origin 5202: 26 control checks each at 354×767, 931×698 and 698×354 CSS (78), plus the existing
24 brush-library checks at phone size. The real Sidebar/App/Bubbles fixture covers labels/ARIA,
touch geometry, tap/focus, exact and Shift arrows, bounds, squared mapping, fine dragging,
cancel/lost capture, Escape/Enter/Space ownership, Eraser/Line preservation, brush refresh,
half/full-opacity Fill pixels, one-stroke Undo/Redo, fold/recovery and Animate. A forced 300px
stage checks every compact control and the fold toggle with `elementFromPoint`. No project
library/autosave is opened; brush/view preferences are restored. Early compact-layout failures
were corrected before these final results; whole-stage height and unresolved CSS max-height
were insufficient measures of usable space.

Production Brave 5201: native opacity tap selected 50; Left twice then Shift+Right reached 58
with focus retained. End restored 100, Return focused canvas. Size Home/Up/Shift+Up reached 12px;
Escape returned to canvas. On the test background, Brush/Fill remained selected. Phone sliders
measured ≈48×92px. At 698×354 CSS the compact sliders were ≈48×56px and unobstructed, with an
80×44px Brush controls toggle at the right edge. Native opacity tap/Left reached 49 with focus;
End/Escape restored 100/canvas. Native Space folded and restored the row with size 12, opacity
100 and Brush/Fill intact. Evidence: `../artifacts/brush-controls-phone.png` and
`../artifacts/brush-controls-short-screen.png`. Viewport override reset; active test tab closed.
Physical iPad/Pencil/Safari feel and long-project performance remain unverified. No commit/push/deploy.

**Immediate next task (proposed; await user authorization):** review the full Draw → paint
background → Assets → Animate placement loop with these controls together, fixing remaining
navigation/layout friction before expanding the interface. Full rail rewrite, advanced docking,
cross-project sharing and Auto Paint remain separate.

### Earlier Brushes choose/return workflow

**Latest step: Brushes choose/return workflow, uncommitted.** Phone review reproduced no visible
finish action, ≈37px header actions and focus dropping to BODY after brush selection. Brushes
now has a fixed 44px Done beside brush/tool/Line–Fill status. Import/Studio/Save and collection
buttons have 44px targets. Collections and cards scroll separately; short screens use the available
viewport. Done, Escape and opener-toggle close return focus to the canvas with brush/tool/plane
intact. Outside dismissal and Studio retain their destination. Nested dialogs/menus own Escape.

Card/category rebuilds restore focus and scroll. The opener is recovered by accessible label if
its toolbar rebuilt. Closing clears double-tap timing and cancels collection drag/capture/ghosts;
lost capture cancels its matching drag. Hidden cards ignore late clicks. Single-tap selection and
double-tap Studio are retained, using existing `App.setBrush`; no model/schema/dependency changes.

Changed this step: `ui/brushlib.ts`, CSS, manual/UPDATES, architecture/roadmap/test docs and this
handoff; new `tests/brushreturn.html` and `ui/brushreturn.browser.ts`.

Checks this turn: **52 files / 431 unit tests passed**, strict TypeScript/production build and
diff check. Existing large-chunk warning remains. **88 browser assertions passed** at isolated
origin 5202: 24 brush checks each at 354×767, 931×698 and 698×354 CSS (72), plus the existing 16
Colour checks at phone size. The new fixture uses actual App/BrushLibrary/Bubbles and pen-style
Fill pixels/Undo, with selected status, 44px geometry, fixed Done, card/category focus and scroll,
Eraser/Vector/Smudge retention, reopened/rebuilt opener behavior, Escape ownership, Studio,
drag/late-click/lost-capture cleanup, outside focus, long names and Animate's shared flow. A 120px
list constraint exercises scroll without saving test brushes. It reads the brush store, saves no
brushes and opens no project library/autosave; brush/colour/view preferences are restored.

Production Brave 5201: native Inking selection retained collection focus; choosing Brush Pen
retained card focus and showed Brush Pen · Brush · Fill. Space on Done returned to canvas with
Brush/Fill selected and size 18. Escape from the selected card returned to canvas. At 698×354 CSS,
native scrolling moved the list ≈164px while Done stayed at y≈19px, ≈44px high. Enter on Done
returned to canvas with Brush/Fill intact. Evidence: `../artifacts/brush-return-phone.png` and
`../artifacts/brush-return-short-screen.png`. Viewport override reset; agent test tab closed.
Physical iPad/Pencil/Safari feel and long-project performance remain unverified. No commit/push/deploy.

**Immediate next task (proposed; await user authorization):** review the brush size/opacity
controls alongside background painting, keeping adjustments readable and easy at phone/tablet
sizes. Full rail rewrite, advanced docking, cross-project sharing and Auto Paint remain separate.

### Earlier Colour choose/return workflow

**Latest step: Colour choose/return workflow, uncommitted.** Colour now has a visible 44px Done
button in a fixed header above its scrolling controls. Done, Escape (including from Hex colour)
and the opening colour circle return focus to the canvas, keeping the chosen colour, tool and
Line/Fill target. Closing clears any active disc drag. Outside clicks retain their normal target.
Escape yields to an open nested dialog or context menu. The toolbar replaces its colour button
after colour changes; the panel now recovers that anchor so the opening circle closes it normally.
A size observer repositions the panel when Disc/Values or Recent rows change its height.

Changed this step: `ui/colorpanel.ts`, CSS, manual/UPDATES, architecture/roadmap/test docs and this
handoff; new `tests/colourreturn.html` and `ui/colourreturn.browser.ts`. No document/schema or
dependency changes; existing shared project/history/residency paths are preserved.

Checks this turn: **52 files / 431 unit tests passed**, strict TypeScript/production build and
diff check. Existing large-chunk warning remains. **84 browser assertions passed** at isolated
origin 5202: 16 Colour assertions each at 931×698, 354×767 and 698×354 CSS (48), plus the existing
36 painting-plane assertions at phone size. The in-memory fixture checks fixed/reachable Done,
scrolling, resized placement, rebuilt opening-circle toggle, colour/tool/plane retention, a real
Fill stroke and Undo, Eraser, Hex Escape/invalid entry, nested-dialog ownership, late disc events,
Layers access and the before swatch. It opens no library/autosave and restores view/colour prefs.

Production Brave 5201: palette yellow + Enter on Done retained Brush/Fill and focused the canvas.
Native keyboard entry of #264653 + Return committed the colour; Escape from the Hex field then
closed Colour with canvas focus and Brush/Fill intact. Layers remained reachable and Space on
Close layers returned to the canvas. At 698×354 CSS a native scroll moved the body by ≈322px while
Done stayed at y≈19px, ≈44px high; Space on Done retained #264653 and focused the canvas. Evidence:
`../artifacts/colour-return-phone.png` and `../artifacts/colour-return-short-screen.png`.
Viewport override reset and agent test tab closed. Physical iPad/Pencil/Safari feel and long-project
performance remain unverified. No commit/push/deployment.

**Immediate next task (proposed; await user authorization):** review the brush library's
choose/return workflow alongside background painting, keeping the selected brush, tool and plane
clear. Full rail rewrite, advanced docking, cross-project sharing and Auto Paint remain separate.

### Earlier background painting / Layers / Line–Fill review

**Latest step: background painting / Layers / Line–Fill review, uncommitted.** Reproduced in
production: selecting Paint on Fill replaced Brush with the bucket, and Line selected Vector.
`App.setPlane` now keeps Brush, Eraser and Smudge. Vector is explicitly on Line and the bucket
on Fill; choosing their incompatible plane uses Brush. Plane selection no longer resets the fill
mode. Existing raster/vector storage, residency, commands, source navigation and schema are retained.

Phone Line/Fill buttons/eyes were ≈34px and opacity ranges ≈16px high. These now have 44px targets;
the layer opacity/blend rows and panel header controls are enlarged too. Visibility buttons say
Hide/Show Line or Fill. Close layers explicitly returns to the canvas. A native opacity arrow-key
check also reproduced focus dropping to BODY when the panel rebuilt. `LayerCards.update` now
preserves list scroll and restores the focused input/select within its original options group.

Changed this step: `app.ts`, `ui/layercards.ts`, CSS, manual/UPDATES, architecture/roadmap/test docs,
this handoff; new `tests/paintingplanes.html` and `ui/paintingplanes.browser.ts`.

Checks: **52 files / 431 unit tests passed**, strict TypeScript/production build and diff check.
Existing large-chunk warning remains. **138 browser assertions passed** at isolated origin 5202:
36 painting checks each at 354×767, 931×698 and 698×931 CSS (108), plus 30 asset workflow checks.
The new fixture uses actual App/Bubbles/LayerCards, pen-style strokes, resident pixels and the
compositor: still background and linked paint layers, Brush/Eraser/Smudge/Vector/bucket routing,
separate Line/Fill, X, opacity/visibility pixels, focus/scroll, Close, and stroke/layer Undo/Redo.
It opens no library/autosave and restores view preferences. Visible-colour comparisons tolerate
one 8-bit level for untouched planes, up to three for history patch readback under Chromium canvas
privacy, and one alpha level. The measured redo difference was ≤3 raw RGB / ≈2.17 premultiplied
levels with alpha unchanged; exact raw RGB at transparent edges is not claimed.

Production Brave 5201: at phone width Fill kept Brush selected and the bucket off. Repeated native
Fill-opacity Left keys changed 99→98→97 while retaining Fill opacity focus and the same list scroll;
End restored 100. Space on Close layers focused the canvas. Through actual controls, added a still
blue background, brushed two strokes on Fill, then a Line stroke while keeping Brush. Tablet rows
measured ≈44px for each target/eye/range; Line opacity retained focus after Left/End. Source Done
returned to the shot. Evidence: `../artifacts/painting-planes-phone.png` and
`../artifacts/painting-layers-tablet.png`. Physical iPad/Pencil/Safari feel and long-project performance
remain unverified. No commit/push/deployment.

**Immediate next task (proposed; await user authorization):** review Colour's touch close/return
path alongside painting and layers. Observed here: the phone Colour panel covers the Layers tool
and has no visible Close action; Escape dismisses it. Keep the chosen colour/tool and recoverable
canvas controls. Full rail rewrite, advanced docking, cross-project sharing and Auto Paint remain
separate.

### Earlier source identity

**Latest step: visible source identity while painting, uncommitted.** The source header now shows
its artwork name and Updates N placements across all project comps, or Not placed yet for unused
artwork. It reuses `CompEditor.instances`; no model/schema/dependency changes. Full source names
and the project-wide edit explanation remain in the group description and tooltips. Rename,
Undo/Redo and ordinary UI updates refresh the name/count. Exiting clears the source status.

Source identity uses two text lines beside Done in the existing-height header. Below 700px the
workspace selector/switcher and redundant Source prefix step aside while editing, leaving room
for Assets, source name/status and Done. Long names shorten within the available width. Done
restores the ordinary header and existing shot/frame/workspace/canvas-focus return behavior.

Changed this step: `ui/artworkassets.ts`, CSS, `ui/artworkworkflow.browser.ts`, manual/UPDATES,
architecture/roadmap/test docs and this handoff.

Checks: **52 files / 431 unit tests passed**, strict TypeScript/production build and diff check.
Existing large-chunk warning remains. **162 browser assertions passed** on isolated dev origin 5202:
30 workflow assertions at 1745×833, 931×698, 698×931 and 354×767 CSS (120), naming 10, plus 16 layout
assertions at tablet landscape and phone (32). Added checks cover source identity/unplaced status,
complete status/44px Done within one compact header, Fit clearance, one and multiple uses across
other shots, 80-character source names, rename Undo/Redo and restoring workspace controls. The
fixture uses in-memory artwork only and restores local view preferences; no library/autosave.

Production Brave 5201 at 354×767 CSS: native Enter on Sky's Edit source opened Evening sky;
its name and Updates 2 placements were visible in a ≈241×54px header, with the complete status
fitting. Native Space on Done returned to Animate/frame 1 with canvas focus, a visible workspace
selector, cleared source status and playback stopped. Test-only drawing folds were restored;
viewport override reset. Screenshot: `../artifacts/source-identity-phone.png`.
Physical iPad/Pencil/Safari feel and long-project performance remain unverified.

**Immediate next task (proposed; await user authorization):** review Draw's Layers and Line/Fill
controls at tablet/phone sizes during an actual background-painting pass, then fix observed
friction. Full rail rewrite, advanced docking, cross-project sharing and Auto Paint remain separate.
No commit/push/deployment.

### Earlier compact source access

**Latest step: direct Edit source in the compact placement bar, uncommitted.** The existing
Edit source control now stays beside Placed asset, Options and Done, outside scrolling details.
On phones it keeps a pencil icon and visible Edit label in a 44px target. Replace/Copies/Names
use three columns in the phone details. The compact row retains its height; source selection,
editing and Done use the existing navigation, shot/frame return, canvas focus and History behavior.
Done's tooltip now explains that it returns to the shot/frame. No model/schema/dependency changes.

Changed this step: `ui/artworkassets.ts`, CSS, `ui/paintinglayout.browser.ts`,
`ui/artworkworkflow.browser.ts`, manual/UPDATES, architecture/roadmap/test docs and this handoff.

Checks: **52 files / 431 unit tests passed**, strict TypeScript/production build and diff check.
Existing large-chunk warning remains. **106 browser assertions passed** on isolated origin 5202:
16 layout assertions at each of 1745×833, 931×698, 698×931 and 354×767 CSS pixels (64), plus
21 workflow assertions at desktop and phone widths (42). New checks cover reachable/labeled Edit
with Options closed, 44px geometry (0.1px zoom-rounding tolerance), no-selection disabling and
fixed sizing outside the scrolling details. Workflow checks direct Edit, pen-style source painting,
Undo/Redo, touch cancellation and return without opening library/autosave.

Production Brave 5201 at 354×767 CSS: compact bar ≈58px tall, picker ≈170px wide, Edit ≈44×44px
and Options closed. Native Enter on Edit opened the selected source in Draw with canvas focus;
native Space on Done returned to Animate/frame 1 with canvas focus and playback stopped. Screenshot:
`../artifacts/compact-source-phone.png`. Viewport override reset. Physical Pencil/touch feel,
iPad Safari and long-project performance remain unverified.

**Immediate next task (proposed; await user authorization):** review the source-editing header on
narrow screens so students can identify the artwork and its shared-link behavior while painting.
Full rail rewrite, advanced docking, cross-project sharing and Auto Paint remain separate.
No commit/push/deployment.

### Earlier input/focus review

**Latest step: Draw → Assets → Animate input/focus review, uncommitted.** Reproduced two
production keyboard conflicts: Enter on Asset options exited placement, while Space started
playback instead of activating the button. `App.onKey` now gives native fields their keys,
leaves Enter/Space button activation alone and respects already-handled events. Ignored releases
clear held navigation keys without toggling playback. Canvas/body shortcuts still work.

The drawing canvas is Tab-reachable; pointer input focuses it without scrolling. New asset,
Edit source (including shelf previews/cards) and both Done controls return focus to the canvas.
Place focuses the selected-placement picker. Navigation retains the existing shared project,
source pixels, shot/layer/frame/workspace return and History behavior. No schema/dependency changes.

Changed this step: `app.ts`, `ui/artworkassets.ts`, manual/UPDATES, architecture/roadmap/test docs,
this handoff; new `tests/artworkworkflow.html` and `ui/artworkworkflow.browser.ts`.

Checks: **52 files / 431 unit tests passed**, strict TypeScript/production build and diff check.
Existing large-chunk warning remains. **85 browser assertions passed** on isolated dev origin 5202:
new workflow 20, placement 13, clip gestures 17, layout 13 (1745×782 CSS), timing 9, replacement 13.
The new workflow uses real App/UI, pen-style pointer events and source pixels, one-step Undo/Redo,
creation/placement/source return, touch move-to-pinch cancellation, focus and keyboard routing.
It opens no library/autosave and restores its view preferences. Its touch check resolves the live
placement after cancellation because the editor restores a snapshot rather than the old object.

Production Brave 5201: native Enter opened Asset options without leaving placement; native Space
closed it without playback. Enter opened Edit source with canvas focus; Space on Done returned
to Animate with canvas focus and playback stopped. Evidence: `../artifacts/artwork-workflow-focus.png`.
Actual iPad/Pencil/Safari feel and long-project performance remain unverified.

**Immediate next task (proposed; await user authorization):** make the selected asset's Edit source
and return path easier to discover from the compact placement bar, keeping the existing style and
canvas-space budget. Full rail rewrite, advanced docking, cross-project sharing and Auto Paint
remain separate. No commit/push/deployment.

### Earlier canvas-space step

**Latest step: more canvas space in Draw/Animate, uncommitted.** Move assets now starts with a
compact Placed asset / Options (three dots) / Done bar. Source actions, identity, Undo/Redo and
optional Timing open in bounded scrolling details. Picker and Done stay outside that scroll
area. Closing Options restores the compact bar, and Reset layout folds both options and timing.
These folds are session view state, not document data. Options/timing toggles preserve the view.

`TracksSheet` now measures the actual column/stage and reserves about 45% canvas at full Tracks
and 60% at half in painting modes, with 280px/300px floors when feasible and at least 60px of
tracks. It recalculates on viewport/editor changes, skips hidden tracks, and avoids redundant size
writes. Timing retains its review budget. User sheet changes/drags call preserveCanvasView before
existing refit callbacks. Explicit `App.fit` clears the painting header and compact placement row;
expanded options remain temporary overlays. No content, timing, history, schema or dependencies
change. Earlier work remains preserved below.

Changed this step: `ui/artworkassets.ts`, `ui/sheet.ts`, `ui/paintingworkspace.ts`, `main.ts`,
`app.ts`, CSS, manual/UPDATES, architecture/roadmap/test docs/this handoff; new
`tests/paintinglayout.html` and `ui/paintinglayout.browser.ts`. Naming/independent/replacement/
numeric-timing browser helpers now open Options before accessing tucked controls.

Checks: **52 files / 431 tests passed**, strict TypeScript/production build and `git diff --check`.
Existing large-chunk warning remains. **13 real-App/app-CSS layout assertions at each of three
CSS viewport sizes (39 total): 931×698, 698×931, 354×767.** Coverage: readable picker/Done,
explicit Fit clearances, bounded scrolling details, folding view/frame preservation, full canvas
budget, half/full/peek view preservation, editor recovery, Reset layout, Draw handle recovery,
no document/history changes and Done while collapsed. The fixture saves/restores only its local
view-preference keys; it opens no library/autosave. **46 asset browser assertions also passed**:
naming 10, independent copies 14, source replacement 13 and numeric timing 9, through Options.

Production Brave `5201`: at 931×698 CSS, full Tracks left a measured 314px canvas in a 698px
column; at 354×767 it left 345px in a 767px column. Expanded timing scrolled while Done stayed
at y≈67px; Show start remained usable and moved to frame 4. Closed Options returned to a 58px
bar, with a 218px phone picker. Folded Tools/Options remained recoverable at the edges. Explicit
Fit showed artwork between the header and compact bar. Viewport override reset after checks.
Evidence: `../artifacts/canvas-space-tablet.png`, `../artifacts/canvas-space-phone.png`.
Physical iPad/Pencil/Safari and long-project performance remain unverified.

**Immediate next task (proposed; await user authorization):** review the complete Draw → Assets →
Animate navigation with touch/pen-style input and keyboard focus, using observed findings to
choose the next fixes. Physical Pencil checks still need a device. Full rail rewrite, advanced
docking, cross-project sharing and Auto Paint remain separate. No commit/push/deployment.

### Earlier source replacement step

**Latest step: Replace source for a selected asset placement, uncommitted.** Replace in Move
assets opens the familiar Assets preview shelf in a focused selection mode. Use source or its
preview changes the selected placement's link. Current source is disabled; ordinary Edit/Place/
Rename/New asset controls and placement rows are omitted in this mode. Close cancels. Source
identity/counts/picker/previews update, and Edit source opens the replacement artwork in Draw.

`ArtworkAssets.replaceSource` uses one focused metadata History command, resolving the live
placement by id on Undo/Redo. It preserves name, transform/keys, parent, lock and playback/timing.
Old source-layer pinned overrides reset and are restored by Undo. A finite automatic one-shot
ending becomes explicit out before the swap; looping shot-followers remain automatic. No source
comps/drawings/pixels are created or deleted. `canReplaceSource` rejects unchanged/nonasset/missing
sources and circular/dangling nested source graphs. UI actions check project, active comp,
selection and original source; stale selection/project replies close without changes. Cancel
restores Replace focus. Shelf preview pins still release through existing sequential previews.
The new action group stays together on desktop and uses five labeled icon columns on phones.
No schema or dependency changes. Earlier uncommitted work is retained below.

Changed this step: `core/assets.ts`, `core/assets.test.ts` (four new cases), `ui/artworkassets.ts`,
CSS, manual/UPDATES, architecture/roadmap/project-format/test docs/this handoff; new
`tests/assetreplace.html` and `core/assetreplace.browser.ts`.

Checks: **52 files / 431 tests passed**, strict TypeScript/production build, `git diff --check`.
Existing large-chunk warning remains. **13 real-App browser assertions passed** at isolated dev
origin `5202`: shelf scope/current/cancel/focus, selected source/picker/preserved properties,
real red/green compositor pixels, queued App Undo/Redo, Edit source/Done, validated standalone
ZIP with both editable sources, and stale selection/project actions. No library/autosave in fixture.

Production Brave `5201`: replaced Foreground trees' Evening sky copy with Evening sky, retaining
its name and 4–20 interval. Counts changed to three linked originals, with the independent source
still available. One Undo/Redo restored/reapplied the link. Reload retained the replacement. At
**354×767 CSS pixels**, inspected the compact action row and source previews, then selected the
independent source again through Use source. Both editable sources remained; another reload kept
the selected source and 4–20 interval. Desktop toolbar now keeps Done in its action row. Viewport
override reset. Evidence: `../artifacts/asset-replace.png`, `../artifacts/asset-replace-phone.png`.
Physical iPad/Pencil/Safari and long-project performance remain unverified.

**Immediate next task (proposed; await user authorization):** tablet layout pass for Draw/Animate,
recovering canvas space when placement controls and expanded Tracks are both open, with reachable
selector/Done/collapse handles and preserved zoom/playhead. Full rail rewrite, advanced docking,
cross-project sharing and Auto Paint remain separate. No commit/push/deployment.

### Earlier independent artwork step

**Latest step: Make independent for one asset placement, uncommitted.** Move assets now has
Copies → Duplicate placement (shared source) / Make independent (own editable artwork). The
selected placement retains its name, timing, lock and transform. Its copied source gets a unique
copy suffix and keeps layers, frames, Line/Fill, deep vector data, masks and nested source graphs.
Edit source opens that artwork in Draw; Done returns through the existing source navigation.
One Undo restores the original source link and removes the new comps; Redo restores the copy.

`core/assetcopy.ts` walks/deduplicates the source graph and remaps comp/layer/cel/audio ids,
parents, masks, pins, overrides (including selected outer placement overrides) and audio panel
links. Immutable audio bytes remain shared. `Project.cloneStoredDrawing` creates fresh parked
drawing ids with deep vectors and independent canvases on decode. Stored PNG refs are reused
without loading all frames; dirty resident Line/Fill encode serially with balanced Residency pins.
Project/comp/source/drawing revision checks reject stale async jobs before allocating pool data.
File comp/drawing/vector limits are enforced before and after preparation. Undo uses existing
`CompEditor.editProject` metadata snapshots; drawings stay in the pool for Redo and their keys
remain GC-protected. No new schema fields/dependencies; Motion's shallow makeUnique is unchanged.

Changed this step: new `core/assetcopy.ts` and tests, `core/assets.ts` and tests, `core/project.ts`,
`ui/artworkassets.ts`, exported existing format limits in `io/schema.ts`, manual/UPDATES,
architecture/roadmap/project-format/test docs/this handoff, and new `tests/assetindependent.html`
with `core/assetindependent.browser.ts`. Earlier uncommitted changes are preserved below.

Checks: **52 files / 427 tests passed**, strict TypeScript/production build, `git diff --check`.
Existing large-chunk build warning remains. **14 real-App browser assertions passed** on isolated
dev origin `5202`: Copies/cancel, selected source ownership, real PNG Line/Fill, deep vector points,
independent painting and paint/source Undo/Redo, validated standalone ZIP reload, independent
recoloring, Edit source/Done, and linked Duplicate placement. No library/autosave in the fixture.

Production Brave `5201`: made Foreground trees independent from Evening sky. Its name and 4–20
interval stayed intact; source count changed from three shared placements to two original/one
independent. One Undo/Redo restored/reapplied the link. Painted an extra stroke in Evening sky
copy, returned, opened Evening sky and confirmed the original five lines were unchanged. Its two
clip previews matched; the independent preview differed. Autosave/reload kept both source cards,
placement names, counts and edited preview. At **354×767 CSS pixels**, inspected Copies choices
and cancelled without changes. Viewport override reset, canvas fitted afterward.
Evidence: `../artifacts/asset-independent.png`, `../artifacts/asset-independent-phone.png`.
Physical iPad/Pencil/Safari and long-project performance remain unverified.

**Immediate next task (proposed; await user authorization):** Replace source on one selected
placement from this project's Assets shelf, keeping its name/timing/transform and one Undo.
Full rail rewrite, advanced docking, cross-project sharing and Auto Paint remain separate.
No commit/push/deployment.

### Earlier naming step

**Latest step: separate placement/source naming, uncommitted.** The placement toolbar now has
Names → Rename placement / Rename source, with a scope explanation before entering text. A
placement rename affects that instance only. Source rename changes the shared comp name across
the project and preserves every existing placement name. Source cards in Assets have Rename,
including unplaced sources; the shelf reopens afterward. Draw header, picker, rail labels and
source context reflect names. Metadata only: no pixels, links, timing or transforms change.

`ArtworkAssets.renamePlacement/renameSource` use one focused shared-history command per name,
resolving objects by id during Undo/Redo so later comp-snapshot commands cannot stale the target.
Blank/unchanged names add no history, names trim/cap at 80 characters, and busy/playback edits
are refused. Dialog replies are guarded by Project identity and active comp. Cancel restores
focus to Names or the shelf. `askText` has an optional scope description; old callers keep their
existing behavior. Hinted picker choices stack the description below the title instead of running
the two together. No dependency, format or schema changes.

Changed this step: `core/assets.ts`, `core/assets.test.ts` (four new cases and extended validated
name round-trip coverage), `ui/artworkassets.ts`, `ui/dialogs.ts`, CSS, manual/UPDATES, architecture,
roadmap/test docs/this handoff; new `tests/assetnames.html` and `core/assetnames.browser.ts`.

Checks: **51 files / 416 tests passed**, strict TypeScript/production build and `git diff --check`.
**Ten real-App browser assertions passed** at isolated dev origin `5202`: scope choices, menu/text
cancel, one-copy rename/picker, one-step Undo, source rename preserving placement labels,
validated capture/reload of names and links, Draw header, shelf/card refresh, and stale-project
reply rejection. No library/autosave is opened in that fixture.

Production Brave `5201`: renamed Sky 2 placement to Foreground trees; Undo/Redo restored/reapplied
it as one step. Renamed shared Sky to Sunset while the Foreground trees and other placement names
stayed intact. At **354×767 CSS pixels**, used the source-card Rename to Evening sky and checked
the refreshed shelf. Autosave/reload retained the distinct names. Viewport override reset.
Evidence: `../artifacts/asset-names.png` and `../artifacts/asset-names-phone.png`.
Physical iPad/Pencil/Safari and long-project performance remain unverified.

**Immediate next task:** Make independent for a selected placement, copying editable artwork with
one Undo restoring the original source link. Inspect/reuse existing make-unique support, including
pixel-reference ownership, instead of duplicating the entire asset system. Full rail rewrite,
advanced docking, cross-project sharing and Auto Paint remain separate. All work is uncommitted;
no push/deployment.

### Earlier preview and identity step

**Latest step: artwork previews and source/placement identity in Clips, uncommitted.** Asset bars
repeat a small source-frame-one preview. These identify shared artwork, not each animated frame
or the instance's transform. Names/durations and trim grips remain above the preview. Duplicates
share cached artwork; source settings/pixel revisions invalidate it. Preview completion updates
existing elements without rebuilding rails. Only visible clips request new rendering, one job at
a time; drawing/clip gestures and playback defer new work. The 32-entry LRU is scoped by Project
identity, including reused ids/revisions. Completed slots do not thrash on LRU eviction.

Labels distinguish placement names/numbers from source names. Numbers count instances of that
source in the current shot. The picker includes a differing source name in parentheses; the toolbar
shows Source and the linked count in this shot. Edit source's tooltip explains the shared effect
across all shots. Draw's source header says Source. Shelf counts say linked placements. Picker
selection now also refreshes rail highlights/grips via the editor-change callback.

Changed: new `core/assetlabels.ts` (+ four tests), `view/assetpreview.ts`, `ui/assetclippreviews.ts`,
`ui/rails.ts`, `ui/strip.ts`, `ui/artworkassets.ts`, `main.ts`, CSS/manual/UPDATES, architecture,
roadmap/test docs/this handoff; new `tests/assetpreviews.html` / `view/assetpreview.browser.ts`.
Renderer pins only frame-needed drawings, uses the shared compositor and suppresses export stamps.
Cancellation/error paths release pins. Visibility changes resume preview observation. No schema,
document-edit behavior or dependencies added. Earlier work remains preserved below.

Checks: **51 files / 412 tests passed**, strict TypeScript/production build and `git diff --check`.
**15 new browser assertions passed** at isolated dev origin `5202`: actual PNG capture/reload,
layered pixels/opacity, pin success/cancel/error cleanup, shared cache/rebuilt-node reuse, source
edits without replacing nodes, offscreen/input deferral, project identity reuse and leaving Clips.
This fixture uses a minimal App-shaped view-state rig, real DOM, Residency and compositor.

Production Brave preview `5201`: source/placement labels, repeated artwork after reload, edited
the shared source in Draw and returned; all three linked clip previews changed and matched.
Dragging the thumbnail-covered clip shifted 4–20 to 5–21; one Undo restored 4–20. At **354×767
CSS pixels**, inspected repeated artwork and used the picker between Clouds (one placement) and
Sky (three placements); source identity/counts remained readable. Viewport override reset.
Evidence: `../artifacts/asset-previews.png`, `../artifacts/asset-previews-phone.png`.
Physical iPad/Pencil/Safari and long-project performance remain unverified.

**Immediate next task:** separate Rename placement and Rename source actions in existing asset
controls, preserving shared links and history. Do not rebuild previews, movement/timing or the
asset loop. Full rail rewrite, advanced docking, cross-project sharing and Auto Paint remain
separate. Keep physical iPad checks on the checklist. All work is uncommitted; no push/deployment.

### Earlier direct clip gesture step

**Latest step: direct asset clip dragging/trimming, uncommitted.** In Animate → Clips, drag an
asset bar to move it by whole frames. Select a bar to reveal 44px start/end grip targets. Moving
keeps visible duration; start trimming keeps the source origin and ending, while end trimming
keeps the beginning. Moving/trimming a following clip makes its current interval explicit;
Follow shot end in numeric Timing restores automatic ending. Preview recomputes from the initial
snapshot, release commits one history entry, and a tap or returning to the origin creates none.
Source pixels, local transform keys and sibling tracks stay put. Fixed shot duration bounds edits.

`CompEditor.assetClipStart/Move/End` owns previews and participates in `strokeActive` busy state;
existing `gestureEnd(true)` cancels on project/workspace navigation. Delegated `ui/assetclipdrag.ts`
captures the stable Strip scroll container across rail rebuilds. Escape, a second pointer,
pointercancel, lost capture, blur, hidden pages and leaving Clips cancel unfinished previews.
Near-edge pointer movement nudges horizontal scrolling. No cross-track moves or ripple are added.
Asset track names sit above the bars so first-frame handles are no longer under sticky labels.
Numeric Timing remains the exact/accessible path for very short clips. Its tray scrolls within
short canvas areas with a sticky picker/Timing/Undo row, keeping expanded Tracks usable on phones.
The Clips playhead and auto-scroll now use the shared clock beyond the held drawing frame;
ruler labels include the active drawing track's comp offset.

Changed in this step: `core/assettiming.ts` (+ four tests), `compedit.ts` (+ three tests), new
`ui/assetclipdrag.ts`, `ui/rails.ts`, `ui/strip.ts`, CSS/manual/UPDATES, architecture/roadmap/tests
docs/this handoff; new `tests/assetclips.html` and `core/assetclips.browser.ts`. Existing schema-3
fields and history only; no dependency/schema changes. Previous work remains preserved below.

Checks: **50 files / 408 tests passed**, strict TypeScript/production build and `git diff --check`.
**17 real-App browser assertions passed** on isolated dev origin `5202`: live rebuilt-bar move,
both trims, one-step Undo, no ripple, taps, cancellation via pointer/Escape/second pointer/lost
capture/blur, subsequent control clicks, Flipbook/workspace/project exits, returning to the origin,
validated capture/reload and the actual Strip's beyond-drawing playhead/scroll. These dispatch
scripted events, not physical touch/Pencil input.

Production Brave preview `5201`: body drag shifted 5–18 to 7–20, one Undo restored 5–18;
start grip trimmed to 6–18, end grip extended to 6–20, numeric Timing agreed. At **354×767 CSS
pixels**, expanded Tracks and dragged the start grip to 4–20; autosave/reload retained it.
Found/fixed the offscreen Timing tray with expanded Tracks and checked Show end plus the sticky
Timing toggle after scrolling the tray. Viewport override reset. Evidence: `../artifacts/asset-clips.png`
and `../artifacts/asset-clips-phone.png`. Physical iPad/Pencil/Safari remains unverified.

**Immediate next task:** artwork previews on asset clips and clearer source/placement labels,
using resident/cached thumbnails without decoding entire projects or rebuilding the timeline.
Keep physical iPad checks on the checklist. Full rail rewrite, advanced docking, cross-project
sharing and Auto Paint remain separate. Do not reimplement the asset loop, movement or numeric
timing. All work remains uncommitted; no push/deployment.

### Earlier numeric timing step

**Latest step: selected asset timing in Clips, uncommitted.** Animate → Clips → tap an asset
track (or choose a placement in Move assets) → Timing exposes Start, Hold and End. Start/End
are inclusive shot frame numbers; Hold is duration in frames. Enter or leaving a field commits
one history step; Escape discards a pending value. Start shifts the interval and source origin
together; Hold/End set a finite ending, Follow shot end restores `out:null`. An auto-sized shot
can shrink when its finite ending is removed. Fixed shot duration bounds edits. Once-playing
sources become looping when setting their hold/end so they do not disappear prematurely;
single-frame and ping-pong modes are preserved. Source drawings, transforms and sibling tracks
are not retimed. Off-frame selection remains editable; preview handles require visible content.

Asset tracks now stay visible in Animate's folded Clips list, highlight selection, show their
actual interval and select the instance rather than entering the source. The Clips ruler,
scrubbing range and readout follow the shared shot clock beyond a shorter drawing track.
Show start/end jumps preview the interval edges. Timing folds away, including at phone width.
Undo/Redo clamp the playhead when the shot gets shorter.

Changed: new `core/assettiming.ts` plus six tests; three added editor tests; `compedit.ts`,
`app.ts`, `ui/artworkassets.ts`, `ui/rails.ts`, `ui/strip.ts`, `main.ts`, CSS/manual/UPDATES,
architecture/next-phase/test docs/this handoff. New `tests/assettiming.html` and
`core/assettiming.browser.ts`. Uses existing schema-3 fields; no dependency/schema changes.

Checks: **50 files / 401 tests passed**, strict TypeScript/production build and `git diff --check`.
**Nine real-App browser assertions passed** at isolated development origin `5202`: native field
change/Enter/blur, off-frame selection, composite pixels before/at Start and at/after End,
one-step Undo, shorter-shot playhead clamping, Escape cancellation and validated capture/reload.
Production preview `5201`: changed Hold 12, Start 5, End 18; used Undo/Redo, Follow shot end,
edge jumps, Play/Pause across the extended shot, saved/reloaded the interval. At **354×767 CSS
pixels**, edited End and folded Timing to recover canvas space. Viewport override reset.
Evidence: `../artifacts/asset-timing.png`, `../artifacts/asset-timing-phone.png`.
Physical iPad/Pencil/Safari behavior remains unverified. Earlier fixture counts below are historical.

**Immediate next task:** direct clip movement and edge trimming in Clips, using the same timing
command/history model with one Undo per gesture. Keep the full rail rewrite, advanced docking,
cross-project sharing and Auto Paint separate. Do not rebuild the existing asset loop, placement
tool or numeric timing. All work remains uncommitted; no push/deployment.

### Earlier direct arrangement step

**Latest step: direct asset arrangement in Animate, uncommitted.** Place opens the explicit
**Move assets** tool with that instance selected. Tap a placement, drag to move, use a corner
to resize proportionally. A contextual picker handles overlapping/offscreen instances; Edit
source, Duplicate, Done and shared Undo/Redo stay accessible. Brush sliders tuck away while
arranging. Both Flipbook and Clips support it. Painting locks stay on the instances; only this
explicit, asset-filtered gesture path permits their transforms. Static edits ignore Motion's
Auto-key preference; already animated properties keep their other keys and edit at the playhead.
Entering/leaving arrangement fits the comp/drawing view. Mode/selection is session state;
transforms and source links use existing schema-3 comp data.

Changed in this step: `app.ts` (mode scope, rendering/residency, pointer/keyboard routing,
busy-state/cancellation handling and source-only Draw context); `compedit.ts` (restricted gesture
options, threshold for taps versus moves); `view/overlay.ts` (simple asset handles); `ui/bubbles.ts`
(Move assets and direct return to painting); `ui/artworkassets.ts` (contextual controls and shelf
Move action); `core/assets.ts` (auto-select placement), its test rig, `main.ts`, CSS, manual/UPDATES,
architecture/roadmap/this handoff. Seven added editor regressions; new repeatable browser fixture
`tests/placement.html` / `core/placement.browser.ts`. No dependency or schema changes in this step.

Checks: **49 files / 392 tests passed**, strict TypeScript/production build and `git diff --check`
passed. **13 real-App browser input assertions passed** on isolated origin `5202`: auto-selection,
tap/no history, one-step move/Undo, release outside canvas, pen cancellation, switching a moved
finger to pinch without undoing prior work, Done/lock/source preservation, resident content-pivot
resize, validated transform capture/reload, stepping past shot end, workspace exit and new project
reset. These dispatch events in a real browser; they are not physical Pencil/touch tests.

Desktop Brave production preview `5201`: selected on canvas, moved and resized one linked
instance, one Undo restored the whole drag, duplicated it, edited its shared source and returned;
autosave/reload retained transforms and links. Fixed sibling instances showing around the source
while editing: Draw asset sources now show on their own. Tested drawing-tool return without
opening Brushes, and both Flipbook/Clips. At **354×767 CSS pixels**, used the placement picker,
moved artwork and Undo/Redo in the contextual toolbar, collapsed the editor and used Done to
restore drawing controls. Viewport override reset. Evidence: `../artifacts/asset-placement.png`
and `../artifacts/asset-placement-phone.png`. Physical iPad/Pencil/Safari remains unverified.

**Immediate next task:** clearer asset start/hold/end controls in Clips, tied to the selected
instance and existing comp timing. Keep the full rail rewrite, advanced docking, cross-project
sharing and Auto Paint separate. Do not reimplement the asset loop or direct placement tool.
All work remains uncommitted; no push/deployment. Earlier paragraphs below record preceding steps.

### Earlier asset UI polish

**Latest UI polish (uncommitted):** `ui/artworkassets.ts` now uses a compact right-edge dialog with real artwork previews, layer/frame counts, source Edit/Place buttons and folded placement details. It matches existing line icons, rounded layer cards and theme variables. Previews pin/unpin source frame-0 drawings through Residency, render through the compositor, run sequentially and stop when the panel/project changes. `ui/paintingworkspace.ts` uses icon-labelled mode shortcuts; CSS keeps Assets/Done visible at narrow widths, moves New asset into the shelf on phones, and highlights Done. Manual/UPDATES updated. Document format and source/placement commands are unchanged by this polish.

Checks for this polish: **49 files / 385 tests passed**, strict TypeScript/production build and `git diff --check` passed. Desktop Brave production preview `5201`: source thumbnails drawn after reload from parked artwork; folded placement actions, remove/Undo, source Edit/Done, create/Place another source, Escape dismissal and focus return. Responsive override was refreshed successfully in this pass: **354×767 CSS pixels** inspected, source Done and Assets remain visible without header scrolling, shelf cards adapt to a single-column compact layout and New asset/create/place works. This supersedes the earlier asset phone-width gap below, but still does not verify physical iPad/Pencil/Safari behavior.

**Next bounded product step:** select a placed asset directly in Animate and move/resize it with a small contextual Edit source action, using the existing comp transform/history model; then make its hold/start/end clearer in Clips. Current placements are initially locked and transforms remain in Motion. The free-arrangement rail is still separate future work. Keep iPad testing on the checklist. No commit/push/deployment performed.

### Earlier reusable asset step

**Latest step: reusable project assets, uncommitted.** Draw → New asset → paint/add layers → Done → Assets/Place in Animate → Edit source in Draw → Done now works. Sources are normal editable comps marked `asset: true`; placements are linked comp layers, initially locked, behind drawing tracks. Still artwork holds and optional source frames loop. Unplaced sources stay saved. Assets are project-local; cross-project sharing is not built. The Draw/Animate layouts below remain in place; Clips reuses the exposure timeline.

Changed in this asset step: new `core/assets.ts`, `core/assets.test.ts` (seven regressions), `core/assets.browser.ts`, `ui/artworkassets.ts`, `tests/assets.html`; comp model/schema preserve the optional source marker, `app.ts` keeps linked sources visible/resident and all source paint layers visible, `compedit.ts` safely exits an unplaced source, `main.ts` wires the shelf, CSS/manual/UPDATES/project-format/next-phase/tests README updated. Additive schema-3 field, no dependency changes. Navigation guards callback reentry when the Animate shortcut leaves source editing.

Verification: **49 files / 385 tests passed**, strict TypeScript/production build passed, `git diff --check` passed. **Eight real-browser archive assertions passed** at isolated development origin `5202/tests/assets.html`: actual PNG and ZIP encoding/validated reload, all source layers/links/unplaced artwork, parked-source re-export, Residency restoration and edited composite pixels. Desktop Brave production preview `5201`: created a two-layer Sky source, painted both, placed in Animate, reopened/edited source, returned with Done and Animate shortcut; edits persisted through autosave/reload. Added a second linked placement; Undo/Redo changed shelf counts correctly. Artwork held on shot frame 2, Done restored 2/2, all four control groups hid and recovered with Reset. Browser viewport override did not change the actual viewport in this pass, so **new asset UI at phone width is unverified**, as are physical iPad/Pencil input. The earlier layout-only narrow inspection below remains historical evidence.

**Immediate next task:** test this asset flow on iPad, then improve asset placement and Clips presentation (visible source/instance selection and timing) using existing comp data. The free-arrangement rail, advanced docking, cross-project sharing and Auto Paint remain later work. Do not rebuild the mode shell, renderer or first linked-asset loop. All current work remains uncommitted; no push or deployment.

### Earlier workspace layout step

Draw/Animate workspace layouts, uncommitted. This supersedes the five-screen status below. Current screens are Story, Draw, Animate, Timing, Motion and Share. Draw defaults to a still Canvas with optional Flipbook; Animate has simplified drawing tools (More tools for the rest) and independent Flipbook/Clips views. Tools, Options, Brush controls and Editor collapse with recoverable handles; Fit canvas and Reset layout stay accessible. Clips currently reuses the exposure timeline, not a new free-arrangement rail.

Changed in this step: `core/workspace.ts` (+ three preference tests), `ui/paintingworkspace.ts`, `app.ts`, `main.ts`, `ui/bubbles.ts`, `ui/flipmode.ts`, `ui/sheet.ts`, `index.html`, CSS, manual and UPDATES. No schema/dependency changes. Earlier rendering changes remain in the working tree.

Verification: **48 files / 378 tests passed**, strict TypeScript/production build passed. Desktop Brave at isolated origin `5200`: created/drew in Draw, switched to Animate with artwork intact, added a frame, toggled Flipbook/Clips with shared two-frame length, verified Draw default Canvas independently, drew in Draw and undid in Animate, restored Animate/Clips after autosave/reload, hid all four control groups and recovered them with Reset, opened More tools. Narrow layout inspected at about 354×767 CSS pixels; footer scrolls horizontally, handles remain accessible. iPad/Pencil/physical gestures remain unverified. The 31 pixel checks mentioned below were run during the earlier rendering step, not rerun for this UI step.

The asset workflow that followed this layout step is recorded above. The earlier next-task sections below describe planning history and must be read in light of the completed steps.

### Earlier rendering baseline

Latest implementation: **Draw rendering consistency**, uncommitted on local `main` at `f4dc28f`. **47 test files / 375 tests passed**, **31 real-browser pixel checks passed**, strict TypeScript and production build passed. The [2026-10-22 review](docs/REVIEW-2026-10-22.md) describes the pre-fix state; its rendering defects are addressed by this working-tree change. The older sections below are historical; their feature gaps, version/schema wording and UI descriptions may be superseded. Verify source and Git diff before acting on them.

### What exists and what is planned

- Current screens: **Story, Draw (with flipbook), Timing, Motion, Share**. Interface levels: **Focus, Simple, Full**.
- Clipping masks, alpha lock, paint stacks, layer masks, effect stacks, GIF/PSD/OpenRaster import, brush collections, Reference, notes and newer Share formats are implemented. The old statement that clipping/effects are unbuilt is obsolete.
- File schema is **3** (`src/io/schema.ts`); IndexedDB version is **2**. There are more optional layer fields than the old `cel`/`w` summary describes.
- A separate **Animate** workspace, dockable **Advanced** interface and canvas-based rail remain proposals in [next-phase.md](docs/next-phase.md). That document is planning context, not an instruction to implement everything.

### Completed rendering step (2026-10-22, Codex)

**Draw now uses the shared layer compositor.** `src/app.ts` supplies resident live raster/vector/predicted sources to `drawEditingLayer` in `src/view/composite.ts`. Layer opacity/blend and part visibility/opacity apply during drawing; the hidden 25% floor is removed. Raster/vector ink is flattened before plane opacity, and the whole layer is flattened before layer opacity/blend. Clipping-group opacity is applied once. Effects remain off on the active drawing while painting; mask editing keeps its red guide tint. Loading thumbnails retain their placeholder path through the layer compositor.

Changed application files: `src/app.ts`, `src/view/composite.ts`, `src/ui/manualtext.ts` (manual and UPDATES). New repeatable browser checks: `tests/rendering.html`, `tests/README.md`, `src/view/composite.browser.ts`. No schema, timing, dependency or layout changes.

Verification: `npm test` (375), `npm run build`, `git diff --check`; real Canvas 2D fixture (31 checks) in desktop Brave at `http://127.0.0.1:5199/tests/rendering.html`. Fixtures cover zero/partial/full layer and plane opacity, raster/vector overlap, hidden layers/parts, live preview sources, parked thumbnail opacity, masks/live mask replacement, normal/multiply/screen/overlay against export, and clipping. The production app at isolated origin `5198` was checked for zero layer/Line opacity, opacity Undo/Redo, Line opacity persistence after autosave/reload, and a new mouse stroke at 50% layer opacity. An immediate reload before the autosave debounce elapsed did not preserve an earlier test edit; persistence verification allowed autosave to finish. Physical Pencil, iPad memory, and full gesture behavior remain unverified.

### Immediate next task

Follow **Latest direction (2026-10-22)** in `docs/next-phase.md`: Draw is a complete painting/asset workspace with an optional flipbook; Animate also keeps a drawing canvas/tools, simplified, with Flipbook/Clips views. Controls must collapse into recoverable edge trays without clutter or losing the view. The next product slice is Draw → New asset → Add in Animate → Edit in Draw → Return, with local editable assets and no manual export/import round trip. Cleanup and layout changes support that slice. This is updated planning, not an implemented mode split; source still has the current five screens. Auto Paint is noted for later. Preserve internal `line`/`fill` identifiers and existing archives. Do not reimplement the fixed opacity path. The rail rewrite remains future performance work, not a prerequisite to this first asset workflow.

### Collaboration and verification status

- The initial review changed no application source and added `docs/REVIEW-2026-10-22.md`. Coordination added `CLAUDE.md` and updated `AGENTS.md` and this handoff. The subsequent rendering implementation changes are listed above. All remain uncommitted at handoff; do not mistake the initial review's no-source-change statement for the current working tree.
- `docs/next-phase.md` was already modified before the review; preserve that edit. Local Git reported three documentation commits ahead of its recorded `origin/main`. No fetch, commit, push or live deployment check was performed. Recheck Git status because another collaborator may have continued.
- Let one assistant own a given source file/change at a time. Before editing, inspect the latest diff; after completing work, record the actual result here so the next assistant does not repeat or overwrite it. If active work overlaps, agree on ownership before editing the same files.
- Desktop browser checks covered drawing, undo/redo, frame insertion, exposure retiming, shared Motion length, Story captions, reload persistence, Play/Pause, opening Brushes/Reference and GIF generation to Ready. GIF download validation did not finish. See the review for exact scope.
- iPad/Pencil, real-file import coverage, full standalone archive round trips, audio/video outputs and Blender remain verification gaps. Unit tests do not establish these results.
- During rendering verification, **5198** served the production preview and **5199** served the development browser fixture. **5197** was not running. Run the app from this directory and check actual running servers/Vite output rather than assuming a leftover tab is live. Use an isolated origin for tests; do not clear a user's library.

## Historical state (2026-10-17)

`main` at `8f505f5` is pushed (GitHub Pages deploys on push). 309 tests and the production build pass. Everything below was checked by script (and screenshots) in desktop Chromium only: **none of it has been tried on an iPad / Apple Pencil yet**, which is the next real test.

Built 2026-10-16 (Claude, one long session), newest last:

- **Audio scrub** (`audio.ts` `audition`): optional, off by default, Audio lane / sound card checkbox.
- **Selection transform** (`core/selxform.ts`, `App.beginTransform/applyTransform`): Fill > Select area, then Transform; drag to move, corner handles scale, knob rotates (15° snap), flips; Line + Fill pixels and whole vector strokes inside; one undo step that also restores the selection. Lasso has marching ants.
- **Tracks sheet** (`ui/sheet.ts`, Draw and Time): one handle bar (Play, time, + Audio) above the timeline; tap steps closed / half / full, drag resizes, swipe down closes; sounds are rows under the layers (`AudioTracks.railRows`) with a floating settings card. Board and Motion keep the old splitter and Audio lane.
- **Bubbles** (`ui/bubbles.ts`): mode bubbles (Flip, Draw, Animate = Time, Move = Motion, Story = Board), tool bubbles for the mode, a one-row context bar per tool, and a level button (clean / simple / full; simple is the default, full = the classic layout). Simple hides the top bar and focus bar; the timeline row keeps essentials as icons with More (`data-extra` in `ui/strip.ts`).
- **Flip** (`ui/flipmode.ts`): beginner mode; drawing bubbles row, + for a fresh page (`App.flipToBlank`, also the Flipbook button), Play, Fit; nudge to the timeline after six drawings.
- **Linked art layers** (`core/cellink.ts`, layer field `cel`): drawings layers in one cel group keep the same cels and timing; `editTimeline` syncs them in one undo step. Layers bubble: chips in Flip, **layer cards** in Draw (`ui/layercards.ts`, Procreate style: thumbnails, tap / tap again for options, hold-drag to reorder).
- **Vector point editing** (`core/vecedit.ts`, `App.enterPointEdit`): anchors found once (`anchorsFor` cache), drag with smooth falloff or straight spans, hold a point to toggle straight / curved, Bezier handles on curved points, snap onto other lines' points and join ends (toggles), width for whole line / this point / chosen sections (per-point `w` multiplier on `StrokePoint`, saved optionally). Points appear after a QuickShape hold (toggle).
- **Transparent GIF** option (`io/gif.ts` `GIF_CLEAR`, disposal 2).
- **Fixes:** Flip Pause (no per-frame rebuild), Safari page zoom from scroll containers (`touch-action`, viewport snap-back in `main.ts`), notices deduplicated.

Built 2026-10-17 (later): media as tracks (`ui/media.ts`, `App.importPicture/importMovie`: pictures = still object layers, movies = one drawing per frame up to 12 s plus their sound; all from frame 1), sound clips drag / trim on the timeline and in Motion (`AudioTracks.clipBlock`), Adjust (`core/adjust.ts`: HSB and Gaussian blur on the current drawing, `App.beginAdjust/applyAdjust`), Symmetry (`StrokeRecord.sym`, mirrored dabs in `brush/raster.ts`, vector copies), Reference layer (layer field `reference`), `App.refit()` (layout changes keep a zoomed / turned view), one-row timeline bar on the simple screen (`Strip.navRow` moved into the tracks bar). Brush import (`io/brushimport.ts`: bplist / XML plist + NSKeyedArchiver, Procreate `.brushset`/`.brush` Shape.png + name/size/opacity/spacing/jitter/pressure, ABR v1/v2/v6+ sampled tips; Brushes > Import): tested only on generated fixtures, no real Procreate or Photoshop files yet.

Built 2026-10-17 (latest): Procreate selection modes and actions (`App.takeSelection/autoSelect/copyArt/pasteArt/...`, exact masks via `spatial.exact` and `transformMask`), freeform transform (`XParams.sx/sy`), named palettes + harmony (`core/color.ts harmony/paletteFromPixels`), drawing guides + assisted drawing (`core/guides.ts`), layer masks (layer field `mask`, drawn in `composite.ts drawLayer`, edited via `App.editingMask`), layer groups in the cards (`LayerCards.children/groupWithBelow`, outer-shot context in Draw), onion Keys-only fallback (`App.onionNeighbors`). Layer fields added: `reference`, `mask` (both optional).

File format: two optional fields only (`cel` on layers, `w` on points); older files open unchanged, older builds ignore them.

Linked layers stay in step for every edit: Draw / Time / Flip via `App.editTimeline`, everything else (Motion trims and moves, ripples) via `syncCelGroups` in `CompEditor.push`. A duplicated cel copies its partners' drawings (`Project.copiedFrom`, session only; a parked partner falls back to blank). Known gaps: GIF transparency is 1-bit; nothing verified on iPad. Still not built: clipping masks, effect stacks, warp, free-arrangement timeline, general media/video import, Rust desktop.

**Design studies (evidence and proposals, not features):** [layers/masks/UI](docs/LAYERS-MASKS-AND-UI-STUDY.md), [selection/transform](docs/SELECTION-TRANSFORM-MANUAL-STUDY.md), [manuals vs source](docs/MANUAL-TO-SOURCE-COMPARISON.md), [timeline/media/UI direction](docs/TIMELINE-AND-MEDIA-DIRECTION.md), [art effects and clipping](docs/ART-EFFECTS-DIRECTION.md), [brush import](docs/NATIVE-BRUSH-IMPORT-DIRECTION.md). The free-timeline request needs concrete changes confirmed before structural work; do not treat the standalone timeline mockup as a spec.

Prepared 2026-10-14; updated 2026-10-17 so another assistant can continue without a previous chat.

## Start here

- Workspace: `E:\2026\Dev\Apps\2Dope`.
- **Application and Git root:** `E:\2026\Dev\Apps\2Dope\beta`.
- `reference/` beside it contains separate Craft reference projects, not the app or its dependencies.
- Read `AGENTS.md`, then `ARCHITECTURE.md`, then relevant source. Preserve user/Claude edits visible in `git status`.
- Current source, tests, and manual are stronger evidence of present behavior than an early milestone paragraph or a proposed feature study.

## Checked baseline

The repository began this review clean on `main`, at `92bb08fcd42dc30dd5727cdcdf6593fab995b4f0` (2026-10-14): Motion end trims keep the board and animation in step. Upstream status was local Git information; the remote/deployed site was not checked.

Recent preceding work includes two-way Board/Draw timing, adding/retiming/deleting the last panel, deleting the first panel without shifting animation before frame 0, repaired older files, Time's frame bar, Draw's Split/touch selection, and finishing interrupted pointer strokes.

Environment: Node `v24.20.0`, npm `11.19.0`, existing installed dependencies and lockfile. CI uses Node 22. No dependency upgrades or clean reinstall were performed.

| Check on 2026-10-14 | Result |
|---|---|
| `npm test` | 21 files, **212 tests passed**. |
| Initial `npm run build` | Failed on an unescaped apostrophe in `src/ui/manualtext.ts`, in the update note about a layer's end. |
| Build after the one-line fix | **Passed:** strict TypeScript check and Vite production output. |
| Production browser smoke check | **Passed** in desktop Chrome on a separate loopback origin; scope below. |

The sole application-code change in this review escapes that apostrophe. The displayed sentence is unchanged. Other changes document the current implementation and maintenance workflow. This baseline describes the local review; consult Git history and GitHub Actions for subsequent commits and deployment status.

## Run and check

Run from the application root in PowerShell:

```powershell
Set-Location 'E:\2026\Dev\Apps\2Dope\beta'
git status --short --branch
npm test
npm run build
```

For a clean install use `npm ci`. For editing use `npm run dev`: port **5180** by default, but read Vite's printed URL if busy. Claude's `.claude/launch.json` explicitly uses **5181** with `--strictPort`.

To check a production build on a separate origin:

```powershell
npm exec -- vite preview --host 127.0.0.1 --port 5182 --strictPort
```

`npm run dev:lan` enables the HTTPS LAN configuration for device testing; it is a development server. `dist/` and `node_modules/` are ignored/generated. Edit source and rebuild. Pushing `main` triggers `.github/workflows/pages.yml`: Node 22, `npm ci`, tests, build, GitHub Pages deployment.

Browser libraries are tied to their origin. `localhost`, `127.0.0.1`, different ports, and the deployed site have separate libraries. Keep the same origin to see an existing library, or transfer an exported `.2dope` file. Avoid clearing site storage while investigating a missing project.

## Current product

A browser-based 2D drawing, animation, and storyboard app intended for pen/touch as well as desktop:

- **Board:** guide-layer panels, captions, duration, animatic playback, Animate this shot, PDF or PNG/CSV export.
- **Draw:** raster/vector pen, eraser, fill, Line/Fill planes, brush dynamics/smoothing, QuickShape, layers, flipbook, onion skin, Quick Animate.
- **Time:** X-sheet, holds, drawing selection/order/roles/notes, frame bar, shared time formats and ripple timing.
- **Motion:** layers, transforms, keyframes/easing, parenting/nulls/camera, precomps, pins/overrides and playback modes.
- **Projects:** local IndexedDB library, folders, autosave, versions, standalone `.2dope` files, Lite/device limits and parked drawings.
- **Output/help:** PNG frames and sequence passes, storyboard PDF/images/CSV, Blender package/importer, searchable student manual and update notes.

No application backend is present. Raster planes are saved as pixels; vector strokes retain point data. Do not assume raster stroke replay/editing survives a file round trip.

## Where to make a change

| Request | Start with | Related checks |
|---|---|---|
| Pen feel, smoothing, QuickShape, interrupted strokes | `src/app.ts`, `src/brush/`, `src/core/brush.ts`, `src/core/quickshape.ts` | Core/ink/stabilize/QuickShape tests; real pen and cancellation gestures. |
| Fill/eraser, Line/Fill | `src/fill/fill.ts`, `src/app.ts`, `src/core/vectorcut.ts`, `src/view/composite.ts` | Fill tests; canvas output, undo, saved images. |
| Exposure, Board sync, insert/delete/hold/ripple | `src/core/timeline.ts`, `src/core/ripple.ts`, `src/app.ts`, `src/compedit.ts` | Timeline/ripple/editor tests; the same edit across workspaces and undo/redo. |
| Board cards/captions/export | `src/ui/board.ts`, `src/ui/boardexport.ts`, `src/io/storyboard*.ts`, `src/io/pdf.ts` | Storyboard tests; actual exported PDF/images/CSV. |
| Layers, keys, camera, precomps | `src/compedit.ts`, `src/core/comp.ts`, `src/core/anim.ts`, `src/ui/motion.ts` | Editor/comp/anim tests; composed playback/export. |
| Save/open, versions, gallery, file format | `src/ui/files.ts`, `src/ui/gallery.ts`, `src/io/{schema,projectio,persist,autosave,zip}.ts` | IO/autosave tests; browser reload and standalone file round trip. |
| Memory/older devices | `src/core/residency.ts`, `src/core/device.ts`, `src/view/` | Residency/device tests; target-device stress testing. |
| Blender | `src/io/blender.ts`, `src/io/blenderpack.ts`, `blender/2dope_import.py` | Planning tests; import/render in intended Blender version. |
| Layout/controls/manual | `index.html`, `src/main.ts`, `src/style.css`, relevant `src/ui/` | Build and desktop/touch-width flows; update the manual when behavior changes. |
| Draw/Time timeline rails | `src/ui/rails.ts`, `src/ui/strip.ts` | Rows follow comp order and the strip's cell width; the editable row keeps the strip's own pointer logic. |
| Audio | `src/core/audio.ts`, `src/audio.ts`, `src/io/sound*.ts`, `src/ui/audiotracks.ts`, `src/io/exportvideo.ts` | Audio tests; import, playback sync, save/reload, video export with sound. |

## Invariants

1. One document/clock across workspaces. Layer keys/exposures use layer time; start/in/out use comp time. Reuse timing/content-frame functions.
2. One undo step per gesture. Preview, cancel, undo, and redo must preserve document state and autosave/render notifications.
3. Parked drawings have no live pixels. Use residency for canvas access, declare pixel-dependent command drawings, and preserve assets needed by history.
4. Fill stays under ink. Guide boards stay out of final export unless included. Check both plain-flipbook and compositor export paths when relevant.
5. File schema 2 and IndexedDB version 2 are separate. Breaking file changes need migration; standalone archives need every referenced asset's bytes.
6. Brush randomness stays seeded, predicted points are never committed, and interrupted pointers must finish/cancel their stroke so frame changes cannot stay blocked.
7. Device limits, touch workflows, and the student manual are product requirements.

## Browser verification scope

Desktop Chrome, production build at `http://127.0.0.1:5182/`, a new `Codex maintenance check` project at 1280-by-720 and 12 fps:

- First-run New project dialog rendered and created the named project.
- Added a frame (1 -> 2), undid it (2 -> 1), redid it (1 -> 2).
- Board, Time, and Motion controls rendered; Time/Motion showed the same two-frame shot.
- What's new rendered the repaired sentence correctly.
- Reload reopened the named project and both frames from browser storage.
- A mouse stroke drew on the canvas; after autosave and reload, it visibly reopened intact.
- No warning/error console entries were captured during the checks. A screenshot was saved outside the repository in this chat's visualization directory.

This is a smoke check, not full regression coverage. Tests include mock App/canvas/storage components. `docs/test-report-m1.md` and `docs/blender.md` describe historical checks, not new device/Blender verification from this review.

## Open work and evidence gaps

- **Video export** exists (Quick Share MP4/WebM with audio, plus looping GIF). A higher-quality transparent export is still queued in `DECISIONS.md`; confirm formats and devices before building it.
- **Latest timing fixes need repeatable browser regression coverage:** both ends of layers, two-way board/animation synchronization, undo/redo. Pure timeline/ripple tests include first-panel deletion, but there is no checked-in end-to-end browser runner.
- **Real iPad/Apple Pencil checks remain necessary:** pressure/tilt, palm rejection, touch conflicts, playback feel, long-project memory. Desktop/mocked tests do not establish these results.
- **Blender import/render was not rerun.** `docs/blender.md` records earlier checks and simplifications: non-normal blend modes, animated anchors, nested cameras, combined Line/Fill images.
- **PDF Unicode is limited:** the custom PDF writer uses WinAnsi; unsupported characters become `?`. PNG/CSV export preserves text.
- **Version labels:** `package.json` and `APP_VERSION` in `src/io/projectio.ts` both say `0.0.2` (reconciled 2026-10-15). Neither is the schema version.
- **Large coordinating files:** `app.ts`, `compedit.ts`, `ui/motion.ts`. Keep fixes narrow; preserve command, event, timing, and residency boundaries during any later extraction.
- **Historical future-tense documentation remains:** README milestone prose, format examples, the old test report, feature studies. Earlier memory findings were followed by residency work and should not automatically be treated as current defects.

Proposals in `docs/feature-deconstruction/` (audio, shot organization, masks/effects, drawing assists and more) are design studies. They do not establish a new implementation request or current feature support.

## Next-session prompt

> Continue 2Dope in `E:\2026\Dev\Apps\2Dope\beta`. Read AGENTS.md, HANDOFF.md and ARCHITECTURE.md, check git status for concurrent changes, then implement the requested adjustment within the existing architecture. Preserve shared timing, undo/autosave, residency, device limits and file compatibility. Run relevant tests and the production build, verify the affected browser flow, and distinguish new verification from historical reports.
