# Resources constraints

Resources owns the existing `Object*` transport/storage model. Preserve public routes, DTO keys,
SQL identifiers, revision/receipt formats and Issue pins when changing source placement. Content
only supplies bounded title/body values; it does not own resource identity, graph or persistence.

Inherits [packages](../AGENTS.md). Resource owns Repository-scoped native content instances, classifications, immutable content revisions, and Resource-to-Resource relationships.

- Repository owns the container, current access, and archive state; Resource revalidates that public scope in every read and mutation transaction.
- Resource Type classifies content but does not define another bounded context's workflow.
- Resource and Relationship identities survive revision changes. Revisions are immutable; restoring content creates a new revision.
- Cross-context references pin an Resource revision and remain owned by the consuming context.
- Runtime access to immutable revisions is read-only except for insertion of a new committed revision.

- Resource also owns immutable measure definitions, revision quantity snapshots and typed engineering structure; the quantity/allocation contract is defined in [Resource](../../docs/owners/resources.md). Repository transaction serialization, authorization and exact legacy replay remain unchanged.
