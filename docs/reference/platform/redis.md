# Redis platform reference

Redis coordination content is owned by [`packages/platform`](../../../packages/platform/README.md) and its Redis implementation. This file is a cross-package index only.

- Runtime boundary and durable authority：[Platform package](../../../packages/platform/README.md)。
- Cache and TTL semantics：[Cache and projections](../data/cache.md)。
- LINE webhook usage：[Webhook](../line/webhook.md)。
- Production readiness：[Runtime/platform gaps](../../change/gaps/runtime-and-platform.md)。

Redis is limited to bounded TTL coordination such as rate limiting and webhook claims. PostgreSQL remains the durable business authority; Redis loss, expiry or eviction cannot be represented as exactly-once delivery or alter business results.
