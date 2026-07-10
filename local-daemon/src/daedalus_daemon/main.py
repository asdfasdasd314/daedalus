import json
from pathlib import Path
import re
import subprocess
import sys
import time

DEFAULT_CODEX_MODEL = "gpt-5.5"
DEFAULT_CODEX_REASONING = "medium"
DAEMON_ERROR = "daemon_error"
PARAMETER_FILE_UPDATE_COMMAND = "parameter_file_update"
PLANNING_PROMPT_PREFIX = """You are in planning mode.

Do not edit files.
Do not run modifying commands.
Just give me a markdown file that outlines your plan to implement my request.
This is NOT the same as a feature file. Feature files may be updated/created as part of the plan, but are not the plan itself.

"""
TARGETED_FEATURE_PATH_REGEX = re.compile(r"^feature_files/[A-Za-z0-9._/-]+\.md$")
TARGETED_FEATURES_PROMPT_PREFIX = (
    "The following prompt reqeusts changes relevant to the following feature files: {paths}"
)

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from daedalus_daemon.communications import (
        AGENT_PROMPT_PURPOSE,
        CLIENT_LOAD_FEATURE_FILES,
        CLIENT_LOAD_PARAMETER_FILES,
        DAEMON_RECEIVED_MESSAGE,
        DAEMON_SENT_FEATURE_FILES,
        DAEMON_SENT_PARAMETER_FILES,
        DAEMON_SENT_RESPONSE,
        FEATURE_FILE_LOAD_PURPOSE,
        PARAMETER_FILE_LOAD_PURPOSE,
        PARAMETER_FILE_UPDATE_PURPOSE,
        SupabaseUnavailableError,
        fetch_current_message,
        post_agent_chat,
        post_feature_files,
        post_parameter_files,
        update_current_message,
    )
    from daedalus_daemon.config import load_daemon_config
    from daedalus_daemon.scanner import (
        scan_feature_file_projects,
        scan_parameter_file_projects,
    )
else:
    from .communications import (
        AGENT_PROMPT_PURPOSE,
        CLIENT_LOAD_FEATURE_FILES,
        CLIENT_LOAD_PARAMETER_FILES,
        DAEMON_RECEIVED_MESSAGE,
        DAEMON_SENT_FEATURE_FILES,
        DAEMON_SENT_PARAMETER_FILES,
        DAEMON_SENT_RESPONSE,
        FEATURE_FILE_LOAD_PURPOSE,
        PARAMETER_FILE_LOAD_PURPOSE,
        PARAMETER_FILE_UPDATE_PURPOSE,
        SupabaseUnavailableError,
        fetch_current_message,
        post_agent_chat,
        post_feature_files,
        post_parameter_files,
        update_current_message,
    )
    from .config import load_daemon_config
    from .scanner import scan_feature_file_projects, scan_parameter_file_projects


def run_poll_cycle(
    config: dict,
    read_message=fetch_current_message,
    write_message=update_current_message,
    scan_projects=scan_feature_file_projects,
    deliver_projects=post_feature_files,
) -> None:
    run_project_load_cycle(
        config,
        FEATURE_FILE_LOAD_PURPOSE,
        CLIENT_LOAD_FEATURE_FILES,
        DAEMON_SENT_FEATURE_FILES,
        read_message,
        write_message,
        scan_projects,
        deliver_projects,
    )


def run_parameter_file_poll_cycle(
    config: dict,
    read_message=fetch_current_message,
    write_message=update_current_message,
    scan_projects=scan_parameter_file_projects,
    deliver_projects=post_parameter_files,
) -> None:
    run_project_load_cycle(
        config,
        PARAMETER_FILE_LOAD_PURPOSE,
        CLIENT_LOAD_PARAMETER_FILES,
        DAEMON_SENT_PARAMETER_FILES,
        read_message,
        write_message,
        scan_projects,
        deliver_projects,
    )


def run_parameter_file_update_cycle(
    config: dict,
    read_message=fetch_current_message,
    write_message=update_current_message,
    scan_projects=scan_parameter_file_projects,
    deliver_projects=post_parameter_files,
) -> None:
    message = read_message(config, PARAMETER_FILE_UPDATE_PURPOSE)
    update_request = parse_parameter_file_update_message(message)

    if not update_request:
        return

    if update_request.get("state") in {
        DAEMON_RECEIVED_MESSAGE,
        DAEMON_SENT_PARAMETER_FILES,
        DAEMON_ERROR,
    }:
        return

    write_message(
        config,
        PARAMETER_FILE_UPDATE_PURPOSE,
        build_parameter_file_update_state_message(DAEMON_RECEIVED_MESSAGE),
    )

    try:
        apply_parameter_file_update(update_request)
        projects = scan_projects()
        deliver_projects(config, projects)
    except Exception as error:
        write_message(
            config,
            PARAMETER_FILE_UPDATE_PURPOSE,
            build_parameter_file_update_state_message(DAEMON_ERROR, str(error)),
        )
        return

    write_message(
        config,
        PARAMETER_FILE_UPDATE_PURPOSE,
        build_parameter_file_update_state_message(DAEMON_SENT_PARAMETER_FILES),
    )


def run_project_load_cycle(
    config: dict,
    purpose: str,
    client_message: str,
    sent_message: str,
    read_message,
    write_message,
    scan_projects,
    deliver_projects,
) -> None:
    message = read_message(config, purpose)

    if message != client_message:
        return

    write_message(config, purpose, DAEMON_RECEIVED_MESSAGE)
    projects = scan_projects()
    try:
        deliver_projects(config, projects)
    except Exception as error:
        print(f"Failed to deliver {purpose}: {error}")
        return
    write_message(config, purpose, sent_message)


def run_agent_prompt_cycle(
    config: dict,
    read_message=fetch_current_message,
    write_message=update_current_message,
    deliver_chat=post_agent_chat,
    run_codex_prompt=None,
) -> None:
    message = read_message(config, AGENT_PROMPT_PURPOSE)

    if not message.strip():
        return

    prompt_request = parse_agent_prompt_message(message)

    if not prompt_request:
        return

    if prompt_request.get("state") in {DAEMON_RECEIVED_MESSAGE, DAEMON_SENT_RESPONSE}:
        return

    prompt_id = prompt_request.get("promptId")

    if not isinstance(prompt_id, str) or not prompt_id.strip():
        return

    directory = prompt_request["directory"]
    prompt = prompt_request["prompt"]
    provider = prompt_request.get("provider", "codex")
    model = prompt_request.get("model", DEFAULT_CODEX_MODEL)
    reasoning = prompt_request.get("reasoning", DEFAULT_CODEX_REASONING)
    planning_mode = prompt_request.get("planningMode", False)
    targeted_feature_paths = filter_targeted_feature_paths(
        prompt_request.get("targetedFeaturePaths", []),
    )
    final_prompt = build_codex_prompt(prompt, planning_mode, targeted_feature_paths)
    write_message(
        config,
        AGENT_PROMPT_PURPOSE,
        build_agent_prompt_state_message(prompt_id, DAEMON_RECEIVED_MESSAGE),
    )

    if run_codex_prompt is None:
        reply = run_codex_exec(directory, final_prompt, model, reasoning)
    else:
        reply = run_codex_prompt(directory, final_prompt, model, reasoning)

    deliver_chat(
        config,
        prompt_id,
        directory,
        prompt,
        reply,
        provider,
        model,
        reasoning,
        planning_mode,
        targeted_feature_paths,
    )

    current_message = read_message(config, AGENT_PROMPT_PURPOSE)
    current_prompt_request = parse_agent_prompt_message(current_message)

    if (
        current_prompt_request
        and current_prompt_request.get("promptId") == prompt_id
        and current_prompt_request.get("state") == DAEMON_RECEIVED_MESSAGE
    ):
        write_message(
            config,
            AGENT_PROMPT_PURPOSE,
            build_agent_prompt_state_message(prompt_id, DAEMON_SENT_RESPONSE),
        )


def parse_agent_prompt_message(message: str) -> dict[str, object] | None:
    trimmed_message = message.strip()

    if not trimmed_message:
        return None

    if trimmed_message in {DAEMON_RECEIVED_MESSAGE, DAEMON_SENT_RESPONSE}:
        return {"state": trimmed_message}

    try:
        parsed_message = json.loads(trimmed_message)
    except json.JSONDecodeError:
        return None

    if not isinstance(parsed_message, dict):
        return None

    return parsed_message


def parse_parameter_file_update_message(message: str) -> dict[str, object] | None:
    trimmed_message = message.strip()

    if not trimmed_message:
        return None

    try:
        parsed_message = json.loads(trimmed_message)
    except json.JSONDecodeError:
        return None

    if not isinstance(parsed_message, dict):
        return None

    if parsed_message.get("state") in {DAEMON_RECEIVED_MESSAGE, DAEMON_SENT_PARAMETER_FILES, DAEMON_ERROR}:
        return parsed_message

    if parsed_message.get("command") != PARAMETER_FILE_UPDATE_COMMAND:
        return None

    for field_name in ("projectPath", "path", "variableName", "value"):
        if not isinstance(parsed_message.get(field_name), str):
            return None

    return parsed_message


def build_parameter_file_update_state_message(state: str, error: str = "") -> str:
    payload = {
        "command": PARAMETER_FILE_UPDATE_COMMAND,
        "state": state,
    }

    if error:
        payload["error"] = error

    return json.dumps(payload)


def apply_parameter_file_update(update_request: dict[str, object]) -> None:
    project_path = str(update_request["projectPath"])
    parameter_path = str(update_request["path"])
    variable_name = str(update_request["variableName"])
    value = str(update_request["value"])

    if not parameter_path.startswith("parameter_files/") or not parameter_path.endswith(".toml"):
        raise ValueError("Only parameter_files/*.toml can be edited.")

    project_root = Path(project_path).resolve()
    absolute_path = (project_root / parameter_path).resolve()

    if absolute_path != project_root and project_root not in absolute_path.parents:
        raise ValueError("Parameter file path must stay inside the selected project.")

    current_toml = absolute_path.read_text(encoding="utf-8")
    updated_toml = update_parameter_variable_in_toml(current_toml, variable_name, value)
    absolute_path.write_text(updated_toml, encoding="utf-8")


def update_parameter_variable_in_toml(toml: str, variable_name: str, draft_value: str) -> str:
    lines = toml.split("\n")
    current_section = ""

    for index, line in enumerate(lines):
        trimmed_line = line.strip()

        if not trimmed_line or trimmed_line.startswith("#"):
            continue

        section_match = re.fullmatch(r"\[(.+)\]", trimmed_line)

        if section_match:
            current_section = section_match.group(1).strip()
            continue

        assignment_match = re.match(r"^(\s*([A-Za-z0-9_.-]+)\s*=\s*)(.+)$", line)

        if not assignment_match:
            continue

        key = assignment_match.group(2).strip()
        full_name = f"{current_section}.{key}" if current_section else key

        if full_name != variable_name:
            continue

        value_text, inline_comment = split_toml_value_and_comment(
            assignment_match.group(3).strip(),
        )
        serialized_value = serialize_parameter_value(value_text, draft_value)
        lines[index] = (
            assignment_match.group(1)
            + serialized_value
            + (f" {inline_comment}" if inline_comment else "")
        )
        return "\n".join(lines)

    raise ValueError(f'Variable "{variable_name}" was not found in this parameter file.')


def split_toml_value_and_comment(value_text: str) -> tuple[str, str]:
    in_single_quote = False
    in_double_quote = False

    for index, character in enumerate(value_text):
        previous_character = value_text[index - 1] if index > 0 else ""

        if character == '"' and not in_single_quote and previous_character != "\\":
            in_double_quote = not in_double_quote
            continue

        if character == "'" and not in_double_quote:
            in_single_quote = not in_single_quote
            continue

        if character == "#" and not in_single_quote and not in_double_quote:
            return value_text[:index].strip(), value_text[index:].strip()

    return value_text.strip(), ""


def serialize_parameter_value(current_value: str, draft_value: str) -> str:
    trimmed_draft = draft_value.strip()

    if is_toml_string(current_value):
        return json.dumps(draft_value)

    if current_value in {"true", "false"}:
        if trimmed_draft not in {"true", "false"}:
            raise ValueError("Booleans must be either true or false.")

        return trimmed_draft

    if re.fullmatch(r"[+-]?\d+", current_value):
        if not re.fullmatch(r"[+-]?\d+", trimmed_draft):
            raise ValueError("Integers must be whole numbers.")

        return trimmed_draft

    if is_toml_float(current_value):
        if not is_toml_float(trimmed_draft):
            raise ValueError("Floats must be valid numbers.")

        return trimmed_draft

    if current_value.startswith("[") and current_value.endswith("]"):
        if not trimmed_draft.startswith("[") or not trimmed_draft.endswith("]"):
            raise ValueError("Arrays must stay in TOML array form.")

        return trimmed_draft

    raise ValueError("This TOML value shape is not editable yet.")


def is_toml_string(value: str) -> bool:
    return (
        (value.startswith('"') and value.endswith('"'))
        or (value.startswith("'") and value.endswith("'"))
    )


def is_toml_float(value: str) -> bool:
    return bool(
        re.fullmatch(
            r"[+-]?((\d+\.\d*)|(\d*\.\d+)|(\d+e[+-]?\d+)|(\d+\.\d*e[+-]?\d+)|(\d*\.\d+e[+-]?\d+))",
            value,
            re.IGNORECASE,
        ),
    )


def build_agent_prompt_state_message(prompt_id: str, state: str) -> str:
    return json.dumps({
        "promptId": prompt_id,
        "state": state,
    })


def filter_targeted_feature_paths(targeted_feature_paths: object) -> list[str]:
    if not isinstance(targeted_feature_paths, list):
        return []

    clean_paths: list[str] = []
    seen_paths: set[str] = set()

    for candidate in targeted_feature_paths:
        if not isinstance(candidate, str):
            continue

        normalized_path = candidate.strip()

        if normalized_path in seen_paths:
            continue

        if not TARGETED_FEATURE_PATH_REGEX.fullmatch(normalized_path):
            continue

        if ".." in normalized_path.split("/"):
            continue

        seen_paths.add(normalized_path)
        clean_paths.append(normalized_path)

    return clean_paths


def build_codex_prompt(
    prompt: str,
    planning_mode: bool,
    targeted_feature_paths: list[str] | None = None,
) -> str:
    prompt_sections: list[str] = []

    if planning_mode:
        prompt_sections.append(PLANNING_PROMPT_PREFIX.rstrip())

    if targeted_feature_paths:
        prompt_sections.append(
            TARGETED_FEATURES_PROMPT_PREFIX.format(
                paths=", ".join(targeted_feature_paths),
            ),
        )

    if not prompt_sections:
        return prompt

    prompt_prefix = "\n\n".join(prompt_sections)
    return f"{prompt_prefix}\n\n{prompt}"


def map_reasoning_for_codex(reasoning: str) -> str:
    if reasoning == "light":
        return "low"
    if reasoning == "extra-high":
        return "xhigh"
    if reasoning == "ultra":
        return "max"

    return reasoning



def run_codex_exec(
    directory: str,
    prompt: str,
    model: str = DEFAULT_CODEX_MODEL,
    reasoning: str = DEFAULT_CODEX_REASONING,
) -> str:
    codex_reasoning = map_reasoning_for_codex(reasoning)

    try:
        process = subprocess.run(
            [
                "codex",
                "exec",
                "-m",
                model,
                "-c",
                f'model_reasoning_effort="{codex_reasoning}"',
                prompt,
            ],
            cwd=directory,
            capture_output=True,
            text=True,
        )
    except Exception as error:
        return f"Codex failed before execution completed.\n\n{error}"

    if process.returncode == 0:
        return process.stdout

    return (
        f"Codex failed with exit code {process.returncode}\n\n"
        f"STDOUT:\n{process.stdout}\n\n"
        f"STDERR:\n{process.stderr}"
    )


def main() -> None:
    config = load_daemon_config()

    while True:
        if not run_cycle_safely("feature_file_load", run_poll_cycle, config):
            time.sleep(config["pollIntervalMs"] / 1000)
            continue

        if not run_cycle_safely(
            "parameter_file_load",
            run_parameter_file_poll_cycle,
            config,
        ):
            time.sleep(config["pollIntervalMs"] / 1000)
            continue

        if not run_cycle_safely(
            "parameter_file_update",
            run_parameter_file_update_cycle,
            config,
        ):
            time.sleep(config["pollIntervalMs"] / 1000)
            continue

        if not run_cycle_safely("agent_prompt", run_agent_prompt_cycle, config):
            time.sleep(config["pollIntervalMs"] / 1000)
            continue

        time.sleep(config["pollIntervalMs"] / 1000)


def run_cycle_safely(cycle_name: str, cycle_runner, config: dict) -> bool:
    try:
        cycle_runner(config)
        return True
    except SupabaseUnavailableError as error:
        cooldown_ms = config.get("networkOutageCooldownMs", 15000)
        print(
            f"Daemon cycle paused for {cycle_name}: Supabase unavailable: {error}. "
            f"Waiting {cooldown_ms}ms before retrying.",
        )
        time.sleep(cooldown_ms / 1000)
        return False
    except Exception as error:
        print(f"Daemon cycle failed for {cycle_name}: {error}")
        return True


if __name__ == "__main__":
    main()
