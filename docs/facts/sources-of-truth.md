# Sources of truth

Conflicting answers use the authority below; do not load more background first.

| Question | Authority |
| --- | --- |
| Current source behavior | source + tests |
| Business concept/owner/relationship/invariant/capability | `architecture/semantic-model.json` |
| Module path/kind/dependency allowlist | `architecture/implementation-topology.json` |
| Persisted relation owner/schema mapping | `architecture/data-topology.json` |
| PostgreSQL DDL/constraint/RLS | `supabase/schemas/` |
| Public package API | owner `package.json#exports` |
| Commands/versions | root `package.json`, lockfile, runtime config |
| Scoped Agent constraints | root + nearest `AGENTS.md` |
| Owner rule not inferable from machine truth | `docs/owners/<owner>.md` |
| Markdown convergence/review state | `docs/convergence-manifest.json` |
| GitHub-like benchmark | `architecture/semantic-benchmark.json` + provenance |
| Target/proposal/migration/gap/risk | `docs/change/` |
| Deployment/provider/device reality | dated readback |
| Historical acceptance/recovery evidence | `docs/change/evidence/` |

Markdown explains meaning/constraints/decisions/operations; machine facts are not maintained twice.
