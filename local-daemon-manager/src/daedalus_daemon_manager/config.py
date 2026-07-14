import os
import tomllib
from pathlib import Path


def load_manager_config() -> dict:
    repository_root = Path(__file__).resolve().parents[3]
    env_values = load_env_files([
        repository_root / ".env",
        repository_root / "local-daemon" / ".env",
        repository_root / "local-daemon-manager" / ".env",
    ])
    parameters = load_parameter_file(
        repository_root / "parameter_files" / "local-daemon-manager.toml",
    )

    config = {
        "repositoryRoot": repository_root,
        "daemonUserId": environment_value(env_values, "DAEDALUS_USER_ID"),
        "supabaseUrl": environment_value(env_values, "SUPABASE_URL"),
        "supabasePublishableKey": environment_value(
            env_values, "SUPABASE_PUBLISHABLE_KEY",
        ),
        "supabasePollIntervalMs": positive_integer(parameters, "supabase_poll_interval_ms"),
        "managerHeartbeatIntervalMs": positive_integer(parameters, "manager_heartbeat_interval_ms"),
        "heartbeatStaleAfterMs": positive_integer(parameters, "heartbeat_stale_after_ms"),
        "unexpectedExitRestartDelayMs": positive_integer(parameters, "unexpected_exit_restart_delay_ms"),
        "startupStabilityWindowMs": positive_integer(parameters, "startup_stability_window_ms"),
        "childTerminationGraceSeconds": positive_integer(parameters, "child_termination_grace_seconds"),
        "supabaseRequestTimeoutSeconds": positive_integer(parameters, "supabase_request_timeout_seconds"),
    }

    missing = [
        name for name in ("daemonUserId", "supabaseUrl", "supabasePublishableKey")
        if not config[name]
    ]
    if missing:
        raise RuntimeError(f"Missing required manager configuration: {', '.join(missing)}")
    return config


def load_parameter_file(path: Path) -> dict:
    if not path.exists():
        raise RuntimeError(f"Missing required manager parameter file: {path}")
    with path.open("rb") as parameter_file:
        return tomllib.load(parameter_file)


def load_env_files(paths: list[Path]) -> dict[str, str]:
    values: dict[str, str] = {}
    for path in paths:
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, value = stripped.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def environment_value(file_values: dict[str, str], name: str) -> str | None:
    return os.environ.get(name) or file_values.get(name)


def positive_integer(parameters: dict, name: str) -> int:
    value = parameters.get(name)
    if not isinstance(value, int) or value <= 0:
        raise RuntimeError(f"Invalid manager parameter: {name}")
    return value
