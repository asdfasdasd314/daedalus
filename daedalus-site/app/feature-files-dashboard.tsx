"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient, type Session } from "@supabase/supabase-js";
import AgentSessionPanel from "./agent-session-panel";
import AopSessionPanel from "./aop-session-panel";
import AgentOutputViewer from "./agent-output-viewer";
import ArchitectureVisualization from "./architecture-visualization";
import AgentTaskNotifications, {
  type AgentTaskNotification,
} from "./agent-task-notifications";
import GitSyncPanel from "./git-sync-panel";
import type { GitSyncResult } from "./git-sync-types";
import { parseGitSyncRowMessage } from "./git-sync-utils";
import ProjectInitializerPanel from "./project-initializer-panel";
import type { ProjectInitializationResult } from "./project-initialization-types";
import {
  initializationStatusText,
  isTerminalInitializationStatus,
  serializeProjectInitializationRequest,
  shouldApplyInitializationResult,
  validateProjectName,
} from "./project-initialization-utils";
import FeatureFileGraph, {
  type FeatureGraphSelection,
} from "./feature-file-graph";
import FeatureSearchDialog, {
  type FeatureSearchMode,
} from "./feature-search-dialog";
import ParameterVariableSelector from "./parameter-variable-selector";
import EntryPointPicker from "./entry-point-picker";
import DaemonManagerPanel, { type DaemonManagerStatus } from "./daemon-manager-panel";
import type {
  AgentChatExchange,
  TargetedFeature,
} from "@/lib/agent-chat-cache";
import type { AgentModelsConfig } from "@/lib/agent-models";
import type { AgentOutputExchange as HistoryExchange } from "@/lib/agent-output-history";
import type { ArchitectureProgressEvent, ArchitectureView } from "@/lib/architecture-view";
import {
  buildImplementationPrompt,
  parsePlanningReply,
  type PlanningAnswer,
  type PlanningSession,
} from "@/lib/planning-questionnaire";
import {
  parseBridgeReply,
  type BridgeSession,
} from "@/lib/bridge-session";
import { fetchAgentOutputConversation } from "@/lib/agent-output-history";
import type { FeatureFileProjects } from "@/lib/feature-file-cache";
import type {
  ParameterFileProjects,
  ParameterFileRecord,
} from "@/lib/parameter-file-cache";
import { parseParameterFile } from "@/lib/parameter-file-parser";
import {
  getFeatureOptionsForProject,
  getFeatureTagsForPaths,
  getRunnableFeatureMetadata,
  buildFeatureExecutionRequest,
  getParameterFilePathForFeature,
  getProjectLabel,
  normalizeFeatureFilePath,
  normalizeParameterFilePath,
} from "./feature-workspace-utils";

type DashboardProps = {
  agentModels: AgentModelsConfig;
  pollIntervalMs: number;
  supabasePublishableKey: string;
  supabaseUrl: string;
};

const DAEMON_REVIEW = "daemon_review";
const DAEMON_ERROR = "daemon_error";
const DAEMON_COMPLETE = "daemon_complete";
const CLIENT_REVIEW = "client_review";
const CLIENT_COMPLETE = "client_complete";
const DAEMON_RECEIVED_MESSAGE = "daemon_received_message";
const DAEMON_SENT_FEATURE_FILES = "daemon_sent_feature_files";
const DAEMON_SENT_PARAMETER_FILES = "daemon_sent_parameter_files";
const DAEMON_SENT_RESPONSE = "daemon_sent_response";
const FEATURE_FILE_LOAD_PURPOSE = "feature_file_load";
const PARAMETER_FILE_LOAD_PURPOSE = "parameter_file_load";
const PARAMETER_FILE_UPDATE_PURPOSE = "parameter_file_update";
const PARAMETER_FILE_UPDATE_COMMAND = "parameter_file_update";
const ENTRY_POINT_UPDATE_PURPOSE = "entry_point_update";
const ENTRY_POINT_UPDATE_COMMAND = "entry_point_update";
const AGENT_PROMPT_PURPOSE = "agent_prompt";
const GIT_SYNC_PURPOSE = "git_sync_request";
const PROJECT_INITIALIZATION_PURPOSE = "project_initialization_request";
const FEATURE_FILES_PAYLOAD_KIND = "feature_files";
const PARAMETER_FILES_PAYLOAD_KIND = "parameter_files";
const GIT_SYNC_PAYLOAD_KIND = "git_sync_result";
const PROJECT_INITIALIZATION_PAYLOAD_KIND = "project_initialization_result";
const DEFAULT_PROJECT_DIRECTORY = "/Users/jameshollingsworth/Projects/daedalus";
const AGENT_PROMPT_QUEUE_STORAGE_KEY = "agent-prompt-queue-v1";
const PLANNING_SESSION_STORAGE_KEY = "planning-questionnaire-session-v1";
const BRIDGE_SESSION_STORAGE_KEY = "bridge-aop-session-v1";
const AGENT_PROMPT_TIMEOUT_MS = 5 * 60 * 1000;
const VENTURE_PROGRESS_STATES = ["idle", "in progress", "completed"] as const;
const DEFAULT_DESKTOP_MIN_ZOOM = 0.42;
const DEFAULT_DESKTOP_MAX_ZOOM = 2.6;
const DEFAULT_DESKTOP_ZOOM = 1;
const DEFAULT_MOBILE_MIN_ZOOM = 0.78;
const DEFAULT_MOBILE_MAX_ZOOM = 4.1;
const DEFAULT_MOBILE_ZOOM = 1.45;
const DEFAULT_DESKTOP_NODE_SCALE = 1;
const DEFAULT_MOBILE_NODE_SCALE = 0.65;
const DEFAULT_MOBILE_LABEL_MIN_ZOOM = 1.0;
const GRAPH_PARAMETER_FILE_PATH = "parameter_files/feature-file-graph-display.toml";
const DAEMON_ADMISSION_MESSAGE = "The execution daemon is draining for restart. New work will resume after the restart completes or is cancelled.";

type AuthMode = "sign-in" | "sign-up";
type DevEnvironmentState = "idle" | "loading" | "ready" | "error";
type PrimaryOverlay = "feature-detail" | "new-feature" | "git-sync" | "project-initialization" | null;
type FeatureDetailTab = "edit" | "info" | "params";
type WorkspaceView = "feature" | "architecture" | "aop";
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
  | "verifying"
  | "ready"
  | "integrating"
  | "resolving"
  | "blocked"
  | "completed"
  | "failed"
  | "cancelled"
  | "stalled";

const FINALIZED_AGENT_TASK_STATUSES: AgentPromptQueueStatus[] = [
  "completed",
  "failed",
  "blocked",
  "cancelled",
];
const MAX_AGENT_TASK_NOTIFICATIONS = 50;

type AgentPromptPayload = {
  promptId: string;
  conversationId?: string;
  directory: string;
  prompt: string;
  provider: string;
  model: string;
  reasoning: string;
  planningMode: boolean;
  askMode: boolean;
  bridgeMode: boolean;
  targetedFeaturePaths: string[];
  planningContext?: string;
  planningAnswers?: PlanningAnswer[];
  bridgeContext?: string;
  bridgeAnswers?: PlanningAnswer[];
};

type AgentPromptQueueEntry = AgentPromptPayload & {
  durableTaskId?: string;
  status: AgentPromptQueueStatus;
  enqueuedAt: number;
  sentAt?: number;
  completedAt?: number;
  // Durable-task recovery RPCs compare this exact database value. Do not
  // round-trip it through Date, which drops PostgreSQL's microseconds.
  updatedAt?: string;
  error?: string;
  verificationAttempts?: number;
  cancelRequested?: boolean;
};

type AgentTaskRow = {
  id: string;
  repository: string;
  prompt: string;
  provider: string;
  model: string;
  reasoning: string;
  planning_mode: boolean;
  targeted_feature_paths: string[];
  status: AgentPromptQueueStatus;
  queue_sequence: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error: string;
  verification_attempts: number;
  cancel_requested?: boolean;
  message?: string;
  updated_at: string;
  retry_generation?: number;
};

type ConversationDeletionRequestRow = { id: string; conversation_id: string; task_ids: string[]; status: "completed" | "rejected" | "requested"; error: string; updated_at: string };

type DaemonEventRow = {
  id: number;
  event_type:
    | "status"
    | "task_integrated"
    | "migration_deployment_started"
    | "migration_deployment_no_pending"
    | "migration_deployment_succeeded"
    | "migration_deployment_blocked";
  severity: "info" | "warning" | "error";
  content: string;
  created_at: string;
  updated_at: string;
};

type ParsedAgentPromptRow = {
  promptId?: string;
  state?: string;
};

type DaemonPayloadRow<TPayload> = {
  kind: string;
  payload: TPayload;
  updated_at: string;
};

type ParameterUpdateRequest = {
  parameterFilePath: string;
  projectPath: string;
  value: string;
  variableName: string;
};
type EntryPointUpdateRequest = { projectPath: string; featureFilePath: string; operation: "add" | "update" | "delete"; entryPoint?: string };

type SelectedFeatureSession = {
  featureName: string;
  filePath: string;
  projectPath: string;
};

type FeatureExecutionStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
type FeatureExecutionRunRow = {
  id: string; project_directory: string; feature_file_path: string;
  status: FeatureExecutionStatus; cancel_requested: boolean; command: string[]; parameter_file_path: string; entry_point_path: string;
  started_at: string | null; completed_at: string | null; exit_code: number | null;
  stdout_tail: string; stderr_tail: string; error: string; message?: string; updated_at: string;
  detail_loaded?: boolean;
};

type ReviewReceipt = {
  receiptId: string;
  transport: "communications" | "daemonPayloads" | "agentTasks" | "conversationDeletionRequests" | "architectureViews" | "architectureProgressEvents" | "featureExecutionRuns" | "daemonEvents" | "managerStatus";
  key: string;
  updatedAt?: string;
  generation?: number;
};

type ClientReviewInbox = {
  communications: Array<{ purpose: string; content: string | null; updated_at: string }>;
  daemonPayloads: DaemonPayloadRow<unknown>[];
  agentTasks: AgentTaskRow[];
  conversationDeletionRequests: ConversationDeletionRequestRow[];
  architectureViews: ArchitectureView[];
  architectureProgressEvents: ArchitectureProgressEvent[];
  featureExecutionRuns: FeatureExecutionRunRow[];
  daemonEvents: DaemonEventRow[];
  managerStatus: DaemonManagerStatus | null;
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
  const [selectedAgentMode, setSelectedAgentMode] = useState<
    "standard" | "planning" | "ask"
  >("standard");
  const [message, setMessage] = useState("");
  const [parameterFileMessage, setParameterFileMessage] = useState("");
  const [, setAgentPromptMessage] = useState("");
  const [parameterUpdateMessage, setParameterUpdateMessage] = useState("");
  const [entryPointUpdateMessage, setEntryPointUpdateMessage] = useState("");
  const [isEntryPointUpdatePending, setIsEntryPointUpdatePending] = useState(false);
  const [entryPointUpdateError, setEntryPointUpdateError] = useState("");
  const [promptText, setPromptText] = useState("");
  const [promptSubmissionError, setPromptSubmissionError] = useState("");
  const [, setPromptStatus] = useState("");
  const [lastIntegratedTaskStatus, setLastIntegratedTaskStatus] =
    useState("");
  const [latestChat, setLatestChat] = useState<AgentChatExchange | null>(null);
  const [planningSession, setPlanningSession] = useState<PlanningSession | null>(null);
  const [bridgeSession, setBridgeSession] = useState<BridgeSession | null>(null);
  const [aopDirectionText, setAopDirectionText] = useState("");
  const [bridgeOtherAnswer, setBridgeOtherAnswer] = useState("");
  const [agentPromptQueue, setAgentPromptQueue] = useState<
    AgentPromptQueueEntry[]
  >([]);
  const bridgeSessionRef = useRef<BridgeSession | null>(null);
  const [durableAgentTasks, setDurableAgentTasks] = useState<
    AgentPromptQueueEntry[]
  >([]);
  const [synchronizedDeletedPromptIds, setSynchronizedDeletedPromptIds] = useState<string[]>([]);
  const [confirmedDeletedPromptIds, setConfirmedDeletedPromptIds] = useState<string[]>([]);
  const [confirmedDeletedTaskIds, setConfirmedDeletedTaskIds] = useState<string[]>([]);
  const [deletionRequestPromptIds, setDeletionRequestPromptIds] = useState<string[]>([]);
  const [deletionRequestErrors, setDeletionRequestErrors] = useState<Record<string, string>>({});
  const [architectureViews, setArchitectureViews] = useState<
    Record<string, ArchitectureView>
  >({});
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("feature");
  const [architectureCanvasPromptId, setArchitectureCanvasPromptId] = useState("");
  const [isAgentPromptQueueHydrated, setIsAgentPromptQueueHydrated] =
    useState(false);
  const [finalizedDurableTaskCount, setFinalizedDurableTaskCount] =
    useState(0);
  const [projects, setProjects] = useState<FeatureFileProjects | null>(null);
  const [parameterProjects, setParameterProjects] =
    useState<ParameterFileProjects | null>(null);
  const [featureExecutionRuns, setFeatureExecutionRuns] = useState<FeatureExecutionRunRow[]>([]);
  const [featureExecutionMessage, setFeatureExecutionMessage] = useState("");
  const [selectedModelId, setSelectedModelId] = useState(defaultModel.id);
  const [selectedProvider, setSelectedProvider] = useState("codex");
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
    useState<FeatureDetailTab>("edit");
  const [graphZoom, setGraphZoom] = useState(1);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [selectedFeatureSession, setSelectedFeatureSession] =
    useState<SelectedFeatureSession | null>(null);
  const [venturesDrawerOpen, setVenturesDrawerOpen] = useState(false);
  const [isAgentOutputViewerOpen, setIsAgentOutputViewerOpen] = useState(false);
  const [selectedHistoryPromptId, setSelectedHistoryPromptId] = useState("");
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const [isAgentTaskNotificationsOpen, setIsAgentTaskNotificationsOpen] =
    useState(false);
  const [agentTaskNotifications, setAgentTaskNotifications] = useState<
    AgentTaskNotification[]
  >([]);
  const [gitSyncCommitMessage, setGitSyncCommitMessage] = useState("");
  const [gitSyncProjectDirectory, setGitSyncProjectDirectory] = useState(
    DEFAULT_PROJECT_DIRECTORY,
  );
  const [gitSyncStatus, setGitSyncStatus] = useState("");
  const [gitSyncResult, setGitSyncResult] = useState<GitSyncResult | null>(null);
  const [isGitSyncRequestInFlight, setIsGitSyncRequestInFlight] = useState(false);
  const [projectInitializationName, setProjectInitializationName] = useState("");
  const [projectInitializationCreateGitHub, setProjectInitializationCreateGitHub] = useState(false);
  const [projectInitializationStatus, setProjectInitializationStatus] = useState("");
  const [projectInitializationResult, setProjectInitializationResult] =
    useState<ProjectInitializationResult | null>(null);
  const [isProjectInitializationInFlight, setIsProjectInitializationInFlight] = useState(false);
  const [featureSearchMode, setFeatureSearchMode] =
    useState<FeatureSearchMode | null>(null);
  const [isGraphPhysicsEnabled, setIsGraphPhysicsEnabled] = useState(true);
  const [isGraphZoomSliderVisible, setIsGraphZoomSliderVisible] =
    useState(true);
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
  const [isConfirmingClearCompletedVentures, setIsConfirmingClearCompletedVentures] =
    useState(false);
  const [isClearingCompletedVentures, setIsClearingCompletedVentures] =
    useState(false);
  const [isConfirmingClearDurableTasks, setIsConfirmingClearDurableTasks] =
    useState(false);
  const [isClearingDurableTasks, setIsClearingDurableTasks] = useState(false);
  const [savingVentureId, setSavingVentureId] = useState("");
  const [updatingProgressVentureId, setUpdatingProgressVentureId] =
    useState("");
  const [deletingVentureId, setDeletingVentureId] = useState("");
  const [ventureError, setVentureError] = useState("");
  const [error, setError] = useState("");
  const [managerStatus, setManagerStatus] = useState<DaemonManagerStatus | null>(null);
  const [managerOnline, setManagerOnline] = useState(false);
  const [managerClock, setManagerClock] = useState(() => Date.now());
  const latestLocalWriteStartedAt = useRef(0);
  const latestParameterUpdateWriteStartedAt = useRef(0);
  const initialDevEnvironmentUserIdRef = useRef("");
  const activePromptId = useRef("");
  const activeGitSyncRequestId = useRef("");
  const activeProjectInitializationRequestId = useRef("");
  const agentPromptQueueRef = useRef<AgentPromptQueueEntry[]>([]);
  const graphZoomProfileRef = useRef("");
  const workspaceMenuRef = useRef<HTMLDivElement | null>(null);
  const previousDurableTaskStatusesRef = useRef<
    Map<string, AgentPromptQueueStatus>
  >(new Map());
  const hasSeededDurableTaskStatusesRef = useRef(false);
  const featureHistoryDrawerOpenRef = useRef(false);
  const latestChatRef = useRef<AgentChatExchange | null>(null);
  const observedExecutionGenerationRef = useRef<number | null>(null);
  const refreshInboxRef = useRef<() => void>(() => undefined);
  const taskHydrationGenerationRef = useRef(0);
  const currentUser = session?.user ?? null;
  const currentUserId = currentUser?.id ?? "";
  const accessToken = session?.access_token ?? "";
  const daemonAcceptsWork = managerStatus === null
    ? true
    : managerOnline && managerStatus.accepts_work;

  const applyProjectInitializationResult = useCallback((result: ProjectInitializationResult) => {
    if (!shouldApplyInitializationResult(activeProjectInitializationRequestId.current, result)) {
      return;
    }
    setProjectInitializationResult(result);
    setProjectInitializationStatus(initializationStatusText(result));
    if (isTerminalInitializationStatus(result.status)) {
      setIsProjectInitializationInFlight(false);
      activeProjectInitializationRequestId.current = "";
    }
  }, []);
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setManagerOnline(managerStatus ? isManagerHeartbeatCurrent(managerStatus) : false);
      setManagerClock(Date.now());
    }, 1000);
    return () => window.clearTimeout(timeout);
  }, [managerClock, managerStatus]);

  useEffect(() => {
    if (!managerStatus || !daemonAcceptsWork) return;
    const previousGeneration = observedExecutionGenerationRef.current;
    observedExecutionGenerationRef.current = managerStatus.execution_generation;
    if (previousGeneration === null || previousGeneration === managerStatus.execution_generation) return;
    void requestDevEnvironment();
    // Refresh execution-owned payloads only after a successful generation change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daemonAcceptsWork, managerStatus?.execution_generation]);

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
    if (!currentUser || !accessToken) {
      initialDevEnvironmentUserIdRef.current = "";
      return;
    }

    if (initialDevEnvironmentUserIdRef.current === currentUserId) {
      return;
    }

    initialDevEnvironmentUserIdRef.current = currentUserId;
    void requestDevEnvironment();
    // The startup load should run once for each signed-in user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, currentUser, currentUserId]);

  useEffect(() => {
    agentPromptQueueRef.current = agentPromptQueue;
  }, [agentPromptQueue]);

  useEffect(() => {
    bridgeSessionRef.current = bridgeSession;
  }, [bridgeSession]);

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
        setAgentPromptQueue(
          Array.isArray(parsedQueue)
            ? parsedQueue.filter(
              (item) => item.planningMode || item.askMode || item.bridgeMode,
            )
            : [],
        );
      }

      const storedPlanningSession = window.localStorage.getItem(
        PLANNING_SESSION_STORAGE_KEY,
      );

      if (storedPlanningSession) {
        const parsedPlanningSession = JSON.parse(
          storedPlanningSession,
        ) as PlanningSession;
        setPlanningSession(parsedPlanningSession);
      }

      const storedBridgeSession = window.localStorage.getItem(
        BRIDGE_SESSION_STORAGE_KEY,
      );

      if (storedBridgeSession) {
        const parsedBridgeSession = JSON.parse(
          storedBridgeSession,
        ) as BridgeSession;
        setBridgeSession({
          ...parsedBridgeSession,
          cpDoc: parsedBridgeSession.cpDoc ?? parsedBridgeSession.directionPrompt ?? "",
        });
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

    if (planningSession) {
      window.localStorage.setItem(
        PLANNING_SESSION_STORAGE_KEY,
        JSON.stringify(planningSession),
      );
      return;
    }

    window.localStorage.removeItem(PLANNING_SESSION_STORAGE_KEY);
  }, [isAgentPromptQueueHydrated, planningSession]);

  useEffect(() => {
    if (!isAgentPromptQueueHydrated) {
      return;
    }

    if (bridgeSession) {
      window.localStorage.setItem(
        BRIDGE_SESSION_STORAGE_KEY,
        JSON.stringify(bridgeSession),
      );
      return;
    }

    window.localStorage.removeItem(BRIDGE_SESSION_STORAGE_KEY);
  }, [bridgeSession, isAgentPromptQueueHydrated]);

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
    if (!isWorkspaceMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (workspaceMenuRef.current?.contains(target)) {
        return;
      }

      setIsWorkspaceMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsWorkspaceMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isWorkspaceMenuOpen]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    function handleFeatureSearchShortcut(event: KeyboardEvent) {
      if (workspaceView !== "feature") return;
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") {
        return;
      }

      event.preventDefault();
      setIsWorkspaceMenuOpen(false);
      setFeatureSearchMode("navigate");
    }

    document.addEventListener("keydown", handleFeatureSearchShortcut);

    return () => {
      document.removeEventListener("keydown", handleFeatureSearchShortcut);
    };
  }, [currentUser, workspaceView]);

  const graphZoomSettings = useMemo(
    () => getGraphZoomSettings(parameterProjects, isMobileLayout),
    [isMobileLayout, parameterProjects],
  );

  useEffect(() => {
    const nextProfileKey = [
      isMobileLayout ? "mobile" : "desktop",
      graphZoomSettings.minZoom,
      graphZoomSettings.maxZoom,
      graphZoomSettings.defaultZoom,
    ].join(":");

    setGraphZoom((currentZoom) => {
      const clampedZoom = clampNumber(
        currentZoom,
        graphZoomSettings.minZoom,
        graphZoomSettings.maxZoom,
      );

      if (graphZoomProfileRef.current !== nextProfileKey) {
        graphZoomProfileRef.current = nextProfileKey;
        return graphZoomSettings.defaultZoom;
      }

      return clampedZoom;
    });
  }, [graphZoomSettings, isMobileLayout]);

  useEffect(() => {
    if (!currentUser || !accessToken) return;
    let mounted = true;
    let timeout: number | undefined;
    let inFlight = false;
    let pollCount = 0;
    let responseBytes = 0;
    let measurementStartedAt = Date.now();

    function schedule(delay = pollIntervalMs) {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => void pollInbox(), delay);
    }

    async function pollInbox() {
      if (!mounted || inFlight) return;
      if (document.hidden) {
        schedule(Math.max(pollIntervalMs * 6, 30000));
        return;
      }
      inFlight = true;
      try {
        const inbox = await fetchClientReviewInbox(
          supabaseUrl, supabasePublishableKey, accessToken,
        );
        if (!mounted) return;
        pollCount += 1;
        responseBytes += new TextEncoder().encode(JSON.stringify(inbox)).byteLength;
        if (Date.now() - measurementStartedAt >= 300000) {
          console.info("Supabase review inbox aggregate", { pollCount, responseBytes });
          pollCount = 0;
          responseBytes = 0;
          measurementStartedAt = Date.now();
        }
        const receipts: ReviewReceipt[] = [];
        for (const review of inbox.communications) {
          const content = review.content ?? "";
          if (review.purpose === FEATURE_FILE_LOAD_PURPOSE) setMessage(content);
          if (review.purpose === PARAMETER_FILE_LOAD_PURPOSE) setParameterFileMessage(content);
          if (review.purpose === PARAMETER_FILE_UPDATE_PURPOSE) setParameterUpdateMessage(content);
          if (review.purpose === ENTRY_POINT_UPDATE_PURPOSE) setEntryPointUpdateMessage(content);
          if (review.purpose === AGENT_PROMPT_PURPOSE) {
            setAgentPromptMessage(content);
            // eslint-disable-next-line react-hooks/immutability
            syncAgentPromptQueueFromRowMessage(content);
          }
          receipts.push(reviewReceipt("communications", review.purpose, review.updated_at));
        }
        for (const review of inbox.daemonPayloads) {
          if (review.kind === FEATURE_FILES_PAYLOAD_KIND) {
            const nextProjects = (review.payload as { projects?: FeatureFileProjects }).projects ?? {};
            setProjects(nextProjects);
            if (Object.values(nextProjects).some((files) => files.some((file) => file.omitted))) {
              setError("Some feature files exceeded the snapshot transfer limit. Reduce the file size or adjust the scanner limits before reloading.");
            }
            setIsLoadingFeatureFiles(false);
          } else if (review.kind === PARAMETER_FILES_PAYLOAD_KIND) {
            setParameterProjects((review.payload as { projects?: ParameterFileProjects }).projects ?? {});
            setIsLoadingParameterFiles(false);
          } else if (review.kind === GIT_SYNC_PAYLOAD_KIND) {
            const result = review.payload as GitSyncResult;
            if (!activeGitSyncRequestId.current || result.requestId === activeGitSyncRequestId.current) {
              setGitSyncResult(result);
              setGitSyncStatus(result.status === "success" ? `${result.operation} completed successfully.` : `${result.operation} failed. Review the command output below.`);
              setIsGitSyncRequestInFlight(false);
              activeGitSyncRequestId.current = "";
            }
          } else if (review.kind === PROJECT_INITIALIZATION_PAYLOAD_KIND) {
            applyProjectInitializationResult(review.payload as ProjectInitializationResult);
          }
          receipts.push(reviewReceipt("daemonPayloads", review.kind, review.updated_at));
        }
        if (inbox.agentTasks.length) {
          const queue = inbox.agentTasks.map(mapAgentTaskRowToQueueEntry);
          const nextNotifications: AgentTaskNotification[] = [];
          for (const entry of queue) {
            const previousStatus = previousDurableTaskStatusesRef.current.get(entry.promptId);
            if (hasSeededDurableTaskStatusesRef.current && isFinalizedAgentTaskStatus(entry.status)
              && previousStatus !== entry.status
              && (previousStatus === undefined || !isFinalizedAgentTaskStatus(previousStatus))) {
              nextNotifications.push({
                id: crypto.randomUUID(), taskId: entry.promptId,
                status: entry.status as AgentTaskNotification["status"], prompt: entry.prompt,
                repository: entry.directory, error: entry.error, createdAt: Date.now(), read: false,
              });
            }
            previousDurableTaskStatusesRef.current.set(entry.promptId, entry.status);
          }
          hasSeededDurableTaskStatusesRef.current = true;
          if (nextNotifications.length) {
            if (process.env.NODE_ENV !== "production") {
              console.debug("Agent task terminal transitions accepted", {
                count: nextNotifications.length,
                statuses: nextNotifications.map((notification) => notification.status),
              });
            }
            setFinalizedDurableTaskCount((current) => current + nextNotifications.length);
            setAgentTaskNotifications((current) => (
              [...nextNotifications.reverse(), ...current].slice(0, MAX_AGENT_TASK_NOTIFICATIONS)
            ));
          }
          setDurableAgentTasks((current) => {
            const merged = new Map(current.map((row) => [row.promptId, row]));
            for (const row of queue) if (!confirmedDeletedTaskIds.includes(row.durableTaskId ?? "")) merged.set(row.promptId, row);
            return [...merged.values()].sort((left, right) => left.enqueuedAt - right.enqueuedAt);
          });
          receipts.push(...inbox.agentTasks.map((row) => reviewReceipt("agentTasks", row.id, row.updated_at)));
        }
        if ((inbox.conversationDeletionRequests ?? []).length) {
          for (const request of inbox.conversationDeletionRequests) {
            if (request.status === "completed") {
              setSynchronizedDeletedPromptIds((current) => current.includes(request.conversation_id)
                ? current : [...current, request.conversation_id]);
              setConfirmedDeletedTaskIds((current) => [...new Set([...current, ...request.task_ids])]);
              setDurableAgentTasks((current) => current.filter((task) => !request.task_ids.includes(task.durableTaskId ?? "")));
            }
            if (request.status === "rejected") setPromptStatus(request.error || "Conversation deletion was rejected.");
          }
          receipts.push(...inbox.conversationDeletionRequests.map((request) => reviewReceipt(
            "conversationDeletionRequests", request.id, request.updated_at,
          )));
        }
        if ((inbox.architectureViews ?? []).length) {
          setArchitectureViews((current) => {
            let next = current;
            for (const view of inbox.architectureViews ?? []) {
              next = mergeArchitectureView(next, view);
            }
            return next;
          });
          receipts.push(...(inbox.architectureViews ?? []).map((view) => reviewReceipt(
            "architectureViews", view.id, view.updated_at, view.generation,
          )));
        }
        if ((inbox.architectureProgressEvents ?? []).length) {
          setArchitectureViews((current) => mergeArchitectureProgressEvents(
            current, inbox.architectureProgressEvents ?? [],
          ));
          receipts.push(...(inbox.architectureProgressEvents ?? []).map((event) => reviewReceipt(
            "architectureProgressEvents", event.id, event.updated_at, event.generation,
          )));
        }
        const integratedTaskEvents = inbox.daemonEvents.filter((event) => event.event_type === "task_integrated");
        if (integratedTaskEvents.length) {
          const latestCompletion = integratedTaskEvents.at(-1);
          if (latestCompletion) setLastIntegratedTaskStatus(`Daemon: ${latestCompletion.content}`);
        }
        const latestEvent = inbox.daemonEvents.at(-1);
        if (latestEvent) setPromptStatus(`Daemon ${latestEvent.severity}: ${latestEvent.content}`);
        receipts.push(...inbox.daemonEvents.map((row) => reviewReceipt("daemonEvents", String(row.id), row.updated_at)));
        if (inbox.featureExecutionRuns.length) {
          setFeatureExecutionRuns((current) => {
            const merged = new Map(current.map((row) => [row.id, row]));
            for (const row of inbox.featureExecutionRuns) merged.set(row.id, { ...row, detail_loaded: true });
            return [...merged.values()];
          });
          receipts.push(...inbox.featureExecutionRuns.map((row) => reviewReceipt("featureExecutionRuns", row.id, row.updated_at)));
        }
        if (inbox.managerStatus) {
          setManagerStatus(inbox.managerStatus);
          setManagerOnline(isManagerHeartbeatCurrent(inbox.managerStatus));
          receipts.push(reviewReceipt("managerStatus", currentUserId, inbox.managerStatus.updated_at));
        } else if (managerStatus) {
          setManagerOnline(isManagerHeartbeatCurrent(managerStatus));
        }
        setError("");
        if (receipts.length) {
          const acknowledgement = await acknowledgeClientReviews(
            supabaseUrl, supabasePublishableKey, accessToken, receipts,
          );
          if (process.env.NODE_ENV !== "production") {
            console.debug("Supabase client-review acknowledgement", {
              requested: receipts.length,
              acknowledged: acknowledgement.acknowledged.length,
              rejectedAsStale: acknowledgement.rejected.length,
            });
          }
        }
      } catch {
        if (mounted) setError("Unable to reach Supabase right now.");
      } finally {
        inFlight = false;
        if (mounted) schedule();
      }
    }

    function handleVisibility() {
      if (!document.hidden) schedule(0);
    }
    refreshInboxRef.current = () => schedule(0);
    document.addEventListener("visibilitychange", handleVisibility);
    schedule(0);
    return () => {
      mounted = false;
      window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", handleVisibility);
      refreshInboxRef.current = () => undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, currentUser, currentUserId, pollIntervalMs, supabasePublishableKey, supabaseUrl]);

  useEffect(() => {
    const result = parseParameterUpdateRowMessage(entryPointUpdateMessage) as { state?: string; error?: string } | null;
    if (!result) return;
    if (result.state === DAEMON_ERROR) {
      setEntryPointUpdateError(result.error || "The daemon could not update the entry point.");
      setIsEntryPointUpdatePending(false);
      return;
    }
    if (result.state !== DAEMON_COMPLETE || !currentUser || !accessToken) return;
    fetchDaemonPayload<{ projects?: ParameterFileProjects }>(supabaseUrl, supabasePublishableKey, accessToken, currentUserId, PARAMETER_FILES_PAYLOAD_KIND)
      .then((body) => { if (body) setParameterProjects(body.projects ?? {}); setEntryPointUpdateError(""); setIsEntryPointUpdatePending(false); })
      .catch(() => { setEntryPointUpdateError("The entry point changed, but refreshed parameters were unavailable."); setIsEntryPointUpdatePending(false); });
  }, [accessToken, confirmedDeletedTaskIds, currentUser, currentUserId, entryPointUpdateMessage, supabasePublishableKey, supabaseUrl]);

  const rehydrateDurableAgentTasks = useCallback(async () => {
    if (!currentUser || !accessToken) return;
    const userId = currentUserId;
    const generation = ++taskHydrationGenerationRef.current;
    const [rows, deletionRequests] = await Promise.all([
      fetchActiveAgentTaskSummaries(supabaseUrl, supabasePublishableKey, accessToken, userId),
      fetchDurableTaskDeletionRequests(supabaseUrl, supabasePublishableKey, accessToken, userId),
    ]);
    if (generation !== taskHydrationGenerationRef.current || userId !== currentUserId) return;
    const hiddenPromptIds = deletionRequests
      .filter((request) => request.status === "requested" || request.status === "completed")
      .map((request) => request.conversation_id);
    const completedPromptIds = deletionRequests
      .filter((request) => request.status === "completed")
      .map((request) => request.conversation_id);
    const completedTaskIds = deletionRequests
      .filter((request) => request.status === "completed")
      .flatMap((request) => request.task_ids);
    const rejectedErrors = Object.fromEntries(deletionRequests
      .filter((request) => request.status === "rejected")
      .map((request) => [request.conversation_id, request.error || "Conversation deletion was rejected."]));
    setSynchronizedDeletedPromptIds(hiddenPromptIds);
    setConfirmedDeletedPromptIds(completedPromptIds);
    setConfirmedDeletedTaskIds(completedTaskIds);
    setDeletionRequestPromptIds(deletionRequests.map((request) => request.conversation_id));
    setDeletionRequestErrors(rejectedErrors);
    const activeEntries = rows.map(mapAgentTaskRowToQueueEntry);
    setDurableAgentTasks(activeEntries.filter((entry) => !completedTaskIds.includes(entry.durableTaskId ?? "")).sort(
      (left, right) => left.enqueuedAt - right.enqueuedAt,
    ));
    for (const row of rows) {
      previousDurableTaskStatusesRef.current.set(row.id, row.status);
    }
    hasSeededDurableTaskStatusesRef.current = true;
  }, [
    accessToken,
    currentUser,
    currentUserId,
    supabasePublishableKey,
    supabaseUrl,
  ]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDurableAgentTasks([]);
    setSynchronizedDeletedPromptIds([]);
    setConfirmedDeletedPromptIds([]);
    setConfirmedDeletedTaskIds([]);
    setDeletionRequestPromptIds([]);
    setDeletionRequestErrors({});
    setArchitectureViews({});
    setArchitectureCanvasPromptId("");
    setSelectedHistoryPromptId("");
    setWorkspaceView("feature");
    setIsAgentOutputViewerOpen(false);
    featureHistoryDrawerOpenRef.current = false;
    setFinalizedDurableTaskCount(0);
    setLastIntegratedTaskStatus("");
    setAgentTaskNotifications([]);
    setIsAgentTaskNotificationsOpen(false);
    previousDurableTaskStatusesRef.current = new Map();
    hasSeededDurableTaskStatusesRef.current = false;
    taskHydrationGenerationRef.current += 1;
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUser || !accessToken) return;
    void rehydrateDurableAgentTasks();
  }, [accessToken, currentUser, rehydrateDurableAgentTasks]);

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
      if (!body) return;
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
    if (!currentUser || !accessToken) return;
    let mounted = true;
    void Promise.all([
      fetchFeatureExecutionHydration(
        supabaseUrl, supabasePublishableKey, accessToken, currentUserId,
      ),
      fetchFeatureExecutionHistorySummaries(
        supabaseUrl, supabasePublishableKey, accessToken, currentUserId,
      ),
    ]).then(([activeRows, historyRows]) => {
      if (mounted) setFeatureExecutionRuns([...activeRows, ...historyRows]);
    }).catch(() => undefined);
    async function pollFeatureRuns() {
      try {
        const rows = await fetchFeatureExecutionRuns(
          supabaseUrl, supabasePublishableKey, accessToken, currentUserId,
        );
        if (!mounted) return;
        setFeatureExecutionRuns((currentRows) => {
          const nextRows = new Map(currentRows.map((row) => [row.id, row]));
          for (const row of rows) nextRows.set(row.id, row);
          return [...nextRows.values()];
        });
        await Promise.all(rows.map((row) =>
          completeFeatureExecutionReview(
            supabaseUrl, supabasePublishableKey, accessToken, currentUserId, row.id, row.updated_at,
          ),
        ));
      } catch {
        if (mounted) setFeatureExecutionMessage("Unable to refresh feature execution status.");
      }
    }
    void pollFeatureRuns;
    return () => { mounted = false; };
  }, [accessToken, currentUser, currentUserId, pollIntervalMs, supabasePublishableKey, supabaseUrl]);

  useEffect(() => {
    if (!currentUser || !accessToken || !selectedFeatureSession) return;
    const summary = featureExecutionRuns.find((run) =>
      run.project_directory === selectedFeatureSession.projectPath &&
      normalizeFeatureFilePath(run.feature_file_path) === selectedFeatureSession.filePath &&
      !run.detail_loaded && ["completed", "failed", "cancelled"].includes(run.status),
    );
    if (!summary) return;
    void fetchFeatureExecutionRunDetail(
      supabaseUrl, supabasePublishableKey, accessToken, currentUserId, summary.id,
    ).then((detail) => {
      if (!detail) return;
      setFeatureExecutionRuns((rows) => rows.map((row) => row.id === detail.id ? detail : row));
    }).catch(() => undefined);
  }, [accessToken, currentUser, currentUserId, featureExecutionRuns, selectedFeatureSession, supabasePublishableKey, supabaseUrl]);

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
      if (!body) return;
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
    if (!currentUser || !accessToken) return;
    let isMounted = true;

    async function pollProjectPayloads() {
      const reviews = await fetchDaemonPayloadReviews(
        supabaseUrl, supabasePublishableKey, accessToken, currentUserId,
      );
      if (!isMounted) return;
      for (const review of reviews) {
        if (review.kind === FEATURE_FILES_PAYLOAD_KIND) {
          const payload = review.payload as { projects?: FeatureFileProjects };
          setProjects(payload.projects ?? {});
          setIsLoadingFeatureFiles(false);
        } else if (review.kind === PARAMETER_FILES_PAYLOAD_KIND) {
          const payload = review.payload as { projects?: ParameterFileProjects };
          setParameterProjects(payload.projects ?? {});
          setIsLoadingParameterFiles(false);
        } else if (review.kind === GIT_SYNC_PAYLOAD_KIND) {
          const nextResult = review.payload as GitSyncResult;
          const currentRequestId = activeGitSyncRequestId.current;
          if (!currentRequestId || nextResult.requestId === currentRequestId) {
            setGitSyncResult(nextResult);
            setGitSyncStatus(nextResult.status === "success"
              ? `${nextResult.operation} completed successfully.`
              : `${nextResult.operation} failed. Review the command output below.`);
            setIsGitSyncRequestInFlight(false);
            activeGitSyncRequestId.current = "";
          }
        } else if (review.kind === PROJECT_INITIALIZATION_PAYLOAD_KIND) {
          applyProjectInitializationResult(review.payload as ProjectInitializationResult);
        }
        await completeDaemonPayloadReview(
          supabaseUrl, supabasePublishableKey, accessToken, currentUserId,
          review.kind, review.updated_at,
        );
      }
    }

    void pollProjectPayloads().catch(() => undefined);
    return () => {
      isMounted = false;
    };
  }, [
    accessToken,
    applyProjectInitializationResult,
    currentUser,
    currentUserId,
    pollIntervalMs,
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
      if (!body) return;
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
      (item) =>
        (item.planningMode || item.askMode || item.bridgeMode) &&
        (item.status === "sending" || item.status === "running"),
    );

    if (activePrompt) {
      return;
    }

    const nextQueuedPrompt = agentPromptQueue.find(
      (item) =>
        item.status === "queued" &&
        (item.planningMode || item.askMode || item.bridgeMode),
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
    daemonAcceptsWork,
    isAgentPromptQueueHydrated,
  ]);

  useEffect(() => {
    if (!isAgentPromptQueueHydrated) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const activePrompt = agentPromptQueueRef.current.find(
        (item) =>
          (item.planningMode || item.askMode || item.bridgeMode) &&
          (item.status === "sending" || item.status === "running"),
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
    setIsWorkspaceMenuOpen(false);
    await supabase.auth.signOut();
    setSession(null);
    setProjects(null);
    setParameterProjects(null);
    setFeatureExecutionRuns([]);
    setFeatureExecutionMessage("");
    setSelectedFeatureSession(null);
    setActivePrimaryOverlay(null);
    setVenturesDrawerOpen(false);
    setVentures([]);
    setLatestChat(null);
    setDurableAgentTasks([]);
    setManagerStatus(null);
    setManagerOnline(false);
    setFinalizedDurableTaskCount(0);
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
    if (!daemonAcceptsWork) throw new Error(DAEMON_ADMISSION_MESSAGE);

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
    refreshInboxRef.current();
  }

  async function requestEntryPointUpdate(request: EntryPointUpdateRequest) {
    if (!currentUser || !accessToken) throw new Error("Sign in before changing an entry point.");
    if (!daemonAcceptsWork) throw new Error(DAEMON_ADMISSION_MESSAGE);
    setIsEntryPointUpdatePending(true);
    setEntryPointUpdateError("");
    try {
      const nextMessage = await updateMessage(supabaseUrl, supabasePublishableKey, accessToken, currentUserId, ENTRY_POINT_UPDATE_PURPOSE, JSON.stringify({ command: ENTRY_POINT_UPDATE_COMMAND, ...request }));
      setEntryPointUpdateMessage(nextMessage);
      refreshInboxRef.current();
    } catch (error) {
      setIsEntryPointUpdatePending(false);
      throw error;
    }
  }

  async function requestDevEnvironment() {
    if (!currentUser || !accessToken) {
      setError("Sign in before loading the dev environment.");
      return;
    }
    if (!daemonAcceptsWork) {
      setError(DAEMON_ADMISSION_MESSAGE);
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
            null,
          ),
          updateMessage(
            supabaseUrl,
            supabasePublishableKey,
            accessToken,
            currentUserId,
            PARAMETER_FILE_LOAD_PURPOSE,
            null,
          ),
        ]);
      setMessage(nextFeatureFileMessage);
      setParameterFileMessage(nextParameterFileMessage);
      refreshInboxRef.current();
    } catch (error) {
      setIsLoadingFeatureFiles(false);
      setIsLoadingParameterFiles(false);
      setError(
        error instanceof Error
          ? `Unable to write the dev-environment load requests to Supabase: ${error.message}`
          : "Unable to write the dev-environment load requests to Supabase.",
      );
    }
  }

  async function sendAgentPrompt() {
    if (!promptText.trim() || !currentUser || !accessToken) {
      return;
    }
    if (!daemonAcceptsWork) {
      setPromptSubmissionError(DAEMON_ADMISSION_MESSAGE);
      return;
    }

    const promptId = createPromptId();
    const nextPrompt = promptText.trim();
    const targetedFeaturePaths = targetedFeatures.map((feature) => feature.filePath);
    const planningMode = selectedAgentMode === "planning";
    const askMode = selectedAgentMode === "ask";
    const nextPromptPayload: AgentPromptQueueEntry = {
      promptId,
      conversationId: planningMode ? promptId : undefined,
      directory: selectedProjectDirectory,
      prompt: nextPrompt,
      provider: selectedProvider,
      model: selectedModelId,
      reasoning: selectedReasoning,
      planningMode,
      askMode,
      bridgeMode: false,
      targetedFeaturePaths,
      status: "queued",
      enqueuedAt: Date.now(),
    };

    setPromptSubmissionError("");
    setSelectedHistoryPromptId(promptId);

    setPromptStatus(
      agentPromptQueueRef.current.some(
        (item) => item.status === "sending" || item.status === "running",
      )
        ? "Prompt queued locally behind the active run."
        : "Prompt queued locally.",
    );
    setPromptText("");
    setAgentPromptMessage("");
    if (planningMode) {
      setPlanningSession({
        conversationId: promptId,
        originalPrompt: nextPrompt,
        directory: selectedProjectDirectory,
        provider: selectedProvider,
        model: selectedModelId,
        reasoning: selectedReasoning,
        targetedFeatures,
        currentPlan: "",
        pendingQuestions: [],
        questionIndex: 0,
        answers: [],
        activePlanningPromptId: promptId,
      });
      setAgentPromptQueue((currentQueue) => [...currentQueue, nextPromptPayload]);
      return;
    }

    if (askMode) {
      setAgentPromptQueue((currentQueue) => [...currentQueue, nextPromptPayload]);
      return;
    }

    try {
      await insertAgentTask(
        supabaseUrl,
        supabasePublishableKey,
        accessToken,
        currentUserId,
        nextPromptPayload,
      );
      activePromptId.current = promptId;
      setDurableAgentTasks((currentTasks) => [
        ...currentTasks,
        nextPromptPayload,
      ]);
      setLatestChat({
        promptId,
        directory: nextPromptPayload.directory,
        prompt: nextPromptPayload.prompt,
        reply: "",
        provider: nextPromptPayload.provider,
        model: nextPromptPayload.model,
        reasoning: nextPromptPayload.reasoning,
        planningMode: false,
        askMode: false,
        targetedFeaturePaths: nextPromptPayload.targetedFeaturePaths,
      });
      setPromptStatus("Agent task durably queued.");
    } catch (submissionError) {
      setPromptStatus("Unable to queue the agent task right now.");
      setPromptSubmissionError(submissionError instanceof Error ? submissionError.message : "Unable to queue the prompt in the browser. Please try again.");
    }
  }

  async function sendBridgeDirection() {
    if (!aopDirectionText.trim() || !currentUser || !accessToken) {
      return;
    }
    if (!daemonAcceptsWork) {
      setPromptSubmissionError(DAEMON_ADMISSION_MESSAGE);
      return;
    }

    const promptId = createPromptId();
    const direction = aopDirectionText.trim();
    const targetedFeaturePaths = targetedFeatures.map((feature) => feature.filePath);
    const nextPromptPayload: AgentPromptQueueEntry = {
      promptId,
      conversationId: promptId,
      directory: selectedProjectDirectory,
      prompt: direction,
      provider: selectedProvider,
      model: selectedModelId,
      reasoning: selectedReasoning,
      planningMode: false,
      askMode: false,
      bridgeMode: true,
      targetedFeaturePaths,
      status: "queued",
      enqueuedAt: Date.now(),
    };

    setPromptSubmissionError("");
    setSelectedHistoryPromptId(promptId);
    setAopDirectionText("");
    setBridgeSession({
      conversationId: promptId,
      directionPrompt: direction,
      cpDoc: direction,
      directory: selectedProjectDirectory,
      provider: selectedProvider,
      model: selectedModelId,
      reasoning: selectedReasoning,
      targetedFeatures,
      notes: "",
      pendingQuestions: [],
      questionIndex: 0,
      answers: [],
      proposedTasks: [],
      phase: "running",
      activeBridgePromptId: promptId,
    });
    setPromptStatus("Bridge direction queued.");
    setAgentPromptQueue((currentQueue) => [...currentQueue, nextPromptPayload]);
  }

  function answerBridgeQuestion(answer: string) {
    const normalizedAnswer = answer.trim();
    if (!normalizedAnswer || !bridgeSession) {
      return;
    }

    const question = bridgeSession.pendingQuestions[bridgeSession.questionIndex];
    if (!question) {
      return;
    }

    const answers = [
      ...bridgeSession.answers,
      { question: question.question, answer: normalizedAnswer },
    ];
    const nextQuestionIndex = bridgeSession.questionIndex + 1;

    if (nextQuestionIndex < bridgeSession.pendingQuestions.length) {
      setBridgeSession({
        ...bridgeSession,
        answers,
        questionIndex: nextQuestionIndex,
      });
      return;
    }

    const promptId = createPromptId();
    const nextPromptPayload: AgentPromptQueueEntry = {
      promptId,
      conversationId: bridgeSession.conversationId,
      directory: bridgeSession.directory,
      prompt: bridgeSession.directionPrompt,
      provider: bridgeSession.provider,
      model: bridgeSession.model,
      reasoning: bridgeSession.reasoning,
      planningMode: false,
      askMode: false,
      bridgeMode: true,
      targetedFeaturePaths: bridgeSession.targetedFeatures.map(
        (feature) => feature.filePath,
      ),
      bridgeContext: bridgeSession.cpDoc,
      bridgeAnswers: answers,
      status: "queued",
      enqueuedAt: Date.now(),
    };

    setBridgeSession({
      ...bridgeSession,
      answers,
      pendingQuestions: [],
      questionIndex: 0,
      proposedTasks: [],
      phase: "running",
      activeBridgePromptId: promptId,
      questionPromptId: "",
    });
    setPromptStatus("Answers saved. Refining the bridge.");
    setSelectedHistoryPromptId(promptId);
    setAgentPromptQueue((currentQueue) => [...currentQueue, nextPromptPayload]);
  }

  async function applyBridgeReply(promptId: string) {
    const session = bridgeSessionRef.current;
    if (!session || session.activeBridgePromptId !== promptId) {
      return;
    }
    if (!currentUser || !accessToken) {
      return;
    }

    try {
      const turns = await fetchAgentOutputConversation(
        supabaseUrl,
        supabasePublishableKey,
        accessToken,
        session.conversationId,
        promptId,
      );
      const turn = turns.find((item) => item.promptId === promptId)
        ?? turns.find((item) => item.mode === "bridge" && item.output);
      if (!turn?.output) {
        setPromptStatus("Bridge finished, but no reply was available yet.");
        setBridgeSession((current) =>
          current && current.activeBridgePromptId === promptId
            ? { ...current, phase: "idle", activeBridgePromptId: "" }
            : current,
        );
        return;
      }

      const parsed = parseBridgeReply(turn.output);
      const nextCpDoc = parsed.cpDoc.trim() ? parsed.cpDoc : undefined;

      if (parsed.status === "ready" && parsed.tasks.length > 0) {
        setBridgeSession((current) =>
          current && current.activeBridgePromptId === promptId
            ? {
              ...current,
              ...(nextCpDoc ? { cpDoc: nextCpDoc } : {}),
              notes: parsed.notes || current.notes,
              pendingQuestions: [],
              questionIndex: 0,
              proposedTasks: parsed.tasks,
              phase: "ready",
              activeBridgePromptId: "",
              questionPromptId: "",
              latestReply: turn.output,
            }
            : current,
        );
        setPromptStatus("Bridge is ready (coding dispatch still disabled).");
        return;
      }

      setBridgeSession((current) =>
        current && current.activeBridgePromptId === promptId
          ? {
            ...current,
            ...(nextCpDoc ? { cpDoc: nextCpDoc } : {}),
            notes: parsed.notes || current.notes,
            pendingQuestions: parsed.questions,
            questionIndex: 0,
            proposedTasks: parsed.tasks,
            phase: parsed.questions.length > 0
              ? "questioning"
              : parsed.status === "ready"
                ? "ready"
                : "idle",
            activeBridgePromptId: "",
            questionPromptId: parsed.questions.length > 0 ? promptId : "",
            latestReply: turn.output,
          }
          : current,
      );
      setPromptStatus(
        parsed.questions.length > 0
          ? `Bridge questions ready (${parsed.questions.length}).`
          : nextCpDoc
            ? "cp_doc updated."
            : "Bridge finished without questions.",
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unable to load bridge reply.";
      setPromptStatus(detail);
      setBridgeSession((current) =>
        current && current.activeBridgePromptId === promptId
          ? { ...current, phase: "idle", activeBridgePromptId: "" }
          : current,
      );
    }
  }

  async function dispatchBridgeTasks() {
    // Coding-task fan-out is intentionally off while AOP Beta focuses on questions.
    const enableBridgeTaskDispatch = false;
    if (!enableBridgeTaskDispatch) {
      setPromptSubmissionError(
        "Coding-task dispatch is disabled while AOP Beta focuses on question generation.",
      );
      return;
    }

    if (!bridgeSession || !currentUser || !accessToken) {
      return;
    }
    if (!daemonAcceptsWork) {
      setPromptSubmissionError(DAEMON_ADMISSION_MESSAGE);
      return;
    }
    if (bridgeSession.proposedTasks.length === 0) {
      return;
    }

    setBridgeSession({ ...bridgeSession, phase: "dispatching" });
    setPromptSubmissionError("");

    try {
      const dispatched: AgentPromptQueueEntry[] = [];
      for (const task of bridgeSession.proposedTasks) {
        const promptId = createPromptId();
        const taskPrompt = [
          `TASK: ${task.title}`,
          "",
          task.prompt,
          "",
          "Original bridge direction:",
          bridgeSession.directionPrompt,
        ].join("\n");
        const payload: AgentPromptPayload = {
          promptId,
          // Omit conversationId so the DB trigger creates a new conversation
          // per coding task (enables concurrent admission).
          directory: bridgeSession.directory,
          prompt: taskPrompt,
          provider: bridgeSession.provider,
          model: bridgeSession.model,
          reasoning: bridgeSession.reasoning,
          planningMode: false,
          askMode: false,
          bridgeMode: false,
          targetedFeaturePaths: bridgeSession.targetedFeatures.map(
            (feature) => feature.filePath,
          ),
        };
        await insertAgentTask(
          supabaseUrl,
          supabasePublishableKey,
          accessToken,
          currentUserId,
          payload,
        );
        dispatched.push({
          ...payload,
          status: "queued",
          enqueuedAt: Date.now(),
        });
      }
      setDurableAgentTasks((currentTasks) => [...currentTasks, ...dispatched]);
      setBridgeSession(null);
      setPromptStatus(
        `Dispatched ${dispatched.length} coding task${dispatched.length === 1 ? "" : "s"}.`,
      );
    } catch (submissionError) {
      const detail = submissionError instanceof Error
        ? submissionError.message
        : "Unable to dispatch coding tasks.";
      setPromptStatus(detail);
      setPromptSubmissionError(detail);
      setBridgeSession((current) =>
        current ? { ...current, phase: "ready" } : current,
      );
    }
  }

  function answerPlanningQuestion(answer: string) {
    const normalizedAnswer = answer.trim();

    if (!normalizedAnswer || !planningSession) {
      return;
    }

    const question = planningSession.pendingQuestions[planningSession.questionIndex];

    if (!question) {
      return;
    }

    const answers = [
      ...planningSession.answers,
      { question: question.question, answer: normalizedAnswer },
    ];
    const nextQuestionIndex = planningSession.questionIndex + 1;

    if (nextQuestionIndex < planningSession.pendingQuestions.length) {
      setPlanningSession({
        ...planningSession,
        answers,
        questionIndex: nextQuestionIndex,
      });
      return;
    }

    const promptId = createPromptId();
    const nextPromptPayload: AgentPromptQueueEntry = {
      promptId,
      conversationId: planningSession.conversationId,
      directory: planningSession.directory,
      prompt: planningSession.originalPrompt,
      provider: planningSession.provider,
      model: planningSession.model,
      reasoning: planningSession.reasoning,
      planningMode: true,
      askMode: false,
      bridgeMode: false,
      targetedFeaturePaths: planningSession.targetedFeatures.map(
        (feature) => feature.filePath,
      ),
      planningContext: planningSession.currentPlan,
      planningAnswers: answers,
      status: "queued",
      enqueuedAt: Date.now(),
    };

    setPlanningSession({
      ...planningSession,
      answers,
      pendingQuestions: [],
      questionIndex: 0,
      activePlanningPromptId: promptId,
      questionPromptId: "",
    });
    setPromptStatus("Answers saved. Refining the plan.");
    setSelectedHistoryPromptId(promptId);
    setAgentPromptQueue((currentQueue) => [...currentQueue, nextPromptPayload]);
  }

  async function implementPlanningSession() {
    if (!planningSession || !currentUser || !accessToken) {
      return;
    }
    if (!daemonAcceptsWork) {
      setPromptSubmissionError(DAEMON_ADMISSION_MESSAGE);
      return;
    }

    const promptId = createPromptId();
    const implementationPrompt = buildImplementationPrompt(
      planningSession.currentPlan,
      planningSession.answers,
    );
    const task: AgentPromptPayload = {
      promptId,
      conversationId: planningSession.conversationId,
      directory: planningSession.directory,
      prompt: implementationPrompt,
      provider: planningSession.provider,
      model: planningSession.model,
      reasoning: planningSession.reasoning,
      planningMode: false,
      askMode: false,
      bridgeMode: false,
      targetedFeaturePaths: planningSession.targetedFeatures.map(
        (feature) => feature.filePath,
      ),
    };

    try {
      await insertAgentTask(
        supabaseUrl,
        supabasePublishableKey,
        accessToken,
        currentUserId,
        task,
      );
      activePromptId.current = promptId;
      setSelectedHistoryPromptId(promptId);
      setPlanningSession(null);
      setDurableAgentTasks((currentTasks) => [
        ...currentTasks,
        {
          ...task,
          status: "queued",
          enqueuedAt: Date.now(),
        },
      ]);
      setLatestChat({
        promptId,
        directory: task.directory,
        prompt: task.prompt,
        reply: "",
        provider: task.provider,
        model: task.model,
        reasoning: task.reasoning,
        planningMode: false,
        askMode: false,
        targetedFeaturePaths: task.targetedFeaturePaths,
      });
      setPromptStatus("Plan implementation task durably queued.");
    } catch (submissionError) {
      const detail = submissionError instanceof Error ? submissionError.message : "Unable to queue the plan implementation right now.";
      setPromptStatus(detail);
      setPromptSubmissionError(detail);
    }
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

      const wasBridge = Boolean(
        agentPromptQueueRef.current.find(
          (item) => item.promptId === nextPromptId && item.bridgeMode,
        ) || bridgeSessionRef.current?.activeBridgePromptId === nextPromptId,
      );
      finalizeQueuedAgentPrompt(nextPromptId, latestChatRef.current);
      if (wasBridge) {
        void applyBridgeReply(nextPromptId);
      }
    }
  }

  async function dispatchQueuedAgentPrompt(queueEntry: AgentPromptQueueEntry) {
    if (!currentUser || !accessToken || !daemonAcceptsWork) {
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
      askMode: queueEntry.askMode,
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
          conversationId: queueEntry.conversationId,
          directory: queueEntry.directory,
          provider: queueEntry.provider,
          model: queueEntry.model,
          reasoning: queueEntry.reasoning,
          planningMode: queueEntry.planningMode,
          askMode: queueEntry.askMode,
          bridgeMode: queueEntry.bridgeMode,
          targetedFeaturePaths: queueEntry.targetedFeaturePaths,
          planningContext: queueEntry.planningContext,
          planningAnswers: queueEntry.planningAnswers,
          bridgeContext: queueEntry.bridgeContext,
          bridgeAnswers: queueEntry.bridgeAnswers,
          prompt: queueEntry.prompt,
        }),
      );
      refreshInboxRef.current();
      setPromptStatus("Prompt sent. Waiting for daemon pickup.");
    } catch (submissionError) {
      activePromptId.current = "";
      const detail = submissionError instanceof Error ? submissionError.message : "Unable to send the prompt right now.";
      setPromptStatus(detail);
      setAgentPromptQueue((currentQueue) =>
        currentQueue.map((item) =>
          item.promptId === queueEntry.promptId
            ? {
                ...item,
                status: detail === DAEMON_ADMISSION_MESSAGE ? "queued" : "failed",
                error: detail === DAEMON_ADMISSION_MESSAGE ? undefined : detail,
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

  function retryHistoryDirectPrompt(exchange: HistoryExchange) {
    const existing = agentPromptQueueRef.current.find((item) => item.promptId === exchange.promptId);
    if (existing) {
      retryQueuedAgentPrompt(exchange.promptId);
      return;
    }
    const promptId = createPromptId();
    setAgentPromptQueue((currentQueue) => [...currentQueue, {
      promptId,
      directory: exchange.repository,
      prompt: exchange.prompt,
      provider: exchange.provider,
      model: exchange.model,
      reasoning: exchange.reasoning,
      planningMode: exchange.mode === "planning",
      askMode: exchange.mode === "ask",
      bridgeMode: exchange.mode === "bridge",
      targetedFeaturePaths: exchange.targetedFeaturePaths,
      status: "queued",
      enqueuedAt: Date.now(),
    }]);
    setSelectedHistoryPromptId(promptId);
    setPromptStatus("Retry queued as a new history exchange.");
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

  function handleDeletedHistoryExchange(exchange: HistoryExchange) {
    setArchitectureViews((current) => {
      if (!current[exchange.promptId]) return current;
      const next = { ...current };
      delete next[exchange.promptId];
      return next;
    });
    setAgentPromptQueue((currentQueue) =>
      currentQueue.filter((item) => item.promptId !== exchange.promptId),
    );
    setDurableAgentTasks((currentTasks) =>
      currentTasks.filter((item) => item.durableTaskId !== exchange.taskId),
    );
    setFinalizedDurableTaskCount((count) => Math.max(0, count - (exchange.taskId ? 1 : 0)));

    if (activePromptId.current === exchange.promptId) {
      activePromptId.current = "";
    }

    if (latestChatRef.current?.promptId === exchange.promptId) {
      setLatestChat(null);
    }

    setPromptStatus("History exchange deleted.");
  }

  const projectEntries = Object.entries(projects ?? {});
  const availableProjectDirectories = projectEntries.map(
    ([projectDirectory]) => projectDirectory,
  );
  const liveHistoryExchanges = useMemo<HistoryExchange[]>(() => {
    const normalizeStatus = (status: AgentPromptQueueStatus) => {
      if (status === "sending") return "queued" as const;
      if (status === "stalled") return "failed" as const;
      return status;
    };
    const mapEntry = (
      entry: AgentPromptQueueEntry,
      source: "direct_prompt" | "durable_task",
    ): HistoryExchange => ({
      id: entry.promptId,
      promptId: entry.promptId,
      taskId: source === "durable_task" ? entry.durableTaskId ?? null : null,
      repository: entry.directory,
      prompt: entry.prompt,
      output: "",
      error: entry.error ?? "",
      provider: entry.provider,
      model: entry.model,
      reasoning: entry.reasoning,
      mode: entry.bridgeMode ? "bridge" : entry.askMode ? "ask" : entry.planningMode ? "planning" : "standard",
      conversationId: entry.conversationId ?? entry.promptId,
      source,
      targetedFeaturePaths: entry.targetedFeaturePaths,
      status: normalizeStatus(entry.status),
      statusDetail: entry.cancelRequested ? "Cancellation requested." : "",
      createdAt: new Date(entry.enqueuedAt).toISOString(),
      startedAt: entry.sentAt ? new Date(entry.sentAt).toISOString() : null,
      completedAt: entry.completedAt ? new Date(entry.completedAt).toISOString() : null,
      updatedAt: entry.updatedAt ?? new Date(
        entry.completedAt ?? entry.sentAt ?? entry.enqueuedAt,
      ).toISOString(),
      cancelRequested: entry.cancelRequested,
      localOnly: source === "direct_prompt" && entry.status === "queued",
    });
    return [
      ...agentPromptQueue.map((entry) => mapEntry(entry, "direct_prompt")),
      ...durableAgentTasks.map((entry) => mapEntry(entry, "durable_task")),
    ];
  }, [agentPromptQueue, durableAgentTasks]);
  const handleHistoryPlanningReply = useCallback((exchange: HistoryExchange) => {
    const parsedReply = parsePlanningReply(exchange.output);
    setPlanningSession((currentSession) => {
      if (!currentSession || currentSession.activePlanningPromptId !== exchange.promptId) return currentSession;
      return {
        ...currentSession,
        currentPlan: parsedReply.plan,
        pendingQuestions: parsedReply.questions,
        questionIndex: 0,
        activePlanningPromptId: "",
        questionPromptId: parsedReply.questions.length > 0 ? exchange.promptId : "",
      };
    });
    if (activePromptId.current === exchange.promptId) {
      activePromptId.current = "";
      setAgentPromptQueue((currentQueue) => currentQueue.filter((item) => item.promptId !== exchange.promptId));
    }
  }, []);
  const devEnvironmentState = getDevEnvironmentState(
    error,
    isLoadingFeatureFiles,
    isLoadingParameterFiles,
    message,
    parameterFileMessage,
    projects,
    parameterProjects,
  );
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
  const completedVentures = ventures.filter(
    (venture) => venture.progressState === "completed",
  );
  const completedVenturesCount = completedVentures.length;
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
  const runnableFeature = selectedFeatureSession
    ? getRunnableFeatureMetadata(selectedFeatureSession.filePath, matchedParameterFile)
    : { runnable: false as const, reason: "No feature selected." };
  const selectedFeatureRun = selectedFeatureSession
    ? featureExecutionRuns.find((run) =>
      run.project_directory === selectedFeatureSession.projectPath &&
      normalizeFeatureFilePath(run.feature_file_path) === selectedFeatureSession.filePath,
    ) ?? null
    : null;

  function selectModel(modelId: string) {
    const nextModel =
      agentModels[selectedProvider]?.models.find((model) => model.id === modelId) ??
      defaultModel;
    setSelectedModelId(nextModel.id);
    setSelectedReasoning(nextModel.default_reasoning);
  }

  function selectProvider(provider: string) {
    const nextModel = agentModels[provider]?.models[0] ?? defaultModel;
    setSelectedProvider(provider);
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
    setIsAgentOutputViewerOpen(false);
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
    setIsConfirmingClearCompletedVentures(false);
  }

  function toggleVenturesDrawer() {
    setIsAgentOutputViewerOpen(false);
    if (isMobileLayout) {
      setActivePrimaryOverlay(null);
      setSelectedFeatureSession(null);
      setVenturesDrawerOpen(true);
      return;
    }

    setVenturesDrawerOpen((currentValue) => !currentValue);
  }

  function toggleWorkspaceMenu() {
    setIsAgentTaskNotificationsOpen(false);
    setIsWorkspaceMenuOpen((currentValue) => !currentValue);
  }

  function openAgentOutputViewer(promptId = "") {
    if (promptId) setSelectedHistoryPromptId(promptId);
    setVenturesDrawerOpen(false);
    setIsWorkspaceMenuOpen(false);
    setIsAgentTaskNotificationsOpen(false);
    if (isMobileLayout) {
      setActivePrimaryOverlay(null);
      setSelectedFeatureSession(null);
    }
    setIsAgentOutputViewerOpen(true);
  }

  function closeAgentOutputViewer() {
    setIsAgentOutputViewerOpen(false);
  }

  function selectWorkspaceView(nextView: WorkspaceView) {
    if (nextView === workspaceView) return;
    if (nextView === "architecture") {
      if (workspaceView !== "architecture") {
        featureHistoryDrawerOpenRef.current = isAgentOutputViewerOpen;
      }
      setIsAgentOutputViewerOpen(true);
      setIsWorkspaceMenuOpen(false);
      setIsAgentTaskNotificationsOpen(false);
      setFeatureSearchMode(null);
    } else {
      if (workspaceView === "architecture") {
        setIsAgentOutputViewerOpen(featureHistoryDrawerOpenRef.current);
      }
      if (nextView === "aop") {
        setIsWorkspaceMenuOpen(false);
        setIsAgentTaskNotificationsOpen(false);
      }
    }
    setWorkspaceView(nextView);
  }

  function workspaceViewLabel(view: WorkspaceView): string {
    if (view === "feature") return "Feature View";
    if (view === "architecture") return "Architecture View";
    return "AOP Beta";
  }

  function selectHistoryPrompt(promptId: string) {
    setSelectedHistoryPromptId(promptId);
    setArchitectureCanvasPromptId("");
  }

  function selectArchitectureCanvasPrompt(promptId: string) {
    setArchitectureCanvasPromptId(promptId);
    if (!promptId || workspaceView === "architecture") return;
    featureHistoryDrawerOpenRef.current = isAgentOutputViewerOpen;
    setIsAgentOutputViewerOpen(true);
    setIsWorkspaceMenuOpen(false);
    setIsAgentTaskNotificationsOpen(false);
    setFeatureSearchMode(null);
    setWorkspaceView("architecture");
  }

  function closeWorkspaceMenu() {
    setIsWorkspaceMenuOpen(false);
  }

  function handleAgentTaskNotificationsOpenChange(open: boolean) {
    if (open) {
      setIsWorkspaceMenuOpen(false);
    }

    setIsAgentTaskNotificationsOpen(open);
  }

  function selectAgentTaskNotification(taskId: string) {
    openAgentOutputViewer(taskId);
  }

  function markAgentTaskNotificationsRead() {
    setAgentTaskNotifications((currentNotifications) =>
      currentNotifications.map((item) =>
        item.read ? item : { ...item, read: true },
      ),
    );
  }

  function clearAgentTaskNotifications() {
    setAgentTaskNotifications([]);
  }

  function openFeatureSearch() {
    closeWorkspaceMenu();
    setFeatureSearchMode("navigate");
  }

  function openFeatureTagSearch() {
    setFeatureSearchMode("tag");
  }

  function closeFeatureSearch() {
    setFeatureSearchMode(null);
  }

  function handleFeatureSearchSelect(selection: FeatureGraphSelection) {
    const activeSearchMode = featureSearchMode;
    closeFeatureSearch();

    if (activeSearchMode === "tag") {
      addTargetedFeature({
        featureName: selection.featureName,
        filePath: selection.filePath,
        projectPath: selection.projectPath,
      });
      return;
    }

    handleFeatureNodeSelect(selection);
  }

  function handleRefreshDevEnvironment() {
    closeWorkspaceMenu();
    void requestDevEnvironment();
  }

  function handleToggleGraphPhysics() {
    closeWorkspaceMenu();
    setIsGraphPhysicsEnabled((currentValue) => !currentValue);
  }

  function handleToggleGraphZoomSlider() {
    closeWorkspaceMenu();
    setIsGraphZoomSliderVisible((currentValue) => !currentValue);
  }

  function handleSignOutRequest() {
    closeWorkspaceMenu();
    void signOut();
  }

  function openGitSyncOverlay() {
    setIsAgentOutputViewerOpen(false);
    closeWorkspaceMenu();
    setVenturesDrawerOpen(false);
    setSelectedFeatureSession(null);
    setActivePrimaryOverlay("git-sync");
    if (availableProjectDirectories.length > 0) {
      setGitSyncProjectDirectory((currentDirectory) =>
        availableProjectDirectories.includes(currentDirectory)
          ? currentDirectory
          : availableProjectDirectories[0],
      );
    }
  }

  function closeGitSyncOverlay() {
    setActivePrimaryOverlay((currentOverlay) =>
      currentOverlay === "git-sync" ? null : currentOverlay,
    );
  }

  function openProjectInitializationOverlay() {
    setIsAgentOutputViewerOpen(false);
    closeWorkspaceMenu();
    setVenturesDrawerOpen(false);
    setSelectedFeatureSession(null);
    setActivePrimaryOverlay("project-initialization");
  }

  function closeProjectInitializationOverlay() {
    setActivePrimaryOverlay((currentOverlay) =>
      currentOverlay === "project-initialization" ? null : currentOverlay,
    );
  }

  async function sendProjectInitializationRequest() {
    if (!currentUser || !accessToken || isProjectInitializationInFlight) return;
    if (!daemonAcceptsWork) {
      setProjectInitializationStatus(DAEMON_ADMISSION_MESSAGE);
      return;
    }
    const validationError = validateProjectName(projectInitializationName);
    if (validationError) {
      setProjectInitializationStatus(validationError);
      return;
    }
    const requestId = createPromptId();
    activeProjectInitializationRequestId.current = requestId;
    setIsProjectInitializationInFlight(true);
    setProjectInitializationResult(null);
    setProjectInitializationStatus("Sending initialization request to Supabase.");
    try {
      await updateMessage(
        supabaseUrl,
        supabasePublishableKey,
        accessToken,
        currentUserId,
        PROJECT_INITIALIZATION_PURPOSE,
        JSON.stringify(serializeProjectInitializationRequest(
          requestId,
          projectInitializationName,
          projectInitializationCreateGitHub,
        )),
      );
      refreshInboxRef.current();
      setProjectInitializationStatus("Request queued. Waiting for daemon pickup.");
    } catch (submissionError) {
      activeProjectInitializationRequestId.current = "";
      setIsProjectInitializationInFlight(false);
      setProjectInitializationStatus(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to send the initialization request.",
      );
    }
  }

  async function sendGitSyncRequest(
    operation: "commit" | "sync" | "status",
    message = "",
  ) {
    if (!currentUser || !accessToken || isGitSyncRequestInFlight) {
      return;
    }
    if (!daemonAcceptsWork) {
      setGitSyncStatus(DAEMON_ADMISSION_MESSAGE);
      return;
    }

    if (operation === "commit" && !message.trim()) {
      setGitSyncStatus("Enter a commit message before committing changes.");
      return;
    }

    const requestId = createPromptId();
    activeGitSyncRequestId.current = requestId;
    setIsGitSyncRequestInFlight(true);
    setGitSyncResult(null);
    setGitSyncStatus("Sending Git request to Supabase.");

    try {
      await updateMessage(
        supabaseUrl,
        supabasePublishableKey,
        accessToken,
        currentUserId,
        GIT_SYNC_PURPOSE,
        JSON.stringify({
          requestId,
          directory: gitSyncProjectDirectory,
          operation,
          ...(operation === "commit" ? { message: message.trim() } : {}),
        }),
      );
      refreshInboxRef.current();
      setGitSyncStatus("Git request sent. Waiting for daemon pickup.");
    } catch (submissionError) {
      activeGitSyncRequestId.current = "";
      setIsGitSyncRequestInFlight(false);
      setGitSyncStatus(submissionError instanceof Error ? submissionError.message : "Unable to send the Git request right now.");
    }
  }

  function commitGitSyncChanges() {
    void sendGitSyncRequest("commit", gitSyncCommitMessage);
  }

  function syncGitSyncWithGitHub() {
    void sendGitSyncRequest("sync");
  }

  function viewGitSyncStatus() {
    void sendGitSyncRequest("status");
  }

  function handleFeatureNodeSelect(selection: FeatureGraphSelection) {
    setIsAgentOutputViewerOpen(false);
    setSelectedProjectDirectory(selection.projectPath);
    setTargetedFeatures([
      {
        featureName: selection.featureName,
        filePath: selection.filePath,
        projectPath: selection.projectPath,
      },
    ]);
    setSelectedFeatureSession(selection);
    setFeatureDetailTab("edit");
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
    if (
      deletingVentureId ||
      isClearingCompletedVentures ||
      !currentUser ||
      !accessToken
    ) {
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

  async function clearCompletedVentures() {
    if (
      isClearingCompletedVentures ||
      completedVenturesCount === 0 ||
      !currentUser ||
      !accessToken
    ) {
      return;
    }

    setIsClearingCompletedVentures(true);
    setVentureError("");

    try {
      await deleteCompletedVenturesRows(
        supabaseUrl,
        supabasePublishableKey,
        accessToken,
        currentUserId,
      );
      setVentures((currentVentures) =>
        currentVentures.filter(
          (venture) => venture.progressState !== "completed",
        ),
      );

      if (
        editingVentureId &&
        completedVentures.some((venture) => venture.id === editingVentureId)
      ) {
        cancelEditingVenture();
      }

      setIsConfirmingClearCompletedVentures(false);
    } catch {
      setVentureError("Unable to clear completed ventures right now.");
    } finally {
      setIsClearingCompletedVentures(false);
    }
  }

  async function clearDurableTasks() {
    if (
      isClearingDurableTasks ||
      finalizedDurableTaskCount === 0 ||
      !currentUser ||
      !accessToken
    ) {
      return;
    }

    setIsClearingDurableTasks(true);
    setPromptStatus("");

    try {
      await Promise.all([...new Map(durableAgentTasks
        .filter((item) => isFinalizedAgentTaskStatus(item.status))
        .map((item) => [item.conversationId ?? item.promptId, item] as const)).values()]
        .map((item) => requestConversationDeletion(
          supabaseUrl, supabasePublishableKey, accessToken, item.conversationId ?? item.promptId,
        )));
      setIsConfirmingClearDurableTasks(false);
      setPromptStatus("Synchronized conversation cleanup requested.");
    } catch {
      setPromptStatus("Unable to clear durable agent tasks right now.");
    } finally {
      setIsClearingDurableTasks(false);
    }
  }

  async function cancelDurableTask(exchange: HistoryExchange) {
    if (!currentUser || !accessToken) {
      return;
    }

    const taskId = exchange.taskId || exchange.promptId;
    setDurableAgentTasks((currentTasks) => {
      const existing = currentTasks.find((task) => task.promptId === taskId);
      if (existing) {
        return currentTasks.map((task) =>
          task.promptId === taskId
            ? { ...task, cancelRequested: true }
            : task,
        );
      }
      return [
        ...currentTasks,
        {
          promptId: taskId,
          conversationId: exchange.conversationId,
          directory: exchange.repository,
          prompt: exchange.prompt,
          provider: exchange.provider,
          model: exchange.model,
          reasoning: exchange.reasoning,
          planningMode: exchange.mode === "planning",
          askMode: exchange.mode === "ask",
          bridgeMode: exchange.mode === "bridge",
          targetedFeaturePaths: exchange.targetedFeaturePaths,
          status: exchange.status as AgentPromptQueueStatus,
          enqueuedAt: Date.parse(exchange.createdAt) || Date.now(),
          sentAt: exchange.startedAt ? Date.parse(exchange.startedAt) : undefined,
          completedAt: exchange.completedAt ? Date.parse(exchange.completedAt) : undefined,
          updatedAt: exchange.updatedAt,
          error: exchange.error || undefined,
          cancelRequested: true,
        },
      ].sort((left, right) => left.enqueuedAt - right.enqueuedAt);
    });
    setPromptStatus("Cancel requested.");

    try {
      await requestAgentTaskCancel(
        supabaseUrl,
        supabasePublishableKey,
        accessToken,
        currentUserId,
        taskId,
      );
      const synced = await fetchAgentTaskById(
        supabaseUrl,
        supabasePublishableKey,
        accessToken,
        currentUserId,
        taskId,
      ).catch(() => null);
      if (synced) {
        const mapped = {
          ...mapAgentTaskRowToQueueEntry(synced),
          cancelRequested: true,
        };
        setDurableAgentTasks((currentTasks) => {
          const nextRows = new Map(currentTasks.map((row) => [row.promptId, row]));
          nextRows.set(mapped.promptId, {
            ...mapped,
            cancelRequested: mapped.cancelRequested || synced.cancel_requested,
          });
          return [...nextRows.values()].sort(
            (left, right) => left.enqueuedAt - right.enqueuedAt,
          );
        });
      }
    } catch {
      setDurableAgentTasks((currentTasks) =>
        currentTasks.map((task) =>
          task.promptId === taskId
            ? { ...task, cancelRequested: false }
            : task,
        ),
      );
      setPromptStatus("Unable to cancel the agent task right now.");
    }
  }

  async function startFeatureExecution() {
    if (!currentUser || !accessToken || !selectedFeatureSession || !runnableFeature.runnable || selectedFeatureRun?.status === "queued" || selectedFeatureRun?.status === "running") return;
    if (!daemonAcceptsWork) { setFeatureExecutionMessage(DAEMON_ADMISSION_MESSAGE); return; }
    setFeatureExecutionMessage("Submitting run request.");
    try {
      await insertFeatureExecutionRun(
        supabaseUrl, supabasePublishableKey, accessToken, currentUserId,
        buildFeatureExecutionRequest(selectedFeatureSession.projectPath, selectedFeatureSession.filePath),
      );
      setFeatureExecutionMessage("Run queued for the local daemon.");
    } catch (submissionError) {
      setFeatureExecutionMessage(submissionError instanceof Error ? submissionError.message : "Unable to queue this feature run. It may already be active.");
    }
  }

  async function cancelFeatureExecution() {
    if (!currentUser || !accessToken || !selectedFeatureRun) return;
    setFeatureExecutionRuns((current) => current.map((run) => run.id === selectedFeatureRun.id ? { ...run, cancel_requested: true } : run));
    try {
      await requestFeatureExecutionCancel(
        supabaseUrl, supabasePublishableKey, accessToken, currentUserId, selectedFeatureRun.id,
      );
      setFeatureExecutionMessage("Cancellation requested.");
    } catch {
      setFeatureExecutionMessage("Unable to request cancellation right now.");
    }
  }

  const venturesDrawerClassName = isMobileLayout
    ? "pointer-events-auto fixed inset-3 z-30 flex min-w-0 flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-slate-950/94 shadow-[0_28px_100px_rgba(2,6,23,0.72)] backdrop-blur"
    : "pointer-events-auto absolute left-4 top-28 bottom-6 flex w-[min(28rem,calc(100vw-8rem))] flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-slate-950/90 shadow-[0_28px_100px_rgba(2,6,23,0.72)] backdrop-blur";
  const primaryOverlayClassName = isMobileLayout
    ? "pointer-events-auto absolute inset-3 z-30 flex min-w-0 flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-slate-950/94 shadow-[0_28px_100px_rgba(2,6,23,0.72)] backdrop-blur"
    : "pointer-events-auto absolute right-4 top-28 bottom-6 flex min-w-0 w-[min(44rem,calc(100vw-10rem))] flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-slate-950/90 shadow-[0_28px_100px_rgba(2,6,23,0.72)] backdrop-blur";

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
      <div
        className={`absolute inset-0 ${workspaceView !== "feature" ? "pointer-events-none" : ""}`}
        aria-hidden={workspaceView !== "feature"}
        inert={workspaceView !== "feature"}
      >
      <FeatureFileGraph
        maxZoom={graphZoomSettings.maxZoom}
        minZoom={graphZoomSettings.minZoom}
        mobileLabelMinZoom={graphZoomSettings.mobileLabelMinZoom}
        nodeScale={graphZoomSettings.nodeScale}
        physicsEnabled={isGraphPhysicsEnabled}
        onNodeSelect={handleFeatureNodeSelect}
        onOpenNewFeature={openNewFeatureOverlay}
        onOpenVentures={toggleVenturesDrawer}
        onZoomChange={setGraphZoom}
        projects={projects ?? {}}
        selectedFeatureFilePath={selectedFeatureSession?.filePath ?? ""}
        showZoomSlider={isGraphZoomSliderVisible}
        zoom={graphZoom}
      />
      </div>

      {workspaceView === "architecture" ? <div className="fixed inset-y-0 left-[clamp(15rem,36vw,20rem)] right-0 z-30 overflow-hidden bg-slate-950">
        <ArchitectureVisualization
          selectedPromptId={selectedHistoryPromptId}
          targetPromptId={architectureCanvasPromptId}
          view={architectureCanvasPromptId ? architectureViews[architectureCanvasPromptId] ?? null : null}
        />
      </div> : null}

      {workspaceView === "aop" ? (
        <div className="fixed inset-0 z-30 overflow-hidden bg-slate-950">
          <div className="pointer-events-none absolute left-4 top-4 z-40 sm:left-5 sm:top-4">
            <button
              type="button"
              onClick={() => isAgentOutputViewerOpen ? closeAgentOutputViewer() : openAgentOutputViewer()}
              aria-label="Open agent output history"
              title="Agent output history"
              className={`pointer-events-auto relative inline-flex h-11 w-11 items-center justify-center rounded-full border shadow-[0_20px_60px_rgba(2,6,23,0.45)] transition sm:h-12 sm:w-12 ${isAgentOutputViewerOpen ? "border-cyan-300/30 bg-cyan-200 text-slate-950" : "border-white/10 bg-white text-slate-950 hover:bg-slate-200"}`}
            >
              <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>
              {liveHistoryExchanges.some((exchange) => !["completed", "failed", "blocked", "cancelled"].includes(exchange.status)) ? <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-slate-950 bg-amber-300" /> : null}
            </button>
          </div>
          <div className="agent-chat-scrollbar h-full overflow-x-hidden overflow-y-auto px-4 pb-10 pt-20 sm:px-8">
            <div className="mx-auto w-full max-w-3xl">
              <AopSessionPanel
                acceptsWork={daemonAcceptsWork}
                agentModels={agentModels}
                availableProjectDirectories={availableProjectDirectories}
                bridgeSession={bridgeSession}
                defaultProjectDirectory={DEFAULT_PROJECT_DIRECTORY}
                directionText={aopDirectionText}
                onClearSession={() => setBridgeSession(null)}
                onDirectionTextChange={setAopDirectionText}
                onDispatchTasks={() => void dispatchBridgeTasks()}
                onAnswerQuestion={answerBridgeQuestion}
                onOpenFeatureTagSearch={openFeatureTagSearch}
                onProviderChange={selectProvider}
                onRemoveTargetedFeature={removeTargetedFeature}
                onSelectedProjectDirectoryChange={setSelectedProjectDirectory}
                onSelectedReasoningChange={setSelectedReasoning}
                onSelectModel={selectModel}
                onSubmitDirection={() => void sendBridgeDirection()}
                otherAnswer={bridgeOtherAnswer}
                onOtherAnswerChange={setBridgeOtherAnswer}
                selectedModelId={selectedModelId}
                selectedProvider={selectedProvider}
                selectedProjectDirectory={selectedProjectDirectory}
                selectedReasoning={selectedReasoning}
                submissionError={promptSubmissionError}
                targetedFeatures={targetedFeatures}
              />
            </div>
          </div>
        </div>
      ) : null}

      <AgentOutputViewer
        key={currentUserId}
        accessToken={accessToken}
        activitySummary={lastIntegratedTaskStatus}
        architectureViews={architectureViews}
        deletedConversationIds={synchronizedDeletedPromptIds}
        confirmedDeletedConversationIds={confirmedDeletedPromptIds}
        deletionRequestErrors={deletionRequestErrors}
        deletionRequestConversationIds={deletionRequestPromptIds}
        isOpen={workspaceView === "architecture" || isAgentOutputViewerOpen}
        liveExchanges={liveHistoryExchanges}
        onAbandonDirectPrompt={abandonQueuedAgentPrompt}
        onAnswerPlanningQuestion={answerPlanningQuestion}
        onCancelDurableTask={(exchange) => void cancelDurableTask(exchange)}
        onClearFinalizedTasks={() => void clearDurableTasks()}
        onClose={closeAgentOutputViewer}
        onDeletedExchange={handleDeletedHistoryExchange}
        onDeleteConversation={async (exchange) => {
          if (!exchange.conversationId || !currentUser || !accessToken) {
            throw new Error("This conversation is unavailable for synchronized deletion.");
          }
          // The selected exchange can be an archived history row, whose timestamp
          // is independent from agent_tasks.updated_at. The deletion RPC guards on
          // the durable task's exact database revision, so reload it before asking
          // the daemon to clean up its worktree and history.
          await requestConversationDeletion(
            supabaseUrl, supabasePublishableKey, accessToken, exchange.conversationId,
          );
          await rehydrateDurableAgentTasks();
          setPromptStatus("Synchronized conversation deletion requested.");
        }}
        onImplementPlan={() => void implementPlanningSession()}
        onPlanningReply={handleHistoryPlanningReply}
        onArchitectureViewChange={(view) => setArchitectureViews((current) => (
          mergeArchitectureView(current, view)
        ))}
        onArchitectureCanvasPromptChange={selectArchitectureCanvasPrompt}
        onRefreshLiveTasks={async () => {
          const results = await Promise.allSettled([rehydrateDurableAgentTasks()]);
          const failed = results.filter((result) => result.status === "rejected");
          if (failed.length) throw new Error(`${failed.length} live-state source${failed.length === 1 ? "" : "s"} failed to refresh.`);
        }}
        onRetryDirectPrompt={retryHistoryDirectPrompt}
        onRetryDurableTask={async (exchange) => {
          if (!exchange.taskId || !currentUser || !accessToken) {
            throw new Error("This durable task is unavailable for recovery.");
          }
          // Archive rows have their own updated_at value. The recovery RPC instead
          // guards on agent_tasks.updated_at, so reload the authoritative task
          // revision before requesting a resume.
          const currentTask = await fetchAgentTaskById(
            supabaseUrl, supabasePublishableKey, accessToken, currentUserId, exchange.taskId,
          );
          if (!currentTask || !["failed", "blocked"].includes(currentTask.status)) {
            throw new Error("This task is no longer available for recovery.");
          }
          const accepted = await requestDurableTaskRetry(
            supabaseUrl, supabasePublishableKey, accessToken, currentTask.id, currentTask.updated_at,
          );
          if (!accepted) throw new Error("Task changed before retry could be requested.");
          await rehydrateDurableAgentTasks();
          setPromptStatus("Task recovery requested.");
        }}
        onSelectedPromptIdChange={selectHistoryPrompt}
        planningSession={planningSession}
        pollIntervalMs={pollIntervalMs}
        presentation={workspaceView === "architecture" ? "architecture-rail" : "drawer"}
        projects={projects ?? {}}
        selectedPromptId={selectedHistoryPromptId}
        supabasePublishableKey={supabasePublishableKey}
        supabaseUrl={supabaseUrl}
      />

      <div className="fixed left-1/2 top-3 z-50 -translate-x-1/2 rounded-full border border-white/10 bg-slate-950/95 p-1 shadow-[0_18px_60px_rgba(2,6,23,0.55)] backdrop-blur" role="group" aria-label="Workspace view">
        {(["feature", "architecture", "aop"] as const).map((view) => <button
          key={view}
          type="button"
          aria-pressed={workspaceView === view}
          onClick={() => selectWorkspaceView(view)}
          className={`rounded-full px-4 py-2 text-xs font-semibold transition ${workspaceView === view ? "bg-cyan-300 text-slate-950" : "text-slate-300 hover:bg-white/10"}`}
        >{workspaceViewLabel(view)}</button>)}
      </div>

      {workspaceView === "feature" ? <div className="pointer-events-none absolute inset-0">
        <button
          type="button"
          onClick={() => isAgentOutputViewerOpen ? closeAgentOutputViewer() : openAgentOutputViewer()}
          aria-label="Open agent output history"
          title="Agent output history"
          className={`pointer-events-auto absolute left-4 top-4 z-20 inline-flex h-11 w-11 items-center justify-center rounded-full border shadow-[0_20px_60px_rgba(2,6,23,0.45)] transition sm:h-12 sm:w-12 ${isAgentOutputViewerOpen ? "border-cyan-300/30 bg-cyan-200 text-slate-950" : "border-white/10 bg-white text-slate-950 hover:bg-slate-200"}`}
        >
          <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>
          {liveHistoryExchanges.some((exchange) => !["completed", "failed", "blocked", "cancelled"].includes(exchange.status)) ? <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-slate-950 bg-amber-300" /> : null}
        </button>
        <div className="pointer-events-auto absolute right-4 top-4 z-20 flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <AgentTaskNotifications
              notifications={agentTaskNotifications}
              isOpen={isAgentTaskNotificationsOpen}
              onOpenChange={handleAgentTaskNotificationsOpenChange}
              onMarkAllRead={markAgentTaskNotificationsRead}
              onClearAll={clearAgentTaskNotifications}
              onSelect={selectAgentTaskNotification}
            />
            <div ref={workspaceMenuRef} className="relative">
              <button
                type="button"
                onClick={toggleWorkspaceMenu}
                aria-expanded={isWorkspaceMenuOpen}
                aria-haspopup="menu"
                aria-label="Workspace menu"
                title="Workspace menu"
                className={`inline-flex h-11 w-11 items-center justify-center rounded-full border shadow-[0_20px_60px_rgba(2,6,23,0.32)] transition sm:h-12 sm:w-12 ${
                  isWorkspaceMenuOpen
                    ? "border-cyan-300/30 bg-cyan-200 text-slate-950 hover:bg-cyan-100"
                    : "border-white/10 bg-white text-slate-950 hover:bg-slate-200"
                }`}
              >
                <svg
                  aria-hidden="true"
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M5 7h14" />
                  <path d="M5 12h14" />
                  <path d="M5 17h14" />
                </svg>
              </button>

              {isWorkspaceMenuOpen ? (
                <div
                  role="menu"
                  aria-label="Workspace controls"
                  className="absolute right-0 top-full mt-2 w-[min(16rem,calc(100vw-2rem))] overflow-hidden rounded-[1.35rem] border border-white/10 bg-slate-950/96 shadow-[0_24px_80px_rgba(2,6,23,0.55)] backdrop-blur"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={openFeatureSearch}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-slate-100 transition hover:bg-white/6"
                  >
                    <span>Search features</span>
                    <span className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                      ⌘K
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleRefreshDevEnvironment}
                    disabled={isLoadingFeatureFiles || isLoadingParameterFiles}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-slate-100 transition hover:bg-white/6 disabled:cursor-not-allowed disabled:text-slate-500"
                  >
                    <span>Refresh dev environment</span>
                    {isLoadingFeatureFiles || isLoadingParameterFiles ? (
                      <span className="text-[11px] uppercase tracking-[0.2em] text-cyan-200">
                        Loading
                      </span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleToggleGraphPhysics}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-slate-100 transition hover:bg-white/6"
                  >
                    <span>{isGraphPhysicsEnabled ? "Physics on" : "Physics off"}</span>
                    <span className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                      Toggle
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={isGraphZoomSliderVisible}
                    onClick={handleToggleGraphZoomSlider}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-slate-100 transition hover:bg-white/6"
                  >
                    <span>
                      {isGraphZoomSliderVisible
                        ? "Zoom slider on"
                        : "Zoom slider off"}
                    </span>
                    <span className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                      {isGraphZoomSliderVisible ? "Visible" : "Hidden"}
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={openProjectInitializationOverlay}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-slate-100 transition hover:bg-white/6"
                  >
                    <span>Initialize project</span>
                    <span className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                      New
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={openGitSyncOverlay}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-slate-100 transition hover:bg-white/6"
                  >
                    <span>Git Sync</span>
                    <span className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                      Manual
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleSignOutRequest}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-slate-100 transition hover:bg-white/6"
                  >
                    <span>Sign out</span>
                    <span className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                      Session
                    </span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {error ? (
            <div className="max-w-[min(22rem,calc(100vw-2rem))] rounded-[1.25rem] border border-rose-400/20 bg-rose-500/14 px-4 py-3 text-sm text-rose-100 shadow-[0_24px_80px_rgba(127,29,29,0.35)] backdrop-blur">
              {error}
            </div>
          ) : null}
        </div>

        {venturesDrawerOpen ? (
          <aside className={`${venturesDrawerClassName} overflow-x-hidden`}>
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-5">
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

            <div className="agent-chat-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4 sm:px-5">
              <div className="grid min-w-0 max-w-full gap-4 overflow-x-hidden">
                <div className="grid min-w-0 max-w-full gap-3 overflow-x-hidden rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
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
                    className="w-full max-w-full min-w-0 rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
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
                    className="agent-chat-scrollbar w-full max-w-full min-w-0 rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none"
                  >
                    <option value="">No project tag</option>
                    {availableProjectDirectories.length > 0 ? (
                      availableProjectDirectories.map((projectDirectory) => (
                        <option key={projectDirectory} value={projectDirectory}>
                          {getProjectLabel(
                            projectDirectory,
                            availableProjectDirectories,
                          )}
                        </option>
                      ))
                    ) : (
                      <option value={DEFAULT_PROJECT_DIRECTORY}>
                        {getProjectLabel(DEFAULT_PROJECT_DIRECTORY, [
                          DEFAULT_PROJECT_DIRECTORY,
                        ])}
                      </option>
                    )}
                  </select>
                  {newVentureProjectDirectory ? (
                    <div className="grid min-w-0 max-w-full gap-3">
                      <label
                        htmlFor="venture-feature-tag"
                        className="text-[11px] uppercase tracking-[0.28em] text-slate-400"
                      >
                        Tagged features
                      </label>
                      <div className="flex min-w-0 max-w-full flex-wrap items-center gap-3 overflow-x-hidden">
                        <select
                          id="venture-feature-tag"
                          value={newVentureSelectedFeaturePath}
                          onChange={(event) =>
                            setNewVentureSelectedFeaturePath(event.target.value)
                          }
                          className="agent-chat-scrollbar w-full max-w-full min-w-0 flex-1 rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none"
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
                        <div className="flex min-w-0 max-w-full flex-wrap gap-2 overflow-x-hidden rounded-[1.25rem] border border-white/10 bg-slate-900/50 p-3">
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
                    className="agent-chat-scrollbar min-h-24 w-full max-w-full min-w-0 rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
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
                  <div className="grid min-w-0 max-w-full gap-4 overflow-x-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-white/10 bg-slate-950/45 px-4 py-3">
                      <p className="text-sm text-slate-300">
                        {completedVenturesCount === 0
                          ? "No completed ventures to clear yet."
                          : isConfirmingClearCompletedVentures
                            ? `Confirm clearing ${completedVenturesCount} completed ${
                                completedVenturesCount === 1
                                  ? "venture"
                                  : "ventures"
                              }.`
                          : `${completedVenturesCount} completed ${
                              completedVenturesCount === 1
                                ? "venture is"
                                : "ventures are"
                            } ready to clear.`}
                      </p>
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            if (isConfirmingClearCompletedVentures) {
                              void clearCompletedVentures();
                              return;
                            }

                            setIsConfirmingClearCompletedVentures(true);
                          }}
                          disabled={
                            completedVenturesCount === 0 ||
                            isClearingCompletedVentures
                          }
                          className="rounded-full border border-rose-400/20 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                        >
                          {isClearingCompletedVentures
                            ? "Clearing..."
                            : isConfirmingClearCompletedVentures
                              ? "Confirm"
                              : "Clear completed"}
                        </button>
                        {isConfirmingClearCompletedVentures ? (
                          <button
                            type="button"
                            onClick={() =>
                              setIsConfirmingClearCompletedVentures(false)
                            }
                            disabled={isClearingCompletedVentures}
                            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                          >
                            Undo
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid min-w-0 gap-2">
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
                        className="agent-chat-scrollbar w-full max-w-full min-w-0 rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none"
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
                        className={`min-w-0 max-w-full overflow-x-hidden rounded-[1.5rem] border p-4 shadow-[0_20px_50px_rgba(2,6,23,0.3)] ${getVentureCardClassName(selectedVenture.progressState)}`}
                      >
                        {editingVentureId === selectedVenture.id ? (
                          <div className="grid min-w-0 max-w-full gap-3 overflow-x-hidden">
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
                              className="w-full max-w-full min-w-0 rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none"
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
                              className="agent-chat-scrollbar w-full max-w-full min-w-0 rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none"
                            >
                              <option value="">No project tag</option>
                              {editingVentureProjectDirectory &&
                              !availableProjectDirectories.includes(
                                editingVentureProjectDirectory,
                              ) ? (
                                <option value={editingVentureProjectDirectory}>
                                  {getProjectLabel(
                                    editingVentureProjectDirectory,
                                    availableProjectDirectories,
                                  )}
                                </option>
                              ) : null}
                              {availableProjectDirectories.length > 0 ? (
                                availableProjectDirectories.map(
                                  (projectDirectory) => (
                                    <option
                                      key={projectDirectory}
                                      value={projectDirectory}
                                    >
                                      {getProjectLabel(
                                        projectDirectory,
                                        availableProjectDirectories,
                                      )}
                                    </option>
                                  ),
                                )
                              ) : (
                                <option value={DEFAULT_PROJECT_DIRECTORY}>
                                  {getProjectLabel(DEFAULT_PROJECT_DIRECTORY, [
                                    DEFAULT_PROJECT_DIRECTORY,
                                  ])}
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
                              <div className="grid min-w-0 max-w-full gap-3">
                                <div className="flex min-w-0 max-w-full flex-wrap items-center gap-3 overflow-x-hidden">
                                  <select
                                    id={`venture-edit-feature-${selectedVenture.id}`}
                                    value={editingVentureSelectedFeaturePath}
                                    onChange={(event) =>
                                      setEditingVentureSelectedFeaturePath(
                                        event.target.value,
                                      )
                                    }
                                    className="agent-chat-scrollbar w-full max-w-full min-w-0 flex-1 rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none"
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
                                  <div className="flex min-w-0 max-w-full flex-wrap gap-2 overflow-x-hidden rounded-[1.25rem] border border-white/10 bg-slate-900/50 p-3">
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
                              className="agent-chat-scrollbar min-h-24 w-full max-w-full min-w-0 rounded-[1.25rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none"
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
                          <div className="grid min-w-0 max-w-full gap-4 overflow-x-hidden">
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
                                <p className="min-w-0 max-w-full break-words rounded-full border border-white/10 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
                                  {(selectedVenture.projectDirectory
                                    ? getProjectLabel(
                                        selectedVenture.projectDirectory,
                                        availableProjectDirectories,
                                      )
                                    : null) ||
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
                                  className="agent-chat-scrollbar w-full max-w-full min-w-0 rounded-full border border-white/10 bg-slate-900/80 px-4 py-2 text-sm text-slate-100 outline-none disabled:cursor-not-allowed disabled:bg-slate-800"
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
                              <div className="min-w-0 max-w-full whitespace-pre-wrap break-words rounded-[1.25rem] border border-white/10 bg-slate-900/55 px-4 py-3 text-sm leading-6 text-slate-200">
                                {selectedVenture.details || "No details added yet."}
                              </div>
                            </div>

                            <div className="grid gap-2">
                              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                                Tagged features
                              </p>
                              {selectedVentureFeatureTags.length > 0 ? (
                                <div className="flex min-w-0 max-w-full flex-wrap gap-2 overflow-x-hidden rounded-[1.25rem] border border-white/10 bg-slate-900/55 p-3">
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

        {activePrimaryOverlay === "git-sync" ? (
          <section className={primaryOverlayClassName}>
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-5">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                  Git Sync
                </p>
                <h2 className="mt-2 text-xl font-semibold text-white">
                  Manual repository operations
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Commit local changes or sync with GitHub using explicit git commands run by the daemon.
                </p>
              </div>
              <button
                type="button"
                onClick={closeGitSyncOverlay}
                className="rounded-full border border-white/10 bg-white/6 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
              >
                X
              </button>
            </div>
            <div className="agent-chat-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4 sm:px-5">
              <GitSyncPanel
                acceptsWork={daemonAcceptsWork}
                availableProjectDirectories={availableProjectDirectories}
                commitMessage={gitSyncCommitMessage}
                defaultProjectDirectory={DEFAULT_PROJECT_DIRECTORY}
                isRequestInFlight={isGitSyncRequestInFlight}
                latestResult={gitSyncResult}
                onCommitMessageChange={setGitSyncCommitMessage}
                onCommitChanges={commitGitSyncChanges}
                onSelectedProjectDirectoryChange={setGitSyncProjectDirectory}
                onSyncWithGitHub={syncGitSyncWithGitHub}
                onViewGitStatus={viewGitSyncStatus}
                selectedProjectDirectory={gitSyncProjectDirectory}
                statusText={gitSyncStatus}
              />
            </div>
          </section>
        ) : null}

        {activePrimaryOverlay === "project-initialization" ? (
          <section className={primaryOverlayClassName}>
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-5">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                  Project initialization
                </p>
                <h2 className="mt-2 text-xl font-semibold text-white">
                  Create a Daedalus project
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Create an initialized project beneath the daemon manager&apos;s execution root.
                </p>
              </div>
              <button
                type="button"
                onClick={closeProjectInitializationOverlay}
                className="rounded-full border border-white/10 bg-white/6 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
              >
                X
              </button>
            </div>
            <div className="agent-chat-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4 sm:px-5">
              <ProjectInitializerPanel
                acceptsWork={daemonAcceptsWork}
                authenticated={Boolean(currentUser && accessToken)}
                createGitHubRepository={projectInitializationCreateGitHub}
                executionRoot={managerStatus?.execution_root ?? null}
                isManagerOnline={managerOnline}
                isRequestInFlight={isProjectInitializationInFlight}
                latestResult={projectInitializationResult}
                onCreateGitHubRepositoryChange={setProjectInitializationCreateGitHub}
                onInitialize={() => void sendProjectInitializationRequest()}
                onProjectNameChange={setProjectInitializationName}
                projectName={projectInitializationName}
                statusText={projectInitializationStatus}
              />
            </div>
          </section>
        ) : null}

        {activePrimaryOverlay === "new-feature" ? (
          <section className={primaryOverlayClassName}>
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-5">
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
            <div className="agent-chat-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4 sm:px-5">
              <AgentSessionPanel
                acceptsWork={daemonAcceptsWork}
                agentModels={agentModels}
                availableProjectDirectories={availableProjectDirectories}
                defaultProjectDirectory={DEFAULT_PROJECT_DIRECTORY}
                selectedMode={selectedAgentMode}
                onSelectedModeChange={setSelectedAgentMode}
                onProviderChange={selectProvider}
                onPromptTextChange={setPromptText}
                onRemoveTargetedFeature={removeTargetedFeature}
                onSelectedProjectDirectoryChange={setSelectedProjectDirectory}
                onSelectedReasoningChange={setSelectedReasoning}
                onSelectModel={selectModel}
                onSendPrompt={sendAgentPrompt}
                onOpenFeatureTagSearch={openFeatureTagSearch}
                promptText={promptText}
                selectedModelId={selectedModelId}
                selectedProvider={selectedProvider}
                selectedProjectDirectory={selectedProjectDirectory}
                selectedReasoning={selectedReasoning}
                submissionError={promptSubmissionError}
                targetedFeatures={targetedFeatures}
              />
            </div>
          </section>
        ) : null}

        {activePrimaryOverlay === "feature-detail" && selectedFeatureSession ? (
          <section className={primaryOverlayClassName}>
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-5">
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
            <div className="border-b border-white/10 px-4 py-3 sm:px-5">
              <section className="mb-3 rounded-[1rem] border border-white/10 bg-black/25 px-3 py-3 text-xs text-slate-300">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">Feature execution</p>
                    {runnableFeature.runnable ? (
                      <p className="mt-1 break-all text-slate-400">{runnableFeature.preview}</p>
                    ) : (
                      <p className="mt-1 text-amber-200">{runnableFeature.reason}</p>
                    )}
                  </div>
                  {selectedFeatureRun?.status === "queued" || selectedFeatureRun?.status === "running" ? (
                    <button type="button" onClick={() => void cancelFeatureExecution()} disabled={selectedFeatureRun.cancel_requested} className="rounded-full border border-amber-300/30 px-3 py-2 font-semibold text-amber-100 disabled:opacity-50">
                      {selectedFeatureRun.cancel_requested ? "Cancelling" : "Cancel"}
                    </button>
                  ) : (
                    <button type="button" onClick={() => void startFeatureExecution()} disabled={!daemonAcceptsWork || !runnableFeature.runnable} className="rounded-full bg-emerald-300 px-3 py-2 font-semibold text-slate-950 disabled:opacity-40">
                      Run
                    </button>
                  )}
                </div>
                {selectedFeatureRun ? (
                  <div className="mt-3 grid gap-1 border-t border-white/10 pt-2 text-slate-400">
                    <p>Status: <span className="text-white">{selectedFeatureRun.status}</span>{selectedFeatureRun.exit_code !== null ? ` · exit ${selectedFeatureRun.exit_code}` : ""}</p>
                    {selectedFeatureRun.started_at ? <p>Started: {formatFeatureExecutionTime(selectedFeatureRun.started_at)}</p> : null}
                    {selectedFeatureRun.completed_at ? <p>Finished: {formatFeatureExecutionTime(selectedFeatureRun.completed_at)}</p> : null}
                    {selectedFeatureRun.error ? <p className="text-rose-200">{selectedFeatureRun.error}</p> : null}
                    {selectedFeatureRun.stdout_tail ? <pre className="max-h-28 overflow-auto whitespace-pre-wrap rounded bg-slate-950 p-2">stdout: {selectedFeatureRun.stdout_tail}</pre> : null}
                    {selectedFeatureRun.stderr_tail ? <pre className="max-h-28 overflow-auto whitespace-pre-wrap rounded bg-slate-950 p-2 text-amber-100">stderr: {selectedFeatureRun.stderr_tail}</pre> : null}
                  </div>
                ) : null}
                {featureExecutionMessage ? <p className="mt-2 text-slate-400">{featureExecutionMessage}</p> : null}
              </section>
              <div className="flex flex-wrap gap-2 rounded-[1.25rem] border border-white/10 bg-black/25 p-1">
                <button
                  type="button"
                  onClick={() => setFeatureDetailTab("edit")}
                  className={`min-w-0 flex-1 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] transition sm:flex-none ${
                    featureDetailTab === "edit"
                      ? "bg-cyan-300 text-slate-950"
                      : "text-slate-300 hover:bg-white/10"
                  }`}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setFeatureDetailTab("info")}
                  className={`min-w-0 flex-1 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] transition sm:flex-none ${
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
                  className={`min-w-0 flex-1 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] transition sm:flex-none ${
                    featureDetailTab === "params"
                      ? "bg-cyan-300 text-slate-950"
                      : "text-slate-300 hover:bg-white/10"
                  }`}
                >
                  Params
                </button>
              </div>
            </div>
            <div className="agent-chat-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4 sm:px-5">
              {featureDetailTab === "edit" ? (
                <AgentSessionPanel
                  acceptsWork={daemonAcceptsWork}
                  agentModels={agentModels}
                  availableProjectDirectories={availableProjectDirectories}
                  defaultProjectDirectory={DEFAULT_PROJECT_DIRECTORY}
                  selectedMode={selectedAgentMode}
                  onSelectedModeChange={setSelectedAgentMode}
                  onProviderChange={selectProvider}
                  onPromptTextChange={setPromptText}
                  onRemoveTargetedFeature={removeTargetedFeature}
                  onSelectedProjectDirectoryChange={setSelectedProjectDirectory}
                  onSelectedReasoningChange={setSelectedReasoning}
                  onSelectModel={selectModel}
                  onSendPrompt={sendAgentPrompt}
                  onOpenFeatureTagSearch={openFeatureTagSearch}
                  promptText={promptText}
                  selectedModelId={selectedModelId}
                  selectedProvider={selectedProvider}
                  selectedProjectDirectory={selectedProjectDirectory}
                  selectedReasoning={selectedReasoning}
                  submissionError={promptSubmissionError}
                  targetedFeatures={targetedFeatures}
                />
              ) : featureDetailTab === "info" ? (
                <div className="grid gap-2">
                  <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                    Feature file
                  </p>
                  <pre className="min-w-0 overflow-x-hidden whitespace-pre-wrap break-words rounded-[1.25rem] border border-white/10 bg-slate-900/70 px-4 py-3 text-sm leading-6 text-slate-200">
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
                      <>
                        <EntryPointPicker acceptsWork={daemonAcceptsWork} featureMarkdown={selectedFeatureRecord?.markdown ?? ""} parameterFile={matchedParameterFile} pending={isEntryPointUpdatePending} daemonError={entryPointUpdateError} onSave={(operation, entryPoint) => requestEntryPointUpdate({ projectPath: selectedFeatureSession.projectPath, featureFilePath: selectedFeatureSession.filePath, operation, entryPoint })} />
                        <ParameterVariableSelector
                          acceptsWork={daemonAcceptsWork}
                          key={`${selectedFeatureSession.projectPath}:${matchedParameterFile.path}`}
                          projectPath={selectedFeatureSession.projectPath}
                          parameterFilePath={matchedParameterFile.path}
                          parameterFile={matchedParameterFile}
                          onRequestSave={requestParameterFileUpdate}
                        />
                      </>
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
      </div> : null}

      {workspaceView === "feature" && currentUser && accessToken ? (
        <DaemonManagerPanel
          accessToken={accessToken}
          supabasePublishableKey={supabasePublishableKey}
          supabaseUrl={supabaseUrl}
          status={managerStatus}
          onRequestRefresh={() => refreshInboxRef.current()}
        />
      ) : null}

      {(workspaceView === "feature" || workspaceView === "aop") ? <FeatureSearchDialog
        excludedFilePaths={
          featureSearchMode === "tag"
            ? targetedFeatures.map((feature) => feature.filePath)
            : []
        }
        initialScope={
          featureSearchMode === "tag" ? selectedProjectDirectory : "all"
        }
        isMobile={isMobileLayout}
        isOpen={featureSearchMode !== null}
        mode={featureSearchMode ?? "navigate"}
        onClose={closeFeatureSearch}
        onSelect={handleFeatureSearchSelect}
        projects={projects ?? {}}
      /> : null}
    </main>
  );
}

function reviewReceipt(
  transport: ReviewReceipt["transport"], key: string, updatedAt?: string,
  generation?: number,
): ReviewReceipt {
  return {
    receiptId: `${transport}:${key}:${updatedAt ?? "immutable"}`,
    transport,
    key,
    updatedAt,
    generation,
  };
}

function mergeArchitectureView(
  current: Record<string, ArchitectureView>, incoming: ArchitectureView,
) {
  const existing = current[incoming.prompt_id];
  if (existing && (
    existing.generation > incoming.generation
    || (existing.generation === incoming.generation && existing.updated_at > incoming.updated_at)
  )) return current;
  return {
    ...current,
    [incoming.prompt_id]: {
      ...incoming,
      progress_events: existing?.generation === incoming.generation
        ? existing.progress_events ?? []
        : [],
    },
  };
}

function mergeArchitectureProgressEvents(
  current: Record<string, ArchitectureView>, events: ArchitectureProgressEvent[],
) {
  let next = current;
  for (const event of events) {
    const entry = Object.entries(next).find(([, view]) => view.id === event.architecture_view_id);
    if (!entry) continue;
    const [promptId, view] = entry;
    if (view.generation !== event.generation) continue;
    const prior = view.progress_events ?? [];
    const retained = prior.filter((item) => item.id !== event.id);
    next = {
      ...next,
      [promptId]: {
        ...view,
        progress_events: [...retained, event].sort((left, right) => (
          left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id)
        )),
      },
    };
  }
  return next;
}

function isManagerHeartbeatCurrent(status: DaemonManagerStatus) {
  const heartbeat = status.manager_heartbeat_at ? Date.parse(status.manager_heartbeat_at) : 0;
  return Boolean(heartbeat && Date.now() - heartbeat <= 15000);
}

async function fetchClientReviewInbox(
  supabaseUrl: string, supabasePublishableKey: string, accessToken: string,
) {
  const response = await fetch(new URL("/rest/v1/rpc/get_client_review_inbox", supabaseUrl), {
    method: "POST",
    headers: getAuthenticatedSupabaseHeaders(supabasePublishableKey, accessToken),
    body: JSON.stringify({}),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("client review inbox fetch failed");
  return await response.json() as ClientReviewInbox;
}

async function acknowledgeClientReviews(
  supabaseUrl: string, supabasePublishableKey: string, accessToken: string,
  receipts: ReviewReceipt[],
) {
  if (receipts.length === 0) return { acknowledged: [], rejected: [] };
  const response = await fetch(new URL("/rest/v1/rpc/acknowledge_client_reviews", supabaseUrl), {
    method: "POST",
    headers: getAuthenticatedSupabaseHeaders(supabasePublishableKey, accessToken),
    body: JSON.stringify({ receipts }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("client review acknowledgement failed");
  return await response.json() as { acknowledged: string[]; rejected: string[] };
}

async function fetchCommunicationReviews(
  supabaseUrl: string,
  supabasePublishableKey: string,
  accessToken: string,
  userId: string,
) {
  const url = new URL("/rest/v1/communications", supabaseUrl);
  url.searchParams.set("select", "content,purpose,updated_at");
  url.searchParams.set("user_id", `eq.${userId}`);
  url.searchParams.set("purpose", `in.(${[FEATURE_FILE_LOAD_PURPOSE, PARAMETER_FILE_LOAD_PURPOSE, PARAMETER_FILE_UPDATE_PURPOSE, ENTRY_POINT_UPDATE_PURPOSE, AGENT_PROMPT_PURPOSE].join(",")})`);
  url.searchParams.set("message", `eq.${CLIENT_REVIEW}`);
  url.searchParams.set("limit", "10");
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

  return (await response.json()) as Array<{ content: string | null; purpose: string; updated_at: string }>;
}

async function updateMessage(
  supabaseUrl: string,
  supabasePublishableKey: string,
  accessToken: string,
  userId: string,
  purpose: string,
  content: string | null,
) {
  const existingRowsUrl = new URL("/rest/v1/communications", supabaseUrl);
  existingRowsUrl.searchParams.set("select", "purpose");
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
    throw new Error(
      `communications message lookup failed (${existingRowsResponse.status}): ${await existingRowsResponse.text()}`,
    );
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
            body: JSON.stringify({ message: DAEMON_REVIEW, content, purpose, user_id: userId }),
          },
        )
      : await fetch(new URL("/rest/v1/communications", supabaseUrl), {
          method: "POST",
          headers,
          body: JSON.stringify({ message: DAEMON_REVIEW, content, purpose, user_id: userId }),
        });

  if (!response.ok) {
    const detail = await response.text();
    throw submissionRequestError(response, detail, "communications message update failed");
  }

  return content ?? "";
}

async function completeCommunicationReview(
  supabaseUrl: string,
  supabasePublishableKey: string,
  accessToken: string,
  userId: string,
  purpose: string,
  expectedUpdatedAt?: string,
) {
  const url = new URL("/rest/v1/communications", supabaseUrl);
  url.searchParams.set("user_id", `eq.${userId}`);
  url.searchParams.set("purpose", `eq.${purpose}`);
  url.searchParams.set("message", `eq.${CLIENT_REVIEW}`);
  if (expectedUpdatedAt) url.searchParams.set("updated_at", `eq.${expectedUpdatedAt}`);
  const response = await fetch(url, {
    method: "PATCH",
    headers: getAuthenticatedSupabaseHeaders(supabasePublishableKey, accessToken),
    body: JSON.stringify({ message: CLIENT_COMPLETE }),
  });
  if (!response.ok) throw new Error("communications acknowledgement failed");
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
  url.searchParams.set("message", `eq.${CLIENT_REVIEW}`);
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
    return null;
  }

  return row.payload;
}

async function fetchDaemonPayloadReviews(
  supabaseUrl: string, supabasePublishableKey: string, accessToken: string, userId: string,
) {
  const url = new URL("/rest/v1/daemon_payloads", supabaseUrl);
  url.searchParams.set("select", "kind,payload,updated_at");
  url.searchParams.set("user_id", `eq.${userId}`);
  url.searchParams.set("kind", `in.(${FEATURE_FILES_PAYLOAD_KIND},${PARAMETER_FILES_PAYLOAD_KIND},${GIT_SYNC_PAYLOAD_KIND},${PROJECT_INITIALIZATION_PAYLOAD_KIND})`);
  url.searchParams.set("message", `eq.${CLIENT_REVIEW}`);
  url.searchParams.set("limit", "10");
  const response = await fetch(url, {
    headers: getAuthenticatedSupabaseHeaders(supabasePublishableKey, accessToken),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("daemon payload review fetch failed");
  return (await response.json()) as Array<DaemonPayloadRow<unknown>>;
}

async function completeDaemonPayloadReview(
  supabaseUrl: string,
  supabasePublishableKey: string,
  accessToken: string,
  userId: string,
  kind: string,
  expectedUpdatedAt?: string,
) {
  const url = new URL("/rest/v1/daemon_payloads", supabaseUrl);
  url.searchParams.set("user_id", `eq.${userId}`);
  url.searchParams.set("kind", `eq.${kind}`);
  url.searchParams.set("message", `eq.${CLIENT_REVIEW}`);
  if (expectedUpdatedAt) url.searchParams.set("updated_at", `eq.${expectedUpdatedAt}`);
  const response = await fetch(url, {
    method: "PATCH",
    headers: getAuthenticatedSupabaseHeaders(supabasePublishableKey, accessToken),
    body: JSON.stringify({ message: CLIENT_COMPLETE }),
  });
  if (!response.ok) throw new Error("daemon payload acknowledgement failed");
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

async function deleteCompletedVenturesRows(
  supabaseUrl: string,
  supabasePublishableKey: string,
  accessToken: string,
  userId: string,
) {
  const url = new URL("/rest/v1/ventures", supabaseUrl);
  url.searchParams.set("progress_state", "eq.completed");
  url.searchParams.set("user_id", `eq.${userId}`);

  const response = await fetch(url, {
    method: "DELETE",
    headers: getAuthenticatedSupabaseHeaders(
      supabasePublishableKey,
      accessToken,
    ),
  });

  if (!response.ok) {
    throw new Error("supabase completed venture delete failed");
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

function mapAgentTaskRowToQueueEntry(row: AgentTaskRow): AgentPromptQueueEntry {
  return {
    promptId: row.id,
    durableTaskId: row.id,
    directory: row.repository,
    prompt: row.prompt,
    provider: row.provider,
    model: row.model,
    reasoning: row.reasoning,
    planningMode: row.planning_mode,
    askMode: false,
    bridgeMode: false,
    targetedFeaturePaths: row.targeted_feature_paths ?? [],
    status: row.status,
    enqueuedAt: Date.parse(row.created_at),
    sentAt: row.started_at ? Date.parse(row.started_at) : undefined,
    completedAt: row.completed_at ? Date.parse(row.completed_at) : undefined,
    updatedAt: row.updated_at || row.created_at,
    error: row.error || undefined,
    verificationAttempts: row.verification_attempts,
    cancelRequested: Boolean(row.cancel_requested),
  };
}

function getDevEnvironmentState(
  error: string,
  isLoadingFeatureFiles: boolean,
  isLoadingParameterFiles: boolean,
  featureFileMessage: string,
  parameterFileMessage: string,
  featureProjects: FeatureFileProjects | null,
  parameterProjects: ParameterFileProjects | null,
): DevEnvironmentState {
  if (error) {
    return "error";
  }

  if (isLoadingFeatureFiles || isLoadingParameterFiles) {
    return "loading";
  }

  if (
    featureFileMessage === DAEMON_SENT_FEATURE_FILES &&
    parameterFileMessage === DAEMON_SENT_PARAMETER_FILES &&
    featureProjects !== null &&
    parameterProjects !== null
  ) {
    return "ready";
  }

  return "idle";
}

function getGraphZoomSettings(
  parameterProjects: ParameterFileProjects | null,
  isMobileLayout: boolean,
) {
  const graphParameterFile = findParameterFileByPath(
    parameterProjects,
    GRAPH_PARAMETER_FILE_PATH,
  );
  const parsedVariables = graphParameterFile
    ? parseParameterFile(graphParameterFile.toml).variables
    : [];

  const minZoom = getNumericParameterValue(
    parsedVariables,
    isMobileLayout ? "mobile_min_zoom" : "desktop_min_zoom",
    isMobileLayout ? DEFAULT_MOBILE_MIN_ZOOM : DEFAULT_DESKTOP_MIN_ZOOM,
  );
  const maxZoom = getNumericParameterValue(
    parsedVariables,
    isMobileLayout ? "mobile_max_zoom" : "desktop_max_zoom",
    isMobileLayout ? DEFAULT_MOBILE_MAX_ZOOM : DEFAULT_DESKTOP_MAX_ZOOM,
  );
  const safeMinZoom = Math.min(minZoom, maxZoom);
  const safeMaxZoom = Math.max(minZoom, maxZoom);
  const defaultZoom = getNumericParameterValue(
    parsedVariables,
    isMobileLayout ? "mobile_default_zoom" : "desktop_default_zoom",
    isMobileLayout ? DEFAULT_MOBILE_ZOOM : DEFAULT_DESKTOP_ZOOM,
  );
  const nodeScale = getNumericParameterValue(
    parsedVariables,
    isMobileLayout ? "mobile_node_scale" : "desktop_node_scale",
    isMobileLayout ? DEFAULT_MOBILE_NODE_SCALE : DEFAULT_DESKTOP_NODE_SCALE,
  );
  const mobileLabelMinZoom = getNumericParameterValue(
    parsedVariables,
    "mobile_label_min_zoom",
    DEFAULT_MOBILE_LABEL_MIN_ZOOM,
  );

  return {
    defaultZoom: clampNumber(defaultZoom, safeMinZoom, safeMaxZoom),
    maxZoom: safeMaxZoom,
    minZoom: safeMinZoom,
    nodeScale: Math.max(0.1, nodeScale),
    mobileLabelMinZoom: clampNumber(
      mobileLabelMinZoom,
      safeMinZoom,
      safeMaxZoom,
    ),
  };
}

function findParameterFileByPath(
  parameterProjects: ParameterFileProjects | null,
  targetPath: string,
) {
  const normalizedTargetPath = normalizeParameterFilePath(targetPath);

  for (const parameterFiles of Object.values(parameterProjects ?? {})) {
    const matchingParameterFile = parameterFiles.find(
      (parameterFile) =>
        normalizeParameterFilePath(parameterFile.path) === normalizedTargetPath,
    );

    if (matchingParameterFile) {
      return matchingParameterFile;
    }
  }

  return null;
}

function getNumericParameterValue(
  variables: ReturnType<typeof parseParameterFile>["variables"],
  variableName: string,
  fallbackValue: number,
) {
  const matchingVariable = variables.find(
    (variable) =>
      variable.name === variableName &&
      (variable.kind === "integer" || variable.kind === "float"),
  );

  if (!matchingVariable) {
    return fallbackValue;
  }

  const parsedValue = Number(matchingVariable.displayValue);

  if (!Number.isFinite(parsedValue)) {
    return fallbackValue;
  }

  return parsedValue;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

async function insertAgentTask(
  supabaseUrl: string,
  supabasePublishableKey: string,
  accessToken: string,
  userId: string,
  task: AgentPromptPayload,
) {
  const url = new URL("/rest/v1/agent_tasks", supabaseUrl);
  const response = await fetch(url, {
    method: "POST",
    headers: getAuthenticatedSupabaseHeaders(supabasePublishableKey, accessToken),
    body: JSON.stringify({
      id: task.promptId,
      prompt_id: task.promptId,
      user_id: userId,
      repository: task.directory,
      prompt: task.prompt,
      provider: task.provider,
      model: task.model,
      reasoning: task.reasoning,
      conversation_id: task.conversationId ?? null,
      task_type: "implementation",
      planning_mode: false,
      targeted_feature_paths: task.targetedFeaturePaths,
      status: "queued",
      message: DAEMON_REVIEW,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw submissionRequestError(response, detail, "agent task insert failed");
  }
}

async function insertFeatureExecutionRun(
  supabaseUrl: string, supabasePublishableKey: string, accessToken: string,
  userId: string, request: { project_directory: string; feature_file_path: string },
) {
  const response = await fetch(new URL("/rest/v1/feature_execution_runs", supabaseUrl), {
    method: "POST",
    headers: getAuthenticatedSupabaseHeaders(supabasePublishableKey, accessToken),
    body: JSON.stringify({ user_id: userId, ...request, status: "queued", message: DAEMON_REVIEW }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw submissionRequestError(response, detail, "feature execution run insert failed");
  }
}

function submissionRequestError(response: Response, detail: string, fallback: string) {
  const normalizedDetail = detail.toLowerCase();
  if (normalizedDetail.includes("row-level security") || normalizedDetail.includes("42501")) {
    return new Error(DAEMON_ADMISSION_MESSAGE);
  }
  return new Error(`${fallback} (${response.status}): ${detail}`);
}

async function fetchFeatureExecutionRuns(
  supabaseUrl: string, supabasePublishableKey: string, accessToken: string, userId: string,
) {
  const url = new URL("/rest/v1/feature_execution_runs", supabaseUrl);
  url.searchParams.set("select", "id,project_directory,feature_file_path,status,cancel_requested,command,parameter_file_path,entry_point_path,started_at,completed_at,exit_code,stdout_tail,stderr_tail,error,message,updated_at");
  url.searchParams.set("user_id", `eq.${userId}`);
  url.searchParams.set("message", `eq.${CLIENT_REVIEW}`);
  url.searchParams.set("order", "updated_at.asc");
  url.searchParams.set("limit", "50");
  const response = await fetch(url, { headers: getAuthenticatedSupabaseHeaders(supabasePublishableKey, accessToken) });
  if (!response.ok) throw new Error("feature execution run query failed");
  const rows = await response.json() as FeatureExecutionRunRow[];
  return rows.map((row) => ({ ...row, detail_loaded: true }));
}

async function fetchFeatureExecutionHydration(
  supabaseUrl: string, supabasePublishableKey: string, accessToken: string, userId: string,
) {
  const url = new URL("/rest/v1/feature_execution_runs", supabaseUrl);
  url.searchParams.set("select", "id,project_directory,feature_file_path,status,cancel_requested,command,parameter_file_path,entry_point_path,started_at,completed_at,exit_code,error,message,updated_at");
  url.searchParams.set("user_id", `eq.${userId}`);
  url.searchParams.set("status", "in.(queued,running)");
  url.searchParams.set("message", `eq.${DAEMON_REVIEW}`);
  url.searchParams.set("order", "created_at.desc");
  url.searchParams.set("limit", "50");
  const response = await fetch(url, { headers: getAuthenticatedSupabaseHeaders(supabasePublishableKey, accessToken), cache: "no-store" });
  if (!response.ok) throw new Error("feature execution hydration query failed");
  const rows = await response.json() as Array<Omit<FeatureExecutionRunRow, "stdout_tail" | "stderr_tail">>;
  return rows.map((row) => ({ ...row, stdout_tail: "", stderr_tail: "", detail_loaded: true }));
}

async function fetchFeatureExecutionHistorySummaries(
  supabaseUrl: string, supabasePublishableKey: string, accessToken: string, userId: string,
) {
  const url = new URL("/rest/v1/feature_execution_runs", supabaseUrl);
  url.searchParams.set("select", "id,project_directory,feature_file_path,status,cancel_requested,command,parameter_file_path,entry_point_path,started_at,completed_at,exit_code,error,message,updated_at");
  url.searchParams.set("user_id", `eq.${userId}`);
  url.searchParams.set("status", "in.(completed,failed,cancelled)");
  url.searchParams.set("order", "created_at.desc");
  url.searchParams.set("limit", "50");
  const response = await fetch(url, { method: "POST", headers: getAuthenticatedSupabaseHeaders(supabasePublishableKey, accessToken), cache: "no-store" });
  if (!response.ok) throw new Error("feature execution history query failed");
  const rows = await response.json() as Array<Omit<FeatureExecutionRunRow, "stdout_tail" | "stderr_tail">>;
  return rows.map((row) => ({ ...row, stdout_tail: "", stderr_tail: "", detail_loaded: false }));
}

async function fetchFeatureExecutionRunDetail(
  supabaseUrl: string, supabasePublishableKey: string, accessToken: string, userId: string, runId: string,
) {
  const url = new URL("/rest/v1/feature_execution_runs", supabaseUrl);
  url.searchParams.set("select", "id,project_directory,feature_file_path,status,cancel_requested,command,parameter_file_path,entry_point_path,started_at,completed_at,exit_code,stdout_tail,stderr_tail,error,message,updated_at");
  url.searchParams.set("user_id", `eq.${userId}`);
  url.searchParams.set("id", `eq.${runId}`);
  url.searchParams.set("limit", "1");
  const response = await fetch(url, { headers: getAuthenticatedSupabaseHeaders(supabasePublishableKey, accessToken), cache: "no-store" });
  if (!response.ok) throw new Error("feature execution detail query failed");
  const rows = await response.json() as FeatureExecutionRunRow[];
  return rows[0] ? { ...rows[0], detail_loaded: true } : null;
}

async function requestFeatureExecutionCancel(
  supabaseUrl: string, supabasePublishableKey: string, accessToken: string, userId: string, runId: string,
) {
  const url = new URL("/rest/v1/feature_execution_runs", supabaseUrl);
  url.searchParams.set("id", `eq.${runId}`);
  url.searchParams.set("user_id", `eq.${userId}`);
  url.searchParams.set("status", "in.(queued,running)");
  const response = await fetch(url, {
    method: "PATCH", headers: getAuthenticatedSupabaseHeaders(supabasePublishableKey, accessToken),
    body: JSON.stringify({ cancel_requested: true }),
  });
  if (!response.ok) throw new Error("feature execution cancellation failed");
}

async function completeFeatureExecutionReview(
  supabaseUrl: string, supabasePublishableKey: string, accessToken: string, userId: string, runId: string,
  expectedUpdatedAt: string,
) {
  const url = new URL("/rest/v1/feature_execution_runs", supabaseUrl);
  url.searchParams.set("id", `eq.${runId}`);
  url.searchParams.set("user_id", `eq.${userId}`);
  url.searchParams.set("message", `eq.${CLIENT_REVIEW}`);
  url.searchParams.set("updated_at", `eq.${expectedUpdatedAt}`);
  const response = await fetch(url, {
    method: "PATCH", headers: getAuthenticatedSupabaseHeaders(supabasePublishableKey, accessToken),
    body: JSON.stringify({ message: CLIENT_COMPLETE }),
  });
  if (!response.ok) throw new Error("feature execution acknowledgement failed");
}

function formatFeatureExecutionTime(value: string) {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.valueOf()) ? value : timestamp.toLocaleString();
}

async function fetchActiveAgentTaskSummaries(
  supabaseUrl: string, supabasePublishableKey: string, accessToken: string, userId: string,
) {
  const url = new URL("/rest/v1/agent_tasks", supabaseUrl);
  url.searchParams.set("select", "id,repository,prompt,provider,model,reasoning,planning_mode,targeted_feature_paths,status,queue_sequence,created_at,started_at,completed_at,error,verification_attempts,cancel_requested,message,updated_at");
  url.searchParams.set("user_id", `eq.${userId}`);
  url.searchParams.set("message", `eq.${DAEMON_REVIEW}`);
  url.searchParams.set("status", "in.(queued,running,verifying,ready,integrating,resolving)");
  url.searchParams.set("order", "queue_sequence.asc");
  url.searchParams.set("limit", "50");
  const response = await fetch(url, { headers: getAuthenticatedSupabaseHeaders(supabasePublishableKey, accessToken), cache: "no-store" });
  if (!response.ok) {
    const detail = (await response.text()).trim();
    throw new Error(
      detail
        ? `agent task hydration query failed (${response.status}): ${detail}`
        : `agent task hydration query failed (${response.status})`,
    );
  }
  return (await response.json()) as AgentTaskRow[];
}

async function fetchDurableTaskDeletionRequests(
  supabaseUrl: string, supabasePublishableKey: string, accessToken: string, userId: string,
) {
  const url = new URL("/rest/v1/rpc/get_agent_conversation_deletion_requests", supabaseUrl);
  const response = await fetch(url, { method: "POST", headers: getAuthenticatedSupabaseHeaders(supabasePublishableKey, accessToken), cache: "no-store" });
  if (!response.ok) {
    const detail = (await response.text()).trim();
    throw new Error(detail ? `task deletion hydration query failed (${response.status}): ${detail}` : `task deletion hydration query failed (${response.status})`);
  }
  return (await response.json()) as ConversationDeletionRequestRow[];
}

async function fetchAgentTaskById(
  supabaseUrl: string,
  supabasePublishableKey: string,
  accessToken: string,
  userId: string,
  taskId: string,
) {
  const url = new URL("/rest/v1/agent_tasks", supabaseUrl);
  url.searchParams.set(
    "select",
    "id,repository,prompt,provider,model,reasoning,planning_mode,targeted_feature_paths,status,queue_sequence,created_at,started_at,completed_at,error,verification_attempts,cancel_requested,message,updated_at",
  );
  url.searchParams.set("id", `eq.${taskId}`);
  url.searchParams.set("user_id", `eq.${userId}`);
  url.searchParams.set("limit", "1");
  const response = await fetch(url, {
    headers: getAuthenticatedSupabaseHeaders(supabasePublishableKey, accessToken),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("agent task lookup failed");
  const rows = (await response.json()) as AgentTaskRow[];
  return rows[0] ?? null;
}

function isFinalizedAgentTaskStatus(status: AgentPromptQueueStatus) {
  return FINALIZED_AGENT_TASK_STATUSES.includes(status);
}

async function deleteAgentTaskRows(
  supabaseUrl: string,
  supabasePublishableKey: string,
  accessToken: string,
  userId: string,
) {
  const url = new URL("/rest/v1/agent_tasks", supabaseUrl);
  url.searchParams.set("user_id", `eq.${userId}`);
  url.searchParams.set("status", "in.(completed,failed,blocked,cancelled)");
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      ...getAuthenticatedSupabaseHeaders(supabasePublishableKey, accessToken),
      Prefer: "return=minimal",
    },
  });
  if (!response.ok) {
    throw new Error("agent task delete failed");
  }
}

async function deleteAgentTaskRow(
  supabaseUrl: string,
  supabasePublishableKey: string,
  accessToken: string,
  userId: string,
  taskId: string,
) {
  const url = new URL("/rest/v1/agent_tasks", supabaseUrl);
  url.searchParams.set("id", `eq.${taskId}`);
  url.searchParams.set("user_id", `eq.${userId}`);
  url.searchParams.set("status", "in.(completed,failed)");
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      ...getAuthenticatedSupabaseHeaders(supabasePublishableKey, accessToken),
      Prefer: "return=minimal",
    },
  });
  if (!response.ok) {
    throw new Error("agent task delete failed");
  }
}

async function requestAgentTaskCancel(
  supabaseUrl: string,
  supabasePublishableKey: string,
  accessToken: string,
  userId: string,
  taskId: string,
) {
  const url = new URL("/rest/v1/agent_tasks", supabaseUrl);
  url.searchParams.set("id", `eq.${taskId}`);
  url.searchParams.set("user_id", `eq.${userId}`);
  url.searchParams.set("cancel_requested", "eq.false");
  url.searchParams.set(
    "status",
    "in.(queued,running,verifying,ready,integrating,resolving)",
  );
  const response = await fetch(url, {
    method: "PATCH",
    headers: getAuthenticatedSupabaseHeaders(supabasePublishableKey, accessToken),
    body: JSON.stringify({ cancel_requested: true }),
  });
  if (!response.ok) {
    throw new Error("agent task cancel request failed");
  }
}

async function callRecoveryRpc(
  supabaseUrl: string, supabasePublishableKey: string, accessToken: string,
  rpc: string, body: Record<string, string>,
) {
  const response = await fetch(new URL(`/rest/v1/rpc/${rpc}`, supabaseUrl), {
    method: "POST", headers: getAuthenticatedSupabaseHeaders(supabasePublishableKey, accessToken),
    body: JSON.stringify(body), cache: "no-store",
  });
  if (!response.ok) throw new Error(`${rpc} failed`);
  return Boolean(await response.json());
}

function requestDurableTaskRetry(
  supabaseUrl: string, key: string, token: string, taskId: string, updatedAt: string,
) {
  return callRecoveryRpc(supabaseUrl, key, token, "request_agent_task_retry", {
    p_task_id: taskId, p_expected_updated_at: updatedAt,
  });
}

async function requestConversationDeletion(
  supabaseUrl: string, key: string, token: string, conversationId: string,
) {
  const response = await fetch(new URL("/rest/v1/rpc/request_conversation_deletion", supabaseUrl), {
    method: "POST", headers: getAuthenticatedSupabaseHeaders(key, token),
    body: JSON.stringify({ p_conversation_id: conversationId }), cache: "no-store",
  });
  if (!response.ok) throw new Error("conversation deletion request failed");
  return await response.json() as string;
}

function parseParameterUpdateRowMessage(message: string): { state?: string; error?: string } | null {
  const trimmedMessage = message.trim();

  if (!trimmedMessage) {
    return null;
  }

  try {
    const parsedMessage = JSON.parse(trimmedMessage) as { state?: unknown; error?: unknown };

    if (typeof parsedMessage !== "object" || parsedMessage === null) {
      return null;
    }

    return {
      state:
        typeof parsedMessage.state === "string"
          ? parsedMessage.state
          : undefined,
      error:
        typeof parsedMessage.error === "string"
          ? parsedMessage.error
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
