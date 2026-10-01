# Repository detailed reference

Low-frequency Repository runtime, locator and discovery details. Ownership/invariants remain canonical in [Repository](../../owners/repository.md).

## Runtime capability status

Current Repository-owned reads include owner/name resolution and accessible discovery, Label collection, Repository Milestone list/detail, Star List and Explore discovery. Issue and Discussion reads are delivered on Repository-scoped routes but owned by [Issue](../../owners/issue.md) and [Discussion](../../owners/discussion.md).

Current Repository-owned writes include Repository create, Direct User / Organization Team access grant-update-revoke, star/unstar and Repository Star List create/update/publish/unpublish/item add/remove/delete. Issue create/transition is Issue-owned and consumes Repository access/numbering contracts.

Not yet claimed as general Repository runtime management: Repository rename/visibility and Label/Repository Milestone general write management. Discussion write management remains separately inactive under the Discussion owner; IssueLabel belongs to Issue.

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

- Direct User grants persist in `repository_access`; Organization Team grants persist in `repository_team_access`. The stored `capability` column / command field is retained as a rolling-compatible wire name, but its domain value is the exact six-value FPT `RepositoryPermission`: `read | triage | triage_plus | write | maintain | admin`.
- Direct User effective access re-checks current User and owner-scope qualification without requiring OrganizationMembership. Team-derived access continues to re-check OrganizationMembership / TeamMembership; grant rows never copy those upstream facts. Effective access returns the set of exact currently qualified permissions; it does not collapse multiple sources through a numeric maximum.
- User-owned Repository owner has implicit admin authority and cannot receive a redundant direct grant.
- Organization-owned direct User grants may target any current active User. All such rows are direct Repository grants; a User with no current owner-Organization membership is projected as an outside collaborator. Membership removal flips affiliation to outside without rewriting the grant, rejoin flips it back without a new grant, and explicit revoke removes access.
- Current effective Repository `admin` can manage grants. Current `OrganizationOwner` is an explicit recovery authority for an Organization-owned Repository whose effective admin access has been lost.
- Permission value and operation capability are separate concerns. Current access/address administration checks exact `admin`. Issue owns its non-code operation matrix: current collaborator access with any exact permission may open an Issue, while the existing workflow transitions require one of `triage | triage_plus | write | maintain | admin` plus the separate Issue-owned publisher/assignee responsibility rule. Deferred Issue, Discussion, settings and SCM operations remain fail-closed and do not inherit invented capabilities.
- Current runtime uses immediate explicit Repository-admin grant/revoke. It does not model a pending collaborator invitation/acceptance handshake and never substitutes Organization membership for consent; a future invitation lifecycle, if added, must be a separate Repository-owned intent. Mutation uses stable `requestId`, fingerprint and `expectedVersion`; exact replay returns the durable receipt, stale/different content conflicts.
- A successful mutation must leave at least one current effective Repository admin. Team membership can later invalidate a Team-derived admin; OrganizationOwner recovery exists for that cross-owner change.
