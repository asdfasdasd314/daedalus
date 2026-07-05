import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from daedalus_daemon.communications import update_current_message


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def read(self):
        return json.dumps(self.payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class UpdateCurrentMessageTests(unittest.TestCase):
    def test_inserts_message_when_no_rows_exist(self):
        seen_methods: list[str] = []

        def fake_urlopen(http_request):
            seen_methods.append(http_request.get_method())

            if http_request.get_method() == "GET":
                return FakeResponse([])

            return FakeResponse({})

        with patch("daedalus_daemon.communications.request.urlopen", side_effect=fake_urlopen):
            update_current_message(
                {
                    "supabaseUrl": "https://example.supabase.co",
                    "supabaseServiceRoleKey": "service-role",
                },
                "client_load_feature_files",
            )

        self.assertEqual(seen_methods, ["GET", "POST"])


if __name__ == "__main__":
    unittest.main()
