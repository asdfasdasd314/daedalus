import json
import sys
import unittest
from pathlib import Path

from pydantic import ValidationError


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from daedalus_daemon.architecture_document import (
    SOFTWARE_ARCHITECTURE_SCHEMA_PATH,
    load_published_architecture_schema,
    parse_and_validate_architecture_response,
)


def document():
    return {
        "schema_version": "1.0",
        "summary": "A complete architecture.",
        "systems": [
            {"id": "source", "name": "Source", "summary": "Produces data.", "files": ["src/source.py"]},
            {"id": "target", "name": "Target", "summary": "Consumes data.", "files": ["src/target.py"]},
        ],
        "channels": [{
            "id": "events", "name": "Events", "summary": "Carries recursive data.",
            "source_system_id": "source", "target_system_id": "target",
            "fields": [
                {"name": "title", "summary": "Text.", "type": "string"},
                {"name": "score", "summary": "Number.", "type": "number"},
                {"name": "count", "summary": "Integer.", "type": "integer"},
                {"name": "enabled", "summary": "Boolean.", "type": "boolean"},
                {"name": "empty", "summary": "Null.", "type": "null"},
                {"name": "items", "summary": "Nested array.", "type": "array", "items": {
                    "name": "item", "summary": "Nested object.", "type": "object", "fields": [
                        {"name": "value", "summary": "Nested value.", "type": "string", "required": False}
                    ],
                }},
            ],
        }],
    }


class ArchitectureDocumentTests(unittest.TestCase):
    def test_loads_exact_published_schema_file(self):
        self.assertEqual(
            load_published_architecture_schema(),
            json.loads(SOFTWARE_ARCHITECTURE_SCHEMA_PATH.read_text(encoding="utf-8")),
        )

    def test_validates_recursive_fields_and_serializes_required_default(self):
        normalized = parse_and_validate_architecture_response(json.dumps(document()))
        fields = normalized["channels"][0]["fields"]
        self.assertTrue(all(field["required"] is True for field in fields))
        self.assertTrue(fields[-1]["items"]["required"])
        self.assertFalse(fields[-1]["items"]["fields"][0]["required"])

    def test_rejects_duplicate_files_missing_extra_invalid_and_strict_values(self):
        invalid_documents = []
        duplicate_files = document()
        duplicate_files["systems"][0]["files"] = ["src/source.py", "src/source.py"]
        invalid_documents.append(duplicate_files)
        missing = document()
        del missing["systems"][0]["summary"]
        invalid_documents.append(missing)
        extra = document()
        extra["unexpected"] = True
        invalid_documents.append(extra)
        invalid_id = document()
        invalid_id["systems"][0]["id"] = "Source-System"
        invalid_documents.append(invalid_id)
        wrong_type = document()
        wrong_type["systems"][0]["name"] = 4
        invalid_documents.append(wrong_type)
        for invalid in invalid_documents:
            with self.subTest(invalid=invalid):
                with self.assertRaises(ValidationError):
                    parse_and_validate_architecture_response(json.dumps(invalid))

    def test_rejects_duplicate_ids_and_unknown_endpoints(self):
        duplicate_system = document()
        duplicate_system["systems"][1]["id"] = "source"
        duplicate_channel = document()
        duplicate_channel["channels"].append(dict(duplicate_channel["channels"][0]))
        unknown_endpoint = document()
        unknown_endpoint["channels"][0]["target_system_id"] = "missing"
        for invalid in (duplicate_system, duplicate_channel, unknown_endpoint):
            with self.assertRaises(ValidationError):
                parse_and_validate_architecture_response(json.dumps(invalid))

    def test_rejects_invalid_json_and_markdown_fences(self):
        with self.assertRaises(json.JSONDecodeError):
            parse_and_validate_architecture_response('{"schema_version":')
        with self.assertRaises(json.JSONDecodeError):
            parse_and_validate_architecture_response("```json\n{}\n```")


if __name__ == "__main__":
    unittest.main()
