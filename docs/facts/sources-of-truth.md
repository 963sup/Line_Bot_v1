# Sources of truth

Conflicting answers use the authority below; do not load more background first.

| Question | Authority |
| --- | --- |
| Current source behavior | source + tests |
| GitHub GraphQL domain semantics | `architecture/domain/fpt/*.json` (exact pinned github/docs FPT mirror) |
| Product owner/relationship/invariant/capability/implementation expectation | `architecture/semantic-model.json` |
| Module path/kind/dependency allowlist | `architecture/implementation-topology.json` |
| Persisted relation owner/schema mapping | `architecture/data-topology.json` |
| PostgreSQL DDL/constraint/RLS | `supabase/schemas/` |
| Public package API | owner `package.json#exports` |
| Global login lifecycle / root reservation / selected path contract | `packages/namespace/src/domain/namespace.ts` / `packages/namespace/src/domain/root.ts` / `packages/namespace/src/domain/routes.ts`；actual delivery evidence remains App Router source |
| Commands/versions | root `package.json`, lockfile, runtime config |
| Scoped Agent constraints | root + nearest `AGENTS.md` |
| Owner rule not inferable from machine truth | `docs/owners/<owner>.md` |
| FPT provenance / integrity | `architecture/domain/fpt-source.json` |
| Target/proposal/migration/gap/risk | `docs/change/` |
| Deployment/provider/device reality | dated readback |
| Historical acceptance/recovery evidence | `docs/change/evidence/` |

Markdown explains meaning/constraints/decisions/operations; machine facts are not maintained twice.
