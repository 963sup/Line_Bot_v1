# supabase-integration

Integration owner for external platform protocol only. Canonical schema, environment, operator and provider content lives in [`packages/integration-supabase/src/README.md`](../../packages/integration-supabase/src/README.md); this owner document only states the ownership boundary.

Server-side Supabase Storage SDK client setup; File owns object semantics, verification and error mapping.

- The application composition root injects adapters through existing business Ports.
- Credentials remain server-only. No database schema, authorization or Contract confirmation is owned here.
- See `architecture/registry.json#modules` for allowed dependencies.
