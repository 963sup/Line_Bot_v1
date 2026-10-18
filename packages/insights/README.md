# Insights

Read-only Repository Pulse composition. See [owner contract](../../docs/owners/insights.md), [semantic model](../../architecture/semantic-model.json) and [module topology](../../architecture/implementation-topology.json).

Application validates intervals and composes the Issue owner query; Contracts define the published result and required output capabilities. The internal host injects Repository scope and Issue metrics. No Domain Aggregate or persistence adapter is needed for this responsibility.

Build workspaces, then invoke `pnpm insights:run` with a stdin request containing `proof` and `query`. Keep identity proofs out of argv, logs and files. The authenticated Web presentation uses the same read-only Pulse contract.
