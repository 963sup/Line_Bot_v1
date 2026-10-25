# EME Architecture Ownership

- One durable business fact and responsibility has one authoritative owner. Consumers use owner public contracts; do not add wrappers or aliases to hide boundary violations.
- Preserve authority, authorization/isolation, concurrency/replay, atomicity/recovery, ownership/dependency, and evidence-integrity invariants.
- Machine-readable architecture inputs are governing truth, not CI escape hatches. FPT JSON is an exact vendored GitHub GraphQL mirror; `semantic-model` only adds product ownership and capability overlay.
- Apply progressive disclosure: task router → owner contract → exact source/tests. Do not treat symbol-search output as product truth.
- Resolve unknown owner, contract, or cross-owner impact with `pnpm semantic plan`; use `pnpm semantic context` only for exact authority selectors.
