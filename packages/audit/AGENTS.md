# Audit

- This scope is the selected owner for future Audit evidence semantics: immutable AuditEvent preservation and authorized AuditLog/query projections.
- Audit evidence does not replace or rewrite the originating Domain history, DomainEvent, command receipt, Ledger fact, or source record. Domain owners remain authoritative for the business facts that caused an audit event.
- Preserve actual Principal/actor, scope and target/subject identity, operation, reason/outcome, occurredAt, request/command identity, and required version/authority/delegation references when an activated audit capability requires them.
- Audit read surfaces must enforce explicit scope, authorization, minimum-necessary disclosure, and retention policy; Enterprise or Organization scope is not an alternate writer of the same event.
- Do not infer business authorization from the existence of audit evidence. Audit records are evidence, not permission, membership, employment, payment, or accounting truth.
- This owner scope currently has no runtime source, public export, package manifest, or dedicated persistence boundary. Do not add empty layers, adapters, contracts, dependencies, or schema for symmetry alone.
- Activate executable capability only when a real consumer and current-state contract exist; then update canonical current docs, implementation/data topology, public surface, tests, and validation evidence in the same change.
