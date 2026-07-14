import json
from urllib import request
from urllib.error import HTTPError


def call_manager_rpc(config: dict, function_name: str, values: dict):
    payload = json.dumps(values).encode("utf-8")
    http_request = request.Request(
        f"{config['supabaseUrl']}/rest/v1/rpc/{function_name}",
        data=payload,
        headers={
            "apikey": config["supabasePublishableKey"],
            "Authorization": f"Bearer {config['supabasePublishableKey']}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with request.urlopen(
            http_request,
            timeout=config["supabaseRequestTimeoutSeconds"],
        ) as response:
            body = response.read().decode("utf-8")
            return json.loads(body) if body else None
    except HTTPError as error:
        detail = error.read().decode("utf-8")
        raise RuntimeError(
            f"Manager RPC {function_name} failed ({error.code}): {detail}",
        ) from error


def lease_values(config: dict, instance_id: str) -> dict:
    return {
        "p_user_id": config["daemonUserId"],
        "p_manager_instance_id": instance_id,
    }


def acquire_lease(config: dict, instance_id: str) -> bool:
    return bool(call_manager_rpc(config, "daemon_manager_acquire_lease", {
        **lease_values(config, instance_id),
        "p_stale_after_seconds": max(1, config["heartbeatStaleAfterMs"] // 1000),
    }))


def publish_heartbeat(
    config: dict, instance_id: str, process_id: int | None,
    started_at: str | None, status_detail: str | None = None,
) -> bool:
    return bool(call_manager_rpc(config, "daemon_manager_publish_heartbeat", {
        **lease_values(config, instance_id),
        "p_execution_process_id": process_id,
        "p_execution_started_at": started_at,
        "p_status_detail": status_detail,
    }))


def get_active_request(config: dict, instance_id: str) -> dict | None:
    return call_manager_rpc(
        config, "daemon_manager_get_active_request", lease_values(config, instance_id),
    )


def claim_restart(config: dict, instance_id: str, request_id: str) -> bool:
    return bool(call_manager_rpc(config, "daemon_manager_claim_restart", {
        **lease_values(config, instance_id), "p_request_id": request_id,
    }))


def get_drain_summary(config: dict, instance_id: str) -> dict:
    return call_manager_rpc(
        config, "daemon_manager_get_drain_summary", lease_values(config, instance_id),
    )


def update_blockers(
    config: dict, instance_id: str, request_id: str, blockers: dict,
) -> bool:
    return bool(call_manager_rpc(config, "daemon_manager_update_blockers", {
        **lease_values(config, instance_id),
        "p_request_id": request_id,
        "p_blockers": blockers,
    }))


def begin_restart(config: dict, instance_id: str, request_id: str) -> bool:
    return bool(call_manager_rpc(config, "daemon_manager_begin_restart", {
        **lease_values(config, instance_id), "p_request_id": request_id,
    }))


def publish_degraded(config: dict, instance_id: str, detail: str) -> bool:
    return bool(call_manager_rpc(config, "daemon_manager_publish_degraded", {
        **lease_values(config, instance_id), "p_status_detail": detail,
    }))


def publish_candidate(
    config: dict, instance_id: str, process_id: int, started_at: str,
) -> bool:
    return bool(call_manager_rpc(config, "daemon_manager_publish_candidate", {
        **lease_values(config, instance_id),
        "p_execution_process_id": process_id,
        "p_execution_started_at": started_at,
    }))


def complete_recovery(config: dict, instance_id: str) -> bool:
    return bool(call_manager_rpc(
        config, "daemon_manager_complete_recovery", lease_values(config, instance_id),
    ))


def complete_restart(config: dict, instance_id: str, request_id: str) -> bool:
    return bool(call_manager_rpc(config, "daemon_manager_complete_restart", {
        **lease_values(config, instance_id), "p_request_id": request_id,
    }))
