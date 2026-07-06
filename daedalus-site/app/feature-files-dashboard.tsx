"use client";

import { useEffect, useRef, useState } from "react";
import FeatureFileGraph from "./feature-file-graph";
import type { AgentChatExchange } from "@/lib/agent-chat-cache";
import type { AgentModelsConfig } from "@/lib/agent-models";
import type { FeatureFileProjects } from "@/lib/feature-file-cache";

type DashboardProps = {
  agentModels: AgentModelsConfig;
  pollIntervalMs: number;
  supabaseAnonKey: string;
  supabaseUrl: string;
};

const CLIENT_LOAD_FEATURE_FILES = "client_load_feature_files";
const DAEMON_RECEIVED_MESSAGE = "daemon_received_message";
const DAEMON_SENT_FEATURE_FILES = "daemon_sent_feature_files";
const DAEMON_SENT_RESPONSE = "daemon_sent_response";
const FEATURE_FILE_LOAD_PURPOSE = "feature_file_load";
const AGENT_PROMPT_PURPOSE = "agent_prompt";
const DEFAULT_PROJECT_DIRECTORY = "/Users/jameshollingsworth/Projects/daedalus";

type DevTab = "chat" | "ventures";

type VentureItem = {
  id: string;
  title: string;
  notes: string;
  isComplete: boolean;
};

export default function FeatureFilesDashboard({
  agentModels,
  pollIntervalMs,
  supabaseAnonKey,
  supabaseUrl,
}: DashboardProps) {
  const defaultModel = agentModels.codex.models[0];
  const [activeDevTab, setActiveDevTab] = useState<DevTab>("chat");
  const [isDevInterfaceCollapsed, setIsDevInterfaceCollapsed] = useState(false);
  const [isLoadingFeatureFiles, setIsLoadingFeatureFiles] = useState(false);
  const [isPlanningMode, setIsPlanningMode] = useState(false);
  const [message, setMessage] = useState("");
  const [agentPromptMessage, setAgentPromptMessage] = useState("");
  const [promptText, setPromptText] = useState("");
  const [promptStatus, setPromptStatus] = useState("");
  const [latestChat, setLatestChat] = useState<AgentChatExchange | null>(null);
  const [projects, setProjects] = useState<FeatureFileProjects | null>(null);
  const [selectedModelId, setSelectedModelId] = useState(defaultModel.id);
  const [selectedReasoning, setSelectedReasoning] = useState(defaultModel.default_reasoning);
  const [selectedProjectDirectory, setSelectedProjectDirectory] = useState(
    DEFAULT_PROJECT_DIRECTORY,
  );
  const [ventures, setVentures] = useState<VentureItem[]>([]);
  const [newVentureTitle, setNewVentureTitle] = useState("");
  const [editingVentureId, setEditingVentureId] = useState("");
  const [editingTitle, setEditingTitle] = useState("");
  const [editingNotes, setEditingNotes] = useState("");
  const [error, setError] = useState("");
  const latestLocalWriteStartedAt = useRef(0);
  const pendingPrompt = useRef("");

  useEffect(() => {
    let isMounted = true;

    async function pollMessage() {
      const pollStartedAt = Date.now();

      try {
        const nextMessage = await fetchCurrentMessage(
          supabaseUrl,
          supabaseAnonKey,
          FEATURE_FILE_LOAD_PURPOSE,
        );

        if (!isMounted) {
          return;
        }

        if (pollStartedAt < latestLocalWriteStartedAt.current) {
          return;
        }

        setError("");
        setMessage(nextMessage);
      } catch {
        if (!isMounted) {
          return;
        }

        setError("Unable to reach Supabase right now.");
      }
    }

    pollMessage();
    const intervalId = window.setInterval(pollMessage, pollIntervalMs);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [pollIntervalMs, supabaseAnonKey, supabaseUrl]);

  useEffect(() => {
    if (message !== DAEMON_SENT_FEATURE_FILES) {
      return;
    }

    async function loadProjects() {
      setIsLoadingFeatureFiles(true);
      const response = await fetch("/api/feature-files", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("feature-file payload request failed");
      }

      const body = await response.json();
      setProjects(body.projects);
      setIsLoadingFeatureFiles(false);
    }

    loadProjects().catch(() => {
      setIsLoadingFeatureFiles(false);
      setError("The daemon finished, but the feature-file payload was not available.");
    });
  }, [message]);

  useEffect(() => {
    const projectDirectories = Object.keys(projects ?? {});

    if (projectDirectories.length === 0) {
      return;
    }

    if (projectDirectories.includes(selectedProjectDirectory)) {
      return;
    }

    if (projectDirectories.includes(DEFAULT_PROJECT_DIRECTORY)) {
      setSelectedProjectDirectory(DEFAULT_PROJECT_DIRECTORY);
      return;
    }

    setSelectedProjectDirectory(projectDirectories[0]);
  }, [projects, selectedProjectDirectory]);

  useEffect(() => {
    let isMounted = true;

    async function pollAgentPromptMessage() {
      try {
        const nextMessage = await fetchCurrentMessage(
          supabaseUrl,
          supabaseAnonKey,
          AGENT_PROMPT_PURPOSE,
        );

        if (!isMounted) {
          return;
        }

        setAgentPromptMessage(nextMessage);

        if (nextMessage === DAEMON_RECEIVED_MESSAGE) {
          setPromptStatus("Daemon received message.");
          return;
        }

        if (nextMessage === DAEMON_SENT_RESPONSE) {
          setPromptStatus("Daemon sent response.");
        }
      } catch {
        return;
      }
    }

    pollAgentPromptMessage();
    const intervalId = window.setInterval(pollAgentPromptMessage, pollIntervalMs);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [pollIntervalMs, supabaseAnonKey, supabaseUrl]);

  useEffect(() => {
    let isMounted = true;

    async function pollAgentChat() {
      try {
        const nextChat = await fetchLatestAgentChat();

        if (!isMounted || !nextChat) {
          return;
        }

        if (pendingPrompt.current && nextChat.prompt !== pendingPrompt.current) {
          return;
        }

        setLatestChat(nextChat);

        if (pendingPrompt.current === nextChat.prompt) {
          pendingPrompt.current = "";
          setPromptStatus("Reply received.");
        }
      } catch {
        return;
      }
    }

    pollAgentChat();
    const intervalId = window.setInterval(pollAgentChat, pollIntervalMs);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [pollIntervalMs]);

  async function requestFeatureFiles() {
    setError("");
    setIsLoadingFeatureFiles(true);
    const writeStartedAt = Date.now();
    latestLocalWriteStartedAt.current = writeStartedAt;
    console.log("[feature-files] button clicked");

    try {
      const nextMessage = await updateMessage(
        supabaseUrl,
        supabaseAnonKey,
        FEATURE_FILE_LOAD_PURPOSE,
        CLIENT_LOAD_FEATURE_FILES,
      );
      console.log("[feature-files] write completed with message:", nextMessage);
      setMessage(nextMessage);
    } catch {
      console.error("[feature-files] write failed");
      setIsLoadingFeatureFiles(false);
      setError("Unable to write the load request to Supabase.");
    }
  }

  async function sendAgentPrompt() {
    if (!promptText.trim()) {
      return;
    }

    const nextPrompt = promptText.trim();
    const modelId = selectedModelId;
    const reasoning = selectedReasoning;
    const planningMode = isPlanningMode;
    setPromptStatus("");
    pendingPrompt.current = nextPrompt;
    setLatestChat({
      directory: selectedProjectDirectory,
      prompt: nextPrompt,
      reply: "",
      provider: "codex",
      model: modelId,
      reasoning,
      planningMode,
    });

    try {
      await updateMessage(
        supabaseUrl,
        supabaseAnonKey,
        AGENT_PROMPT_PURPOSE,
        JSON.stringify({
          directory: selectedProjectDirectory,
          provider: "codex",
          model: modelId,
          reasoning,
          planningMode,
          prompt: nextPrompt,
        }),
      );
      setPromptText("");
      setPromptStatus("Prompt sent. Waiting for daemon pickup.");
    } catch {
      pendingPrompt.current = "";
      setLatestChat(null);
      setPromptStatus("Unable to send the prompt right now.");
    }
  }

  const statusLabel = getStatusLabel(message);
  const projectEntries = Object.entries(projects ?? {});
  const selectedModel = agentModels.codex.models.find((model) => model.id === selectedModelId) ?? defaultModel;
  const reasoningOptions = selectedModel.reasoning;

  function selectModel(modelId: string) {
    const nextModel = agentModels.codex.models.find((model) => model.id === modelId) ?? defaultModel;
    setSelectedModelId(nextModel.id);
    setSelectedReasoning(nextModel.default_reasoning);
  }

  function addVenture() {
    const title = newVentureTitle.trim();

    if (!title) {
      return;
    }

    setVentures((currentVentures) => [
      {
        id: `${Date.now()}-${Math.random()}`,
        title,
        notes: "",
        isComplete: false,
      },
      ...currentVentures,
    ]);
    setNewVentureTitle("");
  }

  function startEditingVenture(venture: VentureItem) {
    setEditingVentureId(venture.id);
    setEditingTitle(venture.title);
    setEditingNotes(venture.notes);
  }

  function cancelEditingVenture() {
    setEditingVentureId("");
    setEditingTitle("");
    setEditingNotes("");
  }

  function saveVentureEdits() {
    const title = editingTitle.trim();

    if (!editingVentureId || !title) {
      return;
    }

    setVentures((currentVentures) =>
      currentVentures.map((venture) =>
        venture.id === editingVentureId
          ? {
              ...venture,
              title,
              notes: editingNotes.trim(),
            }
          : venture,
      ),
    );
    cancelEditingVenture();
  }

  function toggleVentureComplete(ventureId: string) {
    setVentures((currentVentures) =>
      currentVentures.map((venture) =>
        venture.id === ventureId
          ? { ...venture, isComplete: !venture.isComplete }
          : venture,
      ),
    );
  }

  function deleteVenture(ventureId: string) {
    setVentures((currentVentures) =>
      currentVentures.filter((venture) => venture.id !== ventureId),
    );

    if (editingVentureId === ventureId) {
      cancelEditingVenture();
    }
  }

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black text-slate-100">
      <FeatureFileGraph projects={projects ?? {}} />

      <div className="pointer-events-none absolute inset-0">
        <div className="pointer-events-auto absolute inset-x-4 top-4 flex justify-center">
          <div className="grid w-full max-w-5xl gap-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="min-w-[180px] rounded-[1.5rem] border border-white/10 bg-slate-950/82 p-4 shadow-[0_24px_80px_rgba(2,6,23,0.55)] backdrop-blur">
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                  Current message
                </p>
                <p className="mt-2 break-words font-mono text-sm text-slate-100">
                  {message || "(empty)"}
                </p>
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/82 p-4 shadow-[0_24px_80px_rgba(2,6,23,0.55)] backdrop-blur">
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                  Status
                </p>
                <p className="mt-2 text-xl font-semibold text-white">{statusLabel}</p>
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/82 p-4 shadow-[0_24px_80px_rgba(2,6,23,0.55)] backdrop-blur">
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                  Projects loaded
                </p>
                <p className="mt-2 text-xl font-semibold text-white">{projectEntries.length}</p>
              </div>
            </div>

            {error ? (
              <div className="rounded-[1.5rem] border border-rose-400/20 bg-rose-500/12 px-5 py-4 text-sm text-rose-100 shadow-[0_24px_80px_rgba(127,29,29,0.35)] backdrop-blur">
                {error}
              </div>
            ) : null}
          </div>
        </div>

        <div className="pointer-events-auto absolute left-4 top-32 bottom-6">
          {isDevInterfaceCollapsed ? (
            <button
              type="button"
              onClick={() => setIsDevInterfaceCollapsed(false)}
              className="rounded-full border border-white/10 bg-slate-950/82 px-5 py-3 text-sm font-semibold text-slate-100 shadow-[0_24px_80px_rgba(2,6,23,0.65)] backdrop-blur transition hover:bg-slate-900"
            >
              Open dev interface
            </button>
          ) : (
            <div className="flex h-full max-w-xl flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-slate-950/82 p-4 shadow-[0_24px_80px_rgba(2,6,23,0.65)] backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={requestFeatureFiles}
                  className="w-fit rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
                >
                  {isLoadingFeatureFiles ? "Reloading feature files..." : "Load feature files"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsDevInterfaceCollapsed(true)}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-300 transition hover:bg-white/10"
                >
                  Collapse
                </button>
              </div>

              <div className="mt-3 inline-flex w-fit rounded-full border border-white/10 bg-black/25 p-1">
                <button
                  type="button"
                  onClick={() => setActiveDevTab("chat")}
                  className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] transition ${
                    activeDevTab === "chat"
                      ? "bg-cyan-300 text-slate-950"
                      : "text-slate-300 hover:bg-white/10"
                  }`}
                >
                  Agent Chat
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDevTab("ventures")}
                  className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] transition ${
                    activeDevTab === "ventures"
                      ? "bg-cyan-300 text-slate-950"
                      : "text-slate-300 hover:bg-white/10"
                  }`}
                >
                  Ventures
                </button>
              </div>

              <div className="agent-chat-scrollbar mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
                {activeDevTab === "chat" ? (
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
                      onChange={(event) => setSelectedProjectDirectory(event.target.value)}
                      className="agent-chat-scrollbar rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none"
                    >
                      {projectEntries.length > 0 ? (
                        projectEntries.map(([projectDirectory]) => (
                          <option key={projectDirectory} value={projectDirectory}>
                            {projectDirectory}
                          </option>
                        ))
                      ) : (
                        <option value={DEFAULT_PROJECT_DIRECTORY}>
                          {DEFAULT_PROJECT_DIRECTORY}
                        </option>
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
                          onChange={(event) => selectModel(event.target.value)}
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
                          onChange={(event) => setSelectedReasoning(event.target.value)}
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
                        onChange={(event) => setIsPlanningMode(event.target.checked)}
                        className="h-4 w-4 accent-cyan-300"
                      />
                      Planning mode
                    </label>
                    <label
                      htmlFor="agent-prompt"
                      className="text-[11px] uppercase tracking-[0.28em] text-slate-400"
                    >
                      Agent prompt
                    </label>
                    <textarea
                      id="agent-prompt"
                      value={promptText}
                      onChange={(event) => setPromptText(event.target.value)}
                      placeholder="Describe the feature you want the daemon to create..."
                      className="agent-chat-scrollbar min-h-28 rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                    />
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={sendAgentPrompt}
                        disabled={!promptText.trim()}
                        className="rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                      >
                        Send prompt
                      </button>
                      <p className="text-sm text-slate-300">
                        {promptStatus ||
                          `The daemon will use ${selectedModelId} with ${selectedReasoning} reasoning.`}
                      </p>
                    </div>

                    {agentPromptMessage ? (
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                        Agent channel: {formatAgentPromptMessage(agentPromptMessage)}
                      </p>
                    ) : null}

                    {latestChat ? (
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
                ) : (
                  <div className="grid gap-4">
                    <div className="rounded-[1.5rem] border border-cyan-400/20 bg-cyan-400/8 p-4">
                      <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-200/80">
                        Ventures workspace
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-200">
                        Capture the next MVP moves here, then refine each Venture into a shared working card with the AI.
                      </p>
                    </div>

                    <div className="grid gap-3 rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                      <label
                        htmlFor="venture-title"
                        className="text-[11px] uppercase tracking-[0.28em] text-slate-400"
                      >
                        New Venture title
                      </label>
                      <input
                        id="venture-title"
                        type="text"
                        value={newVentureTitle}
                        onChange={(event) => setNewVentureTitle(event.target.value)}
                        placeholder="Add the next Venture to tackle..."
                        className="rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                      />
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={addVenture}
                          disabled={!newVentureTitle.trim()}
                          className="rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                        >
                          Add Venture
                        </button>
                        <p className="text-sm text-slate-300">
                          Titles are required. Notes can be added when you edit a card.
                        </p>
                      </div>
                    </div>

                    {ventures.length === 0 ? (
                      <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-slate-950/55 px-5 py-8 text-center">
                        <p className="text-base font-medium text-white">No Ventures yet.</p>
                        <p className="mt-2 text-sm leading-6 text-slate-400">
                          Start with a title, then use each card as a collaborative workspace for scope notes and status.
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-3">
                        {ventures.map((venture) => {
                          const isEditing = editingVentureId === venture.id;

                          return (
                            <div
                              key={venture.id}
                              className={`rounded-[1.5rem] border p-4 shadow-[0_20px_50px_rgba(2,6,23,0.3)] ${
                                venture.isComplete
                                  ? "border-emerald-400/25 bg-emerald-500/10"
                                  : "border-white/10 bg-slate-950/70"
                              }`}
                            >
                              {isEditing ? (
                                <div className="grid gap-3">
                                  <label
                                    htmlFor={`venture-edit-title-${venture.id}`}
                                    className="text-[11px] uppercase tracking-[0.28em] text-slate-400"
                                  >
                                    Venture title
                                  </label>
                                  <input
                                    id={`venture-edit-title-${venture.id}`}
                                    type="text"
                                    value={editingTitle}
                                    onChange={(event) => setEditingTitle(event.target.value)}
                                    className="rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none"
                                  />
                                  <label
                                    htmlFor={`venture-edit-notes-${venture.id}`}
                                    className="text-[11px] uppercase tracking-[0.28em] text-slate-400"
                                  >
                                    Notes
                                  </label>
                                  <textarea
                                    id={`venture-edit-notes-${venture.id}`}
                                    value={editingNotes}
                                    onChange={(event) => setEditingNotes(event.target.value)}
                                    placeholder="Add context, blockers, or next steps..."
                                    className="agent-chat-scrollbar min-h-24 rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                                  />
                                  <div className="flex flex-wrap items-center gap-3">
                                    <button
                                      type="button"
                                      onClick={saveVentureEdits}
                                      disabled={!editingTitle.trim()}
                                      className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                                    >
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      onClick={cancelEditingVenture}
                                      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="grid gap-4">
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="space-y-2">
                                      <p
                                        className={`text-base font-semibold ${
                                          venture.isComplete
                                            ? "text-emerald-100 line-through decoration-2"
                                            : "text-white"
                                        }`}
                                      >
                                        {venture.title}
                                      </p>
                                      <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                                        {venture.isComplete ? "Complete" : "In progress"}
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => toggleVentureComplete(venture.id)}
                                      className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] transition ${
                                        venture.isComplete
                                          ? "bg-emerald-300 text-emerald-950 hover:bg-emerald-200"
                                          : "bg-white/10 text-slate-200 hover:bg-white/15"
                                      }`}
                                    >
                                      {venture.isComplete ? "Mark active" : "Mark complete"}
                                    </button>
                                  </div>

                                  {venture.notes ? (
                                    <p className="whitespace-pre-wrap text-sm leading-6 text-slate-300">
                                      {venture.notes}
                                    </p>
                                  ) : (
                                    <p className="text-sm leading-6 text-slate-500">
                                      No notes yet. Open edit mode to add context for the next iteration.
                                    </p>
                                  )}

                                  <div className="flex flex-wrap items-center gap-3">
                                    <button
                                      type="button"
                                      onClick={() => startEditingVenture(venture)}
                                      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => deleteVenture(venture.id)}
                                      className="rounded-full border border-rose-400/20 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/15"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {projectEntries.length === 0 ? (
          <div className="pointer-events-none absolute inset-x-4 bottom-6 flex justify-center">
            <div className="max-w-2xl rounded-[1.75rem] border border-white/10 bg-slate-950/72 px-6 py-5 text-center shadow-[0_24px_80px_rgba(2,6,23,0.55)] backdrop-blur">
              <p className="text-lg font-medium text-white">
                No feature-file payload has been loaded yet.
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Send the load request, wait for the daemon to respond, and the
                full-screen graph will populate with feature nodes.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

async function fetchCurrentMessage(
  supabaseUrl: string,
  supabaseAnonKey: string,
  purpose: string,
) {
  console.log("[feature-files] reading current message from Supabase");
  const response = await fetch(
    `${supabaseUrl}/rest/v1/communications?select=message,purpose&purpose=eq.${purpose}&limit=1`,
    {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error("supabase message fetch failed");
  }

  const body = (await response.json()) as Array<{ message?: string }>;
  console.log("[feature-files] message read response:", body);

  if (body.length === 0) {
    console.log("[feature-files] current message is empty because no rows were returned");
    return "";
  }

  console.log("[feature-files] current message:", body[0].message ?? "");
  return body[0].message ?? "";
}

async function updateMessage(
  supabaseUrl: string,
  supabaseAnonKey: string,
  purpose: string,
  message: string,
) {
  console.log("[feature-files] attempting to write message:", purpose, message);
  const existingRows = await fetchCommunicationRows(
    supabaseUrl,
    supabaseAnonKey,
    purpose,
  );
  console.log("[feature-files] rows before write:", existingRows);

  if (existingRows.length === 0) {
    console.log("[feature-files] no communications row found, inserting one");
    const insertResponse = await fetch(`${supabaseUrl}/rest/v1/communications`, {
      method: "POST",
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message, purpose }),
    });

    if (!insertResponse.ok) {
      throw new Error("supabase message insert failed");
    }

    console.log("[feature-files] inserted message row:", message);
    return message;
  }

  console.log("[feature-files] patching existing communications row");
  const response = await fetch(`${supabaseUrl}/rest/v1/communications?purpose=eq.${purpose}`, {
    method: "PATCH",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, purpose }),
  });

  if (!response.ok) {
    throw new Error("supabase message update failed");
  }

  console.log("[feature-files] updated message row:", message);
  return message;
}

async function fetchCommunicationRows(
  supabaseUrl: string,
  supabaseAnonKey: string,
  purpose: string,
) {
  console.log("[feature-files] checking for existing communications rows");
  const response = await fetch(
    `${supabaseUrl}/rest/v1/communications?select=message,purpose&purpose=eq.${purpose}&limit=1`,
    {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error("supabase communication row fetch failed");
  }

  const rows = (await response.json()) as Array<{ message?: string }>;
  console.log("[feature-files] existing communications rows:", rows);
  return rows;
}

async function fetchLatestAgentChat() {
  const response = await fetch("/api/agent-chat", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("agent chat fetch failed");
  }

  const body = (await response.json()) as { chat: AgentChatExchange | null };
  return body.chat;
}

function getStatusLabel(message: string) {
  if (message === CLIENT_LOAD_FEATURE_FILES) {
    return "Request submitted";
  }

  if (message === DAEMON_RECEIVED_MESSAGE) {
    return "Loading feature files";
  }

  if (message === DAEMON_SENT_FEATURE_FILES) {
    return "Feature files ready";
  }

  return "Idle";
}

function formatAgentPromptMessage(message: string) {
  if (message === DAEMON_RECEIVED_MESSAGE) {
    return "Daemon received message";
  }

  if (message === DAEMON_SENT_RESPONSE) {
    return "Daemon sent response";
  }

  return "Prompt queued";
}
