# Repository

Read this file for Repository ownership and invariants. Load [detailed reference](../reference/domains/repository.md) only for runtime capability status, locator, create, Star List or discovery details.

## Responsibility

Repository owns:

- Optional address property (address text, coordinates, radius), also the clock point for effective members;
- Repository identity、visibility、Direct User / Organization Team access grants and User → Repository Star；
- Repository Star List / List membership；
- Issue lifecycle、assignment、Label、Repository Milestone、command receipt and event history；
- Discussion / comment；
- discovery projections derived from Repository / Star / immutable Issue event facts。

Project may reference Repository work but does not acquire Issue/Discussion authority. Notifications only stores delivery references and does not acquire source truth.

## Invariants

- Address mutation requires current effective Repository `admin`, expected version and exact replay. Public visibility and Star do not grant clock eligibility. Address deletion does not rewrite Attendance snapshots.

- Every Issue and Discussion belongs to exactly one Repository.
- Issue、Discussion、Notification are distinct concepts; conversation does not change Issue lifecycle.
- Star/unstar is idempotent and never grants Repository access.
- Protected read/write and assignment always use current effective Repository access.
- Repository access grant is not OrganizationMembership or TeamMembership；Repository stores only its own User/Team grant facts and derives effective access from current upstream qualification.
- Access mutation requires current effective Repository `admin`；for Organization-owned Repository, current `OrganizationOwner` is an explicit recovery authority but does not become Repository access merely by managing grants.
- Organization-owned direct User grants require current Organization participation；Team grants must reference an Organization Team in the same owner scope.
- Access mutation uses stable request identity + expected version, exact replay only, and must leave at least one current effective Repository admin.
- Commands use stable request identity; conditional mutation uses expected version.
- Event/history is durable evidence and is not rewritten by current snapshots.
- Discovery/read models derive existing truth only and re-check current visibility/access before exposure.

## Mapping

Runtime owner: `packages/repository`. Discovery projection: `packages/explore`. Web presentation: `apps/web/src/modules/repository`.

Persisted relation ownership is authoritative in [data topology](../../architecture/data-topology.json); SQL definitions remain under `supabase/schemas/`.

Adjacent owners: [Project](project.md) · [Notifications](notifications.md) · [Organization](organization.md) · [Authorization](../reference/security/permissions.md)
