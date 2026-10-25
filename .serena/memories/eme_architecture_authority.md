# EME Architecture Authority

- Truth flows: vendored `architecture/domain/fpt/*.json` → `architecture/semantic-model.json` overlay → implementation/data topology → source, schemas, tests → dated evidence.
- FPT JSON mirrors GitHub GraphQL semantics exactly. Do not summarize, rewrite, or weaken it locally.
- `semantic-model.json` adds only product owner, invariant, relationship, capability, and implementation expectation.
- `implementation-topology.json` owns module/application boundaries and permitted dependency direction. `data-topology.json` owns persisted relation ownership.
- Unknown Owner, cross-owner contract, or semantic scope: run `pnpm semantic plan <intent>`; use `pnpm semantic context <intent>` only to obtain exact authority selectors.
