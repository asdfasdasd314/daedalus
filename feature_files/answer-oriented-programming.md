# Answer-Oriented Programming

## Summary
Answer-oriented programming (AOP) is a top-level workspace method: vision Q&A with the bridge agent fills a five-section **cp_doc**, then a durable **single build loop per project** recurses task → implementation prep → auto-start coding in a worktree → integrate, until MVP (with Pause/Resume, optional pause-after-each-task, every-N verification, and revert-to-base).

## Key Points
- **Bridge profile**: `TASK_MODE: bridge` loads `.agents/profiles/bridge.md`.
- **cp_doc sections**: Project Summary, Tech Stack, Broad Principles, Project State, Additional Notes. Coding readiness requires Summary, Tech Stack, Project State.
- **cp_doc storage**: `BridgeSession.cpDoc` + `{project_root}/cp_doc.md` written by the daemon; each write is committed on the primary branch as `Daedalus update cp_doc.md` (file-scoped) so the primary worktree stays clean for coding admission.
- **Vision questions**: Mass batches, no cap; UI “Question N of M.”
- **Build loop table**: `aop_execution_loops` — one active row per `(user_id, repository)`. Status machine: bridging_task → prep → awaiting_answers → awaiting_start → executing → (awaiting_verification every N) → … → completed | paused | cancelled | failed. Flags: `pause_after_task` (sticky), `pause_requested` (one-shot soft pause).
- **Authority**: Loop control plane is the database row. Vision `BridgeSession` may hydrate from localStorage for Q&A UX only. Coding progress is `agent_tasks` (`source_loop_id` + `current_agent_task_id`); the loop only advances to the next bridge emission when that durable task is **completed**. Failed/blocked launch returns to **awaiting_start** on the same slice (manual Retry Start task only). Operator **Pause** holds automation (mid-coding finishes first via `pause_requested`); **Resume**/Keep going continues. Cancel ends the loop. Client reconciles stuck `executing` loops against `agent_tasks` on load and soft-drives the loop on hydrate/nav so Start build loop is not required again for an already-active row.
- **Coding history**: AOP Beta lists all `agent_tasks` for the active loop (completed/failed/cancelled). Denormalized `tasks_completed_total` / `recent_task_titles` / `integrated_commits` are rebuilt from that ledger on hydrate and before each tasking turn. Bridge tasking prompts include the full slice history plus targeted feature digests (Summary / Key Points / recent State Log) so the bridge does not re-emit already-shipped work.
- **Tasking**: Bridge `bridgeTasking` emits `next_task` (exactly one task) or `mvp_complete`. Client must treat tasking replies via loop status / captured `bridgeTasking` flag — never only the ephemeral prompt queue after finalize (otherwise `next_task` is mis-applied as vision “Latest task” with no prep/coding).
- **Impl prep**: `implPrepMode` direct prompts (read-only); questions only; optional ## Optional Cp Doc; when prep is `ready_to_execute`, software auto-queues durable coding (no manual Start task) unless paused.
- **Execution**: durable `agent_tasks` (`source_loop_id`) via existing worktree orchestrator (per-task commit + integrate + cancel). Coding starts automatically after prep readiness; worktrees only after that auto-start, not after vision or bridge tasking alone.
- **Safety**: Pause holds the loop for inspection (does not kill mid-coding; one-shot `pause_requested` or sticky `pause_after_task`); Resume restores `paused_from` and continues automation; every N tasks requires Verify OK; Revert hard-resets primary to `loop_base_commit` via `git_sync` ops `resolve_head` / `aop_loop_revert`. Cancel loop is terminal. Retry choose task only when bridge tasking is stuck/failed.
- **Workspace home**: AOP Beta peer of Feature/Architecture views.

## Relevant Files
- `daedalus-site/app/aop-session-panel.tsx`: AOP UI (vision + loop controls).
- `daedalus-site/lib/aop-loop.ts`: Loop types and helpers.
- `daedalus-site/lib/impl-prep.ts`: Implementation prep reply parser.
- `daedalus-site/lib/bridge-session.ts`: Bridge parse (incl. next_task / mvp_complete).
- `daedalus-site/app/feature-files-dashboard.tsx`: Loop driver + queue plumbing.
- `local-daemon/src/daedalus_daemon/main.py`: Bridge tasking + impl prep prompts; git resolve/revert.
- `supabase/migrations/047_aop_execution_loops.sql`: Schema.
- `supabase/migrations/048_aop_loop_pause_after_task.sql`: `pause_after_task` / `pause_requested` columns.
- `.agents/profiles/bridge.md`: Bridge agent profile.
- `parameter_files/answer-oriented-programming.toml`: Parameters (max N default).

## Dev Mode
HACKING

## State Log
- 2026-08-06: Initialized answer-oriented programming with bridge mode, AOP tab, and multi-task fan-out.
- 2026-08-08: Promoted AOP to top-level AOP Beta workspace view; removed feature-detail AOP sub-tab.
- 2026-08-08: Centered AOP on cp_doc (operator-vision doc), removed five-question cap, coding dispatch still off.
- 2026-08-08: Host daemon persists per-project `cp_doc.md` at the project root for operator and agent access.
- 2026-08-08: Structured cp_doc into five fixed sections with a coding readiness gate on Summary, Tech Stack, and Project State.
- 2026-08-08: Added durable recursive build loop (one task at a time, impl prep, Start task, Stop/Resume, verify every N, revert).
- 2026-08-08: Host auto-commits `cp_doc.md` after seed/persist so AOP does not leave the primary tree dirty and block worktree admission.
- 2026-08-08: Loop advances only on completed agent_tasks; launch failures return to awaiting_start for retry; reconcile stuck executing on hydrate.
- 2026-08-09: Fixed build-loop tasking mis-routed as vision after queue finalize; stale loop hydrate no longer clears a just-started loop; no worktree until Start task.
- 2026-08-09: Coding history is agent_tasks-derived (visible in AOP Beta); tasking injects full slice ledger + feature digests; integrated_commits written on success.
- 2026-08-09: Auto-start coding after prep readiness; soft re-drive on hydrate so nav does not require Start build loop; Retry choose task only when stuck/failed.
- 2026-08-09: Pause/Resume (soft mid-coding hold) + durable Pause after each task for step-through debugging; Cancel loop remains terminal.
- 2026-08-09: Pause-after-task checkbox is optimistic + honored from live loop ref at integrate; surfaces migration 048 errors if columns missing.
