import logging
from datetime import datetime, timezone
from pathlib import Path
import signal
import subprocess
import sys
import time
import uuid

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from daedalus_daemon_manager.communications import (
        acquire_lease, begin_restart, claim_restart, complete_recovery,
        complete_control_request, complete_restart, get_active_request, get_drain_summary,
        publish_candidate, publish_degraded, publish_heartbeat, update_blockers,
    )
    from daedalus_daemon_manager.config import load_manager_config
else:
    from .communications import (
        acquire_lease, begin_restart, claim_restart, complete_recovery,
        complete_control_request, complete_restart, get_active_request, get_drain_summary,
        publish_candidate, publish_degraded, publish_heartbeat, update_blockers,
    )
    from .config import load_manager_config


SHUTTING_DOWN = False


def request_shutdown(_signal_number, _frame) -> None:
    global SHUTTING_DOWN
    SHUTTING_DOWN = True


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def start_execution_child(config: dict) -> tuple[subprocess.Popen, str]:
    code_root = config["codeRoot"]
    entrypoint = code_root / "local-daemon" / "src" / "daedalus_daemon" / "main.py"
    started_at = utc_now()
    child = subprocess.Popen(
        [sys.executable, str(entrypoint)],
        cwd=config["executionRoot"],
        shell=False,
        start_new_session=True,
    )
    return child, started_at


def terminate_execution_child(child: subprocess.Popen, grace_seconds: int) -> None:
    if child.poll() is not None:
        child.wait()
        return
    child.terminate()
    try:
        child.wait(timeout=grace_seconds)
    except subprocess.TimeoutExpired:
        child.kill()
        child.wait()


def heartbeat_if_due(
    config: dict, instance_id: str, child: subprocess.Popen | None,
    child_started_at: str | None, last_heartbeat_at: float,
) -> float:
    now = time.monotonic()
    interval = config["managerHeartbeatIntervalMs"] / 1000
    if now - last_heartbeat_at < interval:
        return last_heartbeat_at
    owned = publish_heartbeat(
        config,
        instance_id,
        child.pid if child and child.poll() is None else None,
        child_started_at if child and child.poll() is None else None,
    )
    if not owned:
        raise RuntimeError("Manager lease ownership was lost")
    return now


def wait_for_stability(
    config: dict, instance_id: str, child: subprocess.Popen, started_at: str,
) -> bool:
    deadline = time.monotonic() + config["startupStabilityWindowMs"] / 1000
    last_heartbeat_at = 0.0
    while not SHUTTING_DOWN and time.monotonic() < deadline:
        if child.poll() is not None:
            child.wait()
            return False
        last_heartbeat_at = heartbeat_if_due(
            config, instance_id, child, started_at, last_heartbeat_at,
        )
        time.sleep(min(config["supabasePollIntervalMs"] / 1000, 0.25))
    return not SHUTTING_DOWN and child.poll() is None


def start_stable_replacement(
    config: dict, instance_id: str, failure_prefix: str,
) -> tuple[subprocess.Popen, str] | None:
    while not SHUTTING_DOWN:
        try:
            child, started_at = start_execution_child(config)
            publish_candidate(config, instance_id, child.pid, started_at)
            if wait_for_stability(config, instance_id, child, started_at):
                return child, started_at
            exit_code = child.returncode
            publish_degraded(
                config, instance_id,
                f"{failure_prefix}: replacement exited during startup with code {exit_code}.",
            )
        except Exception as error:
            publish_degraded(config, instance_id, f"{failure_prefix}: {error}")
        time.sleep(config["unexpectedExitRestartDelayMs"] / 1000)
    return None


def process_requested_restart(
    config: dict, instance_id: str, child: subprocess.Popen, child_started_at: str,
) -> tuple[subprocess.Popen, str]:
    active_request = get_active_request(config, instance_id)
    if not active_request:
        return child, child_started_at
    request_id = active_request["id"]
    if active_request["status"] == "cancelled":
        complete_control_request(
            config, instance_id, request_id, active_request["updated_at"],
        )
        return child, child_started_at
    if active_request["status"] == "requested":
        claim_restart(config, instance_id, request_id)

    last_blockers = None
    last_heartbeat_at = 0.0
    while not SHUTTING_DOWN:
        if child.poll() is not None:
            recovered = recover_unexpected_exit(config, instance_id, child)
            return recovered if recovered is not None else (child, child_started_at)
        current_request = get_active_request(config, instance_id)
        if not current_request or current_request["id"] != request_id:
            return child, child_started_at
        if current_request["status"] == "cancelled":
            complete_control_request(
                config, instance_id, request_id, current_request["updated_at"],
            )
            return child, child_started_at
        if current_request["status"] == "restarting":
            break

        blockers = get_drain_summary(config, instance_id)
        if blockers != last_blockers:
            update_blockers(config, instance_id, request_id, blockers)
            last_blockers = blockers
        if blockers["total"] == 0 and begin_restart(config, instance_id, request_id):
            break
        last_heartbeat_at = heartbeat_if_due(
            config, instance_id, child, child_started_at, last_heartbeat_at,
        )
        time.sleep(config["supabasePollIntervalMs"] / 1000)

    if SHUTTING_DOWN:
        return child, child_started_at

    terminate_execution_child(child, config["childTerminationGraceSeconds"])
    replacement = start_stable_replacement(
        config, instance_id, "Requested execution restart failed",
    )
    if replacement is None:
        return child, child_started_at
    replacement_child, replacement_started_at = replacement
    if not complete_restart(config, instance_id, request_id):
        publish_degraded(config, instance_id, "Replacement stabilized but restart completion was rejected.")
    return replacement_child, replacement_started_at


def recover_unexpected_exit(
    config: dict, instance_id: str, child: subprocess.Popen,
) -> tuple[subprocess.Popen, str] | None:
    exit_code = child.poll()
    child.wait()
    publish_degraded(
        config, instance_id, f"Execution process exited unexpectedly with code {exit_code}.",
    )
    time.sleep(config["unexpectedExitRestartDelayMs"] / 1000)
    replacement = start_stable_replacement(
        config, instance_id, "Crash recovery replacement failed",
    )
    if replacement and complete_recovery(config, instance_id):
        return replacement
    return replacement


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    signal.signal(signal.SIGINT, request_shutdown)
    signal.signal(signal.SIGTERM, request_shutdown)
    config = load_manager_config()
    instance_id = str(uuid.uuid4())
    if not acquire_lease(config, instance_id):
        raise RuntimeError("Another current manager instance owns this user")

    replacement = start_stable_replacement(config, instance_id, "Initial execution startup failed")
    if replacement is None:
        return
    child, child_started_at = replacement
    complete_recovery(config, instance_id)
    last_heartbeat_at = 0.0

    try:
        while not SHUTTING_DOWN:
            if child.poll() is not None:
                recovered = recover_unexpected_exit(config, instance_id, child)
                if recovered is None:
                    break
                child, child_started_at = recovered
                continue

            child, child_started_at = process_requested_restart(
                config, instance_id, child, child_started_at,
            )
            last_heartbeat_at = heartbeat_if_due(
                config, instance_id, child, child_started_at, last_heartbeat_at,
            )
            time.sleep(config["supabasePollIntervalMs"] / 1000)
    finally:
        publish_degraded(config, instance_id, "Manager is shutting down.")
        terminate_execution_child(child, config["childTerminationGraceSeconds"])


if __name__ == "__main__":
    main()
