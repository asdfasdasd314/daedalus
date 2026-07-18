import sys
import tempfile
import unittest
from concurrent.futures import Future
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from daedalus_daemon.orchestrator import (
    CANCELLED_BY_USER,
    GitWorktreeOrchestrator,
    build_resolver_prompt,
    build_task_repair_prompt,
    build_task_prompt,
    commit_worktree_changes,
    create_task_worktree,
    is_clean_worktree,
    load_worktree_settings,
    plan_migration_renames,
    remove_empty_worktree_directories,
    remove_worktree,
    reply_indicates_cancel,
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
                'cancel_kill_grace_seconds = 2\n'
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
        self.assertEqual(settings["cancelKillGraceSeconds"], 2.0)
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


class BatchDeletionTests(unittest.TestCase):
    def test_deletion_event_does_not_reference_the_deleted_batch(self):
        orchestrator = GitWorktreeOrchestrator({}, lambda *_args: {}, lambda *_args: {})
        request = {
            "id": "request-1",
            "batch": {"id": "batch-1", "repository": "/repo", "integration_worktree_path": ""},
            "tasks": [],
        }

        with (
            patch("daedalus_daemon.orchestrator.list_batch_deletion_requests", return_value=[request]),
            patch("daedalus_daemon.orchestrator.complete_batch_deletion", return_value=True),
            patch("daedalus_daemon.orchestrator.record_daemon_event") as record_event,
        ):
            orchestrator._handle_batch_deletion_requests()

        self.assertEqual(record_event.call_args.args, (
            {}, "/repo", "warning", "Blocked integration batch batch-1 deleted by user.",
        ))
        self.assertEqual(record_event.call_args.kwargs, {})


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

    def test_captures_final_verified_head_for_architecture_view(self):
        orchestrator = GitWorktreeOrchestrator({}, lambda *a: "ok", lambda *a: "ok")
        task = {
            "id": "task-architecture",
            "repository": "/repo",
            "provider": "codex",
            "model": "gpt-5.6-terra",
            "reasoning": "high",
            "prompt": "Build it",
            "base_commit": "base123",
            "worktree_path": "/tmp/worktree",
            "cancel_requested": False,
            "verification_attempts": 0,
        }
        with (
            patch.object(orchestrator, "_run_task_agent", return_value="agent ok"),
            patch.object(orchestrator, "_refresh_cancel_requested", return_value=False),
            patch("daedalus_daemon.orchestrator.update_agent_task"),
            patch("daedalus_daemon.orchestrator.commit_worktree_changes", return_value=True),
            patch("daedalus_daemon.orchestrator.record_daemon_event"),
            patch("daedalus_daemon.orchestrator.verification_commands_for_worktree", return_value=[]),
            patch("daedalus_daemon.orchestrator.git_output", side_effect=["", "first456", "final789"]),
            patch("daedalus_daemon.orchestrator.run_verification", return_value={"ok": True, "output": "passed"}),
        ):
            outcome = orchestrator._run_task(task, {
                "verificationCommands": [],
                "taskVerificationAttemptLimit": 3,
            })

        self.assertTrue(outcome["ok"])
        self.assertEqual(outcome["completed_commit"], "final789")


class BatchCompletionDeliveryTests(unittest.TestCase):
    def test_manual_batch_retry_preserves_its_existing_worktree(self):
        orchestrator = GitWorktreeOrchestrator({}, lambda *a: "ok", lambda *a: "ok")
        batch = {
            "id": "batch-1", "repository": "/repo", "base_commit": "base", "task_ids": [],
            "integration_branch": "integration/batch-1", "integration_worktree_path": "/tmp/integration",
            "retry_generation": 1,
        }
        settings = {"verificationCommands": [], "resolverAttemptLimit": 0, "primaryBranch": "main"}

        with (
            patch("daedalus_daemon.orchestrator.retained_integration_worktree_valid", return_value=True),
            patch("daedalus_daemon.orchestrator.run_process") as run_process,
            patch("daedalus_daemon.orchestrator.upsert_orchestration_batch"),
            patch("daedalus_daemon.orchestrator.reconcile_migration_numbers"),
            patch("daedalus_daemon.orchestrator.verification_commands_for_worktree", return_value=[]),
            patch("daedalus_daemon.orchestrator.run_verification", return_value={"ok": False, "output": "failed"}),
        ):
            outcome = orchestrator._integrate_batch(batch, [], settings)

        self.assertFalse(outcome["ok"])
        self.assertEqual(outcome["worktree"], "/tmp/integration")
        run_process.assert_not_called()

    def test_manual_batch_retry_never_creates_a_replacement_worktree(self):
        orchestrator = GitWorktreeOrchestrator({}, lambda *a: "ok", lambda *a: "ok")
        batch = {
            "id": "batch-1", "repository": "/repo", "base_commit": "base", "task_ids": [],
            "integration_branch": "integration/batch-1", "integration_worktree_path": "/missing/integration",
            "retry_generation": 1,
        }

        with (
            patch("daedalus_daemon.orchestrator.retained_integration_worktree_valid", return_value=False),
            patch("daedalus_daemon.orchestrator.create_integration_worktree") as create_worktree,
        ):
            outcome = orchestrator._integrate_batch(batch, [], {})

        self.assertFalse(outcome["ok"])
        self.assertIn("retained integration worktree is unavailable", outcome["error"])
        create_worktree.assert_not_called()

    def test_success_event_is_published_before_batch_cleanup(self):
        orchestrator = GitWorktreeOrchestrator({}, lambda *a: "ok", lambda *a: "ok")
        future = Future()
        future.set_result({"ok": True, "worktree": "/tmp/integration", "attempts": 0})
        orchestrator.batch_futures["batch-1"] = future
        batch = {
            "id": "batch-1", "repository": "/repo", "status": "integrating",
            "task_ids": ["task-1"], "resolver_attempts": 0, "retry_generation": 2,
        }
        task = {"id": "task-1", "repository": "/repo", "worktree_path": "/tmp/task"}
        calls = []
        with (
            patch("daedalus_daemon.orchestrator.upsert_orchestration_batch", side_effect=lambda *args: calls.append("upsert")),
            patch("daedalus_daemon.orchestrator.record_daemon_event", side_effect=lambda *args, **kwargs: calls.append(("event", kwargs))),
            patch("daedalus_daemon.orchestrator.update_agent_task", side_effect=lambda *args: calls.append("task")),
            patch("daedalus_daemon.orchestrator.remove_worktree", side_effect=lambda *args, **kwargs: calls.append("worktree")),
            patch("daedalus_daemon.orchestrator.delete_orchestration_batch", side_effect=lambda *args: calls.append("delete")),
        ):
            orchestrator._finish_batches([task], [batch])

        event_index = next(index for index, call in enumerate(calls) if isinstance(call, tuple))
        self.assertLess(event_index, calls.index("delete"))
        self.assertEqual(calls[event_index][1]["event_type"], "batch_completed")


class PromptTests(unittest.TestCase):
    def test_task_prompt_requires_commits_and_preserves_scope(self):
        prompt = build_task_prompt({
            "prompt": "Build it",
            "targeted_feature_paths": ["feature_files/example.md"],
        })
        self.assertTrue(prompt.startswith("TASK_MODE: coding"))
        self.assertIn("feature_files/example.md", prompt)
        self.assertIn("Commit every completed change", prompt)

    def test_task_repair_prompt_contains_original_task_and_failure(self):
        prompt = build_task_repair_prompt(
            {"prompt": "Build it"}, "COMMAND: pytest\nSTDERR: failed", 2, 3
        )

        self.assertTrue(prompt.startswith("TASK_MODE: coding"))
        self.assertIn("Build it", prompt)
        self.assertIn("COMMAND: pytest", prompt)
        self.assertIn("2/3", prompt)

    def test_resolver_prompt_contains_all_goals_and_failure(self):
        prompt = build_resolver_prompt(
            {"id": "batch"},
            [{"prompt": "First goal"}, {"prompt": "Second goal"}],
            "merge conflict",
        )
        self.assertTrue(prompt.startswith("TASK_MODE: integrating"))
        self.assertIn("First goal", prompt)
        self.assertIn("Second goal", prompt)
        self.assertIn("merge conflict", prompt)


class CancelOrchestratorTests(unittest.TestCase):
    def test_cancel_reply_helpers(self):
        self.assertTrue(reply_indicates_cancel("Cursor was cancelled before execution"))
        self.assertTrue(reply_indicates_cancel("Codex was cancelled before execution"))
        self.assertFalse(reply_indicates_cancel("Cursor failed with exit code 1"))

    @patch("daedalus_daemon.orchestrator.remove_worktree")
    @patch("daedalus_daemon.orchestrator.record_daemon_event")
    @patch("daedalus_daemon.orchestrator.update_agent_task", return_value=True)
    @patch("daedalus_daemon.orchestrator.load_worktree_settings")
    def test_cancels_queued_task_before_admit(
        self, mock_settings, mock_update, mock_event, mock_remove
    ):
        mock_settings.return_value = {"cancelKillGraceSeconds": 2}
        orchestrator = GitWorktreeOrchestrator({}, lambda *a: "", lambda *a: "")
        task = {
            "id": "task-1",
            "repository": "/repo",
            "status": "queued",
            "cancel_requested": True,
            "worktree_path": "",
        }

        orchestrator._handle_cancel_requests([task], [])

        self.assertEqual(mock_update.call_args[0][1], "task-1")
        self.assertEqual(mock_update.call_args[0][2], "queued")
        self.assertEqual(mock_update.call_args[0][3]["status"], "cancelled")
        self.assertEqual(mock_update.call_args[0][3]["error"], CANCELLED_BY_USER)
        mock_event.assert_called_once()
        mock_remove.assert_not_called()

    @patch("daedalus_daemon.orchestrator.remove_worktree")
    @patch("daedalus_daemon.orchestrator.record_daemon_event")
    @patch("daedalus_daemon.orchestrator.update_agent_task", return_value=True)
    @patch("daedalus_daemon.orchestrator.load_worktree_settings")
    def test_kills_running_task_and_marks_cancelled_when_no_future(
        self, mock_settings, mock_update, mock_event, mock_remove
    ):
        mock_settings.return_value = {"cancelKillGraceSeconds": 1.5}
        killed = []

        def fake_kill(task_id, grace_seconds=2.0):
            killed.append((task_id, grace_seconds))
            return True

        orchestrator = GitWorktreeOrchestrator(
            {}, lambda *a: "", lambda *a: "", kill_agent=fake_kill
        )
        task = {
            "id": "task-2",
            "repository": "/repo",
            "status": "running",
            "cancel_requested": True,
            "worktree_path": "/tmp/worktree",
        }

        orchestrator._handle_cancel_requests([task], [])

        self.assertEqual(killed, [("task-2", 1.5)])
        mock_update.assert_called_once()
        self.assertEqual(mock_update.call_args[0][3]["status"], "cancelled")
        mock_remove.assert_called_once_with("/repo", "/tmp/worktree", force=True)
        mock_event.assert_called_once()

    @patch("daedalus_daemon.orchestrator.get_agent_task_control")
    def test_run_task_skips_repair_when_cancel_requested(self, mock_control):
        mock_control.return_value = {
            "id": "task-3",
            "cancel_requested": True,
        }
        orchestrator = GitWorktreeOrchestrator({}, lambda *a: "ok", lambda *a: "ok")
        task = {
            "id": "task-3",
            "repository": "/repo",
            "provider": "cursor",
            "model": "",
            "reasoning": "",
            "prompt": "Build it",
            "base_commit": "abc",
            "worktree_path": "/tmp/worktree",
            "cancel_requested": False,
            "verification_attempts": 0,
        }

        with (
            patch.object(orchestrator, "_run_task_agent", return_value="agent ok"),
            patch("daedalus_daemon.orchestrator.update_agent_task"),
            patch("daedalus_daemon.orchestrator.commit_worktree_changes", return_value=True),
            patch("daedalus_daemon.orchestrator.record_daemon_event"),
            patch("daedalus_daemon.orchestrator.verification_commands_for_worktree", return_value=[["true"]]),
            patch("daedalus_daemon.orchestrator.git_output", side_effect=["", "def456"]),
            patch(
                "daedalus_daemon.orchestrator.run_verification",
                return_value={"ok": False, "output": "tests failed"},
            ),
        ):
            outcome = orchestrator._run_task(task, {
                "verificationCommands": [],
                "taskVerificationAttemptLimit": 3,
            })

        self.assertFalse(outcome["ok"])
        self.assertTrue(outcome["cancelled"])
        self.assertEqual(outcome["error"], CANCELLED_BY_USER)

    @patch("daedalus_daemon.orchestrator.upsert_orchestration_batch")
    @patch("daedalus_daemon.orchestrator.remove_worktree")
    @patch("daedalus_daemon.orchestrator.record_daemon_event")
    @patch("daedalus_daemon.orchestrator.update_agent_task", return_value=True)
    @patch("daedalus_daemon.orchestrator.load_worktree_settings")
    def test_ready_cancel_excludes_task_from_collecting_batch(
        self, mock_settings, mock_update, mock_event, mock_remove, mock_upsert
    ):
        mock_settings.return_value = {"cancelKillGraceSeconds": 2}
        orchestrator = GitWorktreeOrchestrator({}, lambda *a: "", lambda *a: "")
        task = {
            "id": "task-4",
            "repository": "/repo",
            "status": "ready",
            "cancel_requested": True,
            "worktree_path": "/tmp/worktree",
            "batch_id": "batch-1",
        }
        batch = {
            "id": "batch-1",
            "repository": "/repo",
            "status": "collecting",
            "task_ids": ["task-4", "task-5"],
        }

        orchestrator._handle_cancel_requests([task], [batch])

        self.assertEqual(batch["task_ids"], ["task-5"])
        mock_upsert.assert_called_once()
        self.assertEqual(mock_update.call_args[0][3]["status"], "cancelled")
        mock_remove.assert_called_once_with("/repo", "/tmp/worktree", force=True)
        mock_event.assert_called_once()

    @patch("daedalus_daemon.orchestrator.record_daemon_event")
    @patch("daedalus_daemon.orchestrator.update_agent_task", return_value=True)
    @patch("daedalus_daemon.orchestrator.remove_worktree")
    def test_restart_recovery_honors_cancel_requested(
        self, mock_remove, mock_update, mock_event
    ):
        orchestrator = GitWorktreeOrchestrator({}, lambda *a: "", lambda *a: "")
        task = {
            "id": "task-5",
            "repository": "/repo",
            "status": "running",
            "cancel_requested": True,
            "worktree_path": "/tmp/worktree",
        }

        orchestrator._recover_interrupted_work([task], [])

        self.assertEqual(mock_update.call_args[0][3]["status"], "cancelled")
        mock_remove.assert_called_once_with("/repo", "/tmp/worktree", force=True)
        mock_event.assert_called_once()

    @patch("daedalus_daemon.orchestrator.run_process")
    def test_force_remove_worktree_passes_force_flag(self, mock_process):
        mock_process.return_value.returncode = 0
        remove_worktree("/repo", "/tmp/worktree", force=True)
        mock_process.assert_called_once_with(
            "/repo",
            ["git", "worktree", "remove", "--force", "/tmp/worktree"],
        )


class MigrationReconcileTests(unittest.TestCase):
    def test_no_duplicates_yields_empty_plan(self):
        with tempfile.TemporaryDirectory() as directory:
            migrations = Path(directory)
            (migrations / "013_alpha.sql").write_text("-- a\n", encoding="utf-8")
            (migrations / "014_beta.sql").write_text("-- b\n", encoding="utf-8")

            self.assertEqual(plan_migration_renames(migrations), [])

    def test_triple_prefix_uses_next_free_after_max(self):
        with tempfile.TemporaryDirectory() as directory:
            migrations = Path(directory)
            (migrations / "012_base.sql").write_text("-- base\n", encoding="utf-8")
            (migrations / "013_keep.sql").write_text("-- keep\n", encoding="utf-8")
            (migrations / "013_second.sql").write_text("-- second\n", encoding="utf-8")
            (migrations / "013_third.sql").write_text("-- third\n", encoding="utf-8")

            plan = plan_migration_renames(migrations)
            mapping = {source.name: target.name for source, target in plan}

            self.assertEqual(
                mapping,
                {
                    "013_second.sql": "014_second.sql",
                    "013_third.sql": "015_third.sql",
                },
            )
            self.assertTrue((migrations / "013_keep.sql").exists())

    def test_collision_skips_already_used_neighbors(self):
        with tempfile.TemporaryDirectory() as directory:
            migrations = Path(directory)
            (migrations / "015_alpha.sql").write_text("-- alpha\n", encoding="utf-8")
            (migrations / "015_beta.sql").write_text("-- beta\n", encoding="utf-8")
            for number in range(16, 26):
                (migrations / f"{number:03d}_slot.sql").write_text("-- slot\n", encoding="utf-8")

            plan = plan_migration_renames(migrations)

            self.assertEqual(len(plan), 1)
            source, target = plan[0]
            self.assertEqual(source.name, "015_beta.sql")
            self.assertEqual(target.name, "026_beta.sql")

    def test_padding_matches_folder_width(self):
        with tempfile.TemporaryDirectory() as directory:
            migrations = Path(directory)
            (migrations / "013_alpha.sql").write_text("-- alpha\n", encoding="utf-8")
            (migrations / "013_beta.sql").write_text("-- beta\n", encoding="utf-8")

            plan = plan_migration_renames(migrations)
            self.assertEqual(len(plan), 1)
            self.assertEqual(plan[0][1].name, "014_beta.sql")

        with tempfile.TemporaryDirectory() as directory:
            migrations = Path(directory)
            (migrations / "015_alpha.sql").write_text("-- alpha\n", encoding="utf-8")
            (migrations / "015_beta.sql").write_text("-- beta\n", encoding="utf-8")
            for number in range(16, 26):
                (migrations / f"{number:03d}_slot.sql").write_text("-- slot\n", encoding="utf-8")

            plan = plan_migration_renames(migrations)
            self.assertEqual(plan[0][1].name, "026_beta.sql")


if __name__ == "__main__":
    unittest.main()
