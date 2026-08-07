import type { TargetedFeature } from "@/lib/agent-chat-cache";

export type PlanningQuestion = {
  question: string;
  options: string[];
};

export type PlanningAnswer = {
  question: string;
  answer: string;
};

export type PlanningSession = {
  conversationId: string;
  originalPrompt: string;
  directory: string;
  provider: string;
  model: string;
  reasoning: string;
  targetedFeatures: TargetedFeature[];
  currentPlan: string;
  pendingQuestions: PlanningQuestion[];
  questionIndex: number;
  answers: PlanningAnswer[];
  activePlanningPromptId: string;
  questionPromptId?: string;
};

const QUESTIONS_HEADING = /^## Questions\s*$/gim;
const QUESTION_LINE = /^\s*\d+\.\s+\*\*(?:Question:\s*)?(.+?)\*\*:?\s*$/;
const OPTION_LINE = /^\s*(?:-\s+)?(?:[a-z]|\d+)[.)]\s+(.+?)\s*$/i;
const BULLET_OPTION_LINE = /^\s*-\s+(.+?)\s*$/;

function unwrapMarkdownCodeFence(reply: string) {
  const fencedReply = reply.match(/^\s*```[^\n]*\n([\s\S]*?)\n```\s*$/);
  return fencedReply ? fencedReply[1] : reply;
}

export function parsePlanningReply(reply: string): {
  plan: string;
  questions: PlanningQuestion[];
} {
  const normalizedReply = unwrapMarkdownCodeFence(reply);
  const headings = [...normalizedReply.matchAll(QUESTIONS_HEADING)];
  const heading = headings.at(-1);

  if (heading?.index === undefined) {
    return { plan: normalizedReply, questions: [] };
  }

  const questions = parseQuestionSection(normalizedReply.slice(heading.index));

  if (questions.length === 0) {
    return { plan: normalizedReply, questions: [] };
  }

  return {
    plan: normalizedReply.slice(0, heading.index).trimEnd(),
    questions,
  };
}

/** Parse a `## Questions` block body into multiple-choice questions. */
export function parseQuestionSection(section: string): PlanningQuestion[] {
  const questions: PlanningQuestion[] = [];
  let currentQuestion: PlanningQuestion | null = null;

  for (const line of section.split("\n")) {
    if (!line.trim() || /^## Questions\s*$/i.test(line)) {
      continue;
    }

    const questionMatch = line.match(QUESTION_LINE);

    if (questionMatch) {
      const question = questionMatch[1].replace(/^\[|\]$/g, "").trim();

      if (!question) {
        return [];
      }

      currentQuestion = { question, options: [] };
      questions.push(currentQuestion);
      continue;
    }

    const optionMatch = line.match(OPTION_LINE) ?? line.match(BULLET_OPTION_LINE);

    if (optionMatch && currentQuestion) {
      currentQuestion.options.push(optionMatch[1].trim());
      continue;
    }

    return [];
  }

  return questions.every((question) => question.options.length > 0)
    ? questions
    : [];
}

export function buildPlanningAnswersSuffix(answers: PlanningAnswer[]): string {
  if (answers.length === 0) {
    return "";
  }

  return answers.map(
    (answer, index) => `${answer.question}: ${index + 1}. ${answer.answer}`,
  ).join("\n");
}

export function buildImplementationPrompt(
  plan: string,
  answers: PlanningAnswer[],
): string {
  const answerSuffix = buildPlanningAnswersSuffix(answers);
  const sections = ["Implement the following approved plan:", plan];

  if (answerSuffix) {
    sections.push(answerSuffix);
  }

  return sections.join("\n\n");
}
