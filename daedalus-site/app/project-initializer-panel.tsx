"use client";

import { useState } from "react";
import type { ProjectInitializationResult } from "./project-initialization-types";
import {
  buildDestinationPreview,
  formatInitializationDiagnostics,
  formatInitializationStep,
  normalizeProjectName,
  validateProjectName,
} from "./project-initialization-utils";

type Props = {
  acceptsWork: boolean;
  authenticated: boolean;
  createGitHubRepository: boolean;
  executionRoot: string | null;
  isManagerOnline: boolean;
  isRequestInFlight: boolean;
  latestResult: ProjectInitializationResult | null;
  onCreateGitHubRepositoryChange: (selected: boolean) => void;
  onInitialize: () => void;
  onProjectNameChange: (name: string) => void;
  projectName: string;
  statusText: string;
};

export default function ProjectInitializerPanel({
  acceptsWork,
  authenticated,
  createGitHubRepository,
  executionRoot,
  isManagerOnline,
  isRequestInFlight,
  latestResult,
  onCreateGitHubRepositoryChange,
  onInitialize,
  onProjectNameChange,
  projectName,
  statusText,
}: Props) {
  const [copyLabel, setCopyLabel] = useState("Copy diagnostics");
  const validationError = validateProjectName(projectName);
  const normalizedName = normalizeProjectName(projectName);
  const diagnostics = latestResult ? formatInitializationDiagnostics(latestResult) : "";
  const disabled = !authenticated || !isManagerOnline || !acceptsWork
    || isRequestInFlight || Boolean(validationError);

  function copyDiagnostics() {
    if (!diagnostics) return;
    void navigator.clipboard.writeText(diagnostics).then(() => {
      setCopyLabel("Copied");
      window.setTimeout(() => setCopyLabel("Copy diagnostics"), 1500);
    });
  }

  return (
    <div className="grid gap-4 rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
      <label htmlFor="project-initializer-name" className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
        Project name
      </label>
      <input
        id="project-initializer-name"
        value={projectName}
        disabled={isRequestInFlight}
        onChange={(event) => onProjectNameChange(event.target.value)}
        placeholder="example-project"
        className="rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none disabled:opacity-60"
      />
      {validationError && projectName ? <p className="text-sm text-rose-200">{validationError}</p> : null}
      {normalizedName && normalizedName !== projectName.trim() ? (
        <p className="text-sm text-slate-400">Normalized name: <span className="text-slate-200">{normalizedName}</span></p>
      ) : null}

      <div className="rounded-[1.25rem] border border-white/10 bg-slate-900/55 px-4 py-3">
        <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Destination</p>
        <p className="mt-2 break-all font-mono text-xs text-slate-200">
          {buildDestinationPreview(executionRoot, projectName)}
        </p>
      </div>

      <label className="flex items-start gap-3 rounded-[1.25rem] border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
        <input
          type="checkbox"
          checked={createGitHubRepository}
          disabled={isRequestInFlight}
          onChange={(event) => onCreateGitHubRepositoryChange(event.target.checked)}
          className="mt-1"
        />
        <span>Create private GitHub repository and push</span>
      </label>

      <button
        type="button"
        onClick={onInitialize}
        disabled={disabled}
        className="w-fit rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
      >
        {isRequestInFlight ? "Initializing..." : "Initialize project"}
      </button>

      {!authenticated ? <p className="text-sm text-amber-200">Sign in to initialize a project.</p> : null}
      {authenticated && !isManagerOnline ? <p className="text-sm text-amber-200">The local daemon manager is offline.</p> : null}
      {authenticated && isManagerOnline && !acceptsWork ? <p className="text-sm text-amber-200">The daemon is draining for restart.</p> : null}
      {statusText ? <p className="rounded-[1.25rem] border border-white/10 bg-slate-900/55 px-4 py-3 text-sm text-slate-200">{statusText}</p> : null}

      {latestResult ? (
        <div className="grid gap-3">
          <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Progress</p>
          <ul className="grid gap-2">
            {latestResult.steps.map((currentStep) => (
              <li key={currentStep.name} className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-200">
                {formatInitializationStep(currentStep)}
                {currentStep.stderr ? <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-rose-200">{currentStep.stderr}</pre> : null}
              </li>
            ))}
          </ul>
          {latestResult.projectDirectory ? <p className="break-all text-sm text-slate-200">Local path: {latestResult.projectDirectory}</p> : null}
          {latestResult.githubUrl ? <a href={latestResult.githubUrl} target="_blank" rel="noreferrer" className="break-all text-sm text-cyan-200 underline">GitHub repository</a> : null}
          <button type="button" onClick={copyDiagnostics} className="w-fit rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200">
            {copyLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
