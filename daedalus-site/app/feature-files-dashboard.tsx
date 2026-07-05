"use client";

import { useEffect, useRef, useState } from "react";
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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(71,85,105,0.18),_transparent_30%),linear-gradient(180deg,_#f6f3ee_0%,_#ece6dc_100%)] px-4 py-6 text-slate-900 sm:px-8">
      <div className="mx-auto grid max-w-6xl gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-black/10 bg-white/80 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="grid gap-8 lg:grid-cols-[1.4fr_0.9fr]">
            <div className="grid gap-4">
              <span className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-700">
                Daedalus Communications
              </span>
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-6xl">
                Feature file loading through a shared Supabase message bus.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                The browser writes a request, the daemon reacts locally, and the
                latest feature-file payload is delivered back into this Next.js app.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={requestFeatureFiles}
                  className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Load feature files
                </button>
                <div className="rounded-full border border-slate-300 bg-white px-4 py-3 text-sm text-slate-600">
                  Polling every {pollIntervalMs} ms
                </div>
              </div>
            </div>

            <div className="grid gap-4 rounded-[1.5rem] border border-slate-200 bg-slate-950 p-6 text-slate-50">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                  Current message
                </p>
                <p className="mt-3 break-words font-mono text-lg">
                  {message || "(empty)"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                  Status
                </p>
                <p className="mt-3 text-2xl font-semibold">{statusLabel}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                  Projects loaded
                </p>
                <p className="mt-3 text-2xl font-semibold">{projectEntries.length}</p>
              </div>
            </div>
          </div>
        </section>

        {error ? (
          <section className="rounded-[1.5rem] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
            {error}
          </section>
        ) : null}

        <section className="rounded-[2rem] border border-black/10 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur">
          <div className="flex flex-col gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
                Payload view
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                Registered project feature files
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-slate-600">
              Once the daemon reports completion, the frontend reads the cached
              feature-file payload from the local Next.js API.
            </p>
          </div>

          {projectEntries.length === 0 ? (
            <div className="grid place-items-center px-4 py-16 text-center">
              <div className="max-w-lg">
                <p className="text-lg font-medium text-slate-900">
                  No feature-file payload has been loaded yet.
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Send the load request to write `client_load_feature_files`,
                  wait for the daemon to react, and the project payload will show up here.
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-6 grid gap-4">
              {projectEntries.map(([projectPath, fileContents]) => (
                <article
                  key={projectPath}
                  className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-5"
                >
                  <div className="flex flex-col gap-2 border-b border-slate-200 pb-4">
                    <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                      Project path
                    </span>
                    <h3 className="break-all text-lg font-semibold text-slate-950">
                      {projectPath}
                    </h3>
                  </div>
                  <div className="mt-4 grid gap-3">
                    {fileContents.map((fileContent, index) => (
                      <pre
                        key={`${projectPath}-${index}`}
                        className="overflow-x-auto rounded-2xl bg-slate-950 p-4 text-sm leading-6 text-slate-100"
                      >
                        {fileContent}
                      </pre>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
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
