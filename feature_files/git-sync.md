# Git Sync

## Summary
The Git Sync panel submits user-scoped commit, pull/push, and status requests to the local daemon, which runs explicit Git command arrays and returns only failures through Supabase, except for requested `git status` output.

## Key Points
- **Three Explicit Operations**: Commit stages and creates a local commit; Sync pulls then pushes already committed work; Status displays the selected repository's `git status` output.
- **Low-Egress Results**: Successful commit and sync commands return `No errors.` rather than their Git stdout; failed commands return stderr, and status returns its requested stdout.
- **Request-Scoped Results**: Each request is claimed through the communications record and publishes command output under the `git_sync_result` daemon payload kind.
- **Schema Gate**: The database permits the result payload kind so the UI can complete the request and display success or failure output.

## Relevant Files
- `daedalus-site/app/git-sync-panel.tsx`: Git Sync panel controls and output display.
- `daedalus-site/app/git-sync-utils.ts`: Low-egress command-result formatting.
- `daedalus-site/app/feature-files-dashboard.tsx`: Request submission and result polling.
- `local-daemon/src/daedalus_daemon/main.py`: Daemon-side Git command execution and request lifecycle.
- `local-daemon/src/daedalus_daemon/communications.py`: Supabase transport and detailed HTTP failure reporting.
- `shared/database/migrations/012_allow_git_sync_results.sql`: Permits durable Git Sync result payloads.

## Dev Mode
HACKING

## State Log
- 2026-07-12: Added the missing Git Sync result-payload database permission and response-body diagnostics for rejected Supabase requests.
- 2026-07-13: Added on-demand Git status and suppressed successful commit/sync command output from Supabase results.
- 2026-07-13: Disabled new Git operations while manager admission is closed and exposed active Git Sync communications as graceful-restart blockers.
