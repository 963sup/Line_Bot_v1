# Namespace

Namespace owns typed business-name binding and occupancy plus the product's structured URL locator
contract. Implementation details: [package README](../../packages/namespace/README.md) and
[detailed reference](../reference/domains/namespace.md).

## Owns

- Versioned `Binding` between a stable typed target and its current name in one typed scope.
- Current, alias and reserved `Claim` occupancy of canonical namespace keys.
- Family-specific normalization profiles and allowed target/scope combinations.
- Conditional claim, resolve, rename and allowed release operations.
- Append-only known binding history after verified import or activation.
- Route scope, path shape, active/planned state and active path construction.

## Families

| Family | Scope | Canonical key and retention |
| --- | --- | --- |
| Account login | global | lowercase ASCII, 1–39, root-reserved; pause/suspend retains; rename releases old |
| Enterprise slug | global | lowercase ASCII, 1–39; lifecycle retains; no general rename |
| Repository name | owner Account ID | trimmed 1–100, PostgreSQL case-insensitive key; old aliases retained forever |
| Organization Team slug | Organization ID | NFKC + lowercase Unicode letter/number/hyphen, 1–80; rename releases old |
| Enterprise Team slug | Enterprise ID | same Team normalization; rename releases old |
| Repository Label name | Repository ID | exact case-sensitive name; valid delete releases |
| Organization IssueType name | Organization ID | trimmed, case-insensitive key; disabled retains, tombstone releases |
| Discussion Category slug | Repository ID | lowercase ASCII slug; Owner controls delete eligibility |
| Project Field name | Project ID | exact case-sensitive name |
| Field Option name | Project Field ID | exact case-sensitive name |
| Project View name | Project ID | exact case-sensitive name; valid delete releases |

Profiles are typed and versioned code. Callers cannot supply arbitrary comparison or release policy.
Repository case-only rename remains legal because the current binding target is known even though the
occupancy key is case-insensitive.

## Boundaries

Account, Enterprise, Repository, Team, Issue, Discussion and Project retain resource identity,
lifecycle, authorization, version, request receipt, events and the decision to claim, rename or
release. Each caller uses Namespace with the same `Sql` transaction that persists its resource
projection. Namespace does not query consumer-private tables or reinterpret business eligibility.

Numbering is independent. It owns scoped sequences, while Namespace owns name occupancy. Neither
imports the other and no generic Scope Owner exists.

Web owns HTTP, pages and navigation. Resolution returns a minimal stable target/current-name/alias
result and never grants access. Planned route descriptors still do not activate their business
capability.

## Invariants

1. One canonical key in one family/scope has at most one active occupancy.
2. Same target and same name claim is idempotent; claim cannot silently rename a target.
3. Rename includes the observed current name/version; stale state or collision conflicts.
4. A retained alias continues resolving to the same Repository and cannot be claimed by another.
5. Release removes active occupancy only for families whose resource lifecycle authorizes release.
6. Binding, Claim, retained resource projection and Owner event/receipt commit or roll back together.
7. Mutable login/name/slug is never stable identity or authorization evidence.
8. Imported history records only verifiable facts; it never invents actor, request, timestamp or
   version.
9. Root reservation and route contracts remain sourced from
   `packages/namespace/src/domain/root.ts` and `domain/routes.ts`.
10. Database authority activation does not make application writers ready. Platform keeps affected
    runtime writes frozen until an exact compatible deployed revision is verified and explicitly
    activated; Namespace cannot bypass that gate or restore direct legacy writers.
