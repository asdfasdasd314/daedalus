import json
from urllib import request


CLIENT_LOAD_FEATURE_FILES = "client_load_feature_files"
DAEMON_RECEIVED_MESSAGE = "daemon_received_message"
DAEMON_SENT_FEATURE_FILES = "daemon_sent_feature_files"


def fetch_current_message(config: dict) -> str:
    rows = fetch_communication_rows(config)

    if not rows:
        return ""

    return rows[0].get("message", "")


def fetch_communication_rows(config: dict) -> list[dict]:
    url = f"{config['supabaseUrl']}/rest/v1/communications?select=message&limit=1"
    headers = {
        "apikey": config["supabaseServiceRoleKey"],
        "Authorization": f"Bearer {config['supabaseServiceRoleKey']}",
    }
    http_request = request.Request(url, headers=headers, method="GET")

    with request.urlopen(http_request) as response:
        return json.loads(response.read().decode("utf-8"))


def update_current_message(config: dict, message: str) -> None:
    rows = fetch_communication_rows(config)

    if rows:
        patch_current_message(config, message)
        return

    insert_current_message(config, message)


def patch_current_message(config: dict, message: str) -> None:
    url = f"{config['supabaseUrl']}/rest/v1/communications?message=not.is.null"
    headers = {
        "apikey": config["supabaseServiceRoleKey"],
        "Authorization": f"Bearer {config['supabaseServiceRoleKey']}",
        "Content-Type": "application/json",
    }
    body = json.dumps({"message": message}).encode("utf-8")
    http_request = request.Request(url, data=body, headers=headers, method="PATCH")

    with request.urlopen(http_request):
        return


def insert_current_message(config: dict, message: str) -> None:
    url = f"{config['supabaseUrl']}/rest/v1/communications"
    headers = {
        "apikey": config["supabaseServiceRoleKey"],
        "Authorization": f"Bearer {config['supabaseServiceRoleKey']}",
        "Content-Type": "application/json",
    }
    body = json.dumps({"message": message}).encode("utf-8")
    http_request = request.Request(url, data=body, headers=headers, method="POST")

    with request.urlopen(http_request):
        return


def post_feature_files(config: dict, projects: dict[str, list[str]]) -> None:
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
