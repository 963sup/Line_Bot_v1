# integration-supabase

- Semantic owner: supabase-integration
- Owner contract: [supabase-integration](../../docs/owners/supabase-integration.md)
- Module kind: integration-adapter
- Architecture: [registry.json#modules](../../architecture/registry.json#modules)

This integration owns Supabase SDK bootstrap and local Docker stack tooling. File owns hashes, write/readback semantics, authority and errors. The sole application declarative schema root is [src/schemas/](src/schemas/).

Public runtime entry:

```text
src/storage-client.ts  # Supabase SDK bootstrap for the File-owned adapter
```

Local stack lifecycle is owned by [scripts/local-stack.mjs](scripts/local-stack.mjs). The CLI reads [supabase/config.toml](supabase/config.toml) using this package as its workdir; application SQL remains in [src/schemas/](src/schemas/). There is no migration directory or replay history.

From the repository root: `pnpm provider:supabase start`, `pnpm provider:supabase verify`, `pnpm provider:supabase status`, and `pnpm supabase:stop`. Bootstrap uses the same lifecycle entry point. Docker must already be supplied by the host; no second daemon is installed.

The default stack runs Database, Auth, REST, Storage and Gateway. `start --full` enables optional services and requires at least 20 GiB free. First minimal startup requires at least 8 GiB free; initialization applies current application SQL atomically. Existing schema/data is preserved; a changed schema fingerprint requires explicit reconciliation rather than an automatic reset. The fingerprint is a local current-state checkpoint, not database migration history.

On Docker `vfs`, bootstrap installs checksum-verified `crane` and exports the pinned official PostgreSQL image by digest into a single filesystem layer. It preserves the image startup configuration and records its source digest; it changes neither the database binaries nor Docker's storage driver. This avoids the large temporary layer copies produced by a normal `vfs` pull. Other drivers use the normal image path. The CLI/image version mapping in the lifecycle script must be updated together with the CLI pin.

Managed containers inherit proxy settings. BusyBox `wget` does not honor `NO_PROXY`, so the package adds [a loopback-only health-probe wrapper](supabase/loopback-wget.sh) to the pinned Auth and Storage images. External requests keep their proxy and TLS configuration. Cached official filesystems are exported locally, their startup metadata and source digest are retained, and only the temporary preparation container and replaced unshared image are removed. Health checks remain enabled.

Run `source packages/integration-supabase/.temp/local.env` before local app/test commands. This generated file contains only local stack credentials, has mode 0600, and overrides hosted connection variables only in the sourcing shell. CLI logs are private under `.temp/cli.log`; public status output redacts credentials. Do not attach raw CLI logs to reviews.
