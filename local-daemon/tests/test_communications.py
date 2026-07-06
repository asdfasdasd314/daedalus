import json
import sys
import unittest
from urllib.parse import parse_qs, urlparse
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from daedalus_daemon.communications import (
    AGENT_PROMPT_PURPOSE,
    FEATURE_FILE_LOAD_PURPOSE,
    fetch_current_message,
    post_agent_chat,
    update_current_message,
)


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
        request_bodies: list[dict] = []
        request_queries: list[dict[str, list[str]]] = []

        def fake_urlopen(http_request):
            seen_methods.append(http_request.get_method())
            request_queries.append(parse_qs(urlparse(http_request.full_url).query))

            if http_request.get_method() == "GET":
                return FakeResponse([])

            if http_request.data is not None:
                request_bodies.append(json.loads(http_request.data.decode("utf-8")))

            return FakeResponse({})

        with patch("daedalus_daemon.communications.request.urlopen", side_effect=fake_urlopen):
            update_current_message(
                {
                    "supabaseUrl": "https://example.supabase.co",
                    "supabaseServiceRoleKey": "service-role",
                },
                FEATURE_FILE_LOAD_PURPOSE,
                "client_load_feature_files",
            )

        self.assertEqual(seen_methods, ["GET", "POST"])
        self.assertEqual(
            request_queries[0]["purpose"],
            [f"eq.{FEATURE_FILE_LOAD_PURPOSE}"],
        )
        self.assertEqual(
            request_bodies,
            [{
                "message": "client_load_feature_files",
                "purpose": FEATURE_FILE_LOAD_PURPOSE,
            }],
        )

    def test_reads_message_for_requested_purpose(self):
        seen_queries: list[dict[str, list[str]]] = []

        def fake_urlopen(http_request):
            seen_queries.append(parse_qs(urlparse(http_request.full_url).query))
            return FakeResponse([{"message": "daemon_sent_feature_files"}])

        with patch("daedalus_daemon.communications.request.urlopen", side_effect=fake_urlopen):
            message = fetch_current_message(
                {
                    "supabaseUrl": "https://example.supabase.co",
                    "supabaseServiceRoleKey": "service-role",
                },
                FEATURE_FILE_LOAD_PURPOSE,
            )

        self.assertEqual(message, "daemon_sent_feature_files")
        self.assertEqual(
            seen_queries,
            [{"select": ["message,purpose"], "purpose": [f"eq.{FEATURE_FILE_LOAD_PURPOSE}"], "limit": ["1"]}],
        )

    def test_posts_agent_chat_to_frontend_route(self):
        seen_methods: list[str] = []
        request_bodies: list[dict] = []

        def fake_urlopen(http_request):
            seen_methods.append(http_request.get_method())
            request_bodies.append(json.loads(http_request.data.decode("utf-8")))
            return FakeResponse({})

        with patch("daedalus_daemon.communications.request.urlopen", side_effect=fake_urlopen):
            post_agent_chat(
                {
                    "frontendBaseUrl": "http://127.0.0.1:3000",
                },
                "/workspace/project",
                "Build the feature",
                "Here is the reply",
            )

        self.assertEqual(seen_methods, ["POST"])
        self.assertEqual(
            request_bodies,
            [{
                "source": "daemon",
                "directory": "/workspace/project",
                "prompt": "Build the feature",
                "reply": "Here is the reply",
                "provider": "codex",
                "model": "",
                "reasoning": "",
                "planningMode": False,
            }],
        )


if __name__ == "__main__":
    unittest.main()
