import sys
import tempfile
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from daedalus_daemon import scan_feature_file_projects


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


if __name__ == "__main__":
    unittest.main()
