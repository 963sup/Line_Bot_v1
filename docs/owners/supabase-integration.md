# supabase-integration

Integration owner for external platform protocol only.

Supabase SDK transport setup for server-side Auth and Storage, plus the browser Auth client; consuming owners retain business semantics, verification policy, authorization and error mapping.

- The application composition root injects adapters through existing business Ports.
- Credentials remain server-only. No database schema, authorization or Contract confirmation is owned here.
- Account consumes Auth user lookup through this boundary; it owns Google identity qualification and domain errors.
- See `architecture/implementation-topology.json` for allowed dependencies.
