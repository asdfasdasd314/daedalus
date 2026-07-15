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
const daemonMainSource = readFileSync(
  new URL("../../local-daemon/src/daedalus_daemon/main.py", import.meta.url),
  "utf8",
);
const migrationSource = readFileSync(
  new URL("../../shared/database/migrations/027_recurrent_supabase_egress_remediation.sql", import.meta.url),
  "utf8",
);

function functionSource(name: string) {
  const start = dashboardSource.indexOf(`async function ${name}`);
  const next = dashboardSource.indexOf("\nasync function ", start + 1);
  return dashboardSource.slice(start, next === -1 ? undefined : next);
}

test("browser has one completion-scheduled recurrent review owner", () => {
  assert.match(dashboardSource, /fetchClientReviewInbox/);
  assert.match(dashboardSource, /acknowledgeClientReviews/);
  assert.match(dashboardSource, /window\.setTimeout\(\(\) => void pollInbox\(\), delay\)/);
  assert.doesNotMatch(dashboardSource, /setInterval\(poll(?:Message|DurableAgentTasks|FeatureRuns|ProjectPayloads)/);
});

test("consolidated browser collections are recipient filtered, projected, and bounded", () => {
  assert.match(migrationSource, /get_client_review_inbox/);
  assert.equal((migrationSource.match(/message = 'client_review'/g) ?? []).length >= 6, true);
  for (const limit of ["limit 10", "limit 3", "limit 50"]) assert.match(migrationSource, new RegExp(limit));
  assert.doesNotMatch(migrationSource.slice(migrationSource.indexOf("get_client_review_inbox"), migrationSource.indexOf("acknowledge_client_reviews")), /select \*/i);
});

test("batched acknowledgements are state and generation guarded", () => {
  const ack = migrationSource.slice(migrationSource.indexOf("acknowledge_client_reviews"), migrationSource.indexOf("daemon_poll_work"));
  assert.match(ack, /message = 'client_review'/);
  assert.equal((ack.match(/updated_at = \(receipt->>'updatedAt'\)::timestamptz/g) ?? []).length, 5);
  assert.match(ack, /'rejected'/);
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

test("manager panel is display/action only", () => {
  assert.doesNotMatch(managerSource, /get_daemon_manager_status/);
  assert.doesNotMatch(managerSource, /setInterval/);
  assert.match(managerSource, /onRequestRefresh/);
});

test("daemon recurrent work is recipient filtered and communications are consolidated", () => {
  assert.match(migrationSource, /daemon_poll_work/);
  assert.match(migrationSource, /agent_tasks where user_id = p_user_id and message = 'daemon_review'/);
  assert.match(migrationSource, /orchestration_batches where user_id = p_user_id and message = 'daemon_review'/);
  assert.match(daemonMainSource, /work_snapshot = fetch_work_snapshot\(config\)/);
});

test("manager tick owns the idle heartbeat and control response", () => {
  assert.match(migrationSource, /daemon_manager_tick/);
  assert.match(migrationSource, /'activeRequest'/);
  assert.match(migrationSource, /'drainSummary'/);
});

test("daemon actionable queues and drain identifiers are bounded", () => {
  assert.match(migrationSource, /order by queue_sequence limit 100/);
  assert.match(migrationSource, /order by created_at limit 100/);
  assert.doesNotMatch(migrationSource.slice(migrationSource.indexOf("daemon_poll_work"), migrationSource.indexOf("daemon_manager_tick")), /select \*/i);
});
