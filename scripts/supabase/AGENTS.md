# Supabase operation scripts

- `schema-source.mjs` reads ordered declarative SQL; `schema-local.mjs` rebuilds local desired state; `remote.mjs` compares/applies/verifies remote state; `postgres.mjs` owns SQL transport.
- Normal publication is `schema:remote sync`, only when `supabase/schemas/*.sql` changed. Apply the complete generated diff, including destructive DDL, in a transaction; do not precede it with historical compatibility or business-data conversions.
- Preserve exact project confirmation, non-pooling operator connection, TLS, timeout and advisory lock. Mutation requires validated current-main Release authorization.
- Require second diff = 0, ownership/security readback and unchanged migration-history fingerprint. No migration file/history creation, replay or repair; provider-owned auth/storage remain outside mutation scope.
- Plan/verify/recovery are explicit read-only diagnostics, never automatic work on unchanged schema. Classification is diagnostic, not a DDL approval gate.
- Do not invent business metadata. Unknown results require readback before retry; rollback/unlock must preserve the original error.
- `.artifacts/supabase-remote/` is transient evidence, not a source of truth.

Test target, lock, transaction, history and acceptance behavior locally; remote convergence requires separate readback. Contracts: [Supabase](../../docs/reference/platform/supabase.md), [Release](../../docs/reference/operations/release.md).
