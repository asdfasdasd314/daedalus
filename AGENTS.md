# Daedalus Agent Instructions

## Execution Boundaries
- Never execute source code (Python, Bash, Node, scripts, or task runners) without explicit standalone user permission in the current turn. Scrapers, tests, research, directory listing, and non-mutating inspection are permitted.
- Never implement CLI or command-line arguments such as `--input` or `--mode`. Put tunable configuration in the owning feature's parameter file; keep fixed implementation details in source variables.

## Feature and Parameter Files
- Track active work in `feature_files/{feature_name}.md`; create it automatically when missing.
- Feature files must contain, in order: an H1 title, `## Summary`, `## Key Points`, `## Relevant Files`, `## Dev Mode`, and `## State Log`.
- Every feature file must have a sibling `parameter_files/{feature_name}.toml`; empty parameter files are allowed.
- Append a one-sentence engineering entry to the feature State Log before completing work.
- A feature owns only the behavior, logic, and configuration it directly implements. Imported, launched, orchestrated, or referenced features are dependencies; document their interface without duplicating their internals.
- Keep configuration with the feature that owns and interprets it. Prefer many focused feature/parameter pairs over consolidated per-file subsections.
- Parameter files are read-only runtime sources. Code must never modify them or persist runtime state into them.
- Store thresholds, toggles, strategy settings, limits, and experimental settings in the relevant parameter file. Leave fixed mathematics, formatting, and other implementation constants in source.
- Never place API keys or other secrets in parameter files because they may be shared through Supabase or GitHub.

## Development Lifecycle
- Follow the active feature's Dev Mode exactly:
  - `HACKING`: maximize straightforward readability; omit hardening, typing infrastructure, and optimization.
  - `TESTING`: add structured tests, catches, and condition validation incrementally.
  - `PRODUCTION-READY`: use complete validation, documentation, edge coverage, and clean optimized structures.
  - `DEBUGGING`: remove obscuring defensive abstractions and maximize granular logging and cross-feature tracing.
- Do not upgrade lifecycle stages without user alignment.
- In DEBUGGING, support every suspected root cause with file paths, line numbers, and function names.

## Recurrent Supabase Reads
- Prefer one-shot, user-triggered, or on-demand Supabase reads. Historical, archive, and completed data must never be polled recurrently.
- Every recurrent Supabase read must use the recurrent row review protocol and filter by the recipient state: `daemon_review` for daemon/manager work or `client_review` for browser work.
- Never use `select=*` in a recurrent read. Select only required columns, apply a bounded limit, and transfer large payload fields only from rows explicitly marked for recipient review.
- After consuming a review row, acknowledge it conditionally using both the expected review state and the row generation (`updated_at` or an equivalent monotonic version). A stale response must not complete newer work.
- Every recurrent table must enforce the four protocol values: `daemon_review`, `client_review`, `client_complete`, and `daemon_complete`, with user/state indexes supporting its recurrent query.
- New recurrent reads require migration and schema-snapshot updates plus lifecycle, idle-transfer, and stale-acknowledgement tests.
- Health, heartbeat, lease, and control-plane reads are not exempt from this protocol.

## Alignment
- Preserve unrelated user changes in dirty worktrees.
- Feature ownership includes only behavior directly implemented by the feature; referenced dependencies remain separate.
