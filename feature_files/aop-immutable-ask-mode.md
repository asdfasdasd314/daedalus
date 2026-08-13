# AOP Ask Conversation Chains

## Summary
The AOP Ask panel provides project-scoped, durable read-only conversation chains while a build loop is active. It reuses the daemon's existing Ask path, without creating a worktree or changing loop state.

## Key Points
- A thread reuses one durable conversation ID, and each follow-up carries normalized earlier questions plus answers, failures, or operator handoffs without recursively embedding previous generated prompts.
- The next-request context estimate is local (`ceil(characters / 4)`), warns at 150k tokens, and blocks the thread at 200k; it is not a provider usage or billing total.
- The transcript includes the current AOP loop, coding history, and live cp_doc when available; the agent also inspects cp_doc.md and feature files from the selected project root.
- AOP history is identified by the stable `AOP IMMUTABLE ASK` prompt marker and remains available through both AOP and Agent Output History.

## Relevant Files
- `daedalus-site/lib/aop-loop.ts`: AOP Ask prompt and persisted-question helpers.
- `daedalus-site/app/feature-files-dashboard.tsx`: ask submission, query projection, and refresh behavior.
- `daedalus-site/app/aop-session-panel.tsx`: Ask AOP composer and ledger UI.

## Dev Mode
TESTING

## State Log
- 2026-08-12: Added the AOP immutable Ask feature using the existing daemon read-only execution path.
- 2026-08-12: Replaced the independent ledger with durable project-scoped Ask conversations and a local context-token limit.
