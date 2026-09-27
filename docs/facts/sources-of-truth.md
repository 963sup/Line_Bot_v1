# Sources of truth

Use this table when two answers conflict; do not load another background document first.

| Question | Authority |
| --- | --- |
| Current source behavior | source + tests |
| Business concept / owner / relationship / invariant / capability status | `architecture/semantic-model.json` |
| Module path / kind / allowed workspace dependency | `architecture/implementation-topology.json` |
| Persisted relation owner / role / schema-file mapping | `architecture/data-topology.json` |
| Actual PostgreSQL DDL / constraint / RLS | `supabase/schemas/` |
| Public package API | owner `package.json#exports` |
| Repository commands / versions | root `package.json`, lockfile, runtime config |
| Scoped Agent constraints | root + nearest `AGENTS.md` |
| Owner rule not directly inferable from code | `docs/owners/<owner>.md` |
| External GitHub-like semantic benchmark | `architecture/semantic-benchmark.json` + pinned provenance |
| Target / proposal / migration / gap / risk | `docs/change/` |
| Deployment/provider/device reality | dated provider/API/device readback |
| Historical acceptance / recovery evidence | `docs/change/evidence/` |

Human docs explain meaning, constraints, decisions and operations. Machine-readable facts are not maintained twice in Markdown.
