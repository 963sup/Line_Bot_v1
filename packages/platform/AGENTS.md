# @line-work/platform

- 本 package 擁有跨 context 的技術性 support 能力；不是 business Bounded Context，也不得取得 business authorization ownership。
- Redis coordination implementation 由 `adapters/redis` 擁有，public consumer 只可使用 `@line-work/platform/adapters/redis`。
- Redis 只承接有限 TTL 的 rate limiting／webhook claim 等短期 coordination；PostgreSQL 仍是 business idempotency、ledger、Member qualification 與 durable record authority。
- 必須保留 TLS requirement、bounded timeout/cooldown、hashed identifier、namespace validation、TTL、single-winner claim、owner-token completion 與 stale-owner rejection。
- Redis unavailable 時不得退回 process-local Map 冒充跨 instance guarantee；不得新增 destructive scan/FLUSHDB 行為。
- `adapters/supabase`、`adapters/migration` 與 `testing/postgres` 目前仍是 transition facades；不得因 Redis 收斂而混入其 Data Boundary migration。
- PostgreSQL support is runtime mechanism only: preserve Supavisor transaction-mode assumptions, reduced application role, local statement timeout and explicit transaction boundary when touching database helpers.
- `testing/postgres` is test-only public surface. Product runtime cannot import it, and package AGENTS must not use it as evidence that remote schema, RLS, privileges or deployment are synchronized.
