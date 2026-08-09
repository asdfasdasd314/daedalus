import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCpDocSkeleton,
  cpDocHasAllSections,
  ensureStructuredCpDoc,
  parseBridgeReply,
  parseBridgeTasksSection,
} from "./bridge-session";

test("builds five-section cp_doc skeleton from direction", () => {
  const doc = buildCpDocSkeleton("Trade vol oscillations");
  assert.equal(cpDocHasAllSections(doc), true);
  assert.match(doc, /## Project Summary\nTrade vol oscillations/);
  assert.match(doc, /## Tech Stack/);
  assert.match(doc, /## Broad Principles/);
  assert.match(doc, /## Project State/);
  assert.match(doc, /## Additional Notes/);
});

test("ensureStructuredCpDoc wraps free-form and keeps structured", () => {
  const wrapped = ensureStructuredCpDoc("User auth needed");
  assert.equal(cpDocHasAllSections(wrapped), true);
  assert.match(wrapped, /User auth needed/);

  const structured = buildCpDocSkeleton("Already good");
  assert.equal(ensureStructuredCpDoc(structured).includes("## Tech Stack"), true);
});

test("parses need_more_questions bridge reply with structured cp_doc and mass questions", () => {
  const parsed = parseBridgeReply(`## Status
need_more_questions

## Cp Doc
## Project Summary
- Volatility edge research
- User auth needed

## Tech Stack
(not yet established)

## Broad Principles
Prefer maker-only when possible

## Project State
prototyping

## Additional Notes
(none yet)

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
  assert.match(parsed.cpDoc, /## Project Summary/);
  assert.match(parsed.cpDoc, /User auth needed/);
  assert.match(parsed.cpDoc, /## Project State/);
  assert.match(parsed.cpDoc, /prototyping/);
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
## Project Summary
Maker-only vol oscillation strategy with fee-aware backtest.

## Tech Stack
Python, internal venue adapters

## Broad Principles
(not yet established)

## Project State
mvp

## Additional Notes
(none yet)

## Notes
Coverage is enough.

## Tasks

1. **Backtest harness**: Implement the volatility oscillation backtest.
2. **Live strategy skeleton**:
   Add maker-only entry and wider spread defaults.`);

  assert.equal(parsed.status, "ready");
  assert.match(parsed.cpDoc, /## Project Summary/);
  assert.match(parsed.cpDoc, /Maker-only/);
  assert.match(parsed.cpDoc, /## Tech Stack/);
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
## Project Summary
Minimal vision.

## Tech Stack
TS

## Broad Principles
(not yet established)

## Project State
debugging

## Additional Notes
(none yet)

## Tasks

1. **One task**: Do the work
\`\`\``);

  assert.equal(parsed.status, "ready");
  assert.match(parsed.cpDoc, /Minimal vision/);
  assert.equal(parsed.tasks.length, 1);
});

test("parseBridgeTasksSection tolerates multiline prompts", () => {
  const tasks = parseBridgeTasksSection(`## Tasks

1. **One**: first line
   second line
2. **Two**: only one line`);
  assert.equal(tasks.length, 2);
  assert.match(tasks[0].prompt, /second line/);
});

test("parses next_task and mvp_complete bridge statuses", () => {
  const next = parseBridgeReply(`## Status
next_task

## Cp Doc
## Project Summary
App

## Tech Stack
TS

## Broad Principles
-

## Project State
mvp

## Additional Notes
-

## Tasks

1. **Scaffold**: Create Next app
2. **Extra ignored when next_task**: should be dropped by single-task rule`);
  assert.equal(next.status, "next_task");
  assert.equal(next.tasks.length, 1);
  assert.equal(next.tasks[0].title, "Scaffold");

  const done = parseBridgeReply(`## Status
mvp_complete

## Cp Doc
## Project Summary
App

## Tech Stack
TS

## Broad Principles
-

## Project State
mvp

## Additional Notes
-

## Notes
Done enough.`);
  assert.equal(done.status, "mvp_complete");
  assert.equal(done.tasks.length, 0);
});
