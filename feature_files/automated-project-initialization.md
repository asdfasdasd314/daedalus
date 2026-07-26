# Automated Project Initialization

## Summary
Authenticated users can request a Daedalus-compatible project beneath the execution daemon's manager-selected root. The daemon validates a project slug, materializes initializer-owned templates in an atomic sibling directory, installs Graphify integrations, creates the initial Git commit, and can optionally create and push a private GitHub repository.

## Key Points
- **Daemon-Owned Destination**: The browser submits only a project name and GitHub opt-in; the execution daemon resolves the destination beneath its current working directory.
- **Atomic Local Creation**: Preflight runs before content creation, local initialization happens in a validated temporary sibling, and an atomic rename publishes the completed project.
- **Recoverable Requests**: A request marker under `.git/` lets retries recognize initializer-owned projects without deleting or overwriting unrelated content.
- **Progress Protocol**: Structured running and terminal results are published through the user-scoped communication and payload review protocol.
- **Local by Default**: GitHub creation is optional, private, and disabled unless the user explicitly checks the control.

## Relevant Files
- `local-daemon/src/daedalus_daemon/project_initializer.py`: Validation, templates, commands, cleanup, recovery, and result construction.
- `local-daemon/templates/project-initializer/`: Base Daedalus project assets.
- `daedalus-site/app/project-initializer-panel.tsx`: Authenticated initialization form and progress UI.
- `daedalus-site/app/project-initialization-utils.ts`: Shared frontend validation and result helpers.
- `supabase/migrations/043_automated_project_initialization.sql`: Protocol, manager-root, and payload schema changes.
- `parameter_files/automated-project-initialization.toml`: Initializer-owned settings.

## Dev Mode
HACKING

## State Log
- 2026-07-26: Implemented daemon-authoritative atomic project initialization with structured progress, optional private GitHub creation, discovery refresh, and authenticated workspace controls.
