import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from daedalus_daemon import (
    CLIENT_LOAD_FEATURE_FILES,
    DAEMON_RECEIVED_MESSAGE,
    DAEMON_SENT_FEATURE_FILES,
    run_poll_cycle,
)


class RunPollCycleTests(unittest.TestCase):
    def test_handles_client_load_message(self):
        writes: list[str] = []
        deliveries: list[dict[str, list[str]]] = []

        def fake_read_message(_config):
            return CLIENT_LOAD_FEATURE_FILES

        def fake_write_message(_config, message):
            writes.append(message)

        def fake_scan_projects():
            return {"/workspace/project": ["alpha"]}

        def fake_deliver_projects(_config, projects):
            deliveries.append(projects)

        run_poll_cycle(
            {"pollIntervalMs": 5000},
            read_message=fake_read_message,
            write_message=fake_write_message,
            scan_projects=fake_scan_projects,
            deliver_projects=fake_deliver_projects,
        )

        self.assertEqual(
            writes,
            [DAEMON_RECEIVED_MESSAGE, DAEMON_SENT_FEATURE_FILES],
        )
        self.assertEqual(
            deliveries,
            [{"/workspace/project": ["alpha"]}],
        )

    def test_ignores_non_client_messages(self):
        writes: list[str] = []
        deliveries: list[dict[str, list[str]]] = []

        def fake_read_message(_config):
            return DAEMON_RECEIVED_MESSAGE

        def fake_write_message(_config, message):
            writes.append(message)

        def fake_scan_projects():
            raise AssertionError("scan should not run")

        def fake_deliver_projects(_config, projects):
            deliveries.append(projects)

        run_poll_cycle(
            {"pollIntervalMs": 5000},
            read_message=fake_read_message,
            write_message=fake_write_message,
            scan_projects=fake_scan_projects,
            deliver_projects=fake_deliver_projects,
        )

        self.assertEqual(writes, [])
        self.assertEqual(deliveries, [])


if __name__ == "__main__":
    unittest.main()
