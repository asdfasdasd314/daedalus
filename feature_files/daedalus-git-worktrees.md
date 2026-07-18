# Daedalus Git Worktrees

## Summary
Daedalus Git Worktrees isolates agent-mode prompts on task branches and uses a durable daemon orchestrator to verify, batch, resolve, and fast-forward successful work into local `main`.

## Key Points
- **Recoverable Separation**: A blocked integration batch retains completed member branches and its diagnostic integration worktree, while task retries resume their retained worktree instead of creating replacement branches.
- **Per-Repository Capacity**: Each repository may run up to four isolated agent worktrees while later submissions remain durably queued.
- **Central Configuration**: Scheduler, resolver, branch, and verification settings are loaded once from Daedalus's feature-owned parameter file rather than requiring configuration files in managed repositories.
- **Durable Progress**: Every task insert and lifecycle update atomically projects status, result, error, metadata, and timestamps into Agent Output Viewer history.
- **Daemon-Owned Commits**: When an agent sandbox cannot reach Git's shared worktree metadata, the daemon stages and commits the completed isolated changes before verification.
- **Verified Commit Provenance**: Successful tasks persist the final verified task-branch commit after all repair attempts so dependent systems can reconstruct the exact task state after worktree cleanup.
- **Reclaimable Workspaces**: Completed, cancelled, and clean failed worktrees are removed on later daemon cycles; dirty failures and blocked integrations remain available for recovery.
- **Task Repair Loop**: Individual verification suites receive up to three total attempts in the same isolated worktree, with later agent repairs informed by the captured failure before a durable terminal error is reported.
- **Base-State Cohorts**: Tasks admitted from the same `main` commit are verified independently and integrated in submission order after the cohort fills or its quiet window expires.
- **Safe Promotion**: Combined work is tested on an integration branch and local `main` advances only by a verified fast-forward; no remote push occurs.
- **Migration Prefix Reconcile**: After merges (and again after each successful resolver commit), the orchestrator renames duplicate `NNN_*.sql` prefixes in `migrations` folders to the next free integers after the folder max, then commits when anything changed.
- **Resolver Loop**: Merge conflicts and combined-test failures launch a resolver agent up to three times, with daemon warnings for attempts and a blocking error after exhaustion.
- **Resolver Provider**: The resolver defaults to the first task's provider and can be pinned to Codex or Cursor in the worktree parameter file, keeping resolver capacity independent of the submission UI.
- **Integration Notification**: A successful promotion records an info event in `daemon_events` after the batch is completed, allowing the dashboard to report completion instead of leaving the last resolver warning visible.
- **Hard Cancel**: Users can cancel agent-mode durable tasks (`queued` through `resolving`); the daemon kills the tracked process group, marks `cancelled`, force-removes the worktree, and records a durable cancel event. Planning-mode Abandon remains a local-queue-only path.
- **Planning Bypass**: Planning-mode prompts retain the read-only direct execution path and consume no worktree capacity.
- **Deferred Controls**: Pruning and post-integration revert controls remain intentionally outside this delivery.

## Relevant Files
- `local-daemon/src/daedalus_daemon/orchestrator.py`: Git worktree lifecycle, verification, batching, resolver attempts, hard cancel, and promotion.
- `local-daemon/src/daedalus_daemon/migration_deployment.py`: Serialized, allowlisted Supabase CLI preflight and deployment stage for verified integration batches.
- `local-daemon/src/daedalus_daemon/communications.py`: Durable task, batch, and event transport used by the daemon.
- `local-daemon/src/daedalus_daemon/main.py`: Tracked agent subprocess registry and SIGTERM/SIGKILL cancel plumbing.
- `supabase/migrations/015_agent_task_cancel.sql`: Adds `cancelled` status, `cancel_requested`, cancel RLS, and terminal RPC handling.
- `supabase/migrations/024_repair_agent_tasks_cancel_requested.sql`: Idempotent repair when live DB skipped 015's `cancel_requested` column.
- `supabase/migrations/030_task_and_batch_failure_recovery.sql`: Batch recovery, retained-worktree task retry, and daemon-owned deletion protocol.
- `supabase/migrations/009_git_worktree_orchestrator.sql`: Auth-scoped orchestration tables, policies, and daemon RPCs.
- `daedalus-site/app/feature-files-dashboard.tsx`: Durable agent task submission, cancel requests, and status polling.
- `daedalus-site/app/agent-session-panel.tsx`: Cancel control on in-flight durable tasks.
- `parameter_files/daedalus-git-worktrees.toml`: Daedalus-owned scheduler, resolver, branch, cancel grace, and verification configuration shared by managed repositories.
- `feature_files/system-architecture-communication-engine.md`: Consumer of the immutable base and final verified task commit boundary.

## Dev Mode
HACKING

## State Log
- 2026-07-11: Initialized the Git worktree isolation and durable agent orchestration feature.
- 2026-07-11: Implemented durable task and batch storage, per-repository worktree scheduling, independent and combined verification, resolver retries, local fast-forward promotion, restart-safe blocking, and dashboard status reporting.
- 2026-07-11: Centralized orchestrator configuration in Daedalus so managed repositories no longer require their own worktree parameter file.
- 2026-07-11: Added durable lifecycle events and automatic repository test discovery so worktree tasks show progress and do not run Daedalus-only commands in other projects.
- 2026-07-11: Made the daemon finalize worktree and resolver commits when agent sandboxes cannot create Git metadata locks.
- 2026-07-11: Added a durable three-attempt agent repair loop for individual worktree verification failures, with captured failures supplied to each retry and a terminal daemon error on exhaustion.
- 2026-07-12: Moved durable orchestration ahead of legacy polling so an unrelated communications failure cannot leave submitted agent tasks queued without lifecycle events.
- 2026-07-12: Added a final info event after successful batch promotion so the UI receives a durable orchestrator-completed notification.
- 2026-07-12: Delivered the dashboard Git Sync workflow with daemon-side commit and pull/push execution, structured step output, and request-scoped frontend polling.
- 2026-07-12: Moved manual Git Sync ownership into its own feature record so worktree orchestration remains scoped to durable agent scheduling and integration.
- 2026-07-12: Reclaimed completed and clean failed worktrees after daemon interruptions while excluding the Daedalus workspace root from project scans.
- 2026-07-13: Added hard cancel for agent-mode worktree tasks with process-group kill, cancel_requested signaling, cancelled terminal status, force worktree reclaim, and dashboard Cancel controls.
- 2026-07-13: Fixed planning-mode Codex cycle test expectation to include PLANNING_PROMPT_SUFFIX so verification matches build_codex_prompt.
- 2026-07-13: Added trigger-owned durable history projection and removed the orchestrator's duplicate latest-chat result publication path.
- 2026-07-13: Added database admission gating for new durable tasks while exposing all accepted nonterminal task and batch states to manager drain coordination.
- 2026-07-14: Made resolver dispatch provider-aware and added a parameterized Codex/Cursor resolver selection so Cursor tasks never pass empty reasoning into Codex.
- 2026-07-14: Added migration 024 to repair live databases that never received `agent_tasks.cancel_requested` from 015.
- 2026-07-14: Added deterministic migration-number reconcile on integration so duplicate `NNN_*.sql` prefixes are renumbered before combined verification and promotion.
- 2026-07-16: Persisted each successful task's final verified branch commit after repair completion for forward-only Architecture View reconstruction.
- 2026-07-16: Recovered blocked batch `de42f513-83d8-4405-9a50-61beac599016` by merging the user's newer primary commit into its integration branch and fast-forwarding the clean combined history to `main`.
- 2026-07-16: Separated implementation completion from batch integration failure, preserving recoverable task worktrees and adding guarded batch-only retries with successful batch cleanup.
- 2026-07-17: Added the final daemon-owned Supabase migration deployment gate, forwarding bounded preflight diagnostics through the existing resolver loop while retaining blocked integration worktrees.
