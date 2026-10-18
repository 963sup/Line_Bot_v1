# Object constraints

Inherits [packages](../AGENTS.md). Object owns Repository-scoped native content instances, classifications, immutable content revisions, and Object-to-Object relationships.

- Repository owns the container, current access, and archive state; Object revalidates that public scope in every read and mutation transaction.
- Object Type classifies content but does not define another bounded context's workflow.
- Object and Relationship identities survive revision changes. Revisions are immutable; restoring content creates a new revision.
- Cross-context references pin an Object revision and remain owned by the consuming context.
- Runtime access to immutable revisions is read-only except for insertion of a new committed revision.
