import type { GitSyncResult, GitSyncStep } from "./git-sync-types";

function formatStepOutput(step: GitSyncStep, index: number) {
  const commandText = step.command.join(" ");
  const exitCodeText =
    step.exitCode === null || step.exitCode === undefined
      ? "skipped"
      : String(step.exitCode);
  const sections = [
    `Step ${index + 1}: ${commandText}`,
    `Exit code: ${exitCodeText}`,
  ];

  if (step.stdout) {
    sections.push(`stdout:\n${step.stdout}`);
  }

  if (step.stderr) {
    sections.push(`stderr:\n${step.stderr}`);
  }

  return sections.join("\n");
}

export function formatGitSyncOutput(result: GitSyncResult) {
  const header = [
    `Operation: ${result.operation}`,
    `Status: ${result.status}`,
    `Directory: ${result.directory}`,
    `Request ID: ${result.requestId}`,
    "",
  ];

  const stepOutput = result.steps.map(formatStepOutput).join("\n\n");

  return `${header.join("\n")}${stepOutput}`;
}

export function parseGitSyncRowMessage(message: string) {
  const trimmedMessage = message.trim();

  if (!trimmedMessage) {
    return null;
  }

  try {
    const parsedMessage = JSON.parse(trimmedMessage) as {
      requestId?: unknown;
      state?: unknown;
    };

    if (typeof parsedMessage !== "object" || parsedMessage === null) {
      return null;
    }

    return {
      requestId:
        typeof parsedMessage.requestId === "string"
          ? parsedMessage.requestId
          : undefined,
      state:
        typeof parsedMessage.state === "string"
          ? parsedMessage.state
          : undefined,
    };
  } catch {
    return null;
  }
}
