# Actions
Project business automation for two fixed WBS flows. Repository automation remains R1 transfer-only. See [owner contract](../../docs/owners/actions.md), [semantic model](../../architecture/semantic-model.json) and [module topology](../../architecture/implementation-topology.json).

Domain owns fixed rule/run transitions; Application coordinates commands and bounded worker steps through Contracts. Persistence supplies durable versions, event receipts, attempts and fenced leases under current Project scope. Composition exposes the concrete store. Internal hosts wire Project, WBS and Notifications public capabilities.

The Actions package is consumed through its public exports and Web composition. No standalone Actions CLI, screen, scheduler or arbitrary script engine is provided.
