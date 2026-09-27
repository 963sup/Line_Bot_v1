# Repository

Read this file for Repository ownership and invariants. Load [detailed reference](../reference/domains/repository.md) only for runtime capability status, locator, create, Star List or discovery details.

## Responsibility

Repository owns:

- Repository identity、visibility、access and User → Repository Star；
- Repository Star List / List membership；
- Issue lifecycle、assignment、Label、Repository Milestone、command receipt and event history；
- Discussion / comment；
- discovery projections derived from Repository / Star / immutable Issue event facts。

Project may reference Repository work but does not acquire Issue/Discussion authority. Notifications only stores delivery references and does not acquire source truth.

## Invariants

- Every Issue and Discussion belongs to exactly one Repository.
- Issue、Discussion、Notification are distinct concepts; conversation does not change Issue lifecycle.
- Star/unstar is idempotent and never grants Repository access.
- Protected read/write and assignment always use current effective Repository access.
- Organization-owned Repository access changes still require current Organization qualification.
- Commands use stable request identity; conditional mutation uses expected version.
- Event/history is durable evidence and is not rewritten by current snapshots.
- Discovery/read models derive existing truth only and re-check current visibility/access before exposure.

## Mapping

Runtime owner: `packages/repository`. Web presentation: `apps/web/src/modules/repository`.

Persisted relation ownership is authoritative in [data topology](../../architecture/data-topology.json); SQL definitions remain under `supabase/schemas/`.

Adjacent owners: [Project](project.md) · [Notifications](notifications.md) · [Organization](organization.md) · [Authorization](../reference/security/permissions.md)
