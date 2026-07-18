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
  new URL("../../supabase/migrations/028_system_architecture_communication_engine.sql", import.meta.url),
  "utf8",
);
const visualizationMigrationSource = readFileSync(
  new URL("../../supabase/migrations/029_system_architecture_visualization_engine.sql", import.meta.url),
  "utf8",
);
const progressMigrationSource = readFileSync(
  new URL("../../supabase/migrations/033_architecture_view_generation_progress.sql", import.meta.url),
  "utf8",
);
const reliabilityMigrationSource = readFileSync(
  new URL("../../supabase/migrations/035_agent_output_viewer_reliability.sql", import.meta.url),
  "utf8",
);
const taskIntegrationMigrationSource = readFileSync(
  new URL("../../supabase/migrations/038_task_scoped_integration_compatibility.sql", import.meta.url),
  "utf8",
);
const batchCleanupMigrationSource = readFileSync(
  new URL("../../supabase/migrations/039_remove_legacy_batch_persistence.sql", import.meta.url),
  "utf8",
);
const canonicalSchemaSource = readFileSync(
  new URL("../../shared/database/schema.sql", import.meta.url),
  "utf8",
);
const migrationDeploymentEventsSource = readFileSync(
  new URL("../../supabase/migrations/037_allow_migration_deployment_events.sql", import.meta.url),
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

test("task integration events contain no batch identity", () => {
  assert.match(taskIntegrationMigrationSource, /daemon_record_task_event/);
  assert.match(taskIntegrationMigrationSource, /task_integrated/);
  assert.doesNotMatch(dashboardSource, /OrchestrationBatchSummary|removeCompletedOrchestrationBatches/);
  assert.doesNotMatch(historySource, /Integration batches/);
});

test("cleanup migration safely retires every batch persistence dependency", () => {
  const guard = batchCleanupMigrationSource.indexOf("if exists (select 1 from orchestration_batches limit 1)");
  const tableDrop = batchCleanupMigrationSource.indexOf("drop table orchestration_batches");
  assert.ok(guard > -1 && guard < tableDrop);
  for (const rpc of [
    "daemon_upsert_orchestration_batch",
    "daemon_list_orchestration_batches",
    "request_orchestration_batch_retry",
    "daemon_delete_orchestration_batch",
    "request_orchestration_batch_deletion",
    "daemon_list_batch_deletion_requests",
    "daemon_complete_batch_deletion",
  ]) assert.match(batchCleanupMigrationSource, new RegExp(`drop function ${rpc}`));
  assert.match(batchCleanupMigrationSource, /drop column batch_id/);
  assert.match(batchCleanupMigrationSource, /drop column batch_generation/);
  assert.match(batchCleanupMigrationSource, /drop table orchestration_batch_deletion_requests/);
  const legacyEventConversion = batchCleanupMigrationSource.indexOf("update daemon_events set event_type = 'status'");
  const taskOnlyEventConstraint = batchCleanupMigrationSource.lastIndexOf("add constraint daemon_events_event_type_check");
  assert.ok(legacyEventConversion > -1 && legacyEventConversion < taskOnlyEventConstraint);
  assert.doesNotMatch(batchCleanupMigrationSource, /cascade/i);
});

test("canonical database contract is task-only", () => {
  for (const retired of [
    /create table (?:if not exists )?orchestration_batches/i,
    /create table (?:if not exists )?orchestration_batch_deletion_requests/i,
    /\bbatch_id\b/i,
    /\bbatch_generation\b/i,
    /\bbatch_completed\b/i,
    /daemon_upsert_orchestration_batch/i,
    /daemon_list_orchestration_batches/i,
    /request_orchestration_batch_retry/i,
    /daemon_delete_orchestration_batch/i,
    /request_orchestration_batch_deletion/i,
    /daemon_list_batch_deletion_requests/i,
    /daemon_complete_batch_deletion/i,
    /orchestrationBatches/,
    /batchDeletionRequests/,
  ]) assert.doesNotMatch(canonicalSchemaSource, retired);
  assert.match(canonicalSchemaSource, /resolver_attempts integer not null default 0/);
  assert.match(canonicalSchemaSource, /retry_generation integer not null default 0/);
  assert.match(canonicalSchemaSource, /daemon_poll_task_work/);
  assert.match(canonicalSchemaSource, /daemon_record_task_event/);
  assert.match(canonicalSchemaSource, /task_integrated/);
  assert.match(canonicalSchemaSource, /when'blocked'then'ready'/);
  assert.doesNotMatch(canonicalSchemaSource, /agent_count\s*\+\s*batch_count/i);
  const daemonEventsSchema = canonicalSchemaSource.slice(
    canonicalSchemaSource.indexOf("create table daemon_events"),
    canonicalSchemaSource.indexOf("create table agent_output_history"),
  );
  assert.doesNotMatch(daemonEventsSchema, /conversation_id/);
});

test("task-only shared RPC replacements retain reviewed non-task subsystems", () => {
  const inbox = batchCleanupMigrationSource.slice(
    batchCleanupMigrationSource.indexOf("create or replace function get_client_review_inbox"),
    batchCleanupMigrationSource.indexOf("create or replace function acknowledge_client_reviews"),
  );
  assert.doesNotMatch(inbox, /orchestrationBatches|batchDeletionRequests|batch_id|batch_generation/);
  assert.doesNotMatch(inbox, /select id,event_type,task_id,conversation_id,severity,content/);
  assert.doesNotMatch(batchCleanupMigrationSource, /alter table daemon_events add column if not exists conversation_id/);
  for (const field of ["taskDeletionRequests", "architectureViews", "architectureProgressEvents", "featureExecutionRuns", "daemonEvents"]) {
    assert.match(inbox, new RegExp(field));
  }
  const manager = batchCleanupMigrationSource.slice(
    batchCleanupMigrationSource.indexOf("create or replace function daemon_manager_get_drain_summary"),
    batchCleanupMigrationSource.indexOf("create or replace function daemon_manager_update_blockers"),
  );
  assert.doesNotMatch(manager, /orchestrationBatches|batch_count|orchestration_batches/);
  assert.match(manager, /agentTasks/);
  assert.match(manager, /architectureViews/);
});

test("daemon publishes durable task completion evidence before worktree cleanup", () => {
  const finish = orchestratorSource.slice(
    orchestratorSource.indexOf("def _finish_integrations"),
    orchestratorSource.indexOf("def load_worktree_settings"),
  );
  const eventIndex = finish.indexOf('event_type="task_integrated"');
  const cleanupIndex = finish.indexOf("remove_task_worktree_and_branch", eventIndex);
  assert.ok(eventIndex > -1);
  assert.ok(cleanupIndex > eventIndex);
});

test("migration deployment telemetry is supported by the daemon event RPC", () => {
  for (const eventType of [
    "migration_deployment_started",
    "migration_deployment_no_pending",
    "migration_deployment_succeeded",
    "migration_deployment_blocked",
  ]) assert.match(migrationDeploymentEventsSource, new RegExp(eventType));
  assert.match(migrationDeploymentEventsSource, /create or replace function daemon_record_event/);
});

test("blocked task retries preserve their worktree and return to integration", () => {
  assert.match(taskIntegrationMigrationSource, /when 'failed' then 'queued' when 'blocked' then 'ready'/);
  assert.match(taskIntegrationMigrationSource, /retry_generation = retry_generation \+ 1/);
  assert.match(taskIntegrationMigrationSource, /resolver_attempts = case when status = 'blocked' then 0/);
  assert.match(orchestratorSource, /retained_task_worktree_valid/);
  assert.doesNotMatch(orchestratorSource, /create_integration_worktree|integration\/batch/);
});

test("durable task resume uses the authoritative task revision and reports its outcome", () => {
  const resume = dashboardSource.slice(
    dashboardSource.indexOf("onRetryDurableTask={async (exchange) =>"),
    dashboardSource.indexOf("onSelectedPromptIdChange", dashboardSource.indexOf("onRetryDurableTask={async (exchange) =>")),
  );
  assert.match(resume, /fetchAgentTaskById/);
  assert.match(resume, /currentTask\.updated_at/);
  assert.match(resume, /rehydrateDurableAgentTasks/);
  assert.match(historySource, /async function resumeDurableTask/);
  assert.match(historySource, /Unable to resume this task/);
  assert.match(historySource, /Resuming…/);
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

test("consolidated acknowledgements are state and generation guarded", () => {
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
  assert.match(historySource, /conversationCacheRef\.current\.delete\(refreshedConversationId\)/);
  assert.match(historySource, /fetchAgentOutputConversation\([\s\S]*refreshedConversationId/);
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

test("finalized task deletion reloads the durable revision instead of using archive history time", () => {
  const deletionHandler = dashboardSource.slice(
    dashboardSource.indexOf("onDeleteDurableTask={async (exchange) => {"),
    dashboardSource.indexOf("onImplementPlan", dashboardSource.indexOf("onDeleteDurableTask={async (exchange) => {")),
  );
  assert.match(deletionHandler, /fetchAgentTaskById\(/);
  assert.match(deletionHandler, /isFinalizedAgentTaskStatus\(currentTask\.status\)/);
  assert.match(deletionHandler, /currentTask\.updated_at/);
  assert.doesNotMatch(deletionHandler, /requestFinalizedTaskDeletion\([\s\S]*exchange\.updatedAt/);
});

test("manager panel is display/action only", () => {
  assert.doesNotMatch(managerSource, /get_daemon_manager_status/);
  assert.doesNotMatch(managerSource, /setInterval/);
  assert.match(managerSource, /onRequestRefresh/);
});

test("daemon recurrent work is recipient filtered and communications are consolidated", () => {
  assert.match(taskIntegrationMigrationSource, /daemon_poll_task_work/);
  assert.match(taskIntegrationMigrationSource, /task\.user_id = p_user_id and task\.message = 'daemon_review'/);
  assert.doesNotMatch(taskIntegrationMigrationSource.slice(taskIntegrationMigrationSource.indexOf("daemon_poll_task_work")), /orchestrationBatches/);
  assert.match(taskIntegrationMigrationSource, /architecture_views where user_id=p_user_id and message='daemon_review'/);
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
