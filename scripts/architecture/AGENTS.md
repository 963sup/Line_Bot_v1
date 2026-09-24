# Architecture guard scripts

- These scripts are executable checks over canonical machine truth; they do not become a second architecture authority.
- architecture/semantic-model.json owns cross-context structured product semantics, architecture/implementation-topology.json owns implementation topology, architecture/data-topology.json owns relation-level persistence authority/Data Boundary mapping, supabase/schemas owns actual database structure, and architecture/semantic-benchmark.json owns pinned external benchmark evidence only.
- Every guard change needs a legal case, a deliberate violating case and a repaired case; broad ignores or path exceptions are not convergence.
- Guard output must distinguish source/config failure from a real architecture violation and must not infer runtime, deployment or business acceptance from static success.
- Bounded Context, Module Boundary, Data Boundary, Consistency Boundary, Trust Boundary, and Runtime Boundary are separate dimensions. Never infer one from a folder, package, table, or provider name.
- Keep checks aligned with the canonical machine owners and package exports; do not encode a parallel package map in test fixtures.

- Runtime feedback observations are external evidence. Comparison output may propose review but must never mutate canonical semantic authority automatically.
