import os
import tomllib
from pathlib import Path


def load_daemon_config() -> dict:
    project_root = Path(__file__).resolve().parents[3]
    env_config = load_env_files([
        project_root / ".env",
        project_root / "local-daemon" / ".env",
    ])
    parameter_config = load_parameter_file(
        project_root / "parameter_files" / "feature-file-communications-system.toml",
    )

    config = {
        "daemonUserId": get_env_config_value(env_config, "DAEDALUS_USER_ID"),
        "pollIntervalMs": get_poll_interval_ms(parameter_config),
        "supabasePublishableKey": get_env_config_value(env_config, "SUPABASE_PUBLISHABLE_KEY"),
        "supabaseUrl": get_env_config_value(env_config, "SUPABASE_URL"),
    }
    missing_keys = [
        key
        for key in ("daemonUserId", "supabasePublishableKey", "supabaseUrl")
        if not config.get(key)
    ]

    if missing_keys:
        missing_names = ", ".join(missing_keys)
        raise RuntimeError(f"Missing required daemon configuration: {missing_names}")

    return config


def load_parameter_file(path: Path) -> dict:
    if not path.exists():
        raise RuntimeError(f"Missing required daemon parameter file: {path}")

    with path.open("rb") as parameter_file:
        return tomllib.load(parameter_file)


def load_env_files(paths: list[Path]) -> dict[str, str]:
    env_values: dict[str, str] = {}

    for path in paths:
        if not path.exists():
            continue

        for line in path.read_text(encoding="utf-8").splitlines():
            parsed_line = parse_env_line(line)

            if parsed_line is None:
                continue

            key, value = parsed_line
            env_values[key] = value

    return env_values


def parse_env_line(line: str) -> tuple[str, str] | None:
    stripped_line = line.strip()

    if not stripped_line or stripped_line.startswith("#") or "=" not in stripped_line:
        return None

    key, value = stripped_line.split("=", 1)
    key = key.strip()
    value = value.strip().strip('"').strip("'")

    if not key:
        return None

    return key, value


def get_env_config_value(env_config: dict[str, str], env_key: str):
    return os.environ.get(env_key) or env_config.get(env_key)


def get_poll_interval_ms(parameter_config: dict) -> int:
    poll_interval_ms = parameter_config.get("poll_interval_ms")

    if not isinstance(poll_interval_ms, int) or poll_interval_ms <= 0:
        raise RuntimeError(
            "Missing required daemon parameter: poll_interval_ms in "
            "parameter_files/feature-file-communications-system.toml",
        )

    return poll_interval_ms
