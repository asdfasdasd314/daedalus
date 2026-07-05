# Feature-File Graph Display

## Summary
The feature-file graph display turns loaded feature files into a full-screen 2D SVG node map inside the Next.js frontend. Each markdown feature file becomes a circular node labeled from its first H1, and projects read as separate color-coded constellations across a pannable black workspace.

## Key Points
- **Node Labels**: The display reads the first markdown line that starts with `# ` and uses the remaining text as the node name.
- **Project Clustering**: Feature nodes from the same project stay near one another while color, not enclosed regions, separates projects from each other.
- **Live Motion**: The graph uses a lightweight drifting layout in plain React and SVG with center-out spiral targets so dense projects stay readable.
- **Hover Highlighting**: Hovering a node adds glow and scale emphasis without changing the communications flow or opening a details panel.
- **Navigation**: The graph supports wheel-based panning, inertial viewport motion, and zoom controls so the workspace can grow beyond a single screen.
- **Node Details**: Clicking a node opens the full feature-file markdown in an overlay panel.
- **HUD Layout**: The graph keeps the load controls minimal at the top-left while bottom-left overlays carry debug state like the current message, status, project count, and errors.
- **Frontend-Only Change**: The graph reuses the existing loaded payload and does not require daemon, API, or database changes.

## Relevant Files
- `daedalus-site/app/feature-files-dashboard.tsx`: Dashboard shell that loads the feature-file payload and renders the lower graph section.
- `daedalus-site/app/feature-file-graph.tsx`: SVG graph component for node shaping, clustering, drift, hover, zoom, and the right-side feature detail panel.
- `feature_files/feature-file-communications-system.md`: Dependency reference for how feature-file payloads arrive in the frontend.

## Dev Mode
HACKING

## State Log
- 2026-07-04: Implemented the first SVG-based feature-file graph display with per-project blobs, drifting circular nodes, and title extraction from markdown H1 lines.
- 2026-07-04: Refactored the graph into a full-screen black workspace with floating HUD controls, mouse panning, color-spaced project constellations, smaller hover-reactive nodes, and smoother center-out spacing.
- 2026-07-04: Fixed duplicate node key generation and upgraded the graph to wheel-based panning, zoom, inertial viewport motion, and click-to-open feature-file details.
- 2026-07-04: Simplified the graph HUD by removing on-screen instructions, keeping load controls at the top-left, and moving Supabase debug/status overlays to the bottom-left.
