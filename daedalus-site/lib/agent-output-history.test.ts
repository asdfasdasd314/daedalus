import assert from "node:assert/strict";
import test from "node:test";
import {
  dedupeAgentOutputs,
  dedupeAgentOutputConversations,
  canDeleteAgentOutput,
  groupAgentOutputsByFeature,
  mergeAgentOutputRecords,
  removeDeletedAgentOutputHistory,
  reconcileRecentAgentOutputHistory,
  rerankAgentOutputSearch,
  type AgentOutputExchange,
} from "./agent-output-history";

function exchange(overrides: Partial<AgentOutputExchange> = {}): AgentOutputExchange {
  return {
    id: "row-1", promptId: "prompt-1", taskId: null, conversationId: "prompt-1",
    repository: "/projects/one", prompt: "Build viewer", output: "Done",
    error: "", provider: "codex", model: "gpt", reasoning: "medium",
    mode: "standard", source: "durable_task", targetedFeaturePaths: [],
    status: "completed", statusDetail: "", createdAt: "2026-01-01T00:00:00Z",
    startedAt: null, completedAt: "2026-01-01T00:01:00Z",
    updatedAt: "2026-01-01T00:01:00Z", ...overrides,
  };
}

const projects = {
  "/projects/one": [{ path: "feature_files/viewer.md", markdown: "# Output Viewer" }],
  "/projects/two": [{ path: "feature_files/viewer.md", markdown: "# Other Viewer" }],
};

test("groups one multi-feature exchange under every feature without duplicating identity", () => {
  const item = exchange({ targetedFeaturePaths: ["feature_files/viewer.md", "feature_files/missing.md"] });
  const groups = groupAgentOutputsByFeature([item], projects);
  assert.equal(groups.length, 2);
  assert.ok(groups.every((group) => group.exchanges[0].promptId === "prompt-1"));
  assert.equal(groups.find((group) => group.featurePath?.includes("missing"))?.unavailable, true);
});

test("keeps unscoped records and repository-qualified path groups separate", () => {
  const groups = groupAgentOutputsByFeature([
    exchange(),
    exchange({ id: "row-2", promptId: "prompt-2", repository: "/projects/two", targetedFeaturePaths: ["feature_files/viewer.md"] }),
    exchange({ id: "row-3", promptId: "prompt-3", targetedFeaturePaths: ["feature_files/viewer.md"] }),
  ], projects);
  assert.ok(groups.some((group) => group.featurePath === null));
  assert.equal(groups.filter((group) => group.featurePath === "feature_files/viewer.md").length, 2);
});

test("authoritative lifecycle wins while archived output survives", () => {
  const merged = mergeAgentOutputRecords(
    [exchange({ output: "Partial", status: "ready" })],
    [exchange({ id: "local", output: "", status: "integrating" })],
  );
  assert.equal(merged[0].status, "integrating");
  assert.equal(merged[0].output, "Partial");
});

test("accepted direct history outranks a stale local sending state", () => {
  const merged = mergeAgentOutputRecords(
    [exchange({ source: "direct_prompt", mode: "planning", status: "running" })],
    [exchange({ id: "local", source: "direct_prompt", mode: "planning", status: "queued", localOnly: true })],
  );
  assert.equal(merged[0].status, "running");
});

test("fresher history verifying beats stale live queued for durable tasks", () => {
  const merged = mergeAgentOutputRecords(
    [exchange({
      status: "verifying",
      completedAt: null,
      updatedAt: "2026-01-01T00:05:00Z",
      output: "Still working",
    })],
    [exchange({
      id: "local",
      status: "queued",
      updatedAt: "2026-01-01T00:01:00Z",
      output: "",
    })],
  );
  assert.equal(merged[0].status, "verifying");
  assert.equal(merged[0].output, "Still working");
});

test("terminal history blocked beats stale live queued", () => {
  const merged = mergeAgentOutputRecords(
    [exchange({
      status: "blocked",
      error: "Needs attention",
      updatedAt: "2026-01-01T00:06:00Z",
      completedAt: "2026-01-01T00:06:00Z",
    })],
    [exchange({
      id: "local",
      status: "queued",
      updatedAt: "2026-01-01T00:01:00Z",
      output: "",
      error: "",
    })],
  );
  assert.equal(merged[0].status, "blocked");
  assert.equal(merged[0].error, "Needs attention");
});

test("every terminal archive outcome survives a stale active snapshot", () => {
  for (const status of ["completed", "failed", "blocked", "cancelled"] as const) {
    const merged = mergeAgentOutputRecords(
      [exchange({ status, completedAt: "2026-01-01T00:06:00Z", updatedAt: "2026-01-01T00:06:00Z" })],
      [exchange({ id: "live", status: "queued", completedAt: null, updatedAt: "2026-01-01T00:01:00Z" })],
    );
    assert.equal(merged[0].status, status);
    assert.equal(merged[0].completedAt, "2026-01-01T00:06:00Z");
  }
});

test("newer live durable status still outranks older history", () => {
  const merged = mergeAgentOutputRecords(
    [exchange({ status: "queued", updatedAt: "2026-01-01T00:01:00Z", completedAt: null })],
    [exchange({
      id: "local",
      status: "ready",
      updatedAt: "2026-01-01T00:07:00Z",
      completedAt: null,
    })],
  );
  assert.equal(merged[0].status, "ready");
});

test("deduplicates prompt IDs and fuzzy reranks current feature names", () => {
  assert.equal(dedupeAgentOutputs([exchange(), exchange({ id: "row-old" })]).length, 1);
  const results = rerankAgentOutputSearch("Output Viewer", [exchange({ targetedFeaturePaths: ["feature_files/viewer.md"] })], projects);
  assert.equal(results[0]?.promptId, "prompt-1");
});

test("prefers a selected conversation's full record over its archive summary", () => {
  const summary = exchange({ prompt: "Build viewer…", output: "", error: "" });
  const detail = exchange({
    prompt: "Build the complete agent output viewer",
    output: "## Plan\n\nRestore on-demand detail loading.",
  });
  const result = dedupeAgentOutputs([summary, detail]);
  assert.equal(result[0]?.prompt, detail.prompt);
  assert.equal(result[0]?.output, detail.output);
});

test("keeps hydrated planning detail visible when a newer refresh returns a summary", () => {
  const detail = exchange({
    mode: "planning",
    prompt: "Build the complete agent output viewer",
    output: "## Plan\n\nKeep the initial planning response visible.",
    updatedAt: "2026-01-01T00:01:00Z",
  });
  const refreshedSummary = exchange({
    mode: "planning",
    prompt: "Build the complete agent output viewer…",
    output: "",
    error: "",
    status: "running",
    statusDetail: "Updating plan",
    updatedAt: "2026-01-01T00:02:00Z",
  });
  const result = dedupeAgentOutputs([detail, refreshedSummary]);

  assert.equal(result[0]?.prompt, detail.prompt);
  assert.equal(result[0]?.output, detail.output);
  assert.equal(result[0]?.status, refreshedSummary.status);
  assert.equal(result[0]?.statusDetail, refreshedSummary.statusDetail);
});

test("replaces preserved planning detail when the newer full response arrives", () => {
  const initialDetail = exchange({
    mode: "planning",
    output: "## Initial plan\n\nKeep this visible while updating.",
    updatedAt: "2026-01-01T00:01:00Z",
  });
  const updatedDetail = exchange({
    mode: "planning",
    output: "## New plan",
    status: "completed",
    updatedAt: "2026-01-01T00:03:00Z",
  });
  const result = dedupeAgentOutputs([initialDetail, updatedDetail]);

  assert.equal(result[0]?.output, updatedDetail.output);
  assert.equal(result[0]?.status, updatedDetail.status);
});

test("groups planning refinements and implementation into one conversation", () => {
  const conversations = dedupeAgentOutputConversations([
    exchange({ promptId: "plan-1", conversationId: "chat-1", completedAt: "2026-01-01T00:01:00Z" }),
    exchange({ promptId: "implementation-1", conversationId: "chat-1", completedAt: "2026-01-01T00:02:00Z" }),
  ]);
  assert.equal(conversations.length, 1);
  assert.equal(conversations[0]?.promptId, "implementation-1");
});

test("permits deleting every terminal output while retaining active outputs", () => {
  for (const status of ["completed", "failed", "blocked", "cancelled"] as const) {
    assert.equal(canDeleteAgentOutput(exchange({ status })), true);
  }
  for (const status of ["queued", "running", "verifying", "ready", "integrating", "resolving"] as const) {
    assert.equal(canDeleteAgentOutput(exchange({ status })), false);
  }
});

test("recent archive refresh retains hydrated older history and replaces matching lifecycle", () => {
  const olderHydrated = exchange({
    id: "older", promptId: "older", output: "Full older output",
    completedAt: "2025-12-31T23:00:00Z", updatedAt: "2025-12-31T23:00:00Z",
  });
  const refreshed = exchange({
    prompt: "Build viewer…", output: "", status: "failed", error: "",
    updatedAt: "2026-01-01T00:02:00Z",
  });
  const result = reconcileRecentAgentOutputHistory([olderHydrated, exchange()], [refreshed]);
  assert.equal(result.find((item) => item.promptId === "older")?.output, "Full older output");
  assert.equal(result.find((item) => item.promptId === "prompt-1")?.status, "failed");
  assert.equal(result.find((item) => item.promptId === "prompt-1")?.output, "Done");
});

test("confirmed durable deletion cannot be resurrected by a late archive refresh", () => {
  const deleted = ["prompt-1"];
  const result = reconcileRecentAgentOutputHistory([exchange()], [exchange()], deleted);
  assert.equal(result.some((item) => item.promptId === "prompt-1"), false);
  assert.deepEqual(removeDeletedAgentOutputHistory([exchange()], deleted), []);
});
