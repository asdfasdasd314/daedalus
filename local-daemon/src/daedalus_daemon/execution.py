import os
from pathlib import Path
import signal
import subprocess
import threading
import time
import tomllib

from .communications import claim_feature_execution_run, list_active_feature_execution_runs, update_feature_execution_run
from .scanner import scan_feature_file_projects

TERMINAL_STATUSES = {"completed", "failed", "cancelled"}


def paired_parameter_file_path(feature_file_path: str) -> str:
    normalized = feature_file_path.replace("\\", "/").removeprefix("./")
    if not normalized.startswith("feature_files/") or not normalized.endswith(".md"):
        raise ValueError("Feature path must use feature_files/*.md.")
    return "parameter_files/" + normalized[len("feature_files/"):-3] + ".toml"


def resolve_inside_project(project_root: Path, relative_path: str) -> Path:
    project_root = project_root.resolve()
    normalized = relative_path.replace("\\", "/").removeprefix("./")
    candidate = (project_root / normalized).resolve()
    if candidate == project_root or project_root not in candidate.parents:
        raise ValueError("Requested path must stay inside the selected project.")
    return candidate


def validate_execution_entry_point(project_root: Path, parameter_file: Path) -> tuple[Path, list[str]]:
    with parameter_file.open("rb") as source:
        parsed = tomllib.load(source)
    execution = parsed.get("execution")
    entry_point = execution.get("entry_point") if isinstance(execution, dict) else None
    if not isinstance(entry_point, str) or not entry_point.strip():
        raise ValueError("Parameter file must declare a nonblank [execution] entry_point.")
    normalized_entry_point = entry_point.replace("\\", "/").removeprefix("./")
    resolved_entry_point_file = resolve_inside_project(project_root, normalized_entry_point)
    if not resolved_entry_point_file.is_file():
        raise ValueError("execution.entry_point must name an existing regular file inside the project.")
    return project_root / normalized_entry_point, ["python", normalized_entry_point]


def validate_execution_request(run: dict, scanned_projects: dict[str, list[dict[str, str]]]) -> tuple[Path, Path, Path, list[str]]:
    project_value = run.get("project_directory")
    feature_value = run.get("feature_file_path")
    if not isinstance(project_value, str) or not isinstance(feature_value, str):
        raise ValueError("Run request is missing its project or feature path.")
    project_root = Path(project_value).resolve()
    if str(project_root) not in scanned_projects:
        raise ValueError("Selected project is not a scanner-discovered project root.")
    feature_path = feature_value.replace("\\", "/").removeprefix("./")
    parameter_path = paired_parameter_file_path(feature_path)
    feature_file = resolve_inside_project(project_root, feature_path)
    parameter_file = resolve_inside_project(project_root, parameter_path)
    discovered_features = {entry["path"] for entry in scanned_projects[str(project_root)]}
    if feature_path not in discovered_features or not feature_file.is_file():
        raise ValueError("Selected feature file is no longer available in the scanned project.")
    if not parameter_file.is_file():
        raise ValueError("The selected feature has no paired parameter file.")
    entry_point_file, command = validate_execution_entry_point(project_root, parameter_file)
    return project_root, parameter_file, entry_point_file, command


def append_tail(current: str, chunk: str, limit: int) -> str:
    return (current + chunk)[-limit:]


class FeatureExecutionSupervisor:
    def __init__(self, config: dict):
        self.config = config
        self.processes: dict[str, dict] = {}
        self.reconciled = False

    def run_cycle(self, _config: dict | None = None) -> None:
        active_rows = list_active_feature_execution_runs(self.config)
        if not self.reconciled:
            self._reconcile_restart(active_rows)
            self.reconciled = True
        self._poll_processes({row["id"]: row for row in active_rows})
        self._claim_and_start()

    def _reconcile_restart(self, active_rows: list[dict]) -> None:
        for row in active_rows:
            if row.get("status") == "queued" and row.get("cancel_requested"):
                update_feature_execution_run(self.config, row["id"], "queued", {
                    "status": "cancelled", "error": "Cancelled before daemon launch.",
                    "completed_at": "now",
                })
            if row.get("status") == "running" and row.get("id") not in self.processes:
                update_feature_execution_run(self.config, row["id"], "running", {
                    "status": "failed", "error": "Daemon restarted while this feature run was active.",
                    "completed_at": "now",
                })

    def _claim_and_start(self) -> None:
        run = claim_feature_execution_run(self.config)
        if not run:
            return
        if run.get("cancel_requested"):
            update_feature_execution_run(self.config, run["id"], "running", {
                "status": "cancelled", "error": "Cancelled before daemon launch.",
                "completed_at": "now",
            })
            return
        try:
            project_root, parameter_file, entry_point_file, command = validate_execution_request(
                run, scan_feature_file_projects(),
            )
            process = subprocess.Popen(
                command, cwd=project_root, shell=False, start_new_session=True,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
            )
            tracked = {"process": process, "stdout": "", "stderr": "", "cancelled": False}
            self.processes[run["id"]] = tracked
            self._read_stream(run["id"], "stdout", process.stdout)
            self._read_stream(run["id"], "stderr", process.stderr)
            update_feature_execution_run(self.config, run["id"], "running", {
                "status": "running", "process_id": process.pid,
                "parameter_file_path": str(parameter_file.relative_to(project_root)),
                "entry_point_path": str(entry_point_file.relative_to(project_root)),
                "command": command, "started_at": "now",
            })
        except Exception as error:
            update_feature_execution_run(self.config, run["id"], "running", {
                "status": "failed", "error": str(error), "completed_at": "now",
            })

    def _read_stream(self, run_id: str, key: str, stream) -> None:
        if stream is None:
            return
        limit = self.config["diagnosticTailMaxChars"]
        def read() -> None:
            for chunk in iter(stream.readline, ""):
                tracked = self.processes.get(run_id)
                if tracked is not None:
                    tracked[key] = append_tail(tracked[key], chunk, limit)
            stream.close()
        threading.Thread(target=read, daemon=True).start()

    def _poll_processes(self, active_rows: dict[str, dict]) -> None:
        for run_id, tracked in list(self.processes.items()):
            process = tracked["process"]
            row = active_rows.get(run_id)
            if row and row.get("cancel_requested") and not tracked["cancelled"]:
                tracked["cancelled"] = True
                self._terminate(process)
            exit_code = process.poll()
            if exit_code is None:
                continue
            status = "cancelled" if tracked["cancelled"] else ("completed" if exit_code == 0 else "failed")
            update_feature_execution_run(self.config, run_id, "running", {
                "status": status, "exit_code": exit_code, "stdout_tail": tracked["stdout"],
                "stderr_tail": tracked["stderr"], "completed_at": "now",
            })
            self.processes.pop(run_id, None)

    def _terminate(self, process: subprocess.Popen) -> None:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            return
        deadline = time.time() + self.config["terminationGraceSeconds"]
        while process.poll() is None and time.time() < deadline:
            time.sleep(0.05)
        if process.poll() is None:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
