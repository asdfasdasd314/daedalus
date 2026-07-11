# Feature Search / Fuzzy Finder

## Summary
The feature search fuzzy finder is a keyboard-accessible overlay in the Next.js graph workspace. It uses `fuse.js` for client-side fuzzy matching across feature titles, paths, markdown content, and project labels built from the already-loaded `FeatureFileProjects` payload, with a scope control for all projects or one selected project.

## Key Points
- **Client-Only Index**: Search records are derived in the browser from dashboard-loaded feature files; no daemon or API changes are required.
- **Weighted Matching**: Fuse favors feature title and path over markdown body content, with modest typo tolerance and a capped result list.
- **Scope Control**: Default scope is all projects; choosing a project filters the same index to that project's features.
- **Selection Ownership**: Result selection is owned by the workspace shell, which reuses `handleFeatureNodeSelect` to open the existing feature-detail overlay.
- **Keyboard First**: `⌘K` / `Ctrl+K` opens the finder; arrows, Enter, and Escape navigate and dismiss.

## Relevant Files
- `daedalus-site/app/feature-search-dialog.tsx`: Dialog UI, Fuse indexing, scope filtering, and keyboard navigation.
- `daedalus-site/app/feature-workspace-utils.ts`: Shared search-record builder and feature/path/label helpers.
- `daedalus-site/app/feature-files-dashboard.tsx`: Finder visibility, shortcut lifecycle, menu action, and selection wiring.
- `feature_files/feature-first-graph-workspace-shell.md`: Shell overlay that mounts and routes into the finder.
- `parameter_files/feature-search-fuzzy-finder.toml`: Sibling parameter file placeholder for the finder feature.

## Dev Mode
HACKING

## State Log
- 2026-07-11: Initialized the feature-search fuzzy finder feature file for the graph workspace command-palette overlay.
- 2026-07-11: Shipped the Fuse-backed FeatureSearchDialog with all/project scope, ⌘/Ctrl+K, and shell selection wiring.
