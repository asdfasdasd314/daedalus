"use client";

import type { FormEvent } from "react";
import type { TargetedFeature } from "@/lib/agent-chat-cache";
import type { AgentModelsConfig } from "@/lib/agent-models";
import type { BridgeSession, BridgeTask } from "@/lib/bridge-session";
import type { PlanningQuestion } from "@/lib/planning-questionnaire";
import { getCompactProjectLabel, getProjectLabel } from "./feature-workspace-utils";

type AopSessionPanelProps = {
  acceptsWork: boolean;
  agentModels: AgentModelsConfig;
  availableProjectDirectories: string[];
  bridgeSession: BridgeSession | null;
  defaultProjectDirectory: string;
  directionText: string;
  onClearSession: () => void;
  onDirectionTextChange: (text: string) => void;
  onDispatchTasks: () => void;
  onAnswerQuestion: (answer: string) => void;
  onOpenFeatureTagSearch: () => void;
  onProviderChange: (provider: string) => void;
  onRemoveTargetedFeature: (filePath: string) => void;
  onSelectedProjectDirectoryChange: (projectDirectory: string) => void;
  onSelectedReasoningChange: (reasoning: string) => void;
  onSelectModel: (modelId: string) => void;
  onSubmitDirection: () => void;
  otherAnswer: string;
  onOtherAnswerChange: (value: string) => void;
  selectedModelId: string;
  selectedProvider: string;
  selectedProjectDirectory: string;
  selectedReasoning: string;
  submissionError?: string;
  targetedFeatures: TargetedFeature[];
};

export default function AopSessionPanel({
  acceptsWork,
  agentModels,
  availableProjectDirectories,
  bridgeSession,
  defaultProjectDirectory,
  directionText,
  onClearSession,
  onDirectionTextChange,
  onDispatchTasks,
  onAnswerQuestion,
  onOpenFeatureTagSearch,
  onProviderChange,
  onRemoveTargetedFeature,
  onSelectedProjectDirectoryChange,
  onSelectedReasoningChange,
  onSelectModel,
  onSubmitDirection,
  otherAnswer,
  onOtherAnswerChange,
  selectedModelId,
  selectedProvider,
  selectedProjectDirectory,
  selectedReasoning,
  submissionError,
  targetedFeatures,
}: AopSessionPanelProps) {
  const providerModels = agentModels[selectedProvider]?.models ?? agentModels.codex.models;
  const selectedModel = providerModels.find((model) => model.id === selectedModelId) ?? providerModels[0];
  const projectDirectories = availableProjectDirectories.length > 0
    ? availableProjectDirectories
    : [defaultProjectDirectory];
  const activeQuestion = bridgeSession?.pendingQuestions[bridgeSession.questionIndex] ?? null;
  const canStart = Boolean(directionText.trim()) && acceptsWork &&
    (!bridgeSession || bridgeSession.phase === "idle" || bridgeSession.phase === "ready");
  const canDispatch = Boolean(
    bridgeSession &&
    bridgeSession.phase === "ready" &&
    bridgeSession.proposedTasks.length > 0 &&
    acceptsWork,
  );

  return (
    <div className="grid min-w-0 gap-5 overflow-x-hidden">
      <header className="grid min-w-0 gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
            Answer-oriented programming
          </p>
          <span className="rounded-full border border-violet-300/30 bg-violet-300/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-100">
            Beta
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          AOP Beta
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-slate-300">
          A separate programming surface: send a high-level direction to the bridge agent.
          It asks high-coverage questions, then splits ready work into focused coding tasks.
          Every post here is bridge-only — there is no Standard, Planning, or Ask mode.
        </p>
      </header>

      <section className="grid min-w-0 gap-3 rounded-[1.5rem] border border-white/10 bg-black/25 p-4 sm:p-5">
        <label htmlFor="aop-project" className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
          Target project
        </label>
        <div className="relative min-w-0">
          <select
            id="aop-project"
            value={selectedProjectDirectory}
            onChange={(event) => onSelectedProjectDirectoryChange(event.target.value)}
            title={getProjectLabel(selectedProjectDirectory, projectDirectories)}
            className="agent-chat-scrollbar w-full appearance-none rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 pr-12 text-sm text-transparent outline-none"
          >
            {projectDirectories.map((directory) => (
              <option key={directory} value={directory}>
                {getProjectLabel(directory, projectDirectories)}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute inset-y-0 left-4 right-12 flex items-center truncate text-sm text-slate-100">
            {getCompactProjectLabel(selectedProjectDirectory, projectDirectories)}
          </span>
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-400">
            v
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-2 text-[11px] uppercase tracking-[0.28em] text-slate-400">
            Provider
            <select
              value={selectedProvider}
              onChange={(event) => onProviderChange(event.target.value)}
              className="rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm capitalize tracking-normal text-slate-100 outline-none"
            >
              {Object.keys(agentModels).map((provider) => (
                <option key={provider} value={provider}>{provider}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-[11px] uppercase tracking-[0.28em] text-slate-400">
            Model
            <select
              value={selectedModelId}
              onChange={(event) => onSelectModel(event.target.value)}
              className="rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm normal-case tracking-normal text-slate-100 outline-none"
            >
              {providerModels.map((model) => (
                <option key={model.id} value={model.id}>{model.name}</option>
              ))}
            </select>
          </label>
          {selectedModel?.reasoning.length ? (
            <label className="grid gap-2 text-[11px] uppercase tracking-[0.28em] text-slate-400">
              Reasoning
              <select
                value={selectedReasoning}
                onChange={(event) => onSelectedReasoningChange(event.target.value)}
                className="rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm capitalize tracking-normal text-slate-100 outline-none"
              >
                {selectedModel.reasoning.map((reasoning) => (
                  <option key={reasoning} value={reasoning}>{reasoning}</option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        <div className="grid gap-3">
          <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Feature scope</p>
          <button
            type="button"
            onClick={onOpenFeatureTagSearch}
            className="rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-left text-sm font-semibold text-slate-100 hover:bg-slate-800"
          >
            Search features to tag
          </button>
          {targetedFeatures.length ? (
            <div className="flex flex-wrap gap-2">
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
                    aria-label={`Remove ${feature.featureName}`}
                    className="rounded-full px-2 text-xs hover:bg-cyan-200/15"
                  >
                    x
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="rounded-[1.25rem] border border-dashed border-white/10 px-4 py-3 text-sm text-slate-400">
              Add feature tags to scope the bridge direction.
            </p>
          )}
        </div>

        <label htmlFor="aop-direction" className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
          Task direction
        </label>
        <textarea
          id="aop-direction"
          value={directionText}
          onChange={(event) => onDirectionTextChange(event.target.value)}
          placeholder="Describe the feature or system direction at a high level..."
          className="agent-chat-scrollbar min-h-28 min-w-0 rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onSubmitDirection}
            disabled={!canStart}
            className="w-fit rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            Send to bridge
          </button>
          {bridgeSession ? (
            <button
              type="button"
              onClick={onClearSession}
              className="w-fit rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-slate-200 hover:bg-white/5"
            >
              Clear session
            </button>
          ) : null}
        </div>
        {!acceptsWork ? (
          <p className="text-sm text-amber-200">
            The execution daemon is draining for restart. New work will resume after the restart completes or is cancelled.
          </p>
        ) : null}
        {submissionError ? <p className="text-sm text-rose-200">{submissionError}</p> : null}
      </section>

      {bridgeSession ? (
        <section className="grid gap-3 rounded-[1.5rem] border border-white/10 bg-black/25 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Bridge session</p>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
              {bridgeSession.phase}
            </span>
          </div>
          {bridgeSession.notes ? (
            <div className="rounded-[1.25rem] border border-white/10 bg-slate-900/50 px-4 py-3 text-sm text-slate-200 whitespace-pre-wrap">
              {bridgeSession.notes}
            </div>
          ) : null}
          {(bridgeSession.phase === "running" || bridgeSession.phase === "dispatching") ? (
            <p className="text-sm text-slate-400">
              {bridgeSession.phase === "dispatching"
                ? "Dispatching coding tasks…"
                : "Bridge agent is working…"}
            </p>
          ) : null}
          {activeQuestion ? (
            <BridgeQuestionnaire
              question={activeQuestion}
              otherAnswer={otherAnswer}
              onOtherAnswerChange={onOtherAnswerChange}
              onAnswer={onAnswerQuestion}
            />
          ) : null}
          {bridgeSession.answers.length > 0 ? (
            <div className="grid gap-2">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Answers so far</p>
              <ul className="grid gap-2 text-sm text-slate-300">
                {bridgeSession.answers.map((answer, index) => (
                  <li key={`${answer.question}-${index}`} className="rounded-xl border border-white/10 px-3 py-2">
                    <span className="text-slate-400">{answer.question}</span>
                    <span className="mt-1 block text-slate-100">{answer.answer}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {bridgeSession.proposedTasks.length > 0 ? (
            <TaskList tasks={bridgeSession.proposedTasks} />
          ) : null}
          {canDispatch ? (
            <button
              type="button"
              onClick={onDispatchTasks}
              className="w-fit rounded-full bg-emerald-300 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-200"
            >
              Dispatch {bridgeSession.proposedTasks.length} coding task{bridgeSession.proposedTasks.length === 1 ? "" : "s"}
            </button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function TaskList({ tasks }: { tasks: BridgeTask[] }) {
  return (
    <div className="grid gap-2">
      <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Proposed tasks</p>
      <ol className="grid gap-3">
        {tasks.map((task, index) => (
          <li key={`${task.title}-${index}`} className="rounded-[1.25rem] border border-emerald-300/20 bg-emerald-300/[0.05] px-4 py-3">
            <p className="text-sm font-semibold text-emerald-100">{index + 1}. {task.title}</p>
            <pre className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-200">{task.prompt}</pre>
          </li>
        ))}
      </ol>
    </div>
  );
}

function BridgeQuestionnaire({
  question,
  otherAnswer,
  onOtherAnswerChange,
  onAnswer,
}: {
  question: PlanningQuestion;
  otherAnswer: string;
  onOtherAnswerChange: (answer: string) => void;
  onAnswer: (answer: string) => void;
}) {
  function submitOtherAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const answer = otherAnswer.trim();
    if (!answer) return;
    onAnswer(answer);
    onOtherAnswerChange("");
  }

  return (
    <section className="grid gap-3 rounded-[1.25rem] border border-cyan-300/20 bg-cyan-300/[0.05] p-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-100">
        Bridge question
      </h3>
      <p className="text-sm text-slate-100">{question.question}</p>
      <div className="flex flex-wrap gap-2" aria-label="Answer choices">
        {question.options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onAnswer(option)}
            className="rounded-full border border-cyan-300/25 px-3 py-2 text-left text-xs text-cyan-100 transition hover:bg-cyan-300/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200"
          >
            {option}
          </button>
        ))}
      </div>
      <form onSubmit={submitOtherAnswer} className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="bridge-other-answer">Other answer</label>
        <input
          id="bridge-other-answer"
          value={otherAnswer}
          onChange={(event) => onOtherAnswerChange(event.target.value)}
          placeholder="Other — type your answer"
          className="min-w-0 flex-1 rounded-full border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
        />
        <button
          type="submit"
          disabled={!otherAnswer.trim()}
          className="rounded-full bg-cyan-300 px-4 py-2 text-xs font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Submit answer
        </button>
      </form>
    </section>
  );
}
