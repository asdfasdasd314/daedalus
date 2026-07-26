# Local Daemon Feature File Scanner

## Summary
The local daemon feature scanner starts at `Path.cwd()`, finds every descendant project containing a `feature_files` directory, and returns a dictionary keyed by project root path with raw markdown file contents as values. The frontend requests the scanner's feature-file and paired parameter-file payloads automatically once an authenticated client session starts, while retaining manual refresh.

## Key Points
- **Compatibility**: A project is considered compatible when it contains a directory literally named `feature_files`.
- **Scan Root**: The scan starts at the current working directory unless a caller passes an explicit root path for testing.
- **Stable Keys**: Project keys use full resolved paths so duplicate folder names do not collide.
- **Markdown Loading**: Every `.md` file under each `feature_files` directory is read recursively and returned as raw UTF-8 text.
- **Deterministic Order**: File paths are sorted before reading so the output stays stable across runs.
- **Project Boundary**: Once a descendant containing `feature_files` is found, the scanner stops there; when the execution root itself is a project, only its immediate child projects are additionally inspected.
- **Startup Loading**: The frontend sends the existing feature-file and parameter-file load requests once for each signed-in user, so the workspace populates without a manual refresh.
- **Bounded Snapshots**: Scanner-owned byte and file-count limits retain normal one-time payloads while replacing overflow content with an explicit path, heading, byte-size, and omission manifest.
- **Contained Detail Reads**: Explicit file reads resolve beneath the selected project root and reject traversal, missing files, and responses over the individual-file byte limit.

## Relevant Files
- `local-daemon/src/daedalus_daemon/scanner.py`: Recursive filesystem scanner for compatible projects and markdown loading.
- `local-daemon/src/daedalus_daemon/main.py`: Importable daemon entrypoint that returns the scanner output.
- `local-daemon/tests/test_scanner.py`: Coverage for discovery, ordering, filtering, and key collision behavior.
- `daedalus-site/app/feature-files-dashboard.tsx`: Starts the existing daemon load flow when an authenticated frontend session becomes available.

## Dev Mode
HACKING

## State Log
- 2026-07-03: Implemented the recursive scanner, wired the daemon entrypoint to it, and verified deterministic project aggregation with unit tests.
- 2026-07-13: Added an info-level timing log for each directory visited while locating feature-file directories.
- 2026-07-13: Restored legacy daemon protocol exports so the scanner verification suite can import its existing public interface.
- 2026-07-13: Added one-time authenticated frontend startup requests for feature-file and parameter-file payloads.
- 2026-07-13: Restored daemon package exports and aligned protocol assertions so startup-loading verification covers the current review/complete message flow.
- 2026-07-13: Resolved the integration by retaining both per-directory timing logs and authenticated startup loading with compatible daemon protocol tests.
- 2026-07-13: Configured the daemon entrypoint's root logger at INFO so feature-file scan timing benchmarks reach the daemon terminal.
- 2026-07-13: Removed per-directory scan logging and made each discovered `feature_files` directory a traversal boundary, preventing scans of project internals.
- 2026-07-14: Added UTF-8 individual, aggregate, and file-count snapshot bounds with overflow manifests and a project-contained bounded file-read primitive.
- 2026-07-26: Added direct-child discovery beneath a project execution root while preserving deeper-project and linked-worktree exclusions.
