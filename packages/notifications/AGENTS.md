# @line-work/notifications

- Owns notification inbox, recipient-scoped read state, channel delivery and retry contract; HTTP/UI only transports and presents this contract.
- A notification references source facts but never owns issue or discussion content.
- Preserve recipient authorization, source type/id/version, delivery idempotency and failure distinction when changing adapters or projections.
- Keep PostgreSQL persistence behind this owner; consumers use public contracts and do not query notification tables directly.
- Missing or unavailable source data is an explicit failure/reconciliation boundary, not an empty inbox and not permission to copy the source owner's private state.
- Read state is recipient-scoped. Marking a notification read must never mutate the source fact, source lifecycle, delivery receipt, or another recipient's state.
