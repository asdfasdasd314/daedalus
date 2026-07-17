import assert from "node:assert/strict";
import test from "node:test";
import type { SoftwareArchitecture } from "./architecture-view";
import {
  boxEdgeConnectionPoints,
  canvasBounds,
  channelLabelPosition,
  groupParallelChannels,
  layoutChannels,
  placeSystems,
  selfChannelLoopPath,
  unknownEndpointChannels,
} from "./architecture-layout";

function architecture(overrides: Partial<SoftwareArchitecture> = {}): SoftwareArchitecture {
  return {
    schema_version: "1.0",
    summary: "Test architecture.",
    systems: [
      { id: "first", name: "First", summary: "First system.", files: [] },
      { id: "second", name: "Second", summary: "Second system.", files: [] },
      { id: "third", name: "Third", summary: "Third system.", files: [] },
    ],
    channels: [],
    ...overrides,
  };
}

test("places systems row-major in stable document order and computes bounds", () => {
  const placements = placeSystems(architecture());
  assert.deepEqual(placements.map((item) => item.id), ["first", "second", "third"]);
  assert.equal(placements[0].y, placements[1].y);
  assert.ok(placements[2].y > placements[0].y);
  const bounds = canvasBounds(placements);
  assert.ok(bounds.width > placements[1].x + placements[1].width);
  assert.match(bounds.viewBox, /^0 0 \d+ \d+$/);
});

test("empty documents have bounded empty canvases", () => {
  const placements = placeSystems(architecture({ systems: [] }));
  assert.deepEqual(placements, []);
  assert.equal(canvasBounds(placements).viewBox, "0 0 192 192");
});

test("connections terminate on box edges and labels use offsets", () => {
  const [source, target] = placeSystems(architecture());
  const points = boxEdgeConnectionPoints(source, target);
  assert.equal(points.source.x, source.x + source.width);
  assert.equal(points.target.x, target.x);
  const center = channelLabelPosition(points.source, points.target, 20);
  assert.notEqual(center.y, points.source.y - 8);
});

test("parallel and reverse channels receive distinct paths", () => {
  const channels: SoftwareArchitecture["channels"] = [
    { id: "one", name: "One", summary: "Forward.", source_system_id: "first", target_system_id: "second", fields: [] },
    { id: "two", name: "Two", summary: "Forward again.", source_system_id: "first", target_system_id: "second", fields: [] },
    { id: "reverse", name: "Reverse", summary: "Reverse.", source_system_id: "second", target_system_id: "first", fields: [] },
  ];
  const document = architecture({ channels });
  assert.equal(groupParallelChannels(channels).size, 1);
  const layouts = layoutChannels(document);
  assert.equal(new Set(layouts.map((layout) => layout.path)).size, 3);
  assert.equal(new Set(layouts.map((layout) => `${layout.label.x}:${layout.label.y}`)).size, 3);
});

test("self channels render visible loops with labels", () => {
  const document = architecture({
    channels: [{ id: "loop", name: "Loop", summary: "Self reference.", source_system_id: "first", target_system_id: "first", fields: [] }],
  });
  const [layout] = layoutChannels(document);
  assert.match(layout.path, /^M .* C /);
  assert.equal(layout.path, selfChannelLoopPath(placeSystems(document)[0]));
  assert.ok(layout.label.y < placeSystems(document)[0].y);
});

test("unknown endpoints are rejected by detection and layout", () => {
  const document = architecture({
    channels: [{ id: "missing", name: "Missing", summary: "Invalid.", source_system_id: "first", target_system_id: "unknown", fields: [] }],
  });
  assert.deepEqual(unknownEndpointChannels(document).map((channel) => channel.id), ["missing"]);
  assert.equal(layoutChannels(document)[0].unknownEndpoint, true);
});
