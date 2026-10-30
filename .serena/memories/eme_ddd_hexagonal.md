# EME DDD / Hexagonal project rules

- `architecture/registry.json`, owner fragments, manifests, source, schemas and tests are the authority; Serena symbol results only locate evidence.
- A business fact, invariant, authorization decision or public capability has one semantic owner. Consumers use public exports or explicit DTO/adapter contracts.
- Domain owns business meaning and invariants; application owns orchestration and authorization inputs; adapters translate HTTP, persistence and provider protocols; composition wires dependencies.
- Do not pass another owner's entity, private row, provider object or authorization decision across a boundary.
- A different owner or domain is evidence to inspect language, lifecycle, authority, consistency and authorization—not an automatic requirement for a separate Markdown file.
- Documentation may combine related owner, architecture, runtime, persistence, contract and acceptance sections when information remains complete and easier to maintain.
- Before source or architecture mutation, locate exact symbols, references, implementations, contracts and tests; after migration re-scan old paths and validate affected consumers.
