# Procreate 5.4.9: what the shipped package shows

2026-10-26 · REA inspection of a local Procreate `.ipa`. Reference only; nothing from the package
is copied into 2Dope. The question this closes: the [Draw audit](../../DRAW-CAPABILITY-AUDIT-2026-10-26.md)
compared 2Dope's selection and transform work against Procreate's *documented* behaviour, and the
package itself had not been read. This pass reads what the shipped metadata and compiled interfaces
confirm, and separates that from what remains unknown.

## What was inspected

| Item | Value |
|---|---|
| Source | `D:\Downloads\Compressed\Procreate_5.4.9_Pro.ipa` |
| IPA SHA-256 | `6539c4a17d44ad4d9facac3f8e131a100e50aaefe91102d6a8b54e863d7a3cd1` |
| ZIP members | 2,537 (2,415 distinct contents; some locale resources repeat byte-identically) |
| Extracted app | 1,057 MB; 12 `.storyboardc` bundles, 113 `.nib` files |
| Bundle | `au.com.savageinteractive.procreate`, 5.4.9 (57074), `MinimumOSVersion` 16.3, iPad only |
| Executable | `Payload/Procreate.app/Procreate`, 19,148,752 bytes, SHA-256 `3c10dce0…c5130d` |
| Info.plist | 23,882 bytes, SHA-256 `f2991e3a…812533` |

`D:\Downloads\Compressed` also holds `Procreate.ipa` and a Procreate Dreams package. Neither was
opened; the explicitly versioned `_Pro` archive was.

## Identity and packaging

Thin little-endian ARM64 Mach-O, 90 load commands, `__text` at `0x100004000` (12,184,848 bytes),
chained fixups in pointer format 6 with 16 KiB pages on the data segments.

Three observations say the file is a repack rather than an untouched store download:

- `LC_ENCRYPTION_INFO_64` reports `cryptid 0` — the text is not encrypted here, while a store copy
  normally carries `cryptid 1`.
- There is no `embedded.mobileprovision`.
- `_CodeSignature/CodeResources` is present, but no signing identity was checked: this Windows host
  has no `codesign`, so authenticity and any difference from a store build remain unverified. The
  `_Pro` suffix is not explained by anything in the package.

## Is there an in-app purchase? No

A case-sensitive scan of all 19,148,752 executable bytes finds `StoreKit` 0, `SKPayment` 0,
`SKProduct` 0, `inAppPurchase` 0, `purchase` 0. The 63 `subscribe` hits are Combine publisher and
`AppleSyncedStorage` (iCloud) symbols; the `restore` hits are "restore the default brush library"
and gallery-restore actions. Procreate is a one-time paid app, and this build carries no IAP code of
its own. That is a bounded negative on this executable, not a store-account check.

## How far the code was read

REA's native provider on Windows admits x86, x86-64, ARMNT and ARM64 **PE** images, not iOS Mach-O.
No method bodies, pseudocode or decompilation were produced, and no app code was executed. What
follows is shipped metadata: load commands, the Objective-C class/method tables, and compiled
Interface Builder archives.

The class table has 1,732 Objective-C classes, all named (`0` unresolved). Eight classes carry the
selection and transform vocabulary; the extract below keeps the selectors that describe behaviour,
and drops layout/plumbing.

## Selection

| Class | Selected selectors |
|---|---|
| `DocumentSelectionController` (104 methods) | `threshold`, `setThreshold:`, `updateWandThresholdWithGesture:`, `thresholding`, `canFeather`, `featherAmount`, `featherBegin`, `featherUpdated:`, `featherEnded:`, `commitFeather`, `saveMask:`, `loadMask:`, `loadMaskThumbnail:`, `removeMask:`, `savedMasks`, `swapToMask:`, `invertMask`, `clearMask`, `maskAlphaDidChange`, `updatePaintables`, `paintable`, `registerUndoState:`, `compressUndos`, `discardableUndos`, `renderMaskGeometryChords:operation:`, `wandBegan:point:`, `wandMoved:point:`, `wandEnded`, `wandCancel`, `finishAndCommitWand:`, `paintBeganWithGesture:`, `paintMoved:`, `paintEnded:`, `snapping`, `snappingThreshold` |
| `DocumentSelectionViewController` | `paint:`, `gesturePaint`, `wandOrigin` |
| `ValkyrieSelectionMode` | `renderChords:operation:maskOperation:`, `adjustFeatherAmount:`, `commitFeather`, `saveMask:`, `wandAtPoint:threshold:cleared:`, `wandEndedAndCommit:`, `terminateAndCommit:`, `accumulatePlots:intoCommitted:predicted:`, `puckPaintable` |
| `ValkyrieSelectionModeRenderer` | `commitOnCommands:tickResult:`, `wandAtPoint:threshold:cleared:commands:`, `invalidateFeather`, `featherAmount`, `setFeatherAmount:`, `validateFeatherOnCommands:`, `commitFeatherCommands:`, `renderChords:operation:maskOperation:modified:textureToScreen:commands:` |
| `ValkyrieSelectionModePaintableMask` | `paintToEncoder:state:` |

Read as a design (this is inference from selector names and structure, not from bodies):

- **Feather is continuous but commits once.** Begin/update/end are separate from `commitFeather`,
  and the renderer validates and commits feather in its own command batch on each tick
  (`commitOnCommands:tickResult:`). That is a live preview followed by one committed edit, not a
  mask rewrite per drag sample.
- **Threshold is live during the wand gesture** (`updateWandThresholdWithGesture:`,
  `wandAtPoint:threshold:cleared:`), so the threshold can change while a region is being chosen.
  Whether it re-runs the flood between samples is unknown.
- **Selections are saved artifacts**, not only a session buffer: save/load/remove plus
  `loadMaskThumbnail:` and `savedMasks` imply stored masks with previews and a list UI.
- **Painting targets a mask**: the selection renders into a paintable mask
  (`renderMaskGeometryChords:operation:` → `paintToEncoder:state:`), which is how "paint inside the
  selection" is expressed at this layer.
- **Selection has undo identity**: `registerUndoState:`, `compressUndos` and `discardableUndos`
  show selection changes entering the undo manager, with coalescing and discard.

## Transform

| Class | Selected selectors |
|---|---|
| `DocumentTransformController` (100 methods) | `commitWarp`, `warpShowAdvancedMesh`, `setWarpShowAdvancedMesh:`, `snapping`, `setSnapping:`, `snappingThreshold`, `snappingVelocityThreshold`, `snappingMarqueeBoxSet`, `snappingAngleSetThreshold`, `snappingWillLockGuidanceAtAngle:firstTime:forContext:`, `snappingWillSwitchGuidanceFrom:toAngle:forContext:`, `didAngularSnappingInterfaceSnapToAngle:`, `didAngularSnappingInterfaceFinishWithState:`, `didCartesianSnappingInterfaceSnappedTo:`, `didCartesianSnappingInterfaceFinishWithState:`, `registerUndoForTransformState:`, `controlPointUndoMessageForZDirection:`, `compressUndos` |
| `DocumentTransformBehaviourNumpad` (13) | `initWithAnchor:commitMarqueeRect:initialTransform:commitMarqueeTransform:`, `transformWithScale:rotation:identity:`, `transformWithSize:absoluteAngleDegrees:` |
| `DocumentTransformBehaviourDistortContext` | `initWithPoint:cw:ccw:`, `pointUpdated:`, `affectants`, `affectantsVisuals` |
| `DocumentTransformToolbar`, `DocumentTransformSettingsCardOver` | view-level only |

Two conventions are visible here:

- **Snapping is split into angular and Cartesian guidance**, each with a snapped-angle and
  finish callback, a velocity threshold, and explicit lock/switch transitions. That is the shape of
  a "magnetics" feature where an axis or angle can be acquired, locked, and handed over mid-drag.
- **Typed transforms exist** — the numpad takes scale/rotation/identity and absolute size/angle —
  alongside the on-canvas marquee.

`DocumentTransformSettingsCardOver.nib` decodes to two placeholders and no connections, so the
transform settings card is built in code, not in the archive.

## The feather popover

`SelectionToolbarFeatherPopover.nib`, SHA-256 `076e6bcd…a82a`: 37 objects, 10 connections, both
facets complete; hierarchy is not decoded by this decoder.

- Root view is class `Selection` (`UIClassSwapper` over `UIView`), holding a `UIStackView`.
- Inside: a `UILabel` ("Selection", 17 pt `.SFUI-Regular`) and one slider of class
  `_TtC12ProSliderOld14ProSliderBrush` — a Swift `UISlider` subclass (`ProSliderBrush`) from module
  `ProSliderOld`, initial value 0.5.
- Outlets: `view`, `containerView`, `featherSlider`, `featherSliderHeight`, `sliderBackground`,
  `sliderLeadingConstraint`, `sliderTrailingConstraint`, `titleHeight`, `titleLabel`, `titleView`.
- Accessibility identifiers: `titleView`, `containerView`, `sliderBackground`.

No target-action is wired in the archive, so the value-changed handler is attached in code and is
not established here. The shape — one slider in a small titled popover, with height and inset
constraints exposed as outlets — matches the "Feather" slider in the handbook and the
begin/update/end/commit quartet in the class table.

## What this does and does not establish

- **Observed:** package identity and digests; the absence of encryption, provisioning profile and
  IAP strings; 1,732 named classes and the selectors above; the feather popover's objects, classes
  and outlets.
- **Inferred:** that feather is previewed per tick and committed once; that threshold is live during
  the wand gesture; that snapping acquires and hands over angular/Cartesian guidance; that saved
  selections carry thumbnails. These follow from names, argument lists and structure.
- **Unknown:** every method body; the feather radius and mask precision; whether any selector is
  reachable from a user action; GPU cost; Pencil behaviour; whether this repack matches the store
  build. Procreate's mask precision is *not* evidence about 2Dope's binary masks — that finding in
  the audit stands on 2Dope's own code.

## Reproduce

1. `python docs/research/procreate-5.4.9/inspect_native_metadata.py "D:\Downloads\Compressed\Procreate_5.4.9_Pro.ipa" --output native-metadata.json`
   Standard library only; it reads the ZIP, the Mach-O load commands, the class list and selected
   method lists. It does not decompile or execute anything.
2. REA: `open_binary` the `.ipa` → `extract_artifact` (all members, verified) →
   `open_bundle_resources` the extracted `Procreate.app` → `decode_interface_builder`. The decoder
   caps at 64 documents per run, which skips `SelectionToolbarFeatherPopover.nib`; copy that nib
   into a subset `.app` along with `Info.plist` and decode it there. Both decodes are retained in
   this session's evidence.

## Evidence

| Evidence | Covers |
|---|---|
| `ev_4bde216f7a74ad6f278daf75d748800d6ab1db47266c7ec36e1a914fa4e83197` | IPA inventory (saved in `beta/.rea-work/procreate-5.4.9/archive-evidence.json`) |
| `ev_eaac8fbac8f9ab2faa3d3976c268d6bc129ab1a3929e46238a5d660016e4e1aa` | extraction of all regular members |
| `ev_9471599efb0bbd05e2a5f2690faa9479a1715ab73597891cc689c6c35639fd13` | Interface Builder decode, full bundle (64 documents; 4,792 nodes, 2,164 edges: 731 outlets, 702 target-actions, 153 selectors) |
| `ev_4eba314ed522f60c5e1836ed6c381d51fdf39982640c576dcee46287315ac601` | feather-popover subset decode (37 objects, 10 connections, complete) |
| `native-metadata.json` | class/method extract, digests, limitations (local parser, not REA native Evidence) |

## For 2Dope

The audit's proposed order already points this way; the package adds confidence to four specifics:

- Saved selections are worth building with a thumbnail, because the reference ships one.
- Live threshold belongs in the wand mode itself, not in a settings sheet applied afterwards.
- Feather should preview continuously and commit once, with its own undo step.
- Snapping should distinguish angular from Cartesian guidance and allow lock/hand-over mid-drag.

It does not change the first deliverable: make selection a dependable stencil for raster painting,
then build on it.
