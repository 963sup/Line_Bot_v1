# Numbering

`@line_bot_v1/numbering` owns scoped sequential Series and immutable Allocation facts. Consumers
authorize and lock their resource scope first, then call the PostgreSQL adapter with the same `Sql`
transaction used to save their resource and replay evidence.

Supported families are Repository work items, Discussions, Repository Milestones, Account Projects,
and Project Views. Each family has an explicit scope and compatible resource kind. Committed numbers
are never released or reset; transaction rollback rolls back both the allocation and counter advance.

The root export contains pure domain types and limits. `@line_bot_v1/numbering/postgres` is the only
persistence entry point and exposes allocation and resolution against a caller-owned transaction.

See the [Numbering owner contract](../../docs/owners/numbering.md), [package constraints](AGENTS.md)
and [generated semantics](SEMANTICS.md).
