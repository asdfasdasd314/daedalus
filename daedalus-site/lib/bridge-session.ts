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

export type BridgeStatus = "need_more_questions" | "ready" | "unknown";

export type BridgePhase = "idle" | "running" | "questioning" | "ready" | "dispatching";

export type BridgeSession = {
  conversationId: string;
  directionPrompt: string;
  /** Agent's compressed model of the operator's stated vision (cp_doc). */
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

const STATUS_HEADING = /^## Status\s*$/im;
const CP_DOC_HEADING = /^## Cp Doc\s*$/im;
const NOTES_HEADING = /^## Notes\s*$/im;
const QUESTIONS_HEADING = /^## Questions\s*$/im;
const TASKS_HEADING = /^## Tasks\s*$/im;
const TASK_LINE = /^\s*\d+\.\s+\*\*(.+?)\*\*:?\s*(.*)$/;

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
  if (statusBody.includes("ready")) {
    status = "ready";
  } else if (statusBody.includes("need_more_questions") || statusBody.includes("need more questions")) {
    status = "need_more_questions";
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
    if (tasks.length > 0 && questions.length === 0) {
      status = "ready";
    } else if (questions.length > 0) {
      status = "need_more_questions";
    }
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
