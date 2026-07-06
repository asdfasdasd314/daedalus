import json
from urllib import request


CLIENT_LOAD_FEATURE_FILES = "client_load_feature_files"
DAEMON_RECEIVED_MESSAGE = "daemon_received_message"
DAEMON_SENT_FEATURE_FILES = "daemon_sent_feature_files"
DAEMON_SENT_RESPONSE = "daemon_sent_response"
FEATURE_FILE_LOAD_PURPOSE = "feature_file_load"
AGENT_PROMPT_PURPOSE = "agent_prompt"


def fetch_current_message(config: dict, purpose: str) -> str:
    rows = fetch_communication_rows(config, purpose)

    if not rows:
        return ""

    return rows[0].get("message", "")


def fetch_communication_rows(config: dict, purpose: str) -> list[dict]:
    url = (
        f"{config['supabaseUrl']}/rest/v1/communications"
        f"?select=message,purpose&purpose=eq.{purpose}&limit=1"
    )
    headers = {
        "apikey": config["supabaseServiceRoleKey"],
        "Authorization": f"Bearer {config['supabaseServiceRoleKey']}",
    }
    http_request = request.Request(url, headers=headers, method="GET")

    with request.urlopen(http_request) as response:
        return json.loads(response.read().decode("utf-8"))


def update_current_message(config: dict, purpose: str, message: str) -> None:
    rows = fetch_communication_rows(config, purpose)

    if rows:
        patch_current_message(config, purpose, message)
        return

    insert_current_message(config, purpose, message)


def patch_current_message(config: dict, purpose: str, message: str) -> None:
    url = (
        f"{config['supabaseUrl']}/rest/v1/communications"
        f"?purpose=eq.{purpose}"
    )
    headers = {
        "apikey": config["supabaseServiceRoleKey"],
        "Authorization": f"Bearer {config['supabaseServiceRoleKey']}",
        "Content-Type": "application/json",
    }
    body = json.dumps({"message": message, "purpose": purpose}).encode("utf-8")
    http_request = request.Request(url, data=body, headers=headers, method="PATCH")

    with request.urlopen(http_request):
        return


def insert_current_message(config: dict, purpose: str, message: str) -> None:
    url = f"{config['supabaseUrl']}/rest/v1/communications"
    headers = {
        "apikey": config["supabaseServiceRoleKey"],
        "Authorization": f"Bearer {config['supabaseServiceRoleKey']}",
        "Content-Type": "application/json",
    }
    body = json.dumps({"message": message, "purpose": purpose}).encode("utf-8")
    http_request = request.Request(url, data=body, headers=headers, method="POST")

    with request.urlopen(http_request):
        return


def post_feature_files(config: dict, projects: dict[str, list[dict[str, str]]]) -> None:
    url = f"{config['frontendBaseUrl']}/api/feature-files"
    headers = {
        "Content-Type": "application/json",
    }
    body = json.dumps({
        "source": "daemon",
        "projects": projects,
    }).encode("utf-8")
    http_request = request.Request(url, data=body, headers=headers, method="POST")

    with request.urlopen(http_request):
        return


def post_agent_chat(
    config: dict,
    directory: str,
    prompt: str,
    reply: str,
    provider: str = "codex",
    model: str = "",
    reasoning: str = "",
    planning_mode: bool = False,
) -> None:
    url = f"{config['frontendBaseUrl']}/api/agent-chat"
    headers = {
        "Content-Type": "application/json",
    }
    body = json.dumps({
        "source": "daemon",
        "directory": directory,
        "prompt": prompt,
        "reply": reply,
        "provider": provider,
        "model": model,
        "reasoning": reasoning,
        "planningMode": planning_mode,
    }).encode("utf-8")
    http_request = request.Request(url, data=body, headers=headers, method="POST")

    with request.urlopen(http_request):
        return
