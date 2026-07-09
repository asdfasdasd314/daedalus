import json
import os
from pathlib import Path


def load_shared_config() -> dict:
    project_root = Path(__file__).resolve().parents[3]
    config_path = project_root / "shared" / "supabase_config.json"
    shared_config = json.loads(config_path.read_text(encoding="utf-8"))
    env_config = load_env_files([
        project_root / ".env",
        project_root / "local-daemon" / ".env",
    ])

    config = {
        "daemonUserId": get_config_value(env_config, "DAEDALUS_USER_ID", shared_config, "daemonUserId"),
        "pollIntervalMs": shared_config.get("pollIntervalMs", 5000),
        "supabasePublishableKey": get_config_value(
            env_config,
            "SUPABASE_PUBLISHABLE_KEY",
            shared_config,
            "supabasePublishableKey",
        ),
        "supabaseUrl": get_config_value(env_config, "SUPABASE_URL", shared_config, "supabaseUrl"),
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


def get_config_value(
    env_config: dict[str, str],
    env_key: str,
    shared_config: dict,
    shared_key: str,
):
    return (
        os.environ.get(env_key)
        or env_config.get(env_key)
        or shared_config.get(shared_key)
    )
