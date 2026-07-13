import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from daedalus_daemon.orchestrator import (
    build_resolver_prompt,
    build_task_repair_prompt,
    build_task_prompt,
    commit_worktree_changes,
    create_task_worktree,
    is_clean_worktree,
    load_worktree_settings,
    remove_empty_worktree_directories,
    run_verification,
    verification_commands_for_worktree,
)


class WorktreeSettingsTests(unittest.TestCase):
    def test_loads_flat_shell_free_settings(self):
        with tempfile.TemporaryDirectory() as directory:
            parameter_directory = Path(directory) / "parameter_files"
            parameter_directory.mkdir()
            (parameter_directory / "daedalus-git-worktrees.toml").write_text(
                'max_agents_per_repository = 4\n'
                'cohort_idle_window_seconds = 30\n'
                'resolver_attempt_limit = 3\n'
                'task_verification_attempt_limit = 3\n'
                'primary_branch = "main"\n'
                'verification_commands = [["python", "-m", "unittest"]]\n',
                encoding="utf-8",
            )

            with patch(
                "daedalus_daemon.orchestrator.WORKTREE_PARAMETER_FILE",
                parameter_directory / "daedalus-git-worktrees.toml",
            ):
                settings = load_worktree_settings()

        self.assertEqual(settings["maxAgentsPerRepository"], 4)
        self.assertEqual(settings["taskVerificationAttemptLimit"], 3)
        self.assertEqual(settings["verificationCommands"], [["python", "-m", "unittest"]])


class WorktreeTests(unittest.TestCase):
    @patch("daedalus_daemon.orchestrator.run_process")
    @patch("daedalus_daemon.orchestrator.git_output")
    @patch("daedalus_daemon.orchestrator.validate_primary_worktree")
    @patch("daedalus_daemon.orchestrator.worktree_root")
    def test_creates_unique_task_branch_from_primary_sha(
        self, mock_root, _mock_validate, mock_git_output, mock_process
    ):
        mock_root.return_value = Path("/tmp/worktrees/repo")
        mock_git_output.return_value = "abc123"
        mock_process.return_value.returncode = 0
        mock_process.return_value.stdout = ""
        mock_process.return_value.stderr = ""

        base, branch, path = create_task_worktree("/repo", "task-id", "main")

        self.assertEqual((base, branch), ("abc123", "agent/task-task-id"))
        self.assertEqual(path, "/tmp/worktrees/repo/task-task-id")
        mock_process.assert_called_once_with(
            "/repo",
            ["git", "worktree", "add", "-b", branch, path, "abc123"],
        )

    @patch("daedalus_daemon.orchestrator.run_process")
    @patch("daedalus_daemon.orchestrator.git_output")
    def test_daemon_commits_agent_changes_when_the_worktree_is_dirty(
        self, mock_git_output, mock_process
    ):
        mock_git_output.return_value = " M changed.py"
        success = unittest.mock.Mock(returncode=0, stdout="", stderr="")
        mock_process.side_effect = [success, success]

        committed = commit_worktree_changes("/worktree", "Daedalus task task-id")

        self.assertTrue(committed)
        self.assertEqual(mock_process.call_count, 2)

    @patch("daedalus_daemon.orchestrator.git_output", return_value="")
    def test_clean_failed_worktree_is_reclaimable(self, _mock_git_output):
        with tempfile.TemporaryDirectory() as directory:
            self.assertTrue(is_clean_worktree(directory))

    def test_removes_empty_daedalus_worktree_directories(self):
        with tempfile.TemporaryDirectory() as directory:
            repository = Path(directory) / "project"
            repository.mkdir()
            root = Path(directory) / ".daedalus-worktrees" / "project"
            root.mkdir(parents=True)

            remove_empty_worktree_directories(str(repository))

            self.assertFalse(root.exists())
            self.assertFalse(root.parent.exists())


class VerificationTests(unittest.TestCase):
    def test_discovers_root_pytest_suite_when_no_commands_are_configured(self):
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, "tests").mkdir()
            commands = verification_commands_for_worktree(directory, [])

        self.assertEqual(commands, [["python", "-m", "pytest"]])

    @patch("daedalus_daemon.orchestrator.run_process")
    def test_stops_at_first_failed_argument_array(self, mock_process):
        success = unittest.mock.Mock(returncode=0, stdout="ok", stderr="")
        failure = unittest.mock.Mock(returncode=1, stdout="", stderr="failed")
        mock_process.side_effect = [success, failure]

        result = run_verification("/worktree", [["first"], ["second"], ["third"]])

        self.assertFalse(result["ok"])
        self.assertEqual(mock_process.call_count, 2)
        self.assertIn("failed", result["output"])


class PromptTests(unittest.TestCase):
    def test_task_prompt_requires_commits_and_preserves_scope(self):
        prompt = build_task_prompt({
            "prompt": "Build it",
            "targeted_feature_paths": ["feature_files/example.md"],
        })
        self.assertIn("feature_files/example.md", prompt)
        self.assertIn("Commit every completed change", prompt)

    def test_task_repair_prompt_contains_original_task_and_failure(self):
        prompt = build_task_repair_prompt(
            {"prompt": "Build it"}, "COMMAND: pytest\nSTDERR: failed", 2, 3
        )

        self.assertIn("Build it", prompt)
        self.assertIn("COMMAND: pytest", prompt)
        self.assertIn("2/3", prompt)

    def test_resolver_prompt_contains_all_goals_and_failure(self):
        prompt = build_resolver_prompt(
            {"id": "batch"},
            [{"prompt": "First goal"}, {"prompt": "Second goal"}],
            "merge conflict",
        )
        self.assertIn("First goal", prompt)
        self.assertIn("Second goal", prompt)
        self.assertIn("merge conflict", prompt)


if __name__ == "__main__":
    unittest.main()
