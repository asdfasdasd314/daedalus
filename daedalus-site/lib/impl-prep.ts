import {
  type PlanningAnswer,
  type PlanningQuestion,
  parseQuestionSection,
} from "@/lib/planning-questionnaire";

export type ImplPrepStatus =
  | "need_more_questions"
  | "ready_to_execute"
  | "unknown";

const STATUS_HEADING = /^## Status\s*$/im;
const NOTES_HEADING = /^## Notes\s*$/im;
const QUESTIONS_HEADING = /^## Questions\s*$/im;
const OPTIONAL_CP_DOC_HEADING = /^## Optional Cp Doc\s*$/im;
const CP_DOC_HEADING = /^## Cp Doc\s*$/im;

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

export function parseImplPrepReply(reply: string): {
  status: ImplPrepStatus;
  notes: string;
  questions: PlanningQuestion[];
  optionalCpDoc: string;
  raw: string;
} {
  const normalizedReply = unwrapMarkdownCodeFence(reply);
  const statusBody = sectionBody(normalizedReply, STATUS_HEADING, [
    NOTES_HEADING,
    QUESTIONS_HEADING,
    OPTIONAL_CP_DOC_HEADING,
    CP_DOC_HEADING,
  ]).toLowerCase();

  let status: ImplPrepStatus = "unknown";
  if (statusBody.includes("ready_to_execute") || statusBody.includes("ready to execute")) {
    status = "ready_to_execute";
  } else if (
    statusBody.includes("need_more_questions") ||
    statusBody.includes("need more questions")
  ) {
    status = "need_more_questions";
  }

  const notes = sectionBody(normalizedReply, NOTES_HEADING, [
    QUESTIONS_HEADING,
    OPTIONAL_CP_DOC_HEADING,
    CP_DOC_HEADING,
  ]);

  const questionsHeading = [...normalizedReply.matchAll(new RegExp(QUESTIONS_HEADING.source, "gim"))].at(-1);
  let questions: PlanningQuestion[] = [];
  if (questionsHeading?.index !== undefined) {
    const afterQuestions = normalizedReply.slice(questionsHeading.index);
    const optionalMatch = afterQuestions.match(OPTIONAL_CP_DOC_HEADING);
    const cpDocMatch = afterQuestions.match(CP_DOC_HEADING);
    let cut = afterQuestions.length;
    if (optionalMatch?.index !== undefined) {
      cut = Math.min(cut, optionalMatch.index);
    }
    if (cpDocMatch?.index !== undefined) {
      cut = Math.min(cut, cpDocMatch.index);
    }
    questions = parseQuestionSection(afterQuestions.slice(0, cut));
  }

  let optionalCpDoc = sectionBody(normalizedReply, OPTIONAL_CP_DOC_HEADING, [
    QUESTIONS_HEADING,
    NOTES_HEADING,
  ]);
  if (!optionalCpDoc.trim()) {
    optionalCpDoc = sectionBody(normalizedReply, CP_DOC_HEADING, [
      NOTES_HEADING,
      QUESTIONS_HEADING,
    ]);
  }

  if (status === "unknown") {
    status = questions.length > 0 ? "need_more_questions" : "ready_to_execute";
  }

  return {
    status,
    notes,
    questions,
    optionalCpDoc,
    raw: normalizedReply,
  };
}

export type { PlanningAnswer, PlanningQuestion };
