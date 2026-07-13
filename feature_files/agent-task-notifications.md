# Agent Task Notifications

## Summary
The agent-task-notifications feature owns the dashboard bell UI, unread badge, and in-session notification inbox for durable agent-task outcomes. It detects status transitions from the existing durable-task poll and surfaces `completed`, `failed`, and `blocked` results without owning the poll transport itself.

## Key Points
- **Completion Signal Source**: Relies on durable `agent_tasks` polling already owned by agent-prompt-chat / the feature-files dashboard; this feature only reacts to finalized status transitions.
- **Finalized Outcomes**: Notifies on all terminal durable-task statuses matching `FINALIZED_AGENT_TASK_STATUSES` (`completed`, `failed`, `blocked`).
- **First-Poll Seed Guard**: Seeds the prior-status map on the first successful poll without creating notifications, so reloads do not spam old history.
- **In-Session Inbox**: Notification list is frontend-local only (no Supabase notification table, no browser push, no sound in HACKING).
- **Bell UI**: Presentational bell + unread badge + dropdown sits beside the workspace hamburger; opening either panel closes the other.

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
