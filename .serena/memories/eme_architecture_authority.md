# EME Architecture Authority

- Truth flows: vendored `architecture/fpt/*.json` → `architecture/registry.json#domain` overlay → implementation/data topology → source, schemas, tests → dated evidence.
- FPT JSON mirrors GitHub GraphQL semantics exactly. Do not summarize, rewrite, or weaken it locally.
- `registry.json#domain` adds only product owner, invariant, relationship, capability, and implementation expectation.
- `registry.json#modules` owns module/application boundaries and permitted dependency direction. `registry.json#data` owns persisted relation ownership.
- Unknown Owner, cross-owner contract, or semantic scope: run `pnpm semantic plan <intent>`; use `pnpm semantic context <intent>` only to obtain exact authority selectors.
