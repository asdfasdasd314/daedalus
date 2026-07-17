import json
import socket
import time
from urllib import request
from urllib.error import HTTPError, URLError


AGENT_PROMPT_PURPOSE = "agent_prompt"
GIT_SYNC_PAYLOAD_KIND = "git_sync_result"
GIT_SYNC_PURPOSE = "git_sync_request"
DAEMON_REVIEW = "daemon_review"
CLIENT_REVIEW = "client_review"
DAEMON_COMPLETE = "daemon_complete"
CLIENT_COMPLETE = "client_complete"

# Legacy names remain importable for third-party callers during the protocol
# migration. New production paths must use the four review states above.
CLIENT_LOAD_FEATURE_FILES = "client_load_feature_files"
CLIENT_LOAD_PARAMETER_FILES = "client_load_parameter_files"
DAEMON_RECEIVED_MESSAGE = "daemon_received_message"
DAEMON_SENT_FEATURE_FILES = "daemon_sent_feature_files"
DAEMON_SENT_PARAMETER_FILES = "daemon_sent_parameter_files"
DAEMON_SENT_RESPONSE = "daemon_sent_response"
FEATURE_FILES_PAYLOAD_KIND = "feature_files"
FEATURE_FILE_LOAD_PURPOSE = "feature_file_load"
PARAMETER_FILES_PAYLOAD_KIND = "parameter_files"
PARAMETER_FILE_LOAD_PURPOSE = "parameter_file_load"
PARAMETER_FILE_UPDATE_PURPOSE = "parameter_file_update"
ENTRY_POINT_UPDATE_PURPOSE = "entry_point_update"


class SupabaseUnavailableError(Exception):
    pass


_RPC_METRICS = {"started_at": time.monotonic(), "requests": 0, "response_bytes": 0}


def record_rpc_metrics(response_bytes: int) -> None:
    _RPC_METRICS["requests"] += 1
    _RPC_METRICS["response_bytes"] += response_bytes
    if time.monotonic() - _RPC_METRICS["started_at"] < 300:
        return
    print("Supabase daemon aggregate: "
          f"requests={_RPC_METRICS['requests']} response_bytes={_RPC_METRICS['response_bytes']}")
    _RPC_METRICS.update({"started_at": time.monotonic(), "requests": 0, "response_bytes": 0})


def fetch_current_message(config: dict, purpose: str) -> str | None:
    rows = fetch_communication_rows(config, purpose)

    if not rows:
        return None

    # A NULL content value is a valid, payload-free load request. Reserve None
    # for no daemon-review row so project load cycles can distinguish the two.
    return rows[0].get("content") or ""


def fetch_current_messages(config: dict) -> dict[str, str]:
    rows = call_daemon_rpc(config, "daemon_list_communication_reviews", {
        "p_user_id": config["daemonUserId"],
    })
    return {
        str(row["purpose"]): str(row.get("content") or "")
        for row in (rows if isinstance(rows, list) else [])
    }


def fetch_work_snapshot(config: dict) -> dict:
    """Fetch and normalize the single bounded recurrent response for a cycle."""
    payload = call_daemon_rpc(config, "daemon_poll_work", {
        "p_user_id": config["daemonUserId"],
    })
    source = payload if isinstance(payload, dict) else {}
    batches = source.get("orchestrationBatches")
    normalized_batches = batches if isinstance(batches, list) else []
    for batch in normalized_batches:
        batch.setdefault("verification_output", "")
    return {
        "communications": source.get("communications") if isinstance(source.get("communications"), list) else [],
        "agentTasks": source.get("agentTasks") if isinstance(source.get("agentTasks"), list) else [],
        "orchestrationBatches": normalized_batches,
        "architectureViews": source.get("architectureViews") if isinstance(source.get("architectureViews"), list) else [],
        "featureRunControls": source.get("featureRunControls") if isinstance(source.get("featureRunControls"), list) else [],
        "claimedFeatureRun": source.get("claimedFeatureRun") if isinstance(source.get("claimedFeatureRun"), dict) else None,
    }


def snapshot_communication_messages(snapshot: dict) -> dict[str, str]:
    return {
        str(row["purpose"]): str(row.get("content") or "")
        for row in snapshot.get("communications", [])
        if isinstance(row, dict) and row.get("purpose")
    }


def fetch_communication_rows(config: dict, purpose: str) -> list[dict]:
    body = json.dumps({
        "p_purpose": purpose,
        "p_user_id": config["daemonUserId"],
    }).encode("utf-8")
    http_request = request.Request(
        f"{config['supabaseUrl']}/rest/v1/rpc/daemon_get_communication",
        data=body,
        headers=get_supabase_headers(config),
        method="POST",
    )

    with open_supabase_request(config, http_request) as response:
        return json.loads(response.read().decode("utf-8"))


def update_current_message(
    config: dict,
    purpose: str,
    message: str,
    content: str | None = None,
) -> None:
    body = json.dumps({
        "p_message": message,
        "p_content": content,
        "p_purpose": purpose,
        "p_user_id": config["daemonUserId"],
    }).encode("utf-8")
    http_request = request.Request(
        f"{config['supabaseUrl']}/rest/v1/rpc/daemon_upsert_communication",
        data=body,
        headers=get_supabase_headers(config),
        method="POST",
    )

    with open_supabase_request(config, http_request):
        return


def upsert_daemon_payload(config: dict, kind: str, payload: dict) -> None:
    body = json.dumps({
        "p_kind": kind,
        "p_payload": payload,
        "p_user_id": config["daemonUserId"],
    }).encode("utf-8")
    http_request = request.Request(
        f"{config['supabaseUrl']}/rest/v1/rpc/daemon_upsert_payload",
        data=body,
        headers=get_supabase_headers(config),
        method="POST",
    )

    with open_supabase_request(config, http_request):
        return


def post_feature_files(config: dict, projects: dict[str, list[dict[str, str]]]) -> None:
    upsert_daemon_payload(config, FEATURE_FILES_PAYLOAD_KIND, {"projects": projects})


def post_parameter_files(config: dict, projects: dict[str, list[dict[str, str]]]) -> None:
    upsert_daemon_payload(config, PARAMETER_FILES_PAYLOAD_KIND, {"projects": projects})


def post_git_sync_result(config: dict, result: dict) -> None:
    upsert_daemon_payload(config, GIT_SYNC_PAYLOAD_KIND, result)


def upsert_agent_output_history(
    config: dict,
    prompt_id: str,
    repository: str,
    prompt: str,
    output: str,
    error: str,
    provider: str = "codex",
    model: str = "",
    reasoning: str = "",
    mode: str = "planning",
    targeted_feature_paths: list[str] | None = None,
    conversation_id: str | None = None,
    status: str = "running",
    status_detail: str | None = None,
) -> None:
    call_daemon_rpc(config, "daemon_upsert_agent_output_history", {
        "p_user_id": config["daemonUserId"],
        "p_prompt_id": prompt_id,
        "p_repository": repository,
        "p_prompt": prompt,
        "p_output": output,
        "p_error": error,
        "p_provider": provider,
        "p_model": model,
        "p_reasoning": reasoning,
        "p_conversation_id": conversation_id,
        "p_mode": mode,
        "p_targeted_feature_paths": targeted_feature_paths or [],
        "p_status": status,
        "p_status_detail": status_detail,
    })


def list_agent_tasks(config: dict) -> list[dict]:
    return call_daemon_rpc(config, "daemon_list_agent_tasks", {
        "p_user_id": config["daemonUserId"],
    })


def get_agent_task_control(config: dict, task_id: str) -> dict | None:
    result = call_daemon_rpc(config, "daemon_get_agent_task_control", {
        "p_user_id": config["daemonUserId"], "p_task_id": task_id,
    })
    return result if isinstance(result, dict) else None


def update_agent_task(
    config: dict,
    task_id: str,
    expected_status: str,
    updates: dict,
) -> bool:
    if updates.get("status") in {"completed", "failed", "blocked", "cancelled"}:
        updates = {**updates, "message": CLIENT_REVIEW}
    result = call_daemon_rpc(config, "daemon_update_agent_task", {
        "p_user_id": config["daemonUserId"],
        "p_task_id": task_id,
        "p_expected_status": expected_status,
        "p_updates": updates,
    })
    return bool(result)


def claim_architecture_view(config: dict, view: dict) -> dict | None:
    result = call_daemon_rpc(config, "daemon_claim_architecture_view", {
        "p_user_id": config["daemonUserId"],
        "p_view_id": view["id"],
        "p_generation": view["generation"],
        "p_expected_updated_at": view["updated_at"],
    })
    return result if isinstance(result, dict) else None


def complete_architecture_view(
    config: dict,
    view_id: str,
    generation: int,
    expected_updated_at: str,
    status: str,
    changed_files: list[dict],
    architecture_document: dict | None,
    error: str,
    provider: str,
    model: str,
    reasoning: str,
) -> bool:
    result = call_daemon_rpc(config, "daemon_complete_architecture_view", {
        "p_user_id": config["daemonUserId"],
        "p_view_id": view_id,
        "p_generation": generation,
        "p_expected_updated_at": expected_updated_at,
        "p_status": status,
        "p_changed_files": changed_files,
        "p_architecture_document": architecture_document,
        "p_error": error,
        "p_provider": provider,
        "p_model": model,
        "p_reasoning": reasoning,
    })
    return bool(result)


def claim_feature_execution_run(config: dict) -> dict | None:
    result = call_daemon_rpc(config, "daemon_claim_feature_execution_run", {
        "p_user_id": config["daemonUserId"],
    })
    return result[0] if isinstance(result, list) and result else None


def update_feature_execution_run(
    config: dict, run_id: str, expected_status: str, updates: dict,
) -> bool:
    result = call_daemon_rpc(config, "daemon_update_feature_execution_run", {
        "p_user_id": config["daemonUserId"], "p_run_id": run_id,
        "p_expected_status": expected_status, "p_updates": updates,
    })
    return bool(result)


def list_active_feature_execution_runs(config: dict) -> list[dict]:
    result = call_daemon_rpc(config, "daemon_list_active_feature_execution_runs", {
        "p_user_id": config["daemonUserId"],
    })
    return result if isinstance(result, list) else []


def list_orchestration_batches(config: dict) -> list[dict]:
    return call_daemon_rpc(config, "daemon_list_orchestration_batches", {
        "p_user_id": config["daemonUserId"],
    })


def upsert_orchestration_batch(config: dict, batch: dict) -> None:
    batch = {
        **batch,
        "message": (
            DAEMON_COMPLETE
            if batch.get("status") in {"completed", "blocked"}
            else DAEMON_REVIEW
        ),
    }
    call_daemon_rpc(config, "daemon_upsert_orchestration_batch", {
        "p_user_id": config["daemonUserId"],
        "p_batch": batch,
    })


def record_daemon_event(
    config: dict,
    repository: str,
    severity: str,
    message: str,
    task_id: str | None = None,
    batch_id: str | None = None,
) -> None:
    call_daemon_rpc(config, "daemon_record_event", {
        "p_user_id": config["daemonUserId"],
        "p_repository": repository,
        "p_task_id": task_id,
        "p_batch_id": batch_id,
        "p_severity": severity,
        "p_message": message,
    })


def call_daemon_rpc(config: dict, function_name: str, payload: dict):
    body = json.dumps(payload).encode("utf-8")
    http_request = request.Request(
        f"{config['supabaseUrl']}/rest/v1/rpc/{function_name}",
        data=body,
        headers=get_supabase_headers(config),
        method="POST",
    )

    with open_supabase_request(config, http_request) as response:
        raw_response = response.read()
        record_rpc_metrics(len(raw_response))
        response_body = raw_response.decode("utf-8")
        return json.loads(response_body) if response_body else None


def get_supabase_headers(config: dict) -> dict[str, str]:
    publishable_key = config["supabasePublishableKey"]

    return {
        "apikey": publishable_key,
        "Authorization": f"Bearer {publishable_key}",
        "Content-Type": "application/json",
    }


def open_supabase_request(config: dict, http_request: request.Request):
    retry_limit = config.get("httpRequestRetryLimit", 3)
    retry_delay_ms = config.get("httpRequestRetryDelayMs", 750)
    timeout_seconds = config.get("httpRequestTimeoutSeconds", 20)
    last_error = None

    for attempt in range(1, retry_limit + 1):
        try:
            return request.urlopen(http_request, timeout=timeout_seconds)
        except (ConnectionResetError, TimeoutError, socket.timeout, URLError) as error:
            last_error = error
            error_detail = str(error)

            if isinstance(error, HTTPError):
                response_body = error.read().decode("utf-8", errors="replace").strip()
                if response_body:
                    error_detail = f"{error}: {response_body}"
            print(
                "Supabase request failed "
                f"(attempt {attempt}/{retry_limit}): {error_detail}",
            )

            if attempt == retry_limit:
                break

            time.sleep(retry_delay_ms / 1000)

    raise SupabaseUnavailableError(error_detail) from last_error
