import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDestinationPreview,
  initializationStatusText,
  normalizeProjectName,
  serializeProjectInitializationRequest,
  shouldApplyInitializationResult,
  validateProjectName,
} from "./project-initialization-utils";
import type { ProjectInitializationResult } from "./project-initialization-types";

test("normalizes and validates GitHub-compatible project slugs", () => {
  assert.equal(normalizeProjectName("  Example-Project  "), "example-project");
  assert.equal(validateProjectName("example-project"), "");
  assert.match(validateProjectName("../project"), /lowercase/);
  assert.match(validateProjectName("two words"), /lowercase/);
});

test("builds resolved and compatibility destination previews", () => {
  assert.equal(buildDestinationPreview("/work/root/", " Example "), "/work/root/example");
  assert.equal(
    buildDestinationPreview(null, "example"),
    "Daemon invocation directory/example",
  );
});

test("serializes only the approved request fields", () => {
  assert.deepEqual(serializeProjectInitializationRequest("id", " Example ", false), {
    requestId: "id",
    projectName: "example",
    createGitHubRepository: false,
  });
});

test("matches active requests and distinguishes partial success", () => {
  const result = {
    requestId: "active",
    projectName: "example",
    projectDirectory: "/tmp/example",
    status: "partial_success",
    githubUrl: null,
    error: "push failed",
    steps: [],
  } satisfies ProjectInitializationResult;
  assert.equal(shouldApplyInitializationResult("active", result), true);
  assert.equal(shouldApplyInitializationResult("stale", result), false);
  assert.match(initializationStatusText(result), /GitHub/);
});
