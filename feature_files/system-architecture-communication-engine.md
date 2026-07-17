# System Architecture Communication Engine

## Summary
The system architecture communication engine coordinates persistent, task-scoped Architecture Views for completed durable agent work. It captures immutable Git commit boundaries, uses changed paths only as attention hints, combines feature-file ownership with Graphify community evidence, invokes the configured read-only model, and hands each raw response to the visualization engine's validator.

## Key Points
- **Immutable Task Scope**: Each completed durable task stores its admission commit and final verified task-branch commit independently of its reclaimed worktree.
- **Final-State Reporting**: Architecture documents describe surviving systems at the final commit and must not narrate diffs, commits, before/after states, or implementation chronology.
- **Two-Layer System Evidence**: Feature files are primary system-boundary candidates while Graphify communities containing changed source files provide secondary structural evidence.
- **Structured Handoff**: Model invocation uses the visualization engine's published schema, validator, and corrective retry boundary before handing normalized JSON to the existing completion lifecycle.
- **Durable Regeneration**: Architecture Views persist with the Agent Output Viewer exchange, support explicit regeneration, and use generation-guarded review states so stale work cannot replace newer output.
- **Forward-Only Availability**: Historical tasks without captured commit boundaries remain visible but cannot generate an Architecture View.

## Relevant Files
- `shared/database/migrations/028_system_architecture_communication_engine.sql`: Architecture View storage, lifecycle RPCs, recurrent review projections, and task completion projection.
- `local-daemon/src/daedalus_daemon/architecture.py`: Detached snapshot creation, scope and Graphify evidence collection, model invocation, validator handoff, and asynchronous generation lifecycle.
- `local-daemon/src/daedalus_daemon/architecture_document.py`: Visualization-engine dependency that validates model output before completion.
- `daedalus-site/app/agent-output-viewer.tsx`: Completed-task Architecture View action owned by the Agent Output Viewer.
- `daedalus-site/lib/architecture-view.ts`: Authenticated Architecture View fetch and generation-request client.
- `parameter_files/system-architecture-communication-engine.toml`: Dedicated provider, model, reasoning, and concurrency settings.

## Dev Mode
HACKING

## State Log
- 2026-07-16: Initialized the immutable-commit Architecture View feature, its final-state reporting philosophy, and its durable generation boundary.
- 2026-07-16: Implemented verified commit capture, persistent generation-safe Architecture Views, detached read-only Codex reporting with feature and Graphify evidence, reviewed daemon transport, and completed-task viewer controls.
- 2026-07-16: Replaced Markdown report prompting with schema-bound JSON invocation, validator correction handoff, and normalized structured completion while retaining immutable snapshots and stale-generation lifecycle guards.
