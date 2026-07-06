import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from daedalus_daemon import (
    AGENT_PROMPT_PURPOSE,
    CLIENT_LOAD_FEATURE_FILES,
    DAEMON_RECEIVED_MESSAGE,
    DAEMON_SENT_FEATURE_FILES,
    DAEMON_SENT_RESPONSE,
    FEATURE_FILE_LOAD_PURPOSE,
    run_agent_prompt_cycle,
    run_codex_exec,
    run_poll_cycle,
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


class RunAgentPromptCycleTests(unittest.TestCase):
    def test_ignores_empty_prompt_message(self):
        writes: list[tuple[str, str]] = []
        deliveries: list[tuple[str, str, str, str, str, str, bool]] = []

        def fake_read_message(_config, purpose):
            self.assertEqual(purpose, AGENT_PROMPT_PURPOSE)
            return ""

        def fake_write_message(_config, purpose, message):
            writes.append((purpose, message))

        def fake_deliver_chat(_config, directory, prompt, reply, provider, model, reasoning, planning_mode):
            deliveries.append((directory, prompt, reply, provider, model, reasoning, planning_mode))

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
        deliveries: list[tuple[str, str, str, str, str, str, bool]] = []

        def fake_read_message(_config, purpose):
            self.assertEqual(purpose, AGENT_PROMPT_PURPOSE)
            return DAEMON_RECEIVED_MESSAGE

        def fake_write_message(_config, purpose, message):
            writes.append((purpose, message))

        def fake_deliver_chat(_config, directory, prompt, reply, provider, model, reasoning, planning_mode):
            deliveries.append((directory, prompt, reply, provider, model, reasoning, planning_mode))

        run_agent_prompt_cycle(
            {"pollIntervalMs": 5000},
            read_message=fake_read_message,
            write_message=fake_write_message,
            deliver_chat=fake_deliver_chat,
        )

        self.assertEqual(writes, [])
        self.assertEqual(deliveries, [])

    def test_runs_codex_and_posts_reply_for_old_prompt_message(self):
        writes: list[tuple[str, str]] = []
        deliveries: list[tuple[str, str, str, str, str, str, bool]] = []
        runs: list[tuple[str, str, str, str]] = []
        prompt_payload = json.dumps({
            "directory": "/workspace/project",
            "prompt": "Build the feature",
        })

        def fake_read_message(_config, purpose):
            self.assertEqual(purpose, AGENT_PROMPT_PURPOSE)
            return prompt_payload

        def fake_write_message(_config, purpose, message):
            writes.append((purpose, message))

        def fake_deliver_chat(_config, directory, prompt, reply, provider, model, reasoning, planning_mode):
            deliveries.append((directory, prompt, reply, provider, model, reasoning, planning_mode))

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
                (AGENT_PROMPT_PURPOSE, DAEMON_RECEIVED_MESSAGE),
                (AGENT_PROMPT_PURPOSE, DAEMON_SENT_RESPONSE),
            ],
        )
        self.assertEqual(runs, [("/workspace/project", "Build the feature", "gpt-5.5", "medium")])
        self.assertEqual(
            deliveries,
            [("/workspace/project", "Build the feature", "Plan completed", "codex", "gpt-5.5", "medium", False)],
        )

    def test_runs_codex_with_model_reasoning_and_planning_mode(self):
        writes: list[tuple[str, str]] = []
        deliveries: list[tuple[str, str, str, str, str, str, bool]] = []
        runs: list[tuple[str, str, str, str]] = []
        prompt_payload = json.dumps({
            "directory": "/workspace/project",
            "provider": "codex",
            "model": "gpt-5.4-mini",
            "reasoning": "extra-high",
            "planningMode": True,
            "prompt": "Build the feature",
        })
        expected_prompt = (
            "You are in planning mode only.\n\n"
            "Do not edit files.\n"
            "Do not run modifying commands.\n"
            "Just give me the markdown flie.\n\n"
            "Build the feature"
        )

        def fake_read_message(_config, purpose):
            self.assertEqual(purpose, AGENT_PROMPT_PURPOSE)
            return prompt_payload

        def fake_write_message(_config, purpose, message):
            writes.append((purpose, message))

        def fake_deliver_chat(_config, directory, prompt, reply, provider, model, reasoning, planning_mode):
            deliveries.append((directory, prompt, reply, provider, model, reasoning, planning_mode))

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
                (AGENT_PROMPT_PURPOSE, DAEMON_RECEIVED_MESSAGE),
                (AGENT_PROMPT_PURPOSE, DAEMON_SENT_RESPONSE),
            ],
        )
        self.assertEqual(runs, [("/workspace/project", expected_prompt, "gpt-5.4-mini", "extra-high")])
        self.assertEqual(
            deliveries,
            [
                (
                    "/workspace/project",
                    "Build the feature",
                    "Plan completed",
                    "codex",
                    "gpt-5.4-mini",
                    "extra-high",
                    True,
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
