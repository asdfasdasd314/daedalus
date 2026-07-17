import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from daedalus_daemon.communications import (
    AGENT_PROMPT_PURPOSE,
    DAEMON_COMPLETE,
    DAEMON_REVIEW,
    FEATURE_FILES_PAYLOAD_KIND,
    FEATURE_FILE_LOAD_PURPOSE,
    GIT_SYNC_PAYLOAD_KIND,
    PARAMETER_FILES_PAYLOAD_KIND,
    PARAMETER_FILE_LOAD_PURPOSE,
    fetch_current_message,
    fetch_current_messages,
    fetch_work_snapshot,
    complete_architecture_view,
    upsert_agent_output_history,
    post_feature_files,
    post_git_sync_result,
    post_parameter_files,
    upsert_orchestration_batch,
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
    def test_completes_architecture_view_with_structured_document(self):
        document = {"schema_version": "1.0", "summary": "Test", "systems": [], "channels": []}
        with patch("daedalus_daemon.communications.call_daemon_rpc", return_value=True) as rpc:
            completed = complete_architecture_view(
                {"daemonUserId": "user-1"}, "view-1", 3,
                "2026-07-16T12:00:00Z", "completed", [], document, "",
                None, "codex", "model", "high",
            )
        self.assertTrue(completed)
        self.assertEqual(rpc.call_args.args[1], "daemon_complete_architecture_view")
        self.assertEqual(rpc.call_args.args[2]["p_architecture_document"], document)
        self.assertIsNone(rpc.call_args.args[2]["p_failure_details"])
        self.assertNotIn("p_report_markdown", rpc.call_args.args[2])

    def test_upserts_message_through_daemon_rpc(self):
        seen_methods: list[str] = []
        request_bodies: list[dict] = []
        request_urls: list[str] = []
        request_headers: list[dict[str, str]] = []

        def fake_urlopen(http_request, timeout=None):
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
                DAEMON_COMPLETE,
            )

        self.assertEqual(seen_methods, ["POST"])
        self.assertEqual(request_urls, ["https://example.supabase.co/rest/v1/rpc/daemon_upsert_communication"])
        self.assertEqual(request_headers[0]["Apikey"], "publishable-key")
        self.assertEqual(request_headers[0]["Authorization"], "Bearer publishable-key")
        self.assertEqual(
            request_bodies,
            [{
                "p_content": None,
                "p_message": DAEMON_COMPLETE,
                "p_purpose": FEATURE_FILE_LOAD_PURPOSE,
                "p_user_id": "user-1",
            }],
        )

    def test_reads_message_for_requested_purpose(self):
        request_bodies: list[dict] = []
        request_urls: list[str] = []

        def fake_urlopen(http_request, timeout=None):
            request_urls.append(http_request.full_url)
            request_bodies.append(json.loads(http_request.data.decode("utf-8")))
            return FakeResponse([{"content": "agent request"}])

        with patch("daedalus_daemon.communications.request.urlopen", side_effect=fake_urlopen):
            message = fetch_current_message(
                {
                    "supabaseUrl": "https://example.supabase.co",
                    "supabasePublishableKey": "publishable-key",
                    "daemonUserId": "user-1",
                },
                FEATURE_FILE_LOAD_PURPOSE,
            )

        self.assertEqual(message, "agent request")
        self.assertEqual(request_urls, ["https://example.supabase.co/rest/v1/rpc/daemon_get_communication"])
        self.assertEqual(
            request_bodies,
            [{"p_purpose": FEATURE_FILE_LOAD_PURPOSE, "p_user_id": "user-1"}],
        )

    def test_reads_parameter_message_for_requested_purpose(self):
        request_bodies: list[dict] = []

        def fake_urlopen(http_request, timeout=None):
            request_bodies.append(json.loads(http_request.data.decode("utf-8")))
            return FakeResponse([{"content": None}])

        with patch("daedalus_daemon.communications.request.urlopen", side_effect=fake_urlopen):
            message = fetch_current_message(
                {
                    "supabaseUrl": "https://example.supabase.co",
                    "supabasePublishableKey": "publishable-key",
                    "daemonUserId": "user-1",
                },
                PARAMETER_FILE_LOAD_PURPOSE,
            )

        self.assertEqual(message, "")
        self.assertEqual(
            request_bodies,
            [{"p_purpose": PARAMETER_FILE_LOAD_PURPOSE, "p_user_id": "user-1"}],
        )

    def test_reads_all_daemon_review_communications_in_one_rpc(self):
        request_urls: list[str] = []

        def fake_urlopen(http_request, timeout=None):
            request_urls.append(http_request.full_url)
            return FakeResponse([
                {"purpose": FEATURE_FILE_LOAD_PURPOSE, "content": None},
                {"purpose": AGENT_PROMPT_PURPOSE, "content": "prompt payload"},
            ])

        with patch("daedalus_daemon.communications.request.urlopen", side_effect=fake_urlopen):
            reviews = fetch_current_messages({
                "supabaseUrl": "https://example.supabase.co",
                "supabasePublishableKey": "publishable-key",
                "daemonUserId": "user-1",
            })

        self.assertEqual(request_urls, [
            "https://example.supabase.co/rest/v1/rpc/daemon_list_communication_reviews",
        ])
        self.assertEqual(reviews, {
            FEATURE_FILE_LOAD_PURPOSE: "",
            AGENT_PROMPT_PURPOSE: "prompt payload",
        })

    def test_normalizes_one_bounded_work_snapshot(self):
        def fake_urlopen(http_request, timeout=None):
            self.assertTrue(http_request.full_url.endswith("/rpc/daemon_poll_work"))
            return FakeResponse({
                "communications": [],
                "agentTasks": [{"id": "task-1"}],
                "orchestrationBatches": [{"id": "batch-1"}],
                "architectureViews": [{"id": "architecture-1"}],
                "featureRunControls": [{"id": "run-1", "status": "running"}],
                "claimedFeatureRun": None,
            })

        with patch("daedalus_daemon.communications.request.urlopen", side_effect=fake_urlopen):
            snapshot = fetch_work_snapshot({
                "supabaseUrl": "https://example.supabase.co",
                "supabasePublishableKey": "publishable-key",
                "daemonUserId": "user-1",
            })

        self.assertEqual(snapshot["agentTasks"], [{"id": "task-1"}])
        self.assertEqual(snapshot["orchestrationBatches"][0]["verification_output"], "")
        self.assertEqual(snapshot["architectureViews"], [{"id": "architecture-1"}])
        self.assertIsNone(snapshot["claimedFeatureRun"])

    def test_terminal_batch_overrides_stale_daemon_review_state(self):
        request_bodies: list[dict] = []

        def fake_urlopen(http_request, timeout=None):
            request_bodies.append(json.loads(http_request.data.decode("utf-8")))
            return FakeResponse({})

        with patch("daedalus_daemon.communications.request.urlopen", side_effect=fake_urlopen):
            upsert_orchestration_batch(
                {
                    "supabaseUrl": "https://example.supabase.co",
                    "supabasePublishableKey": "publishable-key",
                    "daemonUserId": "user-1",
                },
                {"id": "batch-1", "status": "completed", "message": DAEMON_REVIEW},
            )

        self.assertEqual(request_bodies[0]["p_batch"]["message"], DAEMON_COMPLETE)

    def test_posts_feature_files_to_daemon_payload_rpc(self):
        request_bodies: list[dict] = []

        def fake_urlopen(http_request, timeout=None):
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

        def fake_urlopen(http_request, timeout=None):
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

    def test_upserts_direct_prompt_history(self):
        seen_methods: list[str] = []
        request_bodies: list[dict] = []

        def fake_urlopen(http_request, timeout=None):
            seen_methods.append(http_request.get_method())
            request_bodies.append(json.loads(http_request.data.decode("utf-8")))
            return FakeResponse({})

        with patch("daedalus_daemon.communications.request.urlopen", side_effect=fake_urlopen):
            upsert_agent_output_history(
                {
                    "supabaseUrl": "https://example.supabase.co",
                    "supabasePublishableKey": "publishable-key",
                    "daemonUserId": "user-1",
                },
                "prompt-1",
                "/workspace/project",
                "Build the feature",
                "Here is the reply",
                "",
                mode="planning",
                status="completed",
            )

        self.assertEqual(seen_methods, ["POST"])
        self.assertEqual(
            request_bodies,
            [{
                "p_user_id": "user-1",
                "p_prompt_id": "prompt-1",
                "p_repository": "/workspace/project",
                "p_prompt": "Build the feature",
                "p_output": "Here is the reply",
                "p_error": "",
                "p_provider": "codex",
                "p_model": "",
                "p_reasoning": "",
                "p_conversation_id": None,
                "p_mode": "planning",
                "p_targeted_feature_paths": [],
                "p_status": "completed",
                "p_status_detail": None,
            }],
        )

    def test_upserts_direct_prompt_history_with_targeted_feature_paths(self):
        request_bodies: list[dict] = []

        def fake_urlopen(http_request, timeout=None):
            request_bodies.append(json.loads(http_request.data.decode("utf-8")))
            return FakeResponse({})

        with patch("daedalus_daemon.communications.request.urlopen", side_effect=fake_urlopen):
            upsert_agent_output_history(
                {
                    "supabaseUrl": "https://example.supabase.co",
                    "supabasePublishableKey": "publishable-key",
                    "daemonUserId": "user-1",
                },
                "prompt-2",
                "/workspace/project",
                "Build the feature",
                "Here is the reply",
                "",
                targeted_feature_paths=[
                    "feature_files/agent-prompt-chat.md",
                    "feature_files/feature-file-graph-display.md",
                ],
                status="completed",
            )

        self.assertEqual(
            request_bodies,
            [{
                "p_user_id": "user-1",
                "p_prompt_id": "prompt-2",
                "p_repository": "/workspace/project",
                "p_prompt": "Build the feature",
                "p_output": "Here is the reply",
                "p_error": "",
                "p_provider": "codex",
                "p_model": "",
                "p_reasoning": "",
                "p_conversation_id": None,
                "p_mode": "planning",
                "p_targeted_feature_paths": [
                        "feature_files/agent-prompt-chat.md",
                        "feature_files/feature-file-graph-display.md",
                ],
                "p_status": "completed",
                "p_status_detail": None,
            }],
        )


class PostGitSyncResultTests(unittest.TestCase):
    def test_posts_git_sync_result_to_daemon_payload_rpc(self):
        request_bodies: list[dict] = []

        def fake_urlopen(http_request, timeout=None):
            request_bodies.append(json.loads(http_request.data.decode("utf-8")))
            return FakeResponse({})

        with patch("daedalus_daemon.communications.request.urlopen", side_effect=fake_urlopen):
            post_git_sync_result(
                {
                    "supabaseUrl": "https://example.supabase.co",
                    "supabasePublishableKey": "publishable-key",
                    "daemonUserId": "user-1",
                },
                {
                    "requestId": "git-sync-1",
                    "directory": "/workspace/project",
                    "operation": "commit",
                    "status": "success",
                    "steps": [
                        {
                            "command": ["git", "add", "."],
                            "exitCode": 0,
                            "stdout": "",
                            "stderr": "",
                        },
                    ],
                },
            )

        self.assertEqual(
            request_bodies,
            [{
                "p_kind": GIT_SYNC_PAYLOAD_KIND,
                "p_payload": {
                    "requestId": "git-sync-1",
                    "directory": "/workspace/project",
                    "operation": "commit",
                    "status": "success",
                    "steps": [
                        {
                            "command": ["git", "add", "."],
                            "exitCode": 0,
                            "stdout": "",
                            "stderr": "",
                        },
                    ],
                },
                "p_user_id": "user-1",
            }],
        )


if __name__ == "__main__":
    unittest.main()
