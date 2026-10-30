# Packages scope

`packages/` contains independently owned capabilities. Inherits the [root
contract](../AGENTS.md); children add only owner-specific authority, lifecycle,
provider and validation constraints.

## Public, Bootstrap and Internal boundaries

- Cross-package imports use the target `package.json#exports`, never private
  source paths, generated artifacts or test helpers. Export visibility alone
  does not make a concrete factory a business API; type-only imports also count
  as dependencies.
- **Public API** exposes the minimum stable command, query, DTO or port required
  by a real business consumer. The provider retains its domain rules,
  authorization, persistence and write authority.
- **Bootstrap API** exposes concrete provider/Postgres factories and
  transaction-scoped wiring to the Application Host. Do not add imports of a
  foreign Owner's bootstrap from a business package; existing cases are
  migration debt, not precedent.
- **Internal** implementations and private SQL stay with their Owner. A shared
  SQL connection, transaction or access check never grants write authority over
  another Owner's private tables or Domain state.
- Public/Bootstrap/Internal describe responsibility, not mandatory directory
  templates. Confirm the actual exports, source, consumers and dependency rules
  before changing an API.

## Placement

- Domain rules and transitions stay in the owner package; application use cases
  coordinate domain decisions through ports. Contracts expose boundary DTOs and
  ports; adapters implement transport, persistence and provider protocols.
- Owner business authorization, queries, transactions and recovery must not move
  into Web pages, routes or modules. Host composition wires and invokes public
  capabilities without acquiring business decisions.
- Concrete SDK/database mechanisms stay in their integration package or owner
  adapter. Neutral mechanisms belong to `@line_bot_v1/platform`.
- Do not create empty layers or generic managers, wrappers, facades and
  compatibility paths for symmetry. A new abstraction needs a real consumer and
  independent responsibility under the root complexity rule.

## Cross-Owner conversion and validation

- File → Intelligence → Contract → Content → WBS describes data derivation,
  not a universal static import chain. Contract's commercial-document and
  Engineering Contract use cases have different source contracts.
- Conversions consume a pinned, authorized source revision and persist mapping
  version, provenance and exact replay identity. Never mutate an upstream
  revision to repair a downstream result. Owner commands retain authorization,
  expected-version, transaction and recovery semantics.
- Before changing a boundary, trace the real consumer through public export,
  use case, domain and adapter. Synchronize affected manifests, exports,
  architecture, schemas, tests and documentation only where the contract changes.
- Run affected owner tests and applicable root validation stages. Boundary or
  architecture changes also require `pnpm check:repository`; schema/provider
  claims require their own evidence. Child scopes list only additional checks.
