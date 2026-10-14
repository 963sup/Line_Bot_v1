# Insights constraints

Inherits [packages](../AGENTS.md). Authority: [Insights owner](../../docs/owners/insights.md).

- Insights composes read-only owner queries; no writable business Aggregate or private source-table access.
- Current access is rechecked by source owners. Source authorization failure fails the whole query closed.
- A failed source is unavailable, never zero or fabricated historical completeness.
- Issue CLOSED, local completed, WBS Baseline and deliverable acceptance retain independent meaning.
- Persisted caches, additional sources and technology adapters require actual consumer evidence.
