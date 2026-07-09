# Feature-First Graph Workspace Shell

## Summary
The feature-first graph workspace shell owns the responsive workspace framing around the feature graph in the Next.js frontend. It keeps the graph mounted as the background canvas, routes the ventures drawer and primary overlays, surfaces compact utility controls, and reuses the shared agent session UI for both new-feature creation and node-focused feature editing.

## Key Points
- **Graph-First Default**: The feature graph remains visible as the base workspace on desktop and mobile instead of living under a persistent left control panel.
- **Overlay Routing**: The shell owns `venturesDrawerOpen`, the active primary overlay, the selected feature session, and the current feature-detail tab.
- **Responsive Rules**: On mobile, only one overlay can stay open at a time, while desktop can keep the ventures drawer open beside the graph.
- **Shared Chat Session UI**: The shell mounts the same agent session panel in both the new-feature overlay and the feature-detail chat tab so prompt transport stays unchanged.
- **Workspace Utilities**: A compact refresh control, inline load-error state, and sign-out live in a utility area instead of a persistent message HUD or settings panel.
- **Mobile Fit Policy**: The shell keeps mobile overlays viewport-safe by relying on compact project labels in the shared chat panel and by leaving the graph mounted behind full-screen-ish sheets instead of shifting the whole workspace layout sideways.

## Relevant Files
- `daedalus-site/app/feature-files-dashboard.tsx`: Main workspace shell that owns overlay routing, responsive layout rules, venture drawer presentation, and feature-detail tabs.
- `daedalus-site/app/agent-session-panel.tsx`: Shared chat session UI reused by the new-feature and feature-detail overlays.
- `daedalus-site/app/feature-workspace-utils.ts`: Shared feature-path and feature-label helpers used across the shell overlays.
- `parameter_files/feature-first-graph-workspace-shell.toml`: Sibling parameter file placeholder for the workspace shell feature.

## Dev Mode
HACKING

## State Log
- 2026-07-09: Initialized the workspace-shell feature file for graph-first overlay routing, responsive venture drawer behavior, and shared chat overlay reuse.
- 2026-07-09: Replaced the shell's load-dev-environment label with a refresh action and stopped repeated node presses from toggling the feature-detail overlay closed.
- 2026-07-09: Swapped the shell refresh action from text into a compact icon button so the upper-right utility cluster reads like a lightweight workspace control.
- 2026-07-09: Removed the top message and workspace HUD cards in favor of a compact refresh-plus-sign-out utility strip, a derived load-state spinner, and an inline shell error pill that stays out of the graph's way on mobile.
- 2026-07-09: Kept the shell's mobile overlays graph-first while the shared chat panel now clips long project labels and the graph owns a custom centered zoom rail plus pan-first touch behavior underneath.
