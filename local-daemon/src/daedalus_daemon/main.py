import json
from pathlib import Path
import subprocess
import sys
import time

DEFAULT_CODEX_MODEL = "gpt-5.5"
DEFAULT_CODEX_REASONING = "medium"
PLANNING_PROMPT_PREFIX = """You are in planning mode.

Do not edit files.
Do not run modifying commands.
Just give me a markdown file that outlines your plan to implement my request.
This is NOT the same as a feature file. Feature files may be updated/created as part of the plan, but are not the plan itself.

"""

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from daedalus_daemon.communications import (
        AGENT_PROMPT_PURPOSE,
        CLIENT_LOAD_FEATURE_FILES,
        DAEMON_RECEIVED_MESSAGE,
        DAEMON_SENT_FEATURE_FILES,
        DAEMON_SENT_RESPONSE,
        FEATURE_FILE_LOAD_PURPOSE,
        fetch_current_message,
        post_agent_chat,
        post_feature_files,
        update_current_message,
    )
    from daedalus_daemon.config import load_shared_config
    from daedalus_daemon.scanner import scan_feature_file_projects
else:
    from .communications import (
        AGENT_PROMPT_PURPOSE,
        CLIENT_LOAD_FEATURE_FILES,
        DAEMON_RECEIVED_MESSAGE,
        DAEMON_SENT_FEATURE_FILES,
        DAEMON_SENT_RESPONSE,
        FEATURE_FILE_LOAD_PURPOSE,
        fetch_current_message,
        post_agent_chat,
        post_feature_files,
        update_current_message,
    )
    from .config import load_shared_config
    from .scanner import scan_feature_file_projects


def run_poll_cycle(
    config: dict,
    read_message=fetch_current_message,
    write_message=update_current_message,
    scan_projects=scan_feature_file_projects,
    deliver_projects=post_feature_files,
) -> None:
    message = read_message(config, FEATURE_FILE_LOAD_PURPOSE)

    if message != CLIENT_LOAD_FEATURE_FILES:
        return

    write_message(config, FEATURE_FILE_LOAD_PURPOSE, DAEMON_RECEIVED_MESSAGE)
    projects = scan_projects()
    deliver_projects(config, projects)
    write_message(config, FEATURE_FILE_LOAD_PURPOSE, DAEMON_SENT_FEATURE_FILES)


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

    if message in {DAEMON_RECEIVED_MESSAGE, DAEMON_SENT_RESPONSE}:
        return

    prompt_request = json.loads(message)
    directory = prompt_request["directory"]
    prompt = prompt_request["prompt"]
    provider = prompt_request.get("provider", "codex")
    model = prompt_request.get("model", DEFAULT_CODEX_MODEL)
    reasoning = prompt_request.get("reasoning", DEFAULT_CODEX_REASONING)
    planning_mode = prompt_request.get("planningMode", False)
    final_prompt = build_codex_prompt(prompt, planning_mode)
    write_message(config, AGENT_PROMPT_PURPOSE, DAEMON_RECEIVED_MESSAGE)

    if run_codex_prompt is None:
        reply = run_codex_exec(directory, final_prompt, model, reasoning)
    else:
        reply = run_codex_prompt(directory, final_prompt, model, reasoning)

    deliver_chat(config, directory, prompt, reply, provider, model, reasoning, planning_mode)
    write_message(config, AGENT_PROMPT_PURPOSE, DAEMON_SENT_RESPONSE)


def build_codex_prompt(prompt: str, planning_mode: bool) -> str:
    if not planning_mode:
        return prompt

    return f"{PLANNING_PROMPT_PREFIX}{prompt}"


def map_reasoning_for_codex(reasoning: str) -> str:
    if reasoning == "extra-high":
        return "xhigh"

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
    config = load_shared_config()

    while True:
        run_poll_cycle(config)
        run_agent_prompt_cycle(config)
        time.sleep(config["pollIntervalMs"] / 1000)


if __name__ == "__main__":
    main()
