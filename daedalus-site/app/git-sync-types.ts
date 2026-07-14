export type GitSyncOperation = "commit" | "sync" | "status";

export type GitSyncStep = {
  command: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  skipped?: boolean;
};

export type GitSyncResult = {
  requestId: string;
  directory: string;
  operation: GitSyncOperation;
  status: "success" | "failed";
  steps: GitSyncStep[];
};

export type ParsedGitSyncRow = {
  requestId?: string;
  state?: string;
};
