import type { ChannelDefinition, SoftwareArchitecture } from "./architecture-view";

export const SYSTEM_BOX_WIDTH = 260;
export const SYSTEM_BOX_HEIGHT = 132;
export const GRID_COLUMN_GAP = 180;
export const GRID_ROW_GAP = 150;
export const CANVAS_PADDING = 96;
export const PARALLEL_CHANNEL_GAP = 24;

export type Point = { x: number; y: number };
export type SystemPlacement = Point & { id: string; index: number; width: number; height: number };
export type ChannelLayout = {
  channel: ChannelDefinition;
  path: string;
  label: Point;
  offset: number;
  unknownEndpoint: boolean;
};

export function indexSystems(document: SoftwareArchitecture) {
  return new Map(document.systems.map((system, index) => [system.id, index]));
}

export function placeSystems(document: SoftwareArchitecture): SystemPlacement[] {
  if (document.systems.length === 0) return [];
  const columns = Math.max(1, Math.ceil(Math.sqrt(document.systems.length)));
  return document.systems.map((system, index) => ({
    id: system.id,
    index,
    x: CANVAS_PADDING + (index % columns) * (SYSTEM_BOX_WIDTH + GRID_COLUMN_GAP),
    y: CANVAS_PADDING + Math.floor(index / columns) * (SYSTEM_BOX_HEIGHT + GRID_ROW_GAP),
    width: SYSTEM_BOX_WIDTH,
    height: SYSTEM_BOX_HEIGHT,
  }));
}

export function canvasBounds(placements: SystemPlacement[], channels: ChannelLayout[] = []) {
  if (placements.length === 0) {
    return { width: CANVAS_PADDING * 2, height: CANVAS_PADDING * 2, viewBox: `0 0 ${CANVAS_PADDING * 2} ${CANVAS_PADDING * 2}` };
  }
  const labelPoints = channels.filter((channel) => !channel.unknownEndpoint).map((channel) => channel.label);
  const minX = Math.min(0, ...labelPoints.map((point) => point.x - 120));
  const minY = Math.min(0, ...labelPoints.map((point) => point.y - 48));
  const maxX = Math.max(...placements.map((item) => item.x + item.width), ...labelPoints.map((point) => point.x + 120)) + CANVAS_PADDING;
  const maxY = Math.max(...placements.map((item) => item.y + item.height), ...labelPoints.map((point) => point.y + 48)) + CANVAS_PADDING;
  const width = maxX - minX;
  const height = maxY - minY;
  return { width, height, viewBox: `${minX} ${minY} ${width} ${height}` };
}

export function boxEdgeConnectionPoints(source: SystemPlacement, target: SystemPlacement) {
  const sourceCenter = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;
  const sourceScale = 1 / Math.max(Math.abs(dx) / (source.width / 2), Math.abs(dy) / (source.height / 2));
  const targetScale = 1 / Math.max(Math.abs(dx) / (target.width / 2), Math.abs(dy) / (target.height / 2));
  return {
    source: { x: sourceCenter.x + dx * sourceScale, y: sourceCenter.y + dy * sourceScale },
    target: { x: targetCenter.x - dx * targetScale, y: targetCenter.y - dy * targetScale },
  };
}

export function groupParallelChannels(channels: ChannelDefinition[]) {
  const groups = new Map<string, ChannelDefinition[]>();
  for (const channel of channels) {
    const pair = [channel.source_system_id, channel.target_system_id].sort().join("\u0000");
    groups.set(pair, [...(groups.get(pair) ?? []), channel]);
  }
  return groups;
}

export function parallelChannelOffset(index: number, count: number) {
  return (index - (count - 1) / 2) * PARALLEL_CHANNEL_GAP;
}

export function selfChannelLoopPath(system: SystemPlacement, offset = 0) {
  const startX = system.x + system.width * 0.68;
  const endX = system.x + system.width * 0.32;
  const edgeY = system.y;
  const loopY = system.y - 62 - Math.abs(offset);
  return `M ${startX} ${edgeY} C ${startX + 54 + offset} ${loopY}, ${endX - 54 + offset} ${loopY}, ${endX} ${edgeY}`;
}

export function channelLabelPosition(source: Point, target: Point, offset = 0): Point {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    x: (source.x + target.x) / 2 + (-dy / length) * offset,
    y: (source.y + target.y) / 2 + (dx / length) * offset - 8,
  };
}

export function layoutChannels(document: SoftwareArchitecture, placements = placeSystems(document)): ChannelLayout[] {
  const placementById = new Map(placements.map((placement) => [placement.id, placement]));
  const parallelGroups = groupParallelChannels(document.channels);
  return document.channels.map((channel) => {
    const source = placementById.get(channel.source_system_id);
    const target = placementById.get(channel.target_system_id);
    if (!source || !target) {
      return { channel, path: "", label: { x: 0, y: 0 }, offset: 0, unknownEndpoint: true };
    }
    const groupKey = [channel.source_system_id, channel.target_system_id].sort().join("\u0000");
    const group = parallelGroups.get(groupKey) ?? [channel];
    const offset = parallelChannelOffset(group.indexOf(channel), group.length);
    if (source.id === target.id) {
      return {
        channel,
        path: selfChannelLoopPath(source, offset),
        label: { x: source.x + source.width / 2 + offset, y: source.y - 70 - Math.abs(offset) },
        offset,
        unknownEndpoint: false,
      };
    }
    const points = boxEdgeConnectionPoints(source, target);
    const dx = points.target.x - points.source.x;
    const dy = points.target.y - points.source.y;
    const length = Math.hypot(dx, dy) || 1;
    const directionalOffset = channel.source_system_id <= channel.target_system_id ? offset : -offset;
    const perpendicular = { x: (-dy / length) * directionalOffset, y: (dx / length) * directionalOffset };
    const start = { x: points.source.x + perpendicular.x, y: points.source.y + perpendicular.y };
    const end = { x: points.target.x + perpendicular.x, y: points.target.y + perpendicular.y };
    const control = { x: (start.x + end.x) / 2 + perpendicular.x, y: (start.y + end.y) / 2 + perpendicular.y };
    return {
      channel,
      path: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
      label: channelLabelPosition(points.source, points.target, directionalOffset * 2),
      offset,
      unknownEndpoint: false,
    };
  });
}

export function unknownEndpointChannels(document: SoftwareArchitecture) {
  const ids = new Set(document.systems.map((system) => system.id));
  return document.channels.filter((channel) => !ids.has(channel.source_system_id) || !ids.has(channel.target_system_id));
}
