# 2Dope additions: release specification

Prepared November 3, 2026. This is a proposed implementation specification, not a claim that the slate has shipped. It does not authorize a general layout rewrite. The earlier SVG/EPS, PNG-alpha and adjustment/group-effects repair request remains separate from this slate.

The slate is too large for one small-team release. Ship reusable finishing controls, editable titles and a reliable hand-in flow. Defer temporal rendering and deformation. The three milestones below are independently useful and should each be releasable.

## Evidence and assumptions

Product facts not qualified below come from the supplied brief. Performance figures below are calculated allocations or proposed acceptance budgets, not measured iPad performance. UX and data structures below are decisions for future work.

Repository-informed assumptions, checked against the requested files on November 3:

- **A1 — existing easing:** `src/core/anim.ts` already defines the twelve named curves; Motion already exposes them in its easing selector. Item 8 is refinement and verification, not a new curve engine.
- **A2 — existing source timing:** `CompLayer` and `DrawingsLayer` already carry playback speed and `timeRemap`; `CompEditor` exposes a Frame property. The brief's assertion that time remapping does not exist is stale. No replacement timing system belongs in this release.
- **A3 — effect inventory:** the local registry has 22 effect types, including Vignette and Retro TV. Avoid a hard-coded “20 effects” promise in product copy.
- **A4 — effect persistence:** `readEffects` currently caps a stack at 16 and drops unknown types/settings. Imported styles need stricter preflight so they cannot silently lose appearance.
- **A5 — local repairs:** this working tree now applies effects to comp instances and corrects partial-opacity adjustment compositing. These changes require their own checks; they are not evidence that the remaining slate is implemented.
- **A6 — minimum file version:** this working tree adds format 5 only for imported path objects. Use `NEXT_SCHEMA` for editable-title metadata rather than reserving a number that another change may consume. Ordinary older projects retain their existing capture version unless they use a feature that needs a newer reader.
- **A7 — help routing:** the manual is lazy loaded through the shell. Pass a section id through that boundary rather than importing the full manual synchronously into each panel.
- **A8 — EffectCraft evidence:** the supplied research folder named `effectcraft-0.19-effects` documents a local 0.6.0 checkout, read only. Treat its parameters as reference-study evidence, not a tested port or a verified 0.19 release.

Source map: `AGENTS.md`, current `HANDOFF.md`, `ARCHITECTURE.md`, `src/core/{effects,comp,keytools,anim}.ts`, `src/ui/{effectspanel,motion,share}.ts`, and the two requested EffectCraft research reports. These assumptions should be rechecked when implementation starts after another session changes the baseline.

## Verdicts

| Item | Verdict | Reason, effort and dependency |
|---|---|---|
| 1. Text/title layer | Re-scope | One editable title backed by a saved raster drawing; no typography engine. **L:** metadata, rasterization, save/edit lifecycle and export parity; depends on the renderer repairs and row metadata contract. |
| 2. Composition motion blur | Cut this release | Subframe rendering and movement detection are substantial renderer work. **L:** defer until a shared temporal budget exists; users lose true shutter blur. |
| 3. Echo/trails | Cut this release | Deterministic random access and history residency are more work than retaining playback frames. **L:** users lose automatic trails; existing blur effects are not equivalents. |
| 4. Camera moves | Re-scope | Push, pull and drift as baked keys only. **M:** range, existing-camera behavior and reversible preview; depends on existing key commands. Defer handheld and whip pan. |
| 5. Hand-in bundle | Re-scope | One ZIP: MP4, PNG, short GIF and optional project, using existing encoders. **L:** cancellation, bounded staging and partial failure; depends on a stable export snapshot. |
| 6. Effect styles | Keep | Named snapshots give reuse without renderer work. **M:** strict validation, device storage and apply/reset semantics; depends on A4 and reliable group/adjustment effects. |
| 7. Symbols UI | Re-scope | Label existing reusable assets clearly and expose their pins; “Detach” means Make independent. **M:** no new symbol model; depends on existing graph-copy/instance commands and item 13. |
| 8. Twelve ease curves | Merge | Existing under A1; refine discoverability and selection feedback with Motion help. **S:** data/UI verification, not another implementation. |
| 9. Small new effects | Re-scope | Keep one Tint/Tritone effect with two/three-colour modes. **M:** one alpha-preserving pixel pass. Defer Roughen variants, Simple Choker, Bevel and Motion Tile. |
| 10. Affinity-derived additions | Merge / Cut | Merge export-preset consistency into item 5. Cut smart snapping, per-effect masks/feather and Bend from this release. Users lose automatic alignment, selective effect regions and bending. **S** for preset consistency; the cut renderer/input work is **L**. |
| 11. Add-effect browser | Keep | Families, visible hints and repeated additions solve discoverability. **S:** data/UI only; depends on the existing effect registry. |
| 12. Touch Effects sheet | Keep | Adapt the same controls to a bottom sheet. **M:** focus, scrolling, keyboard and viewport behavior; depends on item 11. |
| 13. Layer-row consistency | Re-scope | Share presentation metadata and small visual primitives; retain three interaction adapters. **M:** avoids replacing working gesture controllers; depends on item 7's badge vocabulary. |
| 14. Contextual help | Keep | Three header links into the existing manual. **S:** shell routing and focus recovery; no new help system. |
| 15. Motion/tokens accessibility | Keep | Apply semantic tokens and reduced-motion rules to touched surfaces only. **S:** part of every milestone's UI completion, not a theme redesign. |

## Cross-cutting decisions

### One text system, with different title and caption semantics

Use one small text layout/raster helper. Titles are authored objects with one string. Story captions remain timed panel data and retain their present export path; do not turn subtitles into title layers or change their editing UI.

Proposed `DrawingsLayer.title`: `{v:1, text, font:'system-ui', size, weight:400|700, align:'left'|'center'|'right', fill, stroke:null|color, strokeWidth}`. Maximum 280 Unicode code points, four lines, size 8–512 comp pixels, stroke 0–16 px. Editing, not every frame, rasterizes it. A normal still drawing holds the transparent result on Fill; Line remains empty. A normal layer transform/anchor places it. No new layer kind is required.

The saved drawing is the visual authority on reopen, so a different OS font does not silently reflow a shot. Text metadata enables later editing; committing an edit uses the current device's system font and refreshes the snapshot. Explain that before the first cross-device edit. Do not save font URLs or arbitrary font names. Glyph shaping is delegated to the browser, but identical typography across operating systems is not promised.

A title participates in masks, clipping, blends and effects as an ordinary drawing layer. Its visible pixels are Colour, so Ink-only effects are disabled with an explanation until it is converted to paint. Layer effects run once after title rasterization; adjustment layers operate on the composed result. Blender receives the raster plane and transform, with “Title exported as an image” in Check. GIF/APNG/video inherit the same pixels.

A direct paint/erase attempt offers **Convert to paint layer**; confirmation removes title metadata in one undoable edit while retaining pixels. Changing a brush does not convert anything. Use `NEXT_SCHEMA` for editable-title metadata so older readers refuse rather than discard editing intent. Older files open without generated titles. The title's drawing follows residency, undo retention and the device's existing page limits.

### Temporal rendering: one budget manager, separate cache identities

Motion blur and Echo should eventually share a resource budget and base-frame service, not one undifferentiated cache. Their keys differ: blur uses fractional sample time/shutter settings; Echo uses prior integer times. Neither may read the screen canvas, viewport guides or a frame that already contains its own temporal effect. Cache identity must include project/content revision, comp/instance overrides, camera, sample time, dimensions, render quality and export options.

One RGBA surface costs `width × height × 4` bytes: 3.52 MiB at 1280×720, 7.91 MiB at 1920×1080. Five previous 1080p frames plus current and output cost 55.4 MiB before effect scratch, decoded drawings or undo assets. Holding six blur samples plus input and accumulation would cost 63.3 MiB. A future blur implementation must stream samples through reusable surfaces instead of retaining all six.

Recommended future defaults: both off; blur 180° centered shutter, four samples Lite/six normal; Echo two previous frames, 50% decay, normal-over blend. Reserve at most 32 MiB Lite / 64 MiB normal for all temporal surfaces together, counted within the device's total render budget, not in addition to it. These are proposed caps, not established safe iPad limits.

On scrub/jump, Echo renders the required prior base frames explicitly, clamped at the comp start; it never depends on playback order. A future preview may reduce resolution with a visible Fast indicator. Export must estimate residency plus scratch before allocating; if the requested render cannot fit, stop before writing a final file and offer lower resolution or turning the temporal feature off. No silent export-quality downgrade. Both items remain cut until these contracts have a target-device benchmark and a fractional-time residency design.

### Presets: global libraries, independent project snapshots

Effect styles are device-global, versioned records in IndexedDB: `{format:'2dope-effect-style', version:1, id, name, effects}`. Maximum 40 styles, 40-character trimmed names, 16 effects/style. Name collisions offer Replace or Save copy; no silent overwrite. Device storage failure leaves the draft/name intact and reports that it was not saved.

V1 captures effect values at the playhead, switches and seeds, without keyframes. Apply defaults to **Replace**, with **Append** explicit. Validate the whole style first, generate fresh effect ids, then commit one project command. Strict preflight rejects unknown versions/types and incompatible settings before `readEffects`; no partially applied or silently shortened style. Saved projects embed the applied values and an optional `styleOrigin:{v:1,name,effects}` snapshot for Reset; they never depend on the library record. Reset means restore that applied snapshot, not fetch a newly edited global style.

Export/import a small `.2dope-style.json` file, capped at 1 MiB. No images, external URLs or executable data. Newer-style import is refused with a clear version message. Applying a valid newer style to an older project upgrades the saved file only if the resulting feature needs it. Renaming/deleting a library style never changes projects or other instances.

The twelve ease curves are built-in, versioned code data, not editable global styles. Choosing one stores concrete existing Side values on keys. Reopening old motion uses those values, not a new preset definition. Do not introduce curve-library import/export in V1.

### Symbols: instances of the existing asset graph

“Symbol” is a UI name for reusable asset comps; no parallel symbol tree. Source artwork and its internal layer animation are shared. Placement transform, timing and pin overrides belong to the instance. Only explicitly pinned properties are exposed; arbitrary internal layer values are not overrides.

**Edit source** enters the existing source editor. **Swap source** keeps placement transform, parent, name and timing, but clears pin overrides after showing that consequence. Do not guess correspondence from similar pin labels. **Make independent** replaces “Detach”: deep-copy the reachable source graph and required drawings/assets with fresh ids, preserve sharing within the copied graph, and reconnect only this placement. It remains editable; it is not flattened and not ungrouped. This is one undo step including the relink and graph addition.

Nested symbols retain the existing depth/cycle rules. A graph copy maps each visited source once. Undo restores the exact original links and overrides; redo reuses the copied graph rather than creating another copy. Renaming a source updates the displayed source label while preserving custom instance names. Delete-source is disabled while references exist, with an instance count and a way to find them; do not delete instances or silently detach them. Unplaced reusable sources remain available through the existing asset library model.

### Bundle: a coordinator over Share, not another renderer

Use one immutable export snapshot, the existing range resolver, resident-asset loading, video/GIF/PNG writers and project archive capture. Render jobs serially. Freeze settings and source selection for this run; navigation/edits must not mutate its snapshot. Poster is the playhead clamped into the chosen range. MP4 uses the chosen complete range; GIF is explicitly a six-second excerpt starting at range start, or the whole range when shorter. Show both durations before Make.

The download is one ZIP with a small manifest describing names, dimensions, FPS/range and GIF excerpt. Default recipe: video Fit 1080p/High at project FPS; poster Fit 1080p with alpha; GIF Fit 640px/infinite loop; editable project off. If MP4 is unavailable, disable this MP4 hand-in recipe and link to ordinary Share formats; do not rename a WebM to MP4. Existing format presets are reused where available, not duplicated.

The result is atomic by default: no success state or automatic download until every required file and the ZIP succeed. On failure identify the failed step, keep completed in-memory outputs only within budget, and offer Retry failed step or an explicit **Save completed files** result marked incomplete. Cancel aborts the active writer and the queue, releases resident drawings and temporary surfaces/URLs, and writes no final bundle.

V1 has no persistent export cache. Cap staged output bytes at 64 MiB Lite / 256 MiB normal, below available runtime budget; use the smaller limit if render residency consumes the allowance. Check growing encoder output against the cap as well as estimated final size. ZIP creation must account for the additional final-archive allocation. If it cannot fit, stop with lower-resolution choices or offer the existing separate Share exports. Browser database quota should not be consumed by outputs. Quota failure when saving a device preset reports the failed preference save but need not discard an otherwise successful export. No Storage API estimate is treated as a promise of RAM availability.

### Rows: shared facts, three interaction adapters

Share a `LayerPresentation` helper for thumbnail identity, display/source name, kind, badges and state text. Reuse small rendering helpers for badge order and accessible labels. Keep Draw swipe/selection/reorder, popover selection and Motion property/keyframe controllers separate. Replacing all three with one component would risk gesture capture, selection, focus, scroll and row virtualization assumptions for little immediate value.

Migration order: add metadata helper with no visual change, use it in one adapter, verify that adapter, then migrate the next. Keep existing `data-*` action hooks stable. Thumbnails are cached by drawing revision/source identity and decoded only while idle; no per-row full-comp render. At phone widths collapse the state line before shrinking action targets.

## Build-ready cards

### 1 — Editable title snapshot

**User moment:** A student needs a readable opening title or credit that can still be edited tomorrow.

**V1 / exclusions:** One system-font string, up to four lines, the paint controls and limits above, ordinary placement transform. No rich text, external fonts, per-character animation, path text, live subtitles or automatic font substitution service.

**UX:** Motion → + Layer → Title opens a detached draft with Text, Size, Regular/Bold, Alignment, Fill and optional Stroke. Defaults: “Title”, 64 px, Bold, centered, dark fill, no stroke. Preview uses a temporary bounded raster. Create commits; Cancel/Escape adds nothing. Layer options → Edit title reopens the draft. Empty/whitespace-only text disables Create. Invalid size/character count is reported beside the field; allocation/raster errors retain the draft. Title names use the first line truncated to the row limit.

**Model / migration:** `DrawingsLayer.title` and a generated still drawing as specified above; source metadata and snapshot captured together. Newer reader gate for editable metadata; no re-rasterization during load.

**Undo / autosave:** Create or Apply edit is one command; preview changes are not document changes. Undo restores both metadata and exact previous drawing; notify autosave on apply/undo/redo. Conversion to paint is a separate deliberate command.

**Cost / compatibility:** Edit-time text measurement and at most two page surfaces (preview/output), charged to residency; coalesce typing to one animation frame. No title-layout work in per-frame playback/export. Never exceed existing Lite dimensions. All image/video formats and Blender receive the saved raster; no editable Blender text promised. On touch use a scrolling sheet above the keyboard with visible Apply/Cancel.

**Acceptance / smallest proof:** Create “A title”, edit it, cancel once, apply once, undo/redo, save/reload on a second viewport. Assert identical stored pixels before/after reload and matching pixels in PNG, one video frame and a Blender image. An Ink-only effect must be visibly unavailable for this Colour-only object. **V2:** font choice, richer typography and text animation only after font portability is solved.

### 4 — Camera move presets

**User moment:** A student wants a clean push or drift without manually placing several camera keys.

**V1 / exclusions:** Push in, Pull out and Drift; transform/zoom keys on one camera over an explicit inclusive range. No handheld, whip, motion blur, camera paths or expression system. The loss is irregular shake and fast whip-pan automation.

**UX:** Motion tools → Camera move. Choose Existing camera or New camera; default current selected camera, otherwise New. Start/End default work range or shot, at least two distinct frames. Push: zoom current→115%; Pull: current→current/1.15; Drift: center→center plus 5% of comp width, direction selectable. Strength 0–30%, ease defaults Smooth. Preview is detached; Apply creates keys. Existing keys inside the affected channels/range require an explicit Replace range toggle; keys outside remain. Cancel restores the view; invalid range disables Apply; locked camera explains why it cannot be targeted.

**Model / undo:** Bake concrete existing props through one command. Preserve other channels and keys outside the range. New-camera creation and its keys share one undo step and autosave notification. No new persistence fields.

**Cost / compatibility:** O(number of generated keys), maximum two endpoints per affected channel; zero per-frame generator cost. Existing interpolation, Blender camera export and GIF/APNG/video see ordinary keys. Lite/touch use the same command and numeric fields.

**Acceptance / proof:** On an existing animated camera, apply a push over frames 5–20; verify endpoints, unaffected outside keys, identical redo values and no mutation after Cancel. A new-camera push must disappear in one Undo. **V2:** deterministic handheld only after range/key-density limits; whip only after blur/overscan behavior is specified.

### 5 + 10 — Hand-in bundle and preset consistency

**User moment:** A student needs the requested submission files without exporting each one separately.

**V1 / exclusions:** One ZIP, required MP4/PNG/GIF plus optional `.2dope`, common snapshot/range, recipe and failure rules above. No cloud upload, grading integration, background export service, new encoder or new general export settings system.

**UX:** Share → Hand-in bundle shows file checklist, dimensions, video range, poster frame, explicitly labeled GIF excerpt and editable-project toggle. Defaults are the coordinator recipe above. Empty shot or unavailable MP4 disables Make with a precise explanation and ordinary Share recovery. Making shows one ordered progress list and one Cancel; completed steps retain their checkmarks. Retry never rerenders successful files unless snapshot/options changed. Back/Escape cancels during generation. Disk-save cancellation leaves Ready available for another Save.

**Model / undo:** A transient `BundlePlan` references an immutable capture and file jobs; device recipe version 1 only. No document undo step or source navigation. Export never changes active timeline, placement, history or autosaved art.

**Cost / compatibility:** Serial encoders and explicit output/ZIP memory accounting; no residency pin leakage after success, failure or cancellation. Old projects work through existing capture. Blender is not a bundle member; ordinary Blender export remains available. Touch follows the same Share flow. GIF duration/dimensions are visible rather than an implicit downgrade.

**Acceptance / proof:** A two-second alpha-containing shot produces four correctly named files when the project toggle is on; decode the poster and one frame from each animation and compare composition/range. Inject failure at GIF and cancellation during video: no complete ZIP, no lost project state, and Retry succeeds. Inject output-cap/quota failures separately. **V2:** streaming ZIP/directories on supported browsers after a common fallback exists.

### 6 — Effect styles

**User moment:** A student wants several shots to share a look without rebuilding the stack.

**V1 / exclusions:** Save, Apply Replace/Append, Reset to applied snapshot, Rename/Delete library entry, JSON import/export. Capture values at playhead; no keyframe templates, live linked styles, cross-device sync or style marketplace.

**UX:** Effects → Styles opens a list with name and effect names/count. Save current stack is disabled when empty. Save asks a name; collision uses Replace/Save copy. Apply shows replace/append and target layer, normalizes flat-composite targets for groups/adjustments, then applies atomically. Reset is disabled without an applied snapshot. Cancel leaves art and library unchanged. Failed library writes retain the dialog; unknown file versions/types produce a precise import error before any write.

**Model / undo:** Device records and project-origin snapshot as above. Save/rename/delete library actions are outside document history and do not autosave art. Apply/Reset is one document command including `styleOrigin`; undo/redo notifies autosave. Deleting a style preserves all applied projects.

**Cost / compatibility:** Metadata only, ≤40×16 effects and 1 MiB import; no rendering until preview/apply. Existing projects embed ordinary effects, so GIF/APNG/video and Blender use their existing effect behavior. Unknown appearance is refused, not dropped. Touch list has 44 px targets and no hover-only action.

**Acceptance / proof:** Save a three-effect style, apply to a second layer, rename/delete library entry, then reload and render the project unchanged. Verify fresh ids, one Undo, Reset restoring the original snapshot, and atomic rejection of an unknown effect. **V2:** optional animated recipes with explicit time anchoring; linked global styles remain excluded.

### 7 — Symbols over assets and pins

**User moment:** A student reuses a character or graphic while changing only the controls intended for each placement.

**V1 / exclusions:** Symbol badge, source label/count, Edit source, Pins, Swap source and Make independent using existing commands. No new layer kind, arbitrary override graph, recursive live style system or flatten-on-detach behavior.

**UX:** Reusable asset-comp rows show Symbol plus source name. Selected instance → Symbol options offers Edit source, exposed pins, Swap source and Make independent. Pins show source/default value and Reset override; no pins shows “Pin a source property to expose it here” with help. A source currently being edited shows affected placement count. Swap previews a source card and warns that pin overrides reset; Cancel restores the selected instance without a history entry. In-use source deletion is disabled with count and navigation.

**Model / undo:** Existing comp references and overrides, stable source ids, existing graph-copy operations; UI badge is derived. Edit source uses normal commands; Swap/Make independent/Reset override are each one command and autosave. Undo must restore graph references as well as values.

**Cost / compatibility:** Resolve labels/counts on structural changes, not every frame; thumbnails reuse caches. No new frame cost. Old asset instances acquire the badge with no migration. Existing nested comp export applies to Blender/GIF/APNG/video; no new Blender symbol format. Touch keeps source/pin controls in a scrolling sheet.

**Acceptance / proof:** Two linked placements share a nested source. Edit changes both; change a pin changes one; Make independent then source-edit changes only the original placement. Undo restores sharing and overrides. Rename source preserves a custom placement name; deletion with live references is refused. **V2:** compatible-pin mapping on Swap and richer symbol catalogs.

### 8 — Existing ease library refinement

**User moment:** A student can choose and recognize a useful ease curve without understanding bezier numbers.

**V1 / exclusions:** Keep the twelve existing names and concrete Side mappings under A1. Show the current selection or Mixed/Custom; expose the existing selector beside Motion key assistants and help. No curve editor, new interpolation, duplicated library or custom-preset storage.

**UX:** Motion key controls → Curve; no selected keys disables application with “Select keys first.” Mixed selection shows Mixed, nonmatching sides show Custom. Apply targets selected segments only; one-side easing retains the other side. Escape closes without mutation. Linear remains an ordinary linear Side, not a visually similar bezier.

**Data / undo / cost:** No new schema or model. Use existing key commands and autosave; one selection application is one undo. O(selected keys), no added render cost. Old motion and all exporters retain stored Side values; phone select uses native accessible interaction.

**Acceptance / proof:** For each of the twelve existing definitions, apply to a known segment, round-trip its stored sides, recognize its name, undo/redo and compare sampled values. Also verify Mixed/Custom and ease-one-side behavior. **V2:** graph UI only under a separately scoped request.

### 9 — Tint/Tritone, one new effect

**User moment:** A student needs a coherent colour treatment across a shot or graphic.

**V1 / exclusions:** One `tonemap` effect: Tint (black/white map) or Tritone (shadow/mid/highlight), Amount 0–100%, three colour controls with midpoint shown only in Tritone. Default Tint, black→white, Amount 100; switching to Tritone defaults midpoint neutral gray. No Roughen variants, Choker, Bevel, Motion Tile, LUT files or colour-management system.

**UX:** Add effect → Colour and style → Tint / Tritone. Inline hint “Map dark and light colours; keep transparency.” Simple shows Amount and mode; Advanced exposes colours. Amount 0 is identity. Normal targets include Ink/Colour/layer; flat groups/adjustments use Composite. Toggle, Cancel preview and error behavior match the existing stack; unsupported imported versions are rejected.

**Data / undo:** New stable effect id plus versioned parameter definitions; existing stack/key schema, keyframed Amount only in V1. Introduce a newer-reader gate for projects using the new type because an older `readEffects` would otherwise drop it (A4). Reuse one undo step per slider gesture and autosave notification.

**Cost / compatibility:** One O(painted pixels) luminance/map pass; preserve input alpha exactly and interpolate RGB in a documented byte-sRGB approximation. Proposed cost target ≤10 ms at 720p desktop for this single pass, measured separately on target iPad before claiming interactive performance. No extra temporal history, no bounds padding. Blender gets the baked appearance; image/video exports match. Lite uses existing Fast preview, never reduced-quality export without an explicit choice.

**Acceptance / proof:** At Amount 0 all RGBA bytes match input. At 100, opaque black/midgray/white map to selected colours within rounding, every alpha byte remains unchanged, and a transparent RGB value cannot create a halo after compositing. One browser pixel fixture plus undo/file-round-trip test. **V2:** Roughen variants only after evidence of distinct useful results; other deferred effects require their own cost case.

### 11 — Add-effect families, hints and repeated additions

**User moment:** A student can choose an effect without a mouse hover and add several without repeatedly reopening Add.

**Current → target:** The brief describes a flat grid with hover-only hints and a tab switch after adding. Target four families—Blur and light; Shape and movement; Texture and retro; Colour and style—with a visible one-line hint per choice, search, and Add remaining open after each addition. Keep stack order and existing controls.

**V1 / UX:** Open Add, search by name/hint, tap an effect, announce “Added [effect] to [layer].” Keep query, Add tab and scroll; restore focus to the same Add button. On this layer count updates immediately. No matches shows recovery text; empty stack still offers Add. At the 16-effect limit (A4), disable Add with a visible explanation instead of permitting an unsavable seventeenth effect. Each tap adds one instance; duplicate types remain allowed deliberately. Escape closes the panel, not the whole app.

**Data / undo / cost:** Family/hint live in registry metadata, not project files. Query/tab are device/session preferences; additions use ordinary one-step commands/autosave. O(effect catalogue) filtering, no thumbnails or render previews. No exporter/schema change; old projects unaffected.

**Responsive / accessibility:** Two columns when each card can retain a readable hint; one below 320 CSS px available panel width. Minimum 44 px targets, visible selected tab, accessible effect name and associated hint, status announcement without focus theft. Arrow keys/Home/End move tabs; Tab leaves the tablist normally. No transition is required. This is consistency work, not a new panel design.

**Acceptance / proof:** Add Blur then Glow without leaving Add, verify order/count, Undo once removes only Glow, search survives, keyboard focus remains usable, and item 17 cannot be added. Repeat at 375 px and with reduced motion. **V2:** favorites only after styles usage justifies another categorization.

### 12 — Effects bottom sheet on touch widths

**User moment:** A student adjusts effects on a tablet or phone without covering the layer being selected or losing controls offscreen.

**Current → target:** Keep desktop's movable floating card; at viewport widths ≤760 CSS px, or ≤1024 px with a coarse pointer, use one docked bottom sheet with the same content/state. Do not maintain two panel trees or duplicate effects. Switching breakpoint preserves target, tab, query and edits.

**V1 / UX:** Fixed bottom, safe-area padding, max height 68dvh; title/tabs/quality controls stay visible, one interior region scrolls. No swipe-to-dismiss or draggable sheet detents. Close button, Escape and Shift+E retain clear behavior. Desktop drag position is remembered but ignored while docked; restore it when wide again. The keyboard must leave the focused search/number field and Close reachable; viewport changes clamp the sheet rather than moving it behind the keyboard.

**Data / undo / cost:** Presentation-only; no project fields/history/autosave. Device position preference remains existing. No new renderer cost or exporter behavior. Lite uses the same tree.

**Accessibility / classification:** Nonmodal dialog: the canvas remains reachable, so do not trap Tab or set `aria-modal=true`. Close returns focus to its opener when focus is inside; selection elsewhere does not steal focus. Header actions ≥44 px on narrow screens. Dock/undock has no animation by default and none with reduced motion. Responsive consistency, not a general layout redesign.

**Acceptance / proof:** Open at desktop, drag, resize to 375×812, search and edit a value, close/reopen, rotate, resize back. Assert one panel, reachable controls, retained target/query, and no lost draft/history step. Repeat with an onscreen keyboard on a real phone. **V2:** detents only with a demonstrated need.

### 13 — Consistent layer-row anatomy

**User moment:** A student recognizes the same layer and its state when moving between Draw, Layers and Motion.

**Current → target:** The brief establishes three row implementations. Standardize thumbnail → name/source → ordered badges → secondary state → existing visibility/lock/menu controls. Primary badges: Title, Symbol, Adjustment, Mask, Clip; hide irrelevant ones. State text uses the same opacity/blend vocabulary. Keep Motion's disclosure, timing bars and keys; keep Draw's swipe/reorder.

**V1 / UX:** A shared presentation helper derives facts; each adapter binds its own actions. Empty/parked thumbnail shows a stable placeholder, never a zero-size draw error. Long names ellipsize with full accessible name; no rename on accidental property disclosure. Row-level errors do not suppress recovery/menu controls. Cancel drag/rename retains the previous state through existing commands.

**Data / undo / cost:** No new layer tree/schema. Metadata is computed; adapter interactions retain their existing one-step undo/autosave. Cache thumbnail identity, defer decode during playback/input, and create no additional full-page surfaces per row. No exporter change or Lite memory exemption.

**Responsive / accessibility:** ≥44 px action targets; at narrow widths suppress secondary text before names/actions. State must have text/accessible labels and cannot rely on badge colour. Focus order is name, relevant state actions, menu; decorative thumbnails are hidden from AT. Reduced motion removes row-lift transitions without removing drag feedback. This is visual consistency; controller replacement is explicitly out.

**Acceptance / proof:** Feed the same masked, clipped, 50%-opacity multiply symbol/title fixtures to all three presentation adapters and compare names/badges/state labels. Run each existing selection/reorder/rename fixture after migrating that adapter. No duplicate document edit from nested buttons. **V2:** a unified controller only if interactions later converge.

### 14 — Contextual manual links

**User moment:** A student can learn the control in front of them without searching the full manual.

**Current → target:** The brief's headers have no contextual links. Add one `?` action in Effects, Motion and Share. Route through the shell to stable section ids (`effects`, `motion`, `export`), adding a focused Effects section if needed. Never ship a link to a nonexistent anchor.

**V1 / UX:** Click opens the requested section and focuses its heading; close help returns to the invoking button if still present. Loading/error state is announced; failure keeps the underlying panel usable and offers Retry. Opening help during a live gesture first finishes/cancels via the existing editor policy; it must not commit a partial slider preview accidentally.

**Data / undo / cost:** Optional section parameter through the existing lazy-load boundary (A7), no project data/history/autosave. Lazy load is paid on first use only; no per-frame work. Works identically for older projects and all export formats. Touch help actions ≥44 px; label “Effects help,” not just “question mark.” Standard focus outline, no animation. Consistency, not a new help platform.

**Acceptance / proof:** Activate each header link by keyboard, verify the intended heading and focus, close and verify return focus. Simulate manual import failure and ensure the panel still operates. **V2:** per-parameter deep links after stable manual anchors exist.

### 15 — Semantic tokens and reduced motion on new UI

**User moment:** A student with motion sensitivity or a different display can use the additions comfortably.

**Current → target:** The brief only guarantees reduced-motion coverage for toolbar wiggle. All UI introduced/touched by these cards uses existing semantic panel/text/muted/border/accent/danger tokens; add a token only when a missing semantic role is demonstrated. Do not retheme existing screens.

**V1 / UX:** New panels, style lists, row feedback and help links have visible focus/selection/error states. Reduced-motion removes sheet/card translation, row-lift transitions, animated status and smooth scrolling; state changes remain immediate and clear. A static selected border/text remains. This preference never disables project animation, animated previews requested by Play, exported motion or authored effects.

**Data / undo / cost:** CSS/media preference and labels only, zero document fields/history/autosave. No render/export change or Lite overhead. No new app-level preference unless the system query proves insufficient.

**Responsive / accessibility:** Check 375 px phone, 768 px tablet, desktop, 200% browser zoom, keyboard and coarse pointer. Use text or icons with names alongside colour cues. New normal text targets 4.5:1 contrast, large text/UI boundaries 3:1; measure actual tokens, do not claim conformance from token names alone. This is scoped consistency, not a theme or layout redesign.

**Acceptance / proof:** Emulate reduced motion; every new UI transition/animation is none or zero, keyboard focus remains visible, and one exported animated sample is unchanged. Run measured token contrast and manual phone keyboard checks. **V2:** broader accessibility remediation belongs in a separately scoped pass.

## Three demoable milestones

### Milestone 1 — Find, reuse and control a look

Dependency order: close adjustment/group-rendering regressions → 11 grouped Add/hints/repeated add → 12 touch sheet → 14 help and 15 tokens/focus → 6 device styles → 8 existing curve discoverability → 4 three baked camera moves. Keep existing renderer algorithms unchanged beyond the separately authorized repairs.

Demo: add a stack on a grouped graphic, save/apply its style to another layer, apply a camera push, undo each, then repeat on phone width.

**Acceptance gate:** pixel parity for nested adjustments/groups, strict style round-trip, exact camera keys and one Undo per edit; keyboard and 375 px flow pass without clipped controls. Real touch sign-off remains required before labeling the sheet device-verified.

### Milestone 2 — Editable titles and clear reuse

Dependency order: 13 shared presentation metadata contract → 1 title snapshot/schema/edit lifecycle → 7 Symbol controls → migrate the remaining row adapters one at a time. Carry 14–15 through every touched header/row.

Demo: create a title, mask/effect it, turn its graphic into reusable artwork through existing asset actions, place it twice, change a pin, make one placement independent, save/reopen and undo.

**Acceptance gate:** saved title pixels are stable across reopen, metadata survives archives, two linked/nested instances behave correctly through independent-copy Undo/Redo, and every existing row gesture still passes after its own migration. PNG/APNG/GIF/video and Blender-image appearance must agree on one shared test shot.

### Milestone 3 — Finish and submit

Dependency order: immutable bundle snapshot/budget preflight → 5 hand-in coordinator and 10 preset consistency → 9 Tint/Tritone with newer-reader gate → update inline hints/help → end-to-end failure/cancel checks. The new colour effect is the first item to move out if the bundle misses its memory gate.

Demo: apply a two-colour look to the title/symbol shot; make the four-file hand-in ZIP; force one failed step, retry it, then cancel a second run and confirm the project is unchanged.

**Acceptance gate:** all required files decode with the announced range/size, output staging obeys its cap including ZIP duplication, cancellation releases pins/buffers, and no partial package is labeled complete. Validate the nominated classroom iPad before claiming the bundle fits Lite.

## Five remaining risks and recommended defaults

1. **System-font differences:** use the saved raster as visual authority; cross-device text editing explicitly refreshes it. This allows a build without a font-service decision. Approve broader typography only in V2.
2. **Actual classroom iPad headroom:** nominate the oldest supported classroom iPad for acceptance; until measured, keep temporal effects cut and require explicit bundle budget failure instead of a crash. The hardware model is the only external fact still needed for device sign-off.
3. **Meaning of Detach:** ship the label Make independent, deep-copy the reachable source graph and retain editable content. Do not overload it with Ungroup or Rasterize.
4. **Effect/version drift:** strict import validation and concrete embedded snapshots; new renderer types require a newer-reader gate. Never rely on unknown-type dropping to “support” an older reader.
5. **Release size:** three independently releasable milestones, not one accumulated branch waiting for all fifteen items. Cut Tint/Tritone first if Milestone 3 slips; preserve the reliable hand-in coordinator. No unlisted replacement feature is proposed.

Build the effect-browser/help/touch refinement and named-stack reuse first, then titles and the existing-symbol controls, and finally the bounded hand-in bundle. Defer composition motion blur, Echo, handheld/whip generators, extra edge/bevel/tile effects, smart snapping, per-effect masks and Bend: each adds renderer/input risk or competing surface area before the selected workflows are coherent. If only one week were available, make the single change **a dependable Effects workflow for artwork, adjustment layers and grouped comps, with family hints and repeated additions in one reachable card**.
