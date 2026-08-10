import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBridgeTaskingPrompt,
  buildDurableImplementationPrompt,
  buildFeatureFileDigest,
  canStartAopBuildLoop,
  extractAopTaskTitleFromPrompt,
  isAopCodingTaskInFlight,
  isBridgeTaskingReply,
  loopCountersFromCompletedSlices,
  loopHistoryNeedsSync,
  loopPatchAfterCodingTaskTerminal,
  needsBridgeTaskingRetry,
  needsManualCodingRetry,
  nextStatusAfterTaskComplete,
  resumeStatusFromPaused,
  shouldAutoStartCoding,
  summarizeLoopCodingHistory,
  type AopLoopCodingSlice,
} from "./aop-loop";
import { parseImplPrepReply } from "./impl-prep";

test("nextStatusAfterTaskComplete hits verification at N", () => {
  assert.equal(nextStatusAfterTaskComplete(2, 3), "awaiting_verification");
  assert.equal(nextStatusAfterTaskComplete(1, 3), "bridging_task");
  assert.equal(nextStatusAfterTaskComplete(0, 1), "awaiting_verification");
});

test("loop advances only on completed durable coding tasks", () => {
  const completed = loopPatchAfterCodingTaskTerminal({
    tasksCompletedTotal: 0,
    tasksSinceVerification: 0,
    maxTasksBeforeVerification: 3,
    recentTaskTitles: [],
    integratedCommits: [],
    completedCommit: "abc123def456",
    currentTaskTitle: "Landing page",
    taskStatus: "completed",
  });
  assert.equal(completed?.shouldQueueBridge, true);
  assert.equal(completed?.updates.status, "bridging_task");
  assert.equal(completed?.updates.tasks_completed_total, 1);
  assert.equal(completed?.updates.current_agent_task_id, null);
  assert.deepEqual(completed?.updates.integrated_commits, ["abc123def456"]);

  const pauseAfter = loopPatchAfterCodingTaskTerminal({
    tasksCompletedTotal: 0,
    tasksSinceVerification: 0,
    maxTasksBeforeVerification: 3,
    recentTaskTitles: [],
    integratedCommits: [],
    completedCommit: "abc123def456",
    currentTaskTitle: "Landing page",
    taskStatus: "completed",
    pauseAfterTask: true,
  });
  assert.equal(pauseAfter?.shouldQueueBridge, false);
  assert.equal(pauseAfter?.updates.status, "paused");
  assert.equal(pauseAfter?.updates.paused_from, "bridging_task");
  assert.equal(pauseAfter?.updates.pause_requested, false);
  assert.equal(pauseAfter?.updates.tasks_completed_total, 1);

  const pauseRequested = loopPatchAfterCodingTaskTerminal({
    tasksCompletedTotal: 2,
    tasksSinceVerification: 2,
    maxTasksBeforeVerification: 3,
    recentTaskTitles: ["A", "B"],
    currentTaskTitle: "C",
    taskStatus: "completed",
    completedCommit: "ccc",
    pauseRequested: true,
  });
  assert.equal(pauseRequested?.updates.status, "paused");
  assert.equal(pauseRequested?.updates.paused_from, "awaiting_verification");

  const failed = loopPatchAfterCodingTaskTerminal({
    tasksCompletedTotal: 0,
    tasksSinceVerification: 0,
    maxTasksBeforeVerification: 3,
    recentTaskTitles: [],
    currentTaskTitle: "Landing page",
    taskStatus: "failed",
    taskError: "Primary worktree must be clean",
  });
  assert.equal(failed?.shouldQueueBridge, false);
  assert.equal(failed?.updates.status, "awaiting_start");
  assert.match(failed?.updates.status_detail ?? "", /Primary worktree/);
  assert.equal(failed?.updates.current_agent_task_id, null);

  const cancelled = loopPatchAfterCodingTaskTerminal({
    tasksCompletedTotal: 1,
    tasksSinceVerification: 1,
    maxTasksBeforeVerification: 3,
    recentTaskTitles: ["Scaffold"],
    currentTaskTitle: "Landing page",
    taskStatus: "cancelled",
  });
  assert.equal(cancelled?.shouldQueueBridge, false);
  assert.equal(cancelled?.updates.status, "paused");
  assert.equal(cancelled?.updates.paused_from, "awaiting_start");
});

test("isAopCodingTaskInFlight covers worktree orchestrator statuses", () => {
  assert.equal(isAopCodingTaskInFlight("queued"), true);
  assert.equal(isAopCodingTaskInFlight("integrating"), true);
  assert.equal(isAopCodingTaskInFlight("failed"), false);
  assert.equal(isAopCodingTaskInFlight("completed"), false);
});

test("needsBridgeTaskingRetry only when stuck or failed", () => {
  assert.equal(
    needsBridgeTaskingRetry({
      status: "bridging_task",
      activePromptId: "p1",
      statusDetail: "Bridge is choosing coding task #2…",
    }),
    false,
  );
  assert.equal(
    needsBridgeTaskingRetry({
      status: "bridging_task",
      activePromptId: "",
      statusDetail: "Bridge is choosing…",
    }),
    true,
  );
  assert.equal(
    needsBridgeTaskingRetry({
      status: "bridging_task",
      activePromptId: "p1",
      statusDetail: "Bridge tasking failed: missing next_task",
    }),
    true,
  );
  assert.equal(
    needsBridgeTaskingRetry({
      status: "executing",
      activePromptId: "",
      statusDetail: "",
    }),
    false,
  );
});

test("shouldAutoStartCoding skips manual failure gates", () => {
  assert.equal(
    shouldAutoStartCoding({
      status: "awaiting_start",
      currentTaskTitle: "Landing",
      currentTaskPrompt: "Build it",
      statusDetail: "Starting coding automatically: Landing",
    }),
    true,
  );
  assert.equal(
    shouldAutoStartCoding({
      status: "awaiting_start",
      currentTaskTitle: "Landing",
      currentTaskPrompt: "Build it",
      statusDetail: "Could not queue coding task: dirty tree",
    }),
    false,
  );
  assert.equal(
    needsManualCodingRetry(
      "Primary worktree must be clean. Fix the issue, then Start task again (same slice — not a new bridge task).",
    ),
    true,
  );
});

test("resumeStatusFromPaused validates paused_from", () => {
  assert.equal(resumeStatusFromPaused("awaiting_start"), "awaiting_start");
  assert.equal(resumeStatusFromPaused("bogus"), null);
});

test("extractAopTaskTitleFromPrompt reads TASK line", () => {
  assert.equal(
    extractAopTaskTitleFromPrompt("TASK: Landing page\n\nBuild it"),
    "Landing page",
  );
  assert.equal(extractAopTaskTitleFromPrompt("First line only"), "First line only");
});

test("loopCountersFromCompletedSlices ignores failed attempts", () => {
  const slices: AopLoopCodingSlice[] = [
    {
      id: "1",
      title: "Landing",
      status: "completed",
      error: "",
      completedCommit: "aaa",
      branchName: "t1",
      createdAt: "",
      completedAt: "",
    },
    {
      id: "2",
      title: "Form",
      status: "failed",
      error: "clean required",
      completedCommit: "",
      branchName: "t2",
      createdAt: "",
      completedAt: "",
    },
    {
      id: "3",
      title: "Polish",
      status: "completed",
      error: "",
      completedCommit: "bbb",
      branchName: "t3",
      createdAt: "",
      completedAt: "",
    },
  ];
  const counters = loopCountersFromCompletedSlices(slices);
  assert.equal(counters.tasks_completed_total, 2);
  assert.deepEqual(counters.recent_task_titles, ["Landing", "Polish"]);
  assert.deepEqual(counters.integrated_commits, ["aaa", "bbb"]);
  assert.match(summarizeLoopCodingHistory(slices), /\[failed\] Form/);
  assert.match(summarizeLoopCodingHistory(slices), /\[completed\] Landing/);
  assert.equal(
    loopHistoryNeedsSync(
      {
        tasksCompletedTotal: 0,
        recentTaskTitles: [],
        integratedCommits: [],
      },
      counters,
    ),
    true,
  );
  assert.equal(
    loopHistoryNeedsSync(
      {
        tasksCompletedTotal: 2,
        recentTaskTitles: ["Landing", "Polish"],
        integratedCommits: ["aaa", "bbb"],
      },
      counters,
    ),
    false,
  );
});

test("buildFeatureFileDigest keeps State Log and Key Points", () => {
  const digest = buildFeatureFileDigest(
    `# Feature\n\n## Summary\nShip activities.\n\n## Key Points\n- auth\n- forms\n\n## State Log\n- 2026-01-01: started\n- 2026-01-02: landing done\n`,
    "feature_files/act.md",
  );
  assert.match(digest, /feature_files\/act\.md/);
  assert.match(digest, /Ship activities/);
  assert.match(digest, /landing done/);
  assert.match(digest, /forms/);
});

test("buildBridgeTaskingPrompt includes history + feature digests", () => {
  const prompt = buildBridgeTaskingPrompt({
    directionPrompt: "Build a landing page",
    cpDoc: "## Project Summary\nLanding\n",
    recentTaskTitles: ["Scaffold Next app"],
    codingHistory: [
      {
        id: "1",
        title: "Scaffold Next app",
        status: "completed",
        error: "",
        completedCommit: "deadbeef",
        branchName: "task-1",
        createdAt: "",
        completedAt: "",
      },
      {
        id: "2",
        title: "Activity form",
        status: "failed",
        error: "dirty tree",
        completedCommit: "",
        branchName: "task-2",
        createdAt: "",
        completedAt: "",
      },
    ],
    featureDigests: "### feature_files/x.md\n#### State Log\n- landing shipped",
  });
  assert.match(prompt, /next_task/);
  assert.match(prompt, /Scaffold Next app/);
  assert.match(prompt, /\[failed\] Activity form/);
  assert.match(prompt, /landing shipped/);
  assert.match(prompt, /next coding task after 1 completed/);
  assert.match(prompt, /authoritative progress/);
  assert.match(prompt, /Landing/);
});

test("buildBridgeTaskingPrompt marks first task when recents empty", () => {
  const prompt = buildBridgeTaskingPrompt({
    directionPrompt: "Ship MVP",
    cpDoc: "summary",
    recentTaskTitles: [],
  });
  assert.match(prompt, /first coding task/);
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

test("isBridgeTaskingReply uses capture, session phase, or bridging_task loop", () => {
  assert.equal(isBridgeTaskingReply({ capturedBridgeTasking: true }), true);
  assert.equal(isBridgeTaskingReply({ sessionPhase: "tasking" }), true);
  assert.equal(
    isBridgeTaskingReply({
      loopStatus: "bridging_task",
      promptId: "p1",
      loopActivePromptId: "p1",
    }),
    true,
  );
  // Queue already finalized — still tasking while loop owns the prompt.
  assert.equal(
    isBridgeTaskingReply({
      capturedBridgeTasking: false,
      loopStatus: "bridging_task",
      promptId: "p1",
      sessionActiveBridgePromptId: "p1",
    }),
    true,
  );
  assert.equal(
    isBridgeTaskingReply({
      loopStatus: "awaiting_start",
      promptId: "p1",
    }),
    false,
  );
  assert.equal(
    isBridgeTaskingReply({
      loopStatus: "bridging_task",
      promptId: "other",
      loopActivePromptId: "p1",
      sessionActiveBridgePromptId: "p1",
    }),
    false,
  );
});
