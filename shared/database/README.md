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

## Task-only orchestration contract

Migration 039 completes the task-scoped integration cutover. Durable tasks are the
only scheduling, integration, retry, event, review, and manager-drain unit in the
live schema. The migration aborts when retired orchestration rows have not been
drained, then removes their tables, columns, RPCs, event identity, browser fields,
and manager blocker contributions without using broad cascade drops. Historical
migrations remain unchanged as the deployment audit trail; `schema.sql` describes
only the current task-scoped contract.
