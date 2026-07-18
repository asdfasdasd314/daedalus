# Agent Prompt Chat

## Summary
Agent Prompt Chat is the prompt-only Edit surface shared by new-feature and feature-detail sessions. It owns prompt composition, mode/provider/model/reasoning selection, project and feature targeting, and submission; Agent Output Viewer owns every live status, response, error, questionnaire, durable-task list, and archived completion presentation.

## Key Points
- **Prompt-Only Edit**: The feature-detail tab is labeled `Edit` and contains no transcript, agent reply, task status, completion, retry, cancellation, or cleanup UI.
- **Submission Split**: Standard mode inserts authenticated `agent_tasks`; planning and ask modes enqueue `communications(purpose = "agent_prompt")` requests.
- **History Handoff**: A successful submission clears the textarea and remembers the submitted prompt ID for the manually opened Agent Output Viewer.
- **Targeting**: Each submission carries project-relative targeted feature paths and may reference multiple features without creating multiple history records.
- **Planning Composition**: Planning refinements continue to reuse the local direct queue and persisted `PlanningSession` context, while durable planning output and interaction presentation belong to the viewer.
- **Retired Chat Payload**: The frontend and daemon no longer read or write `daemon_payloads(kind = "agent_chat")`; direct results publish to `agent_output_history`.

## Relevant Files
- `daedalus-site/app/agent-session-panel.tsx`: Prompt-only Edit composer.
- `daedalus-site/app/feature-files-dashboard.tsx`: Submission, direct queue, durable task insertion, and History handoff.
- `daedalus-site/app/feature-search-dialog.tsx`: Shared feature targeting finder.
- `daedalus-site/lib/agent-models.ts`: Provider/model configuration loader.
- `daedalus-site/config/agent_models.json`: Frontend model and reasoning choices.
- `local-daemon/src/daedalus_daemon/main.py`: Direct planning/ask execution.
- `feature_files/agent-output-viewer.md`: Owner of responses, status, planning interaction, and archived output.
- `feature_files/daedalus-git-worktrees.md`: Owner of durable standard-task execution.

## Dev Mode
HACKING

## State Log
- 2026-07-05: Initialized the shared agent prompt composition and purpose-based communications workflow.
- 2026-07-11: Routed standard submissions into durable worktree tasks while retaining direct planning transport.
- 2026-07-13: Added Ask mode, planning refinement context, and cancellation-aware durable submissions.
- 2026-07-13: Reduced Agent Prompt Chat to the prompt-only Edit surface, retired agent-chat payload output, and handed all lifecycle and response presentation to Agent Output Viewer.
- 2026-07-13: Updated Ask-mode Codex execution to use the supported read-only sandbox option without the removed approval flag.
- 2026-07-13: Paused standard submissions and direct Planning/Ask dispatch while manager admission is closed, preserving unsent direct prompts in the browser queue for resumption.
- 2026-07-13: Moved direct prompt execution off the daemon polling loop so planning no longer delays queued standard prompt admission.
- 2026-07-13: Integrated Ask-mode compatibility, manager admission, and independent direct-prompt supervision without changing their ownership boundaries.
- 2026-07-13: Confirmed a failed Cursor standard submission did not enter the separate Planning transport; the agent itself returned planning narration despite an implementation task.
- 2026-07-14: Restored normal letter spacing for provider, model, and reasoning select values in the Edit form.
- 2026-07-14: Kept prompt submission and planning handoffs in the composer without automatically opening the output viewer; the latest prompt remains selected when the viewer is opened manually.
- 2026-07-14: Resolved the integration merge by retaining both the Edit-form typography restoration and manual output-viewer handoff.
- 2026-07-14: Diagnosed batch resolver failures caused by passing Cursor's empty reasoning setting into a Codex resolver invocation.
- 2026-07-17: Prepended TASK_MODE routing lines on direct planning and coding chat prompts so AGENTS.md selects the matching agent profile.
