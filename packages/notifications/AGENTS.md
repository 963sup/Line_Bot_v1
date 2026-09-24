# @line-work/notifications

- Owns notification inbox, recipient-scoped read state, channel delivery and retry contract; HTTP/UI only transports and presents this contract.
- A notification references source facts but never owns issue or discussion content.
- Preserve recipient authorization, source type/id/version, delivery idempotency and failure distinction when changing adapters or projections.
- Keep PostgreSQL persistence behind this owner; consumers use public contracts and do not query notification tables directly.
