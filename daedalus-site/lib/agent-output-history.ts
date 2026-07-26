import Fuse from "fuse.js";
import type { FeatureFileProjects } from "./feature-file-cache";

export const AGENT_OUTPUT_PAGE_SIZE = 30;
const AGENT_OUTPUT_SUMMARY_COLUMNS = "id,prompt_id,task_id,conversation_id,repository,prompt,provider,model,reasoning,mode,source,targeted_feature_paths,status,status_detail,created_at,started_at,completed_at,updated_at";
const AGENT_OUTPUT_DETAIL_COLUMNS = `${AGENT_OUTPUT_SUMMARY_COLUMNS},output,error`;

export type AgentOutputStatus =
  | "queued" | "running" | "verifying" | "ready" | "integrating"
  | "resolving" | "completed" | "failed" | "blocked" | "cancelled";
export type AgentOutputMode = "standard" | "planning" | "ask";
export type AgentOutputSource = "durable_task" | "direct_prompt";

export type AgentOutputHistoryRow = {
  id: string;
  prompt_id: string;
  task_id: string | null;
  conversation_id: string | null;
  repository: string;
  prompt: string;
  prompt_snippet?: string;
  output: string;
  error: string;
  provider: string;
  model: string;
  reasoning: string;
  mode: AgentOutputMode;
  source: AgentOutputSource;
  targeted_feature_paths: unknown;
  status: AgentOutputStatus;
  status_detail: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

export type AgentOutputExchange = {
  id: string;
  promptId: string;
  taskId: string | null;
  conversationId: string;
  repository: string;
  prompt: string;
  output: string;
  error: string;
  provider: string;
  model: string;
  reasoning: string;
  mode: AgentOutputMode;
  source: AgentOutputSource;
  targetedFeaturePaths: string[];
  status: AgentOutputStatus;
  statusDetail: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  cancelRequested?: boolean;
  localOnly?: boolean;
};

export type AgentOutputCursor = { completedAt: string; id: string };
export type AgentOutputPage = {
  exchanges: AgentOutputExchange[];
  cursor: AgentOutputCursor | null;
  hasMore: boolean;
};

export type AgentOutputFeatureGroup = {
  key: string;
  repository: string;
  featurePath: string | null;
  featureName: string;
  unavailable: boolean;
  exchanges: AgentOutputExchange[];
  latestActivity: string;
};

export const AGENT_OUTPUT_STATUS_LABELS: Record<AgentOutputStatus, string> = {
  queued: "Queued", running: "Running", verifying: "Verifying",
  ready: "Ready", integrating: "Integrating", resolving: "Resolving",
  completed: "Completed", failed: "Failed", blocked: "Blocked",
  cancelled: "Cancelled",
};
export const AGENT_OUTPUT_MODE_LABELS: Record<AgentOutputMode, string> = {
  standard: "Standard", planning: "Planning", ask: "Ask",
};
export const AGENT_OUTPUT_SOURCE_LABELS: Record<AgentOutputSource, string> = {
  durable_task: "Durable task", direct_prompt: "Direct prompt",
};

export function normalizeAgentOutputRow(row: AgentOutputHistoryRow): AgentOutputExchange {
  return {
    id: row.id,
    promptId: row.prompt_id,
    taskId: row.task_id,
    conversationId: row.conversation_id || row.prompt_id,
    repository: row.repository,
    prompt: row.prompt ?? row.prompt_snippet ?? "",
    output: row.output ?? "",
    error: row.error ?? "",
    provider: row.provider ?? "",
    model: row.model ?? "",
    reasoning: row.reasoning ?? "",
    mode: row.mode,
    source: row.source,
    targetedFeaturePaths: Array.isArray(row.targeted_feature_paths)
      ? row.targeted_feature_paths.filter((path): path is string => typeof path === "string")
      : [],
    status: row.status,
    statusDetail: row.status_detail ?? "",
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

function activityTime(exchange: AgentOutputExchange) {
  return Date.parse(exchange.completedAt ?? exchange.updatedAt ?? exchange.createdAt) || 0;
}

export function sortAgentOutputsRecentFirst(exchanges: AgentOutputExchange[]) {
  return [...exchanges].sort((left, right) =>
    activityTime(right) - activityTime(left) || right.id.localeCompare(left.id),
  );
}

export function dedupeAgentOutputs(exchanges: AgentOutputExchange[]) {
  const byPromptId = new Map<string, AgentOutputExchange>();
  for (const exchange of sortAgentOutputsRecentFirst(exchanges)) {
    const existing = byPromptId.get(exchange.promptId);
    byPromptId.set(
      exchange.promptId,
      existing ? mergeAgentOutputContent(exchange, existing) : exchange,
    );
  }
  return [...byPromptId.values()];
}

function mergeAgentOutputContent(
  candidate: AgentOutputExchange,
  existing: AgentOutputExchange,
) {
  const candidateTime = Date.parse(candidate.updatedAt) || 0;
  const existingTime = Date.parse(existing.updatedAt) || 0;
  const latest = candidateTime >= existingTime ? candidate : existing;
  const other = latest === candidate ? existing : candidate;
  const latestHasBody = Boolean(latest.output || latest.error);
  const otherHasBody = Boolean(other.output || other.error);
  const latestIsSummaryOnly = !latestHasBody && (
    otherHasBody
    || latest.prompt.endsWith("…") && !other.prompt.endsWith("…")
  );
  const content = latestIsSummaryOnly ? other : latest;

  return {
    ...latest,
    // Archive pages are deliberately summary-only. Keep a selected conversation's
    // already-hydrated detail visible while a newer summary updates its lifecycle.
    prompt: content.prompt,
    output: content.output,
    error: content.error,
  };
}

export function dedupeAgentOutputConversations(exchanges: AgentOutputExchange[]) {
  const byConversationId = new Map<string, AgentOutputExchange>();
  for (const exchange of sortAgentOutputsRecentFirst(exchanges)) {
    if (!byConversationId.has(exchange.conversationId)) {
      byConversationId.set(exchange.conversationId, exchange);
    }
  }
  return [...byConversationId.values()];
}

const TERMINAL_AGENT_OUTPUT_STATUSES = new Set<AgentOutputStatus>([
  "completed", "failed", "blocked", "cancelled",
]);

function preferLiveDurableStatus(
  history: AgentOutputExchange,
  live: AgentOutputExchange,
) {
  const historyTime = Date.parse(history.updatedAt) || 0;
  const liveTime = Date.parse(live.updatedAt) || 0;
  const historyTerminal = TERMINAL_AGENT_OUTPUT_STATUSES.has(history.status);
  const liveTerminal = TERMINAL_AGENT_OUTPUT_STATUSES.has(live.status);
  if (historyTerminal && !liveTerminal && liveTime <= historyTime) return false;
  return liveTime >= historyTime;
}

export function mergeAgentOutputRecords(
  archived: AgentOutputExchange[],
  authoritative: AgentOutputExchange[],
) {
  const merged = new Map(archived.map((exchange) => [exchange.promptId, exchange]));
  for (const live of authoritative) {
    const history = merged.get(live.promptId);
    if (!history) {
      merged.set(live.promptId, live);
      continue;
    }
    if (live.source === "direct_prompt") {
      merged.set(live.promptId, {
        ...history,
        ...live,
        status: history.status,
        statusDetail: history.statusDetail || live.statusDetail,
        output: history.output || live.output,
        error: history.error || live.error,
        id: history.id,
        taskId: live.taskId ?? history.taskId,
        completedAt: history.completedAt ?? live.completedAt,
        cancelRequested: Boolean(live.cancelRequested || history.cancelRequested),
        localOnly: false,
      });
      continue;
    }
    const useLiveStatus = preferLiveDurableStatus(history, live);
    const historyTime = Date.parse(history.updatedAt) || 0;
    const liveTime = Date.parse(live.updatedAt) || 0;
    merged.set(live.promptId, {
      ...history,
      ...live,
      status: useLiveStatus ? live.status : history.status,
      statusDetail: useLiveStatus
        ? (live.statusDetail || history.statusDetail)
        : (history.statusDetail || live.statusDetail),
      output: history.output || live.output,
      error: history.error || live.error,
      id: history.id,
      taskId: live.taskId ?? history.taskId,
      completedAt: useLiveStatus ? live.completedAt : history.completedAt,
      updatedAt: liveTime >= historyTime ? live.updatedAt : history.updatedAt,
      cancelRequested: Boolean(live.cancelRequested || history.cancelRequested),
      localOnly: false,
    });
  }
  return sortAgentOutputsRecentFirst([...merged.values()]);
}

export function reconcileRecentAgentOutputHistory(
  current: AgentOutputExchange[],
  recent: AgentOutputExchange[],
  deletedPromptIds: Iterable<string> = [],
) {
  const deleted = new Set(deletedPromptIds);
  const recentPromptIds = new Set(recent.map((exchange) => exchange.promptId));
  const durableOlderArchive = current.filter(
    (exchange) => exchange.completedAt && !recentPromptIds.has(exchange.promptId) && !deleted.has(exchange.promptId),
  );
  return dedupeAgentOutputs([...recent, ...durableOlderArchive])
    .filter((exchange) => !deleted.has(exchange.promptId));
}

export function removeDeletedAgentOutputHistory(
  exchanges: AgentOutputExchange[],
  deletedPromptIds: Iterable<string>,
) {
  const deleted = new Set(deletedPromptIds);
  return exchanges.filter((exchange) => !deleted.has(exchange.promptId));
}

function featureLookup(projects: FeatureFileProjects) {
  const names = new Map<string, string>();
  for (const [repository, features] of Object.entries(projects)) {
    for (const feature of features) {
      const path = feature.path.replace(/\\/g, "/").replace(/^\.\//, "");
      const heading = feature.markdown.split("\n").find((line) => line.startsWith("# "));
      names.set(`${repository}\u0000${path}`, heading?.slice(2).trim() || path);
    }
  }
  return names;
}

export function groupAgentOutputsByFeature(
  exchanges: AgentOutputExchange[],
  projects: FeatureFileProjects,
) {
  const names = featureLookup(projects);
  const groups = new Map<string, AgentOutputFeatureGroup>();
  for (const exchange of exchanges) {
    const paths = exchange.targetedFeaturePaths.length > 0
      ? exchange.targetedFeaturePaths
      : [null];
    for (const featurePath of paths) {
      const key = `${exchange.repository}\u0000${featurePath ?? ""}`;
      const lookupKey = `${exchange.repository}\u0000${featurePath ?? ""}`;
      const featureName = featurePath === null
        ? "Unscoped"
        : names.get(lookupKey) ?? featurePath;
      const current = groups.get(key) ?? {
        key,
        repository: exchange.repository,
        featurePath,
        featureName,
        unavailable: featurePath !== null && !names.has(lookupKey),
        exchanges: [],
        latestActivity: exchange.completedAt ?? exchange.updatedAt,
      };
      current.exchanges.push(exchange);
      if (activityTime(exchange) > Date.parse(current.latestActivity)) {
        current.latestActivity = exchange.completedAt ?? exchange.updatedAt;
      }
      groups.set(key, current);
    }
  }
  return [...groups.values()]
    .map((group) => ({ ...group, exchanges: sortAgentOutputsRecentFirst(group.exchanges) }))
    .sort((left, right) => Date.parse(right.latestActivity) - Date.parse(left.latestActivity));
}

export function rerankAgentOutputSearch(
  query: string,
  exchanges: AgentOutputExchange[],
  projects: FeatureFileProjects,
) {
  if (!query.trim()) return sortAgentOutputsRecentFirst(exchanges);
  const names = featureLookup(projects);
  const documents = exchanges.map((exchange) => ({
    exchange,
    featureNames: exchange.targetedFeaturePaths.map((path) =>
      names.get(`${exchange.repository}\u0000${path}`) ?? path,
    ).join(" "),
  }));
  return new Fuse(documents, {
    threshold: 0.5,
    ignoreLocation: true,
    keys: ["exchange.prompt", "exchange.output", "exchange.repository",
      "exchange.provider", "exchange.model", "exchange.mode", "exchange.status",
      "exchange.targetedFeaturePaths", "featureNames"],
  }).search(query).map((result) => result.item.exchange);
}

export function findMatchingAgentOutputFeaturePaths(
  query: string,
  projects: FeatureFileProjects,
) {
  const records = Object.entries(projects).flatMap(([repository, features]) =>
    features.map((feature) => {
      const path = feature.path.replace(/\\/g, "/").replace(/^\.\//, "");
      const heading = feature.markdown.split("\n").find((line) => line.startsWith("# "));
      return { repository, path, name: heading?.slice(2).trim() || path };
    }),
  );
  if (!query.trim()) return [];
  return new Fuse(records, { threshold: 0.45, keys: ["name", "path", "repository"] })
    .search(query)
    .slice(0, 10)
    .map((result) => result.item.path);
}

function historyHeaders(publishableKey: string, accessToken: string) {
  return { apikey: publishableKey, Authorization: `Bearer ${accessToken}` };
}

async function readRows(response: Response) {
  if (!response.ok) throw new Error((await response.text()) || `History request failed (${response.status}).`);
  return response.json() as Promise<AgentOutputHistoryRow[]>;
}

export async function fetchAgentOutputHistoryPage(
  supabaseUrl: string,
  publishableKey: string,
  accessToken: string,
  cursor: AgentOutputCursor | null = null,
): Promise<AgentOutputPage> {
  const url = new URL("/rest/v1/rpc/get_agent_output_history_page", supabaseUrl);
  const rows = await readRows(await fetch(url, {
    method: "POST",
    headers: { ...historyHeaders(publishableKey, accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({
      p_cursor_completed_at: cursor?.completedAt ?? null,
      p_cursor_id: cursor?.id ?? null,
      p_limit: AGENT_OUTPUT_PAGE_SIZE + 1,
    }),
    cache: "no-store",
  }));
  const pageRows = rows.slice(0, AGENT_OUTPUT_PAGE_SIZE);
  const last = pageRows.at(-1);
  return {
    exchanges: pageRows.map(normalizeAgentOutputRow),
    hasMore: rows.length > AGENT_OUTPUT_PAGE_SIZE,
    cursor: last?.completed_at ? { completedAt: last.completed_at, id: last.id } : null,
  };
}

export async function fetchRecentAgentOutputHistory(
  supabaseUrl: string, publishableKey: string, accessToken: string,
) {
  return (await fetchAgentOutputHistoryPage(supabaseUrl, publishableKey, accessToken)).exchanges;
}

export async function fetchAgentOutputConversation(
  supabaseUrl: string,
  publishableKey: string,
  accessToken: string,
  conversationId: string,
  cursor: { createdAt: string; id: string } | null = null,
) {
  const url = new URL("/rest/v1/agent_output_history", supabaseUrl);
  // This is user-triggered by selecting a conversation. Unlike archive pages and
  // searches, it intentionally retrieves the full prompt and response bodies.
  url.searchParams.set("select", AGENT_OUTPUT_DETAIL_COLUMNS);
  url.searchParams.set("conversation_id", `eq.${conversationId}`);
  url.searchParams.set("order", "created_at.desc,id.desc");
  url.searchParams.set("limit", String(AGENT_OUTPUT_PAGE_SIZE));
  if (cursor) {
    url.searchParams.set("or", `(created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id}))`);
  }
  const rows = await readRows(await fetch(url, {
    headers: historyHeaders(publishableKey, accessToken), cache: "no-store",
  }));
  return rows.reverse().map(normalizeAgentOutputRow);
}

export async function fetchAgentOutputByPromptId(
  supabaseUrl: string, publishableKey: string, accessToken: string, promptId: string,
) {
  const url = new URL("/rest/v1/agent_output_history", supabaseUrl);
  url.searchParams.set("select", AGENT_OUTPUT_DETAIL_COLUMNS);
  url.searchParams.set("prompt_id", `eq.${promptId}`);
  url.searchParams.set("limit", "1");
  const rows = await readRows(await fetch(url, { headers: historyHeaders(publishableKey, accessToken), cache: "no-store" }));
  return rows[0] ? normalizeAgentOutputRow(rows[0]) : null;
}

export async function searchAgentOutputArchive(
  supabaseUrl: string, publishableKey: string, accessToken: string, query: string,
  featurePaths: string[] = [],
) {
  const queries = [...new Set([query, ...featurePaths])];
  const pages = await Promise.all(queries.map(async (searchQuery) => {
    const response = await fetch(new URL("/rest/v1/rpc/search_agent_output_history", supabaseUrl), {
      method: "POST",
      headers: { ...historyHeaders(publishableKey, accessToken), "Content-Type": "application/json" },
      body: JSON.stringify({ p_query: searchQuery, p_limit: 50 }),
    });
    return (await readRows(response)).map(normalizeAgentOutputRow);
  }));
  return dedupeAgentOutputs(pages.flat());
}

export async function fetchAgentOutputFeatureSummaries(
  supabaseUrl: string, publishableKey: string, accessToken: string,
) {
  const response = await fetch(new URL("/rest/v1/rpc/summarize_agent_output_history_features", supabaseUrl), {
    method: "POST",
    headers: { ...historyHeaders(publishableKey, accessToken), "Content-Type": "application/json" },
    body: "{}",
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<Array<{repository: string; feature_path: string; result_count: number; latest_activity: string}>>;
}

export function canDeleteAgentOutput(exchange: Pick<AgentOutputExchange, "status">) {
  return TERMINAL_AGENT_OUTPUT_STATUSES.has(exchange.status);
}

export function selectAgentOutputExchange(
  exchanges: AgentOutputExchange[],
  visibleExchanges: AgentOutputExchange[],
  selectedPromptId: string,
  preserveEmptySelection = false,
) {
  return exchanges.find((exchange) => exchange.promptId === selectedPromptId)
    ?? (preserveEmptySelection ? null : visibleExchanges[0] ?? null);
}

export async function deleteAgentOutputHistory(
  supabaseUrl: string,
  publishableKey: string,
  accessToken: string,
  promptId: string,
) {
  const response = await fetch(new URL("/rest/v1/rpc/delete_terminal_direct_prompt_agent_output_history", supabaseUrl), {
    method: "POST",
    headers: {
      ...historyHeaders(publishableKey, accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_prompt_id: promptId }),
  });
  if (!response.ok) {
    throw new Error((await response.text()) || `History delete failed (${response.status}).`);
  }
  const deletedPromptId = await response.json() as unknown;
  if (deletedPromptId !== promptId) {
    throw new Error("This direct-prompt history entry was not deleted. Refresh and try again.");
  }
}
