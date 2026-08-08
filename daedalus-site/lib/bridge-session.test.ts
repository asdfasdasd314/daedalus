import assert from "node:assert/strict";
import test from "node:test";
import { parseBridgeReply, parseBridgeTasksSection } from "./bridge-session";

test("parses need_more_questions bridge reply with cp_doc and mass questions", () => {
  const parsed = parseBridgeReply(`## Status
need_more_questions

## Cp Doc
- Volatility edge research
- User auth needed

## Notes
Need fee and venue coverage.

## Questions

1. **[Can fees be beaten alone?]**:
   - a. Yes with maker only
   - b. Need rebates
   - c. Unclear
2. **[Primary venue?]**:
   - a. Spot CEX
   - b. Perps
   - c. Both
3. **[Backtest first?]**:
   - a. Yes full stats
   - b. Minimal smoke
   - c. Skip to live skeleton`);

  assert.equal(parsed.status, "need_more_questions");
  assert.match(parsed.cpDoc, /User auth needed/);
  assert.match(parsed.cpDoc, /Volatility edge/);
  assert.equal(parsed.notes, "Need fee and venue coverage.");
  assert.equal(parsed.questions.length, 3);
  assert.deepEqual(parsed.questions[0], {
    question: "Can fees be beaten alone?",
    options: ["Yes with maker only", "Need rebates", "Unclear"],
  });
  assert.equal(parsed.questions[2].question, "Backtest first?");
  assert.deepEqual(parsed.tasks, []);
});

test("parses ready bridge reply with tasks", () => {
  const parsed = parseBridgeReply(`## Status
ready

## Cp Doc
Maker-only vol oscillation strategy with fee-aware backtest.

## Notes
Coverage is enough.

## Tasks

1. **Backtest harness**: Implement the volatility oscillation backtest.
2. **Live strategy skeleton**:
   Add maker-only entry and wider spread defaults.`);

  assert.equal(parsed.status, "ready");
  assert.match(parsed.cpDoc, /Maker-only/);
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

## Cp Doc
Minimal vision.

## Tasks

1. **One task**: Do the work
\`\`\``);

  assert.equal(parsed.status, "ready");
  assert.equal(parsed.cpDoc, "Minimal vision.");
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
