# Local Daemon Feature File Scanner

## Summary
The local daemon feature scanner starts at `Path.cwd()`, finds every descendant project containing a `feature_files` directory, and returns a dictionary keyed by project root path with raw markdown file contents as values. The frontend requests the scanner's feature-file and paired parameter-file payloads automatically once an authenticated client session starts, while retaining manual refresh.

## Key Points
- **Compatibility**: A project is considered compatible when it contains a directory literally named `feature_files`.
- **Scan Root**: The scan starts at the current working directory unless a caller passes an explicit root path for testing.
- **Stable Keys**: Project keys use full resolved paths so duplicate folder names do not collide.
- **Markdown Loading**: Every `.md` file under each `feature_files` directory is read recursively and returned as raw UTF-8 text.
- **Deterministic Order**: File paths are sorted before reading so the output stays stable across runs.
- **Startup Loading**: The frontend sends the existing feature-file and parameter-file load requests once for each signed-in user, so the workspace populates without a manual refresh.

## Relevant Files
- `local-daemon/src/daedalus_daemon/scanner.py`: Recursive filesystem scanner for compatible projects and markdown loading.
- `local-daemon/src/daedalus_daemon/main.py`: Importable daemon entrypoint that returns the scanner output.
- `local-daemon/tests/test_scanner.py`: Coverage for discovery, ordering, filtering, and key collision behavior.
- `daedalus-site/app/feature-files-dashboard.tsx`: Starts the existing daemon load flow when an authenticated frontend session becomes available.

## Dev Mode
HACKING

## State Log
- 2026-07-03: Implemented the recursive scanner, wired the daemon entrypoint to it, and verified deterministic project aggregation with unit tests.
- 2026-07-13: Added one-time authenticated frontend startup requests for feature-file and parameter-file payloads.
- 2026-07-13: Restored daemon package exports and aligned protocol assertions so startup-loading verification covers the current review/complete message flow.
