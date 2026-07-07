# Feature-File Graph Display

## Summary
The feature-file graph display turns loaded feature files into a full-screen 2D SVG node map inside the Next.js frontend. Each feature file now carries both its own path and markdown content, becomes a circular node labeled from its first H1, can draw project-scoped connections to other feature files referenced by path, and can be added into the chat panel as a targeted prompt scope.

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
- **Navigation**: The graph supports wheel panning, drag panning, inertial viewport motion, and zoom controls so the workspace can grow beyond a single screen.
- **Node Dragging**: Clicking and dragging a node repositions it directly in world space while connection springs and repulsion nudge nearby nodes around it like a simple physics toy.
- **Node Details**: Clicking a node opens the full feature-file markdown in an overlay panel.
- **Prompt Targeting**: The right-side node detail panel now exposes an `Add` action that only works when the node belongs to the currently selected chat project, preventing cross-project feature targeting.
- **HUD Layout**: The graph keeps the load button and collapsible dev panel in the upper-left while a centered top status strip carries the current message, status, project count, and load errors.

## Relevant Files
- `daedalus-site/app/feature-files-dashboard.tsx`: Dashboard shell that loads the feature-file payload and renders the lower graph section.
- `daedalus-site/app/feature-file-graph.tsx`: SVG graph component for node shaping, clustering, path-based reference edges, drift, hover, zoom, and the right-side feature detail panel.
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
