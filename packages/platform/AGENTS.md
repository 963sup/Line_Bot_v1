# @line_bot_v1/platform
Owner: neutral cross-context runtime mechanisms with no business authority. Semantics: [Platform](../../docs/owners/platform.md).

- Redis is temporary coordination only; durable business truth remains with PostgreSQL/domain owners.
- Preserve TTL, bounded timeout, namespace/identifier protection, single-winner claim, owner-token completion, and stale-owner rejection.
- Redis failure must not fall back to process-local state when that changes distributed guarantees.
- Business-specific adapters stay with their owners; test-only surfaces are not runtime or remote-state evidence.
