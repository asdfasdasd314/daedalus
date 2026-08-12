# Operator-Required Task Handoffs

## Summary
The operator-handoff contract stops agent work only at responsibility boundaries that require an authenticated human, while preserving completed work and giving the task viewer actionable manual steps.

## Key Points
- Agents use one validated JSON marker; malformed markers remain normal output.
- Handoffs cover identity, secrets, billing, legal consent, and third-party configuration; ordinary technical work stays agent-owned.
- Blocked tasks retain their worktrees and Resume always revalidates the prerequisite.

## Relevant Files
- `local-daemon/src/daedalus_daemon/operator_handoff.py`: Contract validation, redaction, and Supabase guidance.
- `local-daemon/src/daedalus_daemon/orchestrator.py`: Durable task and integration lifecycle handling.
- `daedalus-site/app/agent-output-viewer.tsx`: Operator action panel and resume confirmation.

## Dev Mode
TESTING

## State Log
- 2026-08-10: Added validated, redacted operator-required handoffs across agent execution and Supabase deployment blocks.
- 2026-08-12: Repaired terminal-update races and reattached an operator-resumed AOP task to its original loop and retained worktree.
