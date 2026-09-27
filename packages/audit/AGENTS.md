# Audit

Owner: Audit target responsibility for immutable audit evidence and authorized projections. Current state is package foundation only; canonical semantics: [Audit](../../docs/owners/audit.md).

- Audit evidence never becomes business truth or authorization; originating owners remain authoritative.
- Audit reads require explicit scope, authorization, minimum-necessary disclosure, and retention.
- Do not add runtime APIs, public exports, persistence, adapters, contracts, dependencies, or empty layers before a real consumer and current-state contract exist.
- When activated, preserve the evidence fields required by the owner contract and keep replay/delivery evidence distinct from business state changes.
