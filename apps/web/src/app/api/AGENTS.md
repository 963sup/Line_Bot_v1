# Web API transport boundary

- Route handlers own transport parsing, response/error mapping and composition lookup only; business lifecycle, authorization, persistence and transaction ownership remain in the owning package.
- Every route must pass explicit stable IDs, scope, expected version and request identity to the owner contract when required; URL, body role, selected UI scope or session cache is not authority.
- Keep HTTP/LINE wire contracts and failure classification stable during module moves; do not implement a second use case or query private tables from a route.
- API tests must cover unauthorized/forbidden, wrong scope, stale/replay conflict, unavailable source and unknown-result behavior where the owner supports those states.
