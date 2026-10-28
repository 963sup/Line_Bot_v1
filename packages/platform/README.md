# Platform package

Routing and module overview for `@line_bot_v1/platform`.

- Semantic Owner: `platform`
- Authority document: [`docs/owners/platform.md`](../../docs/owners/platform.md)
- Machine boundaries: [`architecture/registry.json#modules`](../../architecture/registry.json#modules)
- Persistence mapping: [`architecture/registry.json#data`](../../architecture/registry.json#data)

## Scope

Cross-cutting technical utilities: clock, UUID generation, structured errors, database helpers.

## Redis boundary

Redis coordination is limited to bounded TTL concerns such as rate limiting and webhook claims. PostgreSQL remains the authority for durable business idempotency, qualification, ledger and receipts. `KV_REST_API_URL` and `KV_REST_API_TOKEN` are server-only; keys use scoped hashed identifiers, finite TTL and environment prefixes. Redis loss or expiry never becomes an exactly-once guarantee or changes an external business result. Detailed provider diagnostics and limits belong to the platform implementation and its tests; product owners retain authorization and durable state.

## Test fixture profiling

`postgresFixture()` creates an isolated PGlite database and applies the current declarative SQL schema for each fixture. To measure its phases without changing test isolation, run an affected package test explicitly with profiling enabled:

```sh
PGLITE_FIXTURE_PROFILE=1 pnpm --filter @line_bot_v1/repository test
```

Each successfully initialized fixture prints one `PGLITE_FIXTURE_PROFILE` JSON line to stderr with `startupMs` (PGlite/bootstrap), `schemaReadMs` (reading schema files), `schemaApplyMs` (applying SQL and setting the search path), `totalMs` and `schemaFileCount`. The output contains durations and counts only, not SQL or credentials. Profiling is disabled by default. Compare runs on the same revision and runner conditions before changing fixture isolation, test concurrency or Turbo cache policy.
