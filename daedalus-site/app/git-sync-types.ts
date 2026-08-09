export type GitSyncOperation =
  | "commit"
  | "sync"
  | "status"
  | "resolve_head"
  | "aop_loop_revert";

export type GitSyncStep = {
  command: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  skipped?: boolean;
  head?: string;
};

export type GitSyncResult = {
  requestId: string;
  directory: string;
  operation: GitSyncOperation | string;
  status: "success" | "failed";
  steps: GitSyncStep[];
  head?: string;
  baseCommit?: string;
};

export type ParsedGitSyncRow = {
  requestId?: string;
  state?: string;
};
