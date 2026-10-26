# supabase-integration

Integration owner for external platform protocol only.

Server-side Supabase Storage SDK client setup; File owns object semantics, verification and error mapping.

- The application composition root injects adapters through existing business Ports.
- Credentials remain server-only. No database schema, authorization or Contract confirmation is owned here.
- See `architecture/implementation-topology.json` for allowed dependencies.
