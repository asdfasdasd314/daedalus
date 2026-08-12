# AOP Immutable Ask Mode

## Summary
The AOP Ask panel lets an operator submit independent repository questions while a build loop is active. It builds a persisted transcript snapshot and uses the daemon's existing read-only Ask path, without creating a worktree or changing loop state.

## Key Points
- Each query has a fresh conversation ID and is immutable; it is not a follow-up thread.
- The transcript includes the current AOP loop, coding history, and live cp_doc when available; the agent also inspects cp_doc.md and feature files from the project root.
- Query history is identified by the stable `AOP IMMUTABLE ASK` prompt marker and remains available through both AOP and Agent Output History.

## Relevant Files
- `daedalus-site/lib/aop-loop.ts`: AOP Ask prompt and persisted-question helpers.
- `daedalus-site/app/feature-files-dashboard.tsx`: ask submission, query projection, and refresh behavior.
- `daedalus-site/app/aop-session-panel.tsx`: Ask AOP composer and ledger UI.

## Dev Mode
TESTING

## State Log
- 2026-08-12: Added the AOP immutable Ask feature using the existing daemon read-only execution path.
