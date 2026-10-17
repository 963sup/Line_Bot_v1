# WBS transfer operator

This Release-only operator activates one previously authenticated WBS transfer intent. The sole
operator input is its durable `transferId`; actor, Repository, Project, source snapshot and mapping
come from the WBS-owned intent.

Run the normal `Release` for the exact current `main` SHA first. That Release must complete full
validation, Supabase schema convergence and the exact-SHA production deployment/readback. Then use
the `WBS Transfer` workflow on `main` with the transfer UUID.

The workflow and script fail closed unless all of these remain true:

- the checked-out SHA is still current `main` immediately before remote mutation;
- the exact SHA has a successful normal Release with validation, Supabase and deployment jobs;
- `SUPABASE_URL`, `SUPABASE_CONFIRM_PROJECT` and `POSTGRES_URL_NON_POOLING` identify the same
  production project;
- Supabase reports PITR/WALG or a completed managed backup;
- the direct PostgreSQL connection is the `postgres` operator on the `postgres` database;
- the shared production reconciliation lock is held for the transfer transaction.

The operator connection never uses the runtime `POSTGRES_URL` fallback and never creates transfer
intents. Withdrawal is an authenticated WBS-owner operation; this Release operator cannot cancel or
reactivate a durable `CANCELLED` intent. The WBS owner reads the stored intent, rechecks current
source/target facts and dependent counts, and records `ACTIVE` atomically. If the connection result is unknown, rerun the same
`transferId`; the WBS owner reads the durable `ACTIVE` marker first and returns the stored mapping
without importing later Project writes.

Output contains only state, version/count fields, hashes and release identity. It does not print
credentials, WBS content, actor identity or scope mapping.
