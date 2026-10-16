# Scoped Numbering and Namespace cutover

This migration record remains current until every listed family has production preflight, activation
and readback evidence. Current ownership and runtime truth live in the architecture manifests,
Owner docs, package contracts and declarative schema.

## Result

Two independent supporting Owners are activated:

- Numbering owns typed Series, atomic allocation and immutable committed allocation facts.
- Namespace owns typed name binding, occupancy, alias, release and normalization profiles.

Resource Owners retain lifecycle, authorization, versions, request receipts, events and the decision
to call either provider. Both providers use the caller's transaction. There is no generic Scope
package, remote service, event bus, reserve/reset API or shared policy engine.

Platform owns the neutral `scoped_identifier_authority` activation checkpoint and operator-only
cutover mechanism. Its initial `authority`, `revision`, `activated_at` and `summary` fields are the
immutable database-authority snapshot. Its separate runtime fields start as `runtime_ready = false`,
`runtime_revision = NULL` and `runtime_activated_at = NULL`. The checkpoint does not own any business
scope, name or number.

## Activation units

Numbering activates five families: Repository work item, Discussion and Milestone; Account Project;
Project View. Namespace activates eleven families: Account login, Enterprise slug, Repository name,
Organization Team slug, Enterprise Team slug, Repository Label, Organization IssueType, Discussion
Category, Project Field, Field Option and Project View.

Reconciliation can be evaluated by family, but the current operator cutover publishes one atomic
authority checkpoint across every active family and retained projection. The old and new runtime
writers remain frozen together until the compatible deployment is verified and runtime readiness is
activated. Mixed legacy and registry allocation/uniqueness writers are never allowed.

## Required preflight

The release procedure must complete these stages in order:

1. identify the intended compatible application revision and run a read-only production preflight;
2. prove the recovery provider/API is available before the first business cutover;
3. stop or drain all affected writers and acquire existing governance/resource locks in their
   documented order;
4. detect duplicate current keys, incompatible scopes, missing stable targets and out-of-range
   numbers before mutation;
5. derive import facts only from current/retained rows and verifiable immutable events or receipts,
   recording the highest defensible number even when an older resource target cannot be
   reconstructed;
6. in one controlled operator transaction, seed Series/Allocation and Binding/Claim facts, reconcile
   every constrained projection, verify exact keys, aliases and high-water marks, then publish the
   immutable database-authority checkpoint;
7. confirm the checkpoint remains `runtime_ready = false` and that strict `BEFORE` guards on all 16
   affected resource tables reject runtime `SET ROLE line_app` writes with SQLSTATE `55000` while
   allowing operator cutover work only when strict registry/projection parity holds;
8. deploy a compatible application revision to production and read back the exact deployed Vercel
   SHA;
9. only after successful exact-SHA readback, call the operator function
   `activate_scoped_identifier_runtime(text revision, bigint activated_at)` and verify the persisted
   runtime marker, provider/database behavior and application health.

Imported history must not invent actor, request, version, timestamp or a resource-to-number mapping.
Namespace history begins at verified import/activation when older transition facts are unavailable.
Count equality alone is not reconciliation evidence: stable identities, canonical keys, scopes,
aliases, numbers, high-water marks and retained projections must match exactly.

## Recovery boundary

Before the database cutover commits, abandoning the uncommitted transaction leaves current writers
unchanged. After it commits, central database authority is active and no legacy database fallback,
registry reseed or `max(number) + 1` path is permitted. The persisted runtime gate keeps both old and
new application writers frozen until a compatible published build is verified.

A failed or obsolete deployment does not change runtime readiness. Repair forward with a compatible
latest-main build and verify its exact deployed SHA before activation. For example, a compatible
build B may activate the runtime after database cutover A: A's original `revision`, `activated_at`
and `summary` remain immutable, while `runtime_revision` records the first compatible published build
and is not a mutable current-deployment version. Do not rewind counters or delete Allocation,
Claim or history rows.

## Evidence still required

Repository source, schema and local tests can establish contract shape and transaction behavior. They
do not prove production rows were reconciled. Read-only production observations belong in dated,
revision-scoped release evidence rather than this durable contract. Keep this migration open until
production preflight, database cutover, exact deployed-SHA readback, runtime activation,
database/provider readback and application health evidence are recorded. This document does not
claim that a main-branch revision was released or that production activation completed.
