import json
import logging
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor

DEFAULT_CODEX_MODEL = "gpt-5.5"
DEFAULT_CODEX_REASONING = "medium"
CODEX_PROVIDER = "codex"
CURSOR_PROVIDER = "cursor"
DAEMON_ERROR = "daemon_error"
PARAMETER_FILE_UPDATE_COMMAND = "parameter_file_update"
ENTRY_POINT_UPDATE_COMMAND = "entry_point_update"
PLANNING_PROMPT_PREFIX = """You are in planning mode.

Do not edit files.
Do not run modifying commands.
Just give me a markdown file that outlines your plan to implement my request.
This is NOT the same as a feature file. Feature files may be updated/created as part of the plan, but are not the plan itself.

"""
PLANNING_PROMPT_SUFFIX = f"""Before finalizing the plan, ask the user only about important implementation details that you cannot reasonably infer from the request or repository context.

Questions are optional. Do not ask questions for their own sake; omit them when the plan can proceed with well-reasoned assumptions.

If questions are needed, add this Markdown section at the very bottom of the plan:

```md
## Questions

1. **[question]**:
   - a. [potential answer]
   - b. [potential answer]
   - c. [potential answer]
```

Try to ask at most three questions and never suggest more than three potential answers.

"""
CURSOR_PLANNING_PROMPT_PREFIX = (
    f"{PLANNING_PROMPT_PREFIX.rstrip()}\n\n"
    "Do not try to output the plan to a file.\n\n"
)
ASK_PROMPT_PREFIX = """You are in Ask mode.

Answer the user's project question directly after inspecting the repository as needed.
Do not edit files.
Do not run modifying commands.
Do not perform implementation work or create durable tasks/worktrees.

"""
CURSOR_ASK_PROMPT_PREFIX = ASK_PROMPT_PREFIX
TARGETED_FEATURE_PATH_REGEX = re.compile(r"^feature_files/[A-Za-z0-9._/-]+\.md$")
TARGETED_FEATURES_PROMPT_PREFIX = (
    "The following prompt reqeusts changes relevant to the following feature files: {paths}"
)

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from daedalus_daemon.communications import (
        AGENT_PROMPT_PURPOSE,
        CLIENT_REVIEW,
        DAEMON_COMPLETE,
        DAEMON_SENT_RESPONSE,
        FEATURE_FILE_LOAD_PURPOSE,
        PARAMETER_FILE_LOAD_PURPOSE,
        PARAMETER_FILE_UPDATE_PURPOSE,
        ENTRY_POINT_UPDATE_PURPOSE,
        SupabaseUnavailableError,
        GIT_SYNC_PURPOSE,
        fetch_current_message,
        upsert_agent_output_history,
        post_feature_files,
        post_git_sync_result,
        post_parameter_files,
        update_current_message,
    )
    from daedalus_daemon.config import (
        get_env_config_value,
        load_daemon_config,
        load_env_files,
    )
    from daedalus_daemon.scanner import (
        scan_feature_file_projects,
        scan_parameter_file_projects,
    )
    from daedalus_daemon.orchestrator import GitWorktreeOrchestrator
    from daedalus_daemon.execution import FeatureExecutionSupervisor
else:
    from .communications import (
        AGENT_PROMPT_PURPOSE,
        CLIENT_REVIEW,
        DAEMON_COMPLETE,
        DAEMON_SENT_RESPONSE,
        FEATURE_FILE_LOAD_PURPOSE,
        PARAMETER_FILE_LOAD_PURPOSE,
        PARAMETER_FILE_UPDATE_PURPOSE,
        ENTRY_POINT_UPDATE_PURPOSE,
        SupabaseUnavailableError,
        GIT_SYNC_PURPOSE,
        fetch_current_message,
        upsert_agent_output_history,
        post_feature_files,
        post_git_sync_result,
        post_parameter_files,
        update_current_message,
    )
    from .config import get_env_config_value, load_daemon_config, load_env_files
    from .scanner import scan_feature_file_projects, scan_parameter_file_projects
    from .orchestrator import GitWorktreeOrchestrator
    from .execution import FeatureExecutionSupervisor


ACTIVE_AGENT_PROCESSES: dict[str, subprocess.Popen] = {}
ACTIVE_AGENT_LOCK = threading.Lock()


class DirectPromptSupervisor:
    def __init__(self, config: dict):
        self.config = config
        self.executor = ThreadPoolExecutor(max_workers=1)
        self.active_future: Future | None = None

    def run_cycle(self, _config: dict | None = None) -> None:
        if self.active_future:
            if not self.active_future.done():
                return
            self.active_future.result()

        self.active_future = self.executor.submit(run_agent_prompt_cycle, self.config)


def register_agent_process(task_id: str, process: subprocess.Popen) -> None:
    with ACTIVE_AGENT_LOCK:
        ACTIVE_AGENT_PROCESSES[task_id] = process


def unregister_agent_process(task_id: str, process: subprocess.Popen) -> None:
    with ACTIVE_AGENT_LOCK:
        current = ACTIVE_AGENT_PROCESSES.get(task_id)
        if current is process:
            ACTIVE_AGENT_PROCESSES.pop(task_id, None)


def kill_agent_process(task_id: str, grace_seconds: float = 2.0) -> bool:
    with ACTIVE_AGENT_LOCK:
        process = ACTIVE_AGENT_PROCESSES.get(task_id)
    if process is None or process.poll() is not None:
        return False

    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        return True

    deadline = time.time() + max(0.0, grace_seconds)
    while time.time() < deadline:
        if process.poll() is not None:
            return True
        time.sleep(0.05)

    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    return True


def run_tracked_agent_command(
    task_id: str,
    command: list[str],
    directory: str,
    env: dict[str, str] | None = None,
) -> tuple[int, str, str]:
    process = subprocess.Popen(
        command,
        cwd=directory,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=env,
        start_new_session=True,
    )
    register_agent_process(task_id, process)
    try:
        stdout, stderr = process.communicate()
    finally:
        unregister_agent_process(task_id, process)
    return process.returncode, stdout or "", stderr or ""


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

    try:
        apply_parameter_file_update(update_request)
        projects = scan_projects()
        deliver_projects(config, projects)
    except Exception as error:
        write_message(
            config,
            PARAMETER_FILE_UPDATE_PURPOSE,
            CLIENT_REVIEW,
            build_parameter_file_update_state_message(DAEMON_ERROR, str(error)),
        )
        return

    write_message(
        config,
        PARAMETER_FILE_UPDATE_PURPOSE,
        DAEMON_COMPLETE,
    )


def run_entry_point_update_cycle(
    config: dict,
    read_message=fetch_current_message,
    write_message=update_current_message,
    scan_projects=scan_parameter_file_projects,
    scan_feature_projects=scan_feature_file_projects,
    deliver_projects=post_parameter_files,
) -> None:
    request = parse_entry_point_update_message(read_message(config, ENTRY_POINT_UPDATE_PURPOSE))
    if not request:
        return
    try:
        apply_entry_point_update(request, scan_feature_projects())
        deliver_projects(config, scan_projects())
    except Exception as error:
        write_message(config, ENTRY_POINT_UPDATE_PURPOSE, CLIENT_REVIEW, build_entry_point_update_state_message(DAEMON_ERROR, str(error)))
        return
    write_message(config, ENTRY_POINT_UPDATE_PURPOSE, CLIENT_REVIEW, build_entry_point_update_state_message(DAEMON_COMPLETE))


def run_project_load_cycle(
    config: dict,
    purpose: str,
    read_message,
    write_message,
    scan_projects,
    deliver_projects,
) -> None:
    if read_message(config, purpose) is None:
        return
    projects = scan_projects()
    try:
        deliver_projects(config, projects)
    except Exception as error:
        print(f"Failed to deliver {purpose}: {error}")
        write_message(
            config,
            purpose,
            CLIENT_REVIEW,
            json.dumps({"error": str(error)}),
        )
        return
    write_message(config, purpose, DAEMON_COMPLETE)


def run_agent_prompt_cycle(
    config: dict,
    read_message=fetch_current_message,
    write_message=update_current_message,
    publish_history=None,
    run_codex_prompt=None,
    run_cursor_prompt=None,
    deliver_chat=None,
) -> None:
    message = read_message(config, AGENT_PROMPT_PURPOSE)

    if not isinstance(message, str) or not message.strip():
        return

    prompt_request = parse_agent_prompt_message(message)

    if not prompt_request:
        return

    prompt_id = prompt_request.get("promptId")

    if not isinstance(prompt_id, str) or not prompt_id.strip():
        return

    directory = prompt_request["directory"]
    prompt = prompt_request["prompt"]
    provider = prompt_request.get("provider", CODEX_PROVIDER)
    model = prompt_request.get("model", DEFAULT_CODEX_MODEL)
    reasoning = prompt_request.get("reasoning", DEFAULT_CODEX_REASONING)
    planning_mode = prompt_request.get("planningMode", False) is True
    ask_mode = prompt_request.get("askMode", False) is True
    if ask_mode:
        planning_mode = False
    planning_context = prompt_request.get("planningContext", "") if planning_mode else ""
    planning_answers = prompt_request.get("planningAnswers", []) if planning_mode else []
    targeted_feature_paths = filter_targeted_feature_paths(
        prompt_request.get("targetedFeaturePaths", []),
    )
    mode = "ask" if ask_mode else "planning"
    history_publisher = publish_history or upsert_agent_output_history
    history_args = (
        config, prompt_id, directory, prompt, "", "", provider, model,
        reasoning, mode, targeted_feature_paths,
    )
    if deliver_chat is None:
        history_publisher(*history_args, status="running")
    final_prompt = (
        build_cursor_prompt(
            prompt,
            planning_mode,
            targeted_feature_paths,
            planning_context,
            planning_answers,
            ask_mode=ask_mode,
        )
        if provider == CURSOR_PROVIDER
        else build_codex_prompt(
            prompt,
            planning_mode,
            targeted_feature_paths,
            planning_context,
            planning_answers,
            ask_mode=ask_mode,
        )
    )
    try:
        if provider == CURSOR_PROVIDER:
            reply = (
                run_cursor_exec(directory, final_prompt, planning_mode, ask_mode=ask_mode)
                if run_cursor_prompt is None
                else (
                    run_cursor_prompt(directory, final_prompt, planning_mode, ask_mode)
                    if ask_mode
                    else run_cursor_prompt(directory, final_prompt, planning_mode)
                )
            )
        elif provider == CODEX_PROVIDER:
            reply = (
                run_codex_exec(directory, final_prompt, model, reasoning, ask_mode=ask_mode)
                if run_codex_prompt is None
                else (
                    run_codex_prompt(directory, final_prompt, model, reasoning, ask_mode)
                    if ask_mode
                    else run_codex_prompt(directory, final_prompt, model, reasoning)
                )
            )
        else:
            raise ValueError(f"Unsupported agent provider: {provider}")
    except Exception as error:
        history_publisher(
            config, prompt_id, directory, prompt, "", str(error), provider,
            model, reasoning, mode, targeted_feature_paths, status="failed",
            status_detail=str(error),
        )
        if deliver_chat is None:
            write_message(
                config, AGENT_PROMPT_PURPOSE, CLIENT_REVIEW,
                build_agent_prompt_state_message(prompt_id, DAEMON_SENT_RESPONSE),
            )
        else:
            write_message(config, AGENT_PROMPT_PURPOSE, DAEMON_COMPLETE)
        return

    if deliver_chat is None:
        history_publisher(
            config, prompt_id, directory, prompt, reply, "", provider, model,
            reasoning, mode, targeted_feature_paths, status="completed",
        )
        write_message(
            config, AGENT_PROMPT_PURPOSE, CLIENT_REVIEW,
            build_agent_prompt_state_message(prompt_id, DAEMON_SENT_RESPONSE),
        )
    else:
        legacy_args = (
            config, prompt_id, directory, prompt, reply, provider, model,
            reasoning, planning_mode, targeted_feature_paths,
        )
        if ask_mode:
            deliver_chat(*legacy_args, ask_mode=True)
        else:
            deliver_chat(*legacy_args)
        write_message(config, AGENT_PROMPT_PURPOSE, DAEMON_COMPLETE)


def parse_agent_prompt_message(message: str) -> dict[str, object] | None:
    if not isinstance(message, str):
        return None
    trimmed_message = message.strip()

    if not trimmed_message:
        return None

    try:
        parsed_message = json.loads(trimmed_message)
    except json.JSONDecodeError:
        return None

    if not isinstance(parsed_message, dict):
        return None

    return parsed_message


def parse_parameter_file_update_message(message: str) -> dict[str, object] | None:
    if not isinstance(message, str):
        return None
    trimmed_message = message.strip()

    if not trimmed_message:
        return None

    try:
        parsed_message = json.loads(trimmed_message)
    except json.JSONDecodeError:
        return None

    if not isinstance(parsed_message, dict):
        return None

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


def parse_entry_point_update_message(message: str) -> dict[str, object] | None:
    if not isinstance(message, str) or not message.strip(): return None
    try: payload = json.loads(message)
    except json.JSONDecodeError: return None
    if not isinstance(payload, dict) or payload.get("command") != ENTRY_POINT_UPDATE_COMMAND: return None
    if payload.get("operation") not in {"add", "update", "delete"}: return None
    if not isinstance(payload.get("projectPath"), str) or not isinstance(payload.get("featureFilePath"), str): return None
    if payload["operation"] != "delete" and not isinstance(payload.get("entryPoint"), str): return None
    return payload


def build_entry_point_update_state_message(state: str, error: str = "") -> str:
    payload = {"command": ENTRY_POINT_UPDATE_COMMAND, "state": state}
    if error: payload["error"] = error
    return json.dumps(payload)


def apply_entry_point_update(request: dict[str, object], scanned_projects: dict[str, list[dict[str, str]]]) -> None:
    project_root = Path(str(request["projectPath"])).resolve()
    if str(project_root) not in scanned_projects: raise ValueError("Selected project is not a scanner-discovered project root.")
    feature_path = str(request["featureFilePath"]).replace("\\", "/").removeprefix("./")
    if feature_path not in {entry["path"] for entry in scanned_projects[str(project_root)]}: raise ValueError("Selected feature file is no longer available in the scanned project.")
    if not feature_path.startswith("feature_files/") or not feature_path.endswith(".md"): raise ValueError("Feature path must use feature_files/*.md.")
    parameter_path = "parameter_files/" + feature_path[len("feature_files/"):-3] + ".toml"
    parameter_file = (project_root / parameter_path).resolve()
    if project_root not in parameter_file.parents or not parameter_file.is_file(): raise ValueError("The selected feature has no paired parameter file.")
    entry_point = str(request.get("entryPoint", "")).strip().replace("\\", "/").removeprefix("./")
    if request["operation"] != "delete":
        if not entry_point or entry_point.startswith("/") or re.match(r"^[A-Za-z]:/", entry_point) or any(part in {"", ".", ".."} for part in entry_point.split("/")): raise ValueError("Entry point must be a nonblank project-relative path.")
        target = (project_root / entry_point).resolve()
        if project_root not in target.parents or not target.is_file(): raise ValueError("Entry point must be an existing regular file inside the selected project.")
    update_execution_entry_point_in_toml(parameter_file, str(request["operation"]), entry_point)


def update_execution_entry_point_in_toml(parameter_file: Path, operation: str, entry_point: str) -> None:
    lines = parameter_file.read_text(encoding="utf-8").split("\n")
    section_start = None; section_end = len(lines); entry_index = None; current_section = ""
    for index, line in enumerate(lines):
        section = re.fullmatch(r"\s*\[(.+)\]\s*", line)
        if section:
            if current_section == "execution" and section_end == len(lines): section_end = index
            current_section = section.group(1).strip()
            if current_section == "execution": section_start = index
            continue
        if current_section == "execution" and re.match(r"\s*entry_point\s*=", line): entry_index = index
    if operation == "add" and entry_index is not None: raise ValueError("This feature already has an entry point.")
    if operation in {"update", "delete"} and entry_index is None: raise ValueError("This feature has no saved entry point.")
    if operation == "delete": lines.pop(entry_index)
    elif entry_index is not None:
        prefix_match = re.match(r"^(\s*entry_point\s*=\s*)(.*)$", lines[entry_index])
        _, inline_comment = split_toml_value_and_comment(prefix_match.group(2).strip())
        lines[entry_index] = prefix_match.group(1) + json.dumps(entry_point) + (f" {inline_comment}" if inline_comment else "")
    elif section_start is not None: lines.insert(section_end, f"entry_point = {json.dumps(entry_point)}")
    else:
        if lines and lines[-1] != "": lines.append("")
        lines.extend(["[execution]", f"entry_point = {json.dumps(entry_point)}"])
    parameter_file.write_text("\n".join(lines), encoding="utf-8")


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


def build_git_sync_state_message(request_id: str, state: str) -> str:
    return json.dumps({
        "requestId": request_id,
        "state": state,
    })


def parse_git_sync_message(message: str) -> dict[str, object] | None:
    if not isinstance(message, str):
        return None
    trimmed_message = message.strip()

    if not trimmed_message:
        return None

    try:
        parsed_message = json.loads(trimmed_message)
    except json.JSONDecodeError:
        return None

    if not isinstance(parsed_message, dict):
        return None

    return parsed_message


def run_git_command(
    directory: str,
    command: list[str],
    run_process=subprocess.run,
    include_stdout: bool = False,
) -> dict[str, object]:
    result = run_process(
        command,
        cwd=directory,
        capture_output=True,
        text=True,
    )

    return {
        "command": command,
        "exitCode": result.returncode,
        "stdout": result.stdout if include_stdout else "",
        "stderr": result.stderr if result.returncode != 0 else "",
    }


def build_skipped_push_step(reason: str) -> dict[str, object]:
    return {
        "command": ["git", "push"],
        "exitCode": None,
        "stdout": "",
        "stderr": reason,
        "skipped": True,
    }


def execute_git_sync_operation(
    directory: str,
    operation: str,
    message: str = "",
    run_process=subprocess.run,
) -> tuple[list[dict[str, object]], str]:
    steps: list[dict[str, object]] = []

    if operation == "commit":
        add_step = run_git_command(directory, ["git", "add", "."], run_process)
        steps.append(add_step)

        if add_step["exitCode"] != 0:
            return steps, "failed"

        commit_step = run_git_command(
            directory,
            ["git", "commit", "-m", message],
            run_process,
        )
        steps.append(commit_step)

        if commit_step["exitCode"] != 0:
            return steps, "failed"

        return steps, "success"

    if operation == "sync":
        pull_step = run_git_command(directory, ["git", "pull"], run_process)
        steps.append(pull_step)

        if pull_step["exitCode"] != 0:
            steps.append(
                build_skipped_push_step("Skipped because git pull failed."),
            )
            return steps, "failed"

        push_step = run_git_command(directory, ["git", "push"], run_process)
        steps.append(push_step)

        if push_step["exitCode"] != 0:
            return steps, "failed"

        return steps, "success"

    if operation == "status":
        status_step = run_git_command(
            directory,
            ["git", "status"],
            include_stdout=True,
            run_process=run_process,
        )
        steps.append(status_step)
        return steps, "success" if status_step["exitCode"] == 0 else "failed"

    return steps, "failed"


def run_git_sync_cycle(
    config: dict,
    read_message=fetch_current_message,
    write_message=update_current_message,
    deliver_result=post_git_sync_result,
    run_process=subprocess.run,
) -> None:
    message = read_message(config, GIT_SYNC_PURPOSE)

    if not isinstance(message, str) or not message.strip():
        return

    git_request = parse_git_sync_message(message)

    if not git_request:
        return

    request_id = git_request.get("requestId")

    if not isinstance(request_id, str) or not request_id.strip():
        return

    directory = git_request.get("directory")
    operation = git_request.get("operation")

    if not isinstance(directory, str) or not directory.strip():
        return

    if operation not in {"commit", "sync", "status"}:
        return

    commit_message = ""

    if operation == "commit":
        message_value = git_request.get("message")

        if not isinstance(message_value, str) or not message_value.strip():
            return

        commit_message = message_value

    steps, status = execute_git_sync_operation(
        directory,
        operation,
        commit_message,
        run_process,
    )

    deliver_result(
        config,
        {
            "requestId": request_id,
            "directory": directory,
            "operation": operation,
            "status": status,
            "steps": steps,
        },
    )

    write_message(config, GIT_SYNC_PURPOSE, DAEMON_COMPLETE)


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
    planning_context: str = "",
    planning_answers: list[dict[str, str]] | None = None,
    ask_mode: bool = False,
) -> str:
    prompt_sections: list[str] = []

    if ask_mode:
        prompt_sections.append(ASK_PROMPT_PREFIX.rstrip())
    elif planning_mode:
        prompt_sections.append(PLANNING_PROMPT_PREFIX.rstrip())
        prompt_sections.append(PLANNING_PROMPT_SUFFIX.rstrip())
        refinement_context = build_planning_refinement_context(
            planning_context,
            planning_answers,
        )
        if refinement_context:
            prompt_sections.append(refinement_context)

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


def build_cursor_prompt(
    prompt: str,
    planning_mode: bool,
    targeted_feature_paths: list[str] | None = None,
    planning_context: str = "",
    planning_answers: list[dict[str, str]] | None = None,
    ask_mode: bool = False,
) -> str:
    prompt_sections: list[str] = []

    if ask_mode:
        prompt_sections.append(CURSOR_ASK_PROMPT_PREFIX.rstrip())
    elif planning_mode:
        prompt_sections.append(CURSOR_PLANNING_PROMPT_PREFIX.rstrip())
        prompt_sections.append(PLANNING_PROMPT_SUFFIX.rstrip())
        refinement_context = build_planning_refinement_context(
            planning_context,
            planning_answers,
        )
        if refinement_context:
            prompt_sections.append(refinement_context)

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


def build_planning_refinement_context(
    planning_context: object,
    planning_answers: object,
) -> str:
    sections: list[str] = []

    if isinstance(planning_context, str) and planning_context.strip():
        sections.append(
            "Refine the following current implementation plan using the answers below:\n\n"
            f"{planning_context.strip()}",
        )

    answers: list[str] = []
    if isinstance(planning_answers, list):
        for item in planning_answers:
            if not isinstance(item, dict):
                continue
            question = item.get("question")
            answer = item.get("answer")
            if isinstance(question, str) and isinstance(answer, str):
                answers.append(f"{len(answers) + 1}. {question} — {answer}")

    if answers:
        sections.append(
            "The following questions have been asked alongside their answers:\n\n"
            + "\n".join(answers),
        )

    return "\n\n".join(sections)


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
    task_id: str | None = None,
    ask_mode: bool = False,
) -> str:
    codex_reasoning = map_reasoning_for_codex(reasoning)
    command = [
        "codex",
        "exec",
        "-m",
        model,
        "-c",
        f'model_reasoning_effort="{codex_reasoning}"',
    ]
    if ask_mode:
        command.extend(["--sandbox", "read-only"])
    command.append(prompt)

    try:
        if task_id:
            returncode, stdout, stderr = run_tracked_agent_command(
                task_id, command, directory
            )
        else:
            process = subprocess.run(
                command,
                cwd=directory,
                capture_output=True,
                text=True,
            )
            returncode = process.returncode
            stdout = process.stdout
            stderr = process.stderr
    except Exception as error:
        return f"Codex failed before execution completed.\n\n{error}"

    if returncode == 0:
        return stdout

    if returncode < 0:
        return (
            "Codex was cancelled before execution completed.\n\n"
            f"STDOUT:\n{stdout}\n\n"
            f"STDERR:\n{stderr}"
        )

    return (
        f"Codex failed with exit code {returncode}\n\n"
        f"STDOUT:\n{stdout}\n\n"
        f"STDERR:\n{stderr}"
    )


def resolve_cursor_api_key() -> str | None:
    project_root = Path(__file__).resolve().parents[3]
    env_config = load_env_files([
        project_root / ".env",
        project_root / "local-daemon" / ".env",
    ])
    return get_env_config_value(env_config, "CURSOR_API_KEY")


def is_cursor_plan_mode_unsupported(stderr: str) -> bool:
    return "--mode" in stderr and (
        "unknown option" in stderr.lower() or "unknown argument" in stderr.lower()
    )


def parse_cursor_result(stdout: str, stderr: str) -> str:
    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError:
        return (
            "Cursor returned malformed JSON.\n\n"
            f"STDOUT:\n{stdout}\n\nSTDERR:\n{stderr}"
        )

    result = payload.get("result") if isinstance(payload, dict) else None
    if not isinstance(result, str):
        return (
            "Cursor returned JSON without a result.\n\n"
            f"STDOUT:\n{stdout}\n\nSTDERR:\n{stderr}"
        )

    return result


def parse_cursor_plan_stream(stdout: str, stderr: str) -> str:
    plan = None
    final_result = None

    for line in stdout.splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue

        if not isinstance(event, dict):
            continue

        tool_call = event.get("tool_call")
        if isinstance(tool_call, dict):
            create_plan = tool_call.get("createPlanToolCall")
            if isinstance(create_plan, dict):
                args = create_plan.get("args")
                candidate = args.get("plan") if isinstance(args, dict) else None
                if isinstance(candidate, str) and candidate:
                    plan = candidate

        result = event.get("result")
        if event.get("type") == "result" and isinstance(result, str):
            final_result = result

    if plan is not None:
        return plan

    if final_result is not None:
        return final_result

    return (
        "Cursor planning completed without a native plan or final response.\n\n"
        f"STDOUT:\n{stdout}\n\nSTDERR:\n{stderr}"
    )


def run_cursor_exec(
    directory: str,
    prompt: str,
    planning_mode: bool = False,
    task_id: str | None = None,
    ask_mode: bool = False,
) -> str:
    if shutil.which("agent") is None:
        return (
            "Cursor CLI is unavailable. Install Cursor CLI so the `agent` "
            "executable is available on the daemon PATH."
        )

    env = os.environ.copy()
    cursor_api_key = resolve_cursor_api_key()
    if cursor_api_key:
        env["CURSOR_API_KEY"] = cursor_api_key

    if ask_mode:
        planning_mode = False
    output_format = "stream-json" if planning_mode else "json"
    command = ["agent", "-p", "--output-format", output_format]
    if planning_mode:
        command.extend(["--trust", "--mode=plan"])
    elif not ask_mode:
        command.append("--force")
    command.append(prompt)

    try:
        if task_id:
            returncode, stdout, stderr = run_tracked_agent_command(
                task_id, command, directory, env
            )
        else:
            process = subprocess.run(
                command,
                cwd=directory,
                capture_output=True,
                text=True,
                env=env,
            )
            returncode = process.returncode
            stdout = process.stdout
            stderr = process.stderr
    except Exception as error:
        return f"Cursor failed before execution completed.\n\n{error}"

    if returncode == 0:
        if planning_mode:
            return parse_cursor_plan_stream(stdout, stderr)
        return parse_cursor_result(stdout, stderr)

    if planning_mode and is_cursor_plan_mode_unsupported(stderr):
        fallback_command = [
            "agent", "-p", "--output-format", output_format, "--trust", prompt
        ]
        try:
            if task_id:
                returncode, stdout, stderr = run_tracked_agent_command(
                    task_id, fallback_command, directory, env
                )
            else:
                process = subprocess.run(
                    fallback_command,
                    cwd=directory,
                    capture_output=True,
                    text=True,
                    env=env,
                )
                returncode = process.returncode
                stdout = process.stdout
                stderr = process.stderr
        except Exception as error:
            return f"Cursor failed before execution completed.\n\n{error}"

        if returncode == 0:
            if planning_mode:
                return parse_cursor_plan_stream(stdout, stderr)
            return parse_cursor_result(stdout, stderr)

    if returncode < 0:
        return (
            "Cursor was cancelled before execution completed.\n\n"
            f"STDOUT:\n{stdout}\n\n"
            f"STDERR:\n{stderr}"
        )

    return (
        f"Cursor failed with exit code {returncode}\n\n"
        f"STDOUT:\n{stdout}\n\n"
        f"STDERR:\n{stderr}"
    )


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    config = load_daemon_config()
    orchestrator = GitWorktreeOrchestrator(
        config, run_codex_exec, run_cursor_exec, kill_agent_process
    )
    execution_supervisor = FeatureExecutionSupervisor(config)
    direct_prompt_supervisor = DirectPromptSupervisor(config)

    while True:
        # Durable agent tasks must not wait behind the legacy communications polls.
        # Those polls can be unavailable while the task scheduler is still able to
        # claim queued work and report its lifecycle events.
        if not run_cycle_safely("agent_orchestrator", orchestrator.run_cycle, config):
            time.sleep(config["pollIntervalMs"] / 1000)
            continue

        if not run_cycle_safely("feature_execution", execution_supervisor.run_cycle, config):
            time.sleep(config["pollIntervalMs"] / 1000)
            continue

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

        if not run_cycle_safely("entry_point_update", run_entry_point_update_cycle, config):
            time.sleep(config["pollIntervalMs"] / 1000)
            continue

        if not run_cycle_safely("agent_prompt", direct_prompt_supervisor.run_cycle, config):
            time.sleep(config["pollIntervalMs"] / 1000)
            continue

        if not run_cycle_safely("git_sync", run_git_sync_cycle, config):
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
