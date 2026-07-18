from pathlib import Path
import re
import subprocess
import threading
import tomllib


DAEDALUS_ROOT = Path(__file__).resolve().parents[3]
DEPLOYMENT_PARAMETER_FILE = DAEDALUS_ROOT / "parameter_files" / "supabase-migration-deployment.toml"
MIGRATIONS_RELATIVE_PATH = Path("supabase/migrations")
MIGRATION_FILE_RE = re.compile(r"^(\d+)_(.+)\.sql$")
SECRET_PATTERNS = (
    re.compile(r"(?i)(SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD|password)=([^\s]+)"),
    re.compile(r"(?i)(postgres(?:ql)?://[^:\s]+:)[^@\s]+(@)"),
)
PROJECT_LOCKS: dict[str, threading.Lock] = {}
PROJECT_LOCKS_GUARD = threading.Lock()


def load_deployment_settings(path: Path = DEPLOYMENT_PARAMETER_FILE) -> dict:
    if not path.is_file():
        raise RuntimeError(f"Missing Supabase migration deployment parameter file: {path}")
    with path.open("rb") as parameter_file:
        values = tomllib.load(parameter_file)
    mappings = values.get("allowed_repository_project_mappings", [])
    if not isinstance(mappings, list) or any(
        not isinstance(item, str) or item.count("::") != 1 or not all(item.split("::", 1))
        for item in mappings
    ):
        raise RuntimeError("allowed_repository_project_mappings must contain repository::project-ref strings.")
    timeout = values.get("command_timeout_seconds", 120)
    if isinstance(timeout, bool) or not isinstance(timeout, int) or timeout <= 0:
        raise RuntimeError("command_timeout_seconds must be a positive integer.")
    return {
        "enabled": values.get("enabled", False) is True,
        "allowedMappings": mappings,
        "resolverAttemptLimit": positive_int(values, "resolver_attempt_limit"),
        "commandTimeoutSeconds": timeout,
        "requireDryRun": values.get("require_dry_run", True) is True,
    }


def positive_int(values: dict, key: str) -> int:
    value = values.get(key)
    if not isinstance(value, int) or value <= 0:
        raise RuntimeError(f"{key} must be a positive integer.")
    return value


def migration_files_changed(worktree_path: str, base_commit: str, command_runner=None) -> bool:
    runner = command_runner or run_command
    result = runner(worktree_path, ["git", "diff", "--name-only", f"{base_commit}..HEAD"], 30)
    if result["returncode"] != 0:
        raise RuntimeError(diagnostic_text(result))
    return any(name.strip().startswith("supabase/migrations/") for name in result["stdout"].splitlines())


def validate_migrations(worktree_path: str) -> str:
    migrations = Path(worktree_path) / MIGRATIONS_RELATIVE_PATH
    if not migrations.is_dir():
        return "Missing canonical migration directory: supabase/migrations."
    seen: set[int] = set()
    for path in sorted(migrations.iterdir()):
        if not path.is_file():
            continue
        match = MIGRATION_FILE_RE.match(path.name)
        if not match:
            return f"Invalid migration filename: {path.name}. Expected NNN_description.sql."
        version = int(match.group(1))
        if version in seen:
            return f"Duplicate migration version {version} in supabase/migrations."
        seen.add(version)
    return ""


def project_ref_for_repository(repository: str, mappings: list[str]) -> tuple[str | None, str]:
    """Select the sole configured project for an exactly resolved repository."""
    resolved_repository = str(Path(repository).resolve())
    project_refs = {
        project_ref
        for mapping_repository, project_ref in (mapping.split("::", 1) for mapping in mappings)
        if mapping_repository == resolved_repository
    }
    if not project_refs:
        return None, (
            "No allowlisted Supabase project mapping for resolved repository: "
            f"{resolved_repository}."
        )
    if len(project_refs) > 1:
        return None, (
            "Ambiguous Supabase project mappings for resolved repository: "
            f"{resolved_repository}. Configure exactly one project ref."
        )
    return project_refs.pop(), ""


def project_lock(project_ref: str) -> threading.Lock:
    with PROJECT_LOCKS_GUARD:
        return PROJECT_LOCKS.setdefault(project_ref, threading.Lock())


def deploy_pending_migrations(
    worktree_path: str,
    repository: str,
    base_commit: str,
    settings: dict | None = None,
    command_runner=None,
    cancelled=None,
) -> dict:
    settings = settings or load_deployment_settings()
    runner = command_runner or run_command
    cancelled = cancelled or (lambda: False)
    try:
        changed = migration_files_changed(worktree_path, base_commit, runner)
    except RuntimeError as error:
        return blocked(str(error))
    if not changed:
        return {"ok": True, "state": "no_pending", "diagnostics": []}
    if cancelled():
        return blocked("Deployment cancelled before CLI execution; no push was started.")
    validation_error = validate_migrations(worktree_path)
    if validation_error:
        return blocked(validation_error, retryable=True)
    if not settings["enabled"]:
        return blocked("Automatic deployment is disabled pending Supabase history/schema baseline review.")
    project_ref, mapping_error = project_ref_for_repository(repository, settings["allowedMappings"])
    if mapping_error:
        return blocked(mapping_error)
    diagnostics = []
    with project_lock(project_ref):
        preflight_commands = [["supabase", "migration", "list", "--linked"]]
        if settings["requireDryRun"]:
            preflight_commands.append(["supabase", "db", "push", "--dry-run", "--linked"])
        for command in preflight_commands:
            result = runner(worktree_path, command, settings["commandTimeoutSeconds"])
            diagnostics.append(redact_diagnostic(result))
            if result["returncode"] != 0:
                return blocked("Supabase preflight failed.", diagnostics)
        if not reports_pending_migrations(diagnostics[-1]):
            return {"ok": True, "state": "no_pending", "diagnostics": diagnostics}
        if cancelled():
            return blocked("Cancellation occurred after preflight; no live push was started.", diagnostics)
        result = runner(worktree_path, ["supabase", "db", "push", "--linked"], settings["commandTimeoutSeconds"])
        diagnostics.append(redact_diagnostic(result))
        if cancelled():
            return blocked("Cancellation occurred during Supabase push; remote migration history must be reconciled before retry.", diagnostics)
        if result["returncode"] != 0:
            return blocked("Supabase migration deployment failed.", diagnostics, retryable=True)
    return {"ok": True, "state": "succeeded", "diagnostics": diagnostics}


def run_command(directory: str, command: list[str], timeout_seconds: int) -> dict:
    try:
        process = subprocess.run(command, cwd=directory, capture_output=True, text=True, timeout=timeout_seconds)
        return {"command": command, "returncode": process.returncode, "stdout": process.stdout, "stderr": process.stderr}
    except (OSError, subprocess.TimeoutExpired) as error:
        return {"command": command, "returncode": 1, "stdout": "", "stderr": str(error)}


def redact_diagnostic(result: dict) -> dict:
    return {key: redact(str(result.get(key, ""))) if key in {"stdout", "stderr"} else result.get(key) for key in ("command", "returncode", "stdout", "stderr")}


def redact(value: str) -> str:
    for pattern in SECRET_PATTERNS:
        value = pattern.sub(r"\1[REDACTED]" if pattern.pattern.startswith("(?i)(SUPABASE") else r"\1[REDACTED]\2", value)
    return value[-12000:]


def diagnostic_text(result: dict) -> str:
    diagnostic = redact_diagnostic(result)
    return "COMMAND: " + " ".join(diagnostic["command"]) + "\nSTDOUT:\n" + diagnostic["stdout"] + "\nSTDERR:\n" + diagnostic["stderr"]


def reports_pending_migrations(diagnostic: dict) -> bool:
    output = diagnostic.get("stdout", "") + "\n" + diagnostic.get("stderr", "")
    return bool(re.search(r"(?im)(would apply|applying migration|pending migration)", output))


def blocked(message: str, diagnostics: list[dict] | None = None, retryable: bool = False) -> dict:
    return {"ok": False, "state": "blocked", "error": message, "diagnostics": diagnostics or [], "retryable": retryable}
