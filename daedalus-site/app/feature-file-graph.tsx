"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { FeatureFileProjects } from "@/lib/feature-file-cache";

const VIEWPORT_WIDTH = 1600;
const VIEWPORT_HEIGHT = 980;
const NODE_RADIUS = 24;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const SPIRAL_STEP = 92;
const CLUSTER_GAP_X = 1180;
const CLUSTER_GAP_Y = 900;
const CLUSTER_MARGIN = 520;
const MIN_ZOOM = 0.42;
const MAX_ZOOM = 2.6;

type FeatureNode = {
  id: string;
  projectIndex: number;
  projectNodeIndex: number;
  projectPath: string;
  featureName: string;
  markdown: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  isHovered: boolean;
};

type GraphViewport = {
  offsetX: number;
  offsetY: number;
  velocityX: number;
  velocityY: number;
  zoom: number;
};

type ProjectCluster = {
  projectIndex: number;
  centerX: number;
  centerY: number;
  color: ClusterColor;
};

type ClusterColor = {
  fill: string;
  glow: string;
  stroke: string;
  text: string;
};

type FeatureFileGraphProps = {
  projects: FeatureFileProjects;
};

type GraphData = {
  clusters: ProjectCluster[];
  defaultViewport: GraphViewport;
  nodes: FeatureNode[];
};

export default function FeatureFileGraph({ projects }: FeatureFileGraphProps) {
  const graphData = useMemo(() => buildGraphData(projects), [projects]);
  const [nodes, setNodes] = useState(graphData.nodes);
  const [viewport, setViewport] = useState(graphData.defaultViewport);
  const [hoveredNodeId, setHoveredNodeId] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const nodesRef = useRef(graphData.nodes);
  const viewportRef = useRef(graphData.defaultViewport);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    setNodes(graphData.nodes);
    setHoveredNodeId("");
    setSelectedNodeId("");
    nodesRef.current = graphData.nodes;
    viewportRef.current = graphData.defaultViewport;
    setViewport(graphData.defaultViewport);
  }, [graphData]);

  function updateViewport(nextViewport: GraphViewport) {
    viewportRef.current = nextViewport;
    setViewport(nextViewport);
  }

  useEffect(() => {
    if (graphData.nodes.length === 0) {
      return;
    }

    let frameId = 0;

    function animate() {
      nodesRef.current = tickNodes(nodesRef.current, graphData.clusters);
      viewportRef.current = tickViewport(viewportRef.current);
      setNodes(nodesRef.current);
      setViewport(viewportRef.current);
      frameId = window.requestAnimationFrame(animate);
    }

    frameId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [graphData]);

  function handleWheel(event: ReactWheelEvent<SVGSVGElement>) {
    event.preventDefault();

    if (event.ctrlKey || event.metaKey) {
      const svg = svgRef.current;

      if (!svg) {
        return;
      }

      const rect = svg.getBoundingClientRect();
      const viewX = ((event.clientX - rect.left) / rect.width) * VIEWPORT_WIDTH;
      const viewY = ((event.clientY - rect.top) / rect.height) * VIEWPORT_HEIGHT;
      const zoomFactor = Math.exp(-event.deltaY * 0.0015);
      const nextZoom = clamp(
        viewportRef.current.zoom * zoomFactor,
        MIN_ZOOM,
        MAX_ZOOM,
      );

      updateViewport(applyZoomAtPoint(viewportRef.current, nextZoom, viewX, viewY));
      return;
    }

    updateViewport({
      ...viewportRef.current,
      offsetX: viewportRef.current.offsetX - event.deltaX,
      offsetY: viewportRef.current.offsetY - event.deltaY,
      velocityX: viewportRef.current.velocityX - event.deltaX * 0.2,
      velocityY: viewportRef.current.velocityY - event.deltaY * 0.2,
    });
  }

  function handleZoomButton(direction: 1 | -1) {
    const nextZoom = clamp(
      viewportRef.current.zoom * (direction === 1 ? 1.15 : 0.87),
      MIN_ZOOM,
      MAX_ZOOM,
    );

    updateViewport(
      applyZoomAtPoint(
        viewportRef.current,
        nextZoom,
        VIEWPORT_WIDTH / 2,
        VIEWPORT_HEIGHT / 2,
      ),
    );
  }

  function handleNodeEnter(nodeId: string) {
    setHoveredNodeId(nodeId);
    const nextNodes = nodesRef.current.map((node) => ({
      ...node,
      isHovered: node.id === nodeId,
    }));

    nodesRef.current = nextNodes;
    setNodes(nextNodes);
  }

  function handleNodeLeave() {
    setHoveredNodeId("");
    const nextNodes = nodesRef.current.map((node) => ({
      ...node,
      isHovered: false,
    }));

    nodesRef.current = nextNodes;
    setNodes(nextNodes);
  }

  function handleNodeClick(nodeId: string) {
    setSelectedNodeId((currentNodeId) => (currentNodeId === nodeId ? "" : nodeId));
  }

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;

  return (
    <div className="absolute inset-0 bg-black">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEWPORT_WIDTH} ${VIEWPORT_HEIGHT}`}
        className="h-full w-full cursor-default select-none"
        role="img"
        aria-label="Feature file graph display"
        onWheel={handleWheel}
      >
        <defs>
          <filter id="node-glow" x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur stdDeviation="9" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect x="0" y="0" width={VIEWPORT_WIDTH} height={VIEWPORT_HEIGHT} fill="#020617" />

        <g
          transform={`translate(${viewport.offsetX} ${viewport.offsetY}) scale(${viewport.zoom})`}
        >
          {nodes.map((node) => {
            const cluster = graphData.clusters[node.projectIndex];
            const labelLines = getLabelLines(node.featureName);
            const scale = node.isHovered ? 1.14 : 1;

            return (
              <g
                key={node.id}
                data-node="true"
                transform={`translate(${node.x} ${node.y}) scale(${scale})`}
                onPointerEnter={() => handleNodeEnter(node.id)}
                onPointerLeave={handleNodeLeave}
                onClick={() => handleNodeClick(node.id)}
                className="cursor-pointer"
              >
                <circle
                  r={NODE_RADIUS + 8}
                  fill={cluster.color.glow}
                  opacity={node.isHovered ? "0.98" : "0.3"}
                  filter="url(#node-glow)"
                />
                <circle
                  r={NODE_RADIUS}
                  fill={cluster.color.fill}
                  stroke={node.isHovered ? "#ffffff" : cluster.color.stroke}
                  strokeWidth={node.isHovered ? 3.2 : 1.9}
                />
                <text
                  x="0"
                  y="-3.5"
                  textAnchor="middle"
                  fill={cluster.color.text}
                  fontSize="6.8"
                  fontWeight="700"
                >
                  {labelLines[0]}
                </text>
                <text
                  x="0"
                  y="7.5"
                  textAnchor="middle"
                  fill={cluster.color.text}
                  fontSize="6.8"
                  fontWeight="700"
                >
                  {labelLines[1]}
                </text>
                <title>{node.featureName}</title>
              </g>
            );
          })}
        </g>

        {hoveredNodeId ? (
          <text
            x="28"
            y={VIEWPORT_HEIGHT - 28}
            fill="rgba(226,232,240,0.92)"
            fontSize="18"
            fontWeight="600"
          >
            {getHoveredNodeLabel(nodes, hoveredNodeId)}
          </text>
        ) : null}
      </svg>
      <div className="pointer-events-auto absolute bottom-4 right-4 flex gap-2">
        <button
          type="button"
          onClick={() => handleZoomButton(-1)}
          className="rounded-full border border-white/10 bg-slate-950/82 px-4 py-3 text-lg font-semibold text-white shadow-[0_20px_60px_rgba(2,6,23,0.45)] backdrop-blur transition hover:bg-slate-900"
        >
          -
        </button>
        <button
          type="button"
          onClick={() => handleZoomButton(1)}
          className="rounded-full border border-white/10 bg-slate-950/82 px-4 py-3 text-lg font-semibold text-white shadow-[0_20px_60px_rgba(2,6,23,0.45)] backdrop-blur transition hover:bg-slate-900"
        >
          +
        </button>
      </div>

      {selectedNode ? (
        <aside className="pointer-events-auto absolute bottom-20 right-4 top-28 w-[min(32rem,calc(100vw-2rem))] overflow-hidden rounded-[1.75rem] border border-white/10 bg-slate-950/90 shadow-[0_28px_100px_rgba(2,6,23,0.72)] backdrop-blur">
          <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                Feature file
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                {selectedNode.featureName}
              </h2>
              <p className="mt-2 break-all text-xs leading-5 text-slate-400">
                {selectedNode.projectPath}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedNodeId("")}
              className="rounded-full border border-white/10 bg-white/6 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
            >
              Close
            </button>
          </div>
          <div className="h-full overflow-y-auto px-5 py-4">
            <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">
              {selectedNode.markdown}
            </pre>
          </div>
        </aside>
      ) : null}
    </div>
  );
}

function buildGraphData(projects: FeatureFileProjects): GraphData {
  const projectEntries = Object.entries(projects);
  const clusters = createClusters(projectEntries);
  const nodes = projectEntries.flatMap(([projectPath, markdownFiles], projectIndex) => {
    const cluster = clusters[projectIndex];

    return markdownFiles.map((markdown, nodeIndex) =>
      createNode(projectPath, cluster, markdown, nodeIndex),
    );
  });
  const worldWidth = getWorldWidth(projectEntries.length);
  const worldHeight = getWorldHeight(projectEntries.length);

  return {
    clusters,
    defaultViewport: {
      offsetX: VIEWPORT_WIDTH / 2 - worldWidth / 2,
      offsetY: VIEWPORT_HEIGHT / 2 - worldHeight / 2,
      velocityX: 0,
      velocityY: 0,
      zoom: 1,
    },
    nodes,
  };
}

function createClusters(projectEntries: Array<[string, string[]]>): ProjectCluster[] {
  const columnCount = Math.max(1, Math.ceil(Math.sqrt(projectEntries.length)));

  return projectEntries.map(([,], index) => {
    const column = index % columnCount;
    const row = Math.floor(index / columnCount);

    return {
      projectIndex: index,
      centerX: CLUSTER_MARGIN + column * CLUSTER_GAP_X,
      centerY: CLUSTER_MARGIN + row * CLUSTER_GAP_Y,
      color: createClusterColor(index, projectEntries.length),
    };
  });
}

function createNode(
  projectPath: string,
  cluster: ProjectCluster,
  markdown: string,
  nodeIndex: number,
): FeatureNode {
  const safeProjectPath = projectPath || `project-${cluster.projectIndex}`;
  const featureName = extractFeatureName(markdown);
  const position = getSpiralPosition(cluster.centerX, cluster.centerY, nodeIndex);

  return {
    id: `${safeProjectPath}:${featureName}:${nodeIndex}`,
    projectIndex: cluster.projectIndex,
    projectNodeIndex: nodeIndex,
    projectPath: safeProjectPath,
    featureName,
    markdown,
    x: position.x,
    y: position.y,
    vx: 0,
    vy: 0,
    isHovered: false,
  };
}

function getSpiralPosition(centerX: number, centerY: number, nodeIndex: number) {
  if (nodeIndex === 0) {
    return {
      x: centerX,
      y: centerY,
    };
  }

  const angle = nodeIndex * GOLDEN_ANGLE;
  const radius = Math.sqrt(nodeIndex) * SPIRAL_STEP;

  return {
    x: centerX + Math.cos(angle) * radius,
    y: centerY + Math.sin(angle) * radius,
  };
}

function tickNodes(nodes: FeatureNode[], clusters: ProjectCluster[]) {
  return nodes.map((node) => {
    const cluster = clusters[node.projectIndex];
    const target = getSpiralPosition(
      cluster.centerX,
      cluster.centerY,
      node.projectNodeIndex,
    );
    let nextVx = node.vx + (target.x - node.x) * 0.012;
    let nextVy = node.vy + (target.y - node.y) * 0.012;

    for (const sibling of nodes) {
      if (sibling.id === node.id) {
        continue;
      }

      const dx = node.x - sibling.x;
      const dy = node.y - sibling.y;
      const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const minimumDistance = NODE_RADIUS * 3.25;

      if (distance < minimumDistance) {
        const push = (minimumDistance - distance) * 0.038;
        nextVx += (dx / distance) * push;
        nextVy += (dy / distance) * push;
      }
    }

    nextVx *= 0.94;
    nextVy *= 0.94;

    return {
      ...node,
      x: node.x + nextVx,
      y: node.y + nextVy,
      vx: nextVx,
      vy: nextVy,
    };
  });
}

function tickViewport(viewport: GraphViewport) {
  const nextVelocityX = viewport.velocityX * 0.88;
  const nextVelocityY = viewport.velocityY * 0.88;

  return {
    ...viewport,
    offsetX: viewport.offsetX + nextVelocityX,
    offsetY: viewport.offsetY + nextVelocityY,
    velocityX: Math.abs(nextVelocityX) < 0.02 ? 0 : nextVelocityX,
    velocityY: Math.abs(nextVelocityY) < 0.02 ? 0 : nextVelocityY,
  };
}

function applyZoomAtPoint(
  viewport: GraphViewport,
  nextZoom: number,
  viewX: number,
  viewY: number,
): GraphViewport {
  const worldX = (viewX - viewport.offsetX) / viewport.zoom;
  const worldY = (viewY - viewport.offsetY) / viewport.zoom;

  return {
    ...viewport,
    offsetX: viewX - worldX * nextZoom,
    offsetY: viewY - worldY * nextZoom,
    zoom: nextZoom,
  };
}

function extractFeatureName(markdown: string) {
  const lines = markdown.split("\n");

  for (const line of lines) {
    if (line.startsWith("# ")) {
      return line.slice(2).trim() || "Untitled Feature";
    }
  }

  return "Untitled Feature";
}

function createClusterColor(projectIndex: number, projectCount: number): ClusterColor {
  const hue = ((projectIndex * 360) / Math.max(1, projectCount)) % 360;

  return {
    fill: `hsla(${hue} 72% 58% / 0.94)`,
    glow: `hsla(${hue} 90% 65% / 0.38)`,
    stroke: `hsla(${hue} 85% 75% / 0.96)`,
    text: "rgba(248,250,252,0.96)",
  };
}

function getLabelLines(label: string) {
  const words = label.split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return ["Untitled", ""];
  }

  let firstLine = "";
  let secondLine = "";

  for (const word of words) {
    if (!firstLine || `${firstLine} ${word}`.trim().length <= 10) {
      firstLine = `${firstLine} ${word}`.trim();
      continue;
    }

    if (!secondLine || `${secondLine} ${word}`.trim().length <= 10) {
      secondLine = `${secondLine} ${word}`.trim();
      continue;
    }

    secondLine = `${secondLine.slice(0, 7)}...`;
    break;
  }

  return [firstLine, secondLine];
}

function getHoveredNodeLabel(nodes: FeatureNode[], hoveredNodeId: string) {
  return nodes.find((node) => node.id === hoveredNodeId)?.featureName ?? "";
}

function getWorldWidth(projectCount: number) {
  const columnCount = Math.max(1, Math.ceil(Math.sqrt(projectCount)));
  return CLUSTER_MARGIN * 2 + Math.max(0, columnCount - 1) * CLUSTER_GAP_X;
}

function getWorldHeight(projectCount: number) {
  const columnCount = Math.max(1, Math.ceil(Math.sqrt(projectCount)));
  const rowCount = Math.max(1, Math.ceil(projectCount / columnCount));
  return CLUSTER_MARGIN * 2 + Math.max(0, rowCount - 1) * CLUSTER_GAP_Y;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}
