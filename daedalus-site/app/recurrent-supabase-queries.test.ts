import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const dashboardSource = readFileSync(
  new URL("./feature-files-dashboard.tsx", import.meta.url),
  "utf8",
);
const historySource = readFileSync(
  new URL("./agent-output-viewer.tsx", import.meta.url),
  "utf8",
);
const managerSource = readFileSync(
  new URL("./daemon-manager-panel.tsx", import.meta.url),
  "utf8",
);
const schemaSource = readFileSync(
  new URL("../../shared/database/schema.sql", import.meta.url),
  "utf8",
);
const daemonMainSource = readFileSync(
  new URL("../../local-daemon/src/daedalus_daemon/main.py", import.meta.url),
  "utf8",
);
const migrationSource = readFileSync(
  new URL("../../shared/database/migrations/022_complete_recurrent_supabase_read_hardening.sql", import.meta.url),
  "utf8",
);

function functionSource(name: string) {
  const start = dashboardSource.indexOf(`async function ${name}`);
  const next = dashboardSource.indexOf("\nasync function ", start + 1);
  return dashboardSource.slice(start, next === -1 ? undefined : next);
}

test("task and feature-run polling is client-review filtered and bounded", () => {
  for (const name of ["fetchAgentTasks", "fetchFeatureExecutionRuns"]) {
    const source = functionSource(name);
    assert.match(source, /url\.searchParams\.set\("select"/);
    assert.match(source, /url\.searchParams\.set\("message", `eq\.\$\{CLIENT_REVIEW\}`\)/);
    assert.match(source, /url\.searchParams\.set\("limit", "50"\)/);
    assert.doesNotMatch(source, /select", "\*"/);
  }
});

test("communications, payloads, and events use consolidated bounded review reads", () => {
  for (const name of ["fetchCommunicationReviews", "fetchDaemonPayloadReviews", "fetchDaemonEvents"]) {
    const source = functionSource(name);
    assert.match(source, /url\.searchParams\.set\("select"/);
    assert.match(source, /url\.searchParams\.set\("message", `eq\.\$\{CLIENT_REVIEW\}`\)/);
    assert.match(source, /url\.searchParams\.set\("limit"/);
    assert.doesNotMatch(source, /select", "\*"/);
  }
});

test("task and feature-run acknowledgements are generation guarded", () => {
  assert.match(functionSource("completeAgentTaskReview"), /url\.searchParams\.set\("updated_at"/);
  assert.match(functionSource("completeFeatureExecutionReview"), /url\.searchParams\.set\("updated_at"/);
  assert.match(functionSource("completeCommunicationReview"), /url\.searchParams\.set\("updated_at"/);
  assert.match(functionSource("completeDaemonPayloadReview"), /url\.searchParams\.set\("updated_at"/);
});

test("agent output history is refreshed only on demand", () => {
  assert.doesNotMatch(historySource, /window\.setInterval\(refresh/);
  assert.match(historySource, /refreshHistory/);
  assert.match(historySource, /fetchRecentAgentOutputHistory/);
  assert.match(historySource, /onRefreshLiveTasks/);
});

test("live durable task rehydrate stays non-recurrent and column-scoped", () => {
  assert.match(dashboardSource, /rehydrateDurableAgentTasks/);
  assert.doesNotMatch(dashboardSource, /setInterval\([^)]*rehydrateDurableAgentTasks/);
  const hydrate = functionSource("fetchActiveAgentTaskSummaries");
  assert.match(hydrate, /url\.searchParams\.set\("select"/);
  assert.match(hydrate, /url\.searchParams\.set\("message", `eq\.\$\{DAEMON_REVIEW\}`\)/);
  assert.match(hydrate, /url\.searchParams\.set\("limit", "50"\)/);
  assert.doesNotMatch(hydrate, /select", "\*"/);
  const byId = functionSource("fetchAgentTaskById");
  assert.match(byId, /url\.searchParams\.set\("id", `eq\.\$\{taskId\}`\)/);
  assert.match(byId, /url\.searchParams\.set\("limit", "1"\)/);
  assert.doesNotMatch(byId, /select", "\*"/);
});

test("manager heartbeats use client review and timestamp-guarded acknowledgement", () => {
  assert.match(schemaSource, /manager_state\.message = 'client_review'/);
  assert.match(managerSource, /url\.searchParams\.set\("message", "eq\.client_review"\)/);
  assert.match(managerSource, /url\.searchParams\.set\("updated_at", `eq\.\$\{expectedUpdatedAt\}`\)/);
});

test("daemon recurrent work is recipient filtered and communications are consolidated", () => {
  assert.match(schemaSource, /agent_tasks where user_id = p_user_id and message = 'daemon_review'/);
  assert.match(schemaSource, /orchestration_batches where user_id = p_user_id and message = 'daemon_review'/);
  assert.match(schemaSource, /feature_execution_runs[\s\S]*message = 'daemon_review'[\s\S]*status in \('queued', 'running'\)/);
  assert.match(schemaSource, /daemon_list_communication_reviews/);
  assert.match(daemonMainSource, /communication_reviews = fetch_current_messages\(config\)/);
});

test("manager restart, heartbeat, and cancellation lifecycles use explicit handoffs", () => {
  assert.match(migrationSource, /status = 'cancelled', message = 'daemon_review'/);
  assert.match(migrationSource, /status = 'cancelled' and manager_request\.message = 'daemon_review'/);
  assert.match(migrationSource, /set message = 'daemon_complete', updated_at = now\(\)/);
  assert.match(migrationSource, /manager_request\.updated_at = p_expected_updated_at/);
  assert.match(migrationSource, /manager_state\.message = 'client_review'/);
});

test("daemon actionable queues and drain identifiers are bounded", () => {
  assert.match(migrationSource, /daemon_list_agent_tasks[\s\S]*order by queue_sequence limit 100/);
  assert.match(migrationSource, /daemon_list_orchestration_batches[\s\S]*order by created_at limit 100/);
  assert.match(migrationSource, /daemon_list_active_feature_execution_runs[\s\S]*order by created_at limit 100/);
  assert.match(migrationSource, /order by queue_sequence limit 100\) task_rows/);
});
