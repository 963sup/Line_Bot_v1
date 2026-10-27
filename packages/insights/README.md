# Insights

Read-only Repository Pulse composition. See [owner contract](../../docs/owners/insights.md), [semantic model](../../architecture/registry.json#domain) and [module topology](../../architecture/registry.json#modules).

Application validates intervals and composes the Issue owner query; Contracts define the published result and required output capabilities. The internal host injects Repository scope and Issue metrics. No Domain Aggregate or persistence adapter is needed for this responsibility.

The authenticated Web presentation consumes the package's read-only Pulse contract. There is no standalone Insights CLI; keep identity proofs out of argv, logs and files.
