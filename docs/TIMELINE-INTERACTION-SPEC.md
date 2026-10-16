# Shared timeline interaction specification

Design only · 2026-10-15 · proposed for user review

Follow-up: [Dreams + Procreate design addendum](DREAMS-PROCREATE-DESIGN-ADDENDUM.md) adds five official pages on target selection, drawing masks, contextual UI and group rendering. Read it before structural timeline work.

**Recommended first feature: Audio scrub on/off.** It can improve timing work without waiting for a new track model. Implement only after the user selects it.

## 1. Verified reference behavior

Evidence is documentation, not hands-on Dreams testing or binary analysis. This bounded study opened exactly five official **2.0** handbook pages, listed below. They carry an older-version notice; these findings describe that documented version, not guaranteed current-app behavior.

| Topic | Documented behavior | Source |
|---|---|---|
| Placement | Create/File imports at the playhead into compatible tracks or new tracks. Images/audio can use available space on the selected track. Video has a distinct track type. | [Timeline and Modes](https://help.procreate.com/dreams/handbook/2.0/interface-and-gestures/timeline), [Tracks](https://help.procreate.com/dreams/handbook/2.0/tracks-and-content/tracks) |
| Move/trim | Hold and drag content through time or between tracks. Edge handles change duration non-destructively; ordinary trimming stops at source limits or neighboring content. | [Content](https://help.procreate.com/dreams/handbook/2.0/tracks-and-content/content) |
| Ripple-like edit | Free Trim adds a second finger while edge-dragging to push/pull adjacent content on the same track. This does not establish project-wide ripple rules. | [Content](https://help.procreate.com/dreams/handbook/2.0/tracks-and-content/content) |
| Groups/selection | Groups expand/collapse, permit child edits and content moving in/out, and move as units. Multi-select supports joint moves/retiming of content and selection of tracks/keys. Finger selection is configurable. | [Content](https://help.procreate.com/dreams/handbook/2.0/tracks-and-content/content), [Multi-select](https://help.procreate.com/dreams/handbook/2.0/interface-and-gestures/multi-select) |
| Scrub sound | Scrubbing Flipbook frames previews timeline audio at the corresponding position. Exact preview length, reverse-audio processing and an on/off control are not established by these pages. | [Flipbook](https://help.procreate.com/dreams/handbook/2.0/draw-and-paint/flipbook) |

## 2. Proposed 2Dope decisions

These are our proposed interaction rules, not claims about Dreams or implemented behavior.

| Shared action | Draw | Time | Motion | Board |
|---|---|---|---|---|
| Select/scrub | Drawing blocks and stacked rails | Exposure cells on the same clock | Layer spans and keys | Panels and aligned sound |
| Move/trim | Body moves; edges trim; gaps allowed | Precise frame/exposure edits | Same placement; keys retain content-relative time | Existing panel commands retain panel semantics |
| Group/fold | Reveal children, Line/Fill on demand | Same hierarchy with timing detail | Same hierarchy with transform/key detail | Show panel-linked content without inventing duplicate timing |
| Ripple | Explicit scope, visible affected spans | Same command in frames | Same changes to placement and dependent keys | Panel ripple remains a distinct labeled operation |
| Scrub sound | One shared preference and preview service in all four views; switching views retains the playhead and setting. ||||

1. **One document:** views read shared IDs, timing and hierarchy; switching views never converts or copies content. A rail organizes timed spans; a span references content; Line/Fill remain drawing parts. An organizational group is not automatically a precomp with a different clock.
2. **Direct editing:** tap selects, body drag moves, edge drag trims. Preserve a clear empty-area scrub/pan gesture and time zoom. Show selection and destination before committing. Prevent accidental overwrites; permit overlap on different rails. Provide explicit controls alongside touch modifiers.
3. **Scoped ripple:** ordinary trims do not shift neighbors. Proposed initial Ripple scope is the active rail's contiguous following spans, stopping at a gap or locked boundary. Wider group/selected-rail ripple needs separate design approval. Linked audio follows its resolved anchor once; fixed audio stays fixed unless explicitly included. Panel edits use existing Board synchronization rules. Preview affected items; commit one undo command and autosave notification; cancellation restores all state.
4. **Create/import:** one entry point with supported formats displayed. Place at the playhead in compatible free space or a new rail. Reject unsupported types clearly. Audio/still-image import should precede video/sequences unless separately prioritized; do not promise formats before decoder and memory checks.
5. **Light UI:** a resizable timeline, fold controls, and contextual actions keep drawing space available. Folding affects presentation only. Preserve residency and Lite limits; avoid decoding or rescanning full media on every pointer move. Stable commands, clocks and fixtures form the eventual Rust behavior contract; no rewrite in this slice.

## 3. Smallest first implementation: Audio scrub on/off

Proposed acceptance contract:

1. Put a labeled **Scrub audio** toggle beside shared playback controls. Default off; remember per device, shared across workspaces. This is a UI preference, not a document edit or undo entry; no `.2dope` schema change.
2. While paused and actively dragging the timeline playhead, preview an approximately **80 ms forward-audio window** at its current time, even when dragging backward. This is positional audition, not reversed audio. Ordinary programmatic seeks and drawing strokes stay silent. Use existing clip trim/gain/mute, panel links and nested-comp timing rules.
3. Reuse decoded audio and the existing mixer. Coalesce requests to the latest position, cap preview starts at 20/second, and replace old previews with a short fade. Bound active sources; generation-cancel delayed loads. Finish silence promptly on release/cancel, toggle off, project/comp change, hidden tab or normal playback. Do not resume stale previews after asynchronous decoding.
4. Route all four views through a dedicated scrub-preview lifecycle; do not attach sound indiscriminately to every `setFrame`. Inspect existing `beginScrub`/`endScrub` semantics before reuse. Unlock browser audio from an intentional gesture and surface unavailable audio without blocking editing. Playback/export mixing stays unchanged.
5. Verify toggle-off silence, latest-position cancellation, trim/gain/mute/linked/nested timing, switch/release cleanup and bounded scheduling. Run relevant tests plus production build and desktop browser flows across all views. Report iPad/Safari/physical-audio checks separately; they are not established here.

The numeric preview settings are proposed starting values to tune during verification, not measured Dreams settings or performance guarantees.

## 4. Open decisions before structural timeline work

| Question | Recommended next decision |
|---|---|
| Multiple spans per existing layer | Specify gaps, source bounds, drawing exposure ownership and key behavior before changing the schema. Current model is exposures plus layer timing, not proof of arbitrary clips per rail. |
| Groups versus precomps | Define organizational nesting, transform inheritance and local clocks separately; preserve appearance and absolute timing when grouping/ungrouping. |
| Wider ripple | Decide gaps, locks, nested groups, keys outside trims and Board boundaries using concrete before/after examples. The single-rail proposal does not settle these. |
| Media scope | Confirm first formats, durations, video audio extraction and memory budgets. |
| Gesture conflicts | Validate edge drag plus extra touch against existing pinch and two-finger undo on hardware before adopting the Dreams modifier. |

## 5. Handoff and stop point

Checked local state: `beta/main` at `7e275ac`; pre-existing edits to `HANDOFF.md` and untracked `TIMELINE-AND-MEDIA-DIRECTION.md` preserved. Sibling worktree `codex-video-export` is clean on `codex/audio-waveforms` at `1104e93`; no fetch, merge or deployment was performed. Local tracking state does not establish remote freshness.

Local mapping was checked against `ARCHITECTURE.md`, `src/core/comp.ts`, `src/audio.ts` and timeline scrub call sites. `AudioPlayback.sync()` currently stops sound when paused; a separate bounded audition path is needed. The existing waveform branch should be considered when selecting the implementation base, without merging into Claude's checkout.

This pass changes documentation only. No application tests/build were run, no dependencies changed, and no binary analysis was needed. Next user action: select **Audio scrub on/off** for implementation in a separate worktree/branch, with no merge or deployment.
