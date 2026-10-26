# Architecture guard scripts

- These scripts are executable checks over canonical machine truth; they do not become a second architecture authority.
- architecture/semantic-model.json owns cross-context structured product semantics, architecture/implementation-topology.json owns implementation topology, architecture/data-topology.json owns relation-level persistence authority/Data Boundary mapping, packages/integration-supabase/src/schemas owns actual database structure, and architecture/domain/fpt/*.json owns pinned GitHub FPT domain truth; architecture/domain/fpt-source.json is provenance/integrity evidence only.
- Every guard change needs a legal case, a deliberate violating case and a repaired case; broad ignores or path exceptions are not convergence.
- Guard output must distinguish source/config failure from a real architecture violation and must not infer runtime, deployment or business acceptance from static success.
- Bounded Context, Module Boundary, Data Boundary, Consistency Boundary, Trust Boundary, and Runtime Boundary are separate dimensions. Never infer one from a folder, package, table, or provider name.
- Keep checks aligned with the canonical machine owners and package exports; do not encode a parallel package map in test fixtures.

## Governing files

完整 authority 與讀取條件繼承 [root context contract](../../AGENTS.md#effective-context-contract)；本檔只增加 local constraints，不另存 governing 清單。

Local code、workflow、schema 或 guard 不得繞過、弱化或重定義這些 governing inputs；若發生 violation，先修真正 Owner / Truth / Boundary / Dependency。

- Runtime feedback observations are external evidence. Comparison output may propose review but must never mutate canonical semantic authority automatically.
