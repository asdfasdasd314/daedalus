import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from daedalus_daemon import (
    AGENT_PROMPT_PURPOSE,
    CLIENT_LOAD_FEATURE_FILES,
    CLIENT_LOAD_PARAMETER_FILES,
    DAEMON_RECEIVED_MESSAGE,
    DAEMON_SENT_FEATURE_FILES,
    DAEMON_SENT_PARAMETER_FILES,
    DAEMON_SENT_RESPONSE,
    FEATURE_FILE_LOAD_PURPOSE,
    PARAMETER_FILE_LOAD_PURPOSE,
    run_agent_prompt_cycle,
    run_codex_exec,
    run_parameter_file_poll_cycle,
    run_poll_cycle,
)
from daedalus_daemon.main import (
    PLANNING_PROMPT_PREFIX,
    TARGETED_FEATURES_PROMPT_PREFIX,
    build_agent_prompt_state_message,
    build_codex_prompt,
    filter_targeted_feature_paths,
)


class RunPollCycleTests(unittest.TestCase):
    def test_handles_client_load_message(self):
        writes: list[tuple[str, str]] = []
        deliveries: list[dict[str, list[dict[str, str]]]] = []

        def fake_read_message(_config, purpose):
            self.assertEqual(purpose, FEATURE_FILE_LOAD_PURPOSE)
            return CLIENT_LOAD_FEATURE_FILES

        def fake_write_message(_config, purpose, message):
            writes.append((purpose, message))

        def fake_scan_projects():
            return {
                "/workspace/project": [
                    {
                        "path": "feature_files/alpha.md",
                        "markdown": "alpha",
                    },
                ],
            }

        def fake_deliver_projects(_config, projects):
            deliveries.append(projects)

        run_poll_cycle(
            {"pollIntervalMs": 5000},
            read_message=fake_read_message,
            write_message=fake_write_message,
            scan_projects=fake_scan_projects,
            deliver_projects=fake_deliver_projects,
        )

        self.assertEqual(
            writes,
            [
                (FEATURE_FILE_LOAD_PURPOSE, DAEMON_RECEIVED_MESSAGE),
                (FEATURE_FILE_LOAD_PURPOSE, DAEMON_SENT_FEATURE_FILES),
            ],
        )
        self.assertEqual(
            deliveries,
            [{
                "/workspace/project": [
                    {
                        "path": "feature_files/alpha.md",
                        "markdown": "alpha",
                    },
                ],
            }],
        )

    def test_ignores_non_client_messages(self):
        writes: list[tuple[str, str]] = []
        deliveries: list[dict[str, list[dict[str, str]]]] = []

        def fake_read_message(_config, purpose):
            self.assertEqual(purpose, FEATURE_FILE_LOAD_PURPOSE)
            return DAEMON_RECEIVED_MESSAGE

        def fake_write_message(_config, purpose, message):
            writes.append((purpose, message))

        def fake_scan_projects():
            raise AssertionError("scan should not run")

        def fake_deliver_projects(_config, projects):
            deliveries.append(projects)

        run_poll_cycle(
            {"pollIntervalMs": 5000},
            read_message=fake_read_message,
            write_message=fake_write_message,
            scan_projects=fake_scan_projects,
            deliver_projects=fake_deliver_projects,
        )

        self.assertEqual(writes, [])
        self.assertEqual(deliveries, [])


class RunParameterFilePollCycleTests(unittest.TestCase):
    def test_handles_client_load_message(self):
        writes: list[tuple[str, str]] = []
        deliveries: list[dict[str, list[dict[str, str]]]] = []

        def fake_read_message(_config, purpose):
            self.assertEqual(purpose, PARAMETER_FILE_LOAD_PURPOSE)
            return CLIENT_LOAD_PARAMETER_FILES

        def fake_write_message(_config, purpose, message):
            writes.append((purpose, message))

        def fake_scan_projects():
            return {
                "/workspace/project": [
                    {
                        "path": "parameter_files/alpha.toml",
                        "toml": "alpha = 1",
                    },
                ],
            }

        def fake_deliver_projects(_config, projects):
            deliveries.append(projects)

        run_parameter_file_poll_cycle(
            {"pollIntervalMs": 5000},
            read_message=fake_read_message,
            write_message=fake_write_message,
            scan_projects=fake_scan_projects,
            deliver_projects=fake_deliver_projects,
        )

        self.assertEqual(
            writes,
            [
                (PARAMETER_FILE_LOAD_PURPOSE, DAEMON_RECEIVED_MESSAGE),
                (PARAMETER_FILE_LOAD_PURPOSE, DAEMON_SENT_PARAMETER_FILES),
            ],
        )
        self.assertEqual(
            deliveries,
            [{
                "/workspace/project": [
                    {
                        "path": "parameter_files/alpha.toml",
                        "toml": "alpha = 1",
                    },
                ],
            }],
        )

    def test_ignores_non_client_messages(self):
        writes: list[tuple[str, str]] = []
        deliveries: list[dict[str, list[dict[str, str]]]] = []

        def fake_read_message(_config, purpose):
            self.assertEqual(purpose, PARAMETER_FILE_LOAD_PURPOSE)
            return DAEMON_RECEIVED_MESSAGE

        def fake_write_message(_config, purpose, message):
            writes.append((purpose, message))

        def fake_scan_projects():
            raise AssertionError("scan should not run")

        def fake_deliver_projects(_config, projects):
            deliveries.append(projects)

        run_parameter_file_poll_cycle(
            {"pollIntervalMs": 5000},
            read_message=fake_read_message,
            write_message=fake_write_message,
            scan_projects=fake_scan_projects,
            deliver_projects=fake_deliver_projects,
        )

        self.assertEqual(writes, [])
        self.assertEqual(deliveries, [])

    def test_keeps_running_when_delivery_fails(self):
        writes: list[tuple[str, str]] = []

        def fake_read_message(_config, purpose):
            self.assertEqual(purpose, PARAMETER_FILE_LOAD_PURPOSE)
            return CLIENT_LOAD_PARAMETER_FILES

        def fake_write_message(_config, purpose, message):
            writes.append((purpose, message))

        def fake_scan_projects():
            return {
                "/workspace/project": [
                    {
                        "path": "parameter_files/alpha.toml",
                        "toml": "alpha = 1",
                    },
                ],
            }

        def fake_deliver_projects(_config, _projects):
            raise RuntimeError("HTTP Error 404: Not Found")

        run_parameter_file_poll_cycle(
            {"pollIntervalMs": 5000},
            read_message=fake_read_message,
            write_message=fake_write_message,
            scan_projects=fake_scan_projects,
            deliver_projects=fake_deliver_projects,
        )

        self.assertEqual(
            writes,
            [
                (PARAMETER_FILE_LOAD_PURPOSE, DAEMON_RECEIVED_MESSAGE),
            ],
        )


class BuildCodexPromptTests(unittest.TestCase):
    def test_returns_raw_prompt_for_empty_targeted_feature_list(self):
        self.assertEqual(
            build_codex_prompt("Build the feature", False, []),
            "Build the feature",
        )

    def test_builds_planning_only_prompt(self):
        self.assertEqual(
            build_codex_prompt("Build the feature", True, []),
            f"{PLANNING_PROMPT_PREFIX}Build the feature",
        )

    def test_builds_targeted_only_prompt(self):
        targeted_paths = [
            "feature_files/agent-prompt-chat.md",
            "feature_files/feature-file-graph-display.md",
        ]

        self.assertEqual(
            build_codex_prompt("Build the feature", False, targeted_paths),
            (
                TARGETED_FEATURES_PROMPT_PREFIX.format(
                    paths=", ".join(targeted_paths),
                )
                + "\n\nBuild the feature"
            ),
        )

    def test_builds_planning_then_targeted_then_raw_prompt(self):
        targeted_paths = ["feature_files/agent-prompt-chat.md"]

        self.assertEqual(
            build_codex_prompt("Build the feature", True, targeted_paths),
            (
                f"{PLANNING_PROMPT_PREFIX.rstrip()}\n\n"
                f"{TARGETED_FEATURES_PROMPT_PREFIX.format(paths=targeted_paths[0])}\n\n"
                "Build the feature"
            ),
        )


class FilterTargetedFeaturePathsTests(unittest.TestCase):
    def test_keeps_only_valid_feature_file_paths(self):
        self.assertEqual(
            filter_targeted_feature_paths([
                "feature_files/agent-prompt-chat.md",
                " feature_files/feature-file-graph-display.md ",
                "../feature_files/nope.md",
                "feature_files/../../escape.md",
                "notes/other.md",
                42,
                "feature_files/agent-prompt-chat.md",
            ]),
            [
                "feature_files/agent-prompt-chat.md",
                "feature_files/feature-file-graph-display.md",
            ],
        )


class RunAgentPromptCycleTests(unittest.TestCase):
    def test_ignores_empty_prompt_message(self):
        writes: list[tuple[str, str]] = []
        deliveries: list[tuple[str, str, str, str, str, str, str, bool, list[str]]] = []

        def fake_read_message(_config, purpose):
            self.assertEqual(purpose, AGENT_PROMPT_PURPOSE)
            return ""

        def fake_write_message(_config, purpose, message):
            writes.append((purpose, message))

        def fake_deliver_chat(
            _config,
            prompt_id,
            directory,
            prompt,
            reply,
            provider,
            model,
            reasoning,
            planning_mode,
            targeted_feature_paths,
        ):
            deliveries.append(
                (
                    prompt_id,
                    directory,
                    prompt,
                    reply,
                    provider,
                    model,
                    reasoning,
                    planning_mode,
                    targeted_feature_paths,
                ),
            )

        def fake_run_codex_prompt(_directory, _prompt, _model, _reasoning):
            raise AssertionError("codex should not run")

        run_agent_prompt_cycle(
            {"pollIntervalMs": 5000},
            read_message=fake_read_message,
            write_message=fake_write_message,
            deliver_chat=fake_deliver_chat,
            run_codex_prompt=fake_run_codex_prompt,
        )

        self.assertEqual(writes, [])
        self.assertEqual(deliveries, [])

    def test_ignores_daemon_status_messages(self):
        writes: list[tuple[str, str]] = []
        deliveries: list[tuple[str, str, str, str, str, str, str, bool, list[str]]] = []

        def fake_read_message(_config, purpose):
            self.assertEqual(purpose, AGENT_PROMPT_PURPOSE)
            return DAEMON_RECEIVED_MESSAGE

        def fake_write_message(_config, purpose, message):
            writes.append((purpose, message))

        def fake_deliver_chat(
            _config,
            prompt_id,
            directory,
            prompt,
            reply,
            provider,
            model,
            reasoning,
            planning_mode,
            targeted_feature_paths,
        ):
            deliveries.append(
                (
                    prompt_id,
                    directory,
                    prompt,
                    reply,
                    provider,
                    model,
                    reasoning,
                    planning_mode,
                    targeted_feature_paths,
                ),
            )

        run_agent_prompt_cycle(
            {"pollIntervalMs": 5000},
            read_message=fake_read_message,
            write_message=fake_write_message,
            deliver_chat=fake_deliver_chat,
        )

        self.assertEqual(writes, [])
        self.assertEqual(deliveries, [])

    def test_runs_codex_and_posts_reply_for_basic_prompt_message(self):
        writes: list[tuple[str, str]] = []
        deliveries: list[tuple[str, str, str, str, str, str, str, bool, list[str]]] = []
        runs: list[tuple[str, str, str, str]] = []
        prompt_payload = json.dumps({
            "promptId": "prompt-1",
            "directory": "/workspace/project",
            "prompt": "Build the feature",
        })
        message_reads = [
            prompt_payload,
            build_agent_prompt_state_message("prompt-1", DAEMON_RECEIVED_MESSAGE),
        ]

        def fake_read_message(_config, purpose):
            self.assertEqual(purpose, AGENT_PROMPT_PURPOSE)
            return message_reads.pop(0)

        def fake_write_message(_config, purpose, message):
            writes.append((purpose, message))

        def fake_deliver_chat(
            _config,
            prompt_id,
            directory,
            prompt,
            reply,
            provider,
            model,
            reasoning,
            planning_mode,
            targeted_feature_paths,
        ):
            deliveries.append(
                (
                    prompt_id,
                    directory,
                    prompt,
                    reply,
                    provider,
                    model,
                    reasoning,
                    planning_mode,
                    targeted_feature_paths,
                ),
            )

        def fake_run_codex_prompt(directory, prompt, model, reasoning):
            runs.append((directory, prompt, model, reasoning))
            return "Plan completed"

        run_agent_prompt_cycle(
            {"pollIntervalMs": 5000},
            read_message=fake_read_message,
            write_message=fake_write_message,
            deliver_chat=fake_deliver_chat,
            run_codex_prompt=fake_run_codex_prompt,
        )

        self.assertEqual(
            writes,
            [
                (
                    AGENT_PROMPT_PURPOSE,
                    build_agent_prompt_state_message("prompt-1", DAEMON_RECEIVED_MESSAGE),
                ),
                (
                    AGENT_PROMPT_PURPOSE,
                    build_agent_prompt_state_message("prompt-1", DAEMON_SENT_RESPONSE),
                ),
            ],
        )
        self.assertEqual(
            runs,
            [("/workspace/project", "Build the feature", "gpt-5.5", "medium")],
        )
        self.assertEqual(
            deliveries,
            [
                (
                    "prompt-1",
                    "/workspace/project",
                    "Build the feature",
                    "Plan completed",
                    "codex",
                    "gpt-5.5",
                    "medium",
                    False,
                    [],
                ),
            ],
        )

    def test_runs_codex_with_planning_mode_and_targeted_features(self):
        writes: list[tuple[str, str]] = []
        deliveries: list[tuple[str, str, str, str, str, str, str, bool, list[str]]] = []
        runs: list[tuple[str, str, str, str]] = []
        prompt_payload = json.dumps({
            "promptId": "prompt-2",
            "directory": "/workspace/project",
            "provider": "codex",
            "model": "gpt-5.4-mini",
            "reasoning": "extra-high",
            "planningMode": True,
            "targetedFeaturePaths": [
                "feature_files/agent-prompt-chat.md",
                "notes/not-allowed.md",
                "feature_files/feature-file-graph-display.md",
            ],
            "prompt": "Build the feature",
        })
        message_reads = [
            prompt_payload,
            build_agent_prompt_state_message("prompt-2", DAEMON_RECEIVED_MESSAGE),
        ]
        expected_prompt = (
            f"{PLANNING_PROMPT_PREFIX.rstrip()}\n\n"
            "The following prompt reqeusts changes relevant to the following feature files: "
            "feature_files/agent-prompt-chat.md, feature_files/feature-file-graph-display.md\n\n"
            "Build the feature"
        )

        def fake_read_message(_config, purpose):
            self.assertEqual(purpose, AGENT_PROMPT_PURPOSE)
            return message_reads.pop(0)

        def fake_write_message(_config, purpose, message):
            writes.append((purpose, message))

        def fake_deliver_chat(
            _config,
            prompt_id,
            directory,
            prompt,
            reply,
            provider,
            model,
            reasoning,
            planning_mode,
            targeted_feature_paths,
        ):
            deliveries.append(
                (
                    prompt_id,
                    directory,
                    prompt,
                    reply,
                    provider,
                    model,
                    reasoning,
                    planning_mode,
                    targeted_feature_paths,
                ),
            )

        def fake_run_codex_prompt(directory, prompt, model, reasoning):
            runs.append((directory, prompt, model, reasoning))
            return "Plan completed"

        run_agent_prompt_cycle(
            {"pollIntervalMs": 5000},
            read_message=fake_read_message,
            write_message=fake_write_message,
            deliver_chat=fake_deliver_chat,
            run_codex_prompt=fake_run_codex_prompt,
        )

        self.assertEqual(
            writes,
            [
                (
                    AGENT_PROMPT_PURPOSE,
                    build_agent_prompt_state_message("prompt-2", DAEMON_RECEIVED_MESSAGE),
                ),
                (
                    AGENT_PROMPT_PURPOSE,
                    build_agent_prompt_state_message("prompt-2", DAEMON_SENT_RESPONSE),
                ),
            ],
        )
        self.assertEqual(
            runs,
            [("/workspace/project", expected_prompt, "gpt-5.4-mini", "extra-high")],
        )
        self.assertEqual(
            deliveries,
            [
                (
                    "prompt-2",
                    "/workspace/project",
                    "Build the feature",
                    "Plan completed",
                    "codex",
                    "gpt-5.4-mini",
                    "extra-high",
                    True,
                    [
                        "feature_files/agent-prompt-chat.md",
                        "feature_files/feature-file-graph-display.md",
                    ],
                ),
            ],
        )

    def test_keeps_a_newer_prompt_in_the_row_while_the_current_reply_finishes(self):
        writes: list[tuple[str, str]] = []
        deliveries: list[tuple[str, str, str, str, str, str, str, bool, list[str]]] = []
        runs: list[tuple[str, str, str, str]] = []
        first_prompt_payload = json.dumps({
            "promptId": "prompt-1",
            "directory": "/workspace/project",
            "prompt": "Build the first feature",
        })
        queued_prompt_payload = json.dumps({
            "promptId": "prompt-2",
            "directory": "/workspace/project",
            "prompt": "Build the second feature",
        })
        message_reads = [first_prompt_payload, queued_prompt_payload]

        def fake_read_message(_config, purpose):
            self.assertEqual(purpose, AGENT_PROMPT_PURPOSE)
            return message_reads.pop(0)

        def fake_write_message(_config, purpose, message):
            writes.append((purpose, message))

        def fake_deliver_chat(
            _config,
            prompt_id,
            directory,
            prompt,
            reply,
            provider,
            model,
            reasoning,
            planning_mode,
            targeted_feature_paths,
        ):
            deliveries.append(
                (
                    prompt_id,
                    directory,
                    prompt,
                    reply,
                    provider,
                    model,
                    reasoning,
                    planning_mode,
                    targeted_feature_paths,
                ),
            )

        def fake_run_codex_prompt(directory, prompt, model, reasoning):
            runs.append((directory, prompt, model, reasoning))
            return "First reply"

        run_agent_prompt_cycle(
            {"pollIntervalMs": 5000},
            read_message=fake_read_message,
            write_message=fake_write_message,
            deliver_chat=fake_deliver_chat,
            run_codex_prompt=fake_run_codex_prompt,
        )

        self.assertEqual(
            writes,
            [
                (
                    AGENT_PROMPT_PURPOSE,
                    build_agent_prompt_state_message("prompt-1", DAEMON_RECEIVED_MESSAGE),
                ),
            ],
        )
        self.assertEqual(
            runs,
            [("/workspace/project", "Build the first feature", "gpt-5.5", "medium")],
        )
        self.assertEqual(
            deliveries,
            [
                (
                    "prompt-1",
                    "/workspace/project",
                    "Build the first feature",
                    "First reply",
                    "codex",
                    "gpt-5.5",
                    "medium",
                    False,
                    [],
                ),
            ],
        )


class RunCodexExecTests(unittest.TestCase):
    def test_returns_stdout_for_success(self):
        class FakeProcess:
            returncode = 0
            stdout = "done"
            stderr = ""

        with patch("daedalus_daemon.main.subprocess.run", return_value=FakeProcess()) as mocked_run:
            reply = run_codex_exec("/workspace/project", "Build the feature", "gpt-5.4", "high")

        mocked_run.assert_called_once_with(
            [
                "codex",
                "exec",
                "-m",
                "gpt-5.4",
                "-c",
                'model_reasoning_effort="high"',
                "Build the feature",
            ],
            cwd="/workspace/project",
            capture_output=True,
            text=True,
        )
        self.assertEqual(reply, "done")

    def test_returns_formatted_failure_text(self):
        class FakeProcess:
            returncode = 1
            stdout = "partial"
            stderr = "boom"

        with patch("daedalus_daemon.main.subprocess.run", return_value=FakeProcess()) as mocked_run:
            reply = run_codex_exec("/workspace/project", "Build the feature", "gpt-5.5", "extra-high")

        mocked_run.assert_called_once_with(
            [
                "codex",
                "exec",
                "-m",
                "gpt-5.5",
                "-c",
                'model_reasoning_effort="xhigh"',
                "Build the feature",
            ],
            cwd="/workspace/project",
            capture_output=True,
            text=True,
        )
        self.assertEqual(
            reply,
            "Codex failed with exit code 1\n\nSTDOUT:\npartial\n\nSTDERR:\nboom",
        )


if __name__ == "__main__":
    unittest.main()
