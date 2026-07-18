import json
from concurrent.futures import Future, ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
import os
import re
import subprocess
import tomllib

from .communications import (
    SupabaseUnavailableError,
    get_agent_task_control,
    complete_task_deletion,
    list_agent_tasks,
    list_task_deletion_requests,
    record_daemon_event,
    update_agent_task,
)
from .migration_deployment import (
    deploy_pending_migrations,
    load_deployment_settings,
)


DAEDALUS_ROOT = Path(__file__).resolve().parents[3]
WORKTREE_PARAMETER_FILE = (
    DAEDALUS_ROOT / "parameter_files" / "daedalus-git-worktrees.toml"
)


TASK_TERMINAL_STATES = {"completed", "failed", "blocked", "cancelled"}
CANCEL_REPLY_PREFIXES = (
    "Codex failed",
    "Codex was cancelled",
    "Cursor failed",
    "Cursor was cancelled",
)
CANCELLED_BY_USER = "Cancelled by user"
MIGRATION_FILE_RE = re.compile(r"^(\d+)_(.+)\.sql$")
MIGRATION_WALK_SKIP_DIRS = {".git", "node_modules", ".daedalus-worktrees"}


def record_migration_deployment_event(
    config: dict, repository: str, severity: str, message: str,
    task_id: str, event_type: str,
) -> None:
    """Publish optional deployment telemetry without blocking a database repair."""
    try:
        record_daemon_event(
            config, repository, severity, message,
            task_id=task_id, event_type=event_type,
        )
    except SupabaseUnavailableError as error:
        print(f"Supabase migration deployment telemetry could not be published: {error}")


class GitWorktreeOrchestrator:
    def __init__(self, config: dict, run_codex, run_cursor, kill_agent=None):
        self.config = config
        self.run_codex = run_codex
        self.run_cursor = run_cursor
        self.kill_agent = kill_agent or (lambda _task_id, grace_seconds=2.0: False)
        self.executor = ThreadPoolExecutor(max_workers=32)
        self.task_futures: dict[str, Future] = {}
        self.integration_futures: dict[str, Future] = {}
        self.integrating_repositories: dict[str, str] = {}
        self.cancelled_task_ids: set[str] = set()
        self.recovered_persisted_work = False

    def _handle_task_deletion_requests(self, tasks: list[dict]) -> None:
        tasks_by_id = {str(task["id"]): task for task in tasks}
        for request in list_task_deletion_requests(self.config):
            task = tasks_by_id.get(str(request["task_id"]))
            if task is None:
                complete_task_deletion(self.config, str(request["id"]), "Task is no longer available for deletion.")
                continue
            worktree_path = str(task.get("worktree_path") or "")
            if worktree_path and Path(worktree_path).is_dir():
                remove_worktree(str(task["repository"]), worktree_path, force=True)
            complete_task_deletion(self.config, str(request["id"]))

    def run_cycle(self, snapshot: dict | None = None) -> None:
        tasks = snapshot.get("agentTasks", []) if snapshot is not None else list_agent_tasks(self.config)
        self._handle_task_deletion_requests(tasks)
        if not self.recovered_persisted_work:
            self._recover_interrupted_work(tasks)
            self.recovered_persisted_work = True
        self._handle_cancel_requests(tasks)
        self._finish_tasks(tasks)
        if self._finish_integrations(tasks):
            return
        self._cleanup_reclaimable_worktrees(tasks)
        repositories = sorted({str(task["repository"]) for task in tasks})

        for repository in repositories:
            repository_tasks = [task for task in tasks if task["repository"] == repository]
            try:
                self._admit_tasks(repository, repository_tasks)
                self._start_next_integration(repository, repository_tasks)
            except Exception as error:
                queued = [
                    task
                    for task in repository_tasks
                    if task["status"] == "queued" and not task.get("cancel_requested")
                ]
                if queued:
                    first = min(queued, key=lambda task: task["queue_sequence"])
                    update_agent_task(self.config, str(first["id"]), "queued", {
                        "status": "failed",
                        "error": str(error),
                        "completed_at": utc_now(),
                    })
                    record_daemon_event(
                        self.config,
                        repository,
                        "error",
                        str(error),
                        task_id=str(first["id"]),
                    )

    def _cleanup_reclaimable_worktrees(self, tasks: list[dict]) -> None:
        repositories = {str(task["repository"]) for task in tasks}

        for task in tasks:
            worktree_path = str(task.get("worktree_path") or "")
            if task["status"] == "completed":
                remove_task_worktree_and_branch(
                    str(task["repository"]),
                    worktree_path,
                    str(task.get("branch_name") or ""),
                )
            elif task["status"] == "cancelled" and worktree_path and Path(worktree_path).is_dir():
                remove_worktree(str(task["repository"]), worktree_path, force=True)

        for repository in repositories:
            prune_worktrees(repository)
            remove_empty_worktree_directories(repository)

    def _recover_interrupted_work(self, tasks: list[dict]) -> None:
        for task in tasks:
            task_id = str(task["id"])
            if task["status"] in {"integrating", "resolving"}:
                error = "Daemon restarted during integration; task worktree preserved."
                update_agent_task(self.config, task_id, str(task["status"]), {
                    "status": "blocked", "error": error, "completed_at": utc_now(),
                })
                record_daemon_event(
                    self.config, str(task["repository"]), "error", error, task_id=task_id,
                )
            elif task["status"] in {"running", "verifying"}:
                if task.get("cancel_requested"):
                    self._mark_task_cancelled(task, str(task["status"]), force_remove=True)
                else:
                    update_agent_task(self.config, task_id, str(task["status"]), {
                        "status": "failed",
                        "error": "Daemon restarted during agent execution; worktree preserved.",
                        "completed_at": utc_now(),
                    })
                    record_daemon_event(
                        self.config,
                        str(task["repository"]),
                        "error",
                        "Daemon restarted during agent execution; worktree preserved.",
                        task_id=task_id,
                    )
            elif task["status"] == "queued" and task.get("cancel_requested"):
                self._mark_task_cancelled(task, "queued")
            elif task["status"] == "ready" and task.get("cancel_requested"):
                self._mark_task_cancelled(task, "ready", force_remove=True)

    def _handle_cancel_requests(self, tasks: list[dict]) -> None:
        pending = [
            task
            for task in tasks
            if task.get("cancel_requested")
            and str(task["status"]) not in TASK_TERMINAL_STATES
        ]
        if not pending:
            return
        settings = load_worktree_settings()
        grace = settings["cancelKillGraceSeconds"]

        for task in pending:
            status = str(task["status"])
            if status == "queued":
                self._mark_task_cancelled(task, "queued")
            elif status in {"running", "verifying"}:
                task_id = str(task["id"])
                self.kill_agent(task_id, grace)
                if task_id not in self.task_futures:
                    self._mark_task_cancelled(task, status, force_remove=True)
            elif status == "ready":
                self._mark_task_cancelled(task, "ready", force_remove=True)
            elif status in {"integrating", "resolving"}:
                self.cancelled_task_ids.add(str(task["id"]))
                self.kill_agent(str(task["id"]), grace)
                self._mark_task_cancelled(task, status, force_remove=True)

    def _mark_task_cancelled(
        self, task: dict, expected_status: str, force_remove: bool = False
    ) -> bool:
        task_id = str(task["id"])
        claimed = update_agent_task(self.config, task_id, expected_status, {
            "status": "cancelled",
            "error": CANCELLED_BY_USER,
            "completed_at": utc_now(),
        })
        if not claimed:
            return False
        worktree_path = str(task.get("worktree_path") or "")
        if force_remove and worktree_path:
            remove_worktree(str(task["repository"]), worktree_path, force=True)
        self.task_futures.pop(task_id, None)
        record_daemon_event(
            self.config,
            str(task["repository"]),
            "info",
            CANCELLED_BY_USER,
            task_id=task_id,
        )
        return True

    def _refresh_cancel_requested(self, task: dict) -> bool:
        current = get_agent_task_control(self.config, str(task["id"]))
        if current is not None:
            requested = bool(current.get("cancel_requested"))
            task["cancel_requested"] = requested
            return requested
        return bool(task.get("cancel_requested"))

    def _admit_tasks(self, repository: str, tasks: list[dict]) -> None:
        settings = load_worktree_settings()
        occupied = [
            task for task in tasks
            if task["status"] in {"running", "verifying", "ready", "integrating", "resolving"}
        ]
        capacity = settings["maxAgentsPerRepository"] - len(occupied)
        if capacity <= 0:
            return

        queued = [
            task
            for task in tasks
            if task["status"] == "queued" and not task.get("cancel_requested")
        ]
        queued.sort(key=lambda task: task["queue_sequence"])
        for task in queued[:capacity]:
            retained_path = str(task.get("worktree_path") or "")
            retained_branch = str(task.get("branch_name") or "")
            if retained_path or retained_branch:
                if not retained_path or not retained_branch or not retained_task_worktree_valid(
                    repository, retained_path, retained_branch
                ):
                    error = "Retained recovery worktree or branch is unavailable; Daedalus will not start this task from scratch."
                    update_agent_task(self.config, str(task["id"]), "queued", {
                        "status": "failed", "error": error, "completed_at": utc_now(),
                    })
                    record_daemon_event(self.config, repository, "error", error, task_id=str(task["id"]))
                    continue
                base_commit, branch_name, worktree_path = str(task.get("base_commit") or ""), retained_branch, retained_path
            else:
                try:
                    base_commit, branch_name, worktree_path = create_task_worktree(
                        repository, str(task["id"]), settings["primaryBranch"],
                    )
                except Exception as error:
                    update_agent_task(self.config, str(task["id"]), "queued", {
                        "status": "failed", "error": str(error), "completed_at": utc_now(),
                    })
                    record_daemon_event(self.config, repository, "error", str(error), task_id=str(task["id"]))
                    continue
            if not base_commit:
                error = "Retained recovery worktree has no recorded base commit."
                update_agent_task(self.config, str(task["id"]), "queued", {
                    "status": "failed", "error": error,
                    "completed_at": utc_now(),
                })
                continue

            claimed = update_agent_task(self.config, str(task["id"]), "queued", {
                "status": "running",
                "base_commit": base_commit,
                "branch_name": branch_name,
                "worktree_path": worktree_path,
                "started_at": utc_now(),
            })
            if not claimed:
                remove_worktree(repository, worktree_path)
                continue

            task = {
                **task,
                "base_commit": base_commit,
                "branch_name": branch_name,
                "worktree_path": worktree_path,
                "status": "running",
            }
            record_daemon_event(
                self.config,
                repository,
                "info",
                "Worktree created and agent task claimed by the daemon.",
                task_id=str(task["id"]),
            )
            self.task_futures[str(task["id"])] = self.executor.submit(
                self._run_task, task, settings, bool(retained_path)
            )

    def _run_task(self, task: dict, settings: dict, recovering: bool = False) -> dict:
        task_id = str(task["id"])
        worktree_path = str(task["worktree_path"])
        record_daemon_event(
            self.config,
            str(task["repository"]),
            "info",
            f"{task['provider'].capitalize()} agent process started in its isolated worktree.",
            task_id=task_id,
        )
        prompt = build_task_prompt(task)
        if recovering:
            prompt = "The previous agent failed to complete this task. Resume the existing work in this worktree; inspect and continue from the current state.\n\n" + prompt
        reply = self._run_task_agent(worktree_path, task, prompt)

        if reply_indicates_failure(reply):
            cancelled = reply_indicates_cancel(reply) or self._refresh_cancel_requested(task)
            return {
                "ok": False,
                "reply": reply,
                "error": CANCELLED_BY_USER if cancelled else reply,
                "cancelled": cancelled,
            }

        if self._refresh_cancel_requested(task):
            return {
                "ok": False,
                "reply": reply,
                "error": CANCELLED_BY_USER,
                "cancelled": True,
                "expected_status": "running",
            }

        update_agent_task(self.config, task_id, "running", {"status": "verifying"})
        try:
            committed = commit_worktree_changes(
                worktree_path, f"Daedalus task {task_id}"
            )
        except RuntimeError as error:
            return {
                "ok": False,
                "reply": reply,
                "error": f"Daemon could not commit the agent worktree changes.\n\n{error}",
                "expected_status": "verifying",
            }
        if committed:
            record_daemon_event(
                self.config,
                str(task["repository"]),
                "info",
                "Daemon committed the agent's completed worktree changes.",
                task_id=task_id,
            )
        commands = verification_commands_for_worktree(
            worktree_path, settings["verificationCommands"]
        )
        command_text = "; ".join(" ".join(command) for command in commands)
        record_daemon_event(
            self.config,
            str(task["repository"]),
            "info",
            "Agent completed; verifying branch"
            + (f" with: {command_text}." if command_text else ". No test command was discovered."),
            task_id=task_id,
        )
        clean = git_output(worktree_path, ["status", "--porcelain"])
        head = git_output(worktree_path, ["rev-parse", "HEAD"])
        if clean:
            return {
                "ok": False,
                "reply": reply,
                "error": "Agent finished with uncommitted worktree changes.",
                "expected_status": "verifying",
            }
        if head == task["base_commit"]:
            return {
                "ok": False,
                "reply": reply,
                "error": "Agent finished without creating a commit.",
                "expected_status": "verifying",
            }

        verification_attempts = int(task.get("verification_attempts") or 0)
        verification = run_verification(worktree_path, commands)
        while not verification["ok"]:
            if self._refresh_cancel_requested(task):
                return {
                    "ok": False,
                    "reply": reply,
                    "error": CANCELLED_BY_USER,
                    "cancelled": True,
                    "expected_status": "verifying",
                }
            verification_attempts += 1
            update_agent_task(self.config, task_id, "verifying", {
                "verification_attempts": verification_attempts,
                "error": verification["output"],
            })
            if verification_attempts >= settings["taskVerificationAttemptLimit"]:
                error = (
                    "Agent unable to complete changes; test suites failed "
                    f"{settings['taskVerificationAttemptLimit']} times.\n\n"
                    f"{verification['output']}"
                )
                return {
                    "ok": False,
                    "reply": reply,
                    "error": error,
                    "expected_status": "verifying",
                }

            next_attempt = verification_attempts + 1
            record_daemon_event(
                self.config,
                str(task["repository"]),
                "warning",
                "Test suite failed; launching agent repair attempt "
                f"{next_attempt}/{settings['taskVerificationAttemptLimit']}.",
                task_id=task_id,
            )
            repair_reply = self._run_task_agent(
                worktree_path,
                task,
                build_task_repair_prompt(
                    task,
                    verification["output"],
                    next_attempt,
                    settings["taskVerificationAttemptLimit"],
                ),
            )
            if reply_indicates_failure(repair_reply):
                cancelled = (
                    reply_indicates_cancel(repair_reply)
                    or self._refresh_cancel_requested(task)
                )
                return {
                    "ok": False,
                    "reply": repair_reply,
                    "error": CANCELLED_BY_USER if cancelled else repair_reply,
                    "cancelled": cancelled,
                    "expected_status": "verifying",
                }
            if self._refresh_cancel_requested(task):
                return {
                    "ok": False,
                    "reply": repair_reply,
                    "error": CANCELLED_BY_USER,
                    "cancelled": True,
                    "expected_status": "verifying",
                }
            reply = repair_reply
            try:
                committed = commit_worktree_changes(
                    worktree_path, f"Daedalus task repair {task_id} attempt {next_attempt}"
                )
            except RuntimeError as error:
                return {
                    "ok": False,
                    "reply": reply,
                    "error": f"Daemon could not commit the agent repair changes.\n\n{error}",
                    "expected_status": "verifying",
                }
            if committed:
                record_daemon_event(
                    self.config,
                    str(task["repository"]),
                    "info",
                    f"Daemon committed repair changes from attempt {next_attempt}.",
                    task_id=task_id,
                )
            verification = run_verification(worktree_path, commands)
        return {
            "ok": True,
            "reply": reply,
            "verification": verification["output"],
            "completed_commit": git_output(worktree_path, ["rev-parse", "HEAD"]),
            "expected_status": "verifying",
        }

    def _run_task_agent(self, worktree_path: str, task: dict, prompt: str) -> str:
        task_id = str(task["id"])
        if task["provider"] == "cursor":
            return self.run_cursor(worktree_path, prompt, False, task_id)
        return self.run_codex(
            worktree_path,
            prompt,
            str(task["model"]),
            str(task["reasoning"]),
            task_id,
        )

    def _run_resolver_agent(
        self, worktree_path: str, task: dict, settings: dict, prompt: str
    ) -> str:
        provider = settings["resolverProvider"]
        if provider == "auto":
            provider = str(task["provider"])

        if provider == "cursor":
            return self.run_cursor(worktree_path, prompt, False, str(task["id"]))

        if settings["resolverProvider"] == "auto":
            model = str(task["model"])
            reasoning = str(task["reasoning"])
        else:
            model = settings["resolverModel"]
            reasoning = settings["resolverReasoning"]
        return self.run_codex(worktree_path, prompt, model, reasoning, str(task["id"]))

    def _finish_tasks(self, tasks: list[dict]) -> None:
        tasks_by_id = {str(task["id"]): task for task in tasks}
        for task_id, future in list(self.task_futures.items()):
            if not future.done():
                continue
            task = tasks_by_id.get(task_id)
            del self.task_futures[task_id]
            if task is None:
                continue
            try:
                outcome = future.result()
            except Exception as error:
                outcome = {"ok": False, "reply": "", "error": str(error)}

            expected = outcome.get("expected_status", task["status"])
            cancelled = bool(
                outcome.get("cancelled")
                or task.get("cancel_requested")
                or reply_indicates_cancel(str(outcome.get("error") or ""))
                or reply_indicates_cancel(str(outcome.get("reply") or ""))
            )
            if cancelled:
                update_agent_task(self.config, task_id, expected, {
                    "status": "cancelled",
                    "result": outcome.get("reply", ""),
                    "error": CANCELLED_BY_USER,
                    "completed_at": utc_now(),
                })
                remove_worktree(
                    str(task["repository"]),
                    str(task.get("worktree_path") or ""),
                    force=True,
                )
                record_daemon_event(
                    self.config,
                    str(task["repository"]),
                    "info",
                    CANCELLED_BY_USER,
                    task_id=task_id,
                )
                continue

            next_status = "ready" if outcome["ok"] else "failed"
            update_agent_task(self.config, task_id, expected, {
                "status": next_status,
                "result": outcome.get("reply", ""),
                "error": outcome.get("error", ""),
                **(
                    {"completed_commit": outcome["completed_commit"]}
                    if outcome.get("completed_commit")
                    else {}
                ),
                **({"completed_at": utc_now()} if not outcome["ok"] else {}),
            })
            if not outcome["ok"]:
                record_daemon_event(
                    self.config,
                    str(task["repository"]),
                    "error",
                    outcome.get("error", "Agent task failed."),
                    task_id=task_id,
                )

    def _start_next_integration(self, repository: str, tasks: list[dict]) -> None:
        if repository in self.integrating_repositories:
            return
        ready = sorted(
            [task for task in tasks if task["status"] == "ready" and not task.get("cancel_requested")],
            key=lambda task: task["queue_sequence"],
        )
        if not ready:
            return
        task = ready[0]
        task_id = str(task["id"])
        claimed = update_agent_task(self.config, task_id, "ready", {
            "status": "integrating", "completed_at": None,
        })
        if not claimed:
            return
        task = {**task, "status": "integrating"}
        self.integrating_repositories[repository] = task_id
        self.integration_futures[task_id] = self.executor.submit(
            self._integrate_task, task, load_worktree_settings()
        )

    def _integration_cancelled(self, task: dict) -> bool:
        task_id = str(task["id"])
        return task_id in self.cancelled_task_ids or self._refresh_cancel_requested(task)

    def _integrate_task(self, task: dict, settings: dict) -> dict:
        task_id = str(task["id"])
        repository = str(task["repository"])
        worktree_path = str(task.get("worktree_path") or "")
        branch_name = str(task.get("branch_name") or "")
        attempts = int(task.get("resolver_attempts") or 0)
        if not retained_task_worktree_valid(repository, worktree_path, branch_name):
            return self._integration_failure(task, "Retained task worktree or branch is unavailable.", attempts)
        try:
            validate_primary_worktree(repository, settings["primaryBranch"])
            integration_base = git_output(repository, ["rev-parse", settings["primaryBranch"]])
        except RuntimeError as error:
            return self._integration_failure(task, str(error), attempts)
        if self._integration_cancelled(task):
            return self._integration_failure(task, CANCELLED_BY_USER, attempts, cancelled=True)

        failure = ""
        if git_output(worktree_path, ["status", "--porcelain"]):
            failure = str(task.get("error") or "Retained integration worktree contains unresolved changes.")
        else:
            merge = run_process(
                worktree_path,
                ["git", "merge", "--no-ff", "--no-edit", settings["primaryBranch"]],
            )
            if merge.returncode != 0:
                failure = format_process_failure(merge.args, merge.stdout, merge.stderr)
        if failure:
            failure, attempts = self._run_resolver_loop(
                task, settings, worktree_path, failure, attempts
            )
            if failure:
                return self._integration_failure(
                    task, failure, attempts, cancelled=self._integration_cancelled(task)
                )

        reconcile_migration_numbers(worktree_path)
        commands = verification_commands_for_worktree(
            worktree_path, settings["verificationCommands"]
        )
        verification = run_verification(worktree_path, commands)
        failure = "" if verification["ok"] else verification["output"]
        if failure:
            failure, attempts = self._run_resolver_loop(
                task, settings, worktree_path, failure, attempts
            )
            if failure:
                return self._integration_failure(
                    task, failure, attempts, cancelled=self._integration_cancelled(task)
                )

        deployment_settings = load_deployment_settings()
        deployment_retryable = False

        def deploy() -> str:
            nonlocal deployment_retryable
            if self._integration_cancelled(task):
                return CANCELLED_BY_USER
            record_migration_deployment_event(
                self.config, repository, "info", "Supabase migration deployment started.",
                task_id=task_id, event_type="migration_deployment_started",
            )
            result = deploy_pending_migrations(
                worktree_path, repository, integration_base, deployment_settings,
                cancelled=lambda: self._integration_cancelled(task),
            )
            deployment_retryable = result.get("retryable", False)
            diagnostics = result.get("diagnostics", [])
            if result["ok"]:
                state = result["state"]
                message = "No pending Supabase migrations." if state == "no_pending" else "Supabase migration deployment succeeded."
                event_type = "migration_deployment_no_pending" if state == "no_pending" else "migration_deployment_succeeded"
                record_migration_deployment_event(
                    self.config, repository, "info", message,
                    task_id=task_id, event_type=event_type,
                )
                return ""
            details = result["error"]
            if diagnostics:
                details += "\n\nDeployment diagnostics:\n" + json.dumps(diagnostics, indent=2)
            record_migration_deployment_event(
                self.config, repository, "error", "Supabase migration deployment blocked: " + details,
                task_id=task_id, event_type="migration_deployment_blocked",
            )
            return details

        failure = deploy()
        if failure and deployment_retryable:
            failure, attempts = self._run_resolver_loop(
                task, settings, worktree_path, failure, attempts,
                post_validation=deploy,
                limit=deployment_settings["resolverAttemptLimit"],
            )
        if failure:
            return self._integration_failure(
                task, failure, attempts, cancelled=self._integration_cancelled(task)
            )
        if self._integration_cancelled(task):
            return self._integration_failure(task, CANCELLED_BY_USER, attempts, cancelled=True)

        primary = settings["primaryBranch"]
        if git_output(repository, ["status", "--porcelain"]):
            return self._integration_failure(task, "Primary worktree became dirty before promotion.", attempts)
        if git_output(repository, ["branch", "--show-current"]) != primary:
            return self._integration_failure(task, f"Primary worktree is no longer on {primary}.", attempts)
        if git_output(repository, ["rev-parse", primary]) != integration_base:
            return self._integration_failure(task, "Primary branch advanced outside the integrator.", attempts)
        promotion = run_process(repository, ["git", "merge", "--ff-only", branch_name])
        if promotion.returncode != 0:
            return self._integration_failure(
                task, format_process_failure(promotion.args, promotion.stdout, promotion.stderr), attempts
            )
        return {
            "ok": True, "attempts": attempts, "expected_status": task["status"],
            "worktree": worktree_path,
        }

    def _integration_failure(
        self, task: dict, error: str, attempts: int, cancelled: bool = False,
    ) -> dict:
        return {
            "ok": False, "error": error, "attempts": attempts,
            "cancelled": cancelled, "expected_status": task["status"],
            "worktree": str(task.get("worktree_path") or ""),
        }

    def _run_resolver_loop(
        self,
        task: dict,
        settings: dict,
        worktree_path: str,
        failure: str,
        attempts: int,
        post_validation=None,
        limit: int | None = None,
    ) -> tuple[str, int]:
        limit = limit or settings["resolverAttemptLimit"]
        while failure and attempts < limit:
            if self._integration_cancelled(task):
                return CANCELLED_BY_USER, attempts
            attempts += 1
            update_agent_task(self.config, str(task["id"]), str(task["status"]), {
                "status": "resolving", "resolver_attempts": attempts, "error": failure,
            })
            task["status"] = "resolving"
            record_daemon_event(
                self.config, str(task["repository"]), "warning",
                f"Resolver attempt {attempts}/{limit} for task {task['id']}.",
                task_id=str(task["id"]),
            )
            resolver_reply = self._run_resolver_agent(
                worktree_path, task, settings, build_resolver_prompt(task, failure)
            )
            if reply_indicates_failure(resolver_reply):
                failure = resolver_reply
                continue
            if self._integration_cancelled(task):
                return CANCELLED_BY_USER, attempts
            try:
                commit_worktree_changes(worktree_path, f"Daedalus resolver attempt {attempts}")
            except RuntimeError as error:
                failure = f"Daemon could not commit resolver changes.\n\n{error}"
                continue
            reconcile_migration_numbers(worktree_path)
            commands = verification_commands_for_worktree(
                worktree_path, settings["verificationCommands"]
            )
            verification = run_verification(worktree_path, commands)
            failure = "" if verification["ok"] else verification["output"]
            if not failure and post_validation is not None:
                failure = post_validation()
        return failure, attempts

    def _finish_integrations(self, tasks: list[dict]) -> bool:
        tasks_by_id = {str(task["id"]): task for task in tasks}
        finished = False
        for task_id, future in list(self.integration_futures.items()):
            if not future.done():
                continue
            finished = True
            del self.integration_futures[task_id]
            task = tasks_by_id.get(task_id)
            repository = next(
                (name for name, active_task_id in self.integrating_repositories.items()
                 if active_task_id == task_id),
                str(task["repository"]) if task else "",
            )
            if repository:
                self.integrating_repositories.pop(repository, None)
            try:
                outcome = future.result()
            except Exception as error:
                outcome = {"ok": False, "error": str(error), "attempts": 0, "expected_status": "integrating"}
            if task is None:
                self.cancelled_task_ids.discard(task_id)
                continue
            if outcome.get("cancelled") or task_id in self.cancelled_task_ids:
                self.cancelled_task_ids.discard(task_id)
                continue
            expected = str(outcome.get("expected_status") or task["status"])
            if not outcome["ok"]:
                update_agent_task(self.config, task_id, expected, {
                    "status": "blocked", "resolver_attempts": outcome.get("attempts", 0),
                    "error": outcome["error"], "completed_at": utc_now(),
                })
                record_daemon_event(
                    self.config, repository, "error",
                    f"Task integration blocked: {outcome['error']}", task_id=task_id,
                )
                continue
            update_agent_task(self.config, task_id, expected, {
                "status": "completed", "resolver_attempts": outcome.get("attempts", 0),
                "error": "", "completed_at": utc_now(),
            })
            record_daemon_event(
                self.config, repository, "info",
                "Task integrated successfully into the repository.", task_id=task_id,
                event_type="task_integrated",
            )
            remove_task_worktree_and_branch(
                repository,
                str(task.get("worktree_path") or ""),
                str(task.get("branch_name") or ""),
            )
        return finished


def load_worktree_settings() -> dict:
    path = WORKTREE_PARAMETER_FILE
    if not path.is_file():
        raise RuntimeError(f"Missing Daedalus worktree parameter file: {path}")
    with path.open("rb") as parameter_file:
        values = tomllib.load(parameter_file)
    commands = values.get("verification_commands", [])
    if not isinstance(commands, list) or any(
        not isinstance(command, list)
        or not command
        or any(not isinstance(argument, str) or not argument for argument in command)
        for command in commands
    ):
        raise RuntimeError("verification_commands must contain non-empty argument arrays.")
    return {
        "maxAgentsPerRepository": positive_int(values, "max_agents_per_repository"),
        "resolverAttemptLimit": positive_int(values, "resolver_attempt_limit"),
        "resolverProvider": str(values.get("resolver_provider", "auto")),
        "resolverModel": str(values.get("resolver_model", "gpt-5.6-terra")),
        "resolverReasoning": str(values.get("resolver_reasoning", "medium")),
        "taskVerificationAttemptLimit": positive_int(
            values, "task_verification_attempt_limit"
        ),
        "cancelKillGraceSeconds": non_negative_number(
            values, "cancel_kill_grace_seconds", 2
        ),
        "primaryBranch": str(values.get("primary_branch", "main")),
        "verificationCommands": commands,
    }


def verification_commands_for_worktree(
    worktree_path: str, configured_commands: list[list[str]]
) -> list[list[str]]:
    if configured_commands:
        return configured_commands

    root = Path(worktree_path)
    commands: list[list[str]] = []
    if package_has_test_script(root / "package.json"):
        commands.append(["npm", "test"])
    if (root / "tests").is_dir():
        commands.append(["python", "-m", "pytest"])

    for child in sorted(root.iterdir()):
        if not child.is_dir() or child.name.startswith("."):
            continue
        if package_has_test_script(child / "package.json"):
            commands.append(["npm", "--prefix", child.name, "test"])
        if (child / "tests").is_dir():
            commands.append(["python", "-m", "pytest", str(child / "tests")])
    return commands


def package_has_test_script(path: Path) -> bool:
    if not path.is_file():
        return False
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    scripts = value.get("scripts") if isinstance(value, dict) else None
    return isinstance(scripts, dict) and isinstance(scripts.get("test"), str)


def positive_int(values: dict, key: str) -> int:
    value = values.get(key)
    if not isinstance(value, int) or value <= 0:
        raise RuntimeError(f"{key} must be a positive integer.")
    return value


def non_negative_number(values: dict, key: str, default: float) -> float:
    if key not in values:
        return float(default)
    value = values.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0:
        raise RuntimeError(f"{key} must be a non-negative number.")
    return float(value)


def create_task_worktree(repository: str, task_id: str, primary_branch: str) -> tuple[str, str, str]:
    validate_primary_worktree(repository, primary_branch)
    base_commit = git_output(repository, ["rev-parse", primary_branch])
    branch_name = f"agent/task-{task_id}"
    worktree_path = str(worktree_root(repository) / f"task-{task_id}")
    process = run_process(repository, ["git", "worktree", "add", "-b", branch_name, worktree_path, base_commit])
    if process.returncode != 0:
        raise RuntimeError(format_process_failure(process.args, process.stdout, process.stderr))
    return base_commit, branch_name, worktree_path


def retained_task_worktree_valid(repository: str, worktree_path: str, branch_name: str) -> bool:
    return (
        Path(worktree_path).is_dir()
        and git_output(worktree_path, ["rev-parse", "--show-toplevel"]) == str(Path(worktree_path).resolve())
        and git_output(worktree_path, ["branch", "--show-current"]) == branch_name
        and git_output(repository, ["show-ref", "--verify", f"refs/heads/{branch_name}"]) != ""
    )


def validate_primary_worktree(repository: str, primary_branch: str) -> None:
    if not (Path(repository) / ".git").exists():
        raise RuntimeError(f"Not a Git repository: {repository}")
    if git_output(repository, ["branch", "--show-current"]) != primary_branch:
        raise RuntimeError(f"Primary worktree must have {primary_branch} checked out.")
    if git_output(repository, ["status", "--porcelain"]):
        raise RuntimeError("Primary worktree must be clean before starting an agent.")


def worktree_root(repository: str) -> Path:
    root = worktree_root_path(repository)
    root.mkdir(parents=True, exist_ok=True)
    return root


def worktree_root_path(repository: str) -> Path:
    return Path(repository).resolve().parent / ".daedalus-worktrees" / Path(repository).name


def remove_worktree(repository: str, worktree_path: str, force: bool = False) -> bool:
    if not worktree_path:
        return True
    arguments = ["git", "worktree", "remove"]
    if force:
        arguments.append("--force")
    arguments.append(worktree_path)
    return run_process(repository, arguments).returncode == 0


def delete_merged_branch(repository: str, branch_name: str) -> bool:
    if not branch_name:
        return True
    return run_process(repository, ["git", "branch", "--delete", branch_name]).returncode == 0


def remove_task_worktree_and_branch(
    repository: str, worktree_path: str, branch_name: str
) -> bool:
    if not remove_worktree(repository, worktree_path):
        return False
    return delete_merged_branch(repository, branch_name)


def is_clean_worktree(worktree_path: str) -> bool:
    return Path(worktree_path).is_dir() and not git_output(
        worktree_path, ["status", "--porcelain"]
    )


def prune_worktrees(repository: str) -> None:
    run_process(repository, ["git", "worktree", "prune"])


def remove_empty_worktree_directories(repository: str) -> None:
    root = worktree_root_path(repository)
    if root.is_dir() and not any(root.iterdir()):
        root.rmdir()
    parent = root.parent
    if parent.is_dir() and not any(parent.iterdir()):
        parent.rmdir()


def commit_worktree_changes(directory: str, message: str) -> bool:
    if not git_output(directory, ["status", "--porcelain"]):
        return False

    add = run_process(directory, ["git", "add", "-A"])
    if add.returncode != 0:
        raise RuntimeError(format_process_failure(add.args, add.stdout, add.stderr))
    commit = run_process(directory, ["git", "commit", "-m", message])
    if commit.returncode != 0:
        raise RuntimeError(format_process_failure(commit.args, commit.stdout, commit.stderr))
    return True


def find_migration_directories(root: Path) -> list[Path]:
    found = []
    for dirpath, dirnames, _filenames in os.walk(root):
        dirnames[:] = [name for name in dirnames if name not in MIGRATION_WALK_SKIP_DIRS]
        current = Path(dirpath)
        if current.name == "migrations":
            found.append(current)
    return sorted(found)


def plan_migration_renames(migrations_dir: Path) -> list[tuple[Path, Path]]:
    entries = []
    for path in sorted(migrations_dir.iterdir()):
        if not path.is_file():
            continue
        match = MIGRATION_FILE_RE.match(path.name)
        if not match:
            continue
        prefix_text = match.group(1)
        rest = match.group(2)
        entries.append((int(prefix_text), prefix_text, rest, path))

    if not entries:
        return []

    by_prefix: dict[int, list[tuple[str, str, Path]]] = {}
    for number, prefix_text, rest, path in entries:
        by_prefix.setdefault(number, []).append((prefix_text, rest, path))

    used = {number for number, _prefix_text, _rest, _path in entries}
    max_number = max(used)
    max_width = max(len(prefix_text) for _number, prefix_text, _rest, _path in entries)
    renames: list[tuple[Path, Path]] = []

    for number in sorted(by_prefix):
        group = by_prefix[number]
        if len(group) <= 1:
            continue
        group = sorted(group, key=lambda item: item[2].name)
        for prefix_text, rest, path in group[1:]:
            width = max(len(prefix_text), max_width)
            candidate = max_number + 1
            while True:
                target = migrations_dir / f"{candidate:0{width}d}_{rest}.sql"
                if candidate not in used and not target.exists():
                    break
                candidate += 1
            used.add(candidate)
            max_number = max(max_number, candidate)
            renames.append((path, target))

    return renames


def reconcile_migration_numbers(worktree_path: str) -> bool:
    changed = False
    for migrations_dir in find_migration_directories(Path(worktree_path)):
        for source, target in plan_migration_renames(migrations_dir):
            source.rename(target)
            changed = True
    if changed:
        commit_worktree_changes(worktree_path, "Daedalus reconcile migration numbers")
    return changed


def run_verification(directory: str, commands: list[list[str]]) -> dict:
    outputs: list[str] = []
    for command in commands:
        process = run_process(directory, command)
        outputs.append(format_process_failure(command, process.stdout, process.stderr))
        if process.returncode != 0:
            return {"ok": False, "output": "\n\n".join(outputs)}
    return {"ok": True, "output": "\n\n".join(outputs)}


def run_process(directory: str, arguments: list[str]):
    return subprocess.run(arguments, cwd=directory, capture_output=True, text=True)


def git_output(directory: str, arguments: list[str]) -> str:
    process = run_process(directory, ["git", *arguments])
    if process.returncode != 0:
        raise RuntimeError(format_process_failure(process.args, process.stdout, process.stderr))
    return process.stdout.strip()


def format_process_failure(arguments, stdout: str, stderr: str) -> str:
    command = " ".join(str(argument) for argument in arguments)
    return f"COMMAND: {command}\nSTDOUT:\n{stdout}\nSTDERR:\n{stderr}".strip()


def build_task_prompt(task: dict) -> str:
    paths = task.get("targeted_feature_paths") or []
    scope = f"\nTargeted feature files: {', '.join(paths)}" if paths else ""
    return (
        f"TASK_MODE: coding\n\n"
        f"{task['prompt']}{scope}\n\n"
        "Work only in this Git worktree. Commit every completed change to the current task branch; "
        "if your sandbox cannot access Git worktree metadata, leave the completed changes for Daedalus to commit. "
        "Do not switch branches, merge other branches, or push a remote."
    )


def build_task_repair_prompt(
    task: dict, failure: str, attempt: int, limit: int
) -> str:
    return (
        "TASK_MODE: coding\n\n"
        "Repair the failing verification suite in this existing isolated Git worktree. "
        "Preserve the original task intent, inspect the current changes and failure details, and make the smallest fix. "
        "Commit every completed change; if your sandbox cannot access Git worktree metadata, leave the completed changes for Daedalus to commit. "
        "Do not switch branches, merge other branches, or push a remote.\n\n"
        f"Original task:\n{task['prompt']}\n\n"
        f"Repair attempt: {attempt}/{limit}\n\n"
        f"Verification failure:\n{failure}"
    )


def build_resolver_prompt(task: dict, failure: str) -> str:
    return (
        "TASK_MODE: integrating\n\n"
        "Resolve the current integration failure while preserving the task's intent. "
        "Inspect the existing worktree state, make the smallest compatible fix, run relevant checks, "
        "and commit the resolution. If your sandbox cannot commit, leave the completed resolution for Daedalus to commit. "
        "Do not switch branches or push. For Supabase deployment failures, modify only migrations confirmed unapplied "
        "or add a corrective migration; never edit an applied migration or invoke migration-history repair.\n\n"
        f"Task goal:\n{task['prompt']}\n\nFailure details:\n{failure}"
    )


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def reply_indicates_failure(reply: str) -> bool:
    return reply.startswith(CANCEL_REPLY_PREFIXES)


def reply_indicates_cancel(reply: str) -> bool:
    return reply.startswith(("Codex was cancelled", "Cursor was cancelled"))
