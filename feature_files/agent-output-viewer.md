# Agent Output Viewer

## Summary
The Agent Output Viewer is the durable, authenticated history and live-status surface for standard, planning, and ask prompts. It composes transient direct-prompt queue state, authoritative durable-task lifecycle state, and the `agent_output_history` archive into one feature-centric workspace drawer without becoming a general daemon-log viewer.

## Key Points
- **Durable Projection**: One `agent_output_history` row is stored per user and prompt ID, preserving prompt metadata, raw output, terminal error, concise outcome, and lifecycle timestamps after transient task rows are cleared.
- **Unified Read Model**: Active direct prompts and durable tasks supply current lifecycle state while history supplies archived content; records merge by prompt ID.
- **Feature Discovery**: A multi-feature prompt remains one database record and is presented beneath every repository-qualified targeted feature, with separate All activity and Unscoped groups.
- **Planning Ownership**: Planning output, questionnaires, refinements, and implementation handoff are presented from the selected history exchange while the prompt composer retains submission ownership.
- **Workspace Drawer**: A true upper-left history control opens a responsive drawer that is mutually exclusive with Ventures and supports notification deep links.
- **Archive Controls**: The viewer owns formatted/raw output, copying, search, stable pagination, retry, abandon, cancel, and finalized-task cleanup without deleting archived history.

## Relevant Files
- `shared/database/migrations/018_agent_output_history.sql`: Durable history table, policies, RPCs, task projection trigger, and recoverable backfills.
- `shared/database/schema.sql`: Current database schema snapshot.
- `local-daemon/src/daedalus_daemon/communications.py`: Narrow direct-prompt history upsert transport.
- `local-daemon/src/daedalus_daemon/main.py`: Direct planning and ask execution publication.
- `daedalus-site/lib/agent-output-history.ts`: History types, normalization, grouping, merging, pagination, and search helpers.
- `daedalus-site/app/agent-output-viewer.tsx`: Responsive live and archived prompt drawer.
- `daedalus-site/app/agent-output-detail.tsx`: Reusable prompt/output Markdown, raw, overflow, and copy presentation.
- `daedalus-site/app/feature-files-dashboard.tsx`: Workspace trigger, active-source composition, overlay routing, and notification history selection.
- `daedalus-site/app/agent-session-panel.tsx`: Prompt-only Edit composer and submission handoff.

## Dev Mode
HACKING

## State Log
- 2026-07-13: Initialized the Agent Output Viewer ownership boundary, durable-history architecture, workspace placement, and prompt-only Edit relationship.
- 2026-07-13: Implemented owner-scoped durable history projection and backfill, direct planning/ask publication, the unified responsive History drawer, planning and task controls, archive search/pagination, Edit cutover, and notification deep links.
