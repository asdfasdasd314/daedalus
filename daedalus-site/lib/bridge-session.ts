import type { TargetedFeature } from "@/lib/agent-chat-cache";
import {
  type PlanningAnswer,
  type PlanningQuestion,
  parseQuestionSection,
} from "@/lib/planning-questionnaire";

export type BridgeTask = {
  title: string;
  prompt: string;
};

export type BridgeStatus =
  | "need_more_questions"
  | "ready"
  | "next_task"
  | "mvp_complete"
  | "unknown";

export type BridgePhase =
  | "idle"
  | "running"
  | "questioning"
  | "ready"
  | "tasking"
  | "dispatching";

export type BridgeSession = {
  conversationId: string;
  directionPrompt: string;
  /** Structured long-term memory of the operator's stated vision (cp_doc). */
  cpDoc: string;
  directory: string;
  provider: string;
  model: string;
  reasoning: string;
  targetedFeatures: TargetedFeature[];
  notes: string;
  pendingQuestions: PlanningQuestion[];
  questionIndex: number;
  answers: PlanningAnswer[];
  proposedTasks: BridgeTask[];
  phase: BridgePhase;
  activeBridgePromptId: string;
  questionPromptId?: string;
  latestReply?: string;
};

/** Fixed ## headings inside cp_doc.md (body under bridge reply ## Cp Doc). */
export const CP_DOC_SECTIONS = [
  "Project Summary",
  "Tech Stack",
  "Broad Principles",
  "Project State",
  "Additional Notes",
] as const;

/** Required before coding / status ready. Broad Principles + Additional Notes optional. */
export const CP_DOC_REQUIRED_SECTIONS = [
  "Project Summary",
  "Tech Stack",
  "Project State",
] as const;

export const CP_DOC_PLACEHOLDER = "(not yet established)";

const STATUS_HEADING = /^## Status\s*$/im;
const CP_DOC_HEADING = /^## Cp Doc\s*$/im;
const NOTES_HEADING = /^## Notes\s*$/im;
const QUESTIONS_HEADING = /^## Questions\s*$/im;
const TASKS_HEADING = /^## Tasks\s*$/im;
const TASK_LINE = /^\s*\d+\.\s+\*\*(.+?)\*\*:?\s*(.*)$/;

/** Bodies that do not clear the coding-readiness gate for required sections. */
const CP_DOC_EMPTY_BODY = new Set([
  "",
  "-",
  "—",
  "…",
  "...",
  "tbd",
  "n/a",
  "na",
  "none",
  "none yet",
  "not yet established",
  "not established",
]);

export function cpDocHasAllSections(content: string): boolean {
  if (!content.trim()) {
    return false;
  }
  return CP_DOC_SECTIONS.every((title) =>
    new RegExp(`^##\\s+${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im").test(
      content,
    ),
  );
}

/** Body text under a top-level `## {title}` inside a structured cp_doc. */
export function extractCpDocSectionBody(content: string, title: string): string {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const start = new RegExp(`^##\\s+${escaped}\\s*$`, "im");
  const match = content.match(start);
  if (match?.index === undefined) {
    return "";
  }
  const after = match.index + match[0].length;
  const next = content.slice(after).match(/^##\s+/m);
  const end = next?.index !== undefined ? after + next.index : content.length;
  return content.slice(after, end).trim();
}

export function isCpDocSectionFilled(body: string): boolean {
  const compact = body
    .trim()
    .toLowerCase()
    .replace(/[()[\]*`_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return !CP_DOC_EMPTY_BODY.has(compact);
}

/** True when Project Summary, Tech Stack, and Project State have real content. */
export function isCpDocCodingReady(content: string): boolean {
  const structured = ensureStructuredCpDoc(content);
  if (!cpDocHasAllSections(structured)) {
    return false;
  }
  return CP_DOC_REQUIRED_SECTIONS.every((title) =>
    isCpDocSectionFilled(extractCpDocSectionBody(structured, title)),
  );
}

/** Five-section template; optional direction seeds Project Summary only. */
export function buildCpDocSkeleton(projectSummary = ""): string {
  const summary = projectSummary.trim() || CP_DOC_PLACEHOLDER;
  return [
    `## Project Summary\n${summary}`,
    `## Tech Stack\n${CP_DOC_PLACEHOLDER}`,
    `## Broad Principles\n${CP_DOC_PLACEHOLDER}`,
    `## Project State\n${CP_DOC_PLACEHOLDER}`,
    "## Additional Notes\n(none yet)",
  ].join("\n\n") + "\n";
}

/** Keep structured docs; wrap free-form text into the skeleton. */
export function ensureStructuredCpDoc(content: string): string {
  if (cpDocHasAllSections(content)) {
    return content.trimEnd() + "\n";
  }
  return buildCpDocSkeleton(content);
}

function unwrapMarkdownCodeFence(reply: string) {
  const fencedReply = reply.match(/^\s*```[^\n]*\n([\s\S]*?)\n```\s*$/);
  return fencedReply ? fencedReply[1] : reply;
}

function sectionBody(source: string, startHeading: RegExp, endHeadings: RegExp[]): string {
  const start = source.match(startHeading);
  if (start?.index === undefined) {
    return "";
  }
  const afterStart = start.index + start[0].length;
  let endIndex = source.length;
  for (const endHeading of endHeadings) {
    const match = source.slice(afterStart).match(endHeading);
    if (match?.index !== undefined) {
      endIndex = Math.min(endIndex, afterStart + match.index);
    }
  }
  return source.slice(afterStart, endIndex).trim();
}

export function parseBridgeTasksSection(section: string): BridgeTask[] {
  const tasks: BridgeTask[] = [];
  let current: BridgeTask | null = null;

  for (const line of section.split("\n")) {
    const taskMatch = line.match(TASK_LINE);
    if (taskMatch) {
      const title = taskMatch[1].trim();
      const remainder = taskMatch[2].trim();
      current = {
        title,
        prompt: remainder || title,
      };
      tasks.push(current);
      continue;
    }

    if (current && line.trim()) {
      current.prompt = `${current.prompt}\n${line}`.trim();
    }
  }

  return tasks.filter((task) => task.prompt.trim().length > 0);
}

export function parseBridgeReply(reply: string): {
  status: BridgeStatus;
  cpDoc: string;
  notes: string;
  questions: PlanningQuestion[];
  tasks: BridgeTask[];
  raw: string;
} {
  const normalizedReply = unwrapMarkdownCodeFence(reply);
  const statusBody = sectionBody(normalizedReply, STATUS_HEADING, [
    CP_DOC_HEADING,
    NOTES_HEADING,
    QUESTIONS_HEADING,
    TASKS_HEADING,
  ]).toLowerCase();
  let status: BridgeStatus = "unknown";
  if (statusBody.includes("mvp_complete") || statusBody.includes("mvp complete")) {
    status = "mvp_complete";
  } else if (statusBody.includes("next_task") || statusBody.includes("next task")) {
    status = "next_task";
  } else if (statusBody.includes("need_more_questions") || statusBody.includes("need more questions")) {
    status = "need_more_questions";
  } else if (/\bready\b/.test(statusBody)) {
    status = "ready";
  }

  const cpDoc = sectionBody(normalizedReply, CP_DOC_HEADING, [
    NOTES_HEADING,
    QUESTIONS_HEADING,
    TASKS_HEADING,
  ]);

  const notes = sectionBody(normalizedReply, NOTES_HEADING, [
    QUESTIONS_HEADING,
    TASKS_HEADING,
  ]);

  const questionsHeading = [...normalizedReply.matchAll(new RegExp(QUESTIONS_HEADING.source, "gim"))].at(-1);
  let questions: PlanningQuestion[] = [];
  if (questionsHeading?.index !== undefined) {
    const afterQuestions = normalizedReply.slice(questionsHeading.index);
    const tasksMatch = afterQuestions.match(TASKS_HEADING);
    const questionSection = tasksMatch?.index !== undefined
      ? afterQuestions.slice(0, tasksMatch.index)
      : afterQuestions;
    questions = parseQuestionSection(questionSection);
  }

  const tasksHeading = [...normalizedReply.matchAll(new RegExp(TASKS_HEADING.source, "gim"))].at(-1);
  let tasks: BridgeTask[] = [];
  if (tasksHeading?.index !== undefined) {
    tasks = parseBridgeTasksSection(normalizedReply.slice(tasksHeading.index));
  }

  if (status === "unknown") {
    if (tasks.length === 1 && questions.length === 0) {
      status = "next_task";
    } else if (tasks.length > 0 && questions.length === 0) {
      status = "ready";
    } else if (questions.length > 0) {
      status = "need_more_questions";
    }
  }

  // Build-loop contract: at most one next task when status is next_task.
  if (status === "next_task" && tasks.length > 1) {
    tasks = tasks.slice(0, 1);
  }

  // Host-side gate: never treat vision as ready with placeheld required sections.
  const structuredCpDoc = cpDoc.trim() ? ensureStructuredCpDoc(cpDoc) : "";
  if (
    (status === "ready" || status === "next_task" || status === "mvp_complete")
    && structuredCpDoc
    && !isCpDocCodingReady(structuredCpDoc)
  ) {
    status = "need_more_questions";
  }

  return {
    status,
    cpDoc,
    notes,
    questions,
    tasks,
    raw: normalizedReply,
  };
}

export function buildBridgeDirectionPrompt(direction: string): string {
  return direction.trim();
}
