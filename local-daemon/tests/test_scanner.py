import sys
import tempfile
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from daedalus_daemon import scan_feature_file_projects, scan_parameter_file_projects


class ScanFeatureFileProjectsTests(unittest.TestCase):
    def test_returns_two_projects_with_feature_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)

            alpha = root / "alpha"
            beta = root / "beta"
            (alpha / "feature_files").mkdir(parents=True)
            (beta / "feature_files" / "nested").mkdir(parents=True)

            (alpha / "feature_files" / "alpha.md").write_text("alpha one", encoding="utf-8")
            (beta / "feature_files" / "beta.md").write_text("beta one", encoding="utf-8")

            result = scan_feature_file_projects(root)

            self.assertEqual(
                result[str(alpha.resolve())],
                [{
                    "path": "feature_files/alpha.md",
                    "markdown": "alpha one",
                }],
            )
            self.assertEqual(
                result[str(beta.resolve())],
                [{
                    "path": "feature_files/beta.md",
                    "markdown": "beta one",
                }],
            )
            self.assertEqual(len(result), 2)

    def test_returns_empty_dictionary_when_no_feature_files_exist(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)

            self.assertEqual(scan_feature_file_projects(root), {})

    def test_reads_markdown_in_sorted_order_and_ignores_non_markdown_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            project = root / "project"
            feature_files = project / "feature_files"
            feature_files.mkdir(parents=True)

            (feature_files / "b.md").write_text("bravo", encoding="utf-8")
            (feature_files / "a.md").write_text("alpha", encoding="utf-8")
            (feature_files / "notes.txt").write_text("ignore me", encoding="utf-8")
            (feature_files / "nested").mkdir()
            (feature_files / "nested" / "c.md").write_text("charlie", encoding="utf-8")

            result = scan_feature_file_projects(root)

            self.assertEqual(
                result[str(project.resolve())],
                [
                    {
                        "path": "feature_files/a.md",
                        "markdown": "alpha",
                    },
                    {
                        "path": "feature_files/b.md",
                        "markdown": "bravo",
                    },
                    {
                        "path": "feature_files/nested/c.md",
                        "markdown": "charlie",
                    },
                ],
            )

    def test_same_named_projects_do_not_collide(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            left = root / "workspace" / "project"
            right = root / "archive" / "project"
            (left / "feature_files").mkdir(parents=True)
            (right / "feature_files").mkdir(parents=True)

            (left / "feature_files" / "left.md").write_text("left", encoding="utf-8")
            (right / "feature_files" / "right.md").write_text("right", encoding="utf-8")

            result = scan_feature_file_projects(root)

            self.assertEqual(
                result[str(left.resolve())],
                [{
                    "path": "feature_files/left.md",
                    "markdown": "left",
                }],
            )
            self.assertEqual(
                result[str(right.resolve())],
                [{
                    "path": "feature_files/right.md",
                    "markdown": "right",
                }],
            )

    def test_ignores_linked_git_worktree_feature_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            project = root / "project"
            worktree = root / ".project-worktrees" / "project" / "task"
            (project / "feature_files").mkdir(parents=True)
            (worktree / "feature_files").mkdir(parents=True)

            (project / "feature_files" / "current.md").write_text(
                "current", encoding="utf-8"
            )
            (worktree / ".git").write_text(
                "gitdir: /example/git/worktrees/task\n", encoding="utf-8"
            )
            (worktree / "feature_files" / "stale.md").write_text(
                "stale", encoding="utf-8"
            )

            self.assertEqual(
                scan_feature_file_projects(root),
                {
                    str(project.resolve()): [{
                        "path": "feature_files/current.md",
                        "markdown": "current",
                    }],
                },
            )

    def test_does_not_search_daedalus_worktree_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            project = root / "project"
            worktree = root / ".daedalus-worktrees" / "project" / "task"
            (project / "feature_files").mkdir(parents=True)
            (worktree / "feature_files").mkdir(parents=True)

            (project / "feature_files" / "current.md").write_text(
                "current", encoding="utf-8"
            )
            (worktree / "feature_files" / "stale.md").write_text(
                "stale", encoding="utf-8"
            )

            self.assertEqual(
                scan_feature_file_projects(root),
                {
                    str(project.resolve()): [{
                        "path": "feature_files/current.md",
                        "markdown": "current",
                    }],
                },
            )


class ScanParameterFileProjectsTests(unittest.TestCase):
    def test_returns_two_projects_with_parameter_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)

            alpha = root / "alpha"
            beta = root / "beta"
            (alpha / "parameter_files").mkdir(parents=True)
            (beta / "parameter_files" / "nested").mkdir(parents=True)

            (alpha / "parameter_files" / "alpha.toml").write_text("alpha = 1", encoding="utf-8")
            (beta / "parameter_files" / "beta.toml").write_text("beta = 2", encoding="utf-8")

            result = scan_parameter_file_projects(root)

            self.assertEqual(
                result[str(alpha.resolve())],
                [{
                    "path": "parameter_files/alpha.toml",
                    "toml": "alpha = 1",
                }],
            )
            self.assertEqual(
                result[str(beta.resolve())],
                [{
                    "path": "parameter_files/beta.toml",
                    "toml": "beta = 2",
                }],
            )
            self.assertEqual(len(result), 2)

    def test_returns_empty_dictionary_when_no_parameter_files_exist(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)

            self.assertEqual(scan_parameter_file_projects(root), {})

    def test_reads_toml_in_sorted_order_and_ignores_non_toml_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            project = root / "project"
            parameter_files = project / "parameter_files"
            parameter_files.mkdir(parents=True)

            (parameter_files / "b.toml").write_text("bravo = 2", encoding="utf-8")
            (parameter_files / "a.toml").write_text("alpha = 1", encoding="utf-8")
            (parameter_files / "notes.md").write_text("ignore me", encoding="utf-8")
            (parameter_files / "nested").mkdir()
            (parameter_files / "nested" / "c.toml").write_text("charlie = 3", encoding="utf-8")

            result = scan_parameter_file_projects(root)

            self.assertEqual(
                result[str(project.resolve())],
                [
                    {
                        "path": "parameter_files/a.toml",
                        "toml": "alpha = 1",
                    },
                    {
                        "path": "parameter_files/b.toml",
                        "toml": "bravo = 2",
                    },
                    {
                        "path": "parameter_files/nested/c.toml",
                        "toml": "charlie = 3",
                    },
                ],
            )

    def test_same_named_projects_do_not_collide(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            left = root / "workspace" / "project"
            right = root / "archive" / "project"
            (left / "parameter_files").mkdir(parents=True)
            (right / "parameter_files").mkdir(parents=True)

            (left / "parameter_files" / "left.toml").write_text("left = true", encoding="utf-8")
            (right / "parameter_files" / "right.toml").write_text("right = true", encoding="utf-8")

            result = scan_parameter_file_projects(root)

            self.assertEqual(
                result[str(left.resolve())],
                [{
                    "path": "parameter_files/left.toml",
                    "toml": "left = true",
                }],
            )
            self.assertEqual(
                result[str(right.resolve())],
                [{
                    "path": "parameter_files/right.toml",
                    "toml": "right = true",
                }],
            )


if __name__ == "__main__":
    unittest.main()
