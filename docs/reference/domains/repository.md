# Repository detailed reference

Low-frequency Repository runtime, locator and discovery details. Ownership/invariants remain canonical in [Repository](../../owners/repository.md).

## Runtime capability status

Current Repository-owned reads include owner/name resolution and accessible discovery, Label collection, Repository Milestone list/detail, Star List and Explore discovery. Issue and Discussion reads are delivered on Repository-scoped routes but owned by [Issue](../../owners/issue.md) and [Discussion](../../owners/discussion.md).

Current Repository-owned writes include Repository create with explicit visibility, rename/visibility/archive/unarchive lifecycle management, Direct User / Organization Team access grant-update-revoke, User→Repository Watch state, star/unstar and Repository Star List create/update/publish/unpublish/item add/remove/delete. Issue create, canonical state, content, assignee collection and local workflow are Issue-owned and consume Repository access/numbering contracts.

Not yet claimed as general Repository runtime management: Label/Repository Milestone general write management. Discussion write management remains separately inactive under the Discussion owner; IssueLabel belongs to Issue. Repository conversation subscription fan-out is also not enabled yet; Watch state is live without pretending Notification delivery exists.

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
- PRIVATE is explicit-access read；PUBLIC is anonymous-readable；INTERNAL is same current active Enterprise scope for an Organization-owned Repository. Explore and List counts/previews re-evaluate this current state and do not treat visibility as a permission grant.

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

Repository access management uses `/{ownerLogin}/{repositoryName}/access` with `GET/POST /api/repository-access`. Lifecycle management uses the Settings surface with `GET/POST /api/repository-management`. Watch state uses `GET/POST /api/repository-subscription`. The URL only locates the Repository; every read/mutation re-checks current authority/access.

Current owner/name takes precedence. Historical owner-scoped Repository names remain aliases. Reads default to `followRenames=true`; explicit `false` rejects an old name. Old names remain reserved against a different Repository under the same owner, while the original Repository may rename back to its own alias. Rename never changes RepositoryId.

Current read transport includes `/api/issues`, `/api/discussions`, `/api/repository-labels`, `/api/repository-milestones` and corresponding detail routes.

## Create

Canonical create surface is `/repositories/new`; API is `POST /api/repositories`; owner picker is `GET /api/repositories/owners`.

- User owner must be the current active User.
- Organization owner requires current effective `OrganizationOwner`.
- Caller selects `private | internal | public`; UI labels map directly to FPT PRIVATE / INTERNAL / PUBLIC.
- INTERNAL is available only to an Organization currently attached to an active Enterprise. The database coordinator rechecks that scope atomically.
- `(owner_account_id, lower(name))` is unique within owner scope, and retained historical aliases are also reserved against other Repositories.
- Create uses stable `requestId` + fingerprint + durable receipt; exact replay re-checks current authority before returning the same Repository.
- The narrow database coordinator re-checks actor/OrganizationOwner, INTERNAL eligibility and initial access in one transaction; `line_app` does not gain unrestricted insert.
- Retry compatibility accepts a pre-visibility rollout private-create fingerprint for the same command so an unknown old request can still resolve safely.

## Lifecycle management

- Current effective Repository `admin` is required for rename、visibility、archive and unarchive.
- Every mutation requires `requestId` exact replay plus Repository `expectedVersion` and writes durable `repository_events` evidence.
- Rename changes only `name`; old aliases stay in `repository_name_history`.
- Visibility does not alter Direct User/Team grants. PUBLIC/INTERNAL can add read visibility without adding RepositoryPermission；switching back to PRIVATE removes that visibility immediately.
- INTERNAL derives same-Enterprise viewers from the owner Organization's one current active Enterprise attachment plus current Enterprise affiliation. Detach removes INTERNAL-only visibility immediately；an independent explicit grant still works.
- Archive preserves locator/content reads and current access. Issue command runtime rejects writes while archived. Discussion/Label/Milestone writers remain inactive. Repository address remains stored/readable/manageable, but archived Repositories are excluded from new Attendance clock-in sites.

## Watch / Subscribable

Repository is the currently supported non-code Subscribable subject.

- State is exactly `SUBSCRIBED | UNSUBSCRIBED | IGNORED`, versioned independently per User→Repository and replay-safe.
- Watch requires current Repository read access on every view/mutation and never creates Repository access or Star.
- `UNSUBSCRIBED` is not `IGNORED`: future conversation producers may still notify participation/@mention under UNSUBSCRIBED, while IGNORED suppresses Repository-conversation notification.
- Repository conversation subscription fan-out is not enabled. Existing Issue/Discussion-backed Notifications independently enforce current Repository source access at insertion and again on Inbox read/mark-read.

## Access management

Repository access authority remains Repository-owned:

- Direct User grants persist in `repository_access`; Organization Team grants persist in `repository_team_access`. The stored `capability` column / command field is retained as a rolling-compatible wire name, but its domain value is the exact six-value FPT `RepositoryPermission`: `read | triage | triage_plus | write | maintain | admin`.
- Direct User effective access re-checks current User and owner-scope qualification without requiring OrganizationMembership. Team-derived access re-checks current Organization qualification and Team effective membership. Nested Organization Team membership is derived from direct TeamMembership with traceable `grant_team_id / source_team_id / membership_type / depth`; grant rows never copy those upstream facts. Parent/child hierarchy alone grants nothing: an explicit Repository Team grant is still required. Removing one hierarchy or grant source removes only that source, while independent direct/Team sources remain. Effective access returns the set of exact currently qualified permissions; it does not collapse multiple sources through a numeric maximum.
- User-owned Repository owner has implicit admin authority and cannot receive a redundant direct grant.
- Organization-owned direct User grants may target any current active User. All such rows are direct Repository grants; a User with no current owner-Organization membership is projected as an outside collaborator. Membership removal flips affiliation to outside without rewriting the grant, rejoin flips it back without a new grant, and explicit revoke removes access.
- Current effective Repository `admin` can manage grants. Current `OrganizationOwner` is an explicit recovery authority for an Organization-owned Repository whose effective admin access has been lost.
- Permission value and operation capability are separate concerns. Current access/address administration checks exact `admin`. Issue owns its non-code operation matrix: current collaborator access with any exact permission may open an Issue and participate in the required local publisher/assignee workflow; generic triage/edit/close/assign classification remains `triage | triage_plus | write | maintain | admin`. Deferred Issue, Discussion, settings and SCM operations remain fail-closed and do not inherit invented capabilities.
- Current runtime uses immediate explicit Repository-admin grant/revoke. It does not model a pending collaborator invitation/acceptance handshake and never substitutes Organization membership for consent; a future invitation lifecycle, if added, must be a separate Repository-owned intent. Mutation uses stable `requestId`, fingerprint and `expectedVersion`; exact replay returns the durable receipt, stale/different content conflicts.
- A successful mutation must leave at least one current effective Repository admin. Team membership can later invalidate a Team-derived admin; OrganizationOwner recovery exists for that cross-owner change.
