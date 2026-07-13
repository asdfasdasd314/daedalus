import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from daedalus_daemon import (
    AGENT_PROMPT_PURPOSE,
    CLIENT_REVIEW,
    DAEMON_COMPLETE,
    DAEMON_RECEIVED_MESSAGE,
    FEATURE_FILE_LOAD_PURPOSE,
    GIT_SYNC_PURPOSE,
    PARAMETER_FILE_LOAD_PURPOSE,
    PARAMETER_FILE_UPDATE_PURPOSE,
    run_agent_prompt_cycle,
    run_codex_exec,
    run_cursor_exec,
    run_git_sync_cycle,
    run_parameter_file_poll_cycle,
    run_parameter_file_update_cycle,
    run_poll_cycle,
)
from daedalus_daemon.main import (
    CURSOR_PLANNING_PROMPT_PREFIX,
    PLANNING_PROMPT_PREFIX,
    TARGETED_FEATURES_PROMPT_PREFIX,
    apply_parameter_file_update,
    build_agent_prompt_state_message,
    build_git_sync_state_message,
    build_parameter_file_update_state_message,
    build_codex_prompt,
    build_cursor_prompt,
    filter_targeted_feature_paths,
    update_parameter_variable_in_toml,
)


class RunPollCycleTests(unittest.TestCase):
    def test_handles_client_load_message(self):
        writes: list[tuple[str, str]] = []
        deliveries: list[dict[str, list[dict[str, str]]]] = []

        def fake_read_message(_config, purpose):
            self.assertEqual(purpose, FEATURE_FILE_LOAD_PURPOSE)
            return CLIENT_REVIEW

        def fake_write_message(_config, purpose, message, _content=None):
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
            [(FEATURE_FILE_LOAD_PURPOSE, DAEMON_COMPLETE)],
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
            return None

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
            return CLIENT_REVIEW

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
            [(PARAMETER_FILE_LOAD_PURPOSE, DAEMON_COMPLETE)],
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
            return None

        def fake_write_message(_config, purpose, message, _content=None):
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
        writes: list[tuple[str, str, str | None]] = []

        def fake_read_message(_config, purpose):
            self.assertEqual(purpose, PARAMETER_FILE_LOAD_PURPOSE)
            return CLIENT_REVIEW

        def fake_write_message(_config, purpose, message, content=None):
            writes.append((purpose, message, content))

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
                (
                    PARAMETER_FILE_LOAD_PURPOSE,
                    CLIENT_REVIEW,
                    json.dumps({"error": "HTTP Error 404: Not Found"}),
                ),
            ],
        )


class RunParameterFileUpdateCycleTests(unittest.TestCase):
    def test_handles_parameter_file_update_message(self):
        writes: list[tuple[str, str]] = []
        deliveries: list[dict[str, list[dict[str, str]]]] = []

        def fake_read_message(_config, purpose):
            self.assertEqual(purpose, "parameter_file_update")
            return json.dumps({
                "command": "parameter_file_update",
                "projectPath": "/workspace/project",
                "path": "parameter_files/alpha.toml",
                "variableName": "alpha",
                "value": "2",
            })

        def fake_write_message(_config, purpose, message):
            writes.append((purpose, message))

        def fake_scan_projects():
            return {
                "/workspace/project": [
                    {
                        "path": "parameter_files/alpha.toml",
                        "toml": "alpha = 2",
                    },
                ],
            }

        def fake_deliver_projects(_config, projects):
            deliveries.append(projects)

        with patch("daedalus_daemon.main.apply_parameter_file_update"):
            run_parameter_file_update_cycle(
                {"pollIntervalMs": 5000},
                read_message=fake_read_message,
                write_message=fake_write_message,
                scan_projects=fake_scan_projects,
                deliver_projects=fake_deliver_projects,
            )

        self.assertEqual(
            writes,
            [(PARAMETER_FILE_UPDATE_PURPOSE, DAEMON_COMPLETE)],
        )
        self.assertEqual(
            deliveries,
            [{
                "/workspace/project": [
                    {
                        "path": "parameter_files/alpha.toml",
                        "toml": "alpha = 2",
                    },
                ],
            }],
        )


class ParameterFileUpdateTests(unittest.TestCase):
    def test_updates_flat_toml_integer(self):
        self.assertEqual(
            update_parameter_variable_in_toml("alpha = 1", "alpha", "2"),
            "alpha = 2",
        )

    def test_updates_section_toml_string(self):
        self.assertEqual(
            update_parameter_variable_in_toml('[settings]\nname = "old"', "settings.name", "new"),
            '[settings]\nname = "new"',
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
        message_reads = [prompt_payload]

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
            [(AGENT_PROMPT_PURPOSE, DAEMON_COMPLETE)],
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
        message_reads = [prompt_payload]
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
            [(AGENT_PROMPT_PURPOSE, DAEMON_COMPLETE)],
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
        message_reads = [first_prompt_payload]

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
            [(AGENT_PROMPT_PURPOSE, DAEMON_COMPLETE)],
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


class CursorProviderRoutingTests(unittest.TestCase):
    def test_routes_cursor_prompt_to_cursor_runner_and_preserves_provider(self):
        writes: list[tuple[str, str]] = []
        deliveries: list[tuple[str, str, str]] = []
        message_reads = [
            json.dumps({
                "promptId": "cursor-1",
                "directory": "/workspace/project",
                "prompt": "Build the feature",
                "provider": "cursor",
            }),
        ]

        def fake_read_message(_config, _purpose):
            return message_reads.pop(0)

        def fake_write_message(_config, purpose, message):
            writes.append((purpose, message))

        def fake_deliver_chat(_config, prompt_id, _directory, _prompt, reply, provider, *_args):
            deliveries.append((prompt_id, reply, provider))

        def fake_run_cursor_prompt(directory, prompt, planning_mode):
            self.assertEqual(directory, "/workspace/project")
            self.assertEqual(prompt, "Build the feature")
            self.assertFalse(planning_mode)
            return "Cursor completed"

        run_agent_prompt_cycle(
            {"pollIntervalMs": 5000},
            read_message=fake_read_message,
            write_message=fake_write_message,
            deliver_chat=fake_deliver_chat,
            run_cursor_prompt=fake_run_cursor_prompt,
        )

        self.assertEqual(deliveries, [("cursor-1", "Cursor completed", "cursor")])
        self.assertEqual(writes, [(AGENT_PROMPT_PURPOSE, DAEMON_COMPLETE)])


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


class RunCursorExecTests(unittest.TestCase):
    def test_returns_actionable_message_when_cursor_is_unavailable(self):
        with patch("daedalus_daemon.main.shutil.which", return_value=None):
            reply = run_cursor_exec("/workspace/project", "Build the feature")

        self.assertIn("Cursor CLI is unavailable", reply)
        self.assertIn("agent", reply)

    def test_runs_cursor_with_prompt_as_a_single_argument(self):
        class FakeProcess:
            returncode = 0
            stdout = json.dumps({"type": "result", "result": "done"})
            stderr = ""

        prompt = 'Build "the feature"; do not use a shell'
        with (
            patch("daedalus_daemon.main.shutil.which", return_value="/usr/local/bin/agent"),
            patch("daedalus_daemon.main.subprocess.run", return_value=FakeProcess()) as mocked_run,
        ):
            reply = run_cursor_exec("/workspace/project", prompt)

        mocked_run.assert_called_once()
        call_args = mocked_run.call_args
        self.assertEqual(
            call_args.args[0],
            ["agent", "-p", "--output-format", "json", "--force", prompt],
        )
        self.assertEqual(call_args.kwargs["cwd"], "/workspace/project")
        self.assertTrue(call_args.kwargs["capture_output"])
        self.assertTrue(call_args.kwargs["text"])
        self.assertIn("env", call_args.kwargs)
        self.assertEqual(reply, "done")

    def test_runs_cursor_plan_without_force_and_returns_native_plan(self):
        class FakeProcess:
            returncode = 0
            stdout = '{"type":"assistant","message":{"content":[{"text":"Exploring"}]}}\n{"type":"tool_call","tool_call":{"createPlanToolCall":{"args":{"plan":"# Plan\\n\\nDo the work."}}}}\n{"type":"result","result":"Progress update"}\n'
            stderr = ""

        with (
            patch("daedalus_daemon.main.shutil.which", return_value="/usr/local/bin/agent"),
            patch("daedalus_daemon.main.subprocess.run", return_value=FakeProcess()) as mocked_run,
        ):
            reply = run_cursor_exec("/workspace/project", "Build the feature", True)

        self.assertEqual(
            mocked_run.call_args.args[0],
            ["agent", "-p", "--output-format", "stream-json", "--trust", "--mode=plan", "Build the feature"],
        )
        self.assertEqual(reply, "# Plan\n\nDo the work.")

    def test_falls_back_when_cursor_rejects_plan_mode(self):
        class UnsupportedPlanModeProcess:
            returncode = 1
            stdout = ""
            stderr = "unknown option --mode=plan"

        class FallbackProcess:
            returncode = 0
            stdout = '{"type":"result","result":"# Fallback plan"}\n'
            stderr = ""

        with (
            patch("daedalus_daemon.main.shutil.which", return_value="/usr/local/bin/agent"),
            patch(
                "daedalus_daemon.main.subprocess.run",
                side_effect=[UnsupportedPlanModeProcess(), FallbackProcess()],
            ) as mocked_run,
        ):
            reply = run_cursor_exec("/workspace/project", "Build the feature", True)

        self.assertEqual(mocked_run.call_count, 2)
        self.assertEqual(
            mocked_run.call_args_list[1].args[0],
            ["agent", "-p", "--output-format", "stream-json", "--trust", "Build the feature"],
        )
        self.assertEqual(reply, "# Fallback plan")

    def test_builds_cursor_only_plan_prompt_with_native_plan_instruction(self):
        prompt = build_cursor_prompt("Build the feature", True)

        self.assertTrue(prompt.startswith(CURSOR_PLANNING_PROMPT_PREFIX.rstrip()))
        self.assertIn("do not create, edit, or save a planning document", prompt)
        self.assertIn("native planning tool", prompt)
        self.assertTrue(prompt.endswith("Build the feature"))

    def test_returns_actionable_response_for_invalid_cursor_json(self):
        class FakeProcess:
            returncode = 0
            stdout = "not json"
            stderr = ""

        with (
            patch("daedalus_daemon.main.shutil.which", return_value="/usr/local/bin/agent"),
            patch("daedalus_daemon.main.subprocess.run", return_value=FakeProcess()),
        ):
            reply = run_cursor_exec("/workspace/project", "Build the feature")

        self.assertIn("malformed JSON", reply)
        self.assertIn("not json", reply)

    def test_returns_actionable_response_when_cursor_json_has_no_result(self):
        class FakeProcess:
            returncode = 0
            stdout = json.dumps({"type": "result"})
            stderr = ""

        with (
            patch("daedalus_daemon.main.shutil.which", return_value="/usr/local/bin/agent"),
            patch("daedalus_daemon.main.subprocess.run", return_value=FakeProcess()),
        ):
            reply = run_cursor_exec("/workspace/project", "Build the feature")

        self.assertIn("without a result", reply)

    def test_maps_cancelled_and_failed_processes_to_daemon_replies(self):
        class CancelledProcess:
            returncode = -15
            stdout = "partial"
            stderr = "terminated"

        with (
            patch("daedalus_daemon.main.shutil.which", return_value="/usr/local/bin/agent"),
            patch("daedalus_daemon.main.subprocess.run", return_value=CancelledProcess()),
        ):
            reply = run_cursor_exec("/workspace/project", "Build the feature")

        self.assertIn("Cursor was cancelled", reply)
        self.assertIn("partial", reply)

    def test_maps_nonzero_cursor_exit_to_actionable_reply(self):
        class FailedProcess:
            returncode = 1
            stdout = "partial"
            stderr = "boom"

        with (
            patch("daedalus_daemon.main.shutil.which", return_value="/usr/local/bin/agent"),
            patch("daedalus_daemon.main.subprocess.run", return_value=FailedProcess()),
        ):
            reply = run_cursor_exec("/workspace/project", "Build the feature")

        self.assertIn("exit code 1", reply)
        self.assertIn("partial", reply)
        self.assertIn("boom", reply)


class FakeGitProcess:
    def __init__(self, returncode: int, stdout: str = "", stderr: str = ""):
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


class RunGitSyncCycleTests(unittest.TestCase):
    def test_commit_runs_git_add_before_git_commit(self):
        writes: list[tuple[str, str]] = []
        deliveries: list[dict] = []
        commands: list[list[str]] = []
        request_payload = json.dumps({
            "requestId": "git-sync-1",
            "directory": "/workspace/project",
            "operation": "commit",
            "message": "Save work",
        })
        message_reads = [request_payload]

        def fake_read_message(_config, purpose):
            self.assertEqual(purpose, GIT_SYNC_PURPOSE)
            return message_reads.pop(0)

        def fake_write_message(_config, purpose, message):
            writes.append((purpose, message))

        def fake_deliver_result(_config, result):
            deliveries.append(result)

        def fake_run_process(command, cwd, capture_output, text):
            self.assertEqual(cwd, "/workspace/project")
            self.assertTrue(capture_output)
            self.assertTrue(text)
            commands.append(command)
            return FakeGitProcess(0)

        run_git_sync_cycle(
            {"pollIntervalMs": 5000},
            read_message=fake_read_message,
            write_message=fake_write_message,
            deliver_result=fake_deliver_result,
            run_process=fake_run_process,
        )

        self.assertEqual(
            commands,
            [
                ["git", "add", "."],
                ["git", "commit", "-m", "Save work"],
            ],
        )
        self.assertEqual(
            writes,
            [(GIT_SYNC_PURPOSE, DAEMON_COMPLETE)],
        )
        self.assertEqual(
            deliveries,
            [{
                "requestId": "git-sync-1",
                "directory": "/workspace/project",
                "operation": "commit",
                "status": "success",
                "steps": [
                    {
                        "command": ["git", "add", "."],
                        "exitCode": 0,
                        "stdout": "",
                        "stderr": "",
                    },
                    {
                        "command": ["git", "commit", "-m", "Save work"],
                        "exitCode": 0,
                        "stdout": "",
                        "stderr": "",
                    },
                ],
            }],
        )

    def test_add_failure_prevents_commit_and_returns_captured_output(self):
        deliveries: list[dict] = []
        request_payload = json.dumps({
            "requestId": "git-sync-2",
            "directory": "/workspace/project",
            "operation": "commit",
            "message": "Save work",
        })

        def fake_read_message(_config, _purpose):
            return request_payload

        def fake_write_message(_config, _purpose, _message):
            return None

        def fake_deliver_result(_config, result):
            deliveries.append(result)

        def fake_run_process(command, cwd, capture_output, text):
            self.assertEqual(command, ["git", "add", "."])
            return FakeGitProcess(1, stdout="", stderr="add failed")

        run_git_sync_cycle(
            {"pollIntervalMs": 5000},
            read_message=fake_read_message,
            write_message=fake_write_message,
            deliver_result=fake_deliver_result,
            run_process=fake_run_process,
        )

        self.assertEqual(len(deliveries), 1)
        self.assertEqual(deliveries[0]["status"], "failed")
        self.assertEqual(len(deliveries[0]["steps"]), 1)
        self.assertEqual(deliveries[0]["steps"][0]["stderr"], "add failed")
        self.assertEqual(deliveries[0]["requestId"], "git-sync-2")
        self.assertEqual(deliveries[0]["operation"], "commit")

    def test_pull_success_runs_push(self):
        deliveries: list[dict] = []
        commands: list[list[str]] = []
        request_payload = json.dumps({
            "requestId": "git-sync-3",
            "directory": "/workspace/project",
            "operation": "sync",
        })

        def fake_read_message(_config, _purpose):
            return request_payload

        def fake_write_message(_config, _purpose, _message):
            return None

        def fake_deliver_result(_config, result):
            deliveries.append(result)

        def fake_run_process(command, cwd, capture_output, text):
            commands.append(command)
            return FakeGitProcess(0, stdout=f"{command[-1]} ok")

        run_git_sync_cycle(
            {"pollIntervalMs": 5000},
            read_message=fake_read_message,
            write_message=fake_write_message,
            deliver_result=fake_deliver_result,
            run_process=fake_run_process,
        )

        self.assertEqual(commands, [["git", "pull"], ["git", "push"]])
        self.assertEqual(deliveries[0]["status"], "success")
        self.assertEqual(len(deliveries[0]["steps"]), 2)

    def test_pull_failure_prevents_push(self):
        deliveries: list[dict] = []
        commands: list[list[str]] = []
        request_payload = json.dumps({
            "requestId": "git-sync-4",
            "directory": "/workspace/project",
            "operation": "sync",
        })

        def fake_read_message(_config, _purpose):
            return request_payload

        def fake_write_message(_config, _purpose, _message):
            return None

        def fake_deliver_result(_config, result):
            deliveries.append(result)

        def fake_run_process(command, cwd, capture_output, text):
            commands.append(command)
            if command == ["git", "pull"]:
                return FakeGitProcess(1, stderr="merge conflict")
            raise AssertionError("push should not run")

        run_git_sync_cycle(
            {"pollIntervalMs": 5000},
            read_message=fake_read_message,
            write_message=fake_write_message,
            deliver_result=fake_deliver_result,
            run_process=fake_run_process,
        )

        self.assertEqual(commands, [["git", "pull"]])
        self.assertEqual(deliveries[0]["status"], "failed")
        self.assertEqual(len(deliveries[0]["steps"]), 2)
        self.assertTrue(deliveries[0]["steps"][1].get("skipped"))
        self.assertEqual(
            deliveries[0]["steps"][1]["stderr"],
            "Skipped because git pull failed.",
        )

    def test_push_failure_is_returned_to_frontend(self):
        deliveries: list[dict] = []
        request_payload = json.dumps({
            "requestId": "git-sync-5",
            "directory": "/workspace/project",
            "operation": "sync",
        })

        def fake_read_message(_config, _purpose):
            return request_payload

        def fake_write_message(_config, _purpose, _message):
            return None

        def fake_deliver_result(_config, result):
            deliveries.append(result)

        def fake_run_process(command, cwd, capture_output, text):
            if command == ["git", "pull"]:
                return FakeGitProcess(0)
            if command == ["git", "push"]:
                return FakeGitProcess(1, stderr="rejected")
            raise AssertionError(f"unexpected command: {command}")

        run_git_sync_cycle(
            {"pollIntervalMs": 5000},
            read_message=fake_read_message,
            write_message=fake_write_message,
            deliver_result=fake_deliver_result,
            run_process=fake_run_process,
        )

        self.assertEqual(deliveries[0]["status"], "failed")
        self.assertEqual(deliveries[0]["steps"][-1]["stderr"], "rejected")
        self.assertEqual(deliveries[0]["requestId"], "git-sync-5")
        self.assertEqual(deliveries[0]["operation"], "sync")


if __name__ == "__main__":
    unittest.main()
