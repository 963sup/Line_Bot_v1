# Sources of truth

Conflicting answers use the authority below; do not load more background first.

| Question | Authority |
| --- | --- |
| Current source behavior | source + tests |
| GitHub GraphQL domain semantics | `architecture/fpt/*.json` (exact pinned github/docs FPT mirror) |
| Product owner/relationship/invariant/capability/implementation expectation | `architecture/registry.json#domain` |
| Module path/kind/dependency allowlist | `architecture/registry.json#modules` |
| Persisted relation owner/schema mapping | `architecture/registry.json#data` |
| PostgreSQL DDL/constraint/RLS | `packages/integration-supabase/src/schemas/` |
| Public package API | owner `package.json#exports` |
| Global login lifecycle / root reservation / selected path contract | `packages/namespace/src/domain/namespace.ts` / `packages/namespace/src/domain/root.ts` / `packages/namespace/src/domain/routes.ts`；actual delivery evidence remains App Router source |
| Commands/versions | root `package.json`, lockfile, runtime config |
| Scoped Agent constraints | root + nearest `AGENTS.md` |
| Owner rule not inferable from machine truth | `docs/owners/<owner>.md` |
| FPT provenance / integrity | `architecture/fpt-source.json` |
| Current unresolved work | Owning package, issue or PR |
| Deployment/provider/device reality | dated readback |
| Validation / provider evidence | CI, provider readback and deployment artifacts |

Markdown explains meaning/constraints/decisions/operations; machine facts are not maintained twice. GitHub-derived domain semantics apply directly from the vendored FPT truth whether or not a capability is implemented locally; `registry.json#domain` may add Line_Bot_v1 ownership/invariants/implementation state but cannot redefine or gate that FPT truth.

Bounded source reads, package exports and tests are read-only evidence of the current source/config/manifest snapshot. They help locate evidence; they do not own business meaning, prove runtime behavior or become an additional source of truth. Rebuild any temporary output from source rather than maintaining an independent index.
