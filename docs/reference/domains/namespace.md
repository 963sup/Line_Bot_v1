# Namespace detailed reference

Owner and invariants: [Namespace](../../owners/namespace.md).

## Public contract

The root `@line_bot_v1/namespace` export contains Account login use cases, frozen namespace profiles,
normalization and route construction. `@line_bot_v1/namespace/postgres` contains the `Sql`-bound
Account and scoped claim/rename/release/resolve functions.

The caller owns the transaction and decides lifecycle and authorization. Namespace validates the
family/scope/target combination, normalizes the name through its versioned profile, and enforces
occupancy. It never starts a transaction or treats a locator as authorization.

## Persistence

`namespace_bindings` stores one current versioned name per typed target and scope.
`namespace_claims` stores current, alias or reserved occupancy keyed by family, scope and canonical
key. `namespace_binding_history` appends known transitions after verified import/activation.

Retained resource columns such as `account_logins.login`, `repositories.name` and
`project_views.name` are constrained projections needed by current resource APIs and queries. They
are written in the same transaction and cannot become a second direct writer or naming authority.
`account_logins` also retains its stable Account foreign-key constraint; Account identity and
qualification remain Account-owned.

The runtime role uses narrow functions rather than direct registry table writes. Database constraints
enforce family/scope/target compatibility and key uniqueness. Same-target claim is idempotent;
different-target collision conflicts. Conditional rename rejects stale observed state.

## Profile semantics

`packages/namespace/src/domain/profiles.ts` is the executable normalization contract. The profile
version is stored with registry facts so a future normalization change requires an explicit migration.
Exact-name families preserve case and spelling. Repository and IssueType use PostgreSQL lowercase
keys without adding NFKC. Team slugs deliberately use NFKC before lowercase comparison.

Repository name aliases are retained. Other current rename families release the previous occupancy;
IssueType releases only on tombstone, and Label/Field/Option/View release only after the resource
Owner authorizes deletion. Pause, suspend, disable, archive and close do not implicitly release names.

## Routes and resolution

Current locator ownership is declared in `architecture/registry.json#domain`; active/planned
path shapes remain in `packages/namespace/src/domain/routes.ts`. Path building validates active routes
and encodes each segment. Resolution yields only target identity, current name and alias status;
resource visibility and mutation permission are rechecked by the resource Owner.

Repository old-name resolution follows the retained alias only when that consumer operation allows
renames. Account login rename has no alias. Planned routes cannot be built and do not imply package,
schema or page activation.

## Cutover and recovery

The operator cutover locks/drains writers, detects collisions, imports only verifiable
live/retained/alias facts, reconciles every retained projection and atomically establishes central
database authority. The recovery provider/API must be available before the first business cutover.
The persisted Platform runtime gate remains frozen after this transaction. Strict `BEFORE` guards
reject affected `line_app` resource writes with SQLSTATE `55000`; operator reconciliation remains
possible and must satisfy exact projection parity.

Only after a compatible production deployment has been read back at its exact revision may an
operator activate the runtime revision. A failed, obsolete or unverified deployment leaves both old
and new application writers frozen. Legacy rename history is not reconstructed without evidence.
After database authority activates, there is no database legacy fallback or registry reseed;
recovery keeps writes frozen and repairs forward with a compatible build.

## Validation

Tests must cover concurrent claim and rename collisions, case behavior, retained Repository aliases,
same-target reclaim, family-specific release, rollback without dangling Claim, retained projection
consistency and existing governance-lock ordering. Local tests and schema checks do not prove remote
cutover or current provider state.
