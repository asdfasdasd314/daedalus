# Daedalus Agent Instructions

# Recurrent Supabase Reads
- Prefer one-shot, user-triggered, or on-demand Supabase reads. Historical, archive, and completed data must never be polled recurrently.
- Every recurrent Supabase read must use the recurrent row review protocol and filter by the recipient state: `daemon_review` for daemon/manager work or `client_review` for browser work.
- Never use `select=*` in a recurrent read. Select only required columns, apply a bounded limit, and transfer large payload fields only from rows explicitly marked for recipient review.
- After consuming a review row, acknowledge it conditionally using both the expected review state and the row generation (`updated_at` or an equivalent monotonic version). A stale response must not complete newer work.
- Every recurrent table must enforce the four protocol values: `daemon_review`, `client_review`, `client_complete`, and `daemon_complete`, with user/state indexes supporting its recurrent query.
- New recurrent reads require migration and schema-snapshot updates plus lifecycle, idle-transfer, and stale-acknowledgement tests.
- Health, heartbeat, lease, and control-plane reads are not exempt from this protocol.