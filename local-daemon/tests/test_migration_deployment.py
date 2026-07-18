import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from daedalus_daemon.migration_deployment import (
    deploy_pending_migrations,
    migration_files_changed,
    project_ref_for_repository,
    redact,
    project_lock,
    validate_migrations,
)


class MigrationDeploymentTests(unittest.TestCase):
    def test_detects_only_canonical_migration_changes(self):
        def runner(_directory, _command, _timeout):
            return {"command": _command, "returncode": 0, "stdout": "supabase/migrations/037_new.sql\n", "stderr": ""}

        self.assertTrue(migration_files_changed("/worktree", "base", runner))

    def test_validates_names_and_duplicate_versions(self):
        with tempfile.TemporaryDirectory() as directory:
            migrations = Path(directory) / "supabase/migrations"
            migrations.mkdir(parents=True)
            (migrations / "001_first.sql").write_text("-- first", encoding="utf-8")
            (migrations / "001_second.sql").write_text("-- second", encoding="utf-8")
            self.assertIn("Duplicate", validate_migrations(directory))

    def test_selects_only_exact_repository_mapping(self):
        repository = str(Path("/tmp/daedalus").resolve())
        project_ref, error = project_ref_for_repository(repository, [repository + "::project-a"])
        self.assertEqual(project_ref, "project-a")
        self.assertEqual(error, "")

        project_ref, error = project_ref_for_repository(repository + "-other", [repository + "::project-a"])
        self.assertIsNone(project_ref)
        self.assertIn(str(Path(repository + "-other").resolve()), error)

    def test_rejects_ambiguous_repository_mappings(self):
        repository = str(Path("/tmp/daedalus").resolve())
        project_ref, error = project_ref_for_repository(repository, [
            repository + "::project-a", repository + "::project-b",
        ])
        self.assertIsNone(project_ref)
        self.assertIn("Ambiguous", error)
        self.assertIn(repository, error)

    def test_redacts_credentials(self):
        self.assertNotIn("secret", redact("SUPABASE_ACCESS_TOKEN=secret"))
        self.assertNotIn("secret", redact("postgres://user:secret@host/database"))

    def test_serializes_by_project_reference(self):
        self.assertIs(project_lock("project-a"), project_lock("project-a"))
        self.assertIsNot(project_lock("project-a"), project_lock("project-b"))

    def test_task_worktree_uses_cli_session_without_daemon_credential_environment(self):
        commands = []

        def runner(_directory, command, _timeout):
            commands.append(command)
            if command[:3] == ["git", "diff", "--name-only"]:
                return {"command": command, "returncode": 0, "stdout": "supabase/migrations/037_new.sql\n", "stderr": ""}
            if command == ["supabase", "db", "push", "--dry-run", "--linked"]:
                return {"command": command, "returncode": 0, "stdout": "Would apply migration 037_new.sql", "stderr": ""}
            return {"command": command, "returncode": 0, "stdout": "", "stderr": ""}

        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {}, clear=True):
            primary_repository = Path(directory) / "primary"
            worktree = Path(directory) / "task-worktree"
            (worktree / "supabase/migrations").mkdir(parents=True)
            (worktree / "supabase/migrations/037_new.sql").write_text("-- new", encoding="utf-8")
            settings = {"enabled": True, "allowedMappings": [str(primary_repository.resolve()) + "::project-a"], "commandTimeoutSeconds": 1, "requireDryRun": True, "resolverAttemptLimit": 3}
            result = deploy_pending_migrations(str(worktree), str(primary_repository), "base", settings, runner)

        self.assertTrue(result["ok"])
        self.assertIn(["supabase", "link", "--project-ref", "project-a"], commands)
        self.assertIn(["supabase", "migration", "list", "--linked"], commands)
        self.assertIn(["supabase", "db", "push", "--linked"], commands)

    def test_non_pending_dry_run_never_pushes(self):
        commands = []

        def runner(_directory, command, _timeout):
            commands.append(command)
            if command[:3] == ["git", "diff", "--name-only"]:
                return {"command": command, "returncode": 0, "stdout": "supabase/migrations/037_new.sql\n", "stderr": ""}
            return {"command": command, "returncode": 0, "stdout": "No migrations to apply", "stderr": ""}

        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {
            "SUPABASE_ACCESS_TOKEN": "token", "SUPABASE_DB_PASSWORD": "password",
        }, clear=True):
            Path(directory, "supabase/migrations").mkdir(parents=True)
            Path(directory, "supabase/migrations/037_new.sql").write_text("-- new", encoding="utf-8")
            settings = {"enabled": True, "allowedMappings": [str(Path(directory).resolve()) + "::project-a"], "commandTimeoutSeconds": 1, "requireDryRun": True, "resolverAttemptLimit": 3}
            result = deploy_pending_migrations(directory, directory, "base", settings, runner)

        self.assertEqual(result["state"], "no_pending")
        self.assertNotIn(["supabase", "db", "push", "--linked"], commands)

    def test_unlisted_repository_is_blocked_before_supabase_preflight(self):
        commands = []

        def runner(_directory, command, _timeout):
            commands.append(command)
            return {"command": command, "returncode": 0, "stdout": "supabase/migrations/037_new.sql\n", "stderr": ""}

        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {
            "SUPABASE_ACCESS_TOKEN": "token", "SUPABASE_DB_PASSWORD": "password",
        }, clear=True):
            Path(directory, "supabase/migrations").mkdir(parents=True)
            Path(directory, "supabase/migrations/037_new.sql").write_text("-- new", encoding="utf-8")
            settings = {"enabled": True, "allowedMappings": [str(Path(directory, "other").resolve()) + "::project-a"], "commandTimeoutSeconds": 1, "requireDryRun": True, "resolverAttemptLimit": 3}
            result = deploy_pending_migrations(directory, directory, "base", settings, runner)

        self.assertFalse(result["ok"])
        self.assertIn("No allowlisted", result["error"])
        self.assertIn(str(Path(directory).resolve()), result["error"])
        self.assertEqual(commands, [["git", "diff", "--name-only", "base..HEAD"]])

    def test_ambiguous_repository_mapping_is_blocked_before_supabase_preflight(self):
        commands = []

        def runner(_directory, command, _timeout):
            commands.append(command)
            return {"command": command, "returncode": 0, "stdout": "supabase/migrations/037_new.sql\n", "stderr": ""}

        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {
            "SUPABASE_ACCESS_TOKEN": "token", "SUPABASE_DB_PASSWORD": "password",
        }, clear=True):
            Path(directory, "supabase/migrations").mkdir(parents=True)
            Path(directory, "supabase/migrations/037_new.sql").write_text("-- new", encoding="utf-8")
            repository = str(Path(directory).resolve())
            settings = {"enabled": True, "allowedMappings": [repository + "::project-a", repository + "::project-b"], "commandTimeoutSeconds": 1, "requireDryRun": True, "resolverAttemptLimit": 3}
            result = deploy_pending_migrations(directory, directory, "base", settings, runner)

        self.assertFalse(result["ok"])
        self.assertIn("Ambiguous", result["error"])
        self.assertEqual(commands, [["git", "diff", "--name-only", "base..HEAD"]])

    def test_cancellation_before_deployment_never_runs_cli(self):
        commands = []

        def runner(_directory, command, _timeout):
            commands.append(command)
            return {"command": command, "returncode": 0, "stdout": "supabase/migrations/037_new.sql\n", "stderr": ""}

        result = deploy_pending_migrations(
            "/worktree", "/repository", "base",
            {"enabled": True, "allowedMappings": [], "commandTimeoutSeconds": 1, "requireDryRun": True, "resolverAttemptLimit": 3},
            command_runner=runner,
            cancelled=lambda: True,
        )

        self.assertFalse(result["ok"])
        self.assertIn("cancelled before", result["error"])
        self.assertEqual(commands, [["git", "diff", "--name-only", "base..HEAD"]])
