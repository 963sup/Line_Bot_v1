# Packages scope

`packages/` contains independently owned modules. Each package owns its
business capability, public contract, tests, and provider boundary. Parent
rules from [`AGENTS.md`](../AGENTS.md) remain applicable.

## Package boundaries

- Before changing a package, identify the business result, semantic owner,
  real consumer, public export, data boundary, and required validation.
- Cross-package imports use only the target package's `package.json#exports`;
  never import private source paths, generated artifacts, or test helpers.
- A package may depend on another package's public capability, but must not
  take ownership of its domain rules, authorization, persistence, or private
  schema.
- Concrete provider and database implementations stay in their owning
  integration package or owner adapter. Neutral runtime mechanisms belong to
  `@line_bot_v1/platform`.
- Keep one authoritative owner for each business fact, relation, policy, and
  public capability. Do not add aliases, wrappers, facades, or compatibility
  paths without a real consumer and translation responsibility.
- Do not create empty modules, placeholder folders, generic managers/helpers,
  or parallel abstractions for symmetry.

## Placement

Owner packages are the implementation home for business behavior. Do not leave
use cases, query policies, business authorization, transactions or recovery in
apps pages, API handlers or Web composition modules. Expose the smallest public
capability needed by real consumers; keep domain independent of Next.js and
concrete providers. Use Serena v2/LSP according to the inherited root workflow
to trace declarations and consumers before moving or deleting behavior.

Use the smallest existing placement that matches the responsibility:

- Domain rules and state transitions stay with the owning package.
- Application use cases coordinate domain decisions and external ports.
- Contracts expose stable ports and boundary DTOs.
- Adapters implement transport, persistence, or provider protocols.
- Composition wires concrete dependencies without business decisions.
- Test-only helpers must not be imported by production code.

These are responsibility labels, not mandatory folder templates. Do not move
or rename code merely to make a directory shape look complete.

## Change and validation

- Follow the real consumer from route or entry point through public export,
  application contract, domain rule, adapter, and persistence boundary before
  changing ownership.
- Preserve authorization, tenant isolation, replay/request identity,
  expected-version or conditional-write semantics, transaction boundaries,
  recovery, and privacy.
- Update manifests, exports, schemas, architecture projections, tests, and
  documentation when the changed contract actually requires it.
- Run the narrow owner tests and relevant lint/typecheck/test targets. For boundary,
  architecture, schema, merge, or release changes, run the corresponding
  canonical validation from the root contract.
- Child `AGENTS.md` files add only package-specific constraints; they do not
  repeat this file or weaken the root contract.

## Package-specific files

Each child Owner scope `packages/<Owner>/AGENTS.md` should contain only:

- the owner's unique business authority;
- owner-specific authorization or data rules;
- provider or lifecycle exceptions;
- the smallest validation commands unique to that package.

Do not copy the common boundary, DDD, naming, or validation rules into child
files.

## Non-negotiable cross-Owner boundaries

- **Public API** (`contracts/**` and appropriate application entrypoints): business Packages import only stable commands, queries, DTOs and ports needed by a real consumer. Type-only imports still count as dependencies.
- **Bootstrap API** (`composition/bootstrap/**` and legacy `postgres/**` exports): only application hosts wire concrete factories and transaction-scoped readers. Do not add business-Package-to-foreign-bootstrap imports; existing cases are migration debt.
- **Internal** (`domain` implementations, `adapters/**`, private SQL): only the owning Package implements or changes authoritative facts. A shared SQL connection or access check never grants write authority over another Owner's private tables.
- Cross-Owner conversions consume a pinned, authorized source revision and persist mapping version, provenance and exact replay identity. Never mutate the upstream revision to repair a downstream result.
- Business policy and recovery stay in owner use cases; the Host only composes and invokes them. Do not add a generic workflow manager, duplicate authority or façade solely for architectural symmetry.
