# integration-supabase

- Semantic owner: supabase-integration
- Owner contract: [supabase-integration](../../docs/owners/supabase-integration.md)
- Module kind: integration-adapter
- Architecture: [registry.json#modules](../../architecture/registry.json#modules)

Supabase server Storage SDK bootstrap only. File owns hashes, write/readback semantics, authority and errors. Native Supabase assets and the sole declarative schema root are under [src/schemas/](src/schemas/).

Public runtime entry:

```text
src/storage-client.ts  # Supabase SDK bootstrap for the File-owned adapter
```

Supabase CLI/native assets and the sole declarative schema root are grouped directly under `src/`; there is no `src/supabase/` wrapper.
