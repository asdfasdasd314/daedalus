# Shared Database Artifacts

This directory stores the checked-in database history and the current schema snapshot.

It is also the only remaining subtree under the repo-level `shared/` folder. All non-database app config now lives with the component that owns it.

- Add every schema change as a new numbered SQL migration in `supabase/migrations/`.
- On integration, the worktree orchestrator renumbers duplicate numeric prefixes among distinct `NNN_*.sql` filenames before combined verification.
- Update `shared/database/schema.sql` every time a migration changes the schema.
- Use the migrations when you want the full history.
- Use `schema.sql` when you want the current database structure quickly.

## Automated deployment bootstrap

Automatic deployment is owned by the local daemon and is initially disabled in
`parameter_files/supabase-migration-deployment.toml`. Before enabling it, an
operator must link the checkout to the intended project, compare the live schema
with this snapshot and compare local/remote migration history, then mark only the
confirmed historical versions as applied with Supabase migration-history tooling.
Do not run a bulk `supabase db push` against an unknown live history. A mismatch is
a blocked setup condition for human review, not an automated repair.

The one-time operator sequence is: `supabase link --project-ref "<project-ref-from-the-mapping>"`,
`supabase migration list --linked`, and a schema comparison such as `supabase db diff --linked`.
Only after those outputs have been reviewed may the operator record each verified historical
version with `supabase migration repair --status applied <version>`. Never use `repair` as an
automated resolver action and never mark a version applied merely to make a push succeed.

The daemon invokes the local Supabase CLI directly and uses its existing local
login/session. Before each task-worktree deployment, it links that worktree with
the allowlisted project ref. After the baseline is accepted, set `enabled = true` and add the exact
`resolved-repository-path::project-ref` mapping to the deployment parameter file; that
mapping selects the project ref for deployment. Run one controlled dry run before enabling a live
push. Deployment events are recorded as `migration_deployment_*`; a blocked task
retains its worktree and diagnostics. Production schema changes must use
committed files in `supabase/migrations/`; Dashboard SQL bypasses migration history
and can break automated deployment.

## Task-integration cutover

Migration 038 is intentionally additive: it installs the task-only poll and event
RPCs while leaving the legacy batch objects available to the daemon that promotes
the migration. Pause submissions, let that daemon finish and delete every legacy
batch, then restart into the task-scoped daemon. Only after the new daemon is
running may the follow-up cleanup migration drop the batch tables, columns, RPCs,
inbox fields, and manager blocker fields.
