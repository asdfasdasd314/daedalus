import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from daedalus_daemon.execution import (
    paired_parameter_file_path,
    resolve_inside_project,
    validate_execution_entry_point,
    validate_execution_request,
)


class ExecutionContractTests(unittest.TestCase):
    def test_maps_feature_to_paired_parameter_file(self):
        self.assertEqual(
            paired_parameter_file_path("feature_files/tools/example.md"),
            "parameter_files/tools/example.toml",
        )

    def test_rejects_non_feature_path(self):
        with self.assertRaises(ValueError):
            paired_parameter_file_path("notes/example.md")

    def test_rejects_path_traversal(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                resolve_inside_project(Path(directory), "feature_files/../../outside.md")

    def test_accepts_valid_execution_entry_point(self):
        with tempfile.TemporaryDirectory() as directory:
            parameter_file = Path(directory) / "feature.toml"
            Path(directory, "src").mkdir()
            Path(directory, "src/example.py").write_text("print('ok')\n")
            parameter_file.write_text('[execution]\nentry_point = "src/example.py"\n')
            entry_point, command = validate_execution_entry_point(Path(directory), parameter_file)
            self.assertEqual(entry_point, Path(directory, "src/example.py"))
            self.assertEqual(command, ["python", "src/example.py"])

    def test_rejects_malformed_execution_entry_point(self):
        with tempfile.TemporaryDirectory() as directory:
            parameter_file = Path(directory) / "feature.toml"
            parameter_file.write_text('[execution]\nentry_point = "../outside.py"\n')
            with self.assertRaises(ValueError):
                validate_execution_entry_point(Path(directory), parameter_file)

    def test_rejects_unscanned_project(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                validate_execution_request(
                    {"project_directory": directory, "feature_file_path": "feature_files/example.md"},
                    {},
                )
