import type {
  ProjectInitializationRequest,
  ProjectInitializationResult,
  ProjectInitializationStep,
} from "./project-initialization-types";

const PROJECT_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAXIMUM_PROJECT_NAME_LENGTH = 100;

export function normalizeProjectName(value: string) {
  return value.trim().toLowerCase();
}

export function validateProjectName(value: string) {
  const normalized = normalizeProjectName(value);
  if (!normalized) return "Enter a project name.";
  if (normalized.length > MAXIMUM_PROJECT_NAME_LENGTH) {
    return `Use at most ${MAXIMUM_PROJECT_NAME_LENGTH} characters.`;
  }
  if (!PROJECT_NAME_PATTERN.test(normalized)) {
    return "Use lowercase letters, numbers, and internal hyphens only.";
  }
  return "";
}

export function buildDestinationPreview(
  executionRoot: string | null | undefined,
  projectName: string,
) {
  const root = executionRoot?.replace(/[\\/]+$/, "") || "Daemon invocation directory";
  const normalized = normalizeProjectName(projectName);
  return normalized ? `${root}/${normalized}` : `${root}/PROJECT_NAME`;
}

export function serializeProjectInitializationRequest(
  requestId: string,
  projectName: string,
  createGitHubRepository: boolean,
): ProjectInitializationRequest {
  return {
    requestId,
    projectName: normalizeProjectName(projectName),
    createGitHubRepository,
  };
}

export function isTerminalInitializationStatus(status: string) {
  return ["success", "partial_success", "failed"].includes(status);
}

export function initializationStatusText(result: ProjectInitializationResult) {
  if (result.status === "running") return "Initialization is in progress.";
  if (result.status === "success") return "Project initialized successfully.";
  if (result.status === "partial_success") {
    return "Local project initialized, but GitHub setup needs attention.";
  }
  return "Project initialization failed.";
}

export function shouldApplyInitializationResult(
  activeRequestId: string,
  result: ProjectInitializationResult,
) {
  return Boolean(activeRequestId) && result.requestId === activeRequestId;
}

export function formatInitializationStep(step: ProjectInitializationStep) {
  const exit = step.exitCode === null ? "not finished" : `exit ${step.exitCode}`;
  return `${step.name}: ${step.status} (${exit})`;
}

export function formatInitializationDiagnostics(result: ProjectInitializationResult) {
  const lines = [
    `Status: ${result.status}`,
    `Project: ${result.projectName}`,
    `Directory: ${result.projectDirectory}`,
    `Request ID: ${result.requestId}`,
  ];
  if (result.error) lines.push(`Error: ${result.error}`);
  for (const step of result.steps) {
    lines.push("", formatInitializationStep(step), step.command.join(" "));
    if (step.stderr) lines.push(step.stderr);
    if (step.stdout) lines.push(step.stdout);
  }
  return lines.join("\n");
}
