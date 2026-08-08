# Answer-Oriented Programming

## Summary
Answer-oriented programming (AOP) is a top-level workspace method for the bridge agent: a user submits a high-level direction from **AOP Beta**, the bridge maintains a concise **cp_doc** (its model of the operator's stated vision), asks as many high-coverage questions as needed to fill gaps, and revises cp_doc only after operator direction or answers. Coding-task dispatch remains disabled while question generation is the focus. History archives bridge turns; interactive Q&A lives in AOP Beta.

## Key Points
- **Bridge profile**: `TASK_MODE: bridge` loads `.agents/profiles/bridge.md`.
- **cp_doc**: The agent’s model of the operator’s vision—not invented product ideals. Seeded from the task direction; full replacement from `## Cp Doc` on each bridge reply; refinement turns pass `bridgeContext = cpDoc` (not free-form notes). UI keeps `BridgeSession.cpDoc`; the local daemon also persists **`{project_root}/cp_doc.md`** on each bridge turn (seed before the agent, then ## Cp Doc after a successful reply) so the operator and other agents can read it on disk.
- **Questions**: Exist to fill holes and resolve decision axes that change cp_doc. No per-turn question cap; mass batches are encouraged. UI answers a batch sequentially with “Question N of M.”
- **Direct transport**: Bridge turns use `communications(purpose = "agent_prompt")` with `bridgeMode: true`. No Standard, Planning, or Ask mode on AOP Beta.
- **Reply contract**: `## Status`, `## Cp Doc`, `## Notes`, `## Questions`, optional `## Tasks` — parsed client-side; host writes on-disk `cp_doc.md` (bridge agent stays read-only).
- **Coding dispatch**: Fan-out of `implementation` tasks is intentionally off; proposed tasks may preview only.
- **Workspace home**: AOP Beta is a peer of Feature View and Architecture View (`WorkspaceView = "aop"`).
- **On-disk cp_doc.md**: Project root; one file per selected project directory; overwritten by the daemon only from operator direction/answers via bridge.

## Relevant Files
- `daedalus-site/app/aop-session-panel.tsx`: AOP Beta panel (direction, cp_doc viewer, Q&A).
- `daedalus-site/lib/bridge-session.ts`: Parser and session types (`cpDoc`).
- `daedalus-site/app/feature-files-dashboard.tsx`: AOP Beta workspace view and queue plumbing.
- `local-daemon/src/daedalus_daemon/main.py`: Bridge prompt construction and direct-prompt execution.
- `.agents/profiles/bridge.md`: Bridge agent profile.
- `parameter_files/answer-oriented-programming.toml`: Sibling parameter file.

## Dev Mode
HACKING

## State Log
- 2026-08-06: Initialized answer-oriented programming with bridge mode, AOP tab, and multi-task fan-out.
- 2026-08-08: Promoted AOP to top-level AOP Beta workspace view; removed feature-detail AOP sub-tab.
- 2026-08-08: Centered AOP on cp_doc (operator-vision doc), removed five-question cap, coding dispatch still off.
- 2026-08-08: Host daemon persists per-project `cp_doc.md` at the project root for operator and agent access.
