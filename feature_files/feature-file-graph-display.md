# Feature-File Graph Display

## Summary
The feature-file graph display turns loaded feature files into a full-screen 2D SVG node map inside the Next.js frontend. Each feature file now carries both its own path and markdown content, becomes a circular node labeled from its first H1, can draw project-scoped connections to other feature files referenced by path, and reports node selection plus shared zoom changes back to the workspace shell instead of owning the feature-detail overlay itself. The shell can also suspend or resume the graph's spring motion through an external physics flag, and it can hide the graph's right-edge zoom rail without affecting wheel, pinch, or keyboard zoom paths.

## Key Points
- **Node Labels**: The display reads the first markdown line that starts with `# ` and uses the remaining text as the node name.
- **File Identity**: Each node keeps its normalized project-relative feature-file path so markdown references can map back to exact files.
- **Project Clustering**: Feature nodes from the same project stay near one another while color, not enclosed regions, separates projects from each other.
- **Reference Connections**: The graph scans markdown for `feature_files/*.md` references and draws always-visible project-local lines between matching nodes.
- **Connection-Aware Placement**: Project layout now places referenced and connected feature files first so related nodes start in the same nearby area before isolated files fill outward.
- **Live Motion**: The graph uses a lightweight drifting layout in plain React and SVG with center-out spiral targets so dense projects stay readable.
- **Proportional Node Size**: Each node scales against the median feature-file length, so average-sized files stay near the baseline while shorter and longer files shrink or grow relative to that benchmark.
- **Hover Highlighting**: Hovering a node adds glow, scale emphasis, and an attached in-graph title pill that stays screen-stable as zoom changes.
- **Connection Intensity**: Nodes with more in-project references render with stronger glow and color intensity so densely connected features stand out faster.
- **Navigation**: The graph supports wheel zoom, ctrl/cmd zoom, touch pinch zoom, drag panning, and inertial viewport motion so the workspace can grow beyond a single screen.
- **Absolute Node Scale**: Node radii stay tied to feature-file content and graph-world coordinates rather than viewport size, so mobile sees the same graph closer in instead of rescaled nodes.
- **Responsive Node Scale**: Desktop keeps the baseline node radius while mobile applies a smaller parameterized radius so the initial phone view shows more feature nodes without changing zoom behavior.
- **Node Dragging**: Desktop pointer users can still drag nodes directly in world space, while coarse-pointer mobile sessions prioritize tap, pan, and pinch instead of node repositioning.
- **Physics Gate**: The graph's spring layout loop now respects a shell-owned enable flag so the top-right menu can freeze or resume node motion, and physics-off mode also blocks direct node repositioning without affecting hover or click selection.
- **Shell Controls**: The graph now surfaces a compact upper-left ventures trigger on mobile, a circular bottom new-feature trigger, and a custom right-edge zoom slider while keeping overlay state in the workspace shell.
- **Zoom Rail Visibility**: The shell can slide the right-edge zoom slider offscreen for a cleaner workspace view while leaving the underlying zoom mechanics intact.
- **Zoom Contract**: The graph no longer hardcodes one global zoom range and instead renders against shell-provided min/max bounds so mobile and desktop can share the same world with different readable framing.
- **Touch Sessions**: Mobile one-finger gestures always start as graph-surface pans, only resolve into node opens on clean tap release, and derive inertia from recent gesture samples instead of noisy last-frame deltas.
- **Node Selection Callback**: Clicking or tapping a node now hands feature identity back to the workspace shell through a dedicated selection path so touch sessions do not rely on inconsistent browser click timing.
- **Render Performance**: The graph culls off-screen nodes and edges, scopes collision checks per project, and uses simplified coarse-pointer node rendering without SVG blur filters while hiding inline labels until mobile zoom crosses `mobile_label_min_zoom`.

## Relevant Files
- `daedalus-site/app/feature-files-dashboard.tsx`: Workspace shell that loads the feature-file payload and responds to graph callbacks with overlays and drawers.
- `daedalus-site/app/feature-file-graph.tsx`: SVG graph component for node shaping, clustering, path-based reference edges, drift, hover, shared zoom, and shell-trigger controls.
- `daedalus-site/app/feature-workspace-utils.ts`: Shared path-normalization helpers used by the graph and overlay shell.
- `parameter_files/feature-file-graph-display.toml`: Graph zoom profile values for desktop and mobile framing.
- `local-daemon/src/daedalus_daemon/scanner.py`: Scanner that now returns project-relative feature-file paths alongside markdown contents.
- `feature_files/feature-file-communications-system.md`: Dependency reference for how feature-file payloads arrive in the frontend.

## Dev Mode
HACKING

## State Log
- 2026-07-04: Implemented the first SVG-based feature-file graph display with per-project blobs, drifting circular nodes, and title extraction from markdown H1 lines.
- 2026-07-04: Refactored the graph into a full-screen black workspace with floating HUD controls, mouse panning, color-spaced project constellations, smaller hover-reactive nodes, and smoother center-out spacing.
- 2026-07-04: Fixed duplicate node key generation and upgraded the graph to wheel-based panning, zoom, inertial viewport motion, and click-to-open feature-file details.
- 2026-07-04: Simplified the graph HUD by removing on-screen instructions and keeping the load controls in the upper-left of the graph workspace.
- 2026-07-04: Moved the hover feature-name label out of the shared HUD area and attached it directly above the hovered node in the graph.
- 2026-07-04: Made the hover title pill stay the same screen size across zoom levels while remaining anchored directly above its node.
- 2026-07-04: Increased the hover title pill text size and width so hovered feature names read more clearly without changing the node layout.
- 2026-07-05: Added drag-to-pan on the graph with the same inertial viewport motion as wheel scrolling while protecting node clicks with a drag threshold.
- 2026-07-05: Removed SVG pointer capture from drag panning so node clicks can still open the feature-file panel while drag scrolling remains available.
- 2026-07-05: Added path-aware feature-file payloads and always-visible project-scoped graph connections for markdown references to other `feature_files/*.md` files.
- 2026-07-05: Reordered each project’s spiral layout so connected feature files are placed first and stay in the same local area before isolated nodes spread outward.
- 2026-07-05: Added direct node dragging so grabbed feature circles can be repositioned by hand while connected nodes react through lightweight spring-style graph physics.
- 2026-07-05: Scaled node size from median feature-file length and boosted node visual intensity based on how many project-local connections each feature has.
- 2026-07-05: Cross-referenced the graph HUD notes with the current dashboard implementation so the feature file now reflects the centered top status strip and upper-left dev controls accurately.
- 2026-07-05: Fixed reload-time cluster lookup crashes by keeping the current graph payload mounted during refresh and skipping any transient node or edge whose cluster map has not caught up yet.
- 2026-07-05: Fixed the right-side feature-file detail panel layout so its markdown scroller uses the remaining panel height and no longer cuts off the bottom of long files.
- 2026-07-06: Added project-gated node-to-chat targeting so the detail panel can add valid feature files into the prompt-scoping chip row without allowing cross-project selections.
- 2026-07-09: Reworked the graph into a graph-first workspace surface with shell callbacks, a right-edge zoom slider, and touch-first mobile gestures while moving feature overlays out to the workspace shell.
- 2026-07-09: Added a dedicated coarse-pointer node tap path and a more circular new-feature action button so node selection feels steadier on mobile and the plus control reads like a floating action button.
- 2026-07-09: Kept touch drags on the graph surface even when they begin over nodes, preserved zoom state across pinch updates, moved the ventures trigger up and out of the main drag lane, and tightened the zoom slider styling so mobile graph control feels smoother and more centered.
- 2026-07-09: Replaced the mobile node tap path with graph-surface touch sessions, anchored pinch math to a stable viewport, sampled pan momentum from recent gesture history, and swapped the native vertical range input for a centered custom zoom rail.
- 2026-07-09: Stopped tying graph readability to one shared zoom envelope by keeping node size absolute and letting the shell feed device-specific zoom bounds from the graph parameter file.
- 2026-07-09: Increased `mobile_default_zoom` in the graph parameter file so phone layouts open closer into the same graph world by default.
- 2026-07-09: Optimized mobile graph rendering by pausing physics during gestures, using ref-driven viewport transforms, viewport culling, project-scoped collision checks, and simplified coarse-pointer node visuals without SVG blur filters.
- 2026-07-09: Reverted physics pausing and adaptive animation-loop gating after it degraded pan feel, while keeping viewport culling, project-scoped collision checks, and simplified coarse-pointer node visuals.
- 2026-07-09: Restored mobile inline node labels once zoom reaches `mobile_label_min_zoom` so feature names stay readable when zoomed into dense clusters without paying label cost at overview zoom levels.
- 2026-07-09: Added a shell-controlled physics enable flag so the graph can freeze or resume spring motion from the workspace menu while leaving drag and zoom handling intact.
- 2026-07-09: Hardened the physics-off path so nodes can no longer be repositioned by pointer drag while hover and click-to-open selection remain available.
- 2026-07-09: Added shell-driven zoom-rail visibility so the graph's right-side slider can move offscreen without changing pinch, wheel, or keyboard zoom.
- 2026-07-10: Added separate desktop and mobile node-size parameters so phone nodes start smaller, and lowered the mobile inline-label threshold to 1.0x so labels remain visible at the default phone zoom.
