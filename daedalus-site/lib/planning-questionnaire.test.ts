import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPlanningAnswersSuffix,
  parsePlanningReply,
} from "./planning-questionnaire";

test("parses a terminal planning question section", () => {
  const parsed = parsePlanningReply(`## Plan

Build the feature.

## Questions

1. **[Use a cache?]**:
   - a. Yes
   - b. No`);

  assert.equal(parsed.plan, "## Plan\n\nBuild the feature.");
  assert.deepEqual(parsed.questions, [{
    question: "Use a cache?",
    options: ["Yes", "No"],
  }]);
});

test("parses terminal questions from a fenced planner response", () => {
  const parsed = parsePlanningReply(`\`\`\`md
# Plan: Reduce Recurrent Supabase Egress

## Questions

1. **What maximum delay is acceptable before the manager observes a restart/control request?**
   - a. 5 seconds (Recommended): aligns with heartbeat cadence.
   - b. 10 seconds: further reduces egress.
   - c. Keep 1 second: preserves responsiveness.
\`\`\``);

  assert.equal(parsed.plan, "# Plan: Reduce Recurrent Supabase Egress");
  assert.deepEqual(parsed.questions, [{
    question: "What maximum delay is acceptable before the manager observes a restart/control request?",
    options: [
      "5 seconds (Recommended): aligns with heartbeat cadence.",
      "10 seconds: further reduces egress.",
      "Keep 1 second: preserves responsiveness.",
    ],
  }]);
});

test("keeps malformed question sections in the visible plan", () => {
  const reply = "## Plan\n\n## Questions\n\n1. **[Use a cache?]**:";

  assert.deepEqual(parsePlanningReply(reply), { plan: reply, questions: [] });
});

test("formats accumulated question answers", () => {
  assert.equal(
    buildPlanningAnswersSuffix([{ question: "Use a cache?", answer: "Other" }]),
    "The following questions have been asked alongside their answers:\n\n1. Use a cache? — Other",
  );
});
