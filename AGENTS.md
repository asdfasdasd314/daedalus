# Daedalus Agent Instructions

# Recurrent Supabase Reads
- Prefer one-shot, user-triggered, or on-demand Supabase reads. Historical, archive, and completed data must never be polled recurrently.
- Every recurrent Supabase read must use the recurrent row review protocol and filter by the recipient state: `daemon_review` for daemon/manager work or `client_review` for browser work.
- Never use `select=*` in a recurrent read. Select only required columns, apply a bounded limit, and transfer large payload fields only from rows explicitly marked for recipient review.
- After consuming a review row, acknowledge it conditionally using both the expected review state and the row generation (`updated_at` or an equivalent monotonic version). A stale response must not complete newer work.
- Every recurrent table must enforce the four protocol values: `daemon_review`, `client_review`, `client_complete`, and `daemon_complete`, with user/state indexes supporting its recurrent query.
- New recurrent reads require migration and schema-snapshot updates plus lifecycle, idle-transfer, and stale-acknowledgement tests.
- Health, heartbeat, lease, and control-plane reads are not exempt from this protocol.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
