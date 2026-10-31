# Clip Studio Paint research

2026-10-30 follow-up: [the original 2Dope vector-brush milestone is implemented locally](VECTOR-BRUSH-MILESTONE-2026-10-30.md),
with schema-4 portable tips, editable appearances, restyle previews and tested rendering. Uncommitted,
not deployed. This implementation is separate from the reference research below.

2026-10-30: [Vector drawing, vector layers and custom-brush REA](VECTOR-BRUSH-REA-2026-10-30.md),
with [a proposed 2Dope implementation plan](VECTOR-BRUSH-IMPLEMENTATION-PLAN.md) and
[retained REA evidence](vector-brush-rea-2026-10-30.evidence.json). Research only; it does not
implement or release vector brushes.

## Clip Studio Paint's UI model (SQLite) — verified

2026-10-26 · REA static read of the shipped tool database. Reference only; nothing is copied into
2Dope. This records a finding first made in a separate session and re-verified here with REA's SQLite
inspector, plus what it means for our own command UI.

## The file

`C:\Program Files\CELSYS\CLIP STUDIO 1.5\CLIP STUDIO PAINT\Settings\PAINT\Tool\english\EditImageTool.todb`

| | |
|---|---|
| SHA-256 | `c06ba91bf341f099aa5bda1004d05c99d660dbb45c9acd01a9a8d2ef7a21a77e` |
| Size | 893,952 bytes |
| Engine | SQLite 3.53.4, UTF-16LE text |
| Tables | `Manager` (12 columns), `Node` (24), `Variant` (504), `sqlite_sequence` |
| Indexes / views / triggers | none |

Each language ships its own copy of the database (`chinese_sc` 888,832 bytes, `chinese_tc` 888,832,
`english` 893,952), and the file sits in the install rather than the user profile — it is content,
not user state.

## The model

**`Node` is the command tree.** 24 columns; the important ones:

| Column | Meaning |
|---|---|
| `NodeUuid`, `NodeNextUuid`, `NodeFirstChildUuid`, `NodeSelectedUuid` | sibling and child links, plus the last-selected child |
| `NodeName` | label (`"Zoom In"`, UTF-16) |
| `NodeDefaultIdentifier` | stable command id (200 = Zoom In, 201 = Zoom Out, 31 = Gradient) |
| `NodeShortCutKey` | key code (26 for Zoom In, 0 = none) |
| `NodeHidden`, `NodeHideByGrade` | user-hidden flag and hide-by-edition/tier |
| `NodeVariantID`, `NodeInitVariantID` | parameter row for this node, and its initial defaults |
| `NodeInputOp` / `NodeOutputOp` / `NodeRangeOp` | operation kinds (0 = none) |
| `NodeLock`, `NodeInstalledState`, `NodeInstalledVersion` | lock, install state, version |
| `NodeIcon`, `NodeIconColor`, `NodeCustomIcon` | presentation |
| `NodeMaterialIDExists`, `NodeMaterialContentID`, `NodeMaterialUuid` | bound material |

**`Variant` is a per-node parameter row, not a language table.** 504 columns — a superset of every
tool parameter: brush (`BrushSize`, `BrushFlow`, effectors as BLOBs, spray, ribbon, water colour),
fill (`FillUseCloseGap`, `FillReferMultiLayer`), selection (`SelectCreateType`, `SelectUseSnap`,
`SelectOperationMethod`), text, vector, gradient, 3D snap. Rows are **sparse**: sampled rows 2, 45, 3
and 46 have NULL for the brush, fill, selection and text columns that do not apply to them. So
`VariantID` is a pointer into a wide, mostly-empty record; the columns relevant to a node are decided
by its operation kind.

The tree also holds *variant children* as nodes: samples named `Gradient`, `Foreground to
transparent`, `Blue sky` carry `NodeInputOp`/`NodeOutputOp` = 52 with `NodeVariantID` 195/197/199 —
i.e. presets are child nodes whose variant row holds the parameters.

`Manager` holds one row of state: `Version`, `RootUuid`, `CurrentNodeUuid`, `MaxVariantID`,
`CommonVariantID` (shared defaults), `ObjectNodeUuid`, `SavedCount`, and the pressure graph.

## The pattern

Three separate mechanisms, which is the part worth copying:

1. **Stable command identity** (`NodeDefaultIdentifier`, or a namespaced string for us) — survives
   renames, translations and reordering.
2. **A visibility bit per command** (`NodeHidden`) — toggling is a flag, not a rebuild; a second bit
   (`NodeHideByGrade`) covers tier/capability, and `NodeLock` covers availability.
3. **A per-command parameter record** (`NodeVariantID` → `Variant`) — one command can present
   different controls depending on context, without new command types.

So "the toolbar changes per mode" is not a special menu type: it is the same tree with a different
visible subset, a different variant selection, and persisted user hides.

## What was not established

- How mode gating is computed at runtime (which code reads `NodeInputOp`/`HideByGrade`); the 89 MB Qt
  executable was not decompiled.
- Whether `.spws` workspace presets (`WorkSpace\Android\english\presetAndroid_0..2.spws`) are also
  SQLite or a separate format — not opened.
- `DialMenu` content; the install ships icons only, so radial-menu contents are user/workspace data.

## For 2Dope

Our equivalents today are spread out: `toolsFor(workspace)` returns hard-coded arrays in
`src/ui/bubbles.ts`; the options row is a hand-written `if/else` on `optionsRow(...)`; selection is a
**tool** (`fill` + lasso mode) rather than a command with state; visibility lives in
`studentUI.tools` for tools only; `QUICK_ACTIONS` is a third id list; context menus build items ad
hoc; and variants are implicit in `fillMode`/`selectShape`/`selectOp` flags.

The CSP shape maps cleanly onto one registry with four properties per command — **stable id**,
**contexts**, **hidden bit**, **variant hook** — and one persisted hidden set. That is the plan in
[CLAUDE-COMMAND-REGISTRY-HANDOFF.md](../../CLAUDE-COMMAND-REGISTRY-HANDOFF.md).
