# Ventures

## Summary
The Ventures feature adds a Supabase-backed tracking surface to the left-side dev interface so the user and AI can manage venture rows alongside the existing agent chat workflow, including tagging each venture to a project directory and storing optional details.

## Key Points
- **Tabbed Dev Interface**: Ventures lives as a second tab inside the existing left dashboard panel instead of introducing a new floating surface.
- **Supabase Persistence**: Venture rows load from the `ventures` table on dashboard mount and persist across page refreshes.
- **Simple Venture Schema**: Each Venture stores `created_at`, `id`, `progress_state`, `venture_name`, plus optional `project_directory` and `details` fields.
- **Browser REST Flow**: The frontend uses direct Supabase REST `fetch` calls with the anon key for venture list, create, update, and delete operations.
- **Three-State Progress**: Venture progress is tracked with the `venture_progress_state` enum values `idle`, `in progress`, and `completed`.
- **Project Tagging**: Ventures can be tagged to the project directory they belong to and that tag can be edited from the Ventures tab.
- **Details Field**: Ventures can include a lightweight freeform details section that is created, edited, and loaded from Supabase.

## Relevant Files
- `daedalus-site/app/feature-files-dashboard.tsx`: Dashboard shell that hosts the Agent Chat and Ventures tabs in the left dev interface.
- `shared/database/migrations/004_create_ventures_table.sql`: Creates the `venture_progress_state` enum and the `ventures` table.
- `shared/database/migrations/005_enable_ventures_rls.sql`: Enables venture row level security policies for anon browser CRUD access.
- `shared/database/migrations/006_add_project_directory_to_ventures.sql`: Adds the optional venture project tag and details columns.
- `shared/database/schema.sql`: Checked-in schema snapshot that includes the current ventures table definition and policies.

## Dev Mode
HACKING

## State Log
- 2026-07-05: Initialized the Ventures feature file for the local-only collaborative workspace tab in the left-side dev interface.
- 2026-07-05: Added a tabbed left-panel Ventures workspace with local React state, card-stack editing, completion toggles, and deletion while keeping the existing agent chat flow unchanged behind its own tab.
- 2026-07-06: Replaced the local-only Ventures cards with Supabase-backed venture loading and CRUD against a new `ventures` table plus enum-based progress tracking.
- 2026-07-06: Added project-directory tagging to ventures with a follow-up migration and small dashboard form updates so each venture can be assigned to a project.
- 2026-07-06: Expanded migration `006` and the Ventures dashboard so each venture can also store and edit an optional freeform details section.
