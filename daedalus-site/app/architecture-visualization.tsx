"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { ArchitectureProgressStage, ArchitectureView, SoftwareArchitecture } from "@/lib/architecture-view";
import { canvasBounds, layoutChannels, placeSystems, unknownEndpointChannels } from "@/lib/architecture-layout";

const MIN_ARCHITECTURE_ZOOM = 0.3;
const MAX_ARCHITECTURE_ZOOM = 2.5;
const VIEWPORT_PADDING = 72;

type ViewportSize = { width: number; height: number };
type ArchitectureViewport = {
  offsetX: number;
  offsetY: number;
  zoom: number;
  isDragging: boolean;
  lastPointerX: number;
  lastPointerY: number;
};
type ViewPoint = { x: number; y: number };
type PinchSession = {
  anchorViewport: ArchitectureViewport;
  distance: number;
  midpoint: ViewPoint;
};

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
    return <CanvasMessage title={view.status === "queued" ? "Generation queued" : "Generation running"} detail="The validated architecture will appear here when the daemon completes it." progressView={view} />;
  }
  if (view.status === "available" && !document) {
    return <CanvasMessage title="Generation requested" detail="Waiting for the Architecture View request to enter the daemon queue." />;
  }
  if (view.status === "failed" && !document) {
    const validationExhausted = view.error.includes("validation exhausted after");
    return <CanvasMessage title={validationExhausted ? "Document validation failed after three attempts" : "Architecture generation failed"} detail={architectureFailureDetail(view)} tone="error" progressView={view} />;
  }
  if (!document) return <CanvasMessage title="Architecture unavailable" detail="This terminal row has no structured architecture document. Regenerate it from History." />;

  const unknownChannels = unknownEndpointChannels(document);
  if (unknownChannels.length > 0) {
    return <CanvasMessage title="Invalid stored architecture" detail={`Unknown system endpoints were found in: ${unknownChannels.map((channel) => channel.name).join(", ")}.`} tone="error" />;
  }
  if (document.systems.length === 0) {
    return <CanvasMessage title="No systems in this architecture" detail={document.summary} />;
  }

  const regenerationWarning = view.status === "failed"
    ? architectureFailureDetail(view)
    : view.status === "queued" || view.status === "running"
      ? "Regeneration is in progress; the last valid architecture remains visible."
      : "";

  return <ArchitectureCanvas
    key={`${view.id}:${view.generation}`}
    document={document}
    regenerationWarning={regenerationWarning}
    view={view}
  />;
}

function ArchitectureCanvas({ document, regenerationWarning, view }: {
  document: SoftwareArchitecture;
  regenerationWarning: string;
  view: ArchitectureView;
}) {
  const placements = useMemo(() => placeSystems(document), [document]);
  const placementById = useMemo(
    () => new Map(placements.map((placement) => [placement.id, placement])),
    [placements],
  );
  const systemById = useMemo(
    () => new Map(document.systems.map((system) => [system.id, system])),
    [document.systems],
  );
  const channels = useMemo(
    () => layoutChannels(document, placements),
    [document, placements],
  );
  const bounds = useMemo(() => canvasBounds(placements, channels), [channels, placements]);
  const [hoveredChannelId, setHoveredChannelId] = useState("");
  const hoveredChannel = channels.find(({ channel }) => channel.id === hoveredChannelId);
  const [viewportSize, setViewportSize] = useState<ViewportSize>({ width: 1, height: 1 });
  const [viewport, setViewport] = useState<ArchitectureViewport>({
    offsetX: 0,
    offsetY: 0,
    zoom: 1,
    isDragging: false,
    lastPointerX: 0,
    lastPointerY: 0,
  });
  const svgRef = useRef<SVGSVGElement | null>(null);
  const viewportRef = useRef(viewport);
  const viewportSizeRef = useRef(viewportSize);
  const activePointersRef = useRef(new Map<number, ViewPoint>());
  const pinchSessionRef = useRef<PinchSession | null>(null);
  const measuredRef = useRef(false);

  function updateViewport(nextViewport: ArchitectureViewport) {
    viewportRef.current = nextViewport;
    setViewport(nextViewport);
  }

  function fitContent(size = viewportSizeRef.current) {
    updateViewport(fitArchitectureViewport(size, bounds));
  }

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof ResizeObserver === "undefined") return;

    function syncViewportSize() {
      const observedSvg = svgRef.current;
      if (!observedSvg) return;
      const rect = observedSvg.getBoundingClientRect();
      const nextSize = { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
      const previousSize = viewportSizeRef.current;
      if (Math.abs(nextSize.width - previousSize.width) < 0.5 && Math.abs(nextSize.height - previousSize.height) < 0.5) return;

      viewportSizeRef.current = nextSize;
      setViewportSize(nextSize);
      const nextViewport = measuredRef.current
        ? preserveViewportCenter(viewportRef.current, previousSize, nextSize)
        : fitArchitectureViewport(nextSize, bounds);
      measuredRef.current = true;
      updateViewport(nextViewport);
    }

    const observer = new ResizeObserver(syncViewportSize);
    observer.observe(svg);
    syncViewportSize();
    return () => observer.disconnect();
  }, [bounds]);

  function zoomAt(nextZoom: number, point: ViewPoint) {
    updateViewport(applyZoomAtPoint(
      viewportRef.current,
      clamp(nextZoom, MIN_ARCHITECTURE_ZOOM, MAX_ARCHITECTURE_ZOOM),
      point,
    ));
  }

  function handleWheel(event: ReactWheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const point = getClientViewPoint(event, svgRef.current);
    if (!point) return;
    if (event.ctrlKey || event.metaKey) {
      zoomAt(viewportRef.current.zoom * Math.exp(-event.deltaY * 0.0015), point);
      return;
    }
    updateViewport({
      ...viewportRef.current,
      offsetX: viewportRef.current.offsetX - event.deltaX,
      offsetY: viewportRef.current.offsetY - event.deltaY,
    });
  }

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const point = getClientViewPoint(event, svgRef.current);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointersRef.current.set(event.pointerId, point);

    if (activePointersRef.current.size === 2) {
      const pinch = getPinchState(activePointersRef.current);
      pinchSessionRef.current = pinch ? {
        anchorViewport: viewportRef.current,
        distance: pinch.distance,
        midpoint: pinch.midpoint,
      } : null;
      updateViewport({ ...viewportRef.current, isDragging: false });
      return;
    }

    updateViewport({
      ...viewportRef.current,
      isDragging: true,
      lastPointerX: point.x,
      lastPointerY: point.y,
    });
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const point = getClientViewPoint(event, svgRef.current);
    if (!point) return;
    if (activePointersRef.current.has(event.pointerId)) activePointersRef.current.set(event.pointerId, point);

    if (activePointersRef.current.size === 2) {
      const pinch = getPinchState(activePointersRef.current);
      const session = pinchSessionRef.current;
      if (!pinch || !session) return;
      const zoomed = applyZoomAtPoint(
        session.anchorViewport,
        clamp(session.anchorViewport.zoom * (pinch.distance / session.distance), MIN_ARCHITECTURE_ZOOM, MAX_ARCHITECTURE_ZOOM),
        session.midpoint,
      );
      updateViewport({
        ...zoomed,
        offsetX: zoomed.offsetX + pinch.midpoint.x - session.midpoint.x,
        offsetY: zoomed.offsetY + pinch.midpoint.y - session.midpoint.y,
        isDragging: false,
      });
      return;
    }

    if (!viewportRef.current.isDragging || !activePointersRef.current.has(event.pointerId)) return;
    updateViewport({
      ...viewportRef.current,
      offsetX: viewportRef.current.offsetX + point.x - viewportRef.current.lastPointerX,
      offsetY: viewportRef.current.offsetY + point.y - viewportRef.current.lastPointerY,
      lastPointerX: point.x,
      lastPointerY: point.y,
    });
  }

  function handlePointerEnd(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    activePointersRef.current.delete(event.pointerId);
    pinchSessionRef.current = null;
    const remaining = activePointersRef.current.values().next().value as ViewPoint | undefined;
    updateViewport({
      ...viewportRef.current,
      isDragging: Boolean(remaining),
      lastPointerX: remaining?.x ?? viewportRef.current.lastPointerX,
      lastPointerY: remaining?.y ?? viewportRef.current.lastPointerY,
    });
  }

  return (
    <section className="absolute inset-0 flex min-h-0 flex-col bg-slate-950 text-slate-100">
      <header className="border-b border-white/10 px-6 pb-4 pt-20">
        <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-200">System architecture</p>
        <h1 className="mt-2 text-xl font-semibold text-white">Final-state systems and channels</h1>
        <p className="mt-2 max-w-4xl text-sm text-slate-400">{document.summary}</p>
        <ArchitectureProgressStepper view={view} />
        {regenerationWarning ? <p className="mt-3 rounded-xl border border-amber-300/25 bg-amber-300/10 px-4 py-2 text-sm text-amber-100">{regenerationWarning}</p> : null}
      </header>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${viewportSize.width} ${viewportSize.height}`}
          role="img"
          aria-label="Pannable software architecture diagram"
          className={`h-full w-full select-none touch-none bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.06),transparent_60%)] ${viewport.isDragging ? "cursor-grabbing" : "cursor-grab"}`}
          onWheel={handleWheel}
          onPointerCancel={handlePointerEnd}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
        >
          <defs>
            <marker id="architecture-arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,6 L9,3 z" fill="#67e8f9" />
            </marker>
          </defs>
          <g transform={`translate(${viewport.offsetX} ${viewport.offsetY}) scale(${viewport.zoom})`}>
            {channels.map(({ channel, path }) => {
              const isHovered = hoveredChannelId === channel.id;
              const sourceName = systemById.get(channel.source_system_id)?.name ?? channel.source_system_id;
              const targetName = systemById.get(channel.target_system_id)?.name ?? channel.target_system_id;
              return <g key={channel.id}>
                <path d={path} fill="none" stroke="#67e8f9" strokeWidth={isHovered ? "4" : "2.5"} markerEnd="url(#architecture-arrow)" opacity={isHovered ? "1" : "0.48"} pointerEvents="none" />
                <path
                  d={path}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="20"
                  pointerEvents="stroke"
                  tabIndex={0}
                  aria-label={`${channel.name}: ${sourceName} to ${targetName}. ${channel.summary}`}
                  className="cursor-help outline-none"
                  onFocus={() => setHoveredChannelId(channel.id)}
                  onBlur={() => setHoveredChannelId("")}
                  onPointerEnter={() => setHoveredChannelId(channel.id)}
                  onPointerLeave={() => setHoveredChannelId("")}
                ><title>{`${channel.name}: ${sourceName} to ${targetName}. ${channel.summary}`}</title></path>
              </g>;
            })}
            {document.systems.map((system) => {
              const placement = placementById.get(system.id);
              if (!placement) return null;
              const nameLines = wrapName(system.name, 25, 2);
              return <g key={system.id}>
                <title>{`${system.name}: ${system.summary}`}</title>
                <rect x={placement.x} y={placement.y} width={placement.width} height={placement.height} rx="18" fill="#0f172a" stroke="#67e8f9" strokeWidth="2" />
                <text x={placement.x + placement.width / 2} y={placement.y + 48} textAnchor="middle" fill="white" fontSize="18" fontWeight="700">
                  {nameLines.map((line, index) => <tspan key={`${line}:${index}`} x={placement.x + placement.width / 2} dy={index === 0 ? 0 : 23}>{line}</tspan>)}
                </text>
                <text x={placement.x + placement.width / 2} y={placement.y + placement.height - 22} textAnchor="middle" fill="#94a3b8" fontSize="11">{system.files.length} {system.files.length === 1 ? "file" : "files"}</text>
              </g>;
            })}
            {hoveredChannel ? <ChannelTooltip
              channelName={hoveredChannel.channel.name}
              fieldCount={hoveredChannel.channel.fields.length}
              label={hoveredChannel.label}
              sourceName={systemById.get(hoveredChannel.channel.source_system_id)?.name ?? hoveredChannel.channel.source_system_id}
              summary={hoveredChannel.channel.summary}
              targetName={systemById.get(hoveredChannel.channel.target_system_id)?.name ?? hoveredChannel.channel.target_system_id}
              zoom={viewport.zoom}
            /> : null}
          </g>
        </svg>
        <div className="pointer-events-none absolute bottom-5 right-5 flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/85 p-1.5 shadow-xl backdrop-blur">
          <button type="button" className="pointer-events-auto grid h-9 w-9 place-items-center rounded-full text-lg text-white hover:bg-white/10" aria-label="Zoom out" onClick={() => zoomAt(viewportRef.current.zoom / 1.2, { x: viewportSize.width / 2, y: viewportSize.height / 2 })}>−</button>
          <button type="button" className="pointer-events-auto rounded-full px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10" onClick={() => fitContent()}>Fit</button>
          <button type="button" className="pointer-events-auto grid h-9 w-9 place-items-center rounded-full text-lg text-white hover:bg-white/10" aria-label="Zoom in" onClick={() => zoomAt(viewportRef.current.zoom * 1.2, { x: viewportSize.width / 2, y: viewportSize.height / 2 })}>+</button>
        </div>
        <p className="pointer-events-none absolute bottom-5 left-5 rounded-full border border-white/10 bg-slate-950/75 px-3 py-2 text-[11px] text-slate-400 backdrop-blur">Drag to pan · Pinch or ⌘/Ctrl-scroll to zoom · Hover a connection for details</p>
      </div>
    </section>
  );
}

function ChannelTooltip({ channelName, fieldCount, label, sourceName, summary, targetName, zoom }: {
  channelName: string;
  fieldCount: number;
  label: ViewPoint;
  sourceName: string;
  summary: string;
  targetName: string;
  zoom: number;
}) {
  const summaryLines = wrapName(summary, 48, 2);
  return <g transform={`translate(${label.x} ${label.y}) scale(${1 / zoom}) translate(0 -20)`} pointerEvents="none">
    <rect x="-190" y="-94" width="380" height="94" rx="14" fill="rgba(2, 6, 23, 0.96)" stroke="#67e8f9" strokeWidth="1.5" />
    <text x="-172" y="-68" fill="#f8fafc" fontSize="15" fontWeight="700">{truncate(channelName, 44)}</text>
    <text x="-172" y="-47" fill="#67e8f9" fontSize="11" fontWeight="600">{truncate(`${sourceName} → ${targetName}`, 54)}</text>
    <text x="172" y="-68" textAnchor="end" fill="#94a3b8" fontSize="10">{fieldCount} {fieldCount === 1 ? "field" : "fields"}</text>
    <text x="-172" y="-27" fill="#cbd5e1" fontSize="11">
      {summaryLines.map((line, index) => <tspan key={`${line}:${index}`} x="-172" dy={index === 0 ? 0 : 15}>{line}</tspan>)}
    </text>
  </g>;
}

function fitArchitectureViewport(size: ViewportSize, bounds: ReturnType<typeof canvasBounds>): ArchitectureViewport {
  const availableWidth = Math.max(1, size.width - VIEWPORT_PADDING * 2);
  const availableHeight = Math.max(1, size.height - VIEWPORT_PADDING * 2);
  const zoom = clamp(Math.min(availableWidth / bounds.width, availableHeight / bounds.height, 1), MIN_ARCHITECTURE_ZOOM, MAX_ARCHITECTURE_ZOOM);
  return {
    offsetX: (size.width - bounds.width * zoom) / 2 - bounds.x * zoom,
    offsetY: (size.height - bounds.height * zoom) / 2 - bounds.y * zoom,
    zoom,
    isDragging: false,
    lastPointerX: 0,
    lastPointerY: 0,
  };
}

function applyZoomAtPoint(viewport: ArchitectureViewport, zoom: number, point: ViewPoint): ArchitectureViewport {
  const worldX = (point.x - viewport.offsetX) / viewport.zoom;
  const worldY = (point.y - viewport.offsetY) / viewport.zoom;
  return { ...viewport, offsetX: point.x - worldX * zoom, offsetY: point.y - worldY * zoom, zoom };
}

function preserveViewportCenter(viewport: ArchitectureViewport, previousSize: ViewportSize, nextSize: ViewportSize) {
  const worldX = (previousSize.width / 2 - viewport.offsetX) / viewport.zoom;
  const worldY = (previousSize.height / 2 - viewport.offsetY) / viewport.zoom;
  return { ...viewport, offsetX: nextSize.width / 2 - worldX * viewport.zoom, offsetY: nextSize.height / 2 - worldY * viewport.zoom };
}

function getClientViewPoint(point: { clientX: number; clientY: number }, svg: SVGSVGElement | null): ViewPoint | null {
  const matrix = svg?.getScreenCTM();
  if (!matrix) return null;
  const transformed = new DOMPoint(point.clientX, point.clientY).matrixTransform(matrix.inverse());
  return { x: transformed.x, y: transformed.y };
}

function getPinchState(pointers: Map<number, ViewPoint>) {
  if (pointers.size !== 2) return null;
  const [first, second] = [...pointers.values()];
  const dx = first.x - second.x;
  const dy = first.y - second.y;
  return {
    distance: Math.max(1, Math.hypot(dx, dy)),
    midpoint: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function architectureFailureDetail(view: ArchitectureView) {
  const details = view.failure_details;
  if (!details) return view.error || "No structured document was produced.";
  return [
    view.error || "Architecture generation failed.",
    `Stage: ${details.stage}`,
    `Error type: ${details.error_type}`,
    details.traceback ? `Traceback:\n${details.traceback}` : "",
  ].filter(Boolean).join("\n\n");
}

function CanvasMessage({ title, detail, tone = "neutral", progressView }: { title: string; detail: string; tone?: "neutral" | "error"; progressView?: ArchitectureView }) {
  return <section className="absolute inset-0 grid place-items-center bg-slate-950 p-8 text-slate-100"><div className={`max-w-xl rounded-[1.75rem] border p-7 text-center ${tone === "error" ? "border-rose-400/25 bg-rose-500/10" : "border-white/10 bg-white/[0.03]"}`}><h1 className="text-xl font-semibold text-white">{title}</h1><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">{detail}</p>{progressView ? <ArchitectureProgressStepper view={progressView} /> : null}</div></section>;
}

const PROGRESS_PHASES: Array<{ stage: ArchitectureProgressStage; label: string }> = [
  { stage: "queued", label: "Queued" },
  { stage: "preparing_snapshot", label: "Preparing snapshot" },
  { stage: "collecting_evidence", label: "Collecting evidence" },
  { stage: "generating_document", label: "Generating document" },
  { stage: "validating_document", label: "Validating document" },
  { stage: "finalizing", label: "Finalizing" },
];

function ArchitectureProgressStepper({ view }: { view: ArchitectureView }) {
  const events = view.progress_events ?? [];
  const latest = events.at(-1);
  const activeOrder = latest?.stage_order ?? 0;
  const failed = view.status === "failed";
  const correction = [...events].reverse().find((event) => event.stage === "correcting_document");
  return <div className="mt-4 grid gap-2 text-left" aria-label="Architecture generation progress">
    <div className="flex flex-wrap gap-2">
      {PROGRESS_PHASES.map((phase) => {
        const status = failed && phase.stage === "finalizing" ? "failed" : activeOrder > stageOrder(phase.stage) ? "completed" : activeOrder === stageOrder(phase.stage) ? "active" : "pending";
        return <span key={phase.stage} className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${status === "completed" ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100" : status === "active" ? "border-cyan-300/35 bg-cyan-300/10 text-cyan-100" : status === "failed" ? "border-rose-300/35 bg-rose-300/10 text-rose-100" : "border-white/10 text-slate-500"}`}>{phase.label}</span>;
      })}
    </div>
    {correction ? <p className="text-xs text-amber-100">Correcting document, attempt {correction.attempt} of {correction.total_attempts}.</p> : latest?.detail ? <p className="text-xs text-slate-400">{latest.detail}</p> : null}
  </div>;
}

function stageOrder(stage: ArchitectureProgressStage) {
  return ({ queued: 1, preparing_snapshot: 2, collecting_evidence: 3, generating_document: 4, validating_document: 5, correcting_document: 6, finalizing: 7 } as const)[stage];
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
