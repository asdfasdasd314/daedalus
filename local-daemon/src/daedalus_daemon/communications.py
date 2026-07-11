import json
import socket
import time
from urllib import request
from urllib.error import URLError


AGENT_CHAT_PAYLOAD_KIND = "agent_chat"
AGENT_PROMPT_PURPOSE = "agent_prompt"
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


class SupabaseUnavailableError(Exception):
    pass


def fetch_current_message(config: dict, purpose: str) -> str:
    rows = fetch_communication_rows(config, purpose)

    if not rows:
        return ""

    return rows[0].get("message", "")


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


def update_current_message(config: dict, purpose: str, message: str) -> None:
    body = json.dumps({
        "p_message": message,
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


def post_agent_chat(
    config: dict,
    prompt_id: str,
    directory: str,
    prompt: str,
    reply: str,
    provider: str = "codex",
    model: str = "",
    reasoning: str = "",
    planning_mode: bool = False,
    targeted_feature_paths: list[str] | None = None,
) -> None:
    upsert_daemon_payload(config, AGENT_CHAT_PAYLOAD_KIND, {
        "promptId": prompt_id,
        "directory": directory,
        "prompt": prompt,
        "reply": reply,
        "provider": provider,
        "model": model,
        "reasoning": reasoning,
        "planningMode": planning_mode,
        "targetedFeaturePaths": targeted_feature_paths or [],
    })


def list_agent_tasks(config: dict) -> list[dict]:
    return call_daemon_rpc(config, "daemon_list_agent_tasks", {
        "p_user_id": config["daemonUserId"],
    })


def update_agent_task(
    config: dict,
    task_id: str,
    expected_status: str,
    updates: dict,
) -> bool:
    result = call_daemon_rpc(config, "daemon_update_agent_task", {
        "p_user_id": config["daemonUserId"],
        "p_task_id": task_id,
        "p_expected_status": expected_status,
        "p_updates": updates,
    })
    return bool(result)


def list_orchestration_batches(config: dict) -> list[dict]:
    return call_daemon_rpc(config, "daemon_list_orchestration_batches", {
        "p_user_id": config["daemonUserId"],
    })


def upsert_orchestration_batch(config: dict, batch: dict) -> None:
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
        response_body = response.read().decode("utf-8")
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
            print(
                "Supabase request failed "
                f"(attempt {attempt}/{retry_limit}): {error}",
            )

            if attempt == retry_limit:
                break

            time.sleep(retry_delay_ms / 1000)

    raise SupabaseUnavailableError(str(last_error)) from last_error
