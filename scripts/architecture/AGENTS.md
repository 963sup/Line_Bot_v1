# Architecture guard scripts

- These scripts are executable checks over canonical machine truth; they do not become a second architecture authority.
- architecture/semantic-model.json owns cross-context structured product semantics, architecture/implementation-topology.json owns implementation topology, architecture/data-topology.json owns relation-level persistence authority/Data Boundary mapping, supabase/schemas owns actual database structure, and architecture/domain/fpt/*.json owns pinned GitHub FPT domain truth evidence only.
- Every guard change needs a legal case, a deliberate violating case and a repaired case; broad ignores or path exceptions are not convergence.
- Guard output must distinguish source/config failure from a real architecture violation and must not infer runtime, deployment or business acceptance from static success.
- Bounded Context, Module Boundary, Data Boundary, Consistency Boundary, Trust Boundary, and Runtime Boundary are separate dimensions. Never infer one from a folder, package, table, or provider name.
- Keep checks aligned with the canonical machine owners and package exports; do not encode a parallel package map in test fixtures.

## Governing files

本 scope 修改前仍必須遵守 root `AGENTS.md#Mandatory governing set`，尤其是以下 current authority / guard：

`architecture/README.md` · `architecture/data-topology.json` · `architecture/implementation-topology.json` · `architecture/domain/fpt/*.json` + `architecture/domain/fpt-source.json` · `architecture/semantic-model.json` · `.dependency-cruiser.mjs` · `biome.json` · `knip.jsonc`

Local code、workflow、schema 或 guard 不得繞過、弱化或重定義這些 governing inputs；若發生 violation，先修真正 Owner / Truth / Boundary / Dependency。

- Runtime feedback observations are external evidence. Comparison output may propose review but must never mutate canonical semantic authority automatically.
