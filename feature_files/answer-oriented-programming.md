# Answer-Oriented Programming

## Summary
Answer-oriented programming (AOP) is a top-level workspace method for the bridge agent: a user submits a high-level direction from **AOP Beta**, the bridge asks high-coverage questions to span open decisions, refines until ready, then fans out independent coding tasks as durable worktree jobs. History only archives bridge turns; interactive Q&A and dispatch live in AOP Beta.

## Key Points
- **Bridge profile**: `TASK_MODE: bridge` loads `.agents/profiles/bridge.md` (stub question strategy until improved).
- **Direct transport**: Bridge turns use `communications(purpose = "agent_prompt")` with `bridgeMode: true`, not durable implementation admission. There is no Standard, Planning, or Ask mode on AOP Beta.
- **Reply contract**: Terminal markdown sections `## Status`, `## Notes`, `## Questions`, and `## Tasks` are parsed client-side into the local bridge session.
- **Multi-task fan-out**: A ready task list is dispatched as multiple `task_type = implementation` durable tasks so the existing worktree orchestrator is unchanged.
- **Session ownership**: Browser-local bridge session state (direction, answers, proposed tasks) is owned by the AOP feature; planning questionnaire remains separate.
- **Workspace home**: AOP Beta is a peer of Feature View and Architecture View (`WorkspaceView = "aop"`), not a feature-detail sub-tab.

## Relevant Files
- `daedalus-site/app/aop-session-panel.tsx`: AOP Beta panel UI for direction, feature tags, Q&A, and dispatch.
- `daedalus-site/lib/bridge-session.ts`: Parser and session types.
- `daedalus-site/app/feature-files-dashboard.tsx`: AOP Beta workspace view, queue plumbing, and task fan-out.
- `local-daemon/src/daedalus_daemon/main.py`: Bridge prompt construction and direct-prompt execution.
- `.agents/profiles/bridge.md`: Bridge agent profile (stub).
- `parameter_files/answer-oriented-programming.toml`: Sibling parameter file.

## Dev Mode
HACKING

## State Log
- 2026-08-06: Initialized answer-oriented programming with bridge mode, AOP tab, and multi-task fan-out.
- 2026-08-08: Promoted AOP to top-level AOP Beta workspace view; removed feature-detail AOP sub-tab.
