"use client";

import type { TargetedFeature } from "@/lib/agent-chat-cache";
import type { AgentModelsConfig } from "@/lib/agent-models";
import { getCompactProjectLabel, getProjectLabel } from "./feature-workspace-utils";

type AgentPromptMode = "standard" | "planning" | "ask";

type AgentSessionPanelProps = {
  agentModels: AgentModelsConfig;
  availableProjectDirectories: string[];
  defaultProjectDirectory: string;
  onOpenFeatureTagSearch: () => void;
  onProviderChange: (provider: string) => void;
  onPromptTextChange: (text: string) => void;
  onRemoveTargetedFeature: (filePath: string) => void;
  onSelectedModeChange: (mode: AgentPromptMode) => void;
  onSelectedProjectDirectoryChange: (projectDirectory: string) => void;
  onSelectedReasoningChange: (reasoning: string) => void;
  onSelectModel: (modelId: string) => void;
  onSendPrompt: () => void;
  promptText: string;
  selectedMode: AgentPromptMode;
  selectedModelId: string;
  selectedProvider: string;
  selectedProjectDirectory: string;
  selectedReasoning: string;
  submissionError?: string;
  targetedFeatures: TargetedFeature[];
};

export default function AgentSessionPanel({
  agentModels, availableProjectDirectories, defaultProjectDirectory,
  onOpenFeatureTagSearch, onProviderChange, onPromptTextChange,
  onRemoveTargetedFeature, onSelectedModeChange,
  onSelectedProjectDirectoryChange, onSelectedReasoningChange, onSelectModel,
  onSendPrompt, promptText, selectedMode, selectedModelId, selectedProvider,
  selectedProjectDirectory, selectedReasoning, submissionError,
  targetedFeatures,
}: AgentSessionPanelProps) {
  const providerModels = agentModels[selectedProvider]?.models ?? agentModels.codex.models;
  const selectedModel = providerModels.find((model) => model.id === selectedModelId) ?? providerModels[0];
  const projectDirectories = availableProjectDirectories.length > 0
    ? availableProjectDirectories
    : [defaultProjectDirectory];

  return (
    <div className="grid min-w-0 gap-3 overflow-x-hidden rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
      <label htmlFor="agent-project" className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Target project</label>
      <div className="relative min-w-0">
        <select id="agent-project" value={selectedProjectDirectory} onChange={(event) => onSelectedProjectDirectoryChange(event.target.value)} title={getProjectLabel(selectedProjectDirectory, projectDirectories)} className="agent-chat-scrollbar w-full appearance-none rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 pr-12 text-sm text-transparent outline-none">
          {projectDirectories.map((directory) => <option key={directory} value={directory}>{getProjectLabel(directory, projectDirectories)}</option>)}
        </select>
        <span className="pointer-events-none absolute inset-y-0 left-4 right-12 flex items-center truncate text-sm text-slate-100">{getCompactProjectLabel(selectedProjectDirectory, projectDirectories)}</span>
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-400">v</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2 text-[11px] uppercase tracking-[0.28em] text-slate-400">Provider<select value={selectedProvider} onChange={(event) => onProviderChange(event.target.value)} className="rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm capitalize text-slate-100 outline-none">{Object.keys(agentModels).map((provider) => <option key={provider} value={provider}>{provider}</option>)}</select></label>
        <label className="grid gap-2 text-[11px] uppercase tracking-[0.28em] text-slate-400">Model<select value={selectedModelId} onChange={(event) => onSelectModel(event.target.value)} className="rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm normal-case text-slate-100 outline-none">{providerModels.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select></label>
        {selectedModel?.reasoning.length ? <label className="grid gap-2 text-[11px] uppercase tracking-[0.28em] text-slate-400">Reasoning<select value={selectedReasoning} onChange={(event) => onSelectedReasoningChange(event.target.value)} className="rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm capitalize text-slate-100 outline-none">{selectedModel.reasoning.map((reasoning) => <option key={reasoning} value={reasoning}>{reasoning}</option>)}</select></label> : null}
      </div>

      <fieldset className="grid gap-2 rounded-[1.25rem] border border-white/10 bg-slate-900/50 p-3">
        <legend className="px-1 text-[11px] uppercase tracking-[0.28em] text-slate-400">Mode</legend>
        <div className="grid gap-2 sm:grid-cols-3">{([
          ["standard", "Standard", "Creates a durable implementation task."],
          ["planning", "Planning", "Creates a plan and optional questionnaire."],
          ["ask", "Ask", "Answers without writing code."],
        ] as const).map(([mode, label, description]) => <label key={mode} className="flex cursor-pointer gap-2 rounded-xl border border-white/10 bg-slate-950/30 p-3 text-sm text-slate-200"><input type="radio" name="agent-mode" checked={selectedMode === mode} onChange={() => onSelectedModeChange(mode)} className="mt-0.5 h-4 w-4 accent-cyan-300" /><span><span className="block font-semibold">{label}</span><span className="block text-xs text-slate-400">{description}</span></span></label>)}</div>
      </fieldset>

      <div className="grid gap-3">
        <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Feature scope</p>
        <button type="button" onClick={onOpenFeatureTagSearch} className="rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-left text-sm font-semibold text-slate-100 hover:bg-slate-800">Search features to tag</button>
        {targetedFeatures.length ? <div className="flex flex-wrap gap-2">{targetedFeatures.map((feature) => <span key={feature.filePath} title={feature.filePath} className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/12 px-3 py-2 text-sm text-cyan-50"><span className="max-w-[13rem] truncate">{feature.featureName}</span><button type="button" onClick={() => onRemoveTargetedFeature(feature.filePath)} aria-label={`Remove ${feature.featureName}`} className="rounded-full px-2 text-xs hover:bg-cyan-200/15">x</button></span>)}</div> : <p className="rounded-[1.25rem] border border-dashed border-white/10 px-4 py-3 text-sm text-slate-400">Add feature tags to scope the next prompt.</p>}
      </div>

      <label htmlFor="agent-prompt" className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Agent prompt</label>
      <textarea id="agent-prompt" value={promptText} onChange={(event) => onPromptTextChange(event.target.value)} placeholder="Describe what you want the agent to do..." className="agent-chat-scrollbar min-h-28 min-w-0 rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500" />
      <button type="button" onClick={onSendPrompt} disabled={!promptText.trim()} className="w-fit rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400">Send prompt</button>
      {submissionError ? <p className="text-sm text-rose-200">{submissionError}</p> : null}
    </div>
  );
}
