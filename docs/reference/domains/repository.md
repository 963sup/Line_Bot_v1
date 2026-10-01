# Repository detailed reference

Low-frequency Repository runtime, locator and discovery details. Ownership/invariants remain canonical in [Repository](../../owners/repository.md).

## Runtime capability status

Current Repository-owned reads include owner/name resolution and accessible discovery, Discussion list/detail/comment, Label collection, Repository Milestone list/detail, Star List and Explore discovery. Issue list/detail is delivered on Repository-scoped routes but owned by [Issue](../../owners/issue.md).

Current Repository-owned writes include Repository create, Direct User / Organization Team access grant-update-revoke, star/unstar and Repository Star List create/update/publish/unpublish/item add/remove/delete. Issue create/transition is Issue-owned and consumes Repository access/numbering contracts.

Not yet claimed as general runtime management: Repository rename/visibility and Discussion/Label/Repository Milestone/IssueLabel general write management.

Star List specifics:

- List create defaults private; publish is explicit.
- Item add requires a current Star plus current Repository access.
- List membership grants no Repository access.
- Unstar removes matching List membership via FK cascade without deleting the List.
- Private List is owner-only; public List discovery rechecks every item against viewer visibility/access and must not leak hidden raw counts.
- List `version` protects direct List commands; prerequisite invalidation is not a List command version transition.

Explore specifics:

- Trending uses current valid Stars created in the recent 7-day window first, then stable tie-breaks.
- Activity projects immutable Issue lifecycle events.
- Published List discovery requires an active owner and at least one Repository visible to the viewer.
- Historical activity never proves current visibility.

## Locator

Stable identity is `RepositoryId`. Repository owner is `User | Organization`, using the Account-owned `login` namespace.

```text
/{ownerLogin}/{repositoryName}
/{ownerLogin}/{repositoryName}/issues/{issueNumber}
/{ownerLogin}/{repositoryName}/discussions/{discussionId}
/{ownerLogin}/{repositoryName}/milestones/{milestoneNumber}
/repositories/lists/{listId}
```

`Issue.number` and `RepositoryMilestone.number` are Repository-local locators; their stable IDs remain internal identity. Discussion uses an opaque local `DiscussionId`. Locator never grants access.

Repository access management uses `/{ownerLogin}/{repositoryName}/access` with `GET/POST /api/repository-access`. The URL only locates the Repository; every read/mutation re-checks current management authority.

Current read transport includes `/api/issues`, `/api/discussions`, `/api/repository-labels`, `/api/repository-milestones` and corresponding detail routes.

## Create

Canonical create surface is `/repositories/new`; API is `POST /api/repositories`; owner picker is `GET /api/repositories/owners`.

- User owner must be the current active User.
- Organization owner requires current effective `OrganizationOwner`.
- First version is fixed `private`.
- `(owner_account_id, lower(name))` is unique within owner scope.
- Create uses stable `requestId` + fingerprint + durable receipt; exact replay re-checks current authority before returning the same Repository.
- The narrow database coordinator re-checks actor/OrganizationOwner and initial access in one transaction; `line_app` does not gain unrestricted insert.


## Access management

Repository access authority remains Repository-owned:

- Direct User grants persist in `repository_access`; Organization Team grants persist in `repository_team_access`.
- Effective access is derived from current User / OrganizationMembership / TeamMembership qualification; grant rows do not copy those upstream memberships.
- User-owned Repository owner has implicit admin authority and cannot receive a redundant direct grant.
- Organization-owned direct User grants require a current Organization participant; Team grants must reference a Team in the same Organization scope.
- Current effective Repository `admin` can manage grants. Current `OrganizationOwner` is an explicit recovery authority for an Organization-owned Repository whose effective admin access has been lost.
- Mutation uses stable `requestId`, fingerprint and `expectedVersion`; exact replay returns the durable receipt, stale/different content conflicts.
- A successful mutation must leave at least one current effective Repository admin. Team membership can later invalidate a Team-derived admin; OrganizationOwner recovery exists for that cross-owner change.
