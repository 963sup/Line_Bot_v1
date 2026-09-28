# Audit

Owner: Audit target responsibility for immutable audit evidence and authorized projections. Current state is package foundation only; canonical semantics: [Audit](../../docs/owners/audit.md).

- Audit evidence never becomes business truth or authorization; originating owners remain authoritative.
- Audit reads require explicit scope, authorization, minimum-necessary disclosure, and retention.
- The requested layered scaffold has an empty public entry; keep placeholders empty until a real consumer and current-state contract exist. Do not invent runtime APIs, persistence, adapter implementations, or contracts.
- When activated, preserve the evidence fields required by the owner contract and keep replay/delivery evidence distinct from business state changes.
