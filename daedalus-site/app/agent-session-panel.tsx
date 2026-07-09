"use client";

import { useState } from "react";
import type {
  AgentChatExchange,
  TargetedFeature,
} from "@/lib/agent-chat-cache";
import type { AgentModelsConfig } from "@/lib/agent-models";
import type { FeatureFileProjects } from "@/lib/feature-file-cache";
import { getFeatureOptionsForProject } from "./feature-workspace-utils";

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
  selectedProjectDirectory,
  selectedReasoning,
  targetedFeatures,
}: AgentSessionPanelProps) {
  const defaultModel = agentModels.codex.models[0];
  const selectedModel =
    agentModels.codex.models.find((model) => model.id === selectedModelId) ??
    defaultModel;
  const reasoningOptions = selectedModel.reasoning;
  const availableFeatures = getFeatureOptionsForProject(
    projects,
    selectedProjectDirectory,
  );
  const selectableFeatures = availableFeatures.filter(
    (feature) =>
      !targetedFeatures.some(
        (targetedFeature) => targetedFeature.filePath === feature.filePath,
      ),
  );
  const [selectedFeaturePath, setSelectedFeaturePath] = useState("");
  const effectiveSelectedFeaturePath = selectableFeatures.some(
    (feature) => feature.filePath === selectedFeaturePath,
  )
    ? selectedFeaturePath
    : "";

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
    <div className="grid gap-3 rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
      <label
        htmlFor="agent-project"
        className="text-[11px] uppercase tracking-[0.28em] text-slate-400"
      >
        Target project
      </label>
      <select
        id="agent-project"
        value={selectedProjectDirectory}
        onChange={(event) => onSelectedProjectDirectoryChange(event.target.value)}
        className="agent-chat-scrollbar rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none"
      >
        {availableProjectDirectories.length > 0 ? (
          availableProjectDirectories.map((projectDirectory) => (
            <option key={projectDirectory} value={projectDirectory}>
              {projectDirectory}
            </option>
          ))
        ) : (
          <option value={defaultProjectDirectory}>{defaultProjectDirectory}</option>
        )}
      </select>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
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
            className="agent-chat-scrollbar rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none"
          >
            {agentModels.codex.models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-2">
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
            className="agent-chat-scrollbar rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm capitalize text-slate-100 outline-none"
          >
            {reasoningOptions.map((reasoning) => (
              <option key={reasoning} value={reasoning}>
                {reasoning}
              </option>
            ))}
          </select>
        </div>
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
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={effectiveSelectedFeaturePath}
            onChange={(event) => setSelectedFeaturePath(event.target.value)}
            className="agent-chat-scrollbar min-w-0 flex-1 rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none"
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
        className="agent-chat-scrollbar min-h-28 rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
      />

      <div className="flex flex-wrap items-center gap-3">
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
          <p className="text-sm text-slate-300">
            {promptQueueStatusText ||
              `The daemon will use ${selectedModelId} with ${selectedReasoning} reasoning.`}
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
        <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
          Agent channel: {formatAgentPromptMessage(agentPromptMessage)}
        </p>
      ) : null}

      {!isAgentChatCleared && latestChat ? (
        <div className="grid gap-3 pt-2">
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-[1.5rem] rounded-br-md bg-cyan-300 px-4 py-3 text-sm text-slate-950">
              <p>{latestChat.prompt}</p>
              {latestChat.model ? (
                <p className="mt-2 text-xs text-slate-700">
                  {latestChat.model} / {latestChat.reasoning}
                  {latestChat.planningMode ? " / planning" : ""}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex justify-start">
            <div className="max-w-[85%] whitespace-pre-wrap rounded-[1.5rem] rounded-bl-md border border-white/10 bg-slate-900/90 px-4 py-3 text-sm text-slate-100">
              {latestChat.reply || "Waiting for daemon reply..."}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
