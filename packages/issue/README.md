# Issue package

Routing and module overview for `@line_bot_v1/issue`.

- Semantic Owner: `issue`
- Authority document: [`docs/owners/issue.md`](../../docs/owners/issue.md)
- Machine boundaries: [`architecture/implementation-topology.json`](../../architecture/implementation-topology.json)
- Persistence mapping: [`architecture/data-topology.json`](../../architecture/data-topology.json)

## Scope

Issue canonical OPEN/CLOSED state and stateReason, title/body content, 0..N assignee relation, separate local work workflow, command replay, immutable event history, and Issue-to-Label links. Repository identity, visibility/access, participant scope, Label/Milestone definitions, and repository-scoped Issue number allocation remain Repository-owned dependencies.
