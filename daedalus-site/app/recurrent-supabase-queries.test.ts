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
  new URL("../../shared/database/migrations/028_system_architecture_communication_engine.sql", import.meta.url),
  "utf8",
);
const visualizationMigrationSource = readFileSync(
  new URL("../../shared/database/migrations/029_system_architecture_visualization_engine.sql", import.meta.url),
  "utf8",
);
const progressMigrationSource = readFileSync(
  new URL("../../shared/database/migrations/033_architecture_view_generation_progress.sql", import.meta.url),
  "utf8",
);
const reliabilityMigrationSource = readFileSync(
  new URL("../../shared/database/migrations/035_agent_output_viewer_reliability.sql", import.meta.url),
  "utf8",
);
const batchRetryMigrationSource = readFileSync(
  new URL("../../shared/database/migrations/036_preserve_batch_retry_worktree.sql", import.meta.url),
  "utf8",
);
const orchestratorSource = readFileSync(
  new URL("../../local-daemon/src/daedalus_daemon/orchestrator.py", import.meta.url),
  "utf8",
);
const architectureViewSource = readFileSync(
  new URL("../lib/architecture-view.ts", import.meta.url),
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
  assert.doesNotMatch(dashboardSource, /pollDurableAgentTasks/);
  assert.doesNotMatch(dashboardSource, /fetchDaemonEvents/);
});

test("batch completion tombstones are bounded, generation-safe, and acknowledged conditionally", () => {
  const inbox = reliabilityMigrationSource.slice(
    reliabilityMigrationSource.indexOf("get_client_review_inbox"),
    reliabilityMigrationSource.indexOf("acknowledge_client_reviews"),
  );
  assert.match(inbox, /event_type,batch_id,batch_generation,severity,content,created_at,updated_at/);
  assert.match(inbox, /message='client_review'/);
  assert.match(inbox, /limit 50/);
  assert.doesNotMatch(inbox, /select \*/i);
  assert.match(reliabilityMigrationSource, /daemon_events.*updated_at.*id/);
  assert.match(reliabilityMigrationSource, /p_batch \? 'retry_generation'/);
  assert.match(reliabilityMigrationSource, /when 'daemonEvents'[\s\S]*updated_at=\(r->>'updatedAt'\)::timestamptz/);
  assert.match(dashboardSource, /removeCompletedOrchestrationBatches/);
});

test("daemon publishes durable batch completion evidence before transient cleanup", () => {
  const finish = orchestratorSource.slice(
    orchestratorSource.indexOf("def _finish_batches"),
    orchestratorSource.indexOf("def load_worktree_settings"),
  );
  assert.ok(finish.indexOf('event_type="batch_completed"') > -1);
  assert.ok(finish.indexOf('event_type="batch_completed"') < finish.indexOf("delete_orchestration_batch"));
});

test("manual batch retries preserve their retained workspace and project retry state", () => {
  assert.match(batchRetryMigrationSource, /retry_generation = retry_generation \+ 1/);
  assert.match(batchRetryMigrationSource, /resolver_attempts = 0, verification_output = ''/);
  assert.match(batchRetryMigrationSource, /verification_output,retry_generation/);
  assert.match(batchRetryMigrationSource, /message='daemon_review'/);
  assert.match(batchRetryMigrationSource, /order by created_at limit 100/);
  assert.doesNotMatch(batchRetryMigrationSource, /select \*/i);
  assert.match(orchestratorSource, /if not is_manual_retry:/);
  assert.match(orchestratorSource, /Retry cannot resume because its retained integration worktree is unavailable/);
});

test("terminal task timestamps and archive repair cover every terminal outcome", () => {
  for (const status of ["completed", "failed", "blocked", "cancelled"]) {
    assert.match(reliabilityMigrationSource, new RegExp(status));
  }
  assert.match(reliabilityMigrationSource, /ensure_agent_task_terminal_timestamp/);
  assert.match(reliabilityMigrationSource, /project_agent_task_to_output_history/);
  assert.match(reliabilityMigrationSource, /completed_at = coalesce\(completed_at, updated_at\)/);
});

test("consolidated browser collections are recipient filtered, projected, and bounded", () => {
  assert.match(migrationSource, /get_client_review_inbox/);
  assert.equal((migrationSource.match(/message = 'client_review'/g) ?? []).length >= 7, true);
  for (const limit of ["limit 10", "limit 3", "limit 50"]) assert.match(migrationSource, new RegExp(limit));
  assert.doesNotMatch(migrationSource.slice(migrationSource.indexOf("get_client_review_inbox"), migrationSource.indexOf("acknowledge_client_reviews")), /select \*/i);
});

test("batched acknowledgements are state and generation guarded", () => {
  const ack = migrationSource.slice(migrationSource.indexOf("acknowledge_client_reviews"), migrationSource.indexOf("daemon_poll_work"));
  assert.match(ack, /message = 'client_review'/);
  assert.equal((ack.match(/updated_at = \(receipt->>'updatedAt'\)::timestamptz/g) ?? []).length, 6);
  assert.match(ack, /generation = \(receipt->>'generation'\)::integer/);
  assert.match(ack, /'rejected'/);
});

test("Architecture View persistence survives task cleanup and rejects stale generations", () => {
  assert.match(migrationSource, /alter table agent_tasks add column completed_commit text/);
  assert.match(migrationSource, /references agent_output_history \(user_id, prompt_id\) on delete cascade/);
  assert.match(migrationSource, /on conflict \(user_id, prompt_id\) do nothing/);
  assert.match(migrationSource, /generation = generation \+ 1/);
  assert.match(migrationSource, /generation = p_generation/);
  assert.equal((migrationSource.match(/updated_at = p_expected_updated_at/g) ?? []).length, 2);
  assert.match(migrationSource, /status = 'running' and message = 'daemon_review'/);
});

test("agent output history is refreshed only on demand", () => {
  assert.doesNotMatch(historySource, /window\.setInterval\(refresh/);
  assert.match(historySource, /refreshHistory/);
  assert.match(historySource, /fetchRecentAgentOutputHistory/);
  assert.match(historySource, /onRefreshLiveTasks/);
});

test("viewer loads and refreshes by accepted generation without blanking visible history", () => {
  assert.match(historySource, /historyRequestGenerationRef/);
  assert.match(historySource, /Promise\.allSettled/);
  assert.match(historySource, /refreshPromiseRef/);
  assert.match(historySource, /reconcileRecentAgentOutputHistory/);
  assert.match(historySource, /conversationCacheRef/);
  assert.match(historySource, /detailRequestGenerationRef/);
  assert.match(historySource, /Refreshing…/);
  assert.doesNotMatch(historySource, /disabled=\{loading\}[^>]*>Refresh/);
  assert.match(historySource, /loading && archive\.length === 0/);
});

test("completed durable outputs expose a persistent architecture rail action", () => {
  assert.match(historySource, /selected\?\.source === "durable_task" && selected\.status === "completed"/);
  assert.match(historySource, /fetchArchitectureView/);
  assert.match(historySource, /requestArchitectureView/);
  assert.match(historySource, /Architecture unavailable/);
  assert.match(historySource, /Regenerate Architecture/);
  assert.match(historySource, /architecture-rail/);
  assert.doesNotMatch(historySource, /report_markdown/);
  assert.doesNotMatch(architectureViewSource, /report_markdown/);
});

test("structured migration replaces Markdown and preserves generation guards", () => {
  assert.match(visualizationMigrationSource, /add column architecture_document jsonb/);
  assert.match(visualizationMigrationSource, /drop column report_markdown/);
  assert.match(visualizationMigrationSource, /drop function if exists daemon_complete_architecture_view/);
  assert.match(visualizationMigrationSource, /p_architecture_document jsonb/);
  assert.match(visualizationMigrationSource, /status = 'running' and message = 'daemon_review'/);
  assert.match(visualizationMigrationSource, /generation = p_generation/);
  assert.match(visualizationMigrationSource, /updated_at = p_expected_updated_at/);
  assert.match(visualizationMigrationSource, /else architecture_document/);
  assert.match(visualizationMigrationSource, /architecture_document, error, provider/);
  assert.match(visualizationMigrationSource, /generation = \(receipt->>'generation'\)::integer/);
  assert.match(visualizationMigrationSource, /updated_at = \(receipt->>'updatedAt'\)::timestamptz/);
  const clientInbox = visualizationMigrationSource.slice(
    visualizationMigrationSource.indexOf("get_client_review_inbox"),
    visualizationMigrationSource.indexOf("daemon_poll_work"),
  );
  assert.match(clientInbox, /message = 'client_review'/);
  assert.match(clientInbox, /order by updated_at, id limit 10/);
  assert.doesNotMatch(clientInbox, /select \*/i);
  const daemonPoll = visualizationMigrationSource.slice(visualizationMigrationSource.indexOf("daemon_poll_work"));
  assert.doesNotMatch(daemonPoll, /architecture_document/);
  assert.doesNotMatch(daemonPoll, /select \*/i);
});

test("Architecture View progress uses bounded generation-safe recurrent delivery", () => {
  assert.match(progressMigrationSource, /create table architecture_view_progress_events/);
  assert.match(progressMigrationSource, /message in \('daemon_review', 'client_review', 'client_complete', 'daemon_complete'\)/);
  assert.match(progressMigrationSource, /architecture_progress_client_review_idx/);
  assert.match(progressMigrationSource, /order by created_at, id limit 50/);
  assert.match(progressMigrationSource, /generation = \(receipt->>'generation'\)::integer/);
  assert.match(progressMigrationSource, /updated_at = \(receipt->>'updatedAt'\)::timestamptz/);
  assert.match(progressMigrationSource, /status = 'running' and message = 'daemon_review'/);
  assert.match(dashboardSource, /architectureProgressEvents/);
  assert.match(dashboardSource, /mergeArchitectureProgressEvents/);
  assert.match(historySource, /Correcting document, attempt/);
});

test("workspace exposes two modes and clears stale canvas selection", () => {
  assert.match(dashboardSource, /type WorkspaceView = "feature" \| "architecture"/);
  assert.match(dashboardSource, /Feature View/);
  assert.match(dashboardSource, /Architecture View/);
  assert.match(dashboardSource, /presentation=\{workspaceView === "architecture" \? "architecture-rail" : "drawer"\}/);
  assert.match(dashboardSource, /function selectHistoryPrompt[\s\S]*setArchitectureCanvasPromptId\(""\)/);
  assert.match(dashboardSource, /mergeArchitectureView/);
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
  assert.match(migrationSource, /architecture_views where user_id = p_user_id and message = 'daemon_review'/);
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
  assert.match(migrationSource, /order by requested_at, id limit 10/);
  assert.doesNotMatch(migrationSource.slice(migrationSource.indexOf("daemon_poll_work"), migrationSource.indexOf("daemon_manager_tick")), /select \*/i);
});
