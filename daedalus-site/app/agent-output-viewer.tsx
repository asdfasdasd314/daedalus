"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FeatureFileProjects } from "@/lib/feature-file-cache";
import type { PlanningSession } from "@/lib/planning-questionnaire";
import { parsePlanningReply } from "@/lib/planning-questionnaire";
import {
  AGENT_OUTPUT_MODE_LABELS,
  AGENT_OUTPUT_SOURCE_LABELS,
  AGENT_OUTPUT_STATUS_LABELS,
  canDeleteAgentOutput,
  dedupeAgentOutputConversations,
  dedupeAgentOutputs,
  deleteAgentOutputHistory,
  findMatchingAgentOutputFeaturePaths,
  fetchAgentOutputHistoryPage,
  fetchAgentOutputFeatureSummaries,
  fetchAgentOutputConversation,
  groupAgentOutputsByFeature,
  mergeAgentOutputRecords,
  rerankAgentOutputSearch,
  searchAgentOutputArchive,
  type AgentOutputCursor,
  type AgentOutputExchange,
} from "@/lib/agent-output-history";
import AgentOutputDetail from "./agent-output-detail";
import { getProjectLabel } from "./feature-workspace-utils";

type AgentOutputViewerProps = {
  accessToken: string;
  activitySummary: string;
  isOpen: boolean;
  liveExchanges: AgentOutputExchange[];
  onAbandonDirectPrompt: (promptId: string) => void;
  onAnswerPlanningQuestion: (answer: string) => void;
  onCancelDurableTask: (promptId: string) => void;
  onClearFinalizedTasks: () => void;
  onClose: () => void;
  onDeletedExchange: (exchange: AgentOutputExchange) => void;
  onImplementPlan: () => void;
  onPlanningReply: (exchange: AgentOutputExchange) => void;
  onRetryDirectPrompt: (exchange: AgentOutputExchange) => void;
  onSelectedPromptIdChange: (promptId: string) => void;
  planningSession: PlanningSession | null;
  pollIntervalMs: number;
  projects: FeatureFileProjects;
  selectedPromptId: string;
  supabasePublishableKey: string;
  supabaseUrl: string;
};

export default function AgentOutputViewer({
  accessToken, activitySummary, isOpen, liveExchanges, onAbandonDirectPrompt,
  onAnswerPlanningQuestion, onCancelDurableTask, onClearFinalizedTasks,
  onClose, onDeletedExchange, onImplementPlan, onPlanningReply, onRetryDirectPrompt,
  onSelectedPromptIdChange, planningSession, projects,
  selectedPromptId, supabasePublishableKey, supabaseUrl,
}: AgentOutputViewerProps) {
  const [archive, setArchive] = useState<AgentOutputExchange[]>([]);
  const [cursor, setCursor] = useState<AgentOutputCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deletingPromptId, setDeletingPromptId] = useState("");
  const [deletedPromptIds, setDeletedPromptIds] = useState<string[]>([]);
  const [fetchError, setFetchError] = useState("");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<AgentOutputExchange[] | null>(null);
  const [featureSummaryCounts, setFeatureSummaryCounts] = useState<Record<string, number>>({});
  const [selectedGroupKey, setSelectedGroupKey] = useState("all");
  const [mobileDetail, setMobileDetail] = useState(false);
  const [otherAnswer, setOtherAnswer] = useState("");
  const publishedPlanningPromptRef = useRef("");
  const initialHistoryLoadTokenRef = useRef("");

  useEffect(() => {
    if (!isOpen || !accessToken || initialHistoryLoadTokenRef.current === accessToken) return;
    initialHistoryLoadTokenRef.current = accessToken;
    setLoading(true);
    setFetchError("");
    void fetchAgentOutputHistoryPage(supabaseUrl, supabasePublishableKey, accessToken)
      .then((page) => {
        setArchive(page.exchanges);
        setCursor(page.cursor);
        setHasMore(page.hasMore);
        if (!selectedPromptId && page.exchanges[0]) onSelectedPromptIdChange(page.exchanges[0].promptId);
      })
      .catch((error) => setFetchError(error instanceof Error ? error.message : "Unable to load history."))
      .finally(() => setLoading(false));
    void fetchAgentOutputFeatureSummaries(supabaseUrl, supabasePublishableKey, accessToken)
      .then((summaries) => setFeatureSummaryCounts(Object.fromEntries(
        summaries.map((summary) => [`${summary.repository}\u0000${summary.feature_path}`, Number(summary.result_count)]),
      )))
      .catch(() => undefined);
  }, [accessToken, isOpen, onSelectedPromptIdChange, selectedPromptId, supabasePublishableKey, supabaseUrl]);

  useEffect(() => {
    if (!isOpen || !search.trim()) return;
    const timer = window.setTimeout(() => {
      const featurePaths = findMatchingAgentOutputFeaturePaths(search, projects);
      void searchAgentOutputArchive(supabaseUrl, supabasePublishableKey, accessToken, search, featurePaths)
        .then((results) => setSearchResults(rerankAgentOutputSearch(search, results, projects)))
        .catch((error) => setFetchError(error instanceof Error ? error.message : "Search failed."));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [accessToken, isOpen, projects, search, supabasePublishableKey, supabaseUrl]);

  const deletedPromptIdSet = useMemo(() => new Set(deletedPromptIds), [deletedPromptIds]);
  const exchanges = useMemo(
    () => mergeAgentOutputRecords(archive, liveExchanges).filter((exchange) => !deletedPromptIdSet.has(exchange.promptId)),
    [archive, deletedPromptIdSet, liveExchanges],
  );
  const activeSearchResults = search.trim() ? searchResults?.filter((exchange) => !deletedPromptIdSet.has(exchange.promptId)) ?? null : null;
  const visibleSource = useMemo(
    () => dedupeAgentOutputConversations(activeSearchResults ?? exchanges),
    [activeSearchResults, exchanges],
  );
  const groups = useMemo(() => groupAgentOutputsByFeature(visibleSource, projects), [projects, visibleSource]);
  const visibleExchanges = selectedGroupKey === "all"
    ? visibleSource
    : selectedGroupKey === "unscoped"
      ? visibleSource.filter((exchange) => exchange.targetedFeaturePaths.length === 0)
      : groups.find((group) => group.key === selectedGroupKey)?.exchanges ?? [];
  const selected = exchanges.find((exchange) => exchange.promptId === selectedPromptId)
    ?? visibleExchanges[0] ?? null;
  const conversationTurns = useMemo(() => selected
    ? exchanges.filter((exchange) => exchange.conversationId === selected.conversationId)
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.id.localeCompare(right.id))
    : [], [exchanges, selected]);
  const parsedPlanning = selected?.mode === "planning" && selected.output
    ? parsePlanningReply(selected.output)
    : null;
  const planningQuestion = planningSession?.pendingQuestions[planningSession.questionIndex] ?? null;
  const canImplement = Boolean(selected?.mode === "planning" && parsedPlanning &&
    planningSession?.currentPlan === parsedPlanning.plan && !planningQuestion && selected.status === "completed");
  const canCancel = Boolean(selected?.taskId && !selected.cancelRequested &&
    ["queued", "running", "verifying", "ready", "integrating", "resolving"].includes(selected.status));
  const canRetry = Boolean(selected?.source === "direct_prompt" &&
    (selected.status === "failed" || selected.status === "cancelled" || selected.status === "blocked"));
  const canAbandon = Boolean(selected && liveExchanges.some((exchange) =>
    exchange.promptId === selected.promptId && exchange.source === "direct_prompt"
      && (exchange.status === "failed" || exchange.status === "blocked"),
  ));
  const projectDirectories = Object.keys(projects);

  useEffect(() => {
    if (!isOpen || !accessToken || !selected?.conversationId) return;
    let active = true;
    void fetchAgentOutputConversation(
      supabaseUrl, supabasePublishableKey, accessToken, selected.conversationId,
    ).then((turns) => {
      if (active) setArchive((current) => dedupeAgentOutputs([...current, ...turns]));
    }).catch((error) => {
      if (active) setFetchError(error instanceof Error ? error.message : "Unable to load this conversation.");
    });
    return () => { active = false; };
  }, [accessToken, isOpen, selected?.conversationId, supabasePublishableKey, supabaseUrl]);

  useEffect(() => {
    if (selected?.mode === "planning" && selected.status === "completed" && selected.output && publishedPlanningPromptRef.current !== selected.promptId) {
      publishedPlanningPromptRef.current = selected.promptId;
      onPlanningReply(selected);
    }
  }, [onPlanningReply, selected]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchAgentOutputHistoryPage(supabaseUrl, supabasePublishableKey, accessToken, cursor);
      setArchive((current) => dedupeAgentOutputs([...current, ...page.exchanges]));
      setCursor(page.cursor);
      setHasMore(page.hasMore);
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : "Unable to load more history.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function refreshHistory() {
    if (loading) return;
    setLoading(true);
    setFetchError("");
    try {
      const page = await fetchAgentOutputHistoryPage(
        supabaseUrl, supabasePublishableKey, accessToken,
      );
      setArchive((current) => dedupeAgentOutputs([...page.exchanges, ...current]));
      setCursor(page.cursor);
      setHasMore(page.hasMore);
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : "Unable to refresh history.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteExchange(exchange: AgentOutputExchange) {
    if (!canDeleteAgentOutput(exchange) || deletingPromptId) return;
    setDeletingPromptId(exchange.promptId);
    setFetchError("");
    try {
      if (!exchange.localOnly) {
        await deleteAgentOutputHistory(supabaseUrl, supabasePublishableKey, accessToken, exchange.promptId);
      }
      setDeletedPromptIds((current) => current.includes(exchange.promptId) ? current : [...current, exchange.promptId]);
      setArchive((current) => current.filter((item) => item.promptId !== exchange.promptId));
      setSearchResults((current) => current ? current.filter((item) => item.promptId !== exchange.promptId) : null);
      setFeatureSummaryCounts((current) => {
        const next = { ...current };
        for (const featurePath of exchange.targetedFeaturePaths) {
          const key = `${exchange.repository}\u0000${featurePath}`;
          if (key in next) next[key] = Math.max(0, (next[key] ?? 0) - 1);
        }
        return next;
      });
      if (selectedPromptId === exchange.promptId) {
        onSelectedPromptIdChange("");
        setMobileDetail(false);
      }
      onDeletedExchange(exchange);
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : "Unable to delete this exchange.");
    } finally {
      setDeletingPromptId("");
    }
  }

  if (!isOpen) return null;

  return (
    <aside className="fixed inset-3 z-40 flex min-w-0 overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/96 shadow-[0_30px_100px_rgba(2,6,23,0.7)] backdrop-blur md:inset-y-4 md:left-4 md:right-auto md:w-[min(72rem,calc(100vw-2rem))]">
      <div className={`${mobileDetail ? "hidden md:flex" : "flex"} w-full min-w-0 flex-col border-r border-white/10 md:w-80`}>
        <div className="border-b border-white/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-[11px] uppercase tracking-[0.28em] text-cyan-200">History</p><h2 className="mt-1 text-xl font-semibold text-white">Agent output</h2>{activitySummary ? <p className="mt-1 line-clamp-2 text-xs text-slate-400">{activitySummary}</p> : null}</div>
            <div className="flex gap-2">
              <button type="button" onClick={() => void refreshHistory()} disabled={loading} className="rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-50">Refresh</button>
              <button type="button" onClick={onClose} className="rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10">Close</button>
            </div>
          </div>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search complete archive..." className="mt-4 w-full rounded-full border border-white/10 bg-black/35 px-4 py-2.5 text-sm text-white outline-none placeholder:text-slate-500" />
        </div>
        <div className="agent-chat-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
          <div className="mb-3 grid gap-1">
            <GroupButton label="All activity" count={visibleSource.length} active={selectedGroupKey === "all"} onClick={() => setSelectedGroupKey("all")} />
            <GroupButton label="Unscoped" count={visibleSource.filter((item) => item.targetedFeaturePaths.length === 0).length} active={selectedGroupKey === "unscoped"} onClick={() => setSelectedGroupKey("unscoped")} />
            {groups.filter((group) => group.featurePath !== null).map((group) => (
              <GroupButton key={group.key} label={group.featureName} detail={`${getProjectLabel(group.repository, projectDirectories)}${group.unavailable ? " · Unavailable" : ""}`} count={activeSearchResults ? group.exchanges.length : featureSummaryCounts[group.key] ?? group.exchanges.length} active={selectedGroupKey === group.key} onClick={() => setSelectedGroupKey(group.key)} />
            ))}
          </div>
          <div className="grid gap-2 border-t border-white/10 pt-3">
            {loading ? <p className="p-3 text-sm text-slate-400">Loading history...</p> : null}
            {!loading && visibleExchanges.length === 0 ? <p className="p-3 text-sm text-slate-400">{search.trim() ? "No archived prompts match this search." : "No agent output has been archived yet."}</p> : null}
            {visibleExchanges.map((exchange) => {
              const canDelete = canDeleteAgentOutput(exchange);
              const isDeleting = deletingPromptId === exchange.promptId;
              return (
                <div
                  key={exchange.promptId}
                  className={`relative min-w-0 rounded-xl border transition ${selected?.promptId === exchange.promptId ? "border-cyan-300/40 bg-cyan-300/10" : "border-white/8 bg-white/[0.03] hover:bg-white/[0.06]"}`}
                >
                  {canDelete ? (
                    <button
                      type="button"
                      aria-label="Delete exchange"
                      title="Delete exchange"
                      disabled={isDeleting}
                      onClick={() => void deleteExchange(exchange)}
                      className="absolute right-2 top-2 z-10 rounded-lg border border-white/10 bg-black/45 p-1.5 text-slate-300 hover:border-rose-400/30 hover:bg-rose-500/20 hover:text-rose-100 disabled:opacity-50"
                    >
                      <TrashIcon />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => { onSelectedPromptIdChange(exchange.promptId); setMobileDetail(true); }}
                    className={`w-full min-w-0 p-3 text-left ${canDelete ? "pr-10" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2"><span className="rounded-full bg-white/8 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100">{AGENT_OUTPUT_STATUS_LABELS[exchange.status]}</span><time className={`text-[10px] text-slate-500 ${canDelete ? "mr-6" : ""}`}>{formatTime(exchange.completedAt ?? exchange.updatedAt)}</time></div>
                    <p className="mt-2 line-clamp-2 break-words text-sm text-slate-200">{exchange.prompt}</p>
                  </button>
                </div>
              );
            })}
            {hasMore && !activeSearchResults ? <div className="grid gap-2"><p className="text-center text-[11px] text-slate-500">Showing the newest archived exchanges.</p><button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-slate-200 disabled:opacity-50">{loadingMore ? "Loading..." : "Load more"}</button></div> : null}
          </div>
        </div>
      </div>

      <div className={`${mobileDetail ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-4">
          <button type="button" onClick={() => setMobileDetail(false)} className="rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 md:hidden">Back</button>
          <div className="min-w-0 flex-1"><p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Selected conversation</p><h2 className="mt-1 truncate text-lg font-semibold text-white">{conversationTurns[0]?.prompt || selected?.prompt || "Select a prompt"}</h2></div>
          <button type="button" onClick={onClose} className="hidden rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 md:block">Close</button>
        </div>
        <div className="agent-chat-scrollbar min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {fetchError ? <p className="mb-4 rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-100">{fetchError} Loaded results remain available.</p> : null}
          {selected ? (
            <div className="grid min-w-0 gap-4">
              <div className="flex flex-wrap gap-2 text-xs text-slate-300">
                <span className="rounded-full bg-cyan-300/12 px-3 py-1.5 text-cyan-100">{AGENT_OUTPUT_STATUS_LABELS[selected.status]}</span>
                <span className="rounded-full bg-white/7 px-3 py-1.5">{AGENT_OUTPUT_MODE_LABELS[selected.mode]}</span>
                <span className="rounded-full bg-white/7 px-3 py-1.5">{AGENT_OUTPUT_SOURCE_LABELS[selected.source]}</span>
                <span className="rounded-full bg-white/7 px-3 py-1.5">{selected.provider} · {selected.model || "default"} · {selected.reasoning || "default"}</span>
              </div>
              <dl className="grid gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs sm:grid-cols-2">
                <div><dt className="text-slate-500">Project</dt><dd className="mt-1 break-all text-slate-200">{getProjectLabel(selected.repository, projectDirectories)}</dd></div>
                <div><dt className="text-slate-500">Completed</dt><dd className="mt-1 text-slate-200">{selected.completedAt ? formatTime(selected.completedAt) : "In progress"}</dd></div>
                <div className="sm:col-span-2"><dt className="text-slate-500">Features</dt><dd className="mt-1 break-words text-slate-200">{selected.targetedFeaturePaths.join(", ") || "Unscoped"}</dd></div>
              </dl>
              <div className="relative grid min-w-0 gap-4 rounded-[1.5rem] border border-white/10 bg-white/[0.02] p-4 pt-12">
                {canDeleteAgentOutput(selected) ? (
                  <button
                    type="button"
                    aria-label="Delete exchange"
                    title="Delete exchange"
                    disabled={deletingPromptId === selected.promptId}
                    onClick={() => void deleteExchange(selected)}
                    className="absolute right-3 top-3 rounded-lg border border-white/10 bg-black/45 p-2 text-slate-300 hover:border-rose-400/30 hover:bg-rose-500/20 hover:text-rose-100 disabled:opacity-50"
                  >
                    <TrashIcon />
                  </button>
                ) : null}
                {conversationTurns.map((turn, index) => <div key={turn.promptId} className="grid min-w-0 gap-4 border-b border-white/10 pb-4 last:border-0 last:pb-0">
                  {index === 0 ? <AgentOutputDetail label="Initial prompt" value={turn.prompt} /> : null}
                  {turn.mode === "planning" && index > 0 ? <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200">Planning refinement</p> : null}
                  {turn.source === "durable_task" ? <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200">Plan implementation</p> : null}
                  {turn.output ? turn.mode === "planning" ? <PlanningResponse value={turn.output} /> : <AgentOutputDetail label="Implementation response" value={turn.output} markdown /> : <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-slate-400">{turn === selected ? "No output has been published yet." : "This stage ended before output was published."}</p>}
                  {turn.error ? <section className="rounded-xl border border-rose-400/25 bg-rose-500/10 p-4"><h3 className="text-[11px] uppercase tracking-[0.24em] text-rose-200">Terminal error</h3><pre className="mt-3 whitespace-pre-wrap break-words text-sm text-rose-100">{turn.error}</pre></section> : null}
                </div>)}
              </div>
              {selected.statusDetail && selected.statusDetail !== selected.error ? <p className="rounded-xl border border-white/10 p-3 text-sm text-slate-300">{selected.statusDetail}</p> : null}
              {selected.mode === "planning" && parsedPlanning ? <section className="grid gap-3 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.05] p-4"><h3 className="font-semibold text-white">Planning workflow</h3>{planningQuestion ? <><p className="text-sm text-slate-200">{planningQuestion.question}</p><div className="flex flex-wrap gap-2">{planningQuestion.options.map((option) => <button key={option} type="button" onClick={() => onAnswerPlanningQuestion(option)} className="rounded-full border border-cyan-300/25 px-3 py-2 text-xs text-cyan-100">{option}</button>)}</div><div className="flex gap-2"><input value={otherAnswer} onChange={(event) => setOtherAnswer(event.target.value)} placeholder="Other answer" className="min-w-0 flex-1 rounded-full border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /><button type="button" onClick={() => { onAnswerPlanningQuestion(otherAnswer); setOtherAnswer(""); }} disabled={!otherAnswer.trim()} className="rounded-full bg-cyan-300 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50">Answer</button></div></> : canImplement ? <button type="button" onClick={onImplementPlan} className="w-fit rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950">Implement Plan</button> : <p className="text-sm text-slate-400">The selected plan is ready for review.</p>}</section> : null}
              <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
                {canCancel ? <button type="button" onClick={() => onCancelDurableTask(selected.promptId)} className="rounded-full border border-rose-400/25 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-100">Cancel task</button> : null}
                {canRetry ? <button type="button" onClick={() => onRetryDirectPrompt(selected)} className="rounded-full border border-cyan-300/25 px-4 py-2 text-xs font-semibold text-cyan-100">Retry prompt</button> : null}
                {canAbandon ? <button type="button" onClick={() => onAbandonDirectPrompt(selected.promptId)} className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-slate-200">Abandon local prompt</button> : null}
                <button type="button" onClick={onClearFinalizedTasks} className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-slate-200" title="Deletes finalized task queue rows only; archived History remains.">Clear finalized task rows (keeps History)</button>
              </div>
            </div>
          ) : <p className="text-sm text-slate-400">Choose an exchange from the history list.</p>}
        </div>
      </div>
    </aside>
  );
}

function PlanningResponse({ value }: { value: string }) {
  const { plan, questions } = parsePlanningReply(value);
  return <>
    {questions.length > 0 ? <section className="rounded-[1.25rem] border border-cyan-300/20 bg-cyan-300/[0.05] p-4"><h3 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-100">Planning questions</h3><ol className="mt-3 grid gap-3 text-sm text-slate-200">{questions.map((question, index) => <li key={`${question.question}-${index}`}><p>{question.question}</p><ul className="mt-1 flex flex-wrap gap-2">{question.options.map((option) => <li key={option} className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-slate-300">{option}</li>)}</ul></li>)}</ol></section> : null}
    <AgentOutputDetail label="Agent plan" value={plan} markdown />
  </>;
}

function GroupButton({ label, detail, count, active, onClick }: { label: string; detail?: string; count: number; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-left ${active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/[0.05]"}`}><span className="min-w-0"><span className="block truncate text-sm font-semibold">{label}</span>{detail ? <span className="block truncate text-[10px] text-slate-500">{detail}</span> : null}</span><span className="rounded-full bg-black/30 px-2 py-1 text-[10px]">{count}</span></button>;
}

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.341 10.338A2.75 2.75 0 007.085 19h5.83a2.75 2.75 0 002.735-2.464l.341-10.338.149.022a.75.75 0 00.23-1.482A41.033 41.033 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.784 0 1.569.032 2.35.094v.277a41.723 41.723 0 00-4.7 0v-.277A40.135 40.135 0 0110 4zm-1.5 4.75a.75.75 0 00-1.5 0v7.5a.75.75 0 001.5 0v-7.5zm4.5 0a.75.75 0 00-1.5 0v7.5a.75.75 0 001.5 0v-7.5z" clipRule="evenodd" />
    </svg>
  );
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
