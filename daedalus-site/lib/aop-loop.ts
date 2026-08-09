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
    paused_from?: string;
    cancel_requested?: boolean;
  };
};

export function loopPatchAfterCodingTaskTerminal(input: {
  tasksCompletedTotal: number;
  tasksSinceVerification: number;
  maxTasksBeforeVerification: number;
  recentTaskTitles: string[];
  currentTaskTitle: string;
  taskStatus: string;
  taskError?: string;
}): AopLoopAfterCodingTerminal | null {
  if (input.taskStatus === "completed") {
    const nextStatus = nextStatusAfterTaskComplete(
      input.tasksSinceVerification,
      input.maxTasksBeforeVerification,
    );
    const titles = [
      ...input.recentTaskTitles,
      input.currentTaskTitle,
    ].filter(Boolean).slice(-12);
    const nextSince = input.tasksSinceVerification + 1;
    return {
      shouldQueueBridge: nextStatus === "bridging_task",
      updates: {
        status: nextStatus,
        tasks_completed_total: input.tasksCompletedTotal + 1,
        tasks_since_verification: nextSince,
        recent_task_titles: titles,
        current_agent_task_id: null,
        active_prompt_id: "",
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
        status_detail:
          "Coding task cancelled. Resume, then Start task to retry the same slice.",
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
    return {
      shouldQueueBridge: false,
      updates: {
        // Keep the same current_task_* / prep answers; operator must Start again.
        status: "awaiting_start",
        status_detail: `${detail} Fix the issue, then Start task again (same slice — not a new bridge task).`,
        current_agent_task_id: null,
        active_prompt_id: "",
        cancel_requested: false,
      },
    };
  }

  return null;
}

export function buildBridgeTaskingPrompt(input: {
  directionPrompt: string;
  cpDoc: string;
  recentTaskTitles: string[];
}): string {
  const recent = input.recentTaskTitles.length
    ? input.recentTaskTitles.map((title, index) => `${index + 1}. ${title}`).join("\n")
    : "(none yet)";
  const completedCount = input.recentTaskTitles.length;
  const taskOrdinalHint = completedCount === 0
    ? "Emit the first coding task for this build loop (nothing completed yet)."
    : `Emit the next coding task after ${completedCount} completed slice(s). Do not re-emit completed titles.`;
  return [
    "AOP BUILD LOOP — emit exactly one coding task toward MVP.",
    taskOrdinalHint,
    "Do not ask vision/cp_doc questions unless a required section regressed to placeholder.",
    "Prefer implementation-level gaps for later prep questions.",
    "",
    "Original direction:",
    input.directionPrompt.trim(),
    "",
    "Current cp_doc:",
    input.cpDoc.trim(),
    "",
    "Recently completed task titles:",
    recent,
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
