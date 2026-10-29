# Quality attributes

本頁只記錄跨系統取捨；執行規則由 [system invariants](../../rules/system-invariants.md)、[dependency boundaries](../../rules/dependency-boundaries.md)、[validation evidence](../../rules/validation-evidence.md) 與 repository `AGENTS.md` 擁有。

## Priority

1. Business integrity + authorization/isolation
2. Replay safety + recovery + traceability
3. Simplicity + maintainability
4. Availability without violating 1–3
5. Performance/resource efficiency
6. Scalability only with demand/capacity evidence

## Current trade-offs

| Conflict | Default decision |
|---|---|
| Availability vs business truth | Do not silently write to a second authority when the primary store is unavailable. |
| Convenience vs authorization | UI state, prior success, client role, and provider session never replace server recheck. |
| Fast retry vs duplicate safety | Unknown result uses the original request identity and readback; never invent a second command. |
| Cache speed vs freshness/isolation | Private business data is not authoritative in a cache without an explicit invalidation contract. |
| Flexibility vs evidence | Confirm a real consumer/variation before adding a facade, compatibility layer, event bus, or framework. |
| Long transaction vs external availability | Commit bounded business state first; keep LINE/Google/AI calls outside DB locks with retry/readback. |
| Premature scale vs maintainability | Do not pre-split services, databases, or workflows without measured demand. |

## Design rules

- Integrity means all effects required by one business command (authorization, version, state, ledger/event/receipt) remain coherent; HTTP 200 is not business success.
- Recovery means authoritative state can be determined or read back; it never creates a second writable business truth.
- Keep one name and one owner per concept. Prefer an existing owner function/port over a new generic layer.
- Measure before cache, batch, index, read model, or distributed scaling. Optimization must not weaken authorization, transaction, replay, version, or isolation guarantees.

## Evidence boundary

Static source/schema, tests, build, deployment, provider synchronization, and browser/LINE acceptance are separate evidence levels. A design document or local check cannot claim a remote or device outcome. Any numeric SLO must state workload, environment, measurement, business consequence, and owner.

Related: [runtime routes](../runtime/routes.md), [cache policy](../data/cache.md), [request authorization](../../rules/request-authorization.md), [external effects](../../rules/external-effects.md).
