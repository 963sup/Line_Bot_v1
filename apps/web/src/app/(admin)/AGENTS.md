# Admin route group

- Admin routes are presentation/transport entrypoints for owner-approved management capabilities; the `/admin` path never grants authority.
- Every read and mutation resolves the actual Principal, explicit scope and owner contract server-side; UI visibility and route naming are not authorization.
- Keep audit, forbidden, unavailable, conflict and unknown-result mappings explicit.
