"use client";

import { useEffect, useRef, useState } from "react";
import FeatureFileGraph from "./feature-file-graph";
import type { FeatureFileProjects } from "@/lib/feature-file-cache";

type DashboardProps = {
  pollIntervalMs: number;
  supabaseAnonKey: string;
  supabaseUrl: string;
};

const CLIENT_LOAD_FEATURE_FILES = "client_load_feature_files";
const DAEMON_RECEIVED_MESSAGE = "daemon_received_message";
const DAEMON_SENT_FEATURE_FILES = "daemon_sent_feature_files";

export default function FeatureFilesDashboard({
  pollIntervalMs,
  supabaseAnonKey,
  supabaseUrl,
}: DashboardProps) {
  const [message, setMessage] = useState("");
  const [projects, setProjects] = useState<FeatureFileProjects | null>(null);
  const [error, setError] = useState("");
  const latestLocalWriteStartedAt = useRef(0);

  useEffect(() => {
    let isMounted = true;

    async function pollMessage() {
      const pollStartedAt = Date.now();

      try {
        const nextMessage = await fetchCurrentMessage(
          supabaseUrl,
          supabaseAnonKey,
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
      const response = await fetch("/api/feature-files", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("feature-file payload request failed");
      }

      const body = await response.json();
      setProjects(body.projects);
    }

    loadProjects().catch(() => {
      setError("The daemon finished, but the feature-file payload was not available.");
    });
  }, [message]);

  async function requestFeatureFiles() {
    setError("");
    const writeStartedAt = Date.now();
    latestLocalWriteStartedAt.current = writeStartedAt;
    console.log("[feature-files] button clicked");

    try {
      const nextMessage = await updateMessage(
        supabaseUrl,
        supabaseAnonKey,
        CLIENT_LOAD_FEATURE_FILES,
      );
      console.log("[feature-files] write completed with message:", nextMessage);
      setMessage(nextMessage);
      setProjects(null);
    } catch {
      console.error("[feature-files] write failed");
      setError("Unable to write the load request to Supabase.");
    }
  }

  const statusLabel = getStatusLabel(message);
  const projectEntries = Object.entries(projects ?? {});

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black text-slate-100">
      <FeatureFileGraph projects={projects ?? {}} />

      <div className="pointer-events-none absolute inset-0">
        <div className="pointer-events-auto absolute left-4 top-4">
          <div className="flex flex-wrap gap-3 rounded-[1.75rem] border border-white/10 bg-slate-950/82 p-4 shadow-[0_24px_80px_rgba(2,6,23,0.65)] backdrop-blur">
            <button
              type="button"
              onClick={requestFeatureFiles}
              className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
            >
              Load feature files
            </button>
            <div className="rounded-full border border-white/12 bg-white/6 px-4 py-3 text-sm text-slate-300">
              Polling every {pollIntervalMs} ms
            </div>
          </div>
        </div>

        <div className="pointer-events-auto absolute bottom-4 left-4 grid max-w-sm gap-3">
          <div className="min-w-[220px] rounded-[1.5rem] border border-white/10 bg-slate-950/82 p-4 shadow-[0_24px_80px_rgba(2,6,23,0.55)] backdrop-blur">
            <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
              Current message
            </p>
            <p className="mt-2 break-words font-mono text-sm text-slate-100">
              {message || "(empty)"}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
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
) {
  console.log("[feature-files] reading current message from Supabase");
  const response = await fetch(
    `${supabaseUrl}/rest/v1/communications?select=message&limit=1`,
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
  message: string,
) {
  console.log("[feature-files] attempting to write message:", message);
  const existingRows = await fetchCommunicationRows(
    supabaseUrl,
    supabaseAnonKey,
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
      body: JSON.stringify({ message }),
    });

    if (!insertResponse.ok) {
      throw new Error("supabase message insert failed");
    }

    console.log("[feature-files] inserted message row:", message);
    return message;
  }

  console.log("[feature-files] patching existing communications row");
  const response = await fetch(`${supabaseUrl}/rest/v1/communications?message=not.is.null`, {
    method: "PATCH",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message }),
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
) {
  console.log("[feature-files] checking for existing communications rows");
  const response = await fetch(
    `${supabaseUrl}/rest/v1/communications?select=message&limit=1`,
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
