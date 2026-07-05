import json
from pathlib import Path


def load_shared_config() -> dict:
    config_path = Path(__file__).resolve().parents[3] / "shared" / "supabase_config.json"
    return json.loads(config_path.read_text(encoding="utf-8"))
