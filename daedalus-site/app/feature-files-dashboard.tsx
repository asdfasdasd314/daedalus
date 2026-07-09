"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient, type Session } from "@supabase/supabase-js";
import AgentSessionPanel from "./agent-session-panel";
import FeatureFileGraph, {
  type FeatureGraphSelection,
} from "./feature-file-graph";
import ParameterVariableSelector from "./parameter-variable-selector";
import type {
  AgentChatExchange,
  TargetedFeature,
} from "@/lib/agent-chat-cache";
import type { AgentModelsConfig } from "@/lib/agent-models";
import type { FeatureFileProjects } from "@/lib/feature-file-cache";
import type {
  ParameterFileProjects,
  ParameterFileRecord,
} from "@/lib/parameter-file-cache";
import {
  getFeatureOptionsForProject,
  getFeatureTagsForPaths,
  getParameterFilePathForFeature,
  normalizeFeatureFilePath,
  normalizeParameterFilePath,
} from "./feature-workspace-utils";

type DashboardProps = {
  agentModels: AgentModelsConfig;
  pollIntervalMs: number;
  supabasePublishableKey: string;
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
const PARAMETER_FILE_UPDATE_PURPOSE = "parameter_file_update";
const PARAMETER_FILE_UPDATE_COMMAND = "parameter_file_update";
const AGENT_PROMPT_PURPOSE = "agent_prompt";
const FEATURE_FILES_PAYLOAD_KIND = "feature_files";
const PARAMETER_FILES_PAYLOAD_KIND = "parameter_files";
const AGENT_CHAT_PAYLOAD_KIND = "agent_chat";
const DEFAULT_PROJECT_DIRECTORY = "/Users/jameshollingsworth/Projects/daedalus";
const AGENT_PROMPT_QUEUE_STORAGE_KEY = "agent-prompt-queue-v1";
const AGENT_CHAT_STORAGE_KEY = "agent-chat-snapshot-v1";
const AGENT_PROMPT_TIMEOUT_MS = 5 * 60 * 1000;
const VENTURE_PROGRESS_STATES = ["idle", "in progress", "completed"] as const;

type AuthMode = "sign-in" | "sign-up";
type PrimaryOverlay = "feature-detail" | "new-feature" | null;
type FeatureDetailTab = "chat" | "info" | "params";
type VentureProgressState = (typeof VENTURE_PROGRESS_STATES)[number];

type VentureRow = {
  created_at: string;
  details: string | null;
  feature_file_paths: string[] | null;
  id: string;
  project_directory: string | null;
  progress_state: VentureProgressState;
  user_id: string;
  venture_name: string;
};

type VentureItem = {
  createdAt: string;
  details: string | null;
  featureFilePaths: string[];
  id: string;
  projectDirectory: string | null;
  progressState: VentureProgressState;
  ventureName: string;
};

type VentureUpdatePayload = {
  details?: string | null;
  feature_file_paths?: string[];
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

type DaemonPayloadRow<TPayload> = {
  payload: TPayload;
};

type ParameterUpdateRequest = {
  parameterFilePath: string;
  projectPath: string;
  value: string;
  variableName: string;
};

type SelectedFeatureSession = {
  featureName: string;
  filePath: string;
  projectPath: string;
};

export default function FeatureFilesDashboard({
  agentModels,
  pollIntervalMs,
  supabasePublishableKey,
  supabaseUrl,
}: DashboardProps) {
  const [supabase] = useState(() =>
    createClient(supabaseUrl, supabasePublishableKey),
  );
  const [authMode, setAuthMode] = useState<AuthMode>("sign-in");
  const [authEmail, setAuthEmail] = useState("");
  const [authError, setAuthError] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authStatus, setAuthStatus] = useState<
    "checking" | "ready" | "submitting"
  >("checking");
  const [session, setSession] = useState<Session | null>(null);
  const defaultModel = agentModels.codex.models[0];
  const [isLoadingFeatureFiles, setIsLoadingFeatureFiles] = useState(false);
  const [isLoadingParameterFiles, setIsLoadingParameterFiles] = useState(false);
  const [isPlanningMode, setIsPlanningMode] = useState(false);
  const [message, setMessage] = useState("");
  const [parameterFileMessage, setParameterFileMessage] = useState("");
  const [agentPromptMessage, setAgentPromptMessage] = useState("");
  const [parameterUpdateMessage, setParameterUpdateMessage] = useState("");
  const [promptText, setPromptText] = useState("");
  const [promptStatus, setPromptStatus] = useState("");
  const [latestChat, setLatestChat] = useState<AgentChatExchange | null>(null);
  const [isAgentChatCleared, setIsAgentChatCleared] = useState(false);
  const [agentPromptQueue, setAgentPromptQueue] = useState<
    AgentPromptQueueEntry[]
  >([]);
  const [isAgentPromptQueueHydrated, setIsAgentPromptQueueHydrated] =
    useState(false);
  const [projects, setProjects] = useState<FeatureFileProjects | null>(null);
  const [parameterProjects, setParameterProjects] =
    useState<ParameterFileProjects | null>(null);
  const [selectedModelId, setSelectedModelId] = useState(defaultModel.id);
  const [selectedReasoning, setSelectedReasoning] = useState(
    defaultModel.default_reasoning,
  );
  const [selectedProjectDirectory, setSelectedProjectDirectory] = useState(
    DEFAULT_PROJECT_DIRECTORY,
  );
  const [targetedFeatures, setTargetedFeatures] = useState<TargetedFeature[]>(
    [],
  );
  const [activePrimaryOverlay, setActivePrimaryOverlay] =
    useState<PrimaryOverlay>(null);
  const [featureDetailTab, setFeatureDetailTab] =
    useState<FeatureDetailTab>("chat");
  const [graphZoom, setGraphZoom] = useState(1);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [selectedFeatureSession, setSelectedFeatureSession] =
    useState<SelectedFeatureSession | null>(null);
  const [venturesDrawerOpen, setVenturesDrawerOpen] = useState(false);
  const [isLoadingVentures, setIsLoadingVentures] = useState(false);
  const [isCreatingVenture, setIsCreatingVenture] = useState(false);
  const [ventures, setVentures] = useState<VentureItem[]>([]);
  const [newVentureName, setNewVentureName] = useState("");
  const [newVentureProjectDirectory, setNewVentureProjectDirectory] =
    useState("");
  const [newVentureDetails, setNewVentureDetails] = useState("");
  const [newVentureFeatureFilePaths, setNewVentureFeatureFilePaths] = useState<
    string[]
  >([]);
  const [newVentureSelectedFeaturePath, setNewVentureSelectedFeaturePath] =
    useState("");
  const [selectedVentureId, setSelectedVentureId] = useState("");
  const [editingVentureId, setEditingVentureId] = useState("");
  const [editingVentureDetails, setEditingVentureDetails] = useState("");
  const [editingVentureFeatureFilePaths, setEditingVentureFeatureFilePaths] =
    useState<string[]>([]);
  const [editingVentureName, setEditingVentureName] = useState("");
  const [editingVentureProjectDirectory, setEditingVentureProjectDirectory] =
    useState("");
  const [editingVentureSelectedFeaturePath, setEditingVentureSelectedFeaturePath] =
    useState("");
  const [savingVentureId, setSavingVentureId] = useState("");
  const [updatingProgressVentureId, setUpdatingProgressVentureId] =
    useState("");
  const [deletingVentureId, setDeletingVentureId] = useState("");
  const [ventureError, setVentureError] = useState("");
  const [error, setError] = useState("");
  const latestLocalWriteStartedAt = useRef(0);
  const latestParameterUpdateWriteStartedAt = useRef(0);
  const activePromptId = useRef("");
  const clearedAgentChatPrompt = useRef("");
  const agentPromptQueueRef = useRef<AgentPromptQueueEntry[]>([]);
  const latestChatRef = useRef<AgentChatExchange | null>(null);
  const currentUser = session?.user ?? null;
  const currentUserId = currentUser?.id ?? "";
  const accessToken = session?.access_token ?? "";

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      const { data, error: sessionError } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      if (sessionError) {
        setAuthError(sessionError.message);
      }

      setSession(data.session);
      setAuthStatus("ready");
    }

    void loadSession();
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        setAuthStatus("ready");
        setAuthError("");
      },
    );

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    agentPromptQueueRef.current = agentPromptQueue;
  }, [agentPromptQueue]);

  useEffect(() => {
    latestChatRef.current = latestChat;
  }, [latestChat]);

  useEffect(() => {
    try {
      const storedQueue = window.localStorage.getItem(
        AGENT_PROMPT_QUEUE_STORAGE_KEY,
      );

      if (storedQueue) {
        const parsedQueue = JSON.parse(storedQueue) as AgentPromptQueueEntry[];
        // eslint-disable-next-line react-hooks/set-state-in-effect
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

    window.localStorage.setItem(
      AGENT_PROMPT_QUEUE_STORAGE_KEY,
      JSON.stringify(agentPromptQueue),
    );
  }, [agentPromptQueue, isAgentPromptQueueHydrated]);

  useEffect(() => {
    if (!isAgentPromptQueueHydrated) {
      return;
    }

    if (latestChat) {
      window.localStorage.setItem(
        AGENT_CHAT_STORAGE_KEY,
        JSON.stringify(latestChat),
      );
      return;
    }

    window.localStorage.removeItem(AGENT_CHAT_STORAGE_KEY);
  }, [isAgentPromptQueueHydrated, latestChat]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 767px)");

    function syncLayoutMode() {
      setIsMobileLayout(mediaQuery.matches);
    }

    syncLayoutMode();
    mediaQuery.addEventListener("change", syncLayoutMode);

    return () => {
      mediaQuery.removeEventListener("change", syncLayoutMode);
    };
  }, []);

  useEffect(() => {
    if (!currentUser || !accessToken) {
      return;
    }

    let isMounted = true;

    async function pollMessage() {
      const pollStartedAt = Date.now();

      try {
        const nextMessage = await fetchCurrentMessage(
          supabaseUrl,
          supabasePublishableKey,
          accessToken,
          currentUserId,
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

    void pollMessage();
    const intervalId = window.setInterval(pollMessage, pollIntervalMs);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [
    accessToken,
    currentUser,
    currentUserId,
    pollIntervalMs,
    supabasePublishableKey,
    supabaseUrl,
  ]);

  useEffect(() => {
    if (message !== DAEMON_SENT_FEATURE_FILES) {
      return;
    }

    if (!currentUser || !accessToken) {
      return;
    }

    async function loadProjects() {
      setIsLoadingFeatureFiles(true);
      const body = await fetchDaemonPayload<{ projects?: FeatureFileProjects }>(
        supabaseUrl,
        supabasePublishableKey,
        accessToken,
        currentUserId,
        FEATURE_FILES_PAYLOAD_KIND,
      );
      setProjects(body.projects ?? {});
      setIsLoadingFeatureFiles(false);
    }

    loadProjects().catch(() => {
      setIsLoadingFeatureFiles(false);
      setError("The daemon finished, but the feature-file payload was not available.");
    });
  }, [
    accessToken,
    currentUser,
    currentUserId,
    message,
    supabasePublishableKey,
    supabaseUrl,
  ]);

  useEffect(() => {
    if (parameterFileMessage !== DAEMON_SENT_PARAMETER_FILES) {
      return;
    }

    if (!currentUser || !accessToken) {
      return;
    }

    async function loadParameterProjects() {
      setIsLoadingParameterFiles(true);
      const body = await fetchDaemonPayload<{ projects?: ParameterFileProjects }>(
        supabaseUrl,
        supabasePublishableKey,
        accessToken,
        currentUserId,
        PARAMETER_FILES_PAYLOAD_KIND,
      );
      setParameterProjects(body.projects ?? {});
      setIsLoadingParameterFiles(false);
    }

    loadParameterProjects().catch(() => {
      setIsLoadingParameterFiles(false);
      setError("The daemon finished, but the parameter-file payload was not available.");
    });
  }, [
    accessToken,
    currentUser,
    currentUserId,
    parameterFileMessage,
    supabasePublishableKey,
    supabaseUrl,
  ]);

  useEffect(() => {
    const projectDirectories = Object.keys(projects ?? {});

    if (projectDirectories.length === 0) {
      return;
    }

    if (projectDirectories.includes(selectedProjectDirectory)) {
      return;
    }

    if (projectDirectories.includes(DEFAULT_PROJECT_DIRECTORY)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedProjectDirectory(DEFAULT_PROJECT_DIRECTORY);
      return;
    }

    setSelectedProjectDirectory(projectDirectories[0]);
  }, [projects, selectedProjectDirectory]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTargetedFeatures((currentFeatures) =>
      currentFeatures.filter(
        (feature) => feature.projectPath === selectedProjectDirectory,
      ),
    );
  }, [selectedProjectDirectory]);

  useEffect(() => {
    if (ventures.length === 0) {
      if (selectedVentureId) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectedVentureId("");
      }

      return;
    }

    if (ventures.some((venture) => venture.id === selectedVentureId)) {
      return;
    }

    setSelectedVentureId(ventures[0].id);
  }, [selectedVentureId, ventures]);

  useEffect(() => {
    if (!currentUser || !accessToken) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVentures([]);
      return;
    }

    let isMounted = true;

    async function loadVentures() {
      setIsLoadingVentures(true);

      try {
        const nextVentures = await fetchVentures(
          supabaseUrl,
          supabasePublishableKey,
          accessToken,
          currentUserId,
        );

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
  }, [
    accessToken,
    currentUser,
    currentUserId,
    supabasePublishableKey,
    supabaseUrl,
  ]);

  useEffect(() => {
    if (!currentUser || !accessToken) {
      return;
    }

    let isMounted = true;

    async function pollAgentPromptMessage() {
      try {
        const nextMessage = await fetchCurrentMessage(
          supabaseUrl,
          supabasePublishableKey,
          accessToken,
          currentUserId,
          AGENT_PROMPT_PURPOSE,
        );

        if (!isMounted) {
          return;
        }

        setAgentPromptMessage(nextMessage);
        // eslint-disable-next-line react-hooks/immutability
        syncAgentPromptQueueFromRowMessage(nextMessage);
      } catch {
        return;
      }
    }

    void pollAgentPromptMessage();
    const intervalId = window.setInterval(
      pollAgentPromptMessage,
      pollIntervalMs,
    );

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    accessToken,
    currentUser,
    currentUserId,
    pollIntervalMs,
    supabasePublishableKey,
    supabaseUrl,
  ]);

  useEffect(() => {
    if (!currentUser || !accessToken) {
      return;
    }

    let isMounted = true;

    async function pollParameterFileMessage() {
      const pollStartedAt = Date.now();

      try {
        const nextMessage = await fetchCurrentMessage(
          supabaseUrl,
          supabasePublishableKey,
          accessToken,
          currentUserId,
          PARAMETER_FILE_LOAD_PURPOSE,
        );

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

    void pollParameterFileMessage();
    const intervalId = window.setInterval(
      pollParameterFileMessage,
      pollIntervalMs,
    );

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [
    accessToken,
    currentUser,
    currentUserId,
    pollIntervalMs,
    supabasePublishableKey,
    supabaseUrl,
  ]);

  useEffect(() => {
    if (!currentUser || !accessToken) {
      return;
    }

    let isMounted = true;

    async function pollParameterUpdateMessage() {
      const pollStartedAt = Date.now();

      try {
        const nextMessage = await fetchCurrentMessage(
          supabaseUrl,
          supabasePublishableKey,
          accessToken,
          currentUserId,
          PARAMETER_FILE_UPDATE_PURPOSE,
        );

        if (!isMounted) {
          return;
        }

        if (pollStartedAt < latestParameterUpdateWriteStartedAt.current) {
          return;
        }

        setParameterUpdateMessage(nextMessage);
      } catch {
        return;
      }
    }

    void pollParameterUpdateMessage();
    const intervalId = window.setInterval(
      pollParameterUpdateMessage,
      pollIntervalMs,
    );

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [
    accessToken,
    currentUser,
    currentUserId,
    pollIntervalMs,
    supabasePublishableKey,
    supabaseUrl,
  ]);

  useEffect(() => {
    const parsedMessage = parseParameterUpdateRowMessage(parameterUpdateMessage);

    if (parsedMessage?.state !== DAEMON_SENT_PARAMETER_FILES) {
      return;
    }

    if (!currentUser || !accessToken) {
      return;
    }

    async function loadUpdatedParameterProjects() {
      const body = await fetchDaemonPayload<{ projects?: ParameterFileProjects }>(
        supabaseUrl,
        supabasePublishableKey,
        accessToken,
        currentUserId,
        PARAMETER_FILES_PAYLOAD_KIND,
      );
      setParameterProjects(body.projects ?? {});
    }

    loadUpdatedParameterProjects().catch(() => {
      setError("The daemon saved the parameter edit, but the refreshed payload was not available.");
    });
  }, [
    accessToken,
    currentUser,
    currentUserId,
    parameterUpdateMessage,
    supabasePublishableKey,
    supabaseUrl,
  ]);

  useEffect(() => {
    if (!isAgentPromptQueueHydrated) {
      return;
    }

    const activePrompt = agentPromptQueue.find(
      (item) => item.status === "sending" || item.status === "running",
    );

    if (activePrompt) {
      return;
    }

    const nextQueuedPrompt = agentPromptQueue.find(
      (item) => item.status === "queued",
    );

    if (!nextQueuedPrompt) {
      return;
    }

    // eslint-disable-next-line react-hooks/immutability
    void dispatchQueuedAgentPrompt(nextQueuedPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    accessToken,
    agentPromptQueue,
    currentUser,
    isAgentPromptQueueHydrated,
  ]);

  useEffect(() => {
    if (!isAgentPromptQueueHydrated) {
      return;
    }

    if (!currentUser || !accessToken) {
      return;
    }

    let isMounted = true;

    async function pollAgentChat() {
      try {
        const nextChat = await fetchLatestAgentChat(
          supabaseUrl,
          supabasePublishableKey,
          accessToken,
          currentUserId,
        );

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
          // eslint-disable-next-line react-hooks/immutability
          finalizeQueuedAgentPrompt(nextChat.promptId, nextChat);
        }
      } catch {
        return;
      }
    }

    void pollAgentChat();
    const intervalId = window.setInterval(pollAgentChat, pollIntervalMs);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [
    accessToken,
    currentUser,
    currentUserId,
    isAgentPromptQueueHydrated,
    pollIntervalMs,
    supabasePublishableKey,
    supabaseUrl,
  ]);

  useEffect(() => {
    if (!isAgentPromptQueueHydrated) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const activePrompt = agentPromptQueueRef.current.find(
        (item) => item.status === "sending" || item.status === "running",
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

  async function submitAuthForm() {
    const email = authEmail.trim();

    if (!email || !authPassword || authStatus === "submitting") {
      return;
    }

    setAuthStatus("submitting");
    setAuthError("");

    const authResult =
      authMode === "sign-up"
        ? await supabase.auth.signUp({ email, password: authPassword })
        : await supabase.auth.signInWithPassword({
            email,
            password: authPassword,
          });

    if (authResult.error) {
      setAuthError(authResult.error.message);
      setAuthStatus("ready");
      return;
    }

    setSession(authResult.data.session);
    setAuthPassword("");
    setAuthStatus("ready");
  }

  async function signOut() {
    setAuthError("");
    await supabase.auth.signOut();
    setSession(null);
    setProjects(null);
    setParameterProjects(null);
    setSelectedFeatureSession(null);
    setActivePrimaryOverlay(null);
    setVenturesDrawerOpen(false);
    setVentures([]);
    setLatestChat(null);
  }

  async function requestParameterFileUpdate({
    parameterFilePath,
    projectPath,
    value,
    variableName,
  }: ParameterUpdateRequest) {
    if (!currentUser || !accessToken) {
      throw new Error("Sign in before saving parameter edits.");
    }

    const writeStartedAt = Date.now();
    latestParameterUpdateWriteStartedAt.current = writeStartedAt;
    const nextMessage = await updateMessage(
      supabaseUrl,
      supabasePublishableKey,
      accessToken,
      currentUserId,
      PARAMETER_FILE_UPDATE_PURPOSE,
      JSON.stringify({
        command: PARAMETER_FILE_UPDATE_COMMAND,
        projectPath,
        path: parameterFilePath,
        variableName,
        value,
      }),
    );
    setParameterUpdateMessage(nextMessage);
  }

  async function requestDevEnvironment() {
    if (!currentUser || !accessToken) {
      setError("Sign in before loading the dev environment.");
      return;
    }

    setError("");
    setIsLoadingFeatureFiles(true);
    setIsLoadingParameterFiles(true);
    const writeStartedAt = Date.now();
    latestLocalWriteStartedAt.current = writeStartedAt;

    try {
      const [nextFeatureFileMessage, nextParameterFileMessage] =
        await Promise.all([
          updateMessage(
            supabaseUrl,
            supabasePublishableKey,
            accessToken,
            currentUserId,
            FEATURE_FILE_LOAD_PURPOSE,
            CLIENT_LOAD_FEATURE_FILES,
          ),
          updateMessage(
            supabaseUrl,
            supabasePublishableKey,
            accessToken,
            currentUserId,
            PARAMETER_FILE_LOAD_PURPOSE,
            CLIENT_LOAD_PARAMETER_FILES,
          ),
        ]);
      setMessage(nextFeatureFileMessage);
      setParameterFileMessage(nextParameterFileMessage);
    } catch {
      setIsLoadingFeatureFiles(false);
      setIsLoadingParameterFiles(false);
      setError("Unable to write the dev-environment load requests to Supabase.");
    }
  }

  async function sendAgentPrompt() {
    if (!promptText.trim() || !currentUser || !accessToken) {
      return;
    }

    const promptId = createPromptId();
    const nextPrompt = promptText.trim();
    const targetedFeaturePaths = targetedFeatures.map((feature) => feature.filePath);
    const nextPromptPayload: AgentPromptQueueEntry = {
      promptId,
      directory: selectedProjectDirectory,
      prompt: nextPrompt,
      provider: "codex",
      model: selectedModelId,
      reasoning: selectedReasoning,
      planningMode: isPlanningMode,
      targetedFeaturePaths,
      status: "queued",
      enqueuedAt: Date.now(),
    };

    setPromptStatus(
      agentPromptQueueRef.current.some(
        (item) => item.status === "sending" || item.status === "running",
      )
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

  function syncAgentPromptQueueFromRowMessage(messageValue: string) {
    const parsedMessage = parseAgentPromptRowMessage(messageValue);

    if (!parsedMessage) {
      return;
    }

    const activeQueueItem = agentPromptQueueRef.current[0];
    const activeQueuePromptId = activeQueueItem?.promptId ?? activePromptId.current;

    if (
      parsedMessage.promptId &&
      activeQueuePromptId &&
      parsedMessage.promptId !== activeQueuePromptId
    ) {
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
    if (!currentUser || !accessToken) {
      return;
    }

    const activeQueueItem = agentPromptQueueRef.current[0];

    if (
      !activeQueueItem ||
      activeQueueItem.promptId !== queueEntry.promptId ||
      activeQueueItem.status !== "queued"
    ) {
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
        supabaseUrl,
        supabasePublishableKey,
        accessToken,
        currentUserId,
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

  function finalizeQueuedAgentPrompt(
    promptId: string,
    replyExchange?: AgentChatExchange | null,
  ) {
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
  const currentMessage = formatDevEnvironmentMessage(
    message,
    parameterFileMessage,
  );
  const projectEntries = Object.entries(projects ?? {});
  const availableProjectDirectories = projectEntries.map(
    ([projectDirectory]) => projectDirectory,
  );
  const currentPromptQueueItem = agentPromptQueue[0] ?? null;
  const promptQueueStatusText =
    promptStatus || getAgentPromptQueueStatusText(agentPromptQueue);
  const isLoadingDevEnvironment =
    isLoadingFeatureFiles || isLoadingParameterFiles;
  const selectedVenture =
    ventures.find((venture) => venture.id === selectedVentureId) ??
    ventures[0] ??
    null;
  const newVentureFeatureOptions = getFeatureOptionsForProject(
    projects ?? {},
    newVentureProjectDirectory,
  );
  const editingVentureFeatureOptions = getFeatureOptionsForProject(
    projects ?? {},
    editingVentureProjectDirectory,
  );
  const selectedVentureFeatureTags = getFeatureTagsForPaths(
    projects ?? {},
    selectedVenture?.featureFilePaths ?? [],
  );
  const parameterFilesByProject = useMemo(() => {
    const nextMap = new Map<string, Map<string, ParameterFileRecord>>();

    Object.entries(parameterProjects ?? {}).forEach(
      ([projectPath, parameterFiles]) => {
        nextMap.set(
          projectPath,
          new Map(
            parameterFiles.map((parameterFile) => [
              normalizeParameterFilePath(parameterFile.path),
              parameterFile,
            ]),
          ),
        );
      },
    );

    return nextMap;
  }, [parameterProjects]);
  const selectedFeatureRecord = selectedFeatureSession
    ? (projects?.[selectedFeatureSession.projectPath] ?? []).find(
        (featureFile) =>
          normalizeFeatureFilePath(featureFile.path) ===
          selectedFeatureSession.filePath,
      ) ?? null
    : null;
  const matchedParameterFile = selectedFeatureSession
    ? parameterFilesByProject
        .get(selectedFeatureSession.projectPath)
        ?.get(getParameterFilePathForFeature(selectedFeatureSession.filePath)) ??
      null
    : null;

  function selectModel(modelId: string) {
    const nextModel =
      agentModels.codex.models.find((model) => model.id === modelId) ??
      defaultModel;
    setSelectedModelId(nextModel.id);
    setSelectedReasoning(nextModel.default_reasoning);
  }

  function addTargetedFeature(feature: TargetedFeature) {
    setTargetedFeatures((currentFeatures) => {
      if (
        currentFeatures.some(
          (currentFeature) => currentFeature.filePath === feature.filePath,
        )
      ) {
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

  function openNewFeatureOverlay() {
    setTargetedFeatures([]);
    setActivePrimaryOverlay("new-feature");

    if (isMobileLayout) {
      setVenturesDrawerOpen(false);
    }
  }

  function closePrimaryOverlay() {
    setActivePrimaryOverlay(null);
    setSelectedFeatureSession(null);
  }

  function closeVenturesDrawer() {
    setVenturesDrawerOpen(false);
  }

  function toggleVenturesDrawer() {
    if (isMobileLayout) {
      setActivePrimaryOverlay(null);
      setSelectedFeatureSession(null);
      setVenturesDrawerOpen(true);
      return;
    }

    setVenturesDrawerOpen((currentValue) => !currentValue);
  }

  function handleFeatureNodeSelect(selection: FeatureGraphSelection) {
    setSelectedProjectDirectory(selection.projectPath);
    setTargetedFeatures([
      {
        featureName: selection.featureName,
        filePath: selection.filePath,
        projectPath: selection.projectPath,
      },
    ]);
    setSelectedFeatureSession(selection);
    setFeatureDetailTab("chat");
    setActivePrimaryOverlay("feature-detail");

    if (isMobileLayout) {
      setVenturesDrawerOpen(false);
    }
  }

  function updateNewVentureProjectDirectory(projectDirectory: string) {
    setNewVentureProjectDirectory(projectDirectory);
    setNewVentureSelectedFeaturePath("");

    if (!projectDirectory) {
      setNewVentureFeatureFilePaths([]);
      return;
    }

    const allowedFeaturePaths = new Set(
      getFeatureOptionsForProject(projects ?? {}, projectDirectory).map(
        (feature) => feature.filePath,
      ),
    );

    setNewVentureFeatureFilePaths((currentPaths) =>
      currentPaths.filter((filePath) => allowedFeaturePaths.has(filePath)),
    );
  }

  function addNewVentureFeatureTag() {
    if (!newVentureSelectedFeaturePath) {
      return;
    }

    setNewVentureFeatureFilePaths((currentPaths) => {
      if (currentPaths.includes(newVentureSelectedFeaturePath)) {
        return currentPaths;
      }

      return [...currentPaths, newVentureSelectedFeaturePath];
    });
    setNewVentureSelectedFeaturePath("");
  }

  function removeNewVentureFeatureTag(filePath: string) {
    setNewVentureFeatureFilePaths((currentPaths) =>
      currentPaths.filter((currentPath) => currentPath !== filePath),
    );
  }

  function updateEditingVentureProjectDirectory(projectDirectory: string) {
    setEditingVentureProjectDirectory(projectDirectory);
    setEditingVentureSelectedFeaturePath("");

    if (!projectDirectory) {
      setEditingVentureFeatureFilePaths([]);
      return;
    }

    const allowedFeaturePaths = new Set(
      getFeatureOptionsForProject(projects ?? {}, projectDirectory).map(
        (feature) => feature.filePath,
      ),
    );

    setEditingVentureFeatureFilePaths((currentPaths) =>
      currentPaths.filter((filePath) => allowedFeaturePaths.has(filePath)),
    );
  }

  function addEditingVentureFeatureTag() {
    if (!editingVentureSelectedFeaturePath) {
      return;
    }

    setEditingVentureFeatureFilePaths((currentPaths) => {
      if (currentPaths.includes(editingVentureSelectedFeaturePath)) {
        return currentPaths;
      }

      return [...currentPaths, editingVentureSelectedFeaturePath];
    });
    setEditingVentureSelectedFeaturePath("");
  }

  function removeEditingVentureFeatureTag(filePath: string) {
    setEditingVentureFeatureFilePaths((currentPaths) =>
      currentPaths.filter((currentPath) => currentPath !== filePath),
    );
  }

  async function addVenture() {
    const details = newVentureDetails.trim();
    const ventureName = newVentureName.trim();
    const projectDirectory = newVentureProjectDirectory.trim();

    if (!ventureName || isCreatingVenture || !currentUser || !accessToken) {
      return;
    }

    setIsCreatingVenture(true);
    setVentureError("");

    try {
      const createdVenture = await createVenture(
        supabaseUrl,
        supabasePublishableKey,
        accessToken,
        currentUserId,
        ventureName,
        details || null,
        projectDirectory || null,
        newVentureFeatureFilePaths,
      );
      setVentures((currentVentures) => [createdVenture, ...currentVentures]);
      setSelectedVentureId(createdVenture.id);
      setNewVentureDetails("");
      setNewVentureFeatureFilePaths([]);
      setNewVentureName("");
      setNewVentureProjectDirectory("");
      setNewVentureSelectedFeaturePath("");
    } catch {
      setVentureError("Unable to create the venture right now.");
    } finally {
      setIsCreatingVenture(false);
    }
  }

  function startEditingVenture(venture: VentureItem) {
    setEditingVentureDetails(venture.details ?? "");
    setEditingVentureFeatureFilePaths(venture.featureFilePaths);
    setEditingVentureId(venture.id);
    setEditingVentureName(venture.ventureName);
    setEditingVentureProjectDirectory(venture.projectDirectory ?? "");
    setEditingVentureSelectedFeaturePath("");
  }

  function cancelEditingVenture() {
    setEditingVentureDetails("");
    setEditingVentureFeatureFilePaths([]);
    setEditingVentureId("");
    setEditingVentureName("");
    setEditingVentureProjectDirectory("");
    setEditingVentureSelectedFeaturePath("");
  }

  async function saveVentureEdits() {
    const details = editingVentureDetails.trim();
    const ventureName = editingVentureName.trim();
    const projectDirectory = editingVentureProjectDirectory.trim();

    if (
      !editingVentureId ||
      !ventureName ||
      savingVentureId ||
      !currentUser ||
      !accessToken
    ) {
      return;
    }

    setSavingVentureId(editingVentureId);
    setVentureError("");

    try {
      const updatedVenture = await updateVenture(
        supabaseUrl,
        supabasePublishableKey,
        accessToken,
        currentUserId,
        editingVentureId,
        {
          details: details || null,
          feature_file_paths: editingVentureFeatureFilePaths,
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
      setVentureError("Unable to save the venture right now.");
    } finally {
      setSavingVentureId("");
    }
  }

  async function updateVentureProgressState(
    ventureId: string,
    progressState: VentureProgressState,
  ) {
    if (updatingProgressVentureId || !currentUser || !accessToken) {
      return;
    }

    setUpdatingProgressVentureId(ventureId);
    setVentureError("");

    try {
      const updatedVenture = await updateVenture(
        supabaseUrl,
        supabasePublishableKey,
        accessToken,
        currentUserId,
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
    if (deletingVentureId || !currentUser || !accessToken) {
      return;
    }

    setDeletingVentureId(ventureId);
    setVentureError("");

    try {
      await deleteVentureRow(
        supabaseUrl,
        supabasePublishableKey,
        accessToken,
        currentUserId,
        ventureId,
      );
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

  const venturesDrawerClassName = isMobileLayout
    ? "pointer-events-auto absolute inset-3 flex flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-slate-950/94 shadow-[0_28px_100px_rgba(2,6,23,0.72)] backdrop-blur"
    : "pointer-events-auto absolute left-4 top-28 bottom-6 flex w-[min(28rem,calc(100vw-8rem))] flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-slate-950/90 shadow-[0_28px_100px_rgba(2,6,23,0.72)] backdrop-blur";
  const primaryOverlayClassName = isMobileLayout
    ? "pointer-events-auto absolute inset-3 flex flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-slate-950/94 shadow-[0_28px_100px_rgba(2,6,23,0.72)] backdrop-blur"
    : "pointer-events-auto absolute right-4 top-28 bottom-6 flex w-[min(44rem,calc(100vw-10rem))] flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-slate-950/90 shadow-[0_28px_100px_rgba(2,6,23,0.72)] backdrop-blur";

  if (authStatus === "checking") {
    return (
      <main className="grid min-h-screen place-items-center bg-black px-6 text-slate-100">
        <div className="w-full max-w-md rounded-[1.75rem] border border-white/10 bg-slate-950/82 p-6 text-center shadow-[0_24px_80px_rgba(2,6,23,0.65)]">
          <p className="text-sm uppercase tracking-[0.28em] text-slate-400">
            Daedalus
          </p>
          <p className="mt-3 text-lg font-semibold text-white">
            Checking your session...
          </p>
        </div>
      </main>
    );
  }

  if (!currentUser) {
    return (
      <main className="grid min-h-screen place-items-center bg-black px-6 text-slate-100">
        <div className="w-full max-w-md rounded-[1.75rem] border border-white/10 bg-slate-950/82 p-6 shadow-[0_24px_80px_rgba(2,6,23,0.65)]">
          <p className="text-sm uppercase tracking-[0.28em] text-slate-400">
            Daedalus
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-white">
            {authMode === "sign-up" ? "Create your account" : "Sign in"}
          </h1>
          <div className="mt-6 grid gap-4">
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                Email
              </span>
              <input
                type="email"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                className="rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                Password
              </span>
              <input
                type="password"
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                className="rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none"
              />
            </label>
            {authError ? (
              <p className="rounded-[1.25rem] border border-rose-400/20 bg-rose-500/12 px-4 py-3 text-sm text-rose-100">
                {authError}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => {
                void submitAuthForm();
              }}
              disabled={
                !authEmail.trim() || !authPassword || authStatus === "submitting"
              }
              className="rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {authStatus === "submitting"
                ? "Working..."
                : authMode === "sign-up"
                  ? "Sign up"
                  : "Sign in"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthError("");
                setAuthMode(authMode === "sign-up" ? "sign-in" : "sign-up");
              }}
              className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
            >
              {authMode === "sign-up"
                ? "Use an existing account"
                : "Create a new account"}
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black text-slate-100">
      <FeatureFileGraph
        onNodeSelect={handleFeatureNodeSelect}
        onOpenNewFeature={openNewFeatureOverlay}
        onOpenVentures={toggleVenturesDrawer}
        onZoomChange={setGraphZoom}
        projects={projects ?? {}}
        selectedFeatureFilePath={selectedFeatureSession?.filePath ?? ""}
        zoom={graphZoom}
      />

      <div className="pointer-events-none absolute inset-0">
        <div className="pointer-events-auto absolute inset-x-4 top-4 flex justify-center">
          <div className="grid w-full max-w-5xl gap-3">
            <div className="flex flex-wrap justify-center gap-3">
              <div className="min-w-[180px] max-w-xl flex-1 rounded-[1.5rem] border border-white/10 bg-slate-950/82 p-4 shadow-[0_24px_80px_rgba(2,6,23,0.55)] backdrop-blur sm:flex-none sm:w-[30rem]">
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                  Messages / Log info
                </p>
                <p className="mt-2 whitespace-pre-wrap break-words font-mono text-sm text-slate-100">
                  {currentMessage}
                </p>
              </div>
              <div className="min-w-[180px] rounded-[1.5rem] border border-white/10 bg-slate-950/82 p-4 shadow-[0_24px_80px_rgba(2,6,23,0.55)] backdrop-blur sm:w-64">
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                  Status
                </p>
                <p className="mt-2 text-xl font-semibold text-white">
                  {statusLabel}
                </p>
              </div>
            </div>

            {error ? (
              <div className="rounded-[1.5rem] border border-rose-400/20 bg-rose-500/12 px-5 py-4 text-sm text-rose-100 shadow-[0_24px_80px_rgba(127,29,29,0.35)] backdrop-blur">
                {error}
              </div>
            ) : null}
          </div>
        </div>

        <div className="pointer-events-auto absolute right-4 top-4 flex max-w-[24rem] flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={requestDevEnvironment}
            aria-label="Refresh dev environment"
            title="Refresh dev environment"
            className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white text-slate-950 shadow-[0_20px_60px_rgba(2,6,23,0.32)] transition hover:bg-slate-200"
          >
            <svg
              aria-hidden="true"
              className={`h-5 w-5 ${isLoadingDevEnvironment ? "animate-spin" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 11a8 8 0 0 0-13.66-5.66L4 7.72" />
              <path d="M4 4v3.72h3.72" />
              <path d="M4 13a8 8 0 0 0 13.66 5.66L20 16.28" />
              <path d="M20 20v-3.72h-3.72" />
            </svg>
          </button>
          <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/82 px-4 py-3 text-right shadow-[0_20px_60px_rgba(2,6,23,0.45)] backdrop-blur">
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
              Workspace
            </p>
            <p className="mt-1 max-w-[16rem] break-all text-sm text-slate-200">
              {currentUser.email ?? currentUserId}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void signOut();
            }}
            className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
          >
            Sign out
          </button>
        </div>

        {venturesDrawerOpen ? (
          <aside className={venturesDrawerClassName}>
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                  Ventures
                </p>
                <h2 className="mt-2 text-xl font-semibold text-white">
                  Ventures workspace
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Track venture rows, project tags, feature tags, and details without leaving the graph.
                </p>
              </div>
              <button
                type="button"
                onClick={closeVenturesDrawer}
                className="rounded-full border border-white/10 bg-white/6 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
              >
                X
              </button>
            </div>

            <div className="agent-chat-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="grid gap-4">
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
                  <select
                    id="venture-project"
                    value={newVentureProjectDirectory}
                    onChange={(event) =>
                      updateNewVentureProjectDirectory(event.target.value)
                    }
                    className="agent-chat-scrollbar rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none"
                  >
                    <option value="">No project tag</option>
                    {availableProjectDirectories.length > 0 ? (
                      availableProjectDirectories.map((projectDirectory) => (
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
                  {newVentureProjectDirectory ? (
                    <div className="grid gap-3">
                      <label
                        htmlFor="venture-feature-tag"
                        className="text-[11px] uppercase tracking-[0.28em] text-slate-400"
                      >
                        Tagged features
                      </label>
                      <div className="flex flex-wrap items-center gap-3">
                        <select
                          id="venture-feature-tag"
                          value={newVentureSelectedFeaturePath}
                          onChange={(event) =>
                            setNewVentureSelectedFeaturePath(event.target.value)
                          }
                          className="agent-chat-scrollbar min-w-0 flex-1 rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none"
                        >
                          <option value="">Select a feature to tag</option>
                          {newVentureFeatureOptions.map((feature) => (
                            <option key={feature.filePath} value={feature.filePath}>
                              {feature.featureName}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={addNewVentureFeatureTag}
                          disabled={!newVentureSelectedFeaturePath}
                          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                        >
                          Add feature
                        </button>
                      </div>
                      {newVentureFeatureFilePaths.length > 0 ? (
                        <div className="flex flex-wrap gap-2 rounded-[1.25rem] border border-white/10 bg-slate-900/50 p-3">
                          {getFeatureTagsForPaths(
                            projects ?? {},
                            newVentureFeatureFilePaths,
                          ).map((feature) => (
                            <span
                              key={feature.filePath}
                              title={feature.filePath}
                              className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/12 px-3 py-2 text-sm text-cyan-50"
                            >
                              <span className="max-w-[14rem] truncate">
                                {feature.featureName}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  removeNewVentureFeatureTag(feature.filePath)
                                }
                                className="rounded-full border border-cyan-200/20 px-2 py-0.5 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-200/15"
                                aria-label={`Remove ${feature.featureName}`}
                              >
                                x
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400">
                          Add one or more feature files from this project to tag the venture.
                        </p>
                      )}
                    </div>
                  ) : null}
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
                  <button
                    type="button"
                    onClick={() => {
                      void addVenture();
                    }}
                    disabled={!newVentureName.trim() || isCreatingVenture}
                    className="rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                  >
                    {isCreatingVenture ? "Creating venture..." : "Create venture"}
                  </button>
                </div>

                {ventureError ? (
                  <div className="rounded-[1.5rem] border border-rose-400/20 bg-rose-500/12 px-4 py-3 text-sm text-rose-100">
                    {ventureError}
                  </div>
                ) : null}

                {isLoadingVentures && ventures.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/55 px-5 py-6">
                    <p className="text-base font-medium text-white">
                      Loading ventures...
                    </p>
                    <p className="mt-2 text-sm text-slate-400">
                      Pulling the current venture list from Supabase now.
                    </p>
                  </div>
                ) : ventures.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-slate-950/40 px-5 py-6">
                    <p className="text-base font-medium text-white">
                      No ventures yet.
                    </p>
                    <p className="mt-2 text-sm text-slate-400">
                      Add a venture name to create the first tracked row in Supabase.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <label
                        htmlFor="selected-venture"
                        className="text-[11px] uppercase tracking-[0.28em] text-slate-400"
                      >
                        Select venture
                      </label>
                      <select
                        id="selected-venture"
                        value={selectedVenture?.id ?? ""}
                        onChange={(event) => setSelectedVentureId(event.target.value)}
                        className="agent-chat-scrollbar rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none"
                      >
                        {ventures.map((venture) => (
                          <option key={venture.id} value={venture.id}>
                            {venture.ventureName} (
                            {formatVentureProgressState(venture.progressState)})
                          </option>
                        ))}
                      </select>
                      <p className="text-sm text-slate-400">
                        Pick one venture to inspect instead of scrolling through the full list.
                      </p>
                    </div>

                    {selectedVenture ? (
                      <div
                        className={`rounded-[1.5rem] border p-4 shadow-[0_20px_50px_rgba(2,6,23,0.3)] ${getVentureCardClassName(selectedVenture.progressState)}`}
                      >
                        {editingVentureId === selectedVenture.id ? (
                          <div className="grid gap-3">
                            <label
                              htmlFor={`venture-edit-name-${selectedVenture.id}`}
                              className="text-[11px] uppercase tracking-[0.28em] text-slate-400"
                            >
                              Venture name
                            </label>
                            <input
                              id={`venture-edit-name-${selectedVenture.id}`}
                              type="text"
                              value={editingVentureName}
                              onChange={(event) =>
                                setEditingVentureName(event.target.value)
                              }
                              className="rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none"
                            />
                            <label
                              htmlFor={`venture-edit-project-${selectedVenture.id}`}
                              className="text-[11px] uppercase tracking-[0.28em] text-slate-400"
                            >
                              Project directory
                            </label>
                            <select
                              id={`venture-edit-project-${selectedVenture.id}`}
                              value={editingVentureProjectDirectory}
                              onChange={(event) =>
                                updateEditingVentureProjectDirectory(
                                  event.target.value,
                                )
                              }
                              className="agent-chat-scrollbar rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none"
                            >
                              <option value="">No project tag</option>
                              {editingVentureProjectDirectory &&
                              !availableProjectDirectories.includes(
                                editingVentureProjectDirectory,
                              ) ? (
                                <option value={editingVentureProjectDirectory}>
                                  {editingVentureProjectDirectory}
                                </option>
                              ) : null}
                              {availableProjectDirectories.length > 0 ? (
                                availableProjectDirectories.map(
                                  (projectDirectory) => (
                                    <option
                                      key={projectDirectory}
                                      value={projectDirectory}
                                    >
                                      {projectDirectory}
                                    </option>
                                  ),
                                )
                              ) : (
                                <option value={DEFAULT_PROJECT_DIRECTORY}>
                                  {DEFAULT_PROJECT_DIRECTORY}
                                </option>
                              )}
                            </select>
                            <label
                              htmlFor={`venture-edit-feature-${selectedVenture.id}`}
                              className="text-[11px] uppercase tracking-[0.28em] text-slate-400"
                            >
                              Tagged features
                            </label>
                            {editingVentureProjectDirectory ? (
                              <div className="grid gap-3">
                                <div className="flex flex-wrap items-center gap-3">
                                  <select
                                    id={`venture-edit-feature-${selectedVenture.id}`}
                                    value={editingVentureSelectedFeaturePath}
                                    onChange={(event) =>
                                      setEditingVentureSelectedFeaturePath(
                                        event.target.value,
                                      )
                                    }
                                    className="agent-chat-scrollbar min-w-0 flex-1 rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none"
                                  >
                                    <option value="">Select a feature to tag</option>
                                    {editingVentureFeatureOptions.map((feature) => (
                                      <option
                                        key={feature.filePath}
                                        value={feature.filePath}
                                      >
                                        {feature.featureName}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    onClick={addEditingVentureFeatureTag}
                                    disabled={!editingVentureSelectedFeaturePath}
                                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                                  >
                                    Add feature
                                  </button>
                                </div>
                                {editingVentureFeatureFilePaths.length > 0 ? (
                                  <div className="flex flex-wrap gap-2 rounded-[1.25rem] border border-white/10 bg-slate-900/50 p-3">
                                    {getFeatureTagsForPaths(
                                      projects ?? {},
                                      editingVentureFeatureFilePaths,
                                    ).map((feature) => (
                                      <span
                                        key={feature.filePath}
                                        title={feature.filePath}
                                        className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/12 px-3 py-2 text-sm text-cyan-50"
                                      >
                                        <span className="max-w-[14rem] truncate">
                                          {feature.featureName}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            removeEditingVentureFeatureTag(
                                              feature.filePath,
                                            )
                                          }
                                          className="rounded-full border border-cyan-200/20 px-2 py-0.5 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-200/15"
                                          aria-label={`Remove ${feature.featureName}`}
                                        >
                                          x
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-sm text-slate-400">
                                    No feature tags added yet.
                                  </p>
                                )}
                              </div>
                            ) : (
                              <p className="text-sm text-slate-400">
                                Pick a project first to tag its feature files.
                              </p>
                            )}
                            <label
                              htmlFor={`venture-edit-details-${selectedVenture.id}`}
                              className="text-[11px] uppercase tracking-[0.28em] text-slate-400"
                            >
                              Details
                            </label>
                            <textarea
                              id={`venture-edit-details-${selectedVenture.id}`}
                              value={editingVentureDetails}
                              onChange={(event) =>
                                setEditingVentureDetails(event.target.value)
                              }
                              className="agent-chat-scrollbar min-h-24 rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none"
                            />
                            <div className="flex flex-wrap items-center gap-3">
                              <button
                                type="button"
                                onClick={() => {
                                  void saveVentureEdits();
                                }}
                                disabled={
                                  !editingVentureName.trim() ||
                                  savingVentureId === selectedVenture.id
                                }
                                className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                              >
                                {savingVentureId === selectedVenture.id
                                  ? "Saving..."
                                  : "Save"}
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
                                    selectedVenture.progressState === "completed"
                                      ? "text-emerald-100 line-through decoration-2"
                                      : "text-white"
                                  }`}
                                >
                                  {selectedVenture.ventureName}
                                </p>
                                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                                  {formatVentureProgressState(
                                    selectedVenture.progressState,
                                  )}{" "}
                                  • Created{" "}
                                  {formatVentureCreatedAt(selectedVenture.createdAt)}
                                </p>
                              </div>
                              <div className="grid gap-2">
                                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                                  Project
                                </p>
                                <p className="break-all rounded-full border border-white/10 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
                                  {selectedVenture.projectDirectory ||
                                    "No project tagged"}
                                </p>
                              </div>
                              <div className="grid gap-2">
                                <label
                                  htmlFor={`venture-progress-${selectedVenture.id}`}
                                  className="text-[11px] uppercase tracking-[0.24em] text-slate-500"
                                >
                                  Progress state
                                </label>
                                <select
                                  id={`venture-progress-${selectedVenture.id}`}
                                  value={selectedVenture.progressState}
                                  onChange={(event) => {
                                    void updateVentureProgressState(
                                      selectedVenture.id,
                                      event.target.value as VentureProgressState,
                                    );
                                  }}
                                  disabled={
                                    updatingProgressVentureId === selectedVenture.id
                                  }
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

                            <div className="grid gap-2">
                              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                                Details
                              </p>
                              <div className="whitespace-pre-wrap rounded-[1.25rem] border border-white/10 bg-slate-900/55 px-4 py-3 text-sm leading-6 text-slate-200">
                                {selectedVenture.details || "No details added yet."}
                              </div>
                            </div>

                            <div className="grid gap-2">
                              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                                Tagged features
                              </p>
                              {selectedVentureFeatureTags.length > 0 ? (
                                <div className="flex flex-wrap gap-2 rounded-[1.25rem] border border-white/10 bg-slate-900/55 p-3">
                                  {selectedVentureFeatureTags.map((feature) => (
                                    <span
                                      key={feature.filePath}
                                      title={feature.filePath}
                                      className="inline-flex items-center rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-xs text-cyan-50"
                                    >
                                      {feature.featureName}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <div className="rounded-[1.25rem] border border-white/10 bg-slate-900/55 px-4 py-3 text-sm text-slate-400">
                                  No feature tags added yet.
                                </div>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                              <button
                                type="button"
                                onClick={() => startEditingVenture(selectedVenture)}
                                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  void deleteVenture(selectedVenture.id);
                                }}
                                disabled={deletingVentureId === selectedVenture.id}
                                className="rounded-full border border-rose-400/20 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/15"
                              >
                                {deletingVentureId === selectedVenture.id
                                  ? "Deleting..."
                                  : "Delete"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </aside>
        ) : null}

        {activePrimaryOverlay === "new-feature" ? (
          <section className={primaryOverlayClassName}>
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                  New feature
                </p>
                <h2 className="mt-2 text-xl font-semibold text-white">
                  Start a new feature session
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Use the graph-first workspace to scope a new feature, pick tagged features, and send the next prompt.
                </p>
              </div>
              <button
                type="button"
                onClick={closePrimaryOverlay}
                className="rounded-full border border-white/10 bg-white/6 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
              >
                X
              </button>
            </div>
            <div className="agent-chat-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <AgentSessionPanel
                agentModels={agentModels}
                agentPromptMessage={agentPromptMessage}
                availableProjectDirectories={availableProjectDirectories}
                currentPromptQueueItem={currentPromptQueueItem}
                defaultProjectDirectory={DEFAULT_PROJECT_DIRECTORY}
                formatAgentPromptMessage={formatAgentPromptMessage}
                isAgentChatCleared={isAgentChatCleared}
                isPlanningMode={isPlanningMode}
                latestChat={latestChat}
                onAbandonQueuedAgentPrompt={abandonQueuedAgentPrompt}
                onClearAgentChat={clearAgentChat}
                onPlanningModeChange={setIsPlanningMode}
                onPromptTextChange={setPromptText}
                onRemoveTargetedFeature={removeTargetedFeature}
                onRetryQueuedAgentPrompt={retryQueuedAgentPrompt}
                onSelectedProjectDirectoryChange={setSelectedProjectDirectory}
                onSelectedReasoningChange={setSelectedReasoning}
                onSelectModel={selectModel}
                onSendPrompt={sendAgentPrompt}
                onTargetedFeatureAdd={addTargetedFeature}
                projects={projects ?? {}}
                promptQueueStatusText={promptQueueStatusText}
                promptText={promptText}
                selectedModelId={selectedModelId}
                selectedProjectDirectory={selectedProjectDirectory}
                selectedReasoning={selectedReasoning}
                targetedFeatures={targetedFeatures}
              />
            </div>
          </section>
        ) : null}

        {activePrimaryOverlay === "feature-detail" && selectedFeatureSession ? (
          <section className={primaryOverlayClassName}>
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                  Feature node
                </p>
                <h2 className="mt-2 text-xl font-semibold text-white">
                  {selectedFeatureSession.featureName}
                </h2>
                <p className="mt-2 break-all text-xs leading-5 text-slate-400">
                  {selectedFeatureSession.filePath}
                </p>
              </div>
              <button
                type="button"
                onClick={closePrimaryOverlay}
                className="rounded-full border border-white/10 bg-white/6 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
              >
                X
              </button>
            </div>
            <div className="border-b border-white/10 px-5 py-3">
              <div className="inline-flex rounded-full border border-white/10 bg-black/25 p-1">
                <button
                  type="button"
                  onClick={() => setFeatureDetailTab("chat")}
                  className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] transition ${
                    featureDetailTab === "chat"
                      ? "bg-cyan-300 text-slate-950"
                      : "text-slate-300 hover:bg-white/10"
                  }`}
                >
                  Chat
                </button>
                <button
                  type="button"
                  onClick={() => setFeatureDetailTab("info")}
                  className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] transition ${
                    featureDetailTab === "info"
                      ? "bg-cyan-300 text-slate-950"
                      : "text-slate-300 hover:bg-white/10"
                  }`}
                >
                  Info
                </button>
                <button
                  type="button"
                  onClick={() => setFeatureDetailTab("params")}
                  className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] transition ${
                    featureDetailTab === "params"
                      ? "bg-cyan-300 text-slate-950"
                      : "text-slate-300 hover:bg-white/10"
                  }`}
                >
                  Params
                </button>
              </div>
            </div>
            <div className="agent-chat-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {featureDetailTab === "chat" ? (
                <AgentSessionPanel
                  agentModels={agentModels}
                  agentPromptMessage={agentPromptMessage}
                  availableProjectDirectories={availableProjectDirectories}
                  currentPromptQueueItem={currentPromptQueueItem}
                  defaultProjectDirectory={DEFAULT_PROJECT_DIRECTORY}
                  formatAgentPromptMessage={formatAgentPromptMessage}
                  isAgentChatCleared={isAgentChatCleared}
                  isPlanningMode={isPlanningMode}
                  latestChat={latestChat}
                  onAbandonQueuedAgentPrompt={abandonQueuedAgentPrompt}
                  onClearAgentChat={clearAgentChat}
                  onPlanningModeChange={setIsPlanningMode}
                  onPromptTextChange={setPromptText}
                  onRemoveTargetedFeature={removeTargetedFeature}
                  onRetryQueuedAgentPrompt={retryQueuedAgentPrompt}
                  onSelectedProjectDirectoryChange={setSelectedProjectDirectory}
                  onSelectedReasoningChange={setSelectedReasoning}
                  onSelectModel={selectModel}
                  onSendPrompt={sendAgentPrompt}
                  onTargetedFeatureAdd={addTargetedFeature}
                  projects={projects ?? {}}
                  promptQueueStatusText={promptQueueStatusText}
                  promptText={promptText}
                  selectedModelId={selectedModelId}
                  selectedProjectDirectory={selectedProjectDirectory}
                  selectedReasoning={selectedReasoning}
                  targetedFeatures={targetedFeatures}
                />
              ) : featureDetailTab === "info" ? (
                <div className="grid gap-2">
                  <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                    Feature file
                  </p>
                  <pre className="whitespace-pre-wrap break-words rounded-[1.25rem] border border-white/10 bg-slate-900/70 px-4 py-3 text-sm leading-6 text-slate-200">
                    {selectedFeatureRecord?.markdown ||
                      "This feature file is no longer available in the loaded payload."}
                  </pre>
                </div>
              ) : (
                <div className="grid gap-5">
                  <section className="grid gap-2">
                    <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                      Parameter file
                    </p>
                    <p className="break-all text-xs leading-5 text-slate-500">
                      {getParameterFilePathForFeature(selectedFeatureSession.filePath)}
                    </p>
                    {matchedParameterFile ? (
                      <ParameterVariableSelector
                        key={`${selectedFeatureSession.projectPath}:${matchedParameterFile.path}`}
                        projectPath={selectedFeatureSession.projectPath}
                        parameterFilePath={matchedParameterFile.path}
                        parameterFile={matchedParameterFile}
                        onRequestSave={requestParameterFileUpdate}
                      />
                    ) : (
                      <div className="rounded-[1.25rem] border border-dashed border-white/10 bg-slate-900/40 px-4 py-3 text-sm text-slate-400">
                        No matching parameter file has been loaded for this feature yet.
                      </div>
                    )}
                  </section>
                </div>
              )}
            </div>
          </section>
        ) : null}

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
  supabaseUrl: string,
  supabasePublishableKey: string,
  accessToken: string,
  userId: string,
  purpose: string,
) {
  const url = new URL("/rest/v1/communications", supabaseUrl);
  url.searchParams.set("select", "message,purpose");
  url.searchParams.set("user_id", `eq.${userId}`);
  url.searchParams.set("purpose", `eq.${purpose}`);
  url.searchParams.set("limit", "1");
  const response = await fetch(url, {
    headers: getAuthenticatedSupabaseHeaders(
      supabasePublishableKey,
      accessToken,
    ),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("communications message fetch failed");
  }

  const rows = (await response.json()) as Array<{ message?: string }>;
  return rows[0]?.message ?? "";
}

async function updateMessage(
  supabaseUrl: string,
  supabasePublishableKey: string,
  accessToken: string,
  userId: string,
  purpose: string,
  message: string,
) {
  const existingRowsUrl = new URL("/rest/v1/communications", supabaseUrl);
  existingRowsUrl.searchParams.set("select", "message,purpose");
  existingRowsUrl.searchParams.set("user_id", `eq.${userId}`);
  existingRowsUrl.searchParams.set("purpose", `eq.${purpose}`);
  existingRowsUrl.searchParams.set("limit", "1");
  const existingRowsResponse = await fetch(existingRowsUrl, {
    headers: getAuthenticatedSupabaseHeaders(
      supabasePublishableKey,
      accessToken,
    ),
    cache: "no-store",
  });

  if (!existingRowsResponse.ok) {
    throw new Error("communications message lookup failed");
  }

  const existingRows = (await existingRowsResponse.json()) as Array<{
    message?: string;
  }>;
  const headers = getAuthenticatedSupabaseHeaders(
    supabasePublishableKey,
    accessToken,
  );
  const response =
    existingRows.length > 0
      ? await fetch(
          new URL(
            `/rest/v1/communications?user_id=eq.${userId}&purpose=eq.${purpose}`,
            supabaseUrl,
          ),
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({ message, purpose, user_id: userId }),
          },
        )
      : await fetch(new URL("/rest/v1/communications", supabaseUrl), {
          method: "POST",
          headers,
          body: JSON.stringify({ message, purpose, user_id: userId }),
        });

  if (!response.ok) {
    throw new Error("communications message update failed");
  }

  return message;
}

async function fetchDaemonPayload<TPayload>(
  supabaseUrl: string,
  supabasePublishableKey: string,
  accessToken: string,
  userId: string,
  kind: string,
) {
  const url = new URL("/rest/v1/daemon_payloads", supabaseUrl);
  url.searchParams.set("select", "payload");
  url.searchParams.set("user_id", `eq.${userId}`);
  url.searchParams.set("kind", `eq.${kind}`);
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: getAuthenticatedSupabaseHeaders(
      supabasePublishableKey,
      accessToken,
    ),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("daemon payload fetch failed");
  }

  const rows = (await response.json()) as Array<DaemonPayloadRow<TPayload>>;
  const row = rows[0];

  if (!row) {
    throw new Error("daemon payload missing");
  }

  return row.payload;
}

async function fetchVentures(
  supabaseUrl: string,
  supabasePublishableKey: string,
  accessToken: string,
  userId: string,
) {
  const url = new URL("/rest/v1/ventures", supabaseUrl);
  url.searchParams.set(
    "select",
    "id,created_at,details,feature_file_paths,project_directory,progress_state,user_id,venture_name",
  );
  url.searchParams.set("user_id", `eq.${userId}`);
  url.searchParams.set("order", "created_at.desc");

  const response = await fetch(url, {
    headers: getAuthenticatedSupabaseHeaders(
      supabasePublishableKey,
      accessToken,
    ),
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
  supabasePublishableKey: string,
  accessToken: string,
  userId: string,
  ventureName: string,
  details: string | null,
  projectDirectory: string | null,
  featureFilePaths: string[],
) {
  const url = new URL("/rest/v1/ventures", supabaseUrl);
  const response = await fetch(url, {
    method: "POST",
    headers: getAuthenticatedSupabaseHeaders(
      supabasePublishableKey,
      accessToken,
      {
        Prefer: "return=representation",
      },
    ),
    body: JSON.stringify({
      details,
      feature_file_paths: featureFilePaths,
      project_directory: projectDirectory,
      venture_name: ventureName,
      progress_state: "idle",
      user_id: userId,
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
  supabasePublishableKey: string,
  accessToken: string,
  userId: string,
  ventureId: string,
  updates: VentureUpdatePayload,
) {
  const url = new URL("/rest/v1/ventures", supabaseUrl);
  url.searchParams.set("id", `eq.${ventureId}`);
  url.searchParams.set("user_id", `eq.${userId}`);

  const response = await fetch(url, {
    method: "PATCH",
    headers: getAuthenticatedSupabaseHeaders(
      supabasePublishableKey,
      accessToken,
      {
        Prefer: "return=representation",
      },
    ),
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
  supabasePublishableKey: string,
  accessToken: string,
  userId: string,
  ventureId: string,
) {
  const url = new URL("/rest/v1/ventures", supabaseUrl);
  url.searchParams.set("id", `eq.${ventureId}`);
  url.searchParams.set("user_id", `eq.${userId}`);

  const response = await fetch(url, {
    method: "DELETE",
    headers: getAuthenticatedSupabaseHeaders(
      supabasePublishableKey,
      accessToken,
    ),
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

  if (
    trimmedMessage === DAEMON_RECEIVED_MESSAGE ||
    trimmedMessage === DAEMON_SENT_RESPONSE
  ) {
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
      promptId:
        typeof parsedMessage.promptId === "string"
          ? parsedMessage.promptId
          : undefined,
      state:
        typeof parsedMessage.state === "string"
          ? parsedMessage.state
          : undefined,
    };
  } catch {
    return null;
  }
}

function getAgentPromptQueueStatusText(queue: AgentPromptQueueEntry[]) {
  const activePrompt = queue.find(
    (item) => item.status === "sending" || item.status === "running",
  );

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

async function fetchLatestAgentChat(
  supabaseUrl: string,
  supabasePublishableKey: string,
  accessToken: string,
  userId: string,
) {
  try {
    return await fetchDaemonPayload<AgentChatExchange>(
      supabaseUrl,
      supabasePublishableKey,
      accessToken,
      userId,
      AGENT_CHAT_PAYLOAD_KIND,
    );
  } catch {
    return null;
  }
}

function parseParameterUpdateRowMessage(message: string): { state?: string } | null {
  const trimmedMessage = message.trim();

  if (!trimmedMessage) {
    return null;
  }

  try {
    const parsedMessage = JSON.parse(trimmedMessage) as { state?: unknown };

    if (typeof parsedMessage !== "object" || parsedMessage === null) {
      return null;
    }

    return {
      state:
        typeof parsedMessage.state === "string"
          ? parsedMessage.state
          : undefined,
    };
  } catch {
    return null;
  }
}

function getAuthenticatedSupabaseHeaders(
  supabasePublishableKey: string,
  accessToken: string,
  extraHeaders: Record<string, string> = {},
) {
  return {
    apikey: supabasePublishableKey,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...extraHeaders,
  };
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
    return parsedMessage.promptId
      ? `Daemon received prompt ${parsedMessage.promptId}`
      : "Daemon received prompt";
  }

  if (parsedMessage.state === DAEMON_SENT_RESPONSE) {
    return parsedMessage.promptId
      ? `Daemon sent response for ${parsedMessage.promptId}`
      : "Daemon sent response";
  }

  return parsedMessage.promptId
    ? `Prompt queued ${parsedMessage.promptId}`
    : "Prompt queued";
}

function mapVentureRowToItem(row: VentureRow): VentureItem {
  return {
    createdAt: row.created_at,
    details: row.details,
    featureFilePaths: row.feature_file_paths ?? [],
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
