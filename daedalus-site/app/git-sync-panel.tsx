"use client";

import { useState } from "react";
import {
  getCompactProjectLabel,
  getProjectLabel,
} from "./feature-workspace-utils";
import type { GitSyncResult } from "./git-sync-types";
import { formatGitSyncOutput } from "./git-sync-utils";

type GitSyncPanelProps = {
  availableProjectDirectories: string[];
  commitMessage: string;
  defaultProjectDirectory: string;
  isRequestInFlight: boolean;
  latestResult: GitSyncResult | null;
  onCommitMessageChange: (message: string) => void;
  onCommitChanges: () => void;
  onSelectedProjectDirectoryChange: (projectDirectory: string) => void;
  onViewGitStatus: () => void;
  onSyncWithGitHub: () => void;
  selectedProjectDirectory: string;
  statusText: string;
};

export default function GitSyncPanel({
  availableProjectDirectories,
  commitMessage,
  defaultProjectDirectory,
  isRequestInFlight,
  latestResult,
  onCommitMessageChange,
  onCommitChanges,
  onSelectedProjectDirectoryChange,
  onViewGitStatus,
  onSyncWithGitHub,
  selectedProjectDirectory,
  statusText,
}: GitSyncPanelProps) {
  const [copyOutputButtonLabel, setCopyOutputButtonLabel] = useState("Copy output");
  const compactProjectLabel = getCompactProjectLabel(
    selectedProjectDirectory,
    availableProjectDirectories,
  );
  const selectedProjectLabel = getProjectLabel(
    selectedProjectDirectory,
    availableProjectDirectories,
  );
  const formattedOutput = latestResult ? formatGitSyncOutput(latestResult) : "";

  function copyCommandOutput() {
    if (!formattedOutput) {
      return;
    }

    void navigator.clipboard.writeText(formattedOutput).then(() => {
      setCopyOutputButtonLabel("Copied");
      window.setTimeout(() => setCopyOutputButtonLabel("Copy output"), 1500);
    });
  }

  return (
    <div className="grid min-w-0 gap-3 overflow-x-hidden rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
      <label
        htmlFor="git-sync-project"
        className="text-[11px] uppercase tracking-[0.28em] text-slate-400"
      >
        Target project
      </label>
      <div className="relative min-w-0">
        <select
          id="git-sync-project"
          value={selectedProjectDirectory}
          onChange={(event) =>
            onSelectedProjectDirectoryChange(event.target.value)
          }
          disabled={isRequestInFlight}
          title={selectedProjectLabel}
          className="agent-chat-scrollbar w-full min-w-0 appearance-none rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 pr-12 text-sm text-transparent outline-none disabled:cursor-not-allowed disabled:opacity-60"
        >
          {availableProjectDirectories.length > 0 ? (
            availableProjectDirectories.map((projectDirectory) => (
              <option key={projectDirectory} value={projectDirectory}>
                {getProjectLabel(projectDirectory, availableProjectDirectories)}
              </option>
            ))
          ) : (
            <option value={defaultProjectDirectory}>
              {getProjectLabel(defaultProjectDirectory, [defaultProjectDirectory])}
            </option>
          )}
        </select>
        <span
          className="pointer-events-none absolute inset-y-0 left-4 right-12 flex min-w-0 items-center truncate text-sm text-slate-100"
          title={selectedProjectLabel}
        >
          {compactProjectLabel}
        </span>
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-400">
          v
        </span>
      </div>

      <label
        htmlFor="git-sync-commit-message"
        className="text-[11px] uppercase tracking-[0.28em] text-slate-400"
      >
        Commit message
      </label>
      <textarea
        id="git-sync-commit-message"
        value={commitMessage}
        onChange={(event) => onCommitMessageChange(event.target.value)}
        disabled={isRequestInFlight}
        rows={4}
        placeholder="Describe the changes to commit in the selected repository."
        className="agent-chat-scrollbar min-h-[7rem] w-full min-w-0 resize-y rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none disabled:cursor-not-allowed disabled:opacity-60"
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onCommitChanges}
          disabled={isRequestInFlight || !commitMessage.trim()}
          className="rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          {isRequestInFlight ? "Working..." : "Commit changes"}
        </button>
        <button
          type="button"
          onClick={onSyncWithGitHub}
          disabled={isRequestInFlight}
          className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
        >
          {isRequestInFlight ? "Working..." : "Sync with GitHub"}
        </button>
        <button
          type="button"
          onClick={onViewGitStatus}
          disabled={isRequestInFlight}
          className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
        >
          {isRequestInFlight ? "Working..." : "View Git status"}
        </button>
      </div>

      {statusText ? (
        <p className="rounded-[1.25rem] border border-white/10 bg-slate-900/50 px-4 py-3 text-sm text-slate-200">
          {statusText}
        </p>
      ) : null}

      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
            Command output
          </p>
          <button
            type="button"
            onClick={copyCommandOutput}
            disabled={!formattedOutput}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:text-slate-500"
          >
            {copyOutputButtonLabel}
          </button>
        </div>
        <textarea
          readOnly
          value={formattedOutput}
          rows={14}
          placeholder="Git command output will appear here after the daemon completes the request."
          className="agent-chat-scrollbar min-h-[12rem] w-full min-w-0 resize-y rounded-[1.25rem] border border-white/10 bg-slate-950/80 px-4 py-3 font-mono text-xs leading-5 text-slate-100 outline-none"
        />
      </div>
    </div>
  );

}
