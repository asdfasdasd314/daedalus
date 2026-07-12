# Daedalus Git Worktrees

## Summary
Daedalus Git Worktrees isolates agent-mode prompts on task branches and uses a durable daemon orchestrator to verify, batch, resolve, and fast-forward successful work into local `main`.

## Key Points
- **Per-Repository Capacity**: Each repository may run up to four isolated agent worktrees while later submissions remain durably queued.
- **Central Configuration**: Scheduler, resolver, branch, and verification settings are loaded once from Daedalus's feature-owned parameter file rather than requiring configuration files in managed repositories.
- **Durable Progress**: The daemon records task claim, agent-start, and verification events so agent-mode work is observable without relying on the legacy single-prompt channel.
- **Daemon-Owned Commits**: When an agent sandbox cannot reach Git's shared worktree metadata, the daemon stages and commits the completed isolated changes before verification.
- **Task Repair Loop**: Individual verification suites receive up to three total attempts in the same isolated worktree, with later agent repairs informed by the captured failure before a durable terminal error is reported.
- **Base-State Cohorts**: Tasks admitted from the same `main` commit are verified independently and integrated in submission order after the cohort fills or its quiet window expires.
- **Safe Promotion**: Combined work is tested on an integration branch and local `main` advances only by a verified fast-forward; no remote push occurs.
- **Resolver Loop**: Merge conflicts and combined-test failures launch a resolver agent up to three times, with daemon warnings for attempts and a blocking error after exhaustion.
- **Integration Notification**: A successful promotion records an info event in `daemon_events` after the batch is completed, allowing the dashboard to report completion instead of leaving the last resolver warning visible.
- **Planning Bypass**: Planning-mode prompts retain the read-only direct execution path and consume no worktree capacity.
- **Deferred Controls**: User cancellation, pruning, remote push, and post-integration revert controls are intentionally outside this first delivery.

## Relevant Files
- `local-daemon/src/daedalus_daemon/orchestrator.py`: Git worktree lifecycle, verification, batching, resolver attempts, and promotion.
- `local-daemon/src/daedalus_daemon/communications.py`: Durable task, batch, and event transport used by the daemon.
- `shared/database/migrations/009_git_worktree_orchestrator.sql`: Auth-scoped orchestration tables, policies, and daemon RPCs.
- `daedalus-site/app/feature-files-dashboard.tsx`: Durable agent task submission and status polling.
- `parameter_files/daedalus-git-worktrees.toml`: Daedalus-owned scheduler, resolver, branch, and verification configuration shared by managed repositories.

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
