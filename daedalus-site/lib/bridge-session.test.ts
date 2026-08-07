import assert from "node:assert/strict";
import test from "node:test";
import { parseBridgeReply, parseBridgeTasksSection } from "./bridge-session";

test("parses need_more_questions bridge reply", () => {
  const parsed = parseBridgeReply(`## Status
need_more_questions

## Notes
Need fee and venue coverage.

## Questions

1. **[Can fees be beaten alone?]**:
   - a. Yes with maker only
   - b. Need rebates
   - c. Unclear`);

  assert.equal(parsed.status, "need_more_questions");
  assert.equal(parsed.notes, "Need fee and venue coverage.");
  assert.deepEqual(parsed.questions, [{
    question: "Can fees be beaten alone?",
    options: ["Yes with maker only", "Need rebates", "Unclear"],
  }]);
  assert.deepEqual(parsed.tasks, []);
});

test("parses ready bridge reply with tasks", () => {
  const parsed = parseBridgeReply(`## Status
ready

## Notes
Coverage is enough.

## Tasks

1. **Backtest harness**: Implement the volatility oscillation backtest.
2. **Live strategy skeleton**:
   Add maker-only entry and wider spread defaults.`);

  assert.equal(parsed.status, "ready");
  assert.equal(parsed.tasks.length, 2);
  assert.equal(parsed.tasks[0].title, "Backtest harness");
  assert.match(parsed.tasks[0].prompt, /backtest/i);
  assert.equal(parsed.tasks[1].title, "Live strategy skeleton");
  assert.match(parsed.tasks[1].prompt, /maker-only/i);
});

test("parses fenced bridge replies", () => {
  const parsed = parseBridgeReply(`\`\`\`md
## Status
ready

## Tasks

1. **One task**: Do the work
\`\`\``);

  assert.equal(parsed.status, "ready");
  assert.equal(parsed.tasks[0].title, "One task");
});

test("task section parser keeps multi-line prompts", () => {
  const tasks = parseBridgeTasksSection(`## Tasks

1. **Title**: First line
   Second line
2. **Next**: Only one line`);
  assert.ok(tasks[0].prompt.includes("First line"));
  assert.ok(tasks[0].prompt.includes("Second line"));
  assert.equal(tasks[1].prompt, "Only one line");
});
