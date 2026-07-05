# Local Daemon Feature File Scanner

## Summary
The local daemon feature scanner starts at `Path.cwd()`, finds every descendant project containing a `feature_files` directory, and returns a dictionary keyed by project root path with raw markdown file contents as values. It keeps project introspection local and lightweight for the daemon layer.

## Key Points
- **Compatibility**: A project is considered compatible when it contains a directory literally named `feature_files`.
- **Scan Root**: The scan starts at the current working directory unless a caller passes an explicit root path for testing.
- **Stable Keys**: Project keys use full resolved paths so duplicate folder names do not collide.
- **Markdown Loading**: Every `.md` file under each `feature_files` directory is read recursively and returned as raw UTF-8 text.
- **Deterministic Order**: File paths are sorted before reading so the output stays stable across runs.

## Relevant Files
- `local-daemon/src/daedalus_daemon/scanner.py`: Recursive filesystem scanner for compatible projects and markdown loading.
- `local-daemon/src/daedalus_daemon/main.py`: Importable daemon entrypoint that returns the scanner output.
- `local-daemon/tests/test_scanner.py`: Coverage for discovery, ordering, filtering, and key collision behavior.

## Dev Mode
HACKING

## State Log
- 2026-07-03: Implemented the recursive scanner, wired the daemon entrypoint to it, and verified deterministic project aggregation with unit tests.
