from pathlib import Path
import sys
import time

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from daedalus_daemon.communications import (
        CLIENT_LOAD_FEATURE_FILES,
        DAEMON_RECEIVED_MESSAGE,
        DAEMON_SENT_FEATURE_FILES,
        fetch_current_message,
        post_feature_files,
        update_current_message,
    )
    from daedalus_daemon.config import load_shared_config
    from daedalus_daemon.scanner import scan_feature_file_projects
else:
    from .communications import (
        CLIENT_LOAD_FEATURE_FILES,
        DAEMON_RECEIVED_MESSAGE,
        DAEMON_SENT_FEATURE_FILES,
        fetch_current_message,
        post_feature_files,
        update_current_message,
    )
    from .config import load_shared_config
    from .scanner import scan_feature_file_projects


def run_poll_cycle(
    config: dict,
    read_message=fetch_current_message,
    write_message=update_current_message,
    scan_projects=scan_feature_file_projects,
    deliver_projects=post_feature_files,
) -> None:
    message = read_message(config)

    if message != CLIENT_LOAD_FEATURE_FILES:
        return

    write_message(config, DAEMON_RECEIVED_MESSAGE)
    projects = scan_projects()
    deliver_projects(config, projects)
    write_message(config, DAEMON_SENT_FEATURE_FILES)


def main() -> None:
    config = load_shared_config()

    while True:
        run_poll_cycle(config)
        time.sleep(config["pollIntervalMs"] / 1000)


if __name__ == "__main__":
    main()
