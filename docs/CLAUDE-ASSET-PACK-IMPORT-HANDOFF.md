# Adding the Retro and Stipple art packs to 2Dope

2026-11-11 · implementation brief · Slices 1 and 2 implemented 2026-11-13 (see HANDOFF.md); Slice 3 not started

## Request

The user supplied two purchased packs and asked to "add [them] for 2Dope". They will run Claude
Code themselves; this document is the brief. The packs stay on the user's disk: **do not commit
them, copy them into `public/`, or add them to `tests/fixtures/`** (licensing, and the Retro bundle
is 529 MB). Everything below is runtime import.

- `E:\OneDrive\Desktop\Retro_Bundle.zip`
- `E:\OneDrive\Desktop\Stipple_Master_AI_PS_Brushes.zip`

## What the packs are (REA, 2026-11-10)

| Pack | SHA-256 | Contents |
|---|---|---|
| Retro_Bundle.zip | `4cca883d3e1df1dae5131d2974ca46cb79fb879945f53da265a462760fd5d9fa` | 808 entries, 0 integrity contradictions: 386 `.eps`, 405 `.png` (all RGBA; 388–2992 × 138–3508 px; 75.8 MB total, 192 KB average), 10 `.jpg`, 4 `.ai`, 3 nested `.zip`. Twelve themed folders (Science Retro Set, Retro Car, Retro Baseball Set, …). |
| Stipple_Master_AI_PS_Brushes.zip | `864ac92175762bf3a802d3a48f8889fe82a57b6c60bc63885be54d34d6deae67` | 18 entries: one `.abr` (545 KB), one `.ai` (2.8 MB), 3 PDFs, 5 JPG examples. |

What 2Dope does with each file today:

| File | Today |
|---|---|
| Stipple `.abr` | **Verified in desktop Chrome on 2026-11-11.** Brushes → Import added Fill 01–06, Falloff 01–06, and Finetune 01–02. All 14 image tips decoded and the collection reopened after reload. |
| Retro `.png` / `.jpg` | **Verified in desktop Chrome on 2026-11-11.** One extracted PNG and one JPG selected together through Import media created two separate object layers. |
| Retro `.eps` (386) | **Fails.** Every one is a DOS EPS binary (`C5 D0 D3 C6` + preview, PostScript section at offset 30/32) wrapping an Illustrator or CorelDRAW document. 2Dope's bounded EPS reader (`io/eps.ts`) reads text only, so it reports "This is not a readable EPS file". Even past the wrapper, the body calls `Adobe_AGM_Utils` / `Adobe_CoolType_Core` (335 files, Illustrator 16.0) or `wCorel17Dict` (51 files, CorelDRAW X7) prolog procedures. |
| Retro/Stipple `.ai` | **Not supported.** These are PDF 1.4 (`%PDF-1.4`) with XMP. A `.ai` the OS types as `application/postscript` is currently treated as EPS and fails as "not a readable EPS file"; otherwise it is "not a picture, movie or sound". |
| Nested `.zip` | Not read; the user can unzip them. |

## Decisions

1. **Retro's usable art is the PNG twins.** Each `.eps` has a `.png` of the same drawing, already
   RGBA. Vector import of these EPS is not in this slice; the diagnostics below are.
2. **No redistribution.** Import from files the user picks; no bundled pack, no committed assets.
3. **Stipple needs no code.** It already imports; confirm it rather than reimplement it.
4. **No PostScript execution, no new dependencies, no `.ai` support** in this slice.
5. **Pack images become canvas-sized assets.** My Assets only allows "Add copy" when the card's
   width×height equals the open project's (`ui/artworklibrary.ts:218`); a 90×157 card could only be
   opened as a project. So each imported image is drawn on a transparent canvas of the **open
   project's size**, centred, at native pixels when it fits and scaled down to fit when it does not
   (never upscaled), and the card records that size. Budget the archive bytes: 405 source PNGs are
   75.8 MB, and full-canvas packages are larger.

## Slice 1 — Import images in batches into My Assets

### User story

Extract `Retro_Bundle.zip` outside 2Dope and keep its themed folders. For immediate use in a shot,
select the extracted PNG or JPG files through **+ Media**. Each image creates an object layer.

For the proposed My Assets workflow, select extracted images from one themed folder at a time and
enter the folder's name as the collection. Repeat in that collection if the folder needs multiple
batches. 2Dope adds one drawing-source card per image without editing the open shot. Progress
shows how many cards have been added and offers Cancel.

### Contract

Entry point: an `Import images…` button in `ui/artworklibrary.ts` next to `Import artwork file`,
with a multi-file PNG, JPG/JPEG, and WebP picker and a collection field. The original 529 MB ZIP
is extracted with the operating system. The app processes the selected image files directly.

Reading:
- Accept up to 50 images and 100 MiB of selected image files per batch. If a batch is over either
  limit, ask for a smaller selection before writing any cards. Skip unsupported, unreadable, or
  oversized images and report the reason. An individual image may be up to 8192 px per side and
  40 megapixels. Stop before writing a card that would take the batch over 200 MiB of stored archives.
- Use each filename without its extension, trimmed to 80 characters. Use the entered collection
  name for every card in the batch. Check existing cards in that collection as well as the current
  batch when adding suffixes such as ` (2)` or ` (3)`.
- One image is decoded, converted and stored at a time; close each bitmap; never hold the whole
  pack decoded.
- Cancel (and closing the dialog) stops before the next image. Cards already stored stay; the
  summary reports "Added N of M". A storage-quota failure stops with "Storage is full after N
  cards".

Each card:
- Project: `new Project(canvasW, canvasH)` (blank), `main = activeComp = comp.id`, `comp.asset =
  true`, comp and layer named after the card, drawing canvas drawn with the bitmap centred at
  native size (scaled down to fit when larger), `d.rev++`.
- Package: `captureArtwork(project, comp.id, async () => null)` → `packArtwork(bundle)` (the blank
  project's canvas pixels are encoded by `captureProject`; nothing is parked).
- Card: `id: newId('art')`, `name`, `collection`, `created`/`updated`, `width`/`height` = canvas,
  `fps` = 12, `frames: 1`, `layers: 1`, `kind: 'drawing'`, `thumb` from the source bitmap (longest
  side 320 px, PNG) — **not** `artworkPreview`, which would render 415 full-canvas packages.
- `store.put({ card, archive })` per card. No `app.history` entry, no autosave, no timeline change;
  the library's own remove/undo is the only undo.

UI: progress + Cancel inside the dialog body (`role="status"`), `aria-busy` while running, and the
existing `error()` path for a refused run. At the end, `reload()` and a notice:
“Added 37 of 38 images to Science Retro Set. Skipped 1 unreadable image.”

### New code

- `src/io/packimport.ts` — plan from selected file metadata, the entered collection, and existing
  card names. Classify supported images and enforce batch limits before opening any file bytes.
- `src/io/artwork.ts` — `artworkFromImage(name, bitmap, canvasW, canvasH): Promise<ArtworkPackage>`
  using the recipe above (import `captureArtwork`/`packArtwork` already there; `Project` from
  `core/project`). If archive capture via a scratch project fights you, build the `ProjectFile`
  directly instead (`drawings[d].line = 'assets/<hash>.png'`, `comps[c].asset = true`, canvas size in
  `file.canvas`) and validate it with `validateProjectFile`; the round-trip test is the contract.
- `src/ui/artworklibrary.ts` — the button, the run loop, progress/Cancel, summary; reuse `save()`
  only if it does not regenerate thumbnails.
- `src/style.css` — progress row only if the dialog needs new layout.

### Tests

- `src/io/packimport.test.ts` (node): collection and duplicate names across batches, skipped
  file types, and size/count refusals.
- New browser fixture `tests/packimport.html` + `src/ui/packimport.browser.ts`, modelled on
  `artworklibrary.browser.ts`: pick 3 generated PNGs and assert 3 cards in the named collection,
  `role="status"` progress, Cancel after the first card, a non-image skipped count, a batch over
  the limit refused before any cards are written, and no `app.history.canUndo`. This
  fixture also covers `artworkFromImage` (DOM canvas): `readArtwork(packArtwork(...))` round-trips,
  the card is one frame/one layer, the drawing's line asset exists, a 90×157 image on a 1920×1080
  canvas is centred at native size with transparent surroundings, and a larger image is fitted.
  Node tests cannot draw, so keep this coverage here.

### Manual check

Once the My Assets feature is implemented, extract the real Retro ZIP outside the repo. Import two
batches into the same named collection on an isolated test origin. Check the card count, preview,
placement, and Undo. A complete import of the 415 PNG/JPG entries in the outer ZIP is a separate
volume test. To repeat the Stipple check, extract the `.abr` and select it through Brushes → Import.

## Slice 2 — EPS wrapper and vendor-specific messages

Today a DOS-EPS binary fails as "not a readable EPS file", and `media.ts` decodes `.eps` with
`File.text()` (UTF-8), which mangles the binary header before `epsToSvg` ever sees it.

- `src/io/eps.ts`: add `epsTextFromBytes(bytes: Uint8Array): string`. If the first four bytes are
  `C5 D0 D3 C6`, read the little-endian PS offset/length at 4/8, bounds-check, decode that range as
  ISO-8859-1; otherwise decode the whole file as ISO-8859-1. Keep the `%!PS-Adobe` + `EPSF` check.
- `epsToSvg`: after the prolog/preview strip, if the text contains `Adobe_AGM_Utils`,
  `Adobe_AGM_Core` or `Adobe_CoolType`, throw: "This EPS was saved by Adobe Illustrator with its own
  PostScript procedures, which 2Dope does not run. Export an SVG (text outlined, effects expanded)
  or use the PNG." If it contains `wCorel`/`CorelDRAW`, the same with Corel's name. Plain EPS keeps
  working.
- `src/io/vectorimport.ts` + `src/ui/media.ts`: take bytes for `.eps` instead of `f.text()`; leave
  SVG on text.
- `src/ui/media.ts`: for `.ai`, notice "Illustrator .ai files are PDFs; export an SVG or a PNG."
  instead of the generic "not a picture, movie or sound".
- Tests: synthetic DOS wrapper around a plain EPS body imports; a wrapper around a body containing
  `Adobe_AGM_Utils` throws the Illustrator message; a truncated header throws. Node-testable via
  `io/eps.test.ts`. The `.ai` notice is checked in the packimport or a small browser fixture; generate
  all fixtures in the test, never from the packs.

## Slice 3 — do not implement

- **Illustrator EPS flat-path import.** A spike could strip the XMP packet (it embeds a base64
  thumbnail), the setup blocks and the AI resource prologs, then accept only standard
  `m/l/c/h/f/S/B` operators on page 1. Sample page bodies still carry 50–70 path ops, but
  transparency, gradients, clipping and masks would be lost silently. Do this only if the user
  explicitly asks for vector Retro art and accepts approximations; it is not covered by the PNG
  twins.
- **CorelDRAW EPS**: the body calls procedures defined in a 100 KB prolog; without execution this
  is not recoverable. Refuse with the Slice 2 message.
- **`.ai` as PDF page**: `io/pdfpages.ts` already rasterises PDFs; importing page 1 as a picture
  would work for the four Retro `.ai` files, but it is raster, not vector. Gate it.

## Checks

- `npm test`, `npm run build` (strict `tsc` + Vite).
- Browser fixture: `npm run dev` on `127.0.0.1:5217`, then `npm run test:browser` (fixtures run in
  real time; do not use Chrome's virtual time budget).
- Manual pack import on the test origin only.
- Update `src/ui/manualtext.ts` and `UPDATES` (My Assets import), and the top of `HANDOFF.md` with
  changed files, actual checks and gaps.

## Guardrails

- Check `git status` and preserve concurrent edits.
- No pack files, no generated pack output, no `.abr` in the repo; no new dependencies.
- No PostScript/eval execution; no `.ai` support claim.
- Never clear an existing project's browser storage for testing.
- Stop after Slice 2 and report; do not commit or push (a push deploys Pages).

## Prompt for Claude Code

```
From the beta/ directory: read AGENTS.md, the current-state top of HANDOFF.md, then
docs/CLAUDE-ASSET-PACK-IMPORT-HANDOFF.md in full. Implement Slice 1 ("Import images…" in My Assets)
and Slice 2 (DOS-EPS wrapper + Illustrator/Corel refusal) only. Do not start Slice 3.

Follow the handoff's contract exactly: bounds, collection/name rules, one image at a time,
canvas-sized cards at native pixels (scaled down to fit), thumbnail from the bitmap, no history
entry, Cancel keeps what was stored. Add the unit tests and the packimport browser fixture it asks
for, and run npm test and npm run build. Check git status first and preserve concurrent work.

Do not commit the purchased packs or copy them into public/ or tests/fixtures; synthesise every
fixture. Update manualtext.ts/UPDATES and HANDOFF.md. Report changed files, actual checks and
remaining gaps; do not commit or push.
```
