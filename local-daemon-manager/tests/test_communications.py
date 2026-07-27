import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError, URLError


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from daedalus_daemon_manager.communications import (
    ManagerRpcUnavailableError, ManagerSchemaMismatchError, manager_tick,
)


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def read(self):
        return json.dumps(self.payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False


class ManagerTickTests(unittest.TestCase):
    def test_tick_combines_heartbeat_control_and_drain_summary(self):
        requests = []

        def fake_urlopen(http_request, timeout=None):
            requests.append(http_request)
            return FakeResponse({"activeRequest": None, "drainSummary": None})

        with patch("daedalus_daemon_manager.communications.request.urlopen", side_effect=fake_urlopen):
            result = manager_tick({
                "supabaseUrl": "https://example.supabase.co",
                "supabasePublishableKey": "publishable-key",
                "supabaseRequestTimeoutSeconds": 20,
                "daemonUserId": "user-1",
                "executionRoot": Path("/execution/root"),
            }, "instance-1", 123, "2026-07-14T00:00:00+00:00")

        self.assertEqual(len(requests), 1)
        self.assertTrue(requests[0].full_url.endswith("/rpc/daemon_manager_tick"))
        body = json.loads(requests[0].data.decode("utf-8"))
        self.assertEqual(body["p_execution_root"], "/execution/root")
        self.assertEqual(result, {"activeRequest": None, "drainSummary": None})

    def test_tick_marks_tls_timeouts_as_temporary_unavailability(self):
        config = {
            "supabaseUrl": "https://example.supabase.co",
            "supabasePublishableKey": "publishable-key",
            "supabaseRequestTimeoutSeconds": 20,
            "daemonUserId": "user-1",
            "executionRoot": Path("/execution/root"),
        }

        with patch(
            "daedalus_daemon_manager.communications.request.urlopen",
            side_effect=URLError(TimeoutError("TLS handshake timed out")),
        ):
            with self.assertRaises(ManagerRpcUnavailableError):
                manager_tick(config, "instance-1", 123, "2026-07-14T00:00:00+00:00")

    def test_tick_reports_missing_rpc_signature_as_schema_mismatch(self):
        config = {
            "supabaseUrl": "https://example.supabase.co",
            "supabasePublishableKey": "publishable-key",
            "supabaseRequestTimeoutSeconds": 20,
            "daemonUserId": "user-1",
            "executionRoot": Path("/execution/root"),
        }
        error = HTTPError(
            "https://example.supabase.co/rest/v1/rpc/daemon_manager_tick", 404,
            "Not Found", None, None,
        )
        error.read = lambda: b'{"message":"Could not find the function public.daemon_manager_tick"}'
        with patch("daedalus_daemon_manager.communications.request.urlopen", side_effect=error):
            with self.assertRaises(ManagerSchemaMismatchError):
                manager_tick(config, "instance-1", 123, "2026-07-14T00:00:00+00:00")


if __name__ == "__main__":
    unittest.main()
