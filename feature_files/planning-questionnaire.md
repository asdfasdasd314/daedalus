# Planning Questionnaire

## Summary
The planning questionnaire parses optional terminal planner questions, presents them as a local multiple-choice flow, and carries accumulated answers through repeated plan refinements before creating a durable implementation task.

## Key Points
- **Terminal Contract**: Only a final valid `## Questions` section is removed from the visible plan and rendered as questionnaire controls.
- **Local Session**: The original request, current plan, provider settings, scoped features, pending questions, and cumulative answers persist in browser local storage for planning-session recovery.
- **Optional Clarification**: When no valid questions are present, the session exposes implementation instead of inventing more questions.
- **Implementation Handoff**: The final durable task receives the approved plan followed by the complete question-and-answer history.

## Relevant Files
- `daedalus-site/lib/planning-questionnaire.ts`: Parser, planning-session types, and prompt-format helpers.
- `daedalus-site/app/feature-files-dashboard.tsx`: Planning-session persistence, daemon refinement requests, and durable implementation handoff.
- `daedalus-site/app/agent-session-panel.tsx`: Questionnaire and implementation controls beneath the agent response.
- `local-daemon/src/daedalus_daemon/main.py`: Appends planning refinement context to provider prompts.

## Dev Mode
HACKING

## State Log
- 2026-07-13: Initialized the planning questionnaire feature for local answer collection and iterative planning handoff.
- 2026-07-13: Added terminal-question parsing, local answer persistence, iterative plan refinement, and durable implementation handoff.
