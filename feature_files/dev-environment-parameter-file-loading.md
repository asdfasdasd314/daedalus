# Dev Environment Parameter File Loading

## Summary
The dev environment loader expands Daedalus beyond feature-file markdown so the daemon can also discover sibling `parameter_files/*.toml` files and send them to the frontend. The dashboard now loads both payload types together, while the graph stays feature-node only and turns a matched parameter file into a typed variable-selection editor above the selected feature file.

## Key Points
- **Dual Load Tasks**: One UI action now writes both the feature-file load request and the parameter-file load request into the communications table.
- **Sibling Discovery**: Parameter files live under `parameter_files` directories and are matched to feature files by mirrored project-relative path and stem.
- **Separate Payloads**: Feature files and parameter files travel through parallel daemon scans and user-owned Supabase daemon payload rows instead of being merged into one transport object.
- **Feature-Only Graph**: The graph still renders only `feature_files/*.md` nodes so the existing layout and targeting behavior stay simple.
- **Detail Pairing**: Clicking a feature node resolves `feature_files/foo/bar.md` to `parameter_files/foo/bar.toml` and renders a typed variable selector first when it exists.
- **Typed Editing**: Parameter variables are parsed from flat TOML assignments, matched with their leading comments, and saved by sending a user-scoped command for the local daemon to rewrite the file.

## Relevant Files
- `local-daemon/src/daedalus_daemon/scanner.py`: Scans both `feature_files/*.md` and `parameter_files/*.toml`.
- `local-daemon/src/daedalus_daemon/communications.py`: Adds parameter-file message constants and frontend delivery.
- `local-daemon/src/daedalus_daemon/main.py`: Runs the extra parameter-file polling cycle alongside the feature-file load flow.
- `daedalus-site/app/feature-files-dashboard.tsx`: Sends both load tasks and tracks both payload states in the dashboard.
- `daedalus-site/app/feature-file-graph.tsx`: Hosts the feature detail panel and injects the parameter variable selector above the selected feature file.
- `daedalus-site/app/parameter-variable-selector.tsx`: Lets the user choose a parameter variable, inspect its leading-comment context, and save typed edits.
- `daedalus-site/lib/parameter-file-cache.ts`: Stores the daemon-delivered parameter-file payload.
- `daedalus-site/lib/parameter-file-parser.ts`: Parses flat TOML assignments, infers simple types, and rewrites edited values back into the file text.
- `shared/database/migrations/008_auth_scoped_daedalus.sql`: Adds the daemon payload and communications rows used for parameter payload delivery and update commands.

## Dev Mode
HACKING

## State Log
- 2026-07-06: Initialized the dev-environment parameter-file loading feature file for the dual load flow and paired feature-detail display.
- 2026-07-06: Implemented parallel parameter-file scanning and delivery, renamed the dashboard load action to dev environment, and rendered matched parameter TOML above selected feature markdown in the graph detail panel.
- 2026-07-07: Made parameter-file delivery failures non-fatal in the daemon so a missing frontend route no longer crashes the polling loop.
- 2026-07-07: Removed the top-level projects-loaded dashboard card to free horizontal space for the side panels and graph.
- 2026-07-07: Re-centered the current-message and status cards by replacing the stale three-column header grid with a centered two-card layout.
- 2026-07-07: Moved communications-table polling and writes behind a same-origin API route so dev-environment loads no longer depend on browser CORS access to Supabase.
- 2026-07-07: Replaced the raw parameter TOML view with a variable selector that parses leading comments, validates typed edits, and writes saved changes back to the matching `.toml` file.
- 2026-07-08: Moved parameter-file payload delivery and typed variable saves into user-scoped Supabase rows with local daemon execution for filesystem edits.
