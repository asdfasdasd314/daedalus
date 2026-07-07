"use client";

import { useEffect, useRef, useState } from "react";
import FeatureFileGraph from "./feature-file-graph";
import type {
  AgentChatExchange,
  TargetedFeature,
} from "@/lib/agent-chat-cache";
import type { AgentModelsConfig } from "@/lib/agent-models";
import type { FeatureFileProjects } from "@/lib/feature-file-cache";
import type { ParameterFileProjects } from "@/lib/parameter-file-cache";

type DashboardProps = {
  agentModels: AgentModelsConfig;
  pollIntervalMs: number;
  supabaseAnonKey: string;
  supabaseUrl: string;
};

const CLIENT_LOAD_FEATURE_FILES = "client_load_feature_files";
const CLIENT_LOAD_PARAMETER_FILES = "client_load_parameter_files";
const DAEMON_RECEIVED_MESSAGE = "daemon_received_message";
const DAEMON_SENT_FEATURE_FILES = "daemon_sent_feature_files";
const DAEMON_SENT_PARAMETER_FILES = "daemon_sent_parameter_files";
const DAEMON_SENT_RESPONSE = "daemon_sent_response";
const FEATURE_FILE_LOAD_PURPOSE = "feature_file_load";
const PARAMETER_FILE_LOAD_PURPOSE = "parameter_file_load";
const AGENT_PROMPT_PURPOSE = "agent_prompt";
const DEFAULT_PROJECT_DIRECTORY = "/Users/jameshollingsworth/Projects/daedalus";
const AGENT_PROMPT_QUEUE_STORAGE_KEY = "agent-prompt-queue-v1";
const AGENT_CHAT_STORAGE_KEY = "agent-chat-snapshot-v1";
const AGENT_PROMPT_TIMEOUT_MS = 5 * 60 * 1000;
const VENTURE_PROGRESS_STATES = ["idle", "in progress", "completed"] as const;

type DevTab = "chat" | "ventures";

type VentureProgressState = (typeof VENTURE_PROGRESS_STATES)[number];

type VentureRow = {
  created_at: string;
  details: string | null;
  id: string;
  project_directory: string | null;
  progress_state: VentureProgressState;
  venture_name: string;
};

type VentureItem = {
  createdAt: string;
  details: string | null;
  id: string;
  projectDirectory: string | null;
  progressState: VentureProgressState;
  ventureName: string;
};

type VentureUpdatePayload = {
  details?: string | null;
  project_directory?: string | null;
  progress_state?: VentureProgressState;
  venture_name?: string;
};

type AgentPromptQueueStatus =
  | "queued"
  | "sending"
  | "running"
  | "completed"
  | "failed"
  | "stalled";

type AgentPromptPayload = {
  promptId: string;
  directory: string;
  prompt: string;
  provider: string;
  model: string;
  reasoning: string;
  planningMode: boolean;
  targetedFeaturePaths: string[];
};

type AgentPromptQueueEntry = AgentPromptPayload & {
  status: AgentPromptQueueStatus;
  enqueuedAt: number;
  sentAt?: number;
  completedAt?: number;
  error?: string;
};

type ParsedAgentPromptRow = {
  promptId?: string;
  state?: string;
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
  const [isLoadingParameterFiles, setIsLoadingParameterFiles] = useState(false);
  const [isPlanningMode, setIsPlanningMode] = useState(false);
  const [message, setMessage] = useState("");
  const [parameterFileMessage, setParameterFileMessage] = useState("");
  const [agentPromptMessage, setAgentPromptMessage] = useState("");
  const [promptText, setPromptText] = useState("");
  const [promptStatus, setPromptStatus] = useState("");
  const [latestChat, setLatestChat] = useState<AgentChatExchange | null>(null);
  const [isAgentChatCleared, setIsAgentChatCleared] = useState(false);
  const [agentPromptQueue, setAgentPromptQueue] = useState<AgentPromptQueueEntry[]>([]);
  const [isAgentPromptQueueHydrated, setIsAgentPromptQueueHydrated] = useState(false);
  const [projects, setProjects] = useState<FeatureFileProjects | null>(null);
  const [parameterProjects, setParameterProjects] = useState<ParameterFileProjects | null>(null);
  const [selectedModelId, setSelectedModelId] = useState(defaultModel.id);
  const [selectedReasoning, setSelectedReasoning] = useState(defaultModel.default_reasoning);
  const [selectedProjectDirectory, setSelectedProjectDirectory] = useState(
    DEFAULT_PROJECT_DIRECTORY,
  );
  const [targetedFeatures, setTargetedFeatures] = useState<TargetedFeature[]>([]);
  const [isLoadingVentures, setIsLoadingVentures] = useState(false);
  const [isCreatingVenture, setIsCreatingVenture] = useState(false);
  const [ventures, setVentures] = useState<VentureItem[]>([]);
  const [newVentureName, setNewVentureName] = useState("");
  const [newVentureProjectDirectory, setNewVentureProjectDirectory] = useState(
    DEFAULT_PROJECT_DIRECTORY,
  );
  const [newVentureDetails, setNewVentureDetails] = useState("");
  const [editingVentureId, setEditingVentureId] = useState("");
  const [editingVentureDetails, setEditingVentureDetails] = useState("");
  const [editingVentureName, setEditingVentureName] = useState("");
  const [editingVentureProjectDirectory, setEditingVentureProjectDirectory] = useState("");
  const [savingVentureId, setSavingVentureId] = useState("");
  const [updatingProgressVentureId, setUpdatingProgressVentureId] = useState("");
  const [deletingVentureId, setDeletingVentureId] = useState("");
  const [ventureError, setVentureError] = useState("");
  const [error, setError] = useState("");
  const latestLocalWriteStartedAt = useRef(0);
  const activePromptId = useRef("");
  const clearedAgentChatPrompt = useRef("");
  const agentPromptQueueRef = useRef<AgentPromptQueueEntry[]>([]);
  const latestChatRef = useRef<AgentChatExchange | null>(null);

  useEffect(() => {
    agentPromptQueueRef.current = agentPromptQueue;
  }, [agentPromptQueue]);

  useEffect(() => {
    latestChatRef.current = latestChat;
  }, [latestChat]);

  useEffect(() => {
    try {
      const storedQueue = window.localStorage.getItem(AGENT_PROMPT_QUEUE_STORAGE_KEY);

      if (storedQueue) {
        const parsedQueue = JSON.parse(storedQueue) as AgentPromptQueueEntry[];
        setAgentPromptQueue(Array.isArray(parsedQueue) ? parsedQueue : []);
      }

      const storedChat = window.localStorage.getItem(AGENT_CHAT_STORAGE_KEY);

      if (storedChat) {
        const parsedChat = JSON.parse(storedChat) as AgentChatExchange;
        setLatestChat(parsedChat);
      }
    } catch {
      return;
    } finally {
      setIsAgentPromptQueueHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isAgentPromptQueueHydrated) {
      return;
    }

    window.localStorage.setItem(AGENT_PROMPT_QUEUE_STORAGE_KEY, JSON.stringify(agentPromptQueue));
  }, [agentPromptQueue, isAgentPromptQueueHydrated]);

  useEffect(() => {
    if (!isAgentPromptQueueHydrated) {
      return;
    }

    if (latestChat) {
      window.localStorage.setItem(AGENT_CHAT_STORAGE_KEY, JSON.stringify(latestChat));
      return;
    }

    window.localStorage.removeItem(AGENT_CHAT_STORAGE_KEY);
  }, [isAgentPromptQueueHydrated, latestChat]);

  useEffect(() => {
    let isMounted = true;

    async function pollMessage() {
      const pollStartedAt = Date.now();

      try {
        const nextMessage = await fetchCurrentMessage(FEATURE_FILE_LOAD_PURPOSE);

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
      setProjects(body.projects ?? {});
      setIsLoadingFeatureFiles(false);
    }

    loadProjects().catch(() => {
      setIsLoadingFeatureFiles(false);
      setError("The daemon finished, but the feature-file payload was not available.");
    });
  }, [message]);

  useEffect(() => {
    if (parameterFileMessage !== DAEMON_SENT_PARAMETER_FILES) {
      return;
    }

    async function loadParameterProjects() {
      setIsLoadingParameterFiles(true);
      const response = await fetch("/api/parameter-files", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("parameter-file payload request failed");
      }

      const body = await response.json();
      setParameterProjects(body.projects ?? {});
      setIsLoadingParameterFiles(false);
    }

    loadParameterProjects().catch(() => {
      setIsLoadingParameterFiles(false);
      setError("The daemon finished, but the parameter-file payload was not available.");
    });
  }, [parameterFileMessage]);

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
    setTargetedFeatures([]);
  }, [selectedProjectDirectory]);

  useEffect(() => {
    let isMounted = true;

    async function loadVentures() {
      setIsLoadingVentures(true);

      try {
        const nextVentures = await fetchVentures(supabaseUrl, supabaseAnonKey);

        if (!isMounted) {
          return;
        }

        setVentures(nextVentures);
        setVentureError("");
      } catch {
        if (!isMounted) {
          return;
        }

        setVentureError("Unable to load ventures from Supabase right now.");
      } finally {
        if (isMounted) {
          setIsLoadingVentures(false);
        }
      }
    }

    void loadVentures();

    return () => {
      isMounted = false;
    };
  }, [supabaseAnonKey, supabaseUrl]);

  useEffect(() => {
    let isMounted = true;

    async function pollAgentPromptMessage() {
      try {
        const nextMessage = await fetchCurrentMessage(AGENT_PROMPT_PURPOSE);

        if (!isMounted) {
          return;
        }

        setAgentPromptMessage(nextMessage);
        syncAgentPromptQueueFromRowMessage(nextMessage);
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

    async function pollParameterFileMessage() {
      const pollStartedAt = Date.now();

      try {
        const nextMessage = await fetchCurrentMessage(PARAMETER_FILE_LOAD_PURPOSE);

        if (!isMounted) {
          return;
        }

        if (pollStartedAt < latestLocalWriteStartedAt.current) {
          return;
        }

        setError("");
        setParameterFileMessage(nextMessage);
      } catch {
        if (!isMounted) {
          return;
        }

        setError("Unable to reach Supabase right now.");
      }
    }

    pollParameterFileMessage();
    const intervalId = window.setInterval(pollParameterFileMessage, pollIntervalMs);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [pollIntervalMs, supabaseAnonKey, supabaseUrl]);

  useEffect(() => {
    if (!isAgentPromptQueueHydrated) {
      return;
    }

    const activePrompt = agentPromptQueue.find((item) =>
      item.status === "sending" || item.status === "running",
    );

    if (activePrompt) {
      return;
    }

    const nextQueuedPrompt = agentPromptQueue.find((item) => item.status === "queued");

    if (!nextQueuedPrompt) {
      return;
    }

    void dispatchQueuedAgentPrompt(nextQueuedPrompt);
  }, [agentPromptQueue, isAgentPromptQueueHydrated]);

  useEffect(() => {
    if (!isAgentPromptQueueHydrated) {
      return;
    }

    let isMounted = true;

    async function pollAgentChat() {
      try {
        const nextChat = await fetchLatestAgentChat();

        if (!isMounted || !nextChat) {
          return;
        }

        if (
          clearedAgentChatPrompt.current &&
          nextChat.promptId === clearedAgentChatPrompt.current
        ) {
          return;
        }

        const currentPromptId = activePromptId.current;

        if (currentPromptId && nextChat.promptId !== currentPromptId) {
          return;
        }

        setLatestChat(nextChat);

        if (nextChat.promptId === currentPromptId) {
          setPromptStatus("Reply received.");
          finalizeQueuedAgentPrompt(nextChat.promptId, nextChat);
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
  }, [isAgentPromptQueueHydrated, pollIntervalMs]);

  useEffect(() => {
    if (!isAgentPromptQueueHydrated) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const activePrompt = agentPromptQueueRef.current.find((item) =>
        item.status === "sending" || item.status === "running",
      );

      if (!activePrompt?.sentAt) {
        return;
      }

      if (Date.now() - activePrompt.sentAt < AGENT_PROMPT_TIMEOUT_MS) {
        return;
      }

      setAgentPromptQueue((currentQueue) =>
        currentQueue.map((item) =>
          item.promptId === activePrompt.promptId
            ? {
                ...item,
                status: "stalled",
                error: "Timed out waiting for the daemon.",
              }
            : item,
        ),
      );
      setPromptStatus("Prompt stalled. Retry or abandon it.");
    }, Math.min(pollIntervalMs, 5000));

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isAgentPromptQueueHydrated, pollIntervalMs]);

  async function requestDevEnvironment() {
    setError("");
    setIsLoadingFeatureFiles(true);
    setIsLoadingParameterFiles(true);
    const writeStartedAt = Date.now();
    latestLocalWriteStartedAt.current = writeStartedAt;
    console.log("[dev-environment] button clicked");

    try {
      const [nextFeatureFileMessage, nextParameterFileMessage] = await Promise.all([
        updateMessage(FEATURE_FILE_LOAD_PURPOSE, CLIENT_LOAD_FEATURE_FILES),
        updateMessage(PARAMETER_FILE_LOAD_PURPOSE, CLIENT_LOAD_PARAMETER_FILES),
      ]);
      console.log("[dev-environment] writes completed with messages:", nextFeatureFileMessage, nextParameterFileMessage);
      setMessage(nextFeatureFileMessage);
      setParameterFileMessage(nextParameterFileMessage);
    } catch {
      console.error("[dev-environment] write failed");
      setIsLoadingFeatureFiles(false);
      setIsLoadingParameterFiles(false);
      setError("Unable to write the dev-environment load requests to Supabase.");
    }
  }

  async function sendAgentPrompt() {
    if (!promptText.trim()) {
      return;
    }

    const promptId = createPromptId();
    const nextPrompt = promptText.trim();
    const targetedFeaturePaths = targetedFeatures.map((feature) => feature.filePath);
    const modelId = selectedModelId;
    const reasoning = selectedReasoning;
    const planningMode = isPlanningMode;
    const nextPromptPayload: AgentPromptQueueEntry = {
      promptId,
      directory: selectedProjectDirectory,
      prompt: nextPrompt,
      provider: "codex",
      model: modelId,
      reasoning,
      planningMode,
      targetedFeaturePaths,
      status: "queued",
      enqueuedAt: Date.now(),
    };

    setPromptStatus(
      agentPromptQueueRef.current.some((item) => item.status === "sending" || item.status === "running")
        ? "Prompt queued locally behind the active run."
        : "Prompt queued locally.",
    );
    setPromptText("");
    setAgentPromptMessage("");
    setIsAgentChatCleared(false);
    clearedAgentChatPrompt.current = "";
    setAgentPromptQueue((currentQueue) => [...currentQueue, nextPromptPayload]);
  }

  function clearAgentChat() {
    clearedAgentChatPrompt.current = latestChat?.promptId ?? activePromptId.current;
    setLatestChat(null);
    setPromptStatus("");
    setAgentPromptMessage("");
    setIsAgentChatCleared(true);
  }

  function syncAgentPromptQueueFromRowMessage(message: string) {
    const parsedMessage = parseAgentPromptRowMessage(message);

    if (!parsedMessage) {
      return;
    }

    const activeQueueItem = agentPromptQueueRef.current[0];
    const activeQueuePromptId = activeQueueItem?.promptId ?? activePromptId.current;

    if (parsedMessage.promptId && activeQueuePromptId && parsedMessage.promptId !== activeQueuePromptId) {
      return;
    }

    if (parsedMessage.state === DAEMON_RECEIVED_MESSAGE) {
      const nextPromptId = parsedMessage.promptId ?? activeQueuePromptId;

      if (!nextPromptId) {
        return;
      }

      activePromptId.current = nextPromptId;
      setAgentPromptQueue((currentQueue) =>
        currentQueue.map((item) =>
          item.promptId === nextPromptId ? { ...item, status: "running" } : item,
        ),
      );
      setPromptStatus("Daemon received prompt.");
      return;
    }

    if (parsedMessage.state === DAEMON_SENT_RESPONSE) {
      const nextPromptId = parsedMessage.promptId ?? activeQueuePromptId;

      if (!nextPromptId) {
        return;
      }

      finalizeQueuedAgentPrompt(nextPromptId, latestChatRef.current);
    }
  }

  async function dispatchQueuedAgentPrompt(queueEntry: AgentPromptQueueEntry) {
    const activeQueueItem = agentPromptQueueRef.current[0];

    if (!activeQueueItem || activeQueueItem.promptId !== queueEntry.promptId || activeQueueItem.status !== "queued") {
      return;
    }

    activePromptId.current = queueEntry.promptId;
    setAgentPromptQueue((currentQueue) =>
      currentQueue.map((item) =>
        item.promptId === queueEntry.promptId
          ? {
              ...item,
              status: "sending",
              sentAt: Date.now(),
              error: undefined,
            }
          : item,
      ),
    );
    setLatestChat({
      promptId: queueEntry.promptId,
      directory: queueEntry.directory,
      prompt: queueEntry.prompt,
      reply: "",
      provider: queueEntry.provider,
      model: queueEntry.model,
      reasoning: queueEntry.reasoning,
      planningMode: queueEntry.planningMode,
      targetedFeaturePaths: queueEntry.targetedFeaturePaths,
    });
    setPromptStatus("Prompt sending to Supabase.");

    try {
      await updateMessage(
        AGENT_PROMPT_PURPOSE,
        JSON.stringify({
          promptId: queueEntry.promptId,
          directory: queueEntry.directory,
          provider: queueEntry.provider,
          model: queueEntry.model,
          reasoning: queueEntry.reasoning,
          planningMode: queueEntry.planningMode,
          targetedFeaturePaths: queueEntry.targetedFeaturePaths,
          prompt: queueEntry.prompt,
        }),
      );
      setPromptStatus("Prompt sent. Waiting for daemon pickup.");
    } catch {
      activePromptId.current = "";
      setPromptStatus("Unable to send the prompt right now.");
      setAgentPromptQueue((currentQueue) =>
        currentQueue.map((item) =>
          item.promptId === queueEntry.promptId
            ? {
                ...item,
                status: "failed",
                error: "Unable to send the prompt right now.",
              }
            : item,
        ),
      );
    }
  }

  function finalizeQueuedAgentPrompt(promptId: string, replyExchange?: AgentChatExchange | null) {
    if (!promptId) {
      return;
    }

    activePromptId.current = "";
    setAgentPromptQueue((currentQueue) =>
      currentQueue.filter((item) => item.promptId !== promptId),
    );

    if (replyExchange) {
      setLatestChat(replyExchange);
    }

    setPromptStatus("Reply received.");
  }

  function retryQueuedAgentPrompt(promptId: string) {
    setAgentPromptQueue((currentQueue) =>
      currentQueue.map((item) =>
        item.promptId === promptId
          ? {
              ...item,
              status: "queued",
              error: undefined,
              sentAt: undefined,
            }
          : item,
      ),
    );
    setPromptStatus("Retrying the stalled prompt.");
  }

  function abandonQueuedAgentPrompt(promptId: string) {
    setAgentPromptQueue((currentQueue) =>
      currentQueue.filter((item) => item.promptId !== promptId),
    );

    if (activePromptId.current === promptId) {
      activePromptId.current = "";
    }

    if (latestChatRef.current?.promptId === promptId) {
      setLatestChat(null);
    }

    setPromptStatus("Prompt abandoned.");
  }

  const statusLabel = getStatusLabel(
    message,
    parameterFileMessage,
    projects,
    parameterProjects,
    isLoadingFeatureFiles,
    isLoadingParameterFiles,
  );
  const currentMessage = formatDevEnvironmentMessage(message, parameterFileMessage);
  const projectEntries = Object.entries(projects ?? {});
  const selectedModel = agentModels.codex.models.find((model) => model.id === selectedModelId) ?? defaultModel;
  const reasoningOptions = selectedModel.reasoning;
  const currentPromptQueueItem = agentPromptQueue[0] ?? null;
  const promptQueueStatusText = promptStatus || getAgentPromptQueueStatusText(agentPromptQueue);
  const isLoadingDevEnvironment = isLoadingFeatureFiles || isLoadingParameterFiles;

  function selectModel(modelId: string) {
    const nextModel = agentModels.codex.models.find((model) => model.id === modelId) ?? defaultModel;
    setSelectedModelId(nextModel.id);
    setSelectedReasoning(nextModel.default_reasoning);
  }

  function addTargetedFeature(feature: TargetedFeature) {
    setTargetedFeatures((currentFeatures) => {
      if (currentFeatures.some((currentFeature) => currentFeature.filePath === feature.filePath)) {
        return currentFeatures;
      }

      return [...currentFeatures, feature];
    });
  }

  function removeTargetedFeature(filePath: string) {
    setTargetedFeatures((currentFeatures) =>
      currentFeatures.filter((feature) => feature.filePath !== filePath),
    );
  }

  async function addVenture() {
    const details = newVentureDetails.trim();
    const ventureName = newVentureName.trim();
    const projectDirectory = newVentureProjectDirectory.trim();

    if (!ventureName || isCreatingVenture) {
      return;
    }

    setIsCreatingVenture(true);
    setVentureError("");

    try {
      const createdVenture = await createVenture(
        supabaseUrl,
        supabaseAnonKey,
        ventureName,
        details || null,
        projectDirectory || null,
      );
      setVentures((currentVentures) => [createdVenture, ...currentVentures]);
      setNewVentureDetails("");
      setNewVentureName("");
      setNewVentureProjectDirectory(selectedProjectDirectory);
    } catch {
      setVentureError("Unable to create the venture right now.");
    } finally {
      setIsCreatingVenture(false);
    }
  }

  function startEditingVenture(venture: VentureItem) {
    setEditingVentureDetails(venture.details ?? "");
    setEditingVentureId(venture.id);
    setEditingVentureName(venture.ventureName);
    setEditingVentureProjectDirectory(venture.projectDirectory ?? "");
  }

  function cancelEditingVenture() {
    setEditingVentureDetails("");
    setEditingVentureId("");
    setEditingVentureName("");
    setEditingVentureProjectDirectory("");
  }

  async function saveVentureEdits() {
    const details = editingVentureDetails.trim();
    const ventureName = editingVentureName.trim();
    const projectDirectory = editingVentureProjectDirectory.trim();

    if (!editingVentureId || !ventureName || savingVentureId) {
      return;
    }

    setSavingVentureId(editingVentureId);
    setVentureError("");

    try {
      const updatedVenture = await updateVenture(
        supabaseUrl,
        supabaseAnonKey,
        editingVentureId,
        {
          details: details || null,
          project_directory: projectDirectory || null,
          venture_name: ventureName,
        },
      );
      setVentures((currentVentures) =>
        currentVentures.map((venture) =>
          venture.id === updatedVenture.id ? updatedVenture : venture,
        ),
      );
      cancelEditingVenture();
    } catch {
      setVentureError("Unable to rename the venture right now.");
    } finally {
      setSavingVentureId("");
    }
  }

  async function updateVentureProgressState(
    ventureId: string,
    progressState: VentureProgressState,
  ) {
    if (updatingProgressVentureId) {
      return;
    }

    setUpdatingProgressVentureId(ventureId);
    setVentureError("");

    try {
      const updatedVenture = await updateVenture(
        supabaseUrl,
        supabaseAnonKey,
        ventureId,
        { progress_state: progressState },
      );
      setVentures((currentVentures) =>
        currentVentures.map((venture) =>
          venture.id === updatedVenture.id ? updatedVenture : venture,
        ),
      );
    } catch {
      setVentureError("Unable to update the venture status right now.");
    } finally {
      setUpdatingProgressVentureId("");
    }
  }

  async function deleteVenture(ventureId: string) {
    if (deletingVentureId) {
      return;
    }

    setDeletingVentureId(ventureId);
    setVentureError("");

    try {
      await deleteVentureRow(supabaseUrl, supabaseAnonKey, ventureId);
      setVentures((currentVentures) =>
        currentVentures.filter((venture) => venture.id !== ventureId),
      );

      if (editingVentureId === ventureId) {
        cancelEditingVenture();
      }
    } catch {
      setVentureError("Unable to delete the venture right now.");
    } finally {
      setDeletingVentureId("");
    }
  }

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black text-slate-100">
      <FeatureFileGraph
        projects={projects ?? {}}
        parameterProjects={parameterProjects ?? {}}
        selectedProjectDirectory={selectedProjectDirectory}
        targetedFeatures={targetedFeatures}
        onAddTargetedFeature={addTargetedFeature}
      />

      <div className="pointer-events-none absolute inset-0">
        <div className="pointer-events-auto absolute inset-x-4 top-4 flex justify-center">
          <div className="grid w-full max-w-5xl gap-3">
            <div className="flex flex-wrap justify-center gap-3">
              <div className="min-w-[180px] max-w-xl flex-1 rounded-[1.5rem] border border-white/10 bg-slate-950/82 p-4 shadow-[0_24px_80px_rgba(2,6,23,0.55)] backdrop-blur sm:flex-none sm:w-[30rem]">
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                  Current message
                </p>
                <p className="mt-2 whitespace-pre-wrap break-words font-mono text-sm text-slate-100">
                  {currentMessage}
                </p>
              </div>

              <div className="min-w-[180px] rounded-[1.5rem] border border-white/10 bg-slate-950/82 p-4 shadow-[0_24px_80px_rgba(2,6,23,0.55)] backdrop-blur sm:w-64">
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                  Status
                </p>
                <p className="mt-2 text-xl font-semibold text-white">{statusLabel}</p>
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
                  onClick={requestDevEnvironment}
                  className="w-fit rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
                >
                  {isLoadingDevEnvironment ? "Reloading dev environment..." : "Load dev environment"}
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
                    <div className="grid gap-2">
                      <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                        Targeted Features
                      </p>
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
                                onClick={() => removeTargetedFeature(feature.filePath)}
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
                          Add feature files from the graph to scope the next prompt.
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
                      <button
                        type="button"
                        onClick={clearAgentChat}
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
                          onClick={() => retryQueuedAgentPrompt(currentPromptQueueItem.promptId)}
                          className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-300/20"
                        >
                          Retry prompt
                        </button>
                        <button
                          type="button"
                          onClick={() => abandonQueuedAgentPrompt(currentPromptQueueItem.promptId)}
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
                ) : (
                  <div className="grid gap-4">
                    <div className="rounded-[1.5rem] border border-cyan-400/20 bg-cyan-400/8 p-4">
                      <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-200/80">
                        Ventures workspace
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-200">
                        Load ventures from Supabase, then track each one by name and progress state inside the shared workspace.
                      </p>
                    </div>

                    <div className="grid gap-3 rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
                      <label
                        htmlFor="venture-name"
                        className="text-[11px] uppercase tracking-[0.28em] text-slate-400"
                      >
                        New venture name
                      </label>
                      <input
                        id="venture-name"
                        type="text"
                        value={newVentureName}
                        onChange={(event) => setNewVentureName(event.target.value)}
                        placeholder="Add the next venture to track..."
                        className="rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                      />
                      <label
                        htmlFor="venture-project"
                        className="text-[11px] uppercase tracking-[0.28em] text-slate-400"
                      >
                        Project directory
                      </label>
                      <input
                        id="venture-project"
                        type="text"
                        value={newVentureProjectDirectory}
                        onChange={(event) => setNewVentureProjectDirectory(event.target.value)}
                        placeholder="Tag this venture to a project directory..."
                        className="rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                      />
                      <label
                        htmlFor="venture-details"
                        className="text-[11px] uppercase tracking-[0.28em] text-slate-400"
                      >
                        Details
                      </label>
                      <textarea
                        id="venture-details"
                        value={newVentureDetails}
                        onChange={(event) => setNewVentureDetails(event.target.value)}
                        placeholder="Add a few details about this venture..."
                        className="agent-chat-scrollbar min-h-24 rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                      />
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            void addVenture();
                          }}
                          disabled={!newVentureName.trim() || isCreatingVenture}
                          className="rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                        >
                          {isCreatingVenture ? "Saving..." : "Add Venture"}
                        </button>
                        <p className="text-sm text-slate-300">
                          Venture names are required. Project tagging and details are optional. New rows start in the idle state.
                        </p>
                      </div>
                    </div>

                    {ventureError ? (
                      <div className="rounded-[1.5rem] border border-rose-400/20 bg-rose-500/12 px-5 py-4 text-sm text-rose-100">
                        {ventureError}
                      </div>
                    ) : null}

                    {isLoadingVentures && ventures.length === 0 ? (
                      <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/55 px-5 py-8 text-center">
                        <p className="text-base font-medium text-white">Loading ventures...</p>
                        <p className="mt-2 text-sm leading-6 text-slate-400">
                          Pulling the current venture list from Supabase now.
                        </p>
                      </div>
                    ) : ventures.length === 0 ? (
                      <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-slate-950/55 px-5 py-8 text-center">
                        <p className="text-base font-medium text-white">No Ventures yet.</p>
                        <p className="mt-2 text-sm leading-6 text-slate-400">
                          Add a venture name to create the first tracked row in Supabase.
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-3">
                        {ventures.map((venture) => {
                          const isEditing = editingVentureId === venture.id;

                          return (
                            <div
                              key={venture.id}
                              className={`rounded-[1.5rem] border p-4 shadow-[0_20px_50px_rgba(2,6,23,0.3)] ${getVentureCardClassName(venture.progressState)}`}
                            >
                              {isEditing ? (
                                <div className="grid gap-3">
                                  <label
                                    htmlFor={`venture-edit-name-${venture.id}`}
                                    className="text-[11px] uppercase tracking-[0.28em] text-slate-400"
                                  >
                                    Venture name
                                  </label>
                                  <input
                                    id={`venture-edit-name-${venture.id}`}
                                    type="text"
                                    value={editingVentureName}
                                    onChange={(event) => setEditingVentureName(event.target.value)}
                                    className="rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none"
                                  />
                                  <label
                                    htmlFor={`venture-edit-project-${venture.id}`}
                                    className="text-[11px] uppercase tracking-[0.28em] text-slate-400"
                                  >
                                    Project directory
                                  </label>
                                  <input
                                    id={`venture-edit-project-${venture.id}`}
                                    type="text"
                                    value={editingVentureProjectDirectory}
                                    onChange={(event) =>
                                      setEditingVentureProjectDirectory(event.target.value)
                                    }
                                    className="rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none"
                                  />
                                  <label
                                    htmlFor={`venture-edit-details-${venture.id}`}
                                    className="text-[11px] uppercase tracking-[0.28em] text-slate-400"
                                  >
                                    Details
                                  </label>
                                  <textarea
                                    id={`venture-edit-details-${venture.id}`}
                                    value={editingVentureDetails}
                                    onChange={(event) => setEditingVentureDetails(event.target.value)}
                                    className="agent-chat-scrollbar min-h-24 rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none"
                                  />
                                  <div className="flex flex-wrap items-center gap-3">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void saveVentureEdits();
                                      }}
                                      disabled={!editingVentureName.trim() || savingVentureId === venture.id}
                                      className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                                    >
                                      {savingVentureId === venture.id ? "Saving..." : "Save"}
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
                                          venture.progressState === "completed"
                                            ? "text-emerald-100 line-through decoration-2"
                                            : "text-white"
                                        }`}
                                      >
                                        {venture.ventureName}
                                      </p>
                                      <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                                        {formatVentureProgressState(venture.progressState)} • Created{" "}
                                        {formatVentureCreatedAt(venture.createdAt)}
                                      </p>
                                    </div>
                                    <div className="grid gap-2">
                                      <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                                        Project
                                      </p>
                                      <p className="break-all rounded-full border border-white/10 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
                                        {venture.projectDirectory || "No project tagged"}
                                      </p>
                                    </div>
                                    <div className="grid gap-2">
                                      <label
                                        htmlFor={`venture-progress-${venture.id}`}
                                        className="text-[11px] uppercase tracking-[0.24em] text-slate-500"
                                      >
                                        Progress state
                                      </label>
                                      <select
                                        id={`venture-progress-${venture.id}`}
                                        value={venture.progressState}
                                        onChange={(event) => {
                                          void updateVentureProgressState(
                                            venture.id,
                                            event.target.value as VentureProgressState,
                                          );
                                        }}
                                        disabled={updatingProgressVentureId === venture.id}
                                        className="agent-chat-scrollbar rounded-full border border-white/10 bg-slate-900/80 px-4 py-2 text-sm text-slate-100 outline-none disabled:cursor-not-allowed disabled:bg-slate-800"
                                      >
                                        {VENTURE_PROGRESS_STATES.map((progressState) => (
                                          <option key={progressState} value={progressState}>
                                            {formatVentureProgressState(progressState)}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>

                                  {venture.details ? (
                                    <div className="grid gap-2">
                                      <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                                        Details
                                      </p>
                                      <div className="whitespace-pre-wrap rounded-[1.25rem] border border-white/10 bg-slate-900/55 px-4 py-3 text-sm leading-6 text-slate-200">
                                        {venture.details}
                                      </div>
                                    </div>
                                  ) : null}

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
                                      onClick={() => {
                                        void deleteVenture(venture.id);
                                      }}
                                      disabled={deletingVentureId === venture.id}
                                      className="rounded-full border border-rose-400/20 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/15"
                                    >
                                      {deletingVentureId === venture.id ? "Deleting..." : "Delete"}
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
                No dev-environment payload has been loaded yet.
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Send the load request, wait for the daemon to respond, and the
                full-screen graph will populate with feature nodes and paired parameter context.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

async function fetchCurrentMessage(
  purpose: string,
) {
  console.log("[feature-files] reading current message from local communications route");
  const response = await fetch(`/api/communications?purpose=${encodeURIComponent(purpose)}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("communications message fetch failed");
  }

  const body = (await response.json()) as { message?: string };
  console.log("[feature-files] message read response:", body);

  console.log("[feature-files] current message:", body.message ?? "");
  return body.message ?? "";
}

async function updateMessage(
  purpose: string,
  message: string,
) {
  console.log("[feature-files] attempting to write message:", purpose, message);
  const response = await fetch("/api/communications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, purpose }),
  });

  if (!response.ok) {
    throw new Error("communications message update failed");
  }

  const body = (await response.json()) as { message?: string };
  console.log("[feature-files] updated message row:", body.message ?? message);
  return body.message ?? message;
}

async function fetchVentures(
  supabaseUrl: string,
  supabaseAnonKey: string,
) {
  const url = new URL("/rest/v1/ventures", supabaseUrl);
  url.searchParams.set(
    "select",
    "id,created_at,details,project_directory,progress_state,venture_name",
  );
  url.searchParams.set("order", "created_at.desc");

  const response = await fetch(url, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("supabase ventures fetch failed");
  }

  const rows = (await response.json()) as VentureRow[];
  return rows.map(mapVentureRowToItem);
}

async function createVenture(
  supabaseUrl: string,
  supabaseAnonKey: string,
  ventureName: string,
  details: string | null,
  projectDirectory: string | null,
) {
  const url = new URL("/rest/v1/ventures", supabaseUrl);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      details,
      project_directory: projectDirectory,
      venture_name: ventureName,
      progress_state: "idle",
    }),
  });

  if (!response.ok) {
    throw new Error("supabase venture insert failed");
  }

  const rows = (await response.json()) as VentureRow[];
  const createdRow = rows[0];

  if (!createdRow) {
    throw new Error("supabase venture insert returned no row");
  }

  return mapVentureRowToItem(createdRow);
}

async function updateVenture(
  supabaseUrl: string,
  supabaseAnonKey: string,
  ventureId: string,
  updates: VentureUpdatePayload,
) {
  const url = new URL("/rest/v1/ventures", supabaseUrl);
  url.searchParams.set("id", `eq.${ventureId}`);

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    throw new Error("supabase venture update failed");
  }

  const rows = (await response.json()) as VentureRow[];
  const updatedRow = rows[0];

  if (!updatedRow) {
    throw new Error("supabase venture update returned no row");
  }

  return mapVentureRowToItem(updatedRow);
}

async function deleteVentureRow(
  supabaseUrl: string,
  supabaseAnonKey: string,
  ventureId: string,
) {
  const url = new URL("/rest/v1/ventures", supabaseUrl);
  url.searchParams.set("id", `eq.${ventureId}`);

  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
  });

  if (!response.ok) {
    throw new Error("supabase venture delete failed");
  }
}

function createPromptId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random()}`;
}

function parseAgentPromptRowMessage(message: string): ParsedAgentPromptRow | null {
  const trimmedMessage = message.trim();

  if (!trimmedMessage) {
    return null;
  }

  if (trimmedMessage === DAEMON_RECEIVED_MESSAGE || trimmedMessage === DAEMON_SENT_RESPONSE) {
    return {
      state: trimmedMessage,
    };
  }

  try {
    const parsedMessage = JSON.parse(trimmedMessage) as Partial<ParsedAgentPromptRow>;

    if (typeof parsedMessage !== "object" || parsedMessage === null) {
      return null;
    }

    return {
      promptId: typeof parsedMessage.promptId === "string" ? parsedMessage.promptId : undefined,
      state: typeof parsedMessage.state === "string" ? parsedMessage.state : undefined,
    };
  } catch {
    return null;
  }
}

function getAgentPromptQueueStatusText(queue: AgentPromptQueueEntry[]) {
  const activePrompt = queue.find((item) => item.status === "sending" || item.status === "running");

  if (activePrompt) {
    if (activePrompt.status === "sending") {
      return "Prompt sending to Supabase.";
    }

    return "Daemon is running the current prompt.";
  }

  const stalledPrompt = queue[0];

  if (stalledPrompt?.status === "failed") {
    return "Prompt failed. Retry or abandon it.";
  }

  if (stalledPrompt?.status === "stalled") {
    return "Prompt stalled. Retry or abandon it.";
  }

  const queuedCount = queue.filter((item) => item.status === "queued").length;

  if (queuedCount === 1) {
    return "1 prompt queued locally.";
  }

  if (queuedCount > 1) {
    return `${queuedCount} prompts queued locally.`;
  }

  return "";
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

function getStatusLabel(
  featureFileMessage: string,
  parameterFileMessage: string,
  featureProjects: FeatureFileProjects | null,
  parameterProjects: ParameterFileProjects | null,
  isLoadingFeatureFiles: boolean,
  isLoadingParameterFiles: boolean,
) {
  const isSubmittingRequest =
    featureFileMessage === CLIENT_LOAD_FEATURE_FILES ||
    parameterFileMessage === CLIENT_LOAD_PARAMETER_FILES;
  const isDaemonLoading =
    featureFileMessage === DAEMON_RECEIVED_MESSAGE ||
    parameterFileMessage === DAEMON_RECEIVED_MESSAGE;
  const isDevEnvironmentReady =
    featureFileMessage === DAEMON_SENT_FEATURE_FILES &&
    parameterFileMessage === DAEMON_SENT_PARAMETER_FILES &&
    featureProjects !== null &&
    parameterProjects !== null;

  if (isDevEnvironmentReady) {
    return "Dev environment ready";
  }

  if (isLoadingFeatureFiles || isLoadingParameterFiles || isDaemonLoading) {
    return "Loading dev environment";
  }

  if (isSubmittingRequest) {
    return "Request submitted";
  }

  return "Idle";
}

function formatDevEnvironmentMessage(
  featureFileMessage: string,
  parameterFileMessage: string,
) {
  const nextFeatureFileMessage = featureFileMessage || "(empty)";
  const nextParameterFileMessage = parameterFileMessage || "(empty)";

  return [
    `Feature files: ${nextFeatureFileMessage}`,
    `Parameter files: ${nextParameterFileMessage}`,
  ].join("\n");
}

function formatAgentPromptMessage(message: string) {
  const parsedMessage = parseAgentPromptRowMessage(message);

  if (!parsedMessage) {
    return "Prompt queued";
  }

  if (parsedMessage.state === DAEMON_RECEIVED_MESSAGE) {
    return parsedMessage.promptId ? `Daemon received prompt ${parsedMessage.promptId}` : "Daemon received prompt";
  }

  if (parsedMessage.state === DAEMON_SENT_RESPONSE) {
    return parsedMessage.promptId ? `Daemon sent response for ${parsedMessage.promptId}` : "Daemon sent response";
  }

  return parsedMessage.promptId ? `Prompt queued ${parsedMessage.promptId}` : "Prompt queued";
}

function mapVentureRowToItem(row: VentureRow): VentureItem {
  return {
    createdAt: row.created_at,
    details: row.details,
    id: row.id,
    projectDirectory: row.project_directory,
    progressState: row.progress_state,
    ventureName: row.venture_name,
  };
}

function formatVentureProgressState(progressState: VentureProgressState) {
  if (progressState === "in progress") {
    return "In progress";
  }

  if (progressState === "completed") {
    return "Completed";
  }

  return "Idle";
}

function formatVentureCreatedAt(createdAt: string) {
  const createdDate = new Date(createdAt);

  if (Number.isNaN(createdDate.getTime())) {
    return "time unavailable";
  }

  return createdDate.toLocaleString();
}

function getVentureCardClassName(progressState: VentureProgressState) {
  if (progressState === "completed") {
    return "border-emerald-400/25 bg-emerald-500/10";
  }

  if (progressState === "in progress") {
    return "border-cyan-400/25 bg-cyan-500/10";
  }

  return "border-white/10 bg-slate-950/70";
}
