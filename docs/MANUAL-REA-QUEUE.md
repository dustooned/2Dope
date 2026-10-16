# Manual-based reconstruction: working queue

**2026-10-16 layers/UI continuation:** [Layers, masks and overall editing experience](LAYERS-MASKS-AND-UI-STUDY.md), five official pages with existing-source comparison. Reuse for hierarchy/part cues, clipping semantics, contextual controls and mini Flipbook. Layout and mask contracts remain proposals; no replacement shell is authorized.

**2026-10-16 continuation:** [Selection/transform study](SELECTION-TRANSFORM-MANUAL-STUDY.md), three official pages, compares main with separate selection/fill commit `5caf0aa`. Reuse these findings before affine transform work. Selection/fill is implemented only on its isolated branch; broad selection/warp parity is not established. No application code changed in this study.

2026-10-15 · preparation only · one agent

**Correction after user feedback:** work from the already-built app. The standalone mockup is unapproved exploration, not a replacement UI or prerequisite for every change. Read the current-state reconciliation in [HANDOFF.md](../HANDOFF.md); its source findings supersede assumptions of missing image import, rails or ripple. No application implementation is authorized by this preparation task.

## Evidence to reuse

| Read this | Use it for | Evidence limit |
|---|---|---|
| [User direction](TIMELINE-AND-MEDIA-DIRECTION.md) | Product priorities: free arrangement, shared timing, media, scrubbing, cleaner UI, later Rust | User requirements, not feature support |
| [Claude's Dreams study](feature-deconstruction/08-dreams-cleanroom-spec.md) | Existing behavior inventory and rule IDs; supersedes summary 07 | Reports a 35-page handbook study; original coverage was not independently repeated here. Its implementation badges/build order are historical. |
| [Timeline specification](TIMELINE-INTERACTION-SPEC.md) | Five-page Dreams 2.0 study and proposed scrub acceptance contract | Older-version reference; timing numbers and ripple scope are our proposals |
| [Dreams + Procreate addendum](DREAMS-PROCREATE-DESIGN-ADDENDUM.md) | Five additional sources, paint target vs selection, grouping/rendering and contextual controls | Documentation evidence, not app/runtime measurements |

Here, manual-based reconstruction means deriving our own behavior contracts from documentation. It does not recover proprietary source, file structures or measured touch feel. No REA binary/runtime tooling is needed for this evidence source. Generated 2Dope examples test our choices; they are not evidence of reference-app behavior.

## Ordered update queue

| Order | Bounded deliverable | Existing evidence | Done when |
|---|---|---|---|
| 1 — design | **Targeted review of the existing timeline** | Current source/interface first; study A2/A3, B5–B12, C1/C5; addendum E1/E3/E4/E5 | Identify the smallest changes to existing controls and behavior. Review only the affected interaction before structural changes; do not require a new application shell. |
| 2 — small feature candidate | **Audio scrub on/off** | Study B15; timeline spec section 3 | Shared audition preference works across four views, bounded/cancellable previews honor existing audio timing, playback/export unchanged. Use the existing acceptance contract; do not research it again unless blocked. |
| 3 — design then narrow import slice | **Unified media entry** | Study A3/J11; addendum E1 | Agree first formats and placement; show supported types; import at the playhead without overwriting content. Confirm existing image-import behavior before estimating changes. Video/sequences require separate decoder/memory decisions. |
| 4 — structural slices after review | **Free arrangement, groups and scoped ripple** | Study B5–B11/C5/F12; addendum E1/E3 | Decide layer/span ownership, gaps/source bounds, group vs precomp and key/audio timing. Implement one command at a time with cancellation, one undo step, cross-view sync and save compatibility. |
| 5 — workflow cleanup | **Context UI around the agreed editing loop** | Addendum E2–E5 | Frequent controls stay accessible; selection/mask/ripple states are explicit; detailed controls fold; touch has visible alternatives. Verify drawing space and target-device limits. Rust follows browser readiness, not this queue. |

The order is a proposal. Audio scrub is the smallest independent code slice; it does not replace the broader timeline design goal.

## Current-state corrections

At local `beta/main` commit `7e275ac`, audio import/playback and video export are already recorded in the handoff; do not follow the old study's audio-after-M6 or video-not-built labels. `src/ui/rails.ts` already implements folding for drawing parts and precomp rows; this is not proof of arbitrary clip arrangement or organizational groups. `src/audio.ts` stops playback sound while paused, so scrub audition still needs its own bounded path. Old memory-fix, Blender, keyframe and selection badges are not a fresh defect audit.

The sibling `codex/audio-waveforms` branch was previously checked at `1104e93` and contains audio polish. Recheck both checkouts before any integration or implementation; do not copy files over Claude's work. No remote freshness or deployment claim is made by this note.

## Economical research and implementation handoff

1. Start each slice from the matching row and existing source section. Read narrowly; do not reread all manuals or scan the whole repository.
2. Label findings **documented**, **2Dope choice**, or **unknown**. An earlier summary is secondary evidence. If a consequential claim is unclear, open only its official source page and append a short correction to the relevant spec. Do not infer undocumented sample rates, gesture thresholds or internals.
3. Capture examples as initial state → one action → expected state → undo/cancel. Mark examples as proposed until the user agrees; only approved contracts become tests.
4. For approved coding, use a separate worktree/branch and preserve Claude's checkout. Run relevant tests and the production build; verify affected browser flows. Never clear user storage. No merge/deploy unless separately requested.
5. Stop at the deliverable and update the handoff with files, evidence, actual checks and unresolved items. Avoid a second runtime, speculative Rust scaffolding, binary tools or extra agents during this manual-based work.

Preparation check: no fresh browsing, application-code/dependency edits, tests/build, fetch, merge or deployment. Existing documentation edits preserved; whitespace checked. This index is the starting point for future sessions rather than another manual rewrite.
