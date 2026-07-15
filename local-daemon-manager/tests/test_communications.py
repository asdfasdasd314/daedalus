import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from daedalus_daemon_manager.communications import manager_tick


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
            }, "instance-1", 123, "2026-07-14T00:00:00+00:00")

        self.assertEqual(len(requests), 1)
        self.assertTrue(requests[0].full_url.endswith("/rpc/daemon_manager_tick"))
        self.assertEqual(result, {"activeRequest": None, "drainSummary": None})


if __name__ == "__main__":
    unittest.main()
