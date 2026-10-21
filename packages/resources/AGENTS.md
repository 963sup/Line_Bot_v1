# Resources constraints

## Current ownership

Resources owns physical Location, Equipment and Material identity/lifecycle. New physical resource
capabilities have immutable revisions and a public reference reader. Content owns work structure
and planned quantities; it is no longer a text support dependency. The rules below preserve legacy
Object history and consumers until explicit classification and verified cutover. Do not infer
physical identity from legacy names, units or mutable types. New physical resource code does not
own Content structure or Execution actuals.

## Legacy Object constraints

Resources preserves the existing `Object*` transport/storage model until explicit data cutover.
Preserve public routes, DTO keys, SQL identifiers, revision/receipt formats and Issue pins when
changing source placement. Shared text validation comes from Platform.

Inherits [packages](../AGENTS.md). Resource owns Repository-scoped native content instances, classifications, immutable content revisions, and Resource-to-Resource relationships.

- Repository owns the container, current access, and archive state; Resource revalidates that public scope in every read and mutation transaction.
- Resource Type classifies content but does not define another bounded context's workflow.
- Resource and Relationship identities survive revision changes. Revisions are immutable; restoring content creates a new revision.
- Cross-context references pin an Resource revision and remain owned by the consuming context.
- Runtime access to immutable revisions is read-only except for insertion of a new committed revision.

- Resource also owns immutable measure definitions, revision quantity snapshots and typed engineering structure; the quantity/allocation contract is defined in [Resource](../../docs/owners/resources.md). Repository transaction serialization, authorization and exact legacy replay remain unchanged.
