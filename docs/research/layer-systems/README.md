# Layer systems: Procreate, Procreate Dreams and Harmony

2026-10-31 · REA static inspection for the next Draw/Animate iteration. Reference only; nothing is
copied into 2Dope. Companions: [export settings](../export-settings/README.md),
[next-iteration brief](../NEXT-ITERATION-BRIEF.md).

## What was inspected

| Item | Evidence |
|---|---|
| Procreate 5.4.9 IPA (`D:\Downloads\Misc\Compressed\Procreate_5.4.9_Pro.ipa`) | `LayersResources.bundle` extracted into a subset `.app` and decoded by REA Interface Builder: **10 documents, 637 nodes, 415 edges** (`ev_902b3ad00176ab1137b0ea7ffc89e8b1c537401969eb9efac27c4bcfc5923afd`, summary `ev_8956f324e07ff546026af0da876a8609765ebd0ddf2b1f8543152ecfdc46e6e`) |
| Procreate Dreams 1.0.11 IPA | ships the **same `LayersResources.bundle` family** (identical cell names, slightly different group cell size); track/onion vocabulary from its `en.lproj/Localizable.strings` |
| Layer cell outlets/actions | `Layers.Cell.Layer.nib` edges (`ev_25d57793d2c5837ea484cb16e985761abd5de871cd7ae0c02606de57cd11f9ac`) |
| Harmony Premium | installed files + `Harmony Premium-pref.xml` (export keys only; layer/art-layer UI not read this pass) |

Method limits, up front: compiled nibs are private object graphs. We recovered **classes, outlets,
target-action selectors, button titles and image resource names**, not method bodies or layout
geometry. `hierarchy_complete` is false for every cell; runtime-built rows may add controls. The
string table is the shipped UI wording, not proof a string is reachable in 5.4.9.

## 1. Procreate's layer cell (`Layers.Cell.Layer.nib`, 60 objects, 38 connections)

The root view is the Swift class `_TtC6Layers15LayersCellLayer` (module `Layers`). Its outlets, in
the order the archive lists them:

| Outlet | Object | What it is |
|---|---|---|
| `layerLabel` | `UILabel` (`.SFUI-Light` 17) | the layer name |
| `information` | `UILabel` (`.SFUI-Light` 12, empty) | secondary line (opacity/blend text) |
| `clipped`, `clippedOther` | `UIView`s | clipping-mask indicators on the cell, two states |
| `cutout` | `UIView` | the cut-out/keep-alpha presentation |
| `backgrounds` | 2 `UIView`s | normal and alpha-lock backgrounds |
| `lock`, `lockIcon` | `UIButton` + `UIImageView` | lock toggle and its `Lock-Layer` icon |
| `hoverableButtons` | 2 `UIButton`s | hover/tap targets (visibility and blend) |
| `blendMenuTarget` | `UIButton` | opens the blend menu |
| `menu` | `UIView` | the sliding action tray |
| `actions` | `UIButton` | the swipe affordance |
| `duplicate`, `clear`, `delete` | `UIButton`s | swipe actions |
| `activity` | `UIActivityIndicatorView` | thumbnail/loading state |
| `depth` | `UIView` | stack-depth shading |

Image resources named in the cell: `Layer-Background-Normal`, `Layer-Background-Alpha-Lock`,
`Layer-ON`, `Layer-OFF`, `Lock-Layer`, `Icon-Clip`.

Swipe actions, from button titles: **Select Contents**, **Duplicate**, **Clear**, **Delete**.
Accessibility identifiers: `layers-cell-layer`, `layers-cell-layer.sliding`,
`layers-cell-layer.background`. A long-press recogniser is archived on the cell (drag/reorder).

Read as a design (inference): the row carries *state* inline — visibility, lock, alpha lock,
clipping, depth — while *destructive and selection* actions live behind a horizontal slide. The
secondary label is where opacity/blend text goes; the blend button opens a menu rather than a slider.

## 2. Procreate's layer vocabulary (shipped strings)

Confirmed actions, which is the checklist a "Procreate-like" panel needs:

- **Layer group**: new, duplicate, delete, collapse, expand, flatten, lock, unlock, move, rename,
  select, show, hide. Strings also cover "delete layers & Layer Groups", "duplicate layers & Layer
  Groups", "select layers & Layer Groups", "move layers & Layer Groups".
- **Layer**: Duplicate Layer / Layers, Merge Down, Clipping Mask (toggle, with "enable/disable"), Alpha
  Lock on/off, Reference layer on/off, Select All, Blend Mode, Maximum Layers (device limit message).
- **Combine Down / Combine Mode** exists separately from Merge Down — do not treat them as synonyms.

Not established: whether groups nest arbitrarily, the exact row height, gesture thresholds, and
which of these appear in the 5.4.9 panel vs a secondary menu.

## 3. Procreate Dreams' track side (strings)

Dreams keeps the same layer cell family but the surrounding vocabulary is **tracks**:

| Area | Strings |
|---|---|
| Track lifecycle | add track, delete track, duplicate track, duplicate track contents, group track contents, copy/cut/paste tracks, "convert drawing layers to tracks" |
| Track state | hide track, show track, mute track, unmute track, solo track, "track visibility", "Track options" |
| Clips/layers | Clipping Mask / enable / disable, "Delete shared layer?" |
| Onion | Onion skin, Edit onion skin, onion skin frames, onion skin opacity, **onion skin color backward**, **onion skin color forward**, "Onion skins blend primary frame" |
| Playback | Loop, Ping Pong |
| Limits | "Maximum number of tracks exceeded", "Maximum number of video tracks exceeded", "Cannot paint on a keyframe track", "Cannot open Flipbook on a keyframe track" |

Two design facts matter for 2Dope: Dreams' onion skins have **separate backward/forward colours**
(2Dope has one tint), and tracks have **types** — drawing, video, keyframe — with rules about what
can be painted or opened per type. That is the Harmony-like separation the Animate panel should
express.

## 4. What this means for 2Dope

**Draw (Procreate-like).** The current card panel has the right actions but not the row anatomy.
The REA says the minimum credible row is: thumbnail · name · secondary state text · visibility ·
lock · alpha lock · clipping indicator · depth, with Duplicate/Clear/Delete behind a slide and
blend behind a popover. Groups are the one genuinely new model piece (Procreate's group actions are
a complete set: create, nest, flatten, lock, move, rename, show/hide, select).

**Animate (Dreams + Harmony).** The panel should read as tracks first, with each drawing track
expanding into its **art layers (Ink, Colour)** — the Harmony line/colour split inside a Dreams-style
track list — and with per-row effects and track state (hide/mute/solo). Track *types* (drawing,
video/keyframe) should be named, because Dreams explicitly forbids painting or flipbook on the wrong
kind.

**Harmony DNA to borrow, not copy:** separate line and colour art layers (2Dope already stores Ink
and Colour planes per drawing), x-sheet exposure in Timing (exists), drawing roles
(key/breakdown/inbetween) as metadata rather than only a timing label.

## 5. Unknowns

- No method bodies: ordering rules, drag thresholds, what "depth" changes visually, and whether
  alpha lock is per-cell or per-selection are unknown.
- The layer cell is Swift (`_TtC6Layers…`), so the Objective-C class table does not cover it.
- Harmony's layer/art-layer UI was not read this pass; only its export preference file was.
- Dreams' `LayersResources.bundle` was identified from the archive listing, not decoded separately;
  its cells are the same named documents, but Dreams could ship different classes at runtime.

## 6. Evidence

| Evidence | Covers |
|---|---|
| `ev_902b3ad0…` | Interface Builder decode, 10 documents (637 nodes, 415 edges) |
| `ev_8956f324…` | same decode, summary view |
| `ev_25d57793…` | layer cell outlet/action edges |
| `LayersResources.bundle/*` in both IPAs | cell documents, image names |
| `en.lproj/Localizable.strings` (both) | actions and state wording |
