"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  AgentChatExchange,
  TargetedFeature,
} from "@/lib/agent-chat-cache";
import type { AgentModelsConfig } from "@/lib/agent-models";
import type { FeatureFileProjects } from "@/lib/feature-file-cache";
import {
  getCompactProjectLabel,
  getFeatureOptionsForProject,
  getProjectLabel,
} from "./feature-workspace-utils";

type AgentPromptQueueStatus =
  | "queued"
  | "sending"
  | "running"
  | "completed"
  | "failed"
  | "stalled";

type AgentSessionPanelProps = {
  agentModels: AgentModelsConfig;
  agentPromptMessage: string;
  availableProjectDirectories: string[];
  currentPromptQueueItem: {
    promptId: string;
    status: AgentPromptQueueStatus;
  } | null;
  defaultProjectDirectory: string;
  formatAgentPromptMessage: (message: string) => string;
  isAgentChatCleared: boolean;
  isPlanningMode: boolean;
  latestChat: AgentChatExchange | null;
  onAbandonQueuedAgentPrompt: (promptId: string) => void;
  onClearAgentChat: () => void;
  onPlanningModeChange: (checked: boolean) => void;
  onProviderChange: (provider: string) => void;
  onPromptTextChange: (text: string) => void;
  onRemoveTargetedFeature: (filePath: string) => void;
  onRetryQueuedAgentPrompt: (promptId: string) => void;
  onSelectedProjectDirectoryChange: (projectDirectory: string) => void;
  onSelectedReasoningChange: (reasoning: string) => void;
  onSelectModel: (modelId: string) => void;
  onSendPrompt: () => void;
  onTargetedFeatureAdd: (feature: TargetedFeature) => void;
  projects: FeatureFileProjects;
  promptQueueStatusText: string;
  promptText: string;
  selectedModelId: string;
  selectedProvider: string;
  selectedProjectDirectory: string;
  selectedReasoning: string;
  targetedFeatures: TargetedFeature[];
};

export default function AgentSessionPanel({
  agentModels,
  agentPromptMessage,
  availableProjectDirectories,
  currentPromptQueueItem,
  defaultProjectDirectory,
  formatAgentPromptMessage,
  isAgentChatCleared,
  isPlanningMode,
  latestChat,
  onAbandonQueuedAgentPrompt,
  onClearAgentChat,
  onPlanningModeChange,
  onProviderChange,
  onPromptTextChange,
  onRemoveTargetedFeature,
  onRetryQueuedAgentPrompt,
  onSelectedProjectDirectoryChange,
  onSelectedReasoningChange,
  onSelectModel,
  onSendPrompt,
  onTargetedFeatureAdd,
  projects,
  promptQueueStatusText,
  promptText,
  selectedModelId,
  selectedProvider,
  selectedProjectDirectory,
  selectedReasoning,
  targetedFeatures,
}: AgentSessionPanelProps) {
  const providerModels = agentModels[selectedProvider]?.models ?? agentModels.codex.models;
  const defaultModel = providerModels[0];
  const selectedModel =
    providerModels.find((model) => model.id === selectedModelId) ??
    defaultModel;
  const reasoningOptions = selectedModel.reasoning;
  const availableFeatures = getFeatureOptionsForProject(
    projects,
    selectedProjectDirectory,
  );
  const compactProjectLabel = getCompactProjectLabel(
    selectedProjectDirectory,
    availableProjectDirectories,
  );
  const selectedProjectLabel = getProjectLabel(
    selectedProjectDirectory,
    availableProjectDirectories,
  );
  const selectableFeatures = availableFeatures.filter(
    (feature) =>
      !targetedFeatures.some(
        (targetedFeature) => targetedFeature.filePath === feature.filePath,
      ),
  );
  const [selectedFeaturePath, setSelectedFeaturePath] = useState("");
  const [isMarkdownReplyView, setIsMarkdownReplyView] = useState(true);
  const effectiveSelectedFeaturePath = selectableFeatures.some(
    (feature) => feature.filePath === selectedFeaturePath,
  )
    ? selectedFeaturePath
    : "";

  useEffect(() => {
    setIsMarkdownReplyView(true);
  }, [latestChat?.prompt, latestChat?.reply, isAgentChatCleared]);

  function addFeatureTag() {
    if (!selectedFeaturePath) {
      return;
    }

    const featureToAdd = selectableFeatures.find(
      (feature) => feature.filePath === selectedFeaturePath,
    );

    if (!featureToAdd) {
      return;
    }

    onTargetedFeatureAdd({
      featureName: featureToAdd.featureName,
      filePath: featureToAdd.filePath,
      projectPath: selectedProjectDirectory,
    });
    setSelectedFeaturePath("");
  }

  return (
    <div className="grid min-w-0 gap-3 overflow-x-hidden rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
      <label
        htmlFor="agent-project"
        className="text-[11px] uppercase tracking-[0.28em] text-slate-400"
      >
        Target project
      </label>
      <div className="relative min-w-0">
        <select
          id="agent-project"
          value={selectedProjectDirectory}
          onChange={(event) =>
            onSelectedProjectDirectoryChange(event.target.value)
          }
          title={selectedProjectLabel}
          className="agent-chat-scrollbar w-full min-w-0 appearance-none rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 pr-12 text-sm text-transparent outline-none"
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

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid min-w-0 gap-2">
          <label htmlFor="agent-provider" className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
            Provider
          </label>
          <select
            id="agent-provider"
            value={selectedProvider}
            onChange={(event) => onProviderChange(event.target.value)}
            className="agent-chat-scrollbar min-w-0 rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm capitalize text-slate-100 outline-none"
          >
            {Object.keys(agentModels).map((provider) => (
              <option key={provider} value={provider}>{provider}</option>
            ))}
          </select>
        </div>
        <div className="grid min-w-0 gap-2">
          <label
            htmlFor="agent-model"
            className="text-[11px] uppercase tracking-[0.28em] text-slate-400"
          >
            Model
          </label>
          <select
            id="agent-model"
            value={selectedModelId}
            onChange={(event) => onSelectModel(event.target.value)}
            className="agent-chat-scrollbar min-w-0 rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none"
          >
            {providerModels.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        </div>

        {reasoningOptions.length > 0 ? <div className="grid min-w-0 gap-2">
          <label
            htmlFor="agent-reasoning"
            className="text-[11px] uppercase tracking-[0.28em] text-slate-400"
          >
            Reasoning
          </label>
          <select
            id="agent-reasoning"
            value={selectedReasoning}
            onChange={(event) => onSelectedReasoningChange(event.target.value)}
            className="agent-chat-scrollbar min-w-0 rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm capitalize text-slate-100 outline-none"
          >
            {reasoningOptions.map((reasoning) => (
              <option key={reasoning} value={reasoning}>
                {reasoning}
              </option>
            ))}
          </select>
        </div> : null}
      </div>

      <label className="flex items-center gap-3 rounded-[1.25rem] border border-white/10 bg-slate-900/50 px-4 py-3 text-sm text-slate-200">
        <input
          type="checkbox"
          checked={isPlanningMode}
          onChange={(event) => onPlanningModeChange(event.target.checked)}
          className="h-4 w-4 accent-cyan-300"
        />
        Planning mode
      </label>

      <div className="grid gap-3">
        <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
          Feature scope
        </p>
        <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <select
            value={effectiveSelectedFeaturePath}
            onChange={(event) => setSelectedFeaturePath(event.target.value)}
            className="agent-chat-scrollbar min-w-0 rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none"
          >
            <option value="">Select a feature</option>
            {selectableFeatures.map((feature) => (
              <option key={feature.filePath} value={feature.filePath}>
                {feature.featureName}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={addFeatureTag}
            disabled={!effectiveSelectedFeaturePath}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
          >
            Add feature
          </button>
        </div>
        {targetedFeatures.length > 0 ? (
          <div className="flex flex-wrap gap-2 rounded-[1.25rem] border border-white/10 bg-slate-900/50 p-3">
            {targetedFeatures.map((feature) => (
              <span
                key={feature.filePath}
                title={feature.filePath}
                className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/12 px-3 py-2 text-sm text-cyan-50"
              >
                <span className="max-w-[13rem] truncate">{feature.featureName}</span>
                <button
                  type="button"
                  onClick={() => onRemoveTargetedFeature(feature.filePath)}
                  className="rounded-full border border-cyan-200/20 px-2 py-0.5 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-200/15"
                  aria-label={`Remove ${feature.featureName}`}
                >
                  x
                </button>
              </span>
            ))}
          </div>
        ) : (
          <div className="rounded-[1.25rem] border border-dashed border-white/10 bg-slate-900/30 px-4 py-3 text-sm text-slate-400">
            Add feature tags here to scope the next prompt.
          </div>
        )}
      </div>

      <label
        htmlFor="agent-prompt"
        className="text-[11px] uppercase tracking-[0.28em] text-slate-400"
      >
        Agent prompt
      </label>
      <textarea
        id="agent-prompt"
        value={promptText}
        onChange={(event) => onPromptTextChange(event.target.value)}
        placeholder="Describe the feature you want the daemon to create..."
        className="agent-chat-scrollbar min-h-28 min-w-0 rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
      />

      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onSendPrompt}
          disabled={!promptText.trim()}
          className="rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          Send prompt
        </button>
        <button
          type="button"
          onClick={onClearAgentChat}
          className="rounded-full border border-white/10 bg-slate-900/70 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
        >
          Clear chat
        </button>
        {!isAgentChatCleared ? (
          <p className="min-w-0 break-words text-sm text-slate-300">
            {promptQueueStatusText ||
              selectedProvider === "cursor"
                ? "The daemon will use Cursor CLI with file-edit permissions."
                : `The daemon will use ${selectedModelId} with ${selectedReasoning} reasoning.`}
          </p>
        ) : null}
      </div>

      {!isAgentChatCleared &&
      currentPromptQueueItem &&
      (currentPromptQueueItem.status === "failed" ||
        currentPromptQueueItem.status === "stalled") ? (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() =>
              onRetryQueuedAgentPrompt(currentPromptQueueItem.promptId)
            }
            className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-300/20"
          >
            Retry prompt
          </button>
          <button
            type="button"
            onClick={() =>
              onAbandonQueuedAgentPrompt(currentPromptQueueItem.promptId)
            }
            className="rounded-full border border-white/10 bg-slate-900/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-200 transition hover:bg-slate-800"
          >
            Abandon prompt
          </button>
        </div>
      ) : null}

      {!isAgentChatCleared && agentPromptMessage ? (
        <p className="min-w-0 break-words text-xs uppercase tracking-[0.22em] text-slate-500">
          Agent channel: {formatAgentPromptMessage(agentPromptMessage)}
        </p>
      ) : null}

      {!isAgentChatCleared && latestChat ? (
        <div className="grid min-w-0 gap-3 pt-2">
          <div className="flex min-w-0 justify-end">
            <div className="w-full max-w-[19rem] min-w-0 break-words rounded-[1.5rem] rounded-br-md bg-cyan-300 px-4 py-3 text-sm text-slate-950 sm:max-w-[85%]">
              <p>{latestChat.prompt}</p>
              {latestChat.model ? (
                <p className="mt-2 break-words text-xs leading-5 text-slate-700">
                  <span className="block">{latestChat.model}</span>
                  <span className="block">
                    {latestChat.reasoning}
                    {latestChat.planningMode ? " / planning" : ""}
                  </span>
                </p>
              ) : null}
            </div>
          </div>
          <div className="grid min-w-0 justify-items-start gap-2">
            {latestChat.reply ? (
              <div
                className="flex max-w-[19rem] flex-wrap items-center gap-1 self-stretch rounded-full border border-white/10 bg-slate-900/60 p-1 sm:max-w-[85%]"
                aria-label="Reply view"
              >
                <button
                  type="button"
                  onClick={() => setIsMarkdownReplyView(true)}
                  aria-pressed={isMarkdownReplyView}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    isMarkdownReplyView
                      ? "bg-cyan-300 text-slate-950"
                      : "text-slate-300 hover:bg-white/10"
                  }`}
                >
                  Formatted
                </button>
                <button
                  type="button"
                  onClick={() => setIsMarkdownReplyView(false)}
                  aria-pressed={!isMarkdownReplyView}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    !isMarkdownReplyView
                      ? "bg-cyan-300 text-slate-950"
                      : "text-slate-300 hover:bg-white/10"
                  }`}
                >
                  Raw
                </button>
              </div>
            ) : null}
            <div className="w-full max-w-[19rem] min-w-0 overflow-hidden rounded-[1.5rem] rounded-bl-md border border-white/10 bg-slate-900/90 px-4 py-3 text-sm text-slate-100 sm:max-w-[85%]">
              {latestChat.reply ? (
                isMarkdownReplyView ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ children, href }) => (
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="break-words text-cyan-300 underline underline-offset-2 hover:text-cyan-200"
                        >
                          {children}
                        </a>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote className="my-3 border-l-2 border-cyan-300/60 pl-3 text-slate-300">
                          {children}
                        </blockquote>
                      ),
                      code: ({ children, className, node, ...props }) => {
                        const isBlock =
                          node?.position?.start.line !==
                          node?.position?.end.line;

                        return isBlock ? (
                          <code
                            {...props}
                            className={`${className ?? ""} block whitespace-pre-wrap break-words p-3 text-slate-100`}
                          >
                            {children}
                          </code>
                        ) : (
                          <code
                            {...props}
                            className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[0.85em] text-cyan-100"
                          >
                            {children}
                          </code>
                        );
                      },
                      h1: ({ children }) => <h1 className="mt-4 text-xl font-bold text-white first:mt-0">{children}</h1>,
                      h2: ({ children }) => <h2 className="mt-4 text-lg font-semibold text-white">{children}</h2>,
                      h3: ({ children }) => <h3 className="mt-3 text-base font-semibold text-white">{children}</h3>,
                      ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-5">{children}</ol>,
                      p: ({ children }) => <p className="my-3 leading-6 first:mt-0 last:mb-0">{children}</p>,
                      pre: ({ children }) => <pre className="my-3 max-w-full overflow-x-auto rounded-lg bg-black/45 text-xs leading-5 last:mb-0">{children}</pre>,
                      table: ({ children }) => <div className="my-3 max-w-full overflow-x-auto"><table className="w-full min-w-max border-collapse text-left text-xs">{children}</table></div>,
                      td: ({ children }) => <td className="border border-white/15 px-2 py-1.5 align-top">{children}</td>,
                      th: ({ children }) => <th className="border border-white/15 bg-white/5 px-2 py-1.5 font-semibold text-white">{children}</th>,
                      ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-5">{children}</ul>,
                    }}
                  >
                    {latestChat.reply}
                  </ReactMarkdown>
                ) : (
                  <div className="whitespace-pre-wrap break-words">
                    {latestChat.reply}
                  </div>
                )
              ) : (
                "Waiting for daemon reply..."
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
