import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from daedalus_daemon.operator_handoff import (
    parse_operator_handoff,
    supabase_mapping_handoff,
    validate_operator_handoff,
)


class OperatorHandoffTests(unittest.TestCase):
    def test_parses_and_removes_valid_marker(self):
        handoff, reply = parse_operator_handoff(
            'Completed safe work. <operator_handoff>{"category":"identity_access","title":"Sign in","reason":"Login required","service":"Example","completed_work":"Checked config","steps":["Sign in"],"recheck":"Retry login"}</operator_handoff>'
        )
        self.assertEqual(reply, "Completed safe work.")
        self.assertEqual(handoff["category"], "identity_access")
        self.assertEqual(handoff["steps"], ["Sign in"])

    def test_invalid_marker_is_left_as_normal_agent_output(self):
        reply = '<operator_handoff>{"category":"invalid"}</operator_handoff>'
        handoff, remaining = parse_operator_handoff(reply)
        self.assertIsNone(handoff)
        self.assertEqual(remaining, reply)

    def test_redacts_secret_like_diagnostics(self):
        value = validate_operator_handoff({
            "category": "secret_or_api_credential", "title": "Credential", "reason": "token=abc",
            "service": "Example", "completed_work": "Checked", "steps": ["Sign in"],
            "recheck": "Retry", "diagnostics": "api_key: hidden",
        })
        self.assertNotIn("abc", value["reason"])
        self.assertNotIn("hidden", value["diagnostics"])

    def test_supabase_mapping_handoff_has_manual_steps_and_exact_repository(self):
        handoff = supabase_mapping_handoff("/projects/flockdock", "No mapping")
        self.assertEqual(handoff["service"], "Supabase")
        self.assertIn("/projects/flockdock::YOUR_PROJECT_REF", handoff["steps"][2])
        self.assertTrue(handoff["recheck"])
