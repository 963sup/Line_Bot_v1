# EME DDD Hexagonal Implementation

Apply DDD and Hexagonal Architecture by responsibility and dependency direction, not by directory symmetry:

- Identify the semantic Owner from `architecture/registry.json` before changing code. One business fact, invariant, authorization decision, and public capability has one authoritative owner.
- Domain owns immutable business concepts, invariants, state transitions, and domain errors. It does not import UI, Next.js, Supabase, OpenAI, Vercel, HTTP, or database implementations.
- Application owns use-case orchestration, transaction/replay decisions, authorization inputs, and port coordination. It calls domain rules and ports; it does not implement provider protocol details.
- Contracts/ports define the smallest stable capability needed by the use case. A port belongs with the consumer that needs the capability; avoid generic service interfaces.
- Adapters implement HTTP, persistence, provider SDK, file/object, clock, and transport protocols. Adapters translate external errors and data into the owning contract; they do not decide business authorization or confirmation.
- Composition/bootstrap wires concrete adapters into application ports. Composition selects dependencies and configuration; it does not make business decisions.
- Pages and route handlers are thin delivery adapters: parse input, call a public application contract, map the result to HTTP/UI, and contain no business writer or duplicate validation authority.
- Integration packages own provider credentials, protocol limits, SDK setup, and provider readback. Domain packages own business meaning and persistence authority; shared infrastructure does not become a business owner.

Use If/Then decisions:

- If an existing Owner and public contract can express the result, extend that contract; do not create a new package or facade.
- If a rule changes business truth or state, place it in the Owner domain and enforce it in the database when it is a concurrency or alternate-path invariant.
- If behavior only translates a provider or transport protocol, place it in an adapter or integration package; do not leak provider types into Domain.
- If a dependency is needed by one use case, define the narrowest port at that consumer boundary; do not add a global manager or generic repository.
- If a file has no independent responsibility or consumer, merge or delete it; do not retain forwarding layers for visual symmetry.
- If a change crosses Owner, public contract, persistence, authorization, or dependency direction, inspect real references and topology before editing and validate every consumer.

Preferred flow:

```text
delivery adapter
→ public application contract
→ application use case
→ domain invariant / state transition
→ consumer-owned ports
→ concrete adapters
→ provider or persistence
```

Validate architecture changes with affected owner tests, typecheck/lint, dependency checks, repository checks, and references/diagnostics. Source, exports, schemas, tests, and architecture topology remain authoritative; this memory only routes implementation decisions.
