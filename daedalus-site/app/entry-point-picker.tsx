"use client";

import { useEffect, useMemo, useState } from "react";
import type { ParameterFileRecord } from "@/lib/parameter-file-cache";
import { getRelevantFileEntryPointSuggestions, normalizeEntryPointPath } from "./feature-workspace-utils";

type Props = {
  featureMarkdown: string;
  parameterFile: ParameterFileRecord;
  pending: boolean;
  daemonError: string;
  onSave: (operation: "add" | "update" | "delete", entryPoint?: string) => Promise<void>;
};

export default function EntryPointPicker({ featureMarkdown, parameterFile, pending, daemonError, onSave }: Props) {
  const metadata = useMemo(
    () => getRelevantFileEntryPointSuggestions(featureMarkdown, parameterFile.toml),
    [featureMarkdown, parameterFile.toml],
  );
  const [draft, setDraft] = useState(metadata.savedEntryPoint);
  const [localError, setLocalError] = useState("");
  useEffect(() => { setDraft(metadata.savedEntryPoint); setLocalError(""); }, [metadata.savedEntryPoint]);
  const saved = metadata.savedEntryPoint;
  const normalized = normalizeEntryPointPath(draft);
  const operation = saved ? (draft.trim() ? "update" : "delete") : "add";
  async function submit() {
    if (operation !== "delete" && !normalized) { setLocalError("Use a nonblank project-relative file path."); return; }
    setLocalError("");
    await onSave(operation, normalized ?? undefined);
  }
  return <section className="grid gap-3 rounded-[1.25rem] border border-white/10 bg-slate-900/70 px-4 py-4">
    <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Entry point</p><p className="mt-1 text-sm text-slate-300">The daemon runs this file as <code>python path/to/file.py</code>.</p></div>
    <label className="grid gap-2"><span className="text-xs text-slate-400">Project-relative path</span><input value={draft} disabled={pending} onChange={(event) => setDraft(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 disabled:opacity-50" placeholder="src/example.py" /></label>
    {metadata.suggestions.length ? <div className="flex flex-wrap gap-2">{metadata.suggestions.map((path) => <button key={path} type="button" disabled={pending} onClick={() => setDraft(path)} className="rounded-full border border-cyan-300/25 px-3 py-1 text-xs text-cyan-100 disabled:opacity-50">{path}</button>)}</div> : <p className="text-xs text-slate-500">No backticked file paths were found in this feature’s Relevant Files section.</p>}
    {localError || daemonError ? <p className="text-sm text-rose-300">{localError || daemonError}</p> : null}
    <div className="flex justify-end"><button type="button" disabled={pending} onClick={() => void submit()} className="rounded-full bg-cyan-300 px-4 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50">{pending ? "Saving..." : operation === "add" ? "Add entry point" : operation === "update" ? "Update entry point" : "Remove entry point"}</button></div>
  </section>;
}
