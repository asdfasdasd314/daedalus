# Agent Task Notifications

## Summary
The agent-task-notifications feature owns the dashboard bell UI, unread badge, and in-session notification inbox for durable agent-task outcomes. It detects status transitions from the existing durable-task poll and surfaces `completed`, `failed`, and `blocked` results without owning the poll transport itself.

## Key Points
- **Completion Signal Source**: Relies on durable `agent_tasks` polling in the workspace; this feature only reacts to finalized status transitions.
- **Finalized Outcomes**: Notifies on all terminal durable-task statuses matching `FINALIZED_AGENT_TASK_STATUSES` (`completed`, `failed`, `blocked`, `cancelled`).
- **First-Poll Seed Guard**: Seeds the prior-status map on the first successful poll without creating notifications, so reloads do not spam old history.
- **In-Session Inbox**: Notification list is frontend-local only (no Supabase notification table, no browser push, no sound in HACKING).
- **Bell UI**: Presentational bell + unread badge + dropdown sits beside the workspace hamburger; opening either panel closes the other.
- **History Deep Link**: Selecting a notification opens Agent Output Viewer at the matching prompt/task ID without using the Edit surface.

## Relevant Files
- `daedalus-site/app/agent-task-notifications.tsx`: Bell button, unread badge, dropdown inbox, clear-all.
- `daedalus-site/app/feature-files-dashboard.tsx`: Hook point for transition detection inside `pollDurableAgentTasks` and top-right UI placement.
- `feature_files/agent-prompt-chat.md`: Related dependency that owns durable-task polling used as the completion signal.
- `parameter_files/agent-task-notifications.toml`: Optional tunables for this feature.

## Dev Mode
HACKING

## State Log
- 2026-07-12: Initialized the agent-task-notifications feature for the dashboard bell inbox and finalized durable-task transition alerts.
- 2026-07-12: Added the bell UI, first-poll seed guard, and finalized-status transition inbox wired beside the workspace menu.
- 2026-07-13: Included cancelled durable-task outcomes in the finalized notification set.
- 2026-07-13: Connected notification selection to the matching durable exchange in Agent Output Viewer and removed the Edit-surface presentation dependency.
- 2026-07-13: Recorded the dashboard mobile viewport containment adjustment; the Ventures feature owns the affected drawer implementation.
