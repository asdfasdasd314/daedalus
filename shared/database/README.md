# Shared Database Artifacts

This directory stores the checked-in database history and the current schema snapshot.

- Add every schema change as a new numbered SQL migration in `shared/database/migrations/`.
- Update `shared/database/schema.sql` every time a migration changes the schema.
- Use the migrations when you want the full history.
- Use `schema.sql` when you want the current database structure quickly.
