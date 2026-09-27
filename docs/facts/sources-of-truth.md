# Sources of truth

看到兩個答案時，用這張表決定 authority；不要再載入另一篇背景說明。

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
| Owner business rule not directly inferable from code | `docs/010-domain-owners/<owner>.md` |
| GitHub-like external semantic benchmark | `architecture/semantic-benchmark.json` + pinned provenance |
| Target / proposal / migration / gap / risk | `docs/090-governance/` |
| Deployment/provider/device reality | dated provider/API/device readback |
| Historical acceptance / recovery evidence | `docs/090-governance/060-acceptance/` |

Human docs explain meaning / constraints / decision / operation。Machine-readable facts 不在 Markdown 維護第二份清單。
