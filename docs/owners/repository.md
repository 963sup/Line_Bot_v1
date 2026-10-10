# Repository

Read this file for Repository ownership and invariants. Load [detailed reference](../reference/domains/repository.md) only for runtime capability status, locator, create, Star List or discovery details.

## Responsibility

Repository owns:

- Optional address property (address text, coordinates, radius), also the clock point for effective members;
- Repository stable identity、current name、owner-scoped rename history、visibility、archive state；
- Direct User / Organization Team access grants、User → Repository Star and User → Repository Watch subscription；
- Repository Star List / List membership；
- Repository Label、Repository Milestone and repository-scoped Issue number allocation；
- discovery projections derived from Repository / Star / immutable Issue event facts。

Issue consumes Repository scope/access and repository-scoped number allocation without acquiring Repository authority. Discussion consumes Repository scope/access without acquiring Repository authority. Project may reference Repository/Issue work but does not acquire either authority. Notifications only stores delivery references and does not acquire source truth.

## Invariants

- Address mutation requires current effective Repository `admin`, expected version and exact replay. Visibility、Star and Watch do not grant clock eligibility. Address remains readable/manageable while archived, but archived Repository is excluded from new Attendance clock-in sites; existing Attendance snapshots are immutable.
- RepositoryId is stable across rename、visibility and archive lifecycle. Rename changes only the owner-scoped locator and increments Repository version; Issue/Discussion/Project references keep the same RepositoryId.
- Current owner/name always wins. Historical names are retained as owner-scoped aliases. `followRenames=true` resolves an old alias to the same Repository；`false` rejects it. An old alias stays reserved against every other Repository under that owner, while the same Repository may reclaim its own historical name.
- Visibility is read authority, not RepositoryPermission：`PRIVATE` requires explicit current access；`PUBLIC` is readable without a User grant；`INTERNAL` is Organization-only and readable by current active Users in the same current active Enterprise scope. INTERNAL is not Organization membership, every logged-in User, or public.
- Archive is not delete and not PRIVATE. Archived content keeps stable identity/history and remains readable under current visibility/access. Issue commands and Repository Label/Milestone definition mutations fail closed while archived. Discussion write runtime remains inactive.
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
- Organization-owned Repository creation requires the Organization-owned current `viewerCanCreateRepositories` capability. Access mutation still requires current effective Repository `admin`; current `OrganizationOwner` remains an explicit recovery authority but does not become Repository access merely by managing grants.
- An Organization-owned direct User grant can target an active User outside the owner Organization. Active membership only classifies that direct collaborator as member/outside；removing membership does not silently revoke the Repository grant, while explicit Repository revoke does. Team grants must reference an Organization Team in the same owner scope and lose effectiveness with Team/Organization participation.
- Access mutation uses stable request identity + expected version, exact replay only, and must leave at least one current effective Repository admin.
- Commands use stable request identity; conditional mutation uses expected version.
- Event/history is durable evidence and is not rewritten by current snapshots.
- Discovery/read models derive existing truth only and re-check current visibility/access before exposure.

## Mapping

Runtime owner: `packages/repository`. Discovery projection: `packages/explore`. Web presentation: `apps/web/src/modules/repository`.

Persisted relation ownership is authoritative in [data topology](../../architecture/data-topology.json); SQL definitions remain under `supabase/schemas/`.

Adjacent owners: [Issue](issue.md) · [Discussion](discussion.md) · [Project](project.md) · [Notifications](notifications.md) · [Organization](organization.md) · [Authorization](../reference/security/permissions.md)
