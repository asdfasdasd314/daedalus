import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from daedalus_daemon.architecture import (
    build_architecture_prompt,
    architecture_document_path,
    architecture_log_path,
    classify_architecture_result,
    collect_changed_files,
    collect_graph_community_evidence,
    collect_relevant_feature_files,
    generate_architecture_view,
    load_architecture_settings,
)


def valid_architecture_response():
    return json.dumps({
        "schema_version": "1.0",
        "summary": "The tested system.",
        "systems": [{
            "id": "owned_system",
            "name": "Owned System",
            "summary": "Owns the tested behavior.",
            "files": ["src/owned.py"],
        }],
        "channels": [],
    })


class ArchitectureEvidenceTests(unittest.TestCase):
    def test_classifies_structured_validation_and_operational_results(self):
        self.assertEqual(classify_architecture_result({
            "status": "completed", "architecture_document": {},
        }), "structured_completion")
        self.assertEqual(classify_architecture_result({
            "status": "failed", "failure_kind": "validation_exhausted",
        }), "validation_attempts_exhausted")
        self.assertEqual(classify_architecture_result({
            "status": "failed", "failure_kind": "operational",
        }), "other_generation_failure")

    def test_dedicated_codex_settings_and_read_only_generation(self):
        settings = load_architecture_settings()
        calls = []

        def run_codex(*arguments, **keywords):
            calls.append((arguments, keywords))
            return valid_architecture_response()

        with (
            patch("daedalus_daemon.architecture.collect_changed_files", return_value=[]),
            patch("daedalus_daemon.architecture.add_snapshot_worktree"),
            patch("daedalus_daemon.architecture.remove_snapshot_worktree"),
            patch("daedalus_daemon.architecture.collect_relevant_feature_files", return_value=[]),
            patch("daedalus_daemon.architecture.collect_graph_community_evidence", return_value=[]),
        ):
            result = generate_architecture_view({
                "id": "view-1",
                "repository": "/repo",
                "base_commit": "base",
                "final_commit": "final",
                "generation": 1,
                "targeted_feature_paths": [],
            }, settings, run_codex)

        self.assertEqual(settings, {
            "provider": "codex",
            "model": "gpt-5.6-terra",
            "reasoning": "high",
            "maxConcurrentGenerations": 1,
            "maxValidationAttempts": 3,
            "maxFailureTracebackChars": 8000,
        })
        self.assertEqual(result["status"], "completed")
        self.assertEqual(calls[0][0][2:4], ("gpt-5.6-terra", "high"))
        self.assertFalse(calls[0][1]["ask_mode"])
        self.assertEqual(calls[0][1]["writable_directories"], ["/repo"])

    def test_collects_file_only_diff_and_excludes_graphify_outputs(self):
        with tempfile.TemporaryDirectory() as directory:
            repository = Path(directory)
            self.git(repository, "init")
            self.git(repository, "config", "user.email", "test@example.com")
            self.git(repository, "config", "user.name", "Test User")
            (repository / "modified.py").write_text("before\n", encoding="utf-8")
            (repository / "renamed.py").write_text("rename\n", encoding="utf-8")
            (repository / "deleted.py").write_text("delete\n", encoding="utf-8")
            (repository / "graphify-out").mkdir()
            (repository / "graphify-out" / "graph.json").write_text("{}\n", encoding="utf-8")
            self.git(repository, "add", ".")
            self.git(repository, "commit", "-m", "base")
            base = self.git(repository, "rev-parse", "HEAD")

            (repository / "modified.py").write_text("after\n", encoding="utf-8")
            (repository / "added.py").write_text("added\n", encoding="utf-8")
            (repository / "renamed.py").rename(repository / "new-name.py")
            (repository / "deleted.py").unlink()
            (repository / "graphify-out" / "graph.json").write_text('{"updated": true}\n', encoding="utf-8")
            self.git(repository, "add", "-A")
            self.git(repository, "commit", "-m", "final")
            final = self.git(repository, "rev-parse", "HEAD")

            changed = collect_changed_files(repository, base, final)

        paths = {item["path"] for item in changed}
        self.assertIn("modified.py", paths)
        self.assertIn("added.py", paths)
        self.assertIn("new-name.py", paths)
        self.assertIn("deleted.py", paths)
        self.assertNotIn("graphify-out/graph.json", paths)

    def test_combines_feature_ownership_and_changed_graph_communities(self):
        with tempfile.TemporaryDirectory() as directory:
            snapshot = Path(directory)
            feature_root = snapshot / "feature_files"
            graph_root = snapshot / "graphify-out"
            feature_root.mkdir()
            graph_root.mkdir()
            (feature_root / "owned.md").write_text(
                "# Owned\n\n## Relevant Files\n- `src/owned.py`\n",
                encoding="utf-8",
            )
            graph = {
                "nodes": [
                    {"id": "file", "label": "owned.py", "file_type": "code", "source_file": "src/owned.py", "community": 4},
                    {"id": "symbol", "label": "Owned", "file_type": "code", "source_file": "src/owned.py", "community": 4},
                    {"id": "other", "label": "Other", "file_type": "code", "source_file": "src/other.py", "community": 9},
                ],
                "links": [
                    {"source": "file", "target": "symbol", "relation": "contains", "confidence": "EXTRACTED"},
                    {"source": "other", "target": "symbol", "relation": "calls", "confidence": "EXTRACTED"},
                ],
            }
            (graph_root / "graph.json").write_text(json.dumps(graph), encoding="utf-8")
            changed = [{"status": "M", "path": "src/owned.py"}]

            feature_paths = collect_relevant_feature_files(snapshot, changed, [])
            evidence = collect_graph_community_evidence(snapshot, changed)

        self.assertEqual(feature_paths, ["feature_files/owned.md"])
        self.assertEqual([item["community"] for item in evidence], [4])
        self.assertEqual(len(evidence[0]["members"]), 2)
        self.assertEqual(len(evidence[0]["touchingRelationships"]), 2)

    def test_prompt_requires_final_state_json_without_change_narration(self):
        prompt = build_architecture_prompt(
            [{"status": "M", "path": "src/owned.py"}],
            ["feature_files/owned.md"],
            [{"community": 4, "members": []}],
            Path("/repo/shared/architecture/architecture-view-view-1-generation-1.json"),
        )

        self.assertIn('"$schema": "https://json-schema.org/draft/2020-12/schema"', prompt)
        self.assertIn('"source_system_id"', prompt)
        self.assertIn("never describe the changes", prompt)
        self.assertIn("Write one complete raw JSON object", prompt)
        self.assertIn("After writing the file", prompt)

    def test_reads_model_document_artifact_and_records_each_interaction(self):
        with tempfile.TemporaryDirectory() as directory:
            repository = Path(directory)

            def run_codex(*arguments, **_keywords):
                document_path = architecture_document_path(repository, "view-1", 1)
                document_path.parent.mkdir(parents=True)
                document_path.write_text(valid_architecture_response(), encoding="utf-8")
                return "Document written."

            with (
                patch("daedalus_daemon.architecture.collect_changed_files", return_value=[]),
                patch("daedalus_daemon.architecture.add_snapshot_worktree"),
                patch("daedalus_daemon.architecture.remove_snapshot_worktree"),
                patch("daedalus_daemon.architecture.collect_relevant_feature_files", return_value=[]),
                patch("daedalus_daemon.architecture.collect_graph_community_evidence", return_value=[]),
            ):
                result = generate_architecture_view({
                    "id": "view-1", "repository": str(repository), "base_commit": "base",
                    "final_commit": "final", "generation": 1, "targeted_feature_paths": [],
                }, load_architecture_settings(), run_codex)

            log = json.loads(architecture_log_path(repository, "view-1", 1, 1).read_text())

        self.assertEqual(result["status"], "completed")
        self.assertEqual(log["modelStdout"], "Document written.")
        self.assertEqual(log["documentResponse"], valid_architecture_response())
        self.assertTrue(log["usedDocumentArtifact"])

    def test_validation_retries_succeed_on_third_attempt_with_corrective_details(self):
        calls = []
        progress = []
        responses = iter([
            "not json",
            json.dumps({"schema_version": "1.0"}),
            valid_architecture_response(),
        ])

        def run_codex(*arguments, **keywords):
            calls.append(arguments[1])
            return next(responses)

        with (
            patch("daedalus_daemon.architecture.collect_changed_files", return_value=[{"status": "M", "path": "src/owned.py"}]),
            patch("daedalus_daemon.architecture.add_snapshot_worktree"),
            patch("daedalus_daemon.architecture.remove_snapshot_worktree"),
            patch("daedalus_daemon.architecture.collect_relevant_feature_files", return_value=["feature_files/owned.md"]),
            patch("daedalus_daemon.architecture.collect_graph_community_evidence", return_value=[]),
        ):
            result = generate_architecture_view({
                "id": "view-1", "repository": "/repo", "base_commit": "base",
                "final_commit": "final", "generation": 1, "targeted_feature_paths": [],
            }, load_architecture_settings(), run_codex,
               lambda _view, stage, detail="", attempt=None, total_attempts=None: progress.append(
                   (stage, detail, attempt, total_attempts),
               ))

        self.assertEqual(result["status"], "completed")
        self.assertEqual(len(calls), 3)
        self.assertIn("line 1, column 1", calls[1])
        self.assertIn("schema_version", calls[2])
        self.assertIn("feature_files/owned.md", calls[2])
        self.assertIn("Published JSON Schema", calls[2])
        self.assertIn("complete corrected document, not a patch", calls[2])
        self.assertEqual([item[0] for item in progress], [
            "preparing_snapshot", "collecting_evidence", "generating_document",
            "validating_document", "correcting_document", "generating_document",
            "validating_document", "correcting_document", "generating_document",
            "validating_document", "finalizing",
        ])
        self.assertEqual(progress[4][1], "Correcting document, attempt 2 of 3.")

    def test_provider_failure_preserves_last_successful_progress_stage(self):
        progress = []
        with (
            patch("daedalus_daemon.architecture.collect_changed_files", return_value=[]),
            patch("daedalus_daemon.architecture.add_snapshot_worktree"),
            patch("daedalus_daemon.architecture.remove_snapshot_worktree"),
            patch("daedalus_daemon.architecture.collect_relevant_feature_files", return_value=[]),
            patch("daedalus_daemon.architecture.collect_graph_community_evidence", return_value=[]),
        ):
            result = generate_architecture_view({
                "id": "view-1", "repository": "/repo", "base_commit": "base",
                "final_commit": "final", "generation": 1, "targeted_feature_paths": [],
            }, load_architecture_settings(), lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("provider unavailable")),
               lambda _view, stage, *_args: progress.append(stage))
        self.assertEqual(result["failure_kind"], "operational")
        self.assertEqual(progress[-1], "finalizing")

    def test_validation_can_succeed_on_attempts_one_two_and_three(self):
        for success_attempt in (1, 2, 3):
            responses = iter(["not json"] * (success_attempt - 1) + [valid_architecture_response()])
            calls = []

            def run_codex(*arguments, **keywords):
                calls.append(arguments)
                return next(responses)

            with (
                patch("daedalus_daemon.architecture.collect_changed_files", return_value=[]),
                patch("daedalus_daemon.architecture.add_snapshot_worktree"),
                patch("daedalus_daemon.architecture.remove_snapshot_worktree"),
                patch("daedalus_daemon.architecture.collect_relevant_feature_files", return_value=[]),
                patch("daedalus_daemon.architecture.collect_graph_community_evidence", return_value=[]),
            ):
                result = generate_architecture_view({
                    "id": "view-1", "repository": "/repo", "base_commit": "base",
                    "final_commit": "final", "generation": 1, "targeted_feature_paths": [],
                }, load_architecture_settings(), run_codex)

            with self.subTest(success_attempt=success_attempt):
                self.assertEqual(result["status"], "completed")
                self.assertEqual(len(calls), success_attempt)

    def test_three_invalid_outputs_exhaust_validation_without_returning_output(self):
        calls = []

        def run_codex(*arguments, **keywords):
            calls.append(arguments)
            return "```json\n{}\n```"

        with (
            patch("daedalus_daemon.architecture.collect_changed_files", return_value=[]),
            patch("daedalus_daemon.architecture.add_snapshot_worktree"),
            patch("daedalus_daemon.architecture.remove_snapshot_worktree"),
            patch("daedalus_daemon.architecture.collect_relevant_feature_files", return_value=[]),
            patch("daedalus_daemon.architecture.collect_graph_community_evidence", return_value=[]),
        ):
            result = generate_architecture_view({
                "id": "view-1", "repository": "/repo", "base_commit": "base",
                "final_commit": "final", "generation": 1, "targeted_feature_paths": [],
            }, load_architecture_settings(), run_codex)

        self.assertEqual(len(calls), 3)
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["failure_kind"], "validation_exhausted")
        self.assertIsNone(result["architecture_document"])
        self.assertIn("validation exhausted after 3 attempts", result["error"])
        self.assertEqual(result["failure_details"]["stage"], "document_validation")

    def test_provider_failure_is_not_retried(self):
        calls = []

        def run_codex(*arguments, **keywords):
            calls.append(arguments)
            raise RuntimeError("provider unavailable")

        with (
            patch("daedalus_daemon.architecture.collect_changed_files", return_value=[]),
            patch("daedalus_daemon.architecture.add_snapshot_worktree"),
            patch("daedalus_daemon.architecture.remove_snapshot_worktree"),
            patch("daedalus_daemon.architecture.collect_relevant_feature_files", return_value=[]),
            patch("daedalus_daemon.architecture.collect_graph_community_evidence", return_value=[]),
        ):
            result = generate_architecture_view({
                "id": "view-1", "repository": "/repo", "base_commit": "base",
                "final_commit": "final", "generation": 1, "targeted_feature_paths": [],
            }, load_architecture_settings(), run_codex)

        self.assertEqual(len(calls), 1)
        self.assertEqual(result["failure_kind"], "operational")
        self.assertIn("provider unavailable", result["error"])
        self.assertEqual(result["failure_details"]["stage"], "model_invocation")
        self.assertIn("RuntimeError: provider unavailable", result["failure_details"]["traceback"])

    @staticmethod
    def git(repository: Path, *arguments: str) -> str:
        process = subprocess.run(
            ["git", *arguments], cwd=repository,
            capture_output=True, text=True, check=True,
        )
        return process.stdout.strip()


if __name__ == "__main__":
    unittest.main()
