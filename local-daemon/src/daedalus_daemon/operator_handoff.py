"""Validated, redacted operator-required handoffs for agent task execution."""

import json
import re

MARKER_RE = re.compile(r"<operator_handoff>\s*(\{.*?\})\s*</operator_handoff>", re.DOTALL)
CATEGORIES = {"identity_access", "secret_or_api_credential", "billing_financial_commitment", "legal_consent", "third_party_service_configuration"}


def operator_handoff_prompt() -> str:
    return """\n\nOperator-required boundaries: complete every reversible technical action yourself. Stop only when a human must authenticate, supply a secret, accept billing/terms, authorize an external action, or confirm ownership/configuration of an external resource. Do not ask the operator to perform ordinary technical work. When blocked by one of those boundaries, end your reply with exactly one <operator_handoff>{JSON}</operator_handoff> marker. JSON must contain category (identity_access, secret_or_api_credential, billing_financial_commitment, legal_consent, or third_party_service_configuration), title, reason, service, completed_work, steps (a non-empty array of concrete manual steps), and recheck. Never include a secret, token, password, or private key."""


def parse_operator_handoff(reply: str) -> tuple[dict | None, str]:
    match = MARKER_RE.search(reply or "")
    if not match:
        return None, reply
    clean_reply = (reply[:match.start()] + reply[match.end():]).strip()
    try:
        value = json.loads(match.group(1))
    except json.JSONDecodeError:
        return None, reply
    handoff = validate_operator_handoff(value)
    return (handoff, clean_reply) if handoff else (None, reply)


def validate_operator_handoff(value: object) -> dict | None:
    if not isinstance(value, dict) or value.get("category") not in CATEGORIES:
        return None
    fields = ("title", "reason", "service", "completed_work", "recheck")
    if any(not isinstance(value.get(field), str) or not value[field].strip() for field in fields):
        return None
    steps = value.get("steps")
    if not isinstance(steps, list) or not steps or any(not isinstance(step, str) or not step.strip() for step in steps):
        return None
    return {"category": value["category"], **{field: redact_text(value[field]) for field in fields}, "steps": [redact_text(step) for step in steps[:12]], "diagnostics": redact_text(str(value.get("diagnostics", "")))}


def redact_text(value: str) -> str:
    return re.sub(r"(?i)(token|password|secret|api[_ -]?key)\s*[:=]\s*\S+", r"\1=[REDACTED]", value).strip()[:4000]


def supabase_mapping_handoff(repository: str, reason: str) -> dict:
    return {
        "category": "third_party_service_configuration", "title": "Configure the Supabase project for this repository", "reason": reason, "service": "Supabase",
        "completed_work": "The task worktree was verified up to the safe deployment boundary; no Supabase command was run for this repository.",
        "steps": ["Sign in to the intended Supabase account and identify the project reference for this repository.", "Review the linked project's migration history and compare its schema with shared/database/schema.sql.", f"In Daedalus parameter_files/supabase-migration-deployment.toml, manually configure exactly one mapping: {repository}::YOUR_PROJECT_REF.", "Return here and choose Resume task so Daedalus can revalidate the mapping before continuing."],
        "recheck": "The daemon must resolve exactly one allowlisted Supabase project mapping for this repository before running Supabase preflight.", "diagnostics": redact_text(reason),
    }
