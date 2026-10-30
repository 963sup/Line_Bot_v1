# Repository detailed reference

Low-frequency Repository runtime, locator and discovery details. Ownership/invariants remain canonical in [Repository](repository.md).

## Runtime capability status

Current Repository-owned reads include owner/name resolution and accessible discovery, Label collection, Repository Milestone list/detail, Star List and Explore discovery. Issue and Discussion reads are delivered on Repository-scoped routes but owned by [Issue](../../owners/issue.md) and [Discussion](../../owners/discussion.md).

Current Repository-owned writes include Repository create with explicit visibility, rename/visibility/archive/unarchive lifecycle management, Direct User / Organization Team access grant-update-revoke, User→Repository Watch state, star/unstar and Repository Star List create/update/publish/unpublish/item add/remove/delete. Issue create, canonical state, content, assignee collection and local workflow are Issue-owned and consume Repository access/numbering contracts.

Repository Label definition create/update/delete and Repository Milestone create/update/open/close are current runtime capabilities. They require current effective `write | maintain | admin`, resource-local expected version and exact replay; Label deletion conflicts while Issue-owned references exist. Discussion write management remains separately inactive under the Discussion owner; IssueLabel and Issue→Milestone assignment belong to Issue. Repository conversation subscription fan-out is also not enabled yet; Watch state is live without pretending Notification delivery exists.

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
- Organization creation requires current Organization membership and the Owner's visibility-specific member creation policy; members are allowed by default, while OrganizationOwner can always create. Current OrganizationOwner also has implicit admin on existing Organization-owned Repositories without a copied Repository grant.
- Caller selects `private | internal | public`; UI labels map directly to FPT PRIVATE / INTERNAL / PUBLIC.
- INTERNAL is available only to an Organization currently attached to an active Enterprise. The database coordinator rechecks that scope atomically.
- `(owner_account_id, lower(name))` is unique within owner scope, and retained historical aliases are also reserved against other Repositories.
- Create uses stable `requestId` + fingerprint + durable receipt; exact replay re-checks current authority before returning the same Repository.
- The narrow database coordinator re-checks actor/Organization capability, INTERNAL eligibility and initial access in one transaction; `line_app` does not gain unrestricted insert.
- Retry compatibility accepts a pre-visibility rollout private-create fingerprint for the same command so an unknown old request can still resolve safely.

## Lifecycle management

- Current effective Repository `admin` is required for rename、visibility、archive and unarchive.
- Every mutation requires `requestId` exact replay plus Repository `expectedVersion` and writes durable `repository_events` evidence.
- Rename changes only `name`; old aliases stay in `repository_name_history`.
- Visibility does not alter Direct User/Team grants. PUBLIC/INTERNAL can add read visibility without adding RepositoryPermission；switching back to PRIVATE removes that visibility immediately.
- INTERNAL derives same-Enterprise viewers from the owner Organization's one current active Enterprise attachment plus current Enterprise affiliation. Detach removes INTERNAL-only visibility immediately；an independent explicit grant still works.
- Archive preserves locator/content reads and current access. Issue commands and Repository Label/Milestone definition mutations reject writes while archived. Discussion writer remains inactive. Repository clock points remain stored/readable/manageable, but archived Repositories are excluded from new Attendance clock-in sites.

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
- Current effective Repository `admin` can manage grants. A current `OrganizationOwner` contributes implicit `admin` for all Organization-owned Repositories; this disappears immediately when Owner qualification is revoked.
- Permission value and operation capability are separate concerns. Current access/address administration checks exact `admin`. Issue owns its non-code operation matrix: current collaborator access with any exact permission may open an Issue and participate in the required local publisher/assignee workflow; generic triage/edit/close/assign classification remains `triage | triage_plus | write | maintain | admin`. Deferred Issue, Discussion, settings and SCM operations remain fail-closed and do not inherit invented capabilities.
- Current runtime uses immediate explicit Repository-admin grant/revoke. It does not model a pending collaborator invitation/acceptance handshake and never substitutes Organization membership for consent; a future invitation lifecycle, if added, must be a separate Repository-owned intent. Mutation uses stable `requestId`, fingerprint and `expectedVersion`; exact replay returns the durable receipt, stale/different content conflicts.
- A successful mutation must leave at least one current effective Repository admin. Team membership can later invalidate a Team-derived admin; a current OrganizationOwner remains an implicit admin for cross-owner recovery.

## Ownership

The public `explicitRepositoryRecipient` query combines current active qualification, Repository access and Watch for explicitly addressed notifications. UNSUBSCRIBED remains eligible; IGNORED does not. It grants neither subscription fan-out nor source ownership to the caller.

Read this file for Repository ownership and invariants. Load [detailed reference](repository.md) only for runtime capability status, locator, create, Star List or discovery details.

## Responsibility

Repository owns:

- Optional attendance point (coordinates and radius, with an optional descriptive address), used for effective members;
- Repository stable identity、current name、owner-scoped rename history、visibility、archive state；
- Direct User / Organization Team access grants、User → Repository Star and User → Repository Watch subscription；
- Repository Star List / List membership；
- Repository Label、Repository Milestone and repository-scoped Issue number allocation；
- discovery projections derived from Repository / Star / immutable Issue event facts。

Issue consumes Repository scope/access and repository-scoped number allocation without acquiring Repository authority. Discussion consumes Repository scope/access without acquiring Repository authority. Content owns work hierarchy and coherent plan revisions. Resources consumes Repository scope/access while owning physical Location, Equipment and Material identity, lifecycle and immutable revisions. Project may reference Repository/Issue work but does not acquire either authority. Notifications only stores delivery references and does not acquire source truth.

## Invariants

- Clock-point mutation requires current effective Repository `admin`, expected version and exact replay. Coordinates and radius determine clock eligibility; the descriptive address is optional. Visibility、Star and Watch do not grant clock eligibility. The point remains readable/manageable while archived, but archived Repository is excluded from new Attendance clock-in sites; existing Attendance snapshots are immutable.
- RepositoryId is stable across rename、visibility and archive lifecycle. Rename changes only the owner-scoped locator and increments Repository version; Issue/Discussion/Project references keep the same RepositoryId.
- Current owner/name always wins. Historical names are retained as owner-scoped aliases. `followRenames=true` resolves an old alias to the same Repository；`false` rejects it. An old alias stays reserved against every other Repository under that owner, while the same Repository may reclaim its own historical name.
- Visibility is read authority, not RepositoryPermission：`PRIVATE` requires explicit current access；`PUBLIC` is readable without a User grant；`INTERNAL` is Organization-only and readable by current active Users in the same current active Enterprise scope. INTERNAL is not Organization membership, every logged-in User, or public.
- Archive is not delete and not PRIVATE. Archived content keeps stable identity/history and remains readable under current visibility/access. Issue commands and Repository Label/Milestone definition mutations fail closed while archived. Discussion write runtime is implemented; new Discussion writes fail closed while archived.
- Repository Watch stores exactly `SUBSCRIBED | UNSUBSCRIBED | IGNORED` for User→Repository. It is distinct from Star、Follow、Team notificationSetting、Notification and delivery, and grants no access. `UNSUBSCRIBED` permits participation/@mention notification policy；`IGNORED` means no Repository-conversation notification. Repository conversation subscription fan-out is not yet enabled.
- Project Repository-reference presentation and Issue/Discussion-backed Notification creation/read recheck current Repository visibility/access; they never acquire Repository authority.

- Every Issue and Discussion belongs to exactly one Repository, but each lifecycle remains with its own semantic owner.
- Issue、Discussion、Notification are distinct concepts; Repository does not own Issue or Discussion lifecycle.
- Star/unstar is idempotent and never grants Repository access.
- Protected read/write and assignment always use current effective Repository access.
- Repository access grant is not OrganizationMembership or TeamMembership；Repository stores only its own User/Team grant facts. Direct User grants require a current active User and owner scope but do not require Organization membership；Team grants continue to consume current Organization/Team qualification.
- RepositoryPermission 的 canonical 值域是 `READ / TRIAGE / TRIAGE_PLUS / WRITE / MAINTAIN / ADMIN`。User／Team grant 保存 exact permission；effective access 是目前有效 permission facts 的集合，不建立 `read < triage < write < admin` 之類的產品自造全序，也不把 `MAINTAIN`／`TRIAGE_PLUS` 默默升降級。
- Permission 名稱與 operation capability policy 分離；consumer 只可檢查已明定的 permission→operation 規則，未定義能力 fail closed。
- Repository Label/Milestone definition management 明定只允許 current effective `write | maintain | admin`。每個 resource 使用自己的 `expectedVersion` 與 exact replay；Label rename 保留 stable identity，Label 若仍被 Issue-owned `issue_labels` 引用則刪除衝突而不跨 owner 清除關係；Milestone number 僅在 Repository 範圍內配置。
- Organization-owned Repository creation requires the Organization-owned current visibility-specific member creation capability. Access mutation requires current effective Repository `admin`; current `OrganizationOwner` contributes implicit `admin` through the effective-access projection without copying a Repository grant.
- An Organization-owned direct User grant can target an active User outside the owner Organization. Active membership only classifies that direct collaborator as member/outside；removing membership does not silently revoke the Repository grant, while explicit Repository revoke does. Team grants must reference an Organization Team in the same owner scope and lose effectiveness with Team/Organization participation.
- Access mutation uses stable request identity + expected version, exact replay only, and must leave at least one current effective Repository admin.
- Commands use stable request identity; conditional mutation uses expected version.
- Event/history is durable evidence and is not rewritten by current snapshots.
- Discovery/read models derive existing truth only and re-check current visibility/access before exposure.

## Mapping

Runtime owner: `packages/repository`. Discovery projection: `packages/explore`. Web presentation: `apps/web/src/modules/repository`.

The canonical Web root is Repository Overview: public metadata is anonymous-readable, while current authenticated Repository scope controls private/internal metadata and management links. Overview composes WBS-owned legacy recovery eligibility without acquiring WBS authority or exposing a destination Project. Source failure remains unavailable and retryable. All available resources share one ordered navigation grid without a disclosure. Settings and Access remain visible only to current admins. Projects remains an independent planning entry and does not imply a Repository association or inherited authorization.

Persisted relation ownership is authoritative in [data topology](../../../architecture/registry.json#data); SQL definitions remain under `packages/integration-supabase/src/schemas/`.

Adjacent owners: [Issue](../../owners/issue.md) · [Discussion](../../owners/discussion.md) · [Project](../../owners/project.md) · [Notifications](../../owners/notifications.md) · [Organization](organization.md) · [Authorization](../security/permissions.md)
