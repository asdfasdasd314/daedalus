import json
from concurrent.futures import Future, ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
import subprocess
import tomllib
import uuid

from .communications import (
    list_agent_tasks,
    list_orchestration_batches,
    post_agent_chat,
    record_daemon_event,
    update_agent_task,
    upsert_orchestration_batch,
)


DAEDALUS_ROOT = Path(__file__).resolve().parents[3]
WORKTREE_PARAMETER_FILE = (
    DAEDALUS_ROOT / "parameter_files" / "daedalus-git-worktrees.toml"
)


TASK_TERMINAL_STATES = {"completed", "failed", "blocked"}
BATCH_ACTIVE_STATES = {"collecting", "integrating", "resolving"}


class GitWorktreeOrchestrator:
    def __init__(self, config: dict, run_codex, run_cursor):
        self.config = config
        self.run_codex = run_codex
        self.run_cursor = run_cursor
        self.executor = ThreadPoolExecutor(max_workers=32)
        self.task_futures: dict[str, Future] = {}
        self.batch_futures: dict[str, Future] = {}
        self.recovered_persisted_work = False

    def run_cycle(self, _config: dict | None = None) -> None:
        tasks = list_agent_tasks(self.config)
        batches = list_orchestration_batches(self.config)
        if not self.recovered_persisted_work:
            self._recover_interrupted_work(tasks, batches)
            self.recovered_persisted_work = True
            tasks = list_agent_tasks(self.config)
            batches = list_orchestration_batches(self.config)
        self._finish_tasks(tasks)
        self._finish_batches(batches)

        tasks = list_agent_tasks(self.config)
        batches = list_orchestration_batches(self.config)
        repositories = sorted({str(task["repository"]) for task in tasks})

        for repository in repositories:
            repository_tasks = [task for task in tasks if task["repository"] == repository]
            repository_batches = [
                batch for batch in batches if batch["repository"] == repository
            ]
            if any(batch["status"] == "blocked" for batch in repository_batches):
                continue
            if any(
                batch["status"] in {"integrating", "resolving"}
                for batch in repository_batches
            ):
                continue

            try:
                self._admit_tasks(repository, repository_tasks)
                self._collect_and_maybe_integrate(repository, repository_tasks, repository_batches)
            except Exception as error:
                queued = [task for task in repository_tasks if task["status"] == "queued"]
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

    def _recover_interrupted_work(self, tasks: list[dict], batches: list[dict]) -> None:
        interrupted_task_ids: set[str] = set()
        for batch in batches:
            if batch["status"] not in {"integrating", "resolving"}:
                continue
            batch["status"] = "blocked"
            batch["verification_output"] = (
                "Daemon restarted during integration; preserved state requires inspection."
            )
            upsert_orchestration_batch(self.config, batch)
            interrupted_task_ids.update(str(task_id) for task_id in batch["task_ids"])
            record_daemon_event(
                self.config,
                str(batch["repository"]),
                "error",
                batch["verification_output"],
                batch_id=str(batch["id"]),
            )

        for task in tasks:
            task_id = str(task["id"])
            if task_id in interrupted_task_ids and task["status"] == "integrating":
                update_agent_task(self.config, task_id, "integrating", {
                    "status": "blocked",
                    "error": "Daemon restarted during integration.",
                })
            elif task["status"] in {"running", "verifying"}:
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

    def _admit_tasks(self, repository: str, tasks: list[dict]) -> None:
        settings = load_worktree_settings()
        active = [task for task in tasks if task["status"] in {"running", "verifying"}]
        ready = [task for task in tasks if task["status"] == "ready"]
        capacity = settings["maxAgentsPerRepository"] - len(active) - len(ready)
        if capacity <= 0:
            return

        queued = [task for task in tasks if task["status"] == "queued"]
        queued.sort(key=lambda task: task["queue_sequence"])
        for task in queued[:capacity]:
            try:
                base_commit, branch_name, worktree_path = create_task_worktree(
                    repository,
                    str(task["id"]),
                    settings["primaryBranch"],
                )
            except Exception as error:
                update_agent_task(self.config, str(task["id"]), "queued", {
                    "status": "failed",
                    "error": str(error),
                    "completed_at": utc_now(),
                })
                record_daemon_event(
                    self.config, repository, "error", str(error), task_id=str(task["id"])
                )
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
                self._run_task, task, settings
            )

    def _run_task(self, task: dict, settings: dict) -> dict:
        task_id = str(task["id"])
        worktree_path = str(task["worktree_path"])
        record_daemon_event(
            self.config,
            str(task["repository"]),
            "info",
            f"{task['provider'].capitalize()} agent process started in its isolated worktree.",
            task_id=task_id,
        )
        reply = self._run_task_agent(worktree_path, task, build_task_prompt(task))

        if reply.startswith(("Codex failed", "Cursor failed", "Cursor was cancelled")):
            return {"ok": False, "reply": reply, "error": reply}

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
            if repair_reply.startswith(("Codex failed", "Cursor failed", "Cursor was cancelled")):
                return {
                    "ok": False,
                    "reply": repair_reply,
                    "error": repair_reply,
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
            "expected_status": "verifying",
        }

    def _run_task_agent(self, worktree_path: str, task: dict, prompt: str) -> str:
        if task["provider"] == "cursor":
            return self.run_cursor(worktree_path, prompt)
        return self.run_codex(
            worktree_path, prompt, str(task["model"]), str(task["reasoning"])
        )

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
            next_status = "ready" if outcome["ok"] else "failed"
            update_agent_task(self.config, task_id, expected, {
                "status": next_status,
                "result": outcome.get("reply", ""),
                "error": outcome.get("error", ""),
                **({"completed_at": utc_now()} if not outcome["ok"] else {}),
            })
            post_agent_chat(
                self.config,
                task_id,
                str(task["repository"]),
                str(task["prompt"]),
                outcome.get("reply", "") if outcome["ok"] else outcome.get("error", ""),
                str(task["provider"]),
                str(task["model"]),
                str(task["reasoning"]),
                False,
                task.get("targeted_feature_paths") or [],
            )
            if not outcome["ok"]:
                record_daemon_event(
                    self.config,
                    str(task["repository"]),
                    "error",
                    outcome.get("error", "Agent task failed."),
                    task_id=task_id,
                )

    def _collect_and_maybe_integrate(
        self, repository: str, tasks: list[dict], batches: list[dict]
    ) -> None:
        settings = load_worktree_settings()
        collecting = next((batch for batch in batches if batch["status"] == "collecting"), None)
        ready = sorted(
            [task for task in tasks if task["status"] == "ready"],
            key=lambda task: task["queue_sequence"],
        )
        if not ready:
            return

        base_commit = str(ready[0]["base_commit"])
        same_base = [task for task in ready if task["base_commit"] == base_commit]
        if collecting is None:
            batch_id = str(uuid.uuid4())
            collecting = {
                "id": batch_id,
                "repository": repository,
                "base_commit": base_commit,
                "task_ids": [],
                "integration_branch": f"integration/batch-{batch_id}",
                "integration_worktree_path": "",
                "status": "collecting",
                "resolver_attempts": 0,
                "verification_output": "",
                "quiet_since": None,
            }

        selected = same_base[: settings["maxAgentsPerRepository"]]
        task_ids = [str(task["id"]) for task in selected]
        collecting["task_ids"] = task_ids
        running_same_base = any(
            task["status"] in {"running", "verifying"}
            and task.get("base_commit") == base_commit
            for task in tasks
        )
        queued_exists = any(task["status"] == "queued" for task in tasks)
        full = len(task_ids) >= settings["maxAgentsPerRepository"]
        if full:
            should_integrate = True
        elif running_same_base or queued_exists:
            collecting["quiet_since"] = None
            should_integrate = False
        else:
            quiet_since = collecting.get("quiet_since")
            if quiet_since is None:
                collecting["quiet_since"] = utc_now()
                should_integrate = False
            else:
                elapsed = datetime.now(timezone.utc) - datetime.fromisoformat(
                    str(quiet_since).replace("Z", "+00:00")
                )
                should_integrate = elapsed.total_seconds() >= settings["cohortIdleWindowSeconds"]

        upsert_orchestration_batch(self.config, collecting)
        for task in selected:
            if not task.get("batch_id"):
                update_agent_task(self.config, str(task["id"]), "ready", {
                    "status": "ready", "batch_id": str(collecting["id"])
                })
        if should_integrate and str(collecting["id"]) not in self.batch_futures:
            collecting["status"] = "integrating"
            upsert_orchestration_batch(self.config, collecting)
            for task in selected:
                update_agent_task(
                    self.config, str(task["id"]), "ready", {"status": "integrating"}
                )
            self.batch_futures[str(collecting["id"])] = self.executor.submit(
                self._integrate_batch, collecting, selected, settings
            )

    def _integrate_batch(self, batch: dict, tasks: list[dict], settings: dict) -> dict:
        repository = str(batch["repository"])
        batch_id = str(batch["id"])
        worktree_path = create_integration_worktree(
            repository,
            batch_id,
            str(batch["base_commit"]),
            str(batch["integration_branch"]),
        )
        batch["integration_worktree_path"] = worktree_path
        upsert_orchestration_batch(self.config, batch)

        attempts = 0
        for task in tasks:
            merge = run_process(
                worktree_path,
                ["git", "merge", "--no-ff", "--no-edit", str(task["branch_name"])],
            )
            if merge.returncode != 0:
                failure = format_process_failure(merge.args, merge.stdout, merge.stderr)
                failure, attempts = self._run_resolver_loop(
                    batch, tasks, settings, worktree_path, failure, attempts
                )
                if failure:
                    return {"ok": False, "error": failure, "attempts": attempts, "worktree": worktree_path}

        commands = verification_commands_for_worktree(
            worktree_path, settings["verificationCommands"]
        )
        verification = run_verification(worktree_path, commands)
        failure = "" if verification["ok"] else verification["output"]
        if failure:
            failure, attempts = self._run_resolver_loop(
                batch, tasks, settings, worktree_path, failure, attempts
            )
            if failure:
                return {"ok": False, "error": failure, "attempts": attempts, "worktree": worktree_path}

        primary = settings["primaryBranch"]
        if git_output(repository, ["status", "--porcelain"]):
            return {"ok": False, "error": "Primary worktree became dirty before promotion.", "attempts": attempts, "worktree": worktree_path}
        if git_output(repository, ["branch", "--show-current"]) != primary:
            return {"ok": False, "error": f"Primary worktree is no longer on {primary}.", "attempts": attempts, "worktree": worktree_path}
        if git_output(repository, ["rev-parse", primary]) != batch["base_commit"]:
            return {"ok": False, "error": "Primary branch advanced outside the orchestrator.", "attempts": attempts, "worktree": worktree_path}
        promotion = run_process(repository, ["git", "merge", "--ff-only", str(batch["integration_branch"])])
        if promotion.returncode != 0:
            return {"ok": False, "error": format_process_failure(promotion.args, promotion.stdout, promotion.stderr), "attempts": attempts, "worktree": worktree_path}
        return {"ok": True, "attempts": attempts, "worktree": worktree_path}

    def _run_resolver_loop(
        self,
        batch: dict,
        tasks: list[dict],
        settings: dict,
        worktree_path: str,
        failure: str,
        attempts: int,
    ) -> tuple[str, int]:
        limit = settings["resolverAttemptLimit"]
        while failure and attempts < limit:
            attempts += 1
            batch["status"] = "resolving"
            batch["resolver_attempts"] = attempts
            batch["verification_output"] = failure
            upsert_orchestration_batch(self.config, batch)
            record_daemon_event(
                self.config,
                str(batch["repository"]),
                "warning",
                f"Resolver attempt {attempts}/{limit} for batch {batch['id']}.",
                batch_id=str(batch["id"]),
            )
            resolver_reply = self.run_codex(
                worktree_path,
                build_resolver_prompt(batch, tasks, failure),
                str(tasks[0]["model"]),
                str(tasks[0]["reasoning"]),
            )
            if resolver_reply.startswith("Codex failed"):
                failure = resolver_reply
                continue
            try:
                commit_worktree_changes(
                    worktree_path, f"Daedalus resolver attempt {attempts}"
                )
            except RuntimeError as error:
                failure = f"Daemon could not commit resolver changes.\n\n{error}"
                continue
            commands = verification_commands_for_worktree(
                worktree_path, settings["verificationCommands"]
            )
            verification = run_verification(worktree_path, commands)
            failure = "" if verification["ok"] else verification["output"]
        return failure, attempts

    def _finish_batches(self, batches: list[dict]) -> None:
        batches_by_id = {str(batch["id"]): batch for batch in batches}
        for batch_id, future in list(self.batch_futures.items()):
            if not future.done():
                continue
            del self.batch_futures[batch_id]
            batch = batches_by_id.get(batch_id)
            if batch is None:
                continue
            try:
                outcome = future.result()
            except Exception as error:
                outcome = {"ok": False, "error": str(error), "attempts": batch["resolver_attempts"]}
            task_ids = [str(task_id) for task_id in batch["task_ids"]]
            if not outcome["ok"]:
                batch.update({
                    "status": "blocked",
                    "resolver_attempts": outcome.get("attempts", 0),
                    "verification_output": outcome["error"],
                })
                upsert_orchestration_batch(self.config, batch)
                for task_id in task_ids:
                    update_agent_task(self.config, task_id, "integrating", {
                        "status": "blocked", "error": outcome["error"]
                    })
                record_daemon_event(
                    self.config, str(batch["repository"]), "error",
                    f"Batch {batch_id} blocked: {outcome['error']}", batch_id=batch_id
                )
                continue

            batch.update({"status": "completed", "completed_at": utc_now()})
            upsert_orchestration_batch(self.config, batch)
            tasks = list_agent_tasks(self.config)
            for task in tasks:
                if str(task["id"]) not in task_ids:
                    continue
                update_agent_task(self.config, str(task["id"]), "integrating", {
                    "status": "completed", "completed_at": utc_now()
                })
                remove_worktree(str(task["repository"]), str(task["worktree_path"]))
            remove_worktree(str(batch["repository"]), outcome["worktree"])


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
        "cohortIdleWindowSeconds": positive_int(values, "cohort_idle_window_seconds"),
        "resolverAttemptLimit": positive_int(values, "resolver_attempt_limit"),
        "taskVerificationAttemptLimit": positive_int(
            values, "task_verification_attempt_limit"
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


def create_task_worktree(repository: str, task_id: str, primary_branch: str) -> tuple[str, str, str]:
    validate_primary_worktree(repository, primary_branch)
    base_commit = git_output(repository, ["rev-parse", primary_branch])
    branch_name = f"agent/task-{task_id}"
    worktree_path = str(worktree_root(repository) / f"task-{task_id}")
    process = run_process(repository, ["git", "worktree", "add", "-b", branch_name, worktree_path, base_commit])
    if process.returncode != 0:
        raise RuntimeError(format_process_failure(process.args, process.stdout, process.stderr))
    return base_commit, branch_name, worktree_path


def create_integration_worktree(repository: str, batch_id: str, base_commit: str, branch_name: str) -> str:
    path = str(worktree_root(repository) / f"batch-{batch_id}")
    process = run_process(repository, ["git", "worktree", "add", "-b", branch_name, path, base_commit])
    if process.returncode != 0:
        raise RuntimeError(format_process_failure(process.args, process.stdout, process.stderr))
    return path


def validate_primary_worktree(repository: str, primary_branch: str) -> None:
    if not (Path(repository) / ".git").exists():
        raise RuntimeError(f"Not a Git repository: {repository}")
    if git_output(repository, ["branch", "--show-current"]) != primary_branch:
        raise RuntimeError(f"Primary worktree must have {primary_branch} checked out.")
    if git_output(repository, ["status", "--porcelain"]):
        raise RuntimeError("Primary worktree must be clean before starting an agent.")


def worktree_root(repository: str) -> Path:
    root = Path(repository).resolve().parent / ".daedalus-worktrees" / Path(repository).name
    root.mkdir(parents=True, exist_ok=True)
    return root


def remove_worktree(repository: str, worktree_path: str) -> None:
    if not worktree_path:
        return
    run_process(repository, ["git", "worktree", "remove", worktree_path])


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
        f"{task['prompt']}{scope}\n\n"
        "Work only in this Git worktree. Commit every completed change to the current task branch; "
        "if your sandbox cannot access Git worktree metadata, leave the completed changes for Daedalus to commit. "
        "Do not switch branches, merge other branches, or push a remote."
    )


def build_task_repair_prompt(
    task: dict, failure: str, attempt: int, limit: int
) -> str:
    return (
        "Repair the failing verification suite in this existing isolated Git worktree. "
        "Preserve the original task intent, inspect the current changes and failure details, and make the smallest fix. "
        "Commit every completed change; if your sandbox cannot access Git worktree metadata, leave the completed changes for Daedalus to commit. "
        "Do not switch branches, merge other branches, or push a remote.\n\n"
        f"Original task:\n{task['prompt']}\n\n"
        f"Repair attempt: {attempt}/{limit}\n\n"
        f"Verification failure:\n{failure}"
    )


def build_resolver_prompt(batch: dict, tasks: list[dict], failure: str) -> str:
    goals = "\n".join(f"- {task['prompt']}" for task in tasks)
    return (
        "Resolve the current integration failure while preserving every task's intent. "
        "Inspect the existing worktree state, make the smallest compatible fix, run relevant checks, "
        "and commit the resolution. If your sandbox cannot commit, leave the completed resolution for Daedalus to commit. "
        "Do not switch branches or push.\n\n"
        f"Batch goals:\n{goals}\n\nFailure details:\n{failure}"
    )


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()
