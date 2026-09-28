# Repository detailed reference

Low-frequency Repository runtime, locator and discovery details. Ownership/invariants remain canonical in [Repository](../../owners/repository.md).

## Runtime capability status

Current reads include Repository owner/name resolution and accessible discovery, Issue list/detail, Discussion list/detail/comment, Label collection, Repository Milestone list/detail, Star List and Explore discovery.

Current writes include Repository create, Issue create/transition, star/unstar and Repository Star List create/update/publish/unpublish/item add/remove/delete.

Not yet claimed as general runtime management: Repository rename/visibility, direct/Team access grants, Discussion/Label/Repository Milestone/IssueLabel general write management.

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

Current read transport includes `/api/issues`, `/api/discussions`, `/api/repository-labels`, `/api/repository-milestones` and corresponding detail routes.

## Create

Canonical create surface is `/repositories/new`; API is `POST /api/repositories`; owner picker is `GET /api/repositories/owners`.

- User owner must be the current active User.
- Organization owner requires current effective `OrganizationOwner`.
- First version is fixed `private`.
- `(owner_account_id, lower(name))` is unique within owner scope.
- Create uses stable `requestId` + fingerprint + durable receipt; exact replay re-checks current authority before returning the same Repository.
- The narrow database coordinator re-checks actor/OrganizationOwner and initial access in one transaction; `line_app` does not gain unrestricted insert.
