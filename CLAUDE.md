# Claude entry point

This directory (`beta/`) is the application and Git root. The parent and sibling `reference/` projects are not part of its build.

Before work, read `AGENTS.md`, the current-state section at the top of `HANDOFF.md`, and the review linked there. Use `ARCHITECTURE.md` as a code map; some descriptions are historical. Check current source and `git status --short --branch` before editing.

The handoff distinguishes implemented features, verified results, proposed work and the recommended next task. A roadmap or recommendation is not an instruction to implement the whole plan. Follow the user's requested scope and preserve existing edits. Do not reset, stash or commit another collaborator's changes as cleanup.

After a task, update the current handoff with what changed, actual checks and remaining gaps. Keep historical review reports dated; do not rewrite an old result as if it were newly verified. Do not push `main` unless requested: that deploys the app.
