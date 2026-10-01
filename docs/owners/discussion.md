# Discussion

Read this file for Discussion ownership and invariants.

## Responsibility

Discussion owns:

- Discussion and DiscussionComment identity and lifecycle facts;
- Discussion title, body, category, author, version and timestamps;
- DiscussionComment author, body, version and timestamps;
- the current opaque Discussion ID validation used by the runtime locator.

Repository remains authoritative for Repository identity and current effective access. A Discussion is Repository-scoped, but that association does not transfer Discussion lifecycle authority to Repository. Current write management remains data-only and must not be advertised as implemented behavior.

## Invariants

- Every Discussion belongs to exactly one Repository.
- Every DiscussionComment belongs to exactly one Discussion.
- Protected reads re-check current effective Repository access; a route or stable ID never grants access.
- Repository-scoped presentation and authorization do not make Repository the owner of Discussion state.
- The current opaque Discussion ID is implementation evidence only. GitHub FPT `Discussion.number` remains canonical domain truth and the known locator drift is not redefined here.
- Current runtime is authorized read-only; future write commands must preserve Discussion-owned lifecycle/version invariants without moving Repository access authority.

## Mapping

Runtime owner: `packages/discussion`. Repository scope provider: `packages/repository`. Web presentation remains on Repository-scoped routes without acquiring Discussion authority.

Persisted relation ownership is authoritative in [data topology](../../architecture/data-topology.json); SQL definitions remain under `supabase/schemas/`.

Adjacent owners: [Repository](repository.md) · [Issue](issue.md) · [Notifications](notifications.md)
