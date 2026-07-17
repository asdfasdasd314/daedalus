"use client";

import type { ArchitectureView } from "@/lib/architecture-view";
import { canvasBounds, layoutChannels, placeSystems, unknownEndpointChannels } from "@/lib/architecture-layout";

type ArchitectureVisualizationProps = {
  selectedPromptId: string;
  targetPromptId: string;
  view: ArchitectureView | null;
};

export default function ArchitectureVisualization({
  selectedPromptId, targetPromptId, view,
}: ArchitectureVisualizationProps) {
  if (!selectedPromptId) return <CanvasMessage title="No history exchange selected" detail="Choose a completed durable exchange from History." />;
  if (!targetPromptId) return <CanvasMessage title="Architecture ready" detail="Press View Architecture in History to send this exchange to the canvas." />;
  if (!view) return <CanvasMessage title="Architecture unavailable" detail="This exchange does not have immutable commit metadata for structured generation." />;

  const document = view.architecture_document;
  if ((view.status === "queued" || view.status === "running") && !document) {
    return <CanvasMessage title={view.status === "queued" ? "Generation queued" : "Generation running"} detail="The validated architecture will appear here when the daemon completes it." />;
  }
  if (view.status === "available" && !document) {
    return <CanvasMessage title="Generation requested" detail="Waiting for the Architecture View request to enter the daemon queue." />;
  }
  if (view.status === "failed" && !document) {
    const validationExhausted = view.error.includes("validation exhausted after");
    return <CanvasMessage title={validationExhausted ? "Validation failed after three attempts" : "Architecture generation failed"} detail={view.error || "No structured document was produced."} tone="error" />;
  }
  if (!document) return <CanvasMessage title="Architecture unavailable" detail="This terminal row has no structured architecture document. Regenerate it from History." />;

  const unknownChannels = unknownEndpointChannels(document);
  if (unknownChannels.length > 0) {
    return <CanvasMessage title="Invalid stored architecture" detail={`Unknown system endpoints were found in: ${unknownChannels.map((channel) => channel.name).join(", ")}.`} tone="error" />;
  }
  if (document.systems.length === 0) {
    return <CanvasMessage title="No systems in this architecture" detail={document.summary} />;
  }

  const placements = placeSystems(document);
  const placementById = new Map(placements.map((placement) => [placement.id, placement]));
  const channels = layoutChannels(document, placements);
  const bounds = canvasBounds(placements, channels);
  const regenerationWarning = view.status === "failed"
    ? view.error || "Regeneration failed; the last valid architecture remains visible."
    : view.status === "queued" || view.status === "running"
      ? "Regeneration is in progress; the last valid architecture remains visible."
      : "";

  return (
    <section className="absolute inset-0 flex min-h-0 flex-col bg-slate-950 text-slate-100">
      <header className="border-b border-white/10 px-6 pb-4 pt-20">
        <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-200">System architecture</p>
        <h1 className="mt-2 text-xl font-semibold text-white">Final-state systems and channels</h1>
        <p className="mt-2 max-w-4xl text-sm text-slate-400">{document.summary}</p>
        {regenerationWarning ? <p className="mt-3 rounded-xl border border-amber-300/25 bg-amber-300/10 px-4 py-2 text-sm text-amber-100">{regenerationWarning}</p> : null}
      </header>
      <div className="agent-chat-scrollbar min-h-0 flex-1 overflow-auto">
        <svg width={bounds.width} height={bounds.height} viewBox={bounds.viewBox} role="img" aria-label="Software architecture diagram" className="min-h-full min-w-full bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.06),transparent_60%)]">
          <defs>
            <marker id="architecture-arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,6 L9,3 z" fill="#67e8f9" />
            </marker>
          </defs>
          {channels.map(({ channel, path, label }) => (
            <g key={channel.id}>
              <title>{`${channel.name}: ${channel.summary}. ${channel.source_system_id} to ${channel.target_system_id}.`}</title>
              <path d={path} fill="none" stroke="#67e8f9" strokeWidth="2.5" markerEnd="url(#architecture-arrow)" opacity="0.82" />
              <text x={label.x} y={label.y} textAnchor="middle" fill="#cffafe" fontSize="13" fontWeight="600" paintOrder="stroke" stroke="#020617" strokeWidth="5">{truncate(channel.name, 30)}</text>
            </g>
          ))}
          {document.systems.map((system) => {
            const placement = placementById.get(system.id);
            if (!placement) return null;
            const nameLines = wrapName(system.name, 25, 2);
            return <g key={system.id}>
              <title>{`${system.name}: ${system.summary}`}</title>
              <rect x={placement.x} y={placement.y} width={placement.width} height={placement.height} rx="18" fill="#0f172a" stroke="#67e8f9" strokeWidth="2" />
              <text x={placement.x + placement.width / 2} y={placement.y + 48} textAnchor="middle" fill="white" fontSize="18" fontWeight="700">
                {nameLines.map((line, index) => <tspan key={line} x={placement.x + placement.width / 2} dy={index === 0 ? 0 : 23}>{line}</tspan>)}
              </text>
              <text x={placement.x + placement.width / 2} y={placement.y + placement.height - 22} textAnchor="middle" fill="#94a3b8" fontSize="11">{system.files.length} {system.files.length === 1 ? "file" : "files"}</text>
            </g>;
          })}
        </svg>
      </div>
    </section>
  );
}

function CanvasMessage({ title, detail, tone = "neutral" }: { title: string; detail: string; tone?: "neutral" | "error" }) {
  return <section className="absolute inset-0 grid place-items-center bg-slate-950 p-8 text-slate-100"><div className={`max-w-xl rounded-[1.75rem] border p-7 text-center ${tone === "error" ? "border-rose-400/25 bg-rose-500/10" : "border-white/10 bg-white/[0.03]"}`}><h1 className="text-xl font-semibold text-white">{title}</h1><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">{detail}</p></div></section>;
}

function truncate(value: string, limit: number) {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}

function wrapName(value: string, limit: number, lineLimit: number) {
  const words = value.trim().split(/\s+/);
  const lines: string[] = [];
  for (const word of words) {
    const current = lines.at(-1) ?? "";
    if (!current || `${current} ${word}`.length > limit) lines.push(word);
    else lines[lines.length - 1] = `${current} ${word}`;
  }
  const visible = lines.slice(0, lineLimit);
  if (lines.length > lineLimit) visible[lineLimit - 1] = truncate(visible[lineLimit - 1], limit - 1) + "…";
  return visible.map((line) => truncate(line, limit));
}
