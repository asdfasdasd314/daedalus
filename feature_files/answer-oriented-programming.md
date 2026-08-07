# Answer-Oriented Programming

## Summary
Answer-oriented programming (AOP) is the workspace surface for the bridge agent: a user submits a high-level direction, the bridge asks high-coverage questions to span open decisions, refines until ready, then fans out independent coding tasks as durable worktree jobs. Interaction lives in the feature-detail AOP tab; History only archives bridge turns.

## Key Points
- **Bridge profile**: `TASK_MODE: bridge` loads `.agents/profiles/bridge.md` (stub question strategy until improved).
- **Direct transport**: Bridge turns use `communications(purpose = "agent_prompt")` with `bridgeMode: true`, not durable implementation admission.
- **Reply contract**: Terminal markdown sections `## Status`, `## Notes`, `## Questions`, and `## Tasks` are parsed client-side into the local bridge session.
- **Multi-task fan-out**: A ready task list is dispatched as multiple `task_type = implementation` durable tasks so the existing worktree orchestrator is unchanged.
- **Session ownership**: Browser-local bridge session state (direction, answers, proposed tasks) is owned by the AOP feature; planning questionnaire remains separate.

## Relevant Files
- `daedalus-site/app/aop-session-panel.tsx`: AOP tab UI for direction, Q&A, and dispatch.
- `daedalus-site/lib/bridge-session.ts`: Parser and session types.
- `daedalus-site/app/feature-files-dashboard.tsx`: AOP tab strip, queue plumbing, and task fan-out.
- `local-daemon/src/daedalus_daemon/main.py`: Bridge prompt construction and direct-prompt execution.
- `.agents/profiles/bridge.md`: Bridge agent profile (stub).
- `parameter_files/answer-oriented-programming.toml`: Sibling parameter file.

## Dev Mode
HACKING

## State Log
- 2026-08-06: Initialized answer-oriented programming with bridge mode, AOP tab, and multi-task fan-out.
