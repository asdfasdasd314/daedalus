# Shared Database Artifacts

This directory stores the checked-in database history and the current schema snapshot.

It is also the only remaining subtree under the repo-level `shared/` folder. All non-database app config now lives with the component that owns it.

- Add every schema change as a new numbered SQL migration in `shared/database/migrations/`.
- On integration, the worktree orchestrator renumbers duplicate numeric prefixes among distinct `NNN_*.sql` filenames before combined verification.
- Update `shared/database/schema.sql` every time a migration changes the schema.
- Use the migrations when you want the full history.
- Use `schema.sql` when you want the current database structure quickly.
