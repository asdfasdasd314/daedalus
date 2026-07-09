import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from daedalus_daemon.communications import (
    AGENT_CHAT_PAYLOAD_KIND,
    AGENT_PROMPT_PURPOSE,
    FEATURE_FILES_PAYLOAD_KIND,
    FEATURE_FILE_LOAD_PURPOSE,
    PARAMETER_FILES_PAYLOAD_KIND,
    PARAMETER_FILE_LOAD_PURPOSE,
    fetch_current_message,
    post_agent_chat,
    post_feature_files,
    post_parameter_files,
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
    def test_upserts_message_through_daemon_rpc(self):
        seen_methods: list[str] = []
        request_bodies: list[dict] = []
        request_urls: list[str] = []
        request_headers: list[dict[str, str]] = []

        def fake_urlopen(http_request):
            seen_methods.append(http_request.get_method())
            request_urls.append(http_request.full_url)
            request_headers.append(dict(http_request.header_items()))

            if http_request.data is not None:
                request_bodies.append(json.loads(http_request.data.decode("utf-8")))

            return FakeResponse({})

        with patch("daedalus_daemon.communications.request.urlopen", side_effect=fake_urlopen):
            update_current_message(
                {
                    "supabaseUrl": "https://example.supabase.co",
                    "supabasePublishableKey": "publishable-key",
                    "daemonUserId": "user-1",
                },
                FEATURE_FILE_LOAD_PURPOSE,
                "client_load_feature_files",
            )

        self.assertEqual(seen_methods, ["POST"])
        self.assertEqual(request_urls, ["https://example.supabase.co/rest/v1/rpc/daemon_upsert_communication"])
        self.assertEqual(request_headers[0]["Apikey"], "publishable-key")
        self.assertEqual(request_headers[0]["Authorization"], "Bearer publishable-key")
        self.assertEqual(
            request_bodies,
            [{
                "p_message": "client_load_feature_files",
                "p_purpose": FEATURE_FILE_LOAD_PURPOSE,
                "p_user_id": "user-1",
            }],
        )

    def test_reads_message_for_requested_purpose(self):
        request_bodies: list[dict] = []
        request_urls: list[str] = []

        def fake_urlopen(http_request):
            request_urls.append(http_request.full_url)
            request_bodies.append(json.loads(http_request.data.decode("utf-8")))
            return FakeResponse([{"message": "daemon_sent_feature_files"}])

        with patch("daedalus_daemon.communications.request.urlopen", side_effect=fake_urlopen):
            message = fetch_current_message(
                {
                    "supabaseUrl": "https://example.supabase.co",
                    "supabasePublishableKey": "publishable-key",
                    "daemonUserId": "user-1",
                },
                FEATURE_FILE_LOAD_PURPOSE,
            )

        self.assertEqual(message, "daemon_sent_feature_files")
        self.assertEqual(request_urls, ["https://example.supabase.co/rest/v1/rpc/daemon_get_communication"])
        self.assertEqual(
            request_bodies,
            [{"p_purpose": FEATURE_FILE_LOAD_PURPOSE, "p_user_id": "user-1"}],
        )

    def test_reads_parameter_message_for_requested_purpose(self):
        request_bodies: list[dict] = []

        def fake_urlopen(http_request):
            request_bodies.append(json.loads(http_request.data.decode("utf-8")))
            return FakeResponse([{"message": "daemon_sent_parameter_files"}])

        with patch("daedalus_daemon.communications.request.urlopen", side_effect=fake_urlopen):
            message = fetch_current_message(
                {
                    "supabaseUrl": "https://example.supabase.co",
                    "supabasePublishableKey": "publishable-key",
                    "daemonUserId": "user-1",
                },
                PARAMETER_FILE_LOAD_PURPOSE,
            )

        self.assertEqual(message, "daemon_sent_parameter_files")
        self.assertEqual(
            request_bodies,
            [{"p_purpose": PARAMETER_FILE_LOAD_PURPOSE, "p_user_id": "user-1"}],
        )

    def test_posts_feature_files_to_daemon_payload_rpc(self):
        request_bodies: list[dict] = []

        def fake_urlopen(http_request):
            request_bodies.append(json.loads(http_request.data.decode("utf-8")))
            return FakeResponse({})

        with patch("daedalus_daemon.communications.request.urlopen", side_effect=fake_urlopen):
            post_feature_files(
                {
                    "supabaseUrl": "https://example.supabase.co",
                    "supabasePublishableKey": "publishable-key",
                    "daemonUserId": "user-1",
                },
                {
                    "/workspace/project": [
                        {
                            "path": "feature_files/example.md",
                            "markdown": "# Example",
                        },
                    ],
                },
            )

        self.assertEqual(
            request_bodies,
            [{
                "p_kind": FEATURE_FILES_PAYLOAD_KIND,
                "p_payload": {
                    "projects": {
                        "/workspace/project": [
                            {
                                "path": "feature_files/example.md",
                                "markdown": "# Example",
                            },
                        ],
                    },
                },
                "p_user_id": "user-1",
            }],
        )

    def test_posts_parameter_files_to_daemon_payload_rpc(self):
        seen_methods: list[str] = []
        request_bodies: list[dict] = []

        def fake_urlopen(http_request):
            seen_methods.append(http_request.get_method())
            request_bodies.append(json.loads(http_request.data.decode("utf-8")))
            return FakeResponse({})

        with patch("daedalus_daemon.communications.request.urlopen", side_effect=fake_urlopen):
            post_parameter_files(
                {
                    "supabaseUrl": "https://example.supabase.co",
                    "supabasePublishableKey": "publishable-key",
                    "daemonUserId": "user-1",
                },
                {
                    "/workspace/project": [
                        {
                            "path": "parameter_files/example.toml",
                            "toml": "enabled = true",
                        },
                    ],
                },
            )

        self.assertEqual(seen_methods, ["POST"])
        self.assertEqual(
            request_bodies,
            [{
                "p_kind": PARAMETER_FILES_PAYLOAD_KIND,
                "p_payload": {
                    "projects": {
                        "/workspace/project": [
                            {
                                "path": "parameter_files/example.toml",
                                "toml": "enabled = true",
                            },
                        ],
                    },
                },
                "p_user_id": "user-1",
            }],
        )

    def test_posts_agent_chat_to_daemon_payload_rpc(self):
        seen_methods: list[str] = []
        request_bodies: list[dict] = []

        def fake_urlopen(http_request):
            seen_methods.append(http_request.get_method())
            request_bodies.append(json.loads(http_request.data.decode("utf-8")))
            return FakeResponse({})

        with patch("daedalus_daemon.communications.request.urlopen", side_effect=fake_urlopen):
            post_agent_chat(
                {
                    "supabaseUrl": "https://example.supabase.co",
                    "supabasePublishableKey": "publishable-key",
                    "daemonUserId": "user-1",
                },
                "prompt-1",
                "/workspace/project",
                "Build the feature",
                "Here is the reply",
            )

        self.assertEqual(seen_methods, ["POST"])
        self.assertEqual(
            request_bodies,
            [{
                "p_kind": AGENT_CHAT_PAYLOAD_KIND,
                "p_payload": {
                    "promptId": "prompt-1",
                    "directory": "/workspace/project",
                    "prompt": "Build the feature",
                    "reply": "Here is the reply",
                    "provider": "codex",
                    "model": "",
                    "reasoning": "",
                    "planningMode": False,
                    "targetedFeaturePaths": [],
                },
                "p_user_id": "user-1",
            }],
        )

    def test_posts_agent_chat_with_targeted_feature_paths(self):
        request_bodies: list[dict] = []

        def fake_urlopen(http_request):
            request_bodies.append(json.loads(http_request.data.decode("utf-8")))
            return FakeResponse({})

        with patch("daedalus_daemon.communications.request.urlopen", side_effect=fake_urlopen):
            post_agent_chat(
                {
                    "supabaseUrl": "https://example.supabase.co",
                    "supabasePublishableKey": "publishable-key",
                    "daemonUserId": "user-1",
                },
                "prompt-2",
                "/workspace/project",
                "Build the feature",
                "Here is the reply",
                targeted_feature_paths=[
                    "feature_files/agent-prompt-chat.md",
                    "feature_files/feature-file-graph-display.md",
                ],
            )

        self.assertEqual(
            request_bodies,
            [{
                "p_kind": AGENT_CHAT_PAYLOAD_KIND,
                "p_payload": {
                    "promptId": "prompt-2",
                    "directory": "/workspace/project",
                    "prompt": "Build the feature",
                    "reply": "Here is the reply",
                    "provider": "codex",
                    "model": "",
                    "reasoning": "",
                    "planningMode": False,
                    "targetedFeaturePaths": [
                        "feature_files/agent-prompt-chat.md",
                        "feature_files/feature-file-graph-display.md",
                    ],
                },
                "p_user_id": "user-1",
            }],
        )


if __name__ == "__main__":
    unittest.main()
