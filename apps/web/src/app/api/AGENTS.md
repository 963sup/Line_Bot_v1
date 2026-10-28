# Web API transport boundary

`apps/web/src/app/api` owns HTTP transport only. Business truth, authorization,
persistence, transactions, replay, and recovery remain in the owning package.
Parent rules from [`app`](../AGENTS.md), [`apps`](../../../../AGENTS.md), and
the repository root apply.

`GET/POST /api/repository-document-intake` is the fixed ContractDocument purchase-order intake entry. It accepts only an exact FileRevision reference and stable request identity; provider/model selection is server-side composition. Contract remains the authority for candidate validation, review and confirmation; `operation=contract` forwards only the bounded review command to Contract. The route never accepts or returns private object bytes.

The commercial intake routes independently expose the Intelligence commercial intake lifecycle
and Contract commercial DRAFT reads. Server composition connects Contract normalization to an
authorized immutable Intelligence result; HTTP transport owns no normalization or business rules.

## Request boundary

- Route handlers decode and validate transport input, establish trusted request
  identity, resolve locators, call public owner contracts, and map results to
  HTTP responses.
- URL, query parameter, body role, selected UI scope, browser state, and session
  cache locate or express intent; none is authorization evidence.
- Protected requests must re-establish current identity, qualification, scope,
  and lifecycle at the owner boundary.
- Pass stable IDs, scope, request identity, expected version, and exact replay
  data required by the owner contract. Do not invent a second request identity.
- Never query another owner's private tables, import private source paths, or
  expose provider credentials, service-role keys, private object keys, or raw
  private object bytes.
- Keep route handlers thin. `_composition` may wire concrete adapters at the
  outer boundary; it must not become a generic service locator or business
  workflow registry.

## Failure and state semantics

- Preserve the owner's distinction between unauthorized, forbidden, invalid,
  conflict, unavailable, and unknown-result outcomes.
- Do not convert unavailable data into empty data or successful mutation into a
  generic HTTP success.
- Preserve expected-version conflicts, request replay, idempotency, transaction
  boundaries, and recovery semantics in HTTP projections.
- Browser-visible responses contain only the public projection required by the
  route contract; do not return internal authority, SQL rows, provider DTOs, or
  diagnostic secrets.

## Change and validation

Before adding or changing a route, trace:

```text
route → module/composition → public package export → owner contract → tests
```

Confirm direct open, refresh, authentication continuation, wrong scope,
unauthorized/forbidden, stale/replay conflict, unavailable source, and unknown
result behavior where the owner supports those states. Read the route source
and owner contract for the current endpoint map; do not maintain an inventory
in this file.

Run the narrow route/owner tests and applicable package scripts. For
public contract, schema, architecture, merge, or release changes, use the
canonical root validation required by the root contract.
