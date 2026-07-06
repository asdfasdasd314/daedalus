# Ventures

## Summary
The Ventures feature adds a collaborative task surface to the left-side dev interface so the user and AI can manage MVP work items alongside the existing agent chat workflow.

## Key Points
- **Tabbed Dev Interface**: Ventures lives as a second tab inside the existing left dashboard panel instead of introducing a new floating surface.
- **Local-Only State**: Venture items stay in frontend React state and reset on page reload.
- **Card Stack Workflow**: The UI presents Ventures as editable workspace cards rather than a compact checklist.
- **MVP Item Model**: Each Venture uses `id`, `title`, `notes`, and `isComplete` for lightweight add, edit, delete, and toggle interactions.

## Relevant Files
- `daedalus-site/app/feature-files-dashboard.tsx`: Dashboard shell that hosts the Agent Chat and Ventures tabs in the left dev interface.
- `feature_files/agent-prompt-chat.md`: Existing chat feature file that describes the current left-panel agent workflow Ventures must preserve.

## Dev Mode
HACKING

## State Log
- 2026-07-05: Initialized the Ventures feature file for the local-only collaborative workspace tab in the left-side dev interface.
- 2026-07-05: Added a tabbed left-panel Ventures workspace with local React state, card-stack editing, completion toggles, and deletion while keeping the existing agent chat flow unchanged behind its own tab.
