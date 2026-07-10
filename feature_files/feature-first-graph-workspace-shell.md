# Feature-First Graph Workspace Shell

## Summary
The feature-first graph workspace shell owns the responsive workspace framing around the feature graph in the Next.js frontend. It keeps the graph mounted as the background canvas, routes the ventures drawer and primary overlays, surfaces a compact hamburger menu for refresh, physics, zoom-rail visibility, and sign-out controls, reuses the shared agent session UI for both new-feature creation and node-focused feature editing, and depends on true SVG-space coordinate mapping so mobile taps stay aligned when the graph is letterboxed inside the fullscreen shell.

## Key Points
- **Graph-First Default**: The feature graph remains visible as the base workspace on desktop and mobile instead of living under a persistent left control panel.
- **Overlay Routing**: The shell owns `venturesDrawerOpen`, the active primary overlay, the selected feature session, and the current feature-detail tab.
- **Responsive Rules**: On mobile, only one overlay can stay open at a time, while desktop can keep the ventures drawer open beside the graph.
- **Device Zoom Profiles**: The shell chooses separate mobile and desktop zoom defaults and bounds so smaller screens stay closer to the same graph world instead of zooming the node system itself.
- **Shared Chat Session UI**: The shell mounts the same agent session panel in both the new-feature overlay and the feature-detail chat tab so prompt transport stays unchanged.
- **Workspace Utilities**: A compact hamburger menu now owns refresh, physics, and sign-out actions while the inline load-error state stays in the same utility area instead of a persistent message HUD or settings panel.
- **Zoom Visibility Toggle**: The same hamburger menu can hide or restore the graph's right-edge zoom slider while leaving wheel, pinch, and keyboard zoom paths active.
- **Physics Toggle Ownership**: The shell owns the current graph-physics enablement flag and passes it into the graph so the menu can freeze or resume node motion without changing the graph's drag and zoom affordances.
- **Mobile Fit Policy**: The shell keeps mobile overlays viewport-safe by relying on compact project labels in the shared chat panel and by leaving the graph mounted behind full-screen-ish sheets instead of shifting the whole workspace layout sideways.
- **Mobile Hit Alignment**: The shell's fullscreen mobile mount depends on the graph converting touch and wheel coordinates through the SVG's actual transformed space instead of proportional element-rect math, because the preserved `viewBox` can letterbox on tall screens.
- **Drawer Label Consistency**: The shell reuses the shared root-relative project label helpers inside the ventures drawer so project tags match the chat panel instead of exposing absolute daemon paths.

## Relevant Files
- `daedalus-site/app/feature-files-dashboard.tsx`: Main workspace shell that owns overlay routing, responsive layout rules, venture drawer presentation, and feature-detail tabs.
- `daedalus-site/app/feature-file-graph.tsx`: Graph canvas that the shell mounts full-screen, including the zoom rail that the shell can hide or restore.
- `daedalus-site/app/agent-session-panel.tsx`: Shared chat session UI reused by the new-feature and feature-detail overlays.
- `daedalus-site/app/feature-workspace-utils.ts`: Shared feature-path and feature-label helpers used across the shell overlays.
- `parameter_files/feature-first-graph-workspace-shell.toml`: Sibling parameter file placeholder for the workspace shell feature.
- `parameter_files/feature-file-graph-display.toml`: Graph-owned zoom profile values that the shell reads to choose mobile and desktop framing.

## Dev Mode
HACKING

## State Log
- 2026-07-09: Initialized the workspace-shell feature file for graph-first overlay routing, responsive venture drawer behavior, and shared chat overlay reuse.
- 2026-07-09: Replaced the shell's load-dev-environment label with a refresh action and stopped repeated node presses from toggling the feature-detail overlay closed.
- 2026-07-09: Swapped the shell refresh action from text into a compact icon button so the upper-right utility cluster reads like a lightweight workspace control.
- 2026-07-09: Removed the top message and workspace HUD cards in favor of a compact refresh-plus-sign-out utility strip, a derived load-state spinner, and an inline shell error pill that stays out of the graph's way on mobile.
- 2026-07-09: Kept the shell's mobile overlays graph-first while the shared chat panel now clips long project labels and the graph owns a custom centered zoom rail plus pan-first touch behavior underneath.
- 2026-07-09: Moved mobile-vs-desktop graph framing into explicit zoom profiles so the shell can keep the same absolute node world while defaulting phones closer in and allowing deeper zoom for small nodes.
- 2026-07-09: Tightened the ventures sheet to hide horizontal overflow and reused the shared root-relative project labels there so mobile drawer content stays inside the viewport without showing absolute paths.
- 2026-07-09: Fixed the mobile graph tap dead-zone by routing pointer and wheel coordinates through the SVG's transformed screen matrix so fullscreen letterboxing no longer shifts node hit testing or zoom anchoring.
- 2026-07-09: Replaced the top-right refresh and sign-out pair with a single hamburger menu that now also toggles shell-owned graph physics and keeps the shell error pill stacked underneath it.
- 2026-07-09: Added a hamburger-menu zoom visibility toggle that can slide the graph's right-edge zoom rail offscreen without affecting pinch or wheel zoom.
- 2026-07-09: Raised mobile ventures and primary overlay sheets to `z-30` so their close controls sit above the `z-20` workspace hamburger instead of overlapping underneath it.
- 2026-07-10: Removed the fullscreen graph viewport dead zone by measuring the SVG, sizing its viewBox and culling bounds responsively, and preserving the centered world point across browser resizes.
