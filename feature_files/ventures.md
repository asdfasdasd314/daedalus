# Ventures

## Summary
The Ventures feature adds a Supabase-backed tracking surface to the graph workspace so the user and AI can manage venture rows alongside feature exploration, including tagging each venture to a project directory, attaching related feature files, and storing optional details.

## Key Points
- **Drawer Presentation**: Ventures now opens from a left-edge graph handle into a dedicated drawer or sheet instead of living inside a tabbed left utility panel.
- **Supabase Persistence**: Venture rows load from the authenticated user's `ventures` rows on dashboard mount and persist across page refreshes.
- **Simple Venture Schema**: Each Venture stores `created_at`, `id`, `progress_state`, `venture_name`, plus optional `project_directory` and `details` fields.
- **Browser REST Flow**: The frontend uses direct Supabase REST `fetch` calls with the session access token for venture list, create, update, and delete operations.
- **Three-State Progress**: Venture progress is tracked with the `venture_progress_state` enum values `idle`, `in progress`, and `completed`.
- **Project Tagging**: Ventures can be tagged to the project directory they belong to and that tag can be edited from the Ventures tab.
- **Width Containment**: The ventures drawer treats itself as the width boundary so selects, text inputs, chip rows, and details panels stay clipped to the sheet instead of leaking past the right edge on mobile.
- **Feature Tagging**: Each venture can store multiple tagged feature-file paths from its selected project, using the same loaded Daedalus feature inventory that powers chat targeting.
- **Details Field**: Ventures can include a lightweight freeform details section that is created, edited, and loaded from Supabase.
- **Picker-Based Viewing**: The Ventures tab uses project dropdowns and a single selected-venture detail panel so the user can inspect one venture at a time instead of scrolling a full list.
- **Inline Confirmation Bulk Clear**: The Ventures drawer can bulk-delete all completed ventures, but the clear button first flips into inline `Confirm` and `Undo` actions to avoid accidental clears without leaving the current view.
- **Shared Clear Pattern**: The agent prompt chat reuses the same inline `Confirm`/`Undo` interaction for clearing persisted durable agent tasks.

## Relevant Files
- `daedalus-site/app/feature-files-dashboard.tsx`: Workspace shell that hosts the ventures drawer UI, venture CRUD flows, and project-scoped feature tagging controls.
- `shared/database/migrations/004_create_ventures_table.sql`: Creates the `venture_progress_state` enum and the `ventures` table.
- `shared/database/migrations/005_enable_ventures_rls.sql`: Enables venture row level security policies for anon browser CRUD access.
- `shared/database/migrations/006_add_project_directory_to_ventures.sql`: Adds the optional venture project tag and details columns.
- `shared/database/migrations/007_add_feature_file_paths_to_ventures.sql`: Adds the venture feature-tag path array column.
- `shared/database/migrations/008_auth_scoped_daedalus.sql`: Adds venture ownership and authenticated owner-only RLS policies.
- `shared/database/schema.sql`: Checked-in schema snapshot that includes the current ventures table definition and policies.
- `parameter_files/ventures.toml`: Sibling parameter file placeholder for the Ventures feature.

## Dev Mode
HACKING

## State Log
- 2026-07-05: Initialized the Ventures feature file for the local-only collaborative workspace tab in the left-side dev interface.
- 2026-07-05: Added a tabbed left-panel Ventures workspace with local React state, card-stack editing, completion toggles, and deletion while keeping the existing agent chat flow unchanged behind its own tab.
- 2026-07-06: Replaced the local-only Ventures cards with Supabase-backed venture loading and CRUD against a new `ventures` table plus enum-based progress tracking.
- 2026-07-06: Added project-directory tagging to ventures with a follow-up migration and small dashboard form updates so each venture can be assigned to a project.
- 2026-07-06: Expanded migration `006` and the Ventures dashboard so each venture can also store and edit an optional freeform details section.
- 2026-07-07: Swapped venture project inputs to project dropdowns and replaced the long ventures list with a selected-venture detail view.
- 2026-07-07: Added multi-feature tagging to ventures with a new Supabase array column plus project-scoped feature selectors in the create and edit flows.
- 2026-07-08: Scoped Ventures to authenticated user-owned rows so each signed-in user only sees and mutates their own venture data.
- 2026-07-09: Moved Ventures out of the old left-side tab strip and into a graph-triggered drawer that expands to near-full-screen on mobile while keeping the same Supabase-backed CRUD and tagging flows.
- 2026-07-09: Clamped the ventures drawer inputs and tag rows to the drawer width and switched venture project labels back to the same root-relative naming used by the shared feature tagger.
- 2026-07-09: Simplified the ventures bulk-clear flow so `Clear completed` flips inline into `Confirm` and `Undo` actions instead of opening a separate confirmation panel.
- 2026-07-12: Documented the shared inline confirmation pattern used by durable agent-task clearing.
- 2026-07-13: Anchored the mobile Ventures sheet to the device viewport so the graph canvas cannot shift it horizontally off-screen.
