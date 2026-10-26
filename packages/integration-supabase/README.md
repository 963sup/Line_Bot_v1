# integration-supabase

- Semantic owner: supabase-integration
- Owner contract: [supabase-integration](../../docs/owners/supabase-integration.md)
- Module kind: integration-adapter
- Architecture: [implementation-topology.json](../../architecture/implementation-topology.json)

Supabase server Storage SDK bootstrap only. File owns hashes, write/readback semantics, authority and errors. Native Supabase assets and the sole declarative schema root are under [src/schemas/](src/schemas/).

Runtime adapter layout:

```text
src/adapters/outbound/storage/
└─ private-storage-client.ts  # Supabase SDK bootstrap for the File-owned adapter
```

The `src/supabase/` directory is the Supabase CLI/native asset root, including the sole declarative schema root.
