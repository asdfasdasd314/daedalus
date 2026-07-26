export type ProjectInitializationStatus =
  | "running"
  | "success"
  | "partial_success"
  | "failed";

export type ProjectInitializationStepStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "skipped";

export type ProjectInitializationStep = {
  name: string;
  status: ProjectInitializationStepStatus;
  command: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

export type ProjectInitializationResult = {
  requestId: string;
  projectName: string;
  projectDirectory: string;
  status: ProjectInitializationStatus;
  githubUrl: string | null;
  error: string | null;
  steps: ProjectInitializationStep[];
};

export type ProjectInitializationRequest = {
  requestId: string;
  projectName: string;
  createGitHubRepository: boolean;
};
