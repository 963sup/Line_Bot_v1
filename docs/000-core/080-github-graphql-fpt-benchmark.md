# GitHub GraphQL FPT semantic benchmark

## Purpose

本文件是 Line_Bot_v1 的 GitHub-like semantic 開發參考索引。外部權威仍是 `github/docs`；主要 benchmark 是 `src/graphql/data/fpt/` 的 machine-readable GraphQL contract。當 GitHub 的產品語意存在於 canonical docs、但 FPT 沒有對應 result type 時，只允許把 canonical docs 當 derived semantic 的補充 evidence；不得反推未公開的 rule、grant、storage 或 runtime implementation。本文件不複製 GitHub schema，也不成為本產品 business truth。

分析 GitHub-like naming、ownership、relationship、locator、viewer/current actor、Repository、Project、Issue、Discussion、Team、Organization、Enterprise 等語意前，先查本索引，再讀對應 upstream 檔案的實際 contract。不得只憑 GitHub Web UI 記憶或一般 best practice 推導。

Upstream：

- Directory: https://github.com/github/docs/tree/main/src/graphql/data/fpt
- 本次核對 revision: `github/docs@03d2e24b34bd88c361f1185f0aae1c46062c6510`
- GraphQL data 是 generated/reference contract；Line_Bot_v1 的 current truth 仍依本 repository 的 code / schema / tests / canonical owner docs。

## Reading model

~~~text
GitHub upstream FPT
├─ category / index
├─ schema capability fragments
├─ common/meta schema
├─ preview / future-change metadata
└─ history / rendered representation
        ↓
observable facts / relationships / projections
        │
        ├─ direct FPT semantic
        └─ canonical GitHub Docs supplement
             only when FPT omits a documented derived result type
        ↓
semantic benchmark graph
        ↓
Line_Bot_v1 owner decision
        ↓
code / schema / tests / canonical docs
~~~

`schema-*.json` 不是「一檔一 bounded context」的證明；它是 GitHub GraphQL documentation data 的 category/capability partition。Line_Bot_v1 只提取 concept boundary、naming、ownership、relationship、locator、current-actor semantics，不引入 Git/SCM/code-hosting-specific capability。

## 49-file index

| # | File | Current FPT information | 開發時代表的語意／用途 |
| --- | --- | --- | --- |
| 1 | `category-map.json` | 全 schema 的 generated category/index map；目前列出 queries、mutations、objects、interfaces、enums、unions、inputObjects、scalars 的名稱→category 對照。 | 先用它找「某個 GraphQL symbol 屬於哪個 capability/category」，不要靠檔名猜 owner。它是導航/index，不是 product schema owner。 |
| 2 | `changelog.json` | 目前此 FPT snapshot 為空內容。 | 預留／generated 的 GraphQL change-history surface；current snapshot 沒有可引用的 change record，不得從空檔推導歷史。 |
| 3 | `graphql_upcoming_changes.public.yml` | 公開 upcoming GraphQL changes；每筆含 `location`、`description`、`reason`、`date`、`criticality`、`owner`。 | 看 breaking/deprecation/future contract，以及「變更由誰負責、何時生效」。它是 future-change signal，不是 current schema truth。 |
| 4 | `previews.json` | 目前為空 object。 | Preview/capability-gate metadata 的 generated surface；current FPT 沒有 active preview payload，不得因檔名假設 preview feature 存在。 |
| 5 | `schema-actions.json` | Actions/Workflow 類型：`Workflow`、`WorkflowRun`、workflow file/reference、state/order 等。 | GitHub Actions workflow/run contract；本專案只在真的分析 CI/workflow semantic 時參考，不映射成 product domain。 |
| 6 | `schema-activity.json` | Star、subscription、notification restriction：`addStar`、`removeStar`、`Starrable`、`Subscribable` 等。 | 「User 對 resource 的 activity/relationship」類型；適合比較 Star/Subscribe 這類關係是否由 resource owner 還是 user context 擁有。 |
| 7 | `schema-apps.json` | GitHub App、Bot、MarketplaceCategory/Listing queries 與 objects。 | Integration/App/Marketplace category；不要把 provider App/Bot 身分誤當產品 User/Account。 |
| 8 | `schema-audit-log.json` | 目前為空 object。 | Audit Log category placeholder/generated partition；current payload 要從其他含 AuditEntry 的 fragments 或 upstream source追，不可從空檔假造 contract。 |
| 9 | `schema-billing.json` | 目前為空 object。 | Billing category placeholder/generated partition；Line_Bot_v1 仍必須分開 Accounting、Billing/Charging、Payment、Settlement，不因檔名建立 umbrella domain。 |
| 10 | `schema-branches.json` | Branch protection、merge branch、bypass/push/review allowance objects 與 mutations。 | SCM-specific branch governance；僅作 owner/rule/bypass relation 參考，不引入 Git branch semantic到產品。 |
| 11 | `schema-checks.json` | CheckRun、CheckSuite、annotation、status/conclusion 與 create/update/rerequest mutations。 | Validation/check execution contract；可參考「result/state/annotation」分離，但不是本產品 business state。 |
| 12 | `schema-code-scanning.json` | 目前只含 `CodeQualityParameters`、`CodeQualitySeverity` 與對應 input。 | Code-quality rule parameter fragment；不是完整 Code Scanning alert model。分析時以實際內容為準，不被檔名誤導。 |
| 13 | `schema-code-security.json` | 目前為空 object。 | Code Security category placeholder/generated partition；current FPT 無可引用 payload。 |
| 14 | `schema-codespaces.json` | 目前為空 object。 | Codespaces category placeholder/generated partition；current FPT 無可引用 payload。 |
| 15 | `schema-collaborators.json` | 目前為空 object。 | Collaborators category placeholder/generated partition；Repository collaborator 的實際 relationship 要看 `schema-repos.json` 等有內容 fragments。 |
| 16 | `schema-commits.json` | Commit、history、comment、signature/status rollup 與 `createCommitOnBranch`。 | SCM Commit capability；可觀察 immutable object/history relationship，但不引入 Git commit semantic到 Line_Bot_v1。 |
| 17 | `schema-copilot.json` | `CopilotEndpoints` object 與 `Agentic` interface。 | AI/Copilot capability fragment；只在分析 agent/provider surface 時參考。 |
| 18 | `schema-dependabot.json` | DependabotUpdate、RepositoryVulnerabilityAlert、dismiss mutation、state/reason。 | Dependency vulnerability automation；可參考 alert lifecycle/owner，不等於本產品 notification model。 |
| 19 | `schema-dependency-graph.json` | Dependency graph manifest/dependency connection/edge 與 ecosystem enum。 | Dependency graph/read-model category；SCM-specific，不映射為產品 Repository dependency。 |
| 20 | `schema-deploy-keys.json` | `DeployKey`、connection、edge。 | Repository deploy-key credential relation；security/integration reference，不是產品 Account identity。 |
| 21 | `schema-deployments.json` | Deployment、Environment、review/protection rule、state；create/update/delete/approve/reject/pin/reorder 等 mutations。 | Deployment/environment lifecycle 與 reviewer/protection relation；適合區分 deployment evidence 和 product state。 |
| 22 | `schema-discussions.json` | Discussion、Category、Comment、Poll、PinnedDiscussion、answer/upvote/open/close/reopen mutations。 | Discussion 是 Repository collaboration resource；用於比較 Issue/Discussion 的獨立 lifecycle與 Repository ownership。 |
| 23 | `schema-enterprise-admin.json` | Enterprise lookup/admin、invitation、member、billing info、identity provider、IP allow list、enterprise organization/team relation、大量 policy/role mutations。 | Enterprise semantic主參考。特別用來核對 Enterprise 是獨立 governance scope，locator 用 `slug`，不要塞入 User/Organization `login` namespace。 |
| 24 | `schema-gists.json` | Gist、GistFile、GistComment、privacy/order。 | Gist resource model；SCM/content-specific，通常不是 Line_Bot_v1 benchmark核心。 |
| 25 | `schema-git.json` | GitObject、Ref、Blob、signature、push、submodule；create/update/delete refs。 | Git protocol/object model；本專案明確不引入 Git/SCM semantic。 |
| 26 | `schema-interactions.json` | 目前為空 object。 | Interaction category placeholder/generated partition；current FPT 無直接 contract payload。 |
| 27 | `schema-issues.json` | Issue、IssueComment、labels、assignee、sub-issue、dependency、milestone/timeline events、fields/type/state，並含大量 issue mutations。 | Issue semantic主參考：Issue 是 Repository-scoped work/collaboration resource；分析 lifecycle、assignee、field、dependency、event 時先讀此檔。 |
| 28 | `schema-licenses.json` | `license` / `licenses` queries、`License`、`LicenseRule`。 | License reference data；SCM/content policy category。 |
| 29 | `schema-meta.json` | `node(s)`、`resource`、`rateLimit`、CodeOfConduct/GitHubMetadata；`Node`、`UniformResourceLocatable` interfaces。 | Cross-cutting GraphQL/meta contract：global node identity、uniform resource location、rate-limit等；不是 business owner。 |
| 30 | `schema-migrations.json` | Organization/Repository migration、MigrationSource、Mannequin、start/abort/grant/revoke/import mutations。 | Migration-state與 current resource 分離的參考；尤其不要把 migration artifact當 current truth。 |
| 31 | `schema-orgs.json` | `organization(login)` query；Organization audit/membership/invitation/outside collaborator/verifiable domain/Enterprise relation等 objects、mutations與 enums。 | Organization semantic主參考。核心 locator 是 `login`；membership、outside collaborator、Enterprise relation需分清不同 facts。 |
| 32 | `schema-other.json` | Common scalars（ID/String/DateTime/URI 等）、`PageInfo`、少量共用 parameters；另有 `id` / `relay` queries。 | GraphQL共用 primitive/pagination類型；supporting contract，不應變成 domain owner。 |
| 33 | `schema-packages.json` | Package、PackageVersion、PackageFile、statistics/tag、PackageOwner、deletePackageVersion。 | Package Registry semantic；SCM/package-hosting-specific。 |
| 34 | `schema-pages.json` | 目前為空 object。 | GitHub Pages category placeholder/generated partition；current FPT 無直接 payload。 |
| 35 | `schema-projects-classic.json` | Classic `Project`、ProjectColumn、ProjectCard、ProjectOwner 與 card/column/project CRUD/link mutations。 | **Projects (classic)** 舊模型。不得拿它代表 current GitHub Projects；可作 historical/legacy對照。 |
| 36 | `schema-projects.json` | Current ProjectV2：ProjectV2、Item、Field、View、StatusUpdate、owner/actor、draft issue 等大量 mutations/types。 | **Current Projects semantic主參考**。Project 是跨 resource 的 planning/management boundary；不要把 Project 等同 WBS。 |
| 37 | `schema-pulls.json` | PullRequest、review/thread/comment、merge queue、draft/merge state、requested reviewer、timeline等。 | Pull Request collaboration/SCM review model；通常只取 workflow/review relationship概念，不引入 code-review product semantic。 |
| 38 | `schema-reactions.json` | Reaction、ReactionGroup、Reactable、Reactor、add/remove reaction。 | Cross-resource reaction relation；可參考 capability interface如何跨 resource reuse。 |
| 39 | `schema-releases.json` | Release、ReleaseAsset、connections/order。 | Release artifact model；SCM/release-specific。 |
| 40 | `schema-repos.json` | `repository(owner,name)`、`repositoryOwner(login)`、topic queries；Repository rules/settings/custom properties、RepositoryOwner/RepositoryInfo interfaces等。 | **Repository semantic核心參考**。Repository owner lookup 是 `User | Organization` by `login`；canonical resource identity可由 owner login + repository name推導。 |
| 41 | `schema-scim.json` | 目前為空 object。 | SCIM category placeholder/generated partition；current FPT 無直接 payload。 |
| 42 | `schema-search.json` | `search` query、SearchResultItem union、result connection/edge、text match/highlight、SearchType。 | Search 是跨 resource read/query capability，不是新的 domain owner或第二套 resource truth。 |
| 43 | `schema-secret-scanning.json` | 目前為空 object。 | Secret Scanning category placeholder/generated partition；current FPT 無直接 payload。 |
| 44 | `schema-security-advisories.json` | SecurityAdvisory、SecurityVulnerability、CVSS/CWE/EPSS與 advisory/vulnerability queries。 | Security advisory/vulnerability reference model；區分 advisory catalog與 Repository-specific alert。 |
| 45 | `schema-sponsors.json` | Sponsorable、Sponsor、Sponsorship、SponsorsListing/Tier/Goal/Activity 與 create/cancel/update mutations。 | Sponsorship financial relationship；只作 relation/ownership參考，不將其 Billing/Payment semantics直接移植。 |
| 46 | `schema-teams.json` | Organization Team、member/repository relation、TeamRole/Privacy/Notification、Team audit與 `updateTeamsRepository`。 | Team semantic主參考之一。Team 是 Organization-scoped collaboration entity；需和 EnterpriseTeam、OrganizationMembership、RoleAssignment分開。 |
| 47 | `schema-users.json` | `user(login)`、`viewer` queries；User profile/contribution/list/follow/status等；`viewer` description是 currently authenticated user。 | **User semantic核心參考**：User locator 是 `login`；`viewer` 是 current authenticated User context，不是 `Me` entity，也不需要第二個 self resource namespace。 |
| 48 | `schema.docs.graphql` | 完整、可讀的 GraphQL schema representation（目前約 1.55 MB）。 | Whole-model / cross-fragment relationship evidence；先理解完整 graph，再用 category fragments 作 consumer-specific projection，不把單一 `schema-*.json` 誤認成獨立 product authority。 |
| 49 | `upcoming-changes.json` | 依日期分組的 future/breaking change index；目前 keys從 2019 到 2027。 | Machine-readable upcoming/deprecation timeline。和 public YAML一起判斷 future contract，但不可把 future state當 current schema。 |

## High-value semantic lookup

做 Line_Bot_v1 GitHub-like設計時，優先查下列 upstream fragments，而不是把 49 檔全部平均閱讀：

| 問題 | 先讀 |
| --- | --- |
| User locator / current authenticated actor | `schema-users.json` |
| Profile / Followers / Following / owned Repositories | `schema-users.json`：`ProfileOwner`、`ProfileItemShowcase`、`User.followers`、`User.following`、`User.repositories` |
| Observable contribution facts / time / repository context | `schema-users.json`：`ContributionsCollection`、`CreatedRepositoryContribution`、`JoinedGitHubContribution` |
| Membership role / collaboration permission / invitations | `schema-users.json`：`OrganizationMemberEdge.role`、`TeamMemberEdge.role`、`RepositoryCollaboratorEdge.permission`；`schema-enterprise-admin.json` / `schema-orgs.json` / `schema-repos.json` invitation objects |
| Work Item type / comments | `schema-issues.json`：`IssueType`、`Issue.issueType`、`IssueComment`、`Issue.comments` |
| Cross-content reaction | `schema-reactions.json`：`Reaction`、`Reactable` |
| Project-owned field / status / view | `schema-projects.json`：`ProjectV2.fields`、`statusUpdates`、`views` |
| Achievement derived recognition | canonical `content/account-and-profile/reference/profile-reference.md#earning-achievements` + FPT contribution facts；FPT 本身沒有 Achievement result type |
| Organization locator / membership / outside collaborator | `schema-orgs.json` |
| Repository owner / canonical owner+name identity | `schema-repos.json` |
| Enterprise governance / slug / Enterprise Team | `schema-enterprise-admin.json`：`enterprise(slug)`、`Enterprise.enterpriseTeam(slug)`、`EnterpriseTeam.slug` |
| Team / Organization Team | `schema-teams.json` + `schema-orgs.json`：`Team.slug`、`Organization.team(slug)`；GitHub REST docs補充 slug由 Team name產生 |
| Current Projects | `schema-projects.json` |
| Legacy Projects comparison | `schema-projects-classic.json` |
| Issue lifecycle / fields / relationships | `schema-issues.json` |
| Discussion lifecycle | `schema-discussions.json` |
| Search across resources | `schema-search.json` |
| Cross-cutting Node / URL / rate limit | `schema-meta.json` |
| Future breaking/deprecation | `graphql_upcoming_changes.public.yml` + `upcoming-changes.json` |
| Symbol → category lookup | `category-map.json` |

## Core semantic deductions currently used by Line_Bot_v1

以下是從上述 source直接支持、且目前對產品設計有用的 benchmark；實際 Line_Bot_v1 current truth仍回各 Domain Owner與 machine source確認。

~~~text
User
├─ locator: login
├─ current authenticated context: viewer
├─ follows → User
│  ├─ following = outbound view
│  └─ followers = inbound view
├─ repositories = inverse collection view of Repository.owner
├─ contributionsCollection → observable fact collection
└─ profile = read projection (`ProfileOwner` / `ProfileItemShowcase`), not a separate lifecycle entity

Organization
└─ locator: login

RepositoryOwner
├─ User
└─ Organization
   └─ lookup by login

Repository
├─ owner: User | Organization login
└─ name

Contribution facts
├─ actor → User
├─ context → Repository when the FPT fact exposes one
└─ time → occurredAt

Achievement
├─ documented by canonical Profile reference as recognition from specific events/actions
├─ contributing events may occur in Repository / Organization context
├─ projected on User Profile
└─ FPT does not expose AchievementDefinition / QualificationRule / Grant / Progress

Enterprise
└─ locator: slug

ProjectV2
└─ planning / management entity
   ≠ WBS
~~~

因此：

- `viewer` 是「目前 authenticated User」解析上下文，不是 `Me` business entity。
- User 與 Organization 都使用 `login`；RepositoryOwner 也是依 `login` lookup。
- Enterprise 使用自己的 `slug` semantic，不加入 RepositoryOwner login namespace。
- Repository lookup 明確依 `owner + name`，其中 owner 是 User/Organization login。
- `following` / `followers` 是同一條 User→User follow relationship 的 outbound / inbound view，不是兩個 business entity。
- `User.repositories` 是 owned Repository 的 collection view；canonical ownership 仍由 `Repository.owner` 表達。
- Profile 是 User semantic 的 projection；`ProfileOwner` / `ProfileItemShowcase` 不代表獨立 Profile lifecycle owner。
- Achievement 是 canonical docs 明確描述的 derived recognition；FPT 提供 observable contribution facts，但沒有公開完整 achievement rule/grant/progress contract。
- `schema-projects.json` 與 `schema-projects-classic.json` 是不同 generation；做 current Project 設計不能拿 classic model當 authoritative benchmark。

## Derived general-management semantic graph

Machine-readable projection: [`architecture/semantic-benchmark.json`](../../architecture/semantic-benchmark.json).

這份 graph 是 **derived benchmark，不是 Line_Bot_v1 product truth**。Primary machine-readable authority 是 pinned GitHub FPT；只有 FPT 未公開 result type、但 GitHub canonical docs 明確描述的 derived semantic，才可列入 `supplementalEvidence`。Product adoption 必須由 [`architecture/semantic-model.json`](../../architecture/semantic-model.json) 的 explicit mapping 宣告；implementation projection 則由 [`architecture/implementation-topology.json`](../../architecture/implementation-topology.json) 擁有。

### Modeling rule

Graph 只保留會改變一般管理責任判讀的 semantic：

~~~text
Entity / Fact / Contract
Relationship + relationship attributes
Pending relationship intent
Projection / View
Derived Result
~~~

Connection wrapper、pagination edge、UI-only collection、software-development-specific resource 不因存在於 FPT 就升格成 Node。

Graph Edge 表示 upstream 支持的 semantic relationship possibility，不重新編碼 GraphQL nullability／cardinality；optional / multiplicity 仍以 pinned source field 為 authority。

### Governance and access

~~~text
Enterprise
├─ Organization
├─ Enterprise Team
├─ Member relationship
└─ EnterpriseMemberInvitation ─invites→ User

Organization
├─ Team
├─ Repository
├─ Member ─{role}→ User
└─ OrganizationInvitation ─{pending-role}→ Organization / User

Repository
├─ owner → User | Organization
├─ collaborator ─{permission}→ User
└─ RepositoryInvitation ─{pending-permission}→ Repository / User
~~~

`role` / `permission` 是 relationship attribute，不是 User identity；Invitation 是 pending relationship intent，不等於 active Membership / Collaboration / Authorization。

Invitation 的 invitee / inviter 在部分 FPT type 為 nullable；Reaction.user 也為 nullable。Graph 關係只表示可成立的 semantic relation，不得把 Edge 存在誤讀為欄位必定 non-null。

### Profile and social views

`ProfileOwner` / `ProfileItemShowcase` 支持 Profile semantic，但沒有獨立 Profile lifecycle owner；`user-profile` 保持 read projection。

`User.following` / `User.followers` 是同一條 `User ─follows→ User` 的 outbound / inbound view。`User.repositories` 是 `Repository.owner` 的 inverse collection view；不建立 `Followers`、`Following`、`Repositories` duplicate Node。

### Contribution facts and Achievement

FPT 本身已有 `Contribution` interface，且由多種 concrete contribution type 實作；因此 graph 現在保留一個有真實 variation 的 `contribution` fact contract：

~~~text
Contribution
├─ actor: User
├─ occurredAt
├─ restricted visibility
│
├─ RepositoryContribution
├─ WorkItemContribution
└─ JoinedUserContribution
~~~

只納入 general-management 有用的 concrete facts；Commit / Pull Request / Review contribution 仍屬 software-development-specific projection，不因它們實作 Contribution 就移植。

GitHub canonical Profile reference 將 Achievement 描述為由特定 events/actions 形成、並連回 contributing events 的 profile recognition。FPT 沒有 `AchievementDefinition` / `QualificationRule` / `AchievementGrant` / `AchievementProgress` result type，因此：

~~~text
observable Contribution facts
+ actor
+ context
+ time
      ↓
qualification / aggregation   # public contract 未公開完整規則
      ↓
Achievement                   # derived result
      ↓
User Profile                  # projection
~~~

Graph 只證明可觀察 facts 與 derived-recognition boundary；不得把未公開規則當 GitHub 已證實的 runtime architecture。

### Work collaboration

~~~text
Repository
└─ Work Item
   ├─ WorkItemType
   ├─ Label
   ├─ Milestone
   ├─ dependency / assignee / project relation
   └─ WorkItemComment
~~~

`WorkItemType ≠ Label ≠ Status ≠ Milestone`。`IssueType` 是 Organization-scoped definition；Work Item 透過 `issueType` 指向 type。`IssueComment` 被蒸餾為 WorkItemComment，使 Work 與 Discussion 兩條 collaboration path 都有 comment semantics。

### Reactions

`Reaction` 是 timestamped interaction fact：

~~~text
Reaction
├─ made-by → User
└─ targets → Reactable content
             ├─ Work Item
             ├─ WorkItemComment
             ├─ Discussion
             └─ DiscussionComment
~~~

Reaction 是 interaction signal，不等於 approval、authorization 或 business vote。`ReactionGroup` 是 aggregation/read shape，不建立第二個 interaction truth。

### Project-owned planning metadata

~~~text
Project
├─ contains → ProjectItem
├─ defines → ProjectFieldConfiguration
├─ records → ProjectStatusUpdate
└─ projects-as → ProjectView (read projection)
~~~

Project Field / Status Update / View 是 Project-owned planning metadata，不複製 underlying Work truth。`ProjectV2Workflow`、Iteration、UserStatus、DiscussionPoll 等 FPT semantics 目前仍 defer；沒有 general-management consumer 前不為對稱而加入。

### Source rules

1. Node / Edge / Projection / observable fact 必須引用 pinned FPT symbol；Edge 必須引用 `symbol + field`。
2. 真實 FPT interface variation 才可建立 fact contract；concrete fact 用 `implements` 指向 contract。
3. Membership / collaboration 的 `role` / `permission` 保存為 Edge attribute，不另建無 lifecycle 的 Role/Permission owner。
4. Invitation 保存 pending relationship intent；pending role/permission 不得被當成 active authorization。
5. Derived result 若 FPT 無 result type，只能引用同 revision 且已宣告在 `supplementalEvidence` 的 canonical GitHub Docs。
6. Git / branch / commit / pull request / checks / Actions / deployment / package registry / software security 仍排除。
7. `Attendance / ClockIn / Payroll / Expense / Task / Announcement` 等 Line_Bot_v1-specific concept 不因外部 benchmark 存在就自動進 graph。
8. Graph 不描述 package、database、table、adapter topology；implementation 仍由 `architecture/implementation-topology.json`、public exports、schema、source、tests 擁有。
9. `scripts/architecture/check-semantic-benchmark.mjs` 驗證 benchmark provenance/boundary；`scripts/architecture/check-semantic-architecture.mjs` 再驗證 product adoption、ownership、relationship、implementation mapping 與 dependency resolution。

## Usage rules

1. 遇到 GitHub-like semantic decision，先從本索引定位 relevant FPT file，再讀 upstream current content。
2. 不能只因某個 `schema-*.json` 檔名存在就宣稱 capability存在；空 fragment必須明示 empty。
3. `category-map.json` 用於導航；schema fragment用於 current contract；upcoming/previews/changelog用於 change-over-time。三者不可互相代替。
4. GitHub GraphQL schema 是主要 machine-readable semantic benchmark；canonical GitHub Docs 只補 FPT 未公開的 documented derived semantic。兩者都不是 Line_Bot_v1 runtime/API/schema 的第二套 Source of Truth。
5. 只提取與產品相符的 owner、relationship、locator、lifecycle、information architecture；Git/SCM/code-hosting-specific能力不因 GitHub存在就引入。
6. 若 upstream `main` 與本文件描述衝突，以 upstream current content重新核對並更新本索引；更新時記錄新的 upstream revision。
