/**
 * Durable AOP build-loop control plane (aop_execution_loops).
 * Client advances transitions after bridge/prep prompts and durable task completion.
 */

export type AopLoopStatus =
  | "bridging_task"
  | "prep"
  | "awaiting_answers"
  | "awaiting_start"
  | "executing"
  | "awaiting_verification"
  | "paused"
  | "completed"
  | "cancelled"
  | "failed";

export type AopPausableStatus = Exclude<
  AopLoopStatus,
  "paused" | "completed" | "cancelled" | "failed"
>;

export const AOP_ACTIVE_STATUSES: AopLoopStatus[] = [
  "bridging_task",
  "prep",
  "awaiting_answers",
  "awaiting_start",
  "executing",
  "awaiting_verification",
  "paused",
];

export const AOP_TERMINAL_STATUSES: AopLoopStatus[] = [
  "completed",
  "cancelled",
  "failed",
];

export const DEFAULT_MAX_TASKS_BEFORE_VERIFICATION = 3;

export type AopLoopQuestion = {
  question: string;
  options: string[];
};

export type AopLoopAnswer = {
  question: string;
  answer: string;
};

export type AopExecutionLoop = {
  id: string;
  userId: string;
  repository: string;
  status: AopLoopStatus;
  pausedFrom: string;
  directionPrompt: string;
  conversationId: string;
  provider: string;
  model: string;
  reasoning: string;
  targetedFeaturePaths: string[];
  currentTaskTitle: string;
  currentTaskPrompt: string;
  prepNotes: string;
  pendingQuestions: AopLoopQuestion[];
  prepAnswers: AopLoopAnswer[];
  currentAgentTaskId: string | null;
  activePromptId: string;
  tasksCompletedTotal: number;
  tasksSinceVerification: number;
  maxTasksBeforeVerification: number;
  loopBaseCommit: string;
  integratedCommits: string[];
  recentTaskTitles: string[];
  statusDetail: string;
  cancelRequested: boolean;
  /** Sticky debug: after each integrated coding slice, pause before next bridge turn. */
  pauseAfterTask: boolean;
  /** One-shot: operator Pause while work in flight — apply at next safe boundary. */
  pauseRequested: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AopExecutionLoopRow = {
  id: string;
  user_id: string;
  repository: string;
  status: AopLoopStatus;
  paused_from: string;
  direction_prompt: string;
  conversation_id: string;
  provider: string;
  model: string;
  reasoning: string;
  targeted_feature_paths: string[] | null;
  current_task_title: string;
  current_task_prompt: string;
  prep_notes: string;
  pending_questions: AopLoopQuestion[] | null;
  prep_answers: AopLoopAnswer[] | null;
  current_agent_task_id: string | null;
  active_prompt_id: string;
  tasks_completed_total: number;
  tasks_since_verification: number;
  max_tasks_before_verification: number;
  loop_base_commit: string;
  integrated_commits: string[] | null;
  recent_task_titles: string[] | null;
  status_detail: string;
  cancel_requested: boolean;
  pause_after_task?: boolean;
  pause_requested?: boolean;
  created_at: string;
  updated_at: string;
};

export function mapAopLoopRow(row: AopExecutionLoopRow): AopExecutionLoop {
  return {
    id: row.id,
    userId: row.user_id,
    repository: row.repository,
    status: row.status,
    pausedFrom: row.paused_from ?? "",
    directionPrompt: row.direction_prompt ?? "",
    conversationId: row.conversation_id ?? "",
    provider: row.provider ?? "",
    model: row.model ?? "",
    reasoning: row.reasoning ?? "",
    targetedFeaturePaths: Array.isArray(row.targeted_feature_paths)
      ? row.targeted_feature_paths
      : [],
    currentTaskTitle: row.current_task_title ?? "",
    currentTaskPrompt: row.current_task_prompt ?? "",
    prepNotes: row.prep_notes ?? "",
    pendingQuestions: Array.isArray(row.pending_questions) ? row.pending_questions : [],
    prepAnswers: Array.isArray(row.prep_answers) ? row.prep_answers : [],
    currentAgentTaskId: row.current_agent_task_id,
    activePromptId: row.active_prompt_id ?? "",
    tasksCompletedTotal: row.tasks_completed_total ?? 0,
    tasksSinceVerification: row.tasks_since_verification ?? 0,
    maxTasksBeforeVerification:
      row.max_tasks_before_verification ?? DEFAULT_MAX_TASKS_BEFORE_VERIFICATION,
    loopBaseCommit: row.loop_base_commit ?? "",
    integratedCommits: Array.isArray(row.integrated_commits)
      ? row.integrated_commits
      : [],
    recentTaskTitles: Array.isArray(row.recent_task_titles)
      ? row.recent_task_titles
      : [],
    statusDetail: row.status_detail ?? "",
    cancelRequested: Boolean(row.cancel_requested),
    pauseAfterTask: Boolean(row.pause_after_task),
    pauseRequested: Boolean(row.pause_requested),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function isAopLoopActive(status: AopLoopStatus): boolean {
  return !AOP_TERMINAL_STATUSES.includes(status);
}

export function canStartAopBuildLoop(
  status: AopLoopStatus | null | undefined,
): boolean {
  return !status || AOP_TERMINAL_STATUSES.includes(status);
}

export function pauseTargetStatus(status: AopLoopStatus): AopPausableStatus | null {
  if (
    status === "paused" ||
    status === "completed" ||
    status === "cancelled" ||
    status === "failed"
  ) {
    return null;
  }
  return status;
}

export function resumeStatusFromPaused(
  pausedFrom: string,
): AopPausableStatus | null {
  if (
    pausedFrom === "bridging_task" ||
    pausedFrom === "prep" ||
    pausedFrom === "awaiting_answers" ||
    pausedFrom === "awaiting_start" ||
    pausedFrom === "executing" ||
    pausedFrom === "awaiting_verification"
  ) {
    return pausedFrom;
  }
  return null;
}

/** After a successful integrate: verification checkpoint or next bridge turn. */
export function nextStatusAfterTaskComplete(
  tasksSinceVerification: number,
  maxTasksBeforeVerification: number,
): "awaiting_verification" | "bridging_task" {
  const next = tasksSinceVerification + 1;
  if (next >= maxTasksBeforeVerification) {
    return "awaiting_verification";
  }
  return "bridging_task";
}

/** Durable coding-task statuses still owned by the daemon / worktree orchestrator. */
export const AOP_CODING_IN_FLIGHT_STATUSES = [
  "queued",
  "running",
  "verifying",
  "ready",
  "integrating",
  "resolving",
] as const;

export type AopCodingTaskStatus =
  | (typeof AOP_CODING_IN_FLIGHT_STATUSES)[number]
  | "completed"
  | "failed"
  | "blocked"
  | "cancelled"
  | "stalled";

export function isAopCodingTaskInFlight(
  status: string | null | undefined,
): boolean {
  return AOP_CODING_IN_FLIGHT_STATUSES.includes(
    status as (typeof AOP_CODING_IN_FLIGHT_STATUSES)[number],
  );
}

export function isAopCodingTaskTerminal(
  status: string | null | undefined,
): boolean {
  return (
    status === "completed"
    || status === "failed"
    || status === "blocked"
    || status === "cancelled"
  );
}

/**
 * Detect build-loop task selection replies (vs vision Q&A).
 *
 * Must not rely solely on the client prompt queue: finalize removes the entry
 * before async history fetch completes, which previously dropped bridgeTasking
 * and applied next_task as a vision "Latest task" without prep/coding.
 */
export function isBridgeTaskingReply(input: {
  capturedBridgeTasking?: boolean;
  sessionPhase?: string;
  loopStatus?: string | null;
  loopActivePromptId?: string;
  sessionActiveBridgePromptId?: string;
  promptId?: string;
}): boolean {
  if (input.capturedBridgeTasking) {
    return true;
  }
  if (input.sessionPhase === "tasking") {
    return true;
  }
  if (input.loopStatus !== "bridging_task") {
    return false;
  }
  const promptId = (input.promptId ?? "").trim();
  if (!promptId) {
    return true;
  }
  const loopActive = (input.loopActivePromptId ?? "").trim();
  const sessionActive = (input.sessionActiveBridgePromptId ?? "").trim();
  // If the loop has no active prompt recorded yet, still treat as tasking.
  if (!loopActive && !sessionActive) {
    return true;
  }
  return loopActive === promptId || sessionActive === promptId;
}

/**
 * Manual "Retry choose task" only when bridging is stuck/failed — not while a
 * task-selection prompt is still in flight.
 */
export function needsBridgeTaskingRetry(input: {
  status: string;
  activePromptId?: string;
  statusDetail?: string;
}): boolean {
  if (input.status !== "bridging_task") {
    return false;
  }
  const detail = (input.statusDetail ?? "").trim();
  if (
    /fail|error|unable|without a reply|timed out|stalled|missing next_task/i
      .test(detail)
  ) {
    return true;
  }
  // No active prompt id means the driver never started or the turn already ended
  // without advancing — operator may re-issue task selection.
  return !(input.activePromptId ?? "").trim();
}

/**
 * Coding starts automatically after prep readiness. Manual retry only after a
 * launch/coding failure on the same slice (Stop is still available mid-run).
 */
export function needsManualCodingRetry(statusDetail?: string): boolean {
  const detail = (statusDetail ?? "").trim();
  if (!detail) {
    return false;
  }
  return /Could not queue|Start task again|Coding task failed|Coding task blocked|Primary worktree|fix the issue/i
    .test(detail);
}

export function shouldAutoStartCoding(loop: {
  status: string;
  currentTaskTitle?: string;
  currentTaskPrompt?: string;
  statusDetail?: string;
}): boolean {
  if (loop.status !== "awaiting_start") {
    return false;
  }
  if (!(loop.currentTaskTitle ?? "").trim() || !(loop.currentTaskPrompt ?? "").trim()) {
    return false;
  }
  return !needsManualCodingRetry(loop.statusDetail);
}

/**
 * Only a completed durable agent_tasks row may advance the loop to the next
 * bridge emission. Failed / blocked / cancelled keep the same slice so the
 * operator can retry (Start task) or resume.
 */
export type AopLoopAfterCodingTerminal = {
  /** True only when integrate completed and we should emit the next bridge task. */
  shouldQueueBridge: boolean;
  updates: {
    status: AopLoopStatus;
    status_detail: string;
    current_agent_task_id: null;
    active_prompt_id: string;
    tasks_completed_total?: number;
    tasks_since_verification?: number;
    recent_task_titles?: string[];
    integrated_commits?: string[];
    paused_from?: string;
    cancel_requested?: boolean;
    pause_requested?: boolean;
  };
};

/** Canonical coding slice from agent_tasks (source_loop_id). */
export type AopLoopCodingSlice = {
  id: string;
  title: string;
  status: string;
  error: string;
  completedCommit: string;
  branchName: string;
  createdAt: string;
  completedAt: string;
};

const MAX_RECENT_TASK_TITLES = 12;
const MAX_INTEGRATED_COMMITS = 50;
const FEATURE_DIGEST_SECTION_BULLETS = 12;
const FEATURE_DIGEST_PER_FILE_CHARS = 2800;
const FEATURE_DIGEST_TOTAL_CHARS = 9000;

/** Parse leading `TASK: …` from a durable implementation prompt. */
export function extractAopTaskTitleFromPrompt(prompt: string): string {
  const text = (prompt ?? "").replace(/\r\n/g, "\n");
  const taskLine = text.match(/^\s*TASK:\s*(.+)$/im);
  if (taskLine?.[1]) {
    return taskLine[1].trim().slice(0, 200);
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) {
      return trimmed.replace(/^\*+\s*/, "").slice(0, 200);
    }
  }
  return "(untitled)";
}

export function mapAgentTaskRowToCodingSlice(row: {
  id: string;
  prompt?: string | null;
  status?: string | null;
  error?: string | null;
  completed_commit?: string | null;
  branch_name?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
}): AopLoopCodingSlice {
  return {
    id: row.id,
    title: extractAopTaskTitleFromPrompt(row.prompt ?? ""),
    status: (row.status ?? "").trim() || "unknown",
    error: (row.error ?? "").trim(),
    completedCommit: (row.completed_commit ?? "").trim(),
    branchName: (row.branch_name ?? "").trim(),
    createdAt: row.created_at ?? "",
    completedAt: row.completed_at ?? "",
  };
}

/** Human lines for tasking prompts / UI ledger. */
export function summarizeLoopCodingHistory(slices: AopLoopCodingSlice[]): string {
  if (!slices.length) {
    return "(none yet)";
  }
  return slices
    .map((slice, index) => {
      const commit = slice.completedCommit
        ? ` commit=${slice.completedCommit.slice(0, 12)}`
        : "";
      const err = slice.error && slice.status !== "completed"
        ? ` — ${slice.error.slice(0, 160)}`
        : "";
      return `${index + 1}. [${slice.status}] ${slice.title}${commit}${err}`;
    })
    .join("\n");
}

/**
 * Rebuild denormalized loop caches from completed coding slices only.
 * Canonical source is always agent_tasks.
 */
export function loopCountersFromCompletedSlices(slices: AopLoopCodingSlice[]): {
  tasks_completed_total: number;
  recent_task_titles: string[];
  integrated_commits: string[];
} {
  const completed = slices.filter((slice) => slice.status === "completed");
  const titles = completed
    .map((slice) => slice.title)
    .filter(Boolean)
    .slice(-MAX_RECENT_TASK_TITLES);
  const commits: string[] = [];
  for (const slice of completed) {
    if (slice.completedCommit && !commits.includes(slice.completedCommit)) {
      commits.push(slice.completedCommit);
    }
  }
  return {
    tasks_completed_total: completed.length,
    recent_task_titles: titles,
    integrated_commits: commits.slice(-MAX_INTEGRATED_COMMITS),
  };
}

/** True when loop denormalized counters differ from agent_tasks truth. */
export function loopHistoryNeedsSync(
  loop: Pick<
    AopExecutionLoop,
    "tasksCompletedTotal" | "recentTaskTitles" | "integratedCommits"
  >,
  counters: ReturnType<typeof loopCountersFromCompletedSlices>,
): boolean {
  if (loop.tasksCompletedTotal !== counters.tasks_completed_total) {
    return true;
  }
  if (loop.recentTaskTitles.join("\0") !== counters.recent_task_titles.join("\0")) {
    return true;
  }
  if (loop.integratedCommits.join("\0") !== counters.integrated_commits.join("\0")) {
    return true;
  }
  return false;
}

export function appendIntegratedCommit(
  existing: string[],
  commit: string | null | undefined,
): string[] {
  const next = (commit ?? "").trim();
  if (!next) {
    return existing.slice(-MAX_INTEGRATED_COMMITS);
  }
  if (existing.includes(next)) {
    return existing.slice(-MAX_INTEGRATED_COMMITS);
  }
  return [...existing, next].slice(-MAX_INTEGRATED_COMMITS);
}

const FEATURE_DIGEST_SECTION_HEADINGS = [
  "Summary",
  "Key Points",
  "State Log",
] as const;

/**
 * Extract capped Summary / Key Points / State Log digests from feature markdown.
 * State Log keeps only the most recent bullets.
 */
export function buildFeatureFileDigest(markdown: string, filePath: string): string {
  const text = (markdown ?? "").replace(/\r\n/g, "\n");
  if (!text.trim()) {
    return "";
  }
  const sections: string[] = [`### ${filePath}`];
  for (const heading of FEATURE_DIGEST_SECTION_HEADINGS) {
    const body = extractMarkdownSectionBody(text, heading);
    if (!body) {
      continue;
    }
    let clipped = body;
    if (heading === "State Log" || heading === "Key Points") {
      const lines = body.split("\n").filter((line) => line.trim());
      const bullets = lines.filter((line) => /^[-*•]|\d+\./.test(line.trim()));
      if (bullets.length > FEATURE_DIGEST_SECTION_BULLETS) {
        clipped = bullets.slice(-FEATURE_DIGEST_SECTION_BULLETS).join("\n");
      } else if (lines.length > FEATURE_DIGEST_SECTION_BULLETS) {
        clipped = lines.slice(-FEATURE_DIGEST_SECTION_BULLETS).join("\n");
      }
    }
    sections.push(`#### ${heading}`, clipped.trim());
  }
  if (sections.length === 1) {
    // No known sections — short raw head as fallback.
    sections.push(text.trim().slice(0, 600));
  }
  return sections.join("\n").slice(0, FEATURE_DIGEST_PER_FILE_CHARS);
}

function extractMarkdownSectionBody(markdown: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headingRe = new RegExp(`^#{1,3}\\s*${escaped}\\s*$`, "i");
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let index = 0;
  while (index < lines.length && !headingRe.test(lines[index])) {
    index += 1;
  }
  if (index >= lines.length) {
    return "";
  }
  index += 1;
  const body: string[] = [];
  while (index < lines.length && !/^#{1,3}\s/.test(lines[index])) {
    body.push(lines[index]);
    index += 1;
  }
  return body.join("\n").trim();
}

/** Combine digests for targeted feature paths (budgeted). */
export function buildTargetedFeatureDigests(
  paths: string[],
  resolveMarkdown: (path: string) => string | null | undefined,
): string {
  const parts: string[] = [];
  let total = 0;
  for (const rawPath of paths) {
    const path = rawPath.trim();
    if (!path) {
      continue;
    }
    const md = resolveMarkdown(path);
    if (!md) {
      continue;
    }
    const digest = buildFeatureFileDigest(md, path);
    if (!digest) {
      continue;
    }
    if (total + digest.length > FEATURE_DIGEST_TOTAL_CHARS) {
      const remaining = FEATURE_DIGEST_TOTAL_CHARS - total;
      if (remaining > 80) {
        parts.push(digest.slice(0, remaining));
      }
      break;
    }
    parts.push(digest);
    total += digest.length;
  }
  return parts.length ? parts.join("\n\n") : "(no targeted feature digests available)";
}

export function loopPatchAfterCodingTaskTerminal(input: {
  tasksCompletedTotal: number;
  tasksSinceVerification: number;
  maxTasksBeforeVerification: number;
  recentTaskTitles: string[];
  integratedCommits?: string[];
  completedCommit?: string;
  currentTaskTitle: string;
  taskStatus: string;
  taskError?: string;
  /** Sticky or one-shot: hold automation after this successful integrate. */
  pauseAfterTask?: boolean;
  pauseRequested?: boolean;
}): AopLoopAfterCodingTerminal | null {
  if (input.taskStatus === "completed") {
    const nextStatus = nextStatusAfterTaskComplete(
      input.tasksSinceVerification,
      input.maxTasksBeforeVerification,
    );
    const titles = [
      ...input.recentTaskTitles,
      input.currentTaskTitle,
    ].filter(Boolean).slice(-MAX_RECENT_TASK_TITLES);
    const nextSince = input.tasksSinceVerification + 1;
    const integrated = appendIntegratedCommit(
      input.integratedCommits ?? [],
      input.completedCommit,
    );
    const holdForOperator = Boolean(input.pauseAfterTask || input.pauseRequested);
    if (holdForOperator) {
      return {
        shouldQueueBridge: false,
        updates: {
          status: "paused",
          paused_from: nextStatus,
          tasks_completed_total: input.tasksCompletedTotal + 1,
          tasks_since_verification: nextSince,
          recent_task_titles: titles,
          integrated_commits: integrated,
          current_agent_task_id: null,
          active_prompt_id: "",
          pause_requested: false,
          cancel_requested: false,
          status_detail:
            nextStatus === "awaiting_verification"
              ? `Task integrated. Paused for inspection — Resume → verify the last ${input.maxTasksBeforeVerification} task(s).`
              : "Task integrated. Paused for inspection — run the app or debug, then Resume to choose the next task.",
        },
      };
    }
    return {
      shouldQueueBridge: nextStatus === "bridging_task",
      updates: {
        status: nextStatus,
        tasks_completed_total: input.tasksCompletedTotal + 1,
        tasks_since_verification: nextSince,
        recent_task_titles: titles,
        integrated_commits: integrated,
        current_agent_task_id: null,
        active_prompt_id: "",
        pause_requested: false,
        status_detail:
          nextStatus === "awaiting_verification"
            ? `Verify the last ${input.maxTasksBeforeVerification} integrated task(s) before continuing.`
            : "Task integrated — requesting another coding task…",
      },
    };
  }

  if (input.taskStatus === "cancelled") {
    return {
      shouldQueueBridge: false,
      updates: {
        status: "paused",
        paused_from: "awaiting_start",
        cancel_requested: true,
        pause_requested: false,
        status_detail:
          "Coding task cancelled. Resume continues the same slice automatically (or Cancel loop).",
        current_agent_task_id: null,
        active_prompt_id: "",
      },
    };
  }

  if (input.taskStatus === "failed" || input.taskStatus === "blocked") {
    const detail = (input.taskError || "").trim()
      || (input.taskStatus === "blocked"
        ? "Coding task blocked."
        : "Coding task failed.");
    // One-shot Pause mid-task still holds on failure so the operator can inspect.
    // Sticky "pause after each task" only applies to successful integrates.
    if (input.pauseRequested) {
      return {
        shouldQueueBridge: false,
        updates: {
          status: "paused",
          paused_from: "awaiting_start",
          status_detail: `${detail} Paused after failure — fix, Resume (or Retry Start task), then continue.`,
          current_agent_task_id: null,
          active_prompt_id: "",
          cancel_requested: false,
          pause_requested: false,
        },
      };
    }
    return {
      shouldQueueBridge: false,
      updates: {
        // Keep the same current_task_* / prep answers; software retries only on operator click.
        status: "awaiting_start",
        status_detail: `${detail} Fix the issue, then Start task again (same slice — not a new bridge task).`,
        current_agent_task_id: null,
        active_prompt_id: "",
        cancel_requested: false,
        pause_requested: false,
      },
    };
  }

  return null;
}

export function buildBridgeTaskingPrompt(input: {
  directionPrompt: string;
  cpDoc: string;
  recentTaskTitles?: string[];
  codingHistory?: AopLoopCodingSlice[];
  featureDigests?: string;
}): string {
  const slices = input.codingHistory ?? [];
  const completedFromHistory = slices.filter((s) => s.status === "completed");
  const titles = completedFromHistory.length
    ? completedFromHistory.map((s) => s.title)
    : (input.recentTaskTitles ?? []);
  const completedCount = titles.length;
  const taskOrdinalHint = completedCount === 0
    ? "Emit the first coding task for this build loop (nothing completed yet)."
    : `Emit the next coding task after ${completedCount} completed slice(s). Do not re-emit completed titles or re-implement shipped work.`;
  const historyBlock = slices.length
    ? summarizeLoopCodingHistory(slices)
    : titles.length
      ? titles.map((title, index) => `${index + 1}. [completed] ${title}`).join("\n")
      : "(none yet)";
  const digests = (input.featureDigests ?? "").trim()
    || "(no targeted feature digests available)";
  return [
    "AOP BUILD LOOP — emit exactly one coding task toward MVP.",
    taskOrdinalHint,
    "Host-injected coding history and feature digests are authoritative progress signals.",
    "Do not re-emit work already listed as completed. Treat feature State Log done/shipped bullets as already implemented.",
    "Failed/cancelled slices may be retried only if still required and not contradicted by features or completed history.",
    "If MVP vision is already reflected as complete in history + features, prefer status mvp_complete.",
    "Do not ask vision/cp_doc questions unless a required section regressed to placeholder.",
    "Prefer implementation-level gaps for later prep questions.",
    "",
    "Original direction:",
    input.directionPrompt.trim(),
    "",
    "Current cp_doc:",
    input.cpDoc.trim(),
    "",
    "Coding history (agent_tasks for this loop — completed AND failed/cancelled):",
    historyBlock,
    "",
    "Targeted feature digests (Summary / Key Points / recent State Log):",
    digests,
    "",
    "Respond with ## Status next_task (exactly one ## Tasks item) or mvp_complete.",
  ].join("\n");
}

export function buildImplPrepUserPrompt(input: {
  taskTitle: string;
  taskPrompt: string;
  cpDoc: string;
  directionPrompt: string;
}): string {
  return [
    "AOP IMPLEMENTATION PREP — do not implement code.",
    "Inspect cp_doc.md (priority), feature files, then graphify, then code only if needed.",
    "Ask only implementation questions that block this single task.",
    "When ready to code, set ## Status ready_to_execute (no plan dump).",
    "",
    `Task title: ${input.taskTitle}`,
    "",
    "Task prompt:",
    input.taskPrompt,
    "",
    "Operator direction:",
    input.directionPrompt,
    "",
    "Current cp_doc:",
    input.cpDoc,
  ].join("\n");
}

export function buildDurableImplementationPrompt(input: {
  taskTitle: string;
  taskPrompt: string;
  prepAnswers: AopLoopAnswer[];
  directionPrompt: string;
}): string {
  const answers = input.prepAnswers.length
    ? input.prepAnswers
        .map((item) => `- ${item.question}: ${item.answer}`)
        .join("\n")
    : "(none)";
  return [
    `TASK: ${input.taskTitle}`,
    "",
    input.taskPrompt,
    "",
    "Implementation prep answers:",
    answers,
    "",
    "Read project-root cp_doc.md and relevant feature files before coding.",
    "Use graphify for structure; avoid bulk-reading unrelated source.",
    "Own this single slice only.",
    "",
    "Original AOP direction:",
    input.directionPrompt,
  ].join("\n");
}
