import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBridgeTaskingPrompt,
  buildDurableImplementationPrompt,
  canStartAopBuildLoop,
  nextStatusAfterTaskComplete,
  resumeStatusFromPaused,
} from "./aop-loop";
import { parseImplPrepReply } from "./impl-prep";

test("nextStatusAfterTaskComplete hits verification at N", () => {
  assert.equal(nextStatusAfterTaskComplete(2, 3), "awaiting_verification");
  assert.equal(nextStatusAfterTaskComplete(1, 3), "bridging_task");
  assert.equal(nextStatusAfterTaskComplete(0, 1), "awaiting_verification");
});

test("canStartAopBuildLoop only for idle or terminal", () => {
  assert.equal(canStartAopBuildLoop(null), true);
  assert.equal(canStartAopBuildLoop("completed"), true);
  assert.equal(canStartAopBuildLoop("executing"), false);
  assert.equal(canStartAopBuildLoop("paused"), false);
});

test("resumeStatusFromPaused validates paused_from", () => {
  assert.equal(resumeStatusFromPaused("awaiting_start"), "awaiting_start");
  assert.equal(resumeStatusFromPaused("bogus"), null);
});

test("buildBridgeTaskingPrompt includes cp_doc and recents", () => {
  const prompt = buildBridgeTaskingPrompt({
    directionPrompt: "Build a landing page",
    cpDoc: "## Project Summary\nLanding\n",
    recentTaskTitles: ["Scaffold Next app"],
  });
  assert.match(prompt, /next_task/);
  assert.match(prompt, /Scaffold Next app/);
  assert.match(prompt, /Landing/);
});

test("buildDurableImplementationPrompt includes prep answers", () => {
  const prompt = buildDurableImplementationPrompt({
    taskTitle: "Install deps",
    taskPrompt: "Run package install",
    prepAnswers: [{ question: "Bundler?", answer: "Vite" }],
    directionPrompt: "Ship MVP",
  });
  assert.match(prompt, /Vite/);
  assert.match(prompt, /Install deps/);
});

test("parses impl prep need_more_questions", () => {
  const parsed = parseImplPrepReply(`## Status
need_more_questions

## Notes
Need bundler choice.

## Questions

1. **[Which bundler?]**:
   - a. Vite
   - b. Webpack
   - c. esbuild`);
  assert.equal(parsed.status, "need_more_questions");
  assert.equal(parsed.questions.length, 1);
  assert.equal(parsed.questions[0].question, "Which bundler?");
});

test("parses impl prep ready_to_execute with optional cp_doc", () => {
  const parsed = parseImplPrepReply(`## Status
ready_to_execute

## Notes
Ready.

## Optional Cp Doc
## Project Summary
App

## Tech Stack
Vite + React

## Broad Principles
(none yet)

## Project State
mvp

## Additional Notes
(none yet)
`);
  assert.equal(parsed.status, "ready_to_execute");
  assert.match(parsed.optionalCpDoc, /Vite/);
});
