"use client";

import { useEffect, useRef, useState } from "react";

export type DaemonManagerRequest = {
  id: string;
  status: "requested" | "draining" | "restarting" | "completed" | "failed" | "cancelled";
  blockers: {
    total?: number;
    agentTasks?: number;
    orchestrationBatches?: number;
    featureExecutions?: number;
    communications?: Record<string, number>;
  };
};

export type DaemonManagerStatus = {
  state: "running" | "draining" | "restarting" | "degraded";
  accepts_work: boolean;
  manager_heartbeat_at: string | null;
  execution_process_id: number | null;
  execution_generation: number;
  execution_started_at: string | null;
  last_successful_restart_at: string | null;
  status_detail: string | null;
  updated_at: string;
  activeRequest: DaemonManagerRequest | null;
};

type Props = {
  accessToken: string;
  pollIntervalMs: number;
  supabasePublishableKey: string;
  supabaseUrl: string;
  onStatusChange: (status: DaemonManagerStatus | null, online: boolean) => void;
};

const HEARTBEAT_STALE_AFTER_MS = 15000;

export default function DaemonManagerPanel({
  accessToken, pollIntervalMs, supabasePublishableKey, supabaseUrl, onStatusChange,
}: Props) {
  const [status, setStatus] = useState<DaemonManagerStatus | null>(null);
  const [online, setOnline] = useState(false);
  const [pendingAction, setPendingAction] = useState(false);
  const [error, setError] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const statusRef = useRef<DaemonManagerStatus | null>(null);

  useEffect(() => {
    let mounted = true;
    async function pollStatus() {
      try {
        const nextStatus = await callAuthenticatedRpc<DaemonManagerStatus | null>(
          supabaseUrl, supabasePublishableKey, accessToken,
          "get_daemon_manager_status", {},
        );
        if (!mounted) return;
        const currentStatus = nextStatus ?? statusRef.current;
        const heartbeatTime = currentStatus?.manager_heartbeat_at
          ? new Date(currentStatus.manager_heartbeat_at).valueOf()
          : 0;
        const nextOnline = Boolean(
          currentStatus && heartbeatTime && Date.now() - heartbeatTime <= HEARTBEAT_STALE_AFTER_MS,
        );
        if (nextStatus) {
          setStatus(nextStatus);
          statusRef.current = nextStatus;
          void acknowledgeManagerStatus(
            supabaseUrl, supabasePublishableKey, accessToken, nextStatus.updated_at,
          ).catch(() => undefined);
        }
        setOnline(nextOnline);
        onStatusChange(currentStatus, nextOnline);
        setError("");
      } catch {
        if (!mounted) return;
        setOnline(false);
        onStatusChange(statusRef.current, false);
      }
    }
    void pollStatus();
    const interval = window.setInterval(pollStatus, pollIntervalMs);
    return () => { mounted = false; window.clearInterval(interval); };
  }, [accessToken, onStatusChange, pollIntervalMs, supabasePublishableKey, supabaseUrl]);

  async function requestRestart() {
    const confirmed = window.confirm(
      "Restart the execution layer? New work will pause while previously accepted work finishes. Draining may take an indefinite amount of time, and you can cancel before replacement begins.",
    );
    if (!confirmed) return;
    setPendingAction(true);
    setError("");
    try {
      await callAuthenticatedRpc(
        supabaseUrl, supabasePublishableKey, accessToken,
        "request_execution_restart", {},
      );
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to request restart.");
    } finally {
      setPendingAction(false);
    }
  }

  async function cancelRestart() {
    if (!status?.activeRequest) return;
    setPendingAction(true);
    setError("");
    try {
      await callAuthenticatedRpc(
        supabaseUrl, supabasePublishableKey, accessToken,
        "cancel_execution_restart", { request_id: status.activeRequest.id },
      );
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to cancel restart.");
    } finally {
      setPendingAction(false);
    }
  }

  const request = status?.activeRequest;
  const blockers = request?.blockers;
  const canCancel = request?.status === "requested" || request?.status === "draining";
  const blockerRows = blockers ? [
    ["Agent tasks", blockers.agentTasks ?? 0],
    ["Orchestration batches", blockers.orchestrationBatches ?? 0],
    ["Feature executions", blockers.featureExecutions ?? 0],
    ...Object.entries(blockers.communications ?? {}).map(([purpose, count]) => [purpose, count] as [string, number]),
  ].filter(([, count]) => Number(count) > 0) : [];

  if (!isExpanded) {
    return (
      <button
        type="button"
        aria-expanded="false"
        aria-label={`Open execution manager (${online ? status?.state ?? "running" : "offline"})`}
        onClick={() => setIsExpanded(true)}
        className="pointer-events-auto fixed bottom-4 right-4 z-20 inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-slate-950/94 text-xl shadow-[0_20px_60px_rgba(2,6,23,0.55)] backdrop-blur transition hover:scale-105 hover:bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
      >
        <span aria-hidden="true">🤖</span>
        <span className={`absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-slate-950 ${online ? "bg-emerald-300" : "bg-rose-300"}`} />
      </button>
    );
  }

  return (
    <aside className="pointer-events-auto fixed bottom-4 right-4 z-20 w-[min(24rem,calc(100vw-2rem))] rounded-[1.35rem] border border-white/10 bg-slate-950/94 p-4 text-sm text-slate-200 shadow-[0_24px_80px_rgba(2,6,23,0.55)] backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Execution manager</p>
          <p className="mt-1 font-semibold text-white">{online ? status?.state ?? "running" : "offline"}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`h-2.5 w-2.5 rounded-full ${online ? "bg-emerald-300" : "bg-rose-300"}`} />
          <button
            type="button"
            aria-label="Minimize execution manager"
            onClick={() => setIsExpanded(false)}
            className="rounded-full border border-white/10 px-2.5 py-1 text-xs font-semibold text-slate-300 transition hover:bg-white/10"
          >
            −
          </button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
        <p>Admission <span className="text-slate-100">{status ? (status.accepts_work ? "open" : "paused") : "open (compatibility)"}</span></p>
        <p>Generation <span className="text-slate-100">{status?.execution_generation ?? 0}</span></p>
        <p>PID <span className="text-slate-100">{status?.execution_process_id ?? "—"}</span></p>
        <p>Heartbeat <span className="text-slate-100">{formatTime(status?.manager_heartbeat_at)}</span></p>
        <p>Started <span className="text-slate-100">{formatTime(status?.execution_started_at)}</span></p>
        <p>Last restart <span className="text-slate-100">{formatTime(status?.last_successful_restart_at)}</span></p>
      </div>
      {status?.status_detail ? <p className="mt-3 rounded-xl bg-white/5 px-3 py-2 text-xs text-slate-300">{status.status_detail}</p> : null}
      {request ? <p className="mt-3 text-xs text-cyan-100">Restart request: {request.status}{blockers ? ` · ${blockers.total ?? 0} blockers` : ""}</p> : null}
      {blockerRows.length ? <ul className="mt-2 grid gap-1 text-xs text-amber-100">{blockerRows.map(([label, count]) => <li key={label}>{label}: {count}</li>)}</ul> : null}
      {error ? <p className="mt-3 text-xs text-rose-200">{error}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => void requestRestart()} disabled={pendingAction || Boolean(request)} className="rounded-full bg-cyan-300 px-4 py-2 text-xs font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400">Restart execution layer</button>
        {canCancel ? <button type="button" onClick={() => void cancelRestart()} disabled={pendingAction} className="rounded-full border border-amber-300/30 px-4 py-2 text-xs font-semibold text-amber-100 disabled:opacity-50">Cancel restart</button> : null}
      </div>
    </aside>
  );
}

async function acknowledgeManagerStatus(
  supabaseUrl: string, supabasePublishableKey: string, accessToken: string,
  expectedUpdatedAt: string,
) {
  const url = new URL("/rest/v1/daemon_manager_state", supabaseUrl);
  url.searchParams.set("message", "eq.client_review");
  url.searchParams.set("updated_at", `eq.${expectedUpdatedAt}`);
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: supabasePublishableKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: "client_complete" }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Manager status acknowledgement failed.");
}

function formatTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}

async function callAuthenticatedRpc<T = unknown>(
  supabaseUrl: string, supabasePublishableKey: string, accessToken: string,
  functionName: string, body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(new URL(`/rest/v1/rpc/${functionName}`, supabaseUrl), {
    method: "POST",
    headers: {
      apikey: supabasePublishableKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await response.text() || `Manager request failed (${response.status}).`);
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}
