# Supabase operation scripts

- Scripts separate schema source/rebuild, local verification, remote reconciliation and remote mutation; a successful local check never proves remote convergence.
- Remote operations require exact project identity, explicit target, preconditions, bounded transaction/timeout, least-privilege connection, post-write readback and reconciliation evidence.
- Preserve current schema authority in `supabase/schemas/`; migration history remains replay/recovery evidence and must not silently replace the current source.
- `prepare` is additive preserve-data expansion/preflight only: it may lock, validate, backfill from explicit evidence and add current-compatible surface, but it must not drop/rename legacy authority, guess business metadata or authorize destructive contract. Destructive/data-sensitive convergence remains explicit `Supabase Replace` responsibility.
- Failure after an external write is an unknown result until independently read back; never retry with a new request identity without owner-specific idempotency and reconciliation.
