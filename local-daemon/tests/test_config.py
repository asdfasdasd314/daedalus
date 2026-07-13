import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from daedalus_daemon.config import load_daemon_config


class LoadDaemonConfigTests(unittest.TestCase):
    def test_reads_env_and_parameter_file(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            project_root = Path(temp_dir)
            daemon_src = project_root / "local-daemon" / "src" / "daedalus_daemon"
            daemon_src.mkdir(parents=True)
            parameter_dir = project_root / "parameter_files"
            parameter_dir.mkdir()
            (parameter_dir / "feature-file-communications-system.toml").write_text(
                "poll_interval_ms = 7000\n",
                encoding="utf-8",
            )
            (parameter_dir / "feature-execution-system.toml").write_text(
                "allow_concurrent_runs = false\n"
                "termination_grace_seconds = 2\n"
                "diagnostic_tail_max_chars = 12000\n",
                encoding="utf-8",
            )
            (project_root / ".env").write_text(
                "\n".join([
                    "DAEDALUS_USER_ID=root-user",
                    "SUPABASE_URL=https://root.example.supabase.co",
                    "SUPABASE_PUBLISHABLE_KEY=root-key",
                ]),
                encoding="utf-8",
            )
            (project_root / "local-daemon" / ".env").write_text(
                "\n".join([
                    "DAEDALUS_USER_ID=daemon-user",
                    "SUPABASE_URL=https://daemon.example.supabase.co",
                    "SUPABASE_PUBLISHABLE_KEY=daemon-key",
                ]),
                encoding="utf-8",
            )

            with patch("daedalus_daemon.config.Path.resolve", return_value=daemon_src / "config.py"):
                config = load_daemon_config()

        self.assertEqual(
            config,
            {
                "daemonUserId": "daemon-user",
                "allowConcurrentRuns": False,
                "diagnosticTailMaxChars": 12000,
                "httpRequestRetryDelayMs": 750,
                "httpRequestRetryLimit": 3,
                "httpRequestTimeoutSeconds": 20,
                "networkOutageCooldownMs": 15000,
                "pollIntervalMs": 7000,
                "terminationGraceSeconds": 2,
                "supabasePublishableKey": "daemon-key",
                "supabaseUrl": "https://daemon.example.supabase.co",
            },
        )

    def test_prefers_process_environment_values(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            project_root = Path(temp_dir)
            daemon_src = project_root / "local-daemon" / "src" / "daedalus_daemon"
            daemon_src.mkdir(parents=True)
            parameter_dir = project_root / "parameter_files"
            parameter_dir.mkdir()
            (parameter_dir / "feature-file-communications-system.toml").write_text(
                "poll_interval_ms = 5000\n",
                encoding="utf-8",
            )
            (parameter_dir / "feature-execution-system.toml").write_text(
                "allow_concurrent_runs = false\n"
                "termination_grace_seconds = 2\n"
                "diagnostic_tail_max_chars = 12000\n",
                encoding="utf-8",
            )

            with patch("daedalus_daemon.config.Path.resolve", return_value=daemon_src / "config.py"):
                with patch.dict(
                    os.environ,
                    {
                        "DAEDALUS_USER_ID": "process-user",
                        "SUPABASE_URL": "https://process.example.supabase.co",
                        "SUPABASE_PUBLISHABLE_KEY": "process-key",
                    },
                    clear=False,
                ):
                    config = load_daemon_config()

        self.assertEqual(config["daemonUserId"], "process-user")
        self.assertEqual(config["supabaseUrl"], "https://process.example.supabase.co")
        self.assertEqual(config["supabasePublishableKey"], "process-key")

    def test_raises_when_required_env_is_missing(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            project_root = Path(temp_dir)
            daemon_src = project_root / "local-daemon" / "src" / "daedalus_daemon"
            daemon_src.mkdir(parents=True)
            parameter_dir = project_root / "parameter_files"
            parameter_dir.mkdir()
            (parameter_dir / "feature-file-communications-system.toml").write_text(
                "poll_interval_ms = 5000\n",
                encoding="utf-8",
            )
            (parameter_dir / "feature-execution-system.toml").write_text(
                "allow_concurrent_runs = false\n"
                "termination_grace_seconds = 2\n"
                "diagnostic_tail_max_chars = 12000\n",
                encoding="utf-8",
            )
            (project_root / ".env").write_text(
                "SUPABASE_URL=https://root.example.supabase.co\n",
                encoding="utf-8",
            )

            with patch("daedalus_daemon.config.Path.resolve", return_value=daemon_src / "config.py"):
                with self.assertRaises(RuntimeError) as error:
                    load_daemon_config()

        self.assertIn("daemonUserId", str(error.exception))
        self.assertIn("supabasePublishableKey", str(error.exception))

    def test_raises_when_poll_interval_parameter_is_missing(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            project_root = Path(temp_dir)
            daemon_src = project_root / "local-daemon" / "src" / "daedalus_daemon"
            daemon_src.mkdir(parents=True)
            parameter_dir = project_root / "parameter_files"
            parameter_dir.mkdir()
            (parameter_dir / "feature-file-communications-system.toml").write_text(
                "other_value = 1\n",
                encoding="utf-8",
            )
            (parameter_dir / "feature-execution-system.toml").write_text(
                "allow_concurrent_runs = false\n"
                "termination_grace_seconds = 2\n"
                "diagnostic_tail_max_chars = 12000\n",
                encoding="utf-8",
            )

            with patch("daedalus_daemon.config.Path.resolve", return_value=daemon_src / "config.py"):
                with patch.dict(
                    os.environ,
                    {
                        "DAEDALUS_USER_ID": "process-user",
                        "SUPABASE_URL": "https://process.example.supabase.co",
                        "SUPABASE_PUBLISHABLE_KEY": "process-key",
                    },
                    clear=False,
                ):
                    with self.assertRaises(RuntimeError) as error:
                        load_daemon_config()

        self.assertIn("poll_interval_ms", str(error.exception))
