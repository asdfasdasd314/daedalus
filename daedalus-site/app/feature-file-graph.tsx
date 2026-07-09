"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type {
  FeatureFileProjects,
  FeatureFileRecord,
} from "@/lib/feature-file-cache";
import { normalizeFeatureFilePath } from "./feature-workspace-utils";

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
const DRAG_CLICK_THRESHOLD = 8;
const FEATURE_FILE_REFERENCE_REGEX = /feature_files\/[A-Za-z0-9._/-]+\.md/g;

type FeatureNode = {
  id: string;
  projectIndex: number;
  projectNodeIndex: number;
  projectPath: string;
  filePath: string;
  featureName: string;
  contentLength: number;
  connectionCount: number;
  connectionIntensity: number;
  radius: number;
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
  isDragging: boolean;
  dragMoved: boolean;
  dragStartX: number;
  dragStartY: number;
  lastPointerX: number;
  lastPointerY: number;
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

export type FeatureGraphSelection = {
  featureName: string;
  filePath: string;
  projectPath: string;
};

type FeatureFileGraphProps = {
  onNodeSelect: (selection: FeatureGraphSelection) => void;
  onOpenNewFeature: () => void;
  onOpenVentures: () => void;
  onZoomChange: (zoom: number) => void;
  projects: FeatureFileProjects;
  selectedFeatureFilePath: string;
  zoom: number;
};

type FeatureEdge = {
  id: string;
  projectPath: string;
  sourceNodeId: string;
  targetNodeId: string;
};

type ProjectFeatureLayout = {
  edges: Array<{
    projectPath: string;
    sourceFilePath: string;
    targetFilePath: string;
  }>;
  orderedFeatureFiles: FeatureFileRecord[];
};

type GraphData = {
  clusters: ProjectCluster[];
  defaultViewport: GraphViewport;
  edges: FeatureEdge[];
  nodes: FeatureNode[];
};

type NodeDragState = {
  nodeId: string;
  pointerOffsetX: number;
  pointerOffsetY: number;
  startViewX: number;
  startViewY: number;
  moved: boolean;
};

type PinchState = {
  distance: number;
  midpoint: {
    x: number;
    y: number;
  };
};

type NodeTapState = {
  nodeId: string;
  pointerId: number;
  startViewX: number;
  startViewY: number;
  moved: boolean;
};

export default function FeatureFileGraph({
  onNodeSelect,
  onOpenNewFeature,
  onOpenVentures,
  onZoomChange,
  projects,
  selectedFeatureFilePath,
  zoom,
}: FeatureFileGraphProps) {
  const graphData = useMemo(() => buildGraphData(projects), [projects]);
  const [nodes, setNodes] = useState(graphData.nodes);
  const [viewport, setViewport] = useState({
    ...graphData.defaultViewport,
    zoom,
  });
  const [draggedNodeId, setDraggedNodeId] = useState("");
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const nodesRef = useRef(graphData.nodes);
  const viewportRef = useRef({
    ...graphData.defaultViewport,
    zoom,
  });
  const nodeDragRef = useRef<NodeDragState | null>(null);
  const nodeTapRef = useRef<NodeTapState | null>(null);
  const activePointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<PinchState | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNodes(graphData.nodes);
    setDraggedNodeId("");
    nodesRef.current = graphData.nodes;
    viewportRef.current = {
      ...graphData.defaultViewport,
      zoom,
    };
    nodeDragRef.current = null;
    nodeTapRef.current = null;
    activePointersRef.current.clear();
    pinchRef.current = null;
    setViewport({
      ...graphData.defaultViewport,
      zoom,
    });
  }, [graphData, zoom]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(pointer: coarse)");

    function syncPointerMode() {
      setIsCoarsePointer(mediaQuery.matches);
    }

    syncPointerMode();
    mediaQuery.addEventListener("change", syncPointerMode);

    return () => {
      mediaQuery.removeEventListener("change", syncPointerMode);
    };
  }, []);

  useEffect(() => {
    if (Math.abs(zoom - viewportRef.current.zoom) < 0.001) {
      return;
    }

    const nextViewport = applyZoomAtPoint(
      viewportRef.current,
      clamp(zoom, MIN_ZOOM, MAX_ZOOM),
      VIEWPORT_WIDTH / 2,
      VIEWPORT_HEIGHT / 2,
    );
    viewportRef.current = nextViewport;
    setViewport(nextViewport);
  }, [zoom]);

  useEffect(() => {
    if (graphData.nodes.length === 0) {
      return;
    }

    let frameId = 0;

    function animate() {
      nodesRef.current = tickNodes(
        nodesRef.current,
        graphData.clusters,
        graphData.edges,
        draggedNodeId,
      );
      viewportRef.current = tickViewport(viewportRef.current);
      setNodes(nodesRef.current);
      setViewport(viewportRef.current);
      frameId = window.requestAnimationFrame(animate);
    }

    frameId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [draggedNodeId, graphData]);

  function updateViewport(nextViewport: GraphViewport) {
    viewportRef.current = nextViewport;
    setViewport(nextViewport);
  }

  function updateZoom(nextZoom: number, viewX: number, viewY: number) {
    const clampedZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    const nextViewport = applyZoomAtPoint(
      viewportRef.current,
      clampedZoom,
      viewX,
      viewY,
    );

    updateViewport(nextViewport);

    if (Math.abs(clampedZoom - zoom) > 0.001) {
      onZoomChange(clampedZoom);
    }
  }

  function resetHoverState() {
    const nextNodes = nodesRef.current.map((node) => ({
      ...node,
      isHovered: false,
    }));
    nodesRef.current = nextNodes;
    setNodes(nextNodes);
  }

  function handleWheel(event: ReactWheelEvent<SVGSVGElement>) {
    event.preventDefault();

    const svg = svgRef.current;

    if (!svg) {
      return;
    }

    const rect = svg.getBoundingClientRect();
    const viewX = ((event.clientX - rect.left) / rect.width) * VIEWPORT_WIDTH;
    const viewY = ((event.clientY - rect.top) / rect.height) * VIEWPORT_HEIGHT;

    if (event.ctrlKey || event.metaKey) {
      const zoomFactor = Math.exp(-event.deltaY * 0.0015);
      updateZoom(viewportRef.current.zoom * zoomFactor, viewX, viewY);
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

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    const point = getViewPoint(event, svgRef.current);

    if (!point) {
      return;
    }

    activePointersRef.current.set(event.pointerId, point);

    if (activePointersRef.current.size === 2) {
      nodeTapRef.current = null;
      pinchRef.current = getPinchState(activePointersRef.current);
      updateViewport({
        ...viewportRef.current,
        isDragging: false,
        dragMoved: true,
        velocityX: 0,
        velocityY: 0,
      });
      return;
    }

    if (activePointersRef.current.size > 1) {
      return;
    }

    resetHoverState();
    updateViewport({
      ...viewportRef.current,
      isDragging: true,
      dragMoved: false,
      dragStartX: point.x,
      dragStartY: point.y,
      lastPointerX: point.x,
      lastPointerY: point.y,
      velocityX: 0,
      velocityY: 0,
    });
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const point = getViewPoint(event, svgRef.current);

    if (!point) {
      return;
    }

    if (activePointersRef.current.has(event.pointerId)) {
      activePointersRef.current.set(event.pointerId, point);
    }

    if (nodeTapRef.current?.pointerId === event.pointerId) {
      const movedFarEnough =
        nodeTapRef.current.moved ||
        Math.abs(point.x - nodeTapRef.current.startViewX) > DRAG_CLICK_THRESHOLD ||
        Math.abs(point.y - nodeTapRef.current.startViewY) > DRAG_CLICK_THRESHOLD;

      nodeTapRef.current = {
        ...nodeTapRef.current,
        moved: movedFarEnough,
      };
    }

    if (activePointersRef.current.size === 2) {
      const previousPinchState = pinchRef.current;
      const nextPinchState = getPinchState(activePointersRef.current);

      if (!previousPinchState || !nextPinchState) {
        pinchRef.current = nextPinchState;
        return;
      }

      const zoomFactor = nextPinchState.distance / previousPinchState.distance;
      const midpointDeltaX =
        nextPinchState.midpoint.x - previousPinchState.midpoint.x;
      const midpointDeltaY =
        nextPinchState.midpoint.y - previousPinchState.midpoint.y;
      const nextZoom = viewportRef.current.zoom * zoomFactor;
      const zoomedViewport = applyZoomAtPoint(
        viewportRef.current,
        clamp(nextZoom, MIN_ZOOM, MAX_ZOOM),
        nextPinchState.midpoint.x,
        nextPinchState.midpoint.y,
      );
      const nextViewport = {
        ...zoomedViewport,
        offsetX: zoomedViewport.offsetX + midpointDeltaX,
        offsetY: zoomedViewport.offsetY + midpointDeltaY,
        isDragging: false,
        dragMoved: true,
        velocityX: 0,
        velocityY: 0,
      };

      pinchRef.current = nextPinchState;
      updateViewport(nextViewport);

      if (Math.abs(nextViewport.zoom - zoom) > 0.001) {
        onZoomChange(nextViewport.zoom);
      }

      return;
    }

    if (nodeDragRef.current) {
      const worldPoint = getWorldPoint(point, viewportRef.current);
      const movedFarEnough =
        nodeDragRef.current.moved ||
        Math.abs(point.x - nodeDragRef.current.startViewX) >
          DRAG_CLICK_THRESHOLD ||
        Math.abs(point.y - nodeDragRef.current.startViewY) >
          DRAG_CLICK_THRESHOLD;

      const nextNodes = nodesRef.current.map((node) => {
        if (node.id !== nodeDragRef.current?.nodeId) {
          return node;
        }

        const nextX = worldPoint.x - nodeDragRef.current.pointerOffsetX;
        const nextY = worldPoint.y - nodeDragRef.current.pointerOffsetY;

        return {
          ...node,
          x: nextX,
          y: nextY,
          vx: nextX - node.x,
          vy: nextY - node.y,
          isHovered: true,
        };
      });

      nodeDragRef.current = {
        ...nodeDragRef.current,
        moved: movedFarEnough,
      };
      nodesRef.current = nextNodes;
      setNodes(nextNodes);
      return;
    }

    const tappedNode = nodeTapRef.current;

    if (tappedNode?.pointerId === event.pointerId) {
      nodeTapRef.current = null;

      if (!tappedNode.moved) {
        const selectedNode = nodesRef.current.find(
          (node) => node.id === tappedNode.nodeId,
        );

        if (selectedNode) {
          selectNode(selectedNode);
        }
      }
    }

    if (!viewportRef.current.isDragging) {
      return;
    }

    const deltaX = point.x - viewportRef.current.lastPointerX;
    const deltaY = point.y - viewportRef.current.lastPointerY;
    const movedFarEnough =
      viewportRef.current.dragMoved ||
      Math.abs(point.x - viewportRef.current.dragStartX) > DRAG_CLICK_THRESHOLD ||
      Math.abs(point.y - viewportRef.current.dragStartY) > DRAG_CLICK_THRESHOLD;

    updateViewport({
      ...viewportRef.current,
      offsetX: viewportRef.current.offsetX + deltaX,
      offsetY: viewportRef.current.offsetY + deltaY,
      velocityX: deltaX,
      velocityY: deltaY,
      dragMoved: movedFarEnough,
      lastPointerX: point.x,
      lastPointerY: point.y,
    });
  }

  function handlePointerEnd(event: ReactPointerEvent<SVGSVGElement>) {
    activePointersRef.current.delete(event.pointerId);

    if (activePointersRef.current.size < 2) {
      pinchRef.current = null;
    }

    if (nodeDragRef.current) {
      const draggedNode = nodeDragRef.current;

      nodeDragRef.current = null;
      setDraggedNodeId("");

      if (!draggedNode.moved) {
        const selectedNode = nodesRef.current.find(
          (node) => node.id === draggedNode.nodeId,
        );

        if (selectedNode) {
          emitNodeSelection(selectedNode);
        }
      }
    }

    if (!viewportRef.current.isDragging) {
      return;
    }

    updateViewport({
      ...viewportRef.current,
      isDragging: false,
    });
  }

  function handleNodePointerDown(
    event: ReactPointerEvent<SVGGElement>,
    nodeId: string,
  ) {
    const point = getViewPoint(event, svgRef.current);

    if (!point) {
      return;
    }

    if (isCoarsePointer || event.pointerType !== "mouse") {
      nodeTapRef.current = {
        nodeId,
        pointerId: event.pointerId,
        startViewX: point.x,
        startViewY: point.y,
        moved: false,
      };
      return;
    }

    event.stopPropagation();

    const worldPoint = getWorldPoint(point, viewportRef.current);
    const node = nodesRef.current.find((currentNode) => currentNode.id === nodeId);

    if (!node) {
      return;
    }

    setDraggedNodeId(nodeId);
    nodeDragRef.current = {
      nodeId,
      pointerOffsetX: worldPoint.x - node.x,
      pointerOffsetY: worldPoint.y - node.y,
      startViewX: point.x,
      startViewY: point.y,
      moved: false,
    };

    const nextNodes = nodesRef.current.map((currentNode) => ({
      ...currentNode,
      isHovered: currentNode.id === nodeId,
    }));
    nodesRef.current = nextNodes;
    setNodes(nextNodes);
  }

  function handleNodeEnter(nodeId: string) {
    if (viewportRef.current.isDragging || draggedNodeId || isCoarsePointer) {
      return;
    }

    const nextNodes = nodesRef.current.map((node) => ({
      ...node,
      isHovered: node.id === nodeId,
    }));
    nodesRef.current = nextNodes;
    setNodes(nextNodes);
  }

  function handleNodeLeave() {
    if (viewportRef.current.isDragging || draggedNodeId || isCoarsePointer) {
      return;
    }

    resetHoverState();
  }

  function emitNodeSelection(node: FeatureNode) {
    if (viewportRef.current.dragMoved) {
      updateViewport({
        ...viewportRef.current,
        dragMoved: false,
      });
      return;
    }

    onNodeSelect({
      featureName: node.featureName,
      filePath: node.filePath,
      projectPath: node.projectPath,
    });
  }

  function selectNode(node: FeatureNode) {
    updateViewport({
      ...viewportRef.current,
      isDragging: false,
      dragMoved: false,
      velocityX: 0,
      velocityY: 0,
    });

    onNodeSelect({
      featureName: node.featureName,
      filePath: node.filePath,
      projectPath: node.projectPath,
    });
  }

  const clusterByProjectIndex = new Map(
    graphData.clusters.map((cluster) => [cluster.projectIndex, cluster]),
  );
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const renderedEdges = graphData.edges.flatMap((edge) => {
    const sourceNode = nodeById.get(edge.sourceNodeId);
    const targetNode = nodeById.get(edge.targetNodeId);
    const cluster = sourceNode
      ? clusterByProjectIndex.get(sourceNode.projectIndex)
      : null;

    if (!sourceNode || !targetNode || !cluster) {
      return [];
    }

    return [
      {
        edge,
        cluster,
        sourceNode,
        targetNode,
      },
    ];
  });
  const renderedNodes = nodes
    .filter((node) => clusterByProjectIndex.has(node.projectIndex))
    .sort((leftNode, rightNode) => {
      const leftPriority = Number(
        leftNode.isHovered || leftNode.filePath === selectedFeatureFilePath,
      );
      const rightPriority = Number(
        rightNode.isHovered || rightNode.filePath === selectedFeatureFilePath,
      );

      return leftPriority - rightPriority;
    });

  return (
    <div className="absolute inset-0 bg-[#05070c]">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEWPORT_WIDTH} ${VIEWPORT_HEIGHT}`}
        className={`h-full w-full select-none touch-none ${
          viewport.isDragging || draggedNodeId ? "cursor-grabbing" : "cursor-grab"
        }`}
        role="img"
        aria-label="Feature file graph display"
        onWheel={handleWheel}
        onPointerCancel={handlePointerEnd}
        onPointerDown={handlePointerDown}
        onPointerLeave={handlePointerEnd}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
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

        <rect
          x="0"
          y="0"
          width={VIEWPORT_WIDTH}
          height={VIEWPORT_HEIGHT}
          fill="#05070c"
        />

        <g
          transform={`translate(${viewport.offsetX} ${viewport.offsetY}) scale(${viewport.zoom})`}
        >
          {renderedEdges.map(({ edge, cluster, sourceNode, targetNode }) => (
            <line
              key={edge.id}
              x1={sourceNode.x}
              y1={sourceNode.y}
              x2={targetNode.x}
              y2={targetNode.y}
              stroke={cluster.color.stroke}
              strokeOpacity="0.32"
              strokeWidth="1.6"
            />
          ))}

          {renderedNodes.map((node) => {
            const cluster = clusterByProjectIndex.get(node.projectIndex);

            if (!cluster) {
              return null;
            }

            const isSelected = node.filePath === selectedFeatureFilePath;
            const labelLines = getLabelLines(node.featureName, node.radius);
            const scale = node.isHovered || isSelected ? 1.14 : 1;
            const hoverLabelWidth = Math.max(132, node.featureName.length * 12.8);
            const screenStableScale = 1 / (viewport.zoom * scale);
            const hoverLabelOffset =
              (node.radius + 24) / (viewport.zoom * scale);
            const labelFontSize = clamp(node.radius * 0.3, 5.6, 10.4);
            const lineGap = labelFontSize * 1.55;
            const glowRadius = node.radius + 7 + node.connectionIntensity * 12;
            const glowOpacity = 0.18 + node.connectionIntensity * 0.68;
            const fillOpacity = 0.56 + node.connectionIntensity * 0.36;
            const strokeOpacity = 0.72 + node.connectionIntensity * 0.28;

            return (
              <g
                key={node.id}
                data-node="true"
                transform={`translate(${node.x} ${node.y}) scale(${scale})`}
                onClick={() => emitNodeSelection(node)}
                onPointerDown={(event) => handleNodePointerDown(event, node.id)}
                onPointerEnter={() => handleNodeEnter(node.id)}
                onPointerLeave={handleNodeLeave}
                className={draggedNodeId === node.id ? "cursor-grabbing" : "cursor-pointer"}
              >
                <circle
                  r={glowRadius}
                  fill={cluster.color.glow}
                  opacity={
                    node.isHovered || draggedNodeId === node.id || isSelected
                      ? "0.98"
                      : glowOpacity
                  }
                  filter="url(#node-glow)"
                />
                <circle
                  r={node.radius}
                  fill={cluster.color.fill}
                  fillOpacity={fillOpacity}
                  stroke={
                    node.isHovered || draggedNodeId === node.id || isSelected
                      ? "#ffffff"
                      : cluster.color.stroke
                  }
                  strokeOpacity={
                    node.isHovered || draggedNodeId === node.id || isSelected
                      ? 1
                      : strokeOpacity
                  }
                  strokeWidth={
                    node.isHovered || draggedNodeId === node.id || isSelected
                      ? 3.2
                      : 1.9
                  }
                />
                {node.isHovered || isSelected ? (
                  <g transform={`translate(0 ${-hoverLabelOffset})`}>
                    <g transform={`scale(${screenStableScale})`}>
                      <rect
                        x={-hoverLabelWidth / 2}
                        y="-20"
                        width={hoverLabelWidth}
                        height="34"
                        rx="17"
                        fill="rgba(2, 6, 23, 0.92)"
                        stroke={cluster.color.stroke}
                        strokeWidth="1.4"
                      />
                      <text
                        x="0"
                        y="5"
                        textAnchor="middle"
                        fill="#f8fafc"
                        fontSize="22"
                        fontWeight="700"
                      >
                        {node.featureName}
                      </text>
                    </g>
                  </g>
                ) : null}
                <text
                  x="0"
                  y={-labelFontSize * 0.45}
                  textAnchor="middle"
                  fill={cluster.color.text}
                  fontSize={labelFontSize}
                  fontWeight="700"
                >
                  {labelLines[0]}
                </text>
                <text
                  x="0"
                  y={lineGap * 0.55}
                  textAnchor="middle"
                  fill={cluster.color.text}
                  fontSize={labelFontSize}
                  fontWeight="700"
                >
                  {labelLines[1]}
                </text>
                <title>{node.featureName}</title>
              </g>
            );
          })}
        </g>
      </svg>

      <button
        type="button"
        onClick={onOpenVentures}
        className="pointer-events-auto absolute left-3 top-1/2 -translate-y-1/2 rounded-r-[1.25rem] border border-white/10 border-l-0 bg-slate-950/82 px-3 py-8 text-xs font-semibold uppercase tracking-[0.22em] text-slate-100 shadow-[0_20px_60px_rgba(2,6,23,0.5)] backdrop-blur transition hover:bg-slate-900"
      >
        Ventures
      </button>

      <button
        type="button"
        onClick={onOpenNewFeature}
        className="pointer-events-auto absolute bottom-5 left-1/2 inline-flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-full border border-amber-100/30 bg-amber-300 text-[2rem] font-semibold leading-none text-slate-950 shadow-[0_20px_60px_rgba(245,158,11,0.32)] ring-1 ring-amber-50/20 transition hover:scale-[1.03] hover:bg-amber-200"
        aria-label="Open new feature session"
      >
        +
      </button>

      <div className="pointer-events-auto absolute right-3 top-1/2 flex -translate-y-1/2 flex-col items-center gap-3 rounded-[1.5rem] border border-white/10 bg-slate-950/82 px-3 py-4 shadow-[0_20px_60px_rgba(2,6,23,0.45)] backdrop-blur">
        <span className="text-sm font-semibold text-white">+</span>
        <input
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step="0.01"
          value={zoom}
          onChange={(event) =>
            updateZoom(
              Number(event.target.value),
              VIEWPORT_WIDTH / 2,
              VIEWPORT_HEIGHT / 2,
            )
          }
          className="workspace-zoom-slider h-52 w-6 accent-amber-300"
          aria-label="Graph zoom"
        />
        <span className="text-sm font-semibold text-white">-</span>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
          {Math.round(zoom * 100)}%
        </span>
      </div>
    </div>
  );
}

function buildGraphData(projects: FeatureFileProjects): GraphData {
  const projectEntries = Object.entries(projects);
  const clusters = createClusters(projectEntries);
  const nodes: FeatureNode[] = [];
  const edges: FeatureEdge[] = [];

  projectEntries.forEach(([projectPath, featureFiles], projectIndex) => {
    const cluster = clusters[projectIndex];
    const projectLayout = buildProjectFeatureLayout(projectPath, featureFiles);
    const projectNodes = projectLayout.orderedFeatureFiles.map((featureFile, nodeIndex) =>
      createNode(projectPath, cluster, featureFile, nodeIndex),
    );
    const nodeIdByFilePath = new Map(projectNodes.map((node) => [node.filePath, node.id]));

    edges.push(
      ...projectLayout.edges.map((edge) => ({
        id: createEdgeId(
          nodeIdByFilePath.get(edge.sourceFilePath) ?? edge.sourceFilePath,
          nodeIdByFilePath.get(edge.targetFilePath) ?? edge.targetFilePath,
        ),
        projectPath: edge.projectPath,
        sourceNodeId:
          nodeIdByFilePath.get(edge.sourceFilePath) ?? edge.sourceFilePath,
        targetNodeId:
          nodeIdByFilePath.get(edge.targetFilePath) ?? edge.targetFilePath,
      })),
    );

    nodes.push(...projectNodes);
  });

  const nodesWithVisualMetrics = applyNodeVisualMetrics(nodes, edges);
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
      isDragging: false,
      dragMoved: false,
      dragStartX: 0,
      dragStartY: 0,
      lastPointerX: 0,
      lastPointerY: 0,
    },
    edges,
    nodes: nodesWithVisualMetrics,
  };
}

function createClusters(projectEntries: Array<[string, FeatureFileRecord[]]>) {
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
  featureFile: FeatureFileRecord,
  nodeIndex: number,
): FeatureNode {
  const safeProjectPath = projectPath || `project-${cluster.projectIndex}`;
  const filePath = normalizeFeatureFilePath(featureFile.path);
  const featureName = extractFeatureName(featureFile.markdown);
  const position = getSpiralPosition(cluster.centerX, cluster.centerY, nodeIndex);

  return {
    id: `${safeProjectPath}:${filePath}`,
    projectIndex: cluster.projectIndex,
    projectNodeIndex: nodeIndex,
    projectPath: safeProjectPath,
    filePath,
    featureName,
    contentLength: featureFile.markdown.length,
    connectionCount: 0,
    connectionIntensity: 0,
    radius: NODE_RADIUS,
    x: position.x,
    y: position.y,
    vx: 0,
    vy: 0,
    isHovered: false,
  };
}

function buildProjectFeatureLayout(
  projectPath: string,
  featureFiles: FeatureFileRecord[],
): ProjectFeatureLayout {
  const orderedFeatureFiles = [...featureFiles];
  const featureByPath = new Map(
    orderedFeatureFiles.map((featureFile) => [
      normalizeFeatureFilePath(featureFile.path),
      featureFile,
    ]),
  );
  const neighborsByPath = new Map<string, Set<string>>();
  const edges: Array<{
    projectPath: string;
    sourceFilePath: string;
    targetFilePath: string;
  }> = [];
  const seenEdgeIds = new Set<string>();

  for (const featureFile of orderedFeatureFiles) {
    const filePath = normalizeFeatureFilePath(featureFile.path);
    const references = extractFeatureFileReferences(featureFile.markdown);

    if (!neighborsByPath.has(filePath)) {
      neighborsByPath.set(filePath, new Set());
    }

    for (const referencedPath of references) {
      if (!featureByPath.has(referencedPath) || referencedPath === filePath) {
        continue;
      }

      neighborsByPath.get(filePath)?.add(referencedPath);

      if (!neighborsByPath.has(referencedPath)) {
        neighborsByPath.set(referencedPath, new Set());
      }

      neighborsByPath.get(referencedPath)?.add(filePath);
      const edgeId = createEdgeId(filePath, referencedPath);

      if (seenEdgeIds.has(edgeId)) {
        continue;
      }

      seenEdgeIds.add(edgeId);
      edges.push({
        projectPath,
        sourceFilePath: filePath,
        targetFilePath: referencedPath,
      });
    }
  }

  const originalIndexByPath = new Map(
    orderedFeatureFiles.map((featureFile, index) => [
      normalizeFeatureFilePath(featureFile.path),
      index,
    ]),
  );
  const visitedPaths = new Set<string>();
  const connectedFeatureFiles: FeatureFileRecord[] = [];
  const isolatedFeatureFiles: FeatureFileRecord[] = [];

  const connectedPaths = orderedFeatureFiles
    .map((featureFile) => normalizeFeatureFilePath(featureFile.path))
    .filter((filePath) => (neighborsByPath.get(filePath)?.size ?? 0) > 0)
    .sort((leftPath, rightPath) => {
      const degreeDifference =
        (neighborsByPath.get(rightPath)?.size ?? 0) -
        (neighborsByPath.get(leftPath)?.size ?? 0);

      if (degreeDifference !== 0) {
        return degreeDifference;
      }

      return (
        (originalIndexByPath.get(leftPath) ?? 0) -
        (originalIndexByPath.get(rightPath) ?? 0)
      );
    });

  for (const startPath of connectedPaths) {
    if (visitedPaths.has(startPath)) {
      continue;
    }

    const queue = [startPath];
    visitedPaths.add(startPath);

    while (queue.length > 0) {
      const currentPath = queue.shift();

      if (!currentPath) {
        continue;
      }

      const featureFile = featureByPath.get(currentPath);

      if (featureFile) {
        connectedFeatureFiles.push(featureFile);
      }

      const sortedNeighbors = [...(neighborsByPath.get(currentPath) ?? [])].sort(
        (leftPath, rightPath) => {
          const degreeDifference =
            (neighborsByPath.get(rightPath)?.size ?? 0) -
            (neighborsByPath.get(leftPath)?.size ?? 0);

          if (degreeDifference !== 0) {
            return degreeDifference;
          }

          return (
            (originalIndexByPath.get(leftPath) ?? 0) -
            (originalIndexByPath.get(rightPath) ?? 0)
          );
        },
      );

      for (const neighborPath of sortedNeighbors) {
        if (visitedPaths.has(neighborPath)) {
          continue;
        }

        visitedPaths.add(neighborPath);
        queue.push(neighborPath);
      }
    }
  }

  for (const featureFile of orderedFeatureFiles) {
    const filePath = normalizeFeatureFilePath(featureFile.path);

    if (visitedPaths.has(filePath)) {
      continue;
    }

    isolatedFeatureFiles.push(featureFile);
  }

  return {
    edges,
    orderedFeatureFiles: [...connectedFeatureFiles, ...isolatedFeatureFiles],
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

function tickNodes(
  nodes: FeatureNode[],
  clusters: ProjectCluster[],
  edges: FeatureEdge[],
  draggedNodeId: string,
) {
  const clusterByProjectIndex = new Map(
    clusters.map((cluster) => [cluster.projectIndex, cluster]),
  );
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return nodes.map((node) => {
    if (node.id === draggedNodeId) {
      return {
        ...node,
        vx: node.vx * 0.72,
        vy: node.vy * 0.72,
      };
    }

    const cluster = clusterByProjectIndex.get(node.projectIndex);

    if (!cluster) {
      return {
        ...node,
        vx: node.vx * 0.72,
        vy: node.vy * 0.72,
      };
    }

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
      const minimumDistance = (node.radius + sibling.radius) * 1.65;

      if (distance < minimumDistance) {
        const push = (minimumDistance - distance) * 0.038;
        nextVx += (dx / distance) * push;
        nextVy += (dy / distance) * push;
      }
    }

    for (const edge of edges) {
      if (edge.sourceNodeId !== node.id && edge.targetNodeId !== node.id) {
        continue;
      }

      const otherNodeId =
        edge.sourceNodeId === node.id ? edge.targetNodeId : edge.sourceNodeId;
      const otherNode = nodeById.get(otherNodeId);

      if (!otherNode) {
        continue;
      }

      const dx = otherNode.x - node.x;
      const dy = otherNode.y - node.y;
      const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const springDistance = SPIRAL_STEP * 0.82;
      const pull = (distance - springDistance) * 0.0065;

      nextVx += (dx / distance) * pull;
      nextVy += (dy / distance) * pull;
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
  if (viewport.isDragging) {
    return viewport;
  }

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

function getViewPoint(
  event: ReactPointerEvent<Element>,
  svg: SVGSVGElement | null,
) {
  if (!svg) {
    return null;
  }

  const rect = svg.getBoundingClientRect();

  return {
    x: ((event.clientX - rect.left) / rect.width) * VIEWPORT_WIDTH,
    y: ((event.clientY - rect.top) / rect.height) * VIEWPORT_HEIGHT,
  };
}

function getWorldPoint(
  point: {
    x: number;
    y: number;
  },
  viewport: GraphViewport,
) {
  return {
    x: (point.x - viewport.offsetX) / viewport.zoom,
    y: (point.y - viewport.offsetY) / viewport.zoom,
  };
}

function getPinchState(
  pointers: Map<number, { x: number; y: number }>,
): PinchState | null {
  const points = [...pointers.values()];

  if (points.length !== 2) {
    return null;
  }

  const [firstPoint, secondPoint] = points;
  const dx = firstPoint.x - secondPoint.x;
  const dy = firstPoint.y - secondPoint.y;

  return {
    distance: Math.max(1, Math.sqrt(dx * dx + dy * dy)),
    midpoint: {
      x: (firstPoint.x + secondPoint.x) / 2,
      y: (firstPoint.y + secondPoint.y) / 2,
    },
  };
}

function applyNodeVisualMetrics(nodes: FeatureNode[], edges: FeatureEdge[]) {
  if (nodes.length === 0) {
    return nodes;
  }

  const sortedLengths = nodes
    .map((node) => node.contentLength)
    .sort((leftLength, rightLength) => leftLength - rightLength);
  const medianLength = getMedianValue(sortedLengths) || 1;
  const connectionCounts = new Map<string, number>();

  for (const edge of edges) {
    connectionCounts.set(
      edge.sourceNodeId,
      (connectionCounts.get(edge.sourceNodeId) ?? 0) + 1,
    );
    connectionCounts.set(
      edge.targetNodeId,
      (connectionCounts.get(edge.targetNodeId) ?? 0) + 1,
    );
  }

  const maxConnectionCount = Math.max(
    1,
    ...nodes.map((node) => connectionCounts.get(node.id) ?? 0),
  );

  return nodes.map((node) => {
    const connectionCount = connectionCounts.get(node.id) ?? 0;
    const sizeRatio = node.contentLength / medianLength;

    return {
      ...node,
      connectionCount,
      connectionIntensity: connectionCount / maxConnectionCount,
      radius: clamp(
        NODE_RADIUS * sizeRatio,
        NODE_RADIUS * 0.6,
        NODE_RADIUS * 2.4,
      ),
    };
  });
}

function getMedianValue(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const middleIndex = Math.floor(values.length / 2);

  if (values.length % 2 === 1) {
    return values[middleIndex];
  }

  return (values[middleIndex - 1] + values[middleIndex]) / 2;
}

function extractFeatureFileReferences(markdown: string) {
  const matches = markdown.match(FEATURE_FILE_REFERENCE_REGEX) ?? [];
  return [...new Set(matches.map(normalizeFeatureFilePath))];
}

function createEdgeId(sourceNodeId: string, targetNodeId: string) {
  return [sourceNodeId, targetNodeId].sort().join("<->");
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

function getLabelLines(label: string, radius: number) {
  const words = label.split(/\s+/).filter(Boolean);
  const maxLineLength = Math.max(7, Math.round(radius * 0.48));

  if (words.length === 0) {
    return ["Untitled", ""];
  }

  let firstLine = "";
  let secondLine = "";

  for (const word of words) {
    if (!firstLine || `${firstLine} ${word}`.trim().length <= maxLineLength) {
      firstLine = `${firstLine} ${word}`.trim();
      continue;
    }

    if (!secondLine || `${secondLine} ${word}`.trim().length <= maxLineLength) {
      secondLine = `${secondLine} ${word}`.trim();
      continue;
    }

    secondLine = `${secondLine.slice(0, 7)}...`;
    break;
  }

  return [firstLine, secondLine];
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
