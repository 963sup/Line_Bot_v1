# Selected security target

狀態：selected future security design，不是 current authorization/data isolation/audit implementation claim。Current security contract 見 [Security](../../050-security/README.md)。

## Target authorization

狀態：已選定的 target security contract。Current Enterprise／Organization／Organization Team RoleAssignment、Enterprise Team membership/Organization assignment 與 Organization membership provenance 已有 source；EnterpriseTeam 作為 role principal、Bot delegation、Workforce/Payroll authorization 與完整 policy evaluation 尚未完成。Current feature permissions 與 runtime 仍由 [Feature permissions](../../050-security/030-authorization.md) 和 [Request authorization](../../050-security/030-authorization.md) 描述。

## Authorization chain

```text
verified identity proof
        ↓
trusted PrincipalId / actual AccountKind
        ↓
current principal qualification / explicit delegation
        ↓
scoped RoleAssignment → Role → Permission
        ↓
authoritative resource / Enterprise / Organization / Organization Team / Employment scope
        ↓
owner lifecycle / business invariant / expected version
```

AccountId 只定位；AccountKind 也不授權。Requested account、scope、role、UI、URL、LINE group、provider metadata、RLS 命中不能跳過本鏈。Organization selection 只改 acting scope，不把 OrganizationAccount 偽裝成 actor。

## Principal, participation and authority

PrincipalId 使用 UserId 或已核定 BotId 的 AccountId 值，不產生第二 identity table。Actor 是實際 command/query caller；subject 是命令針對的人／Employment／resource；scope 是 Enterprise/Organization/Organization Team/Project；holder 是 value owner。Human responsibility 仍使用 User/Employment，Principal 泛化不讓 Bot 自動成為 Employee、DailyCheckIn 領取者或 Team member。

Participation 與 authority 必須分離：

```text
Invitation ≠ Membership/Affiliation source ≠ Effective Membership ≠ RoleAssignment
```

- Enterprise direct participation 是 `EnterpriseDirectAffiliation`，不是 `EnterpriseMembership`。
- Organization participation 的 direct source 是 `OrganizationDirectMembership`；effective participation 是 `OrganizationMembership`；pending request 由 `OrganizationInvitation` 擁有。
- Enterprise Team assignment 可以形成 `enterprise-team` Organization membership source；direct 與多個 Team-derived sources 可共存。
- Organization Team participation 是 `TeamMembership`；`TeamMaintainer` 是獨立 scoped RoleAssignment。
- Membership/Affiliation 可作 role eligibility，但本身不授予 owner/maintainer authority。

GitHub benchmark 顯示某些 Organization roles 可授予 User 或 Team，因此 RoleDefinition 必須聲明各 role 支援的 principal kinds；這不代表所有 Organization roles 都可授予 Team。Membership-level `OrganizationOwner` 只可由 active individual Organization member 持有，Organization Team 或 Enterprise Team 不可整體成為 Owner。

## Identity / Access model

Identity/Access 擁有 Role、Permission、RoleAssignment 與 AccessDecision 模型；Domain owner 擁有 participation、資格、操作與 invariant。Current typed roles 為 `EnterpriseOwner`、`OrganizationOwner`、Organization Team 的 `TeamMaintainer`；RoleAssignment 是 role grant writer。Organization Team 的 typed scope literal 是 `organization-team`，不再用 generic `team` 混淆 EnterpriseTeam。

Current principal policy：

| Role | Scope | Principal | Eligibility |
| --- | --- | --- | --- |
| EnterpriseOwner | Enterprise | User | active User + active direct Enterprise affiliation |
| OrganizationOwner | Organization | User | active User + active effective OrganizationMembership |
| TeamMaintainer | organization-team | User | active User + active OrganizationMembership + active TeamMembership |

未來 additive Organization roles 可以依 GitHub-like role definition 支援 Organization Team principal；不可為了泛化 principal 而讓 `OrganizationOwner` 也接受 Team。Enterprise Team 未來若成為某些 role 的 principal，也必須由 role-specific principal policy 明確允許，不能因 Team 已存在就自動取得 authority。

## Enterprise users and Enterprise Team

Effective Enterprise user 可以來自：

```text
direct Enterprise affiliation
OR
active membership in an attached Organization
```

因此 direct affiliation 不是「Enterprise member」的同義詞，也不是 EnterpriseOwner authority。Current `EnterpriseOwner` 比 effective Enterprise user 更嚴格：必須保有 active direct affiliation；Organization-derived affiliation 本身不維持 root authority。

Current Enterprise Team slice：

- Team member 必須先是 active effective Enterprise user；direct-affiliated unaffiliated user 或 attached Organization-derived user 都可加入。
- Team 只能被 assigned 到同 Enterprise 的 active attached Organization。
- assignment 使 active Team members 取得 `enterprise-team` Organization membership source，且不需要先接受 Organization invitation。
- `organization_direct_memberships` 保存 direct source；`organization_membership_sources` 聚合 direct + Enterprise Team sources；`organization_memberships` 保存 effective participation epoch/version。
- 撤銷某一 Team membership 或 assignment 只移除該 source；仍有其他 direct/Team source 時 effective OrganizationMembership 必須保留。
- source removal 不能繞過 OrganizationOwner 等 membership-bound authority invariant；必要時先拒絕 mutation。

GitHub Enterprise Team 還可涵蓋 outside collaborator 等語意；本專案 current slice 尚未有 resource-level outside-collaborator owner，因此不以放寬 User/affiliation gate 假裝完成。

## Policy evaluation

Policy 內容與 lifecycle 由 Enterprise／Organization／Workforce／Billing 等業務 owner 擁有，Identity/Access 消費有效 decision。Policy 可以縮小已授予 capability，不能憑空產生 Permission。必要 version 缺失、衝突或無法判定時 fail closed；目前不預建 generic DSL/rules engine。

## Responsibility ownership

| Responsibility | Authority owner / scope | 不自動授予 |
| --- | --- | --- |
| User qualification | Account lifecycle/version | Organization access、Employment、feature permissions |
| Enterprise direct affiliation | Enterprise participation | EnterpriseOwner、Organization private access、Payroll |
| EnterpriseOwner | Identity/Access Enterprise-scoped Role；Enterprise 定義 direct-affiliation eligibility | Organization private access、TeamMaintainer、Payroll |
| EnterpriseTeam | Enterprise participation owner；current membership + Organization assignment | EnterpriseOwner、OrganizationOwner、Organization Team role |
| Organization membership source | Organization/Enterprise owner依 source kind維護 provenance | OrganizationOwner、Employment、Organization TeamMembership |
| OrganizationMembership | Organization effective participation | OrganizationOwner、Employment、Organization TeamMembership |
| OrganizationOwner | Identity/Access Organization-scoped Role；active individual Organization member | EnterpriseOwner、Payroll、TeamMaintainer |
| Organization TeamMembership / TeamMaintainer | Team participation + Identity/Access `organization-team` scoped Role | Organization-wide owner、Employment、EnterpriseTeam authority |
| Employment | Workforce work relationship | 系統存取或管理權限 |
| Payroll management / approval | Payroll-specific operations | 全域 owner 或 Finance payment authority |
| Asset holding | Wallet holder eligibility | Ledger posting/transfer permission |

## Bootstrap and recovery authority

Enterprise/Organization root creation 不是 generic create-account。Current runtime 允許 active User 透過 owner command 建立新 scope；DB private provisioning coordinator 在同一 transaction 建立 Account facet、首次 participation/affiliation 與 Owner RoleAssignment，且 command receipt/replay 綁 actor + requestId。Operator bootstrap 僅保留 recovery／administrative provisioning，並重用同一 coordinator；browser/provider identity 本身仍不能直接取得 root authority。Organization 可獨立存在；Enterprise governance 不授予 Organization private writer。

一般 Owner／TeamMaintainer 移除或降權不得讓 active scope 失去可治理責任人。Organization membership source removal 也必須先保護 membership-bound Owner invariant。上游 User 安全停權造成 owner/maintainer eligibility 失效時 fail closed 並走受控 recovery，不自動任命。Recovery 保存 reason、operator、before/after version、request identity 與 evidence。

## Bot delegation

BotAccount 存在不構成 Permission。未核定 automation use case、credential issuer、provisioning/delegation/tests 前新的自主 Bot operation 不啟用。人類透過 LINE 發起的 command 仍以 verified User 為 Principal；destination/channel credential 不換 actor。

啟用 delegation 後至少要有 stable delegation ID、botId、grantorUserId、scope、operations、effective period、status/version 與 revoke evidence；credential rotation 不換 BotId，不支援遞迴 delegation、wildcard 或跨 scope fallback。

## Revocation, Workforce and Payroll

Sensitive mutation 的 qualification／role／scope 與 write 需以 transaction locking、version 或等價方式防 TOCTOU。Restore/reactivation 不復活 revoked grant／removed membership source/affiliation/delegation。JWT/cache/session 不作永久 authority。

Employment person 必須是 User；Workforce 提供工作關係與 effective facts。一般 User 只讀本人 Employment 關聯且 published 的 PayStatement；read/calculate/approve/finalize/publish 分離授權，EnterpriseOwner／OrganizationOwner／TeamMaintainer 都不是充分條件。

HolderAccountId 不是 PrincipalId。Coin 首版 eligibility 仍僅 USER；Ledger posting 消費 Wallet eligibility 與 originating module authorized decision。非 USER holder、transfer/payment 不因 FK 存在而啟用。

## Failure / audit / acceptance

Unauthenticated、not-qualified、forbidden、kind/scope mismatch、version/replay conflict、delegation expired/revoked、upstream unavailable、unknown result 保留為可區分結果；authorization source 不可用時 fail closed。

[Target audit](040-security-target.md) 保存 actor、scope、subject、authority/delegation evidence、reason/result/version/request identity。未完成 EnterpriseTeam principal assignment、outside collaborator/resource access、Bot、Workforce、Payroll、policy 能力的測試與 activation gates 見對應 Governance gaps；既有 current governance source 不因本 target 文件被降回「尚未實作」。


## Target data scope

狀態：Enterprise/Organization/Organization Team 與 Enterprise Team membership/Organization assignment provenance 的部分 scope enforcement 已有 current source；本文件主要固定尚未完整落地的 outside collaborator/resource access、Employment/Payroll 與 cross-scope contract。Current enforcement 見 [Current isolation](../../050-security/040-scope-and-data-isolation.md)。Data Boundary 不是 Bounded Context 或 Code Module，Account identity namespace 也不是 tenant tree。

## Scope model

```text
Enterprise governance scope (optional for Organization)
    ├─ Enterprise Team / cross-Organization grouping [current slice]
    ↓ governed relationship, not permission inheritance
Organization scope
    ├─ effective OrganizationMembership
    │   ├─ direct source
    │   └─ enterprise-team source(s)                [current]
    ├─ Organization Team / collaboration scope      [current]
    ├─ Workplace / Project scope                     [owner contract]
    └─ Employment → Attendance / Payroll             [target]
```

Organization 可獨立；上層 Owner 不自動讀下層 private data。Account root 只是 identity，User 可以跨多 scope。Personal Wallet、Expense owner、Repository access 與 Notification recipient scope 不因新增 Organization 自動轉移。

## Principal / subject / holder

PrincipalId 定位可信 User 或核定 Bot。Requested Organization/Enterprise 是 acting scope，User/Employment 是 human/work subject，HolderAccountId 是 value owner；不能互相替代或據此授權。

Participation relations各有 owner：`EnterpriseDirectAffiliation`、`EnterpriseTeamMembership`、`OrganizationDirectMembership`、effective `OrganizationMembership`、Organization `TeamMembership`、Employment。Pending Enterprise/Organization join intent 由 Invitation 擁有，不塞進 Membership/Affiliation lifecycle。Current scoped authority 使用 `EnterpriseOwner`、`OrganizationOwner`、`TeamMaintainer`。Active User 不等於任一 participation/Employment；BotAccount 不作 human participant/Employment person。

## Enterprise isolation

Organization 只有在 authoritative EnterpriseOrganization relation 下才視為 Enterprise governance 範圍。`EnterpriseOwner` 只具 Enterprise governance capability；不因 role 或 direct affiliation取得 Organization private read/write。Policy 可限制下游，但不能憑空產生下游 Permission。Detach/deactivate 後新 command fail closed、歷史引用與 Organization isolation 保留。

Effective Enterprise user 可以由 active direct affiliation 或 attached Organization 的 active OrganizationMembership 得出；direct affiliation 不等於 Enterprise membership。Current `EnterpriseOwner` authority 額外要求 active direct affiliation，不由 Organization-derived affiliation 維持 root authority。

Current EnterpriseTeam 保存 immutable EnterpriseAccountId，與 Organization Team 不共用 membership/maintainer writer。EnterpriseTeam 只可被 assign 到同一 Enterprise 的 active attached Organization；assignment 對 active Team members形成 `enterprise-team` Organization membership source。這個 source 不等於 OrganizationOwner、TeamMaintainer 或 blanket Enterprise access。

## Organization and Organization Team isolation

Organization-scoped resource 保存或 authoritative resolve OrganizationAccountId。涉及多 resource 的 command 驗 scope 一致，必要時由 DB constraint + transaction 保護。

Organization participation 目前分成 source 與 effective relation：

```text
OrganizationDirectMembership ─┐
EnterpriseTeam source(s) ──────┼─> OrganizationMembership
                               └─> membership version/eligibility
```

多個 sources 可共存；撤銷一個 source 只能移除該來源帶來的 participation，仍有其他 source 時 effective OrganizationMembership 必須保留。沒有任何 source 時才可轉為 removed。Source removal 若會使 membership-bound OrganizationOwner 失去必要 qualification，mutation 必須先拒絕或完成合法責任轉移，不能用 cascade 繞過 invariant。

Current Organization Team 保存 immutable OrganizationAccountId。TeamMembership 只表示 Team participation；`TeamMaintainer` 是獨立 scoped RoleAssignment。Organization 提供 lifecycle/OrganizationMembership qualification，不直接寫 Organization Team private state。

`OrganizationOwner` principal 必須是 active individual effective Organization member；Organization Team 或 Enterprise Team 不可整體成為 Owner。未來若某 additive Organization role 支援 Team principal，由該 RoleDefinition 明示，不改寫 membership-level Owner invariant。

`WorkGroup` 只作 legacy/history literal，不再是待完成的 Team Data Boundary migration。

## Employment isolation

Working fact 使用 EmploymentId，不用 UserId alone 合併授權。Workforce 提供 person/scope/effective period；Attendance/Payroll 保存 source version。Current Team/Workplace 不可推歷史 Employment scope；unknown provenance 保留 unresolved。

Ended/suspended Employment 與 historical read 是不同問題；新 write 重驗，historical self-read 需 owner policy。沒有決策不由 Account restore 或 membership removal 默認授權/刪除。

## Holder isolation

Wallet 查 HolderAccountId + AssetCode，但 caller 是否可讀仍需 authorization；知道 AccountId 不等於 self-read。Coin 首版只允許 USER holder。Ledger post 需 originating module decision、Wallet eligibility 與 restricted posting contract；scope 切換不讓個人 value 變 Organization value。

## Enforcement and revocation

`proof → trusted Principal → current qualification/affiliation/delegation → RoleAssignment → authoritative scope → business invariant`。Application、DB constraints、RLS/grants 共同 enforce；elevated connection 的技術能力不是 business permission。

Invitation 本身不授權。Qualification/role/delegation revoke、affiliation removal 或 membership-source removal 後，新 sensitive operation 不得使用舊 projection/JWT/receipt 寫入。Concurrent revoke/mutation 需可驗證 serialization/version；cache 不 fallback 成 authority。Enterprise Team membership/assignment、Organization membership refresh 與 owner protection 必須維持同一 transaction boundary。

## Migration and acceptance

未知 scope 不猜 default Organization；缺 upstream identity/ownership/eligibility fail closed。EnterpriseTeam + membership provenance 已完成 current slice；outside collaborator/resource access 與 Employment/Payroll cutover 依 [Migration gates](../030-migrations/040-enterprise-organization-workforce-payroll.md) 分 slice 驗證。既有 Enterprise/Organization/Team current source 不因 target 文件存在被重做第二套 writer。


## Target audit

狀態：target audit design。Enterprise／Organization governance 已有 current receipt/audit source/schema/runtime；EnterpriseTeam、Bot delegation、Workforce/Payroll 等未完成 capability 的 audit coverage 仍是 target。Audit 保存必要 evidence，不取代 business history、command receipt、DomainEvent、Ledger 或原始資料讀權。

## Audit ownership

AuditEvent 是已發生行為的不可變紀錄；AuditLog 是依明確 scope、讀取權限與 retention policy 呈現的紀錄集合。Enterprise 與 Organization 是治理／查詢 scope，不是兩套可以改寫同一 event 的 writer。Domain owner 決定應記錄的業務事實；Audit owner 決定保存、最小欄位與受控讀取，不取代原 Domain history。

Current governance receipt/audit 覆蓋 Enterprise/Organization lifecycle、人員 invitation/affiliation/membership 變更、EnterpriseOrganization relation 與 typed RoleAssignment mutations。未來 EnterpriseTeam、additive/custom Organization roles、managed-account 管理模式、Billing subscription 等只有在 capability 落地時才新增相應 evidence，不預建假 event。

## Minimal context

高影響 operation 至少能定位：actual Principal、scope/target identity、operation、reason、outcome、occurredAt、request/command identity、before/after 或 source version reference，以及必要 authority/delegation reference。

Actor、subject、holder、scope 不同：User/Bot 才是 actual Principal；Organization/Enterprise workspace 不是 actor。Delegated Bot operation 另保存 Bot、grantor User 與 delegation/version，不能只記 Organization。

人類 LINE command 的 actor 保留 source User；接收／回覆的 BotAccount 作必要 delivery context，不取代人類 actor。只有 Bot 自主發起的已核定 operation 才使用 Bot Principal；channel token、secret 與完整 webhook payload 不寫入 audit。

Operator bootstrap/recovery 可能不是產品 Principal；保存真實受控 operator identity 與 approval/request evidence，不造假 User/BotAccount 來填 actor 欄位。確切 representation 由 Data implementation 定案，但不能丟掉操作者。

## Governance vocabulary in evidence

```text
Invitation ≠ Membership/Affiliation ≠ RoleAssignment
```

Audit 必須記錄實際操作的 owner concept：

- Enterprise：`EnterpriseInvitation`、`EnterpriseDirectAffiliation`、effective Enterprise user、EnterpriseOrganization、`EnterpriseOwner`。
- Organization：`OrganizationInvitation`、`OrganizationMembership`、`OrganizationOwner`。
- Organization Team：`TeamMembership`、`TeamMaintainer`。

`OrganizationOwner` 只屬 active individual Organization member；不存在 Team-as-Owner audit 語意。未來某 additive Organization role 若允許 Team principal，audit 記錄該 role 與 principal kind，不將它改寫成 Owner。

## Coverage

| Owner | Required high-impact evidence |
| --- | --- |
| Account | register、pause/restore、suspend/unsuspend、identity link confirmation/change、Bot enable/disable（啟用後） |
| Identity/Access | feature permission、RoleAssignment、delegation grant/revoke、operator bootstrap/recovery |
| Enterprise | lifecycle、Invitation/DirectAffiliation、EnterpriseOwner、Organization attach/detach 雙方 authority/consent、policy publish/supersede |
| Organization | lifecycle、Invitation/Membership、OrganizationOwner、OrganizationPolicy publish/supersede/retire 與適用版本、經核定 scope correction |
| Team | TeamMembership/TeamMaintainer 變更與 last-maintainer 拒絕原因；Repository/Issue responsibility 不由 Team audit 代管 |
| Workforce | Employment/terms/effective policy/calendar/schedule publish/correction |
| Attendance | correction、period finalize/re-finalize、對既有 Payroll input 造成的新 version |
| Payroll | calculate/recalculate/approve/finalize/correct/publish 與 input/version trace |
| Ledger | 維持既有 immutable value/source contract，不以新 audit 取代其帳本 fact |

高敏感拒絕（cross-scope、revoked authority、replay conflict、wrong kind）需有最小可追查 evidence，不預設記錄所有一般 read/聊天/定位。

## Transaction and failure

正式 business mutation 所必需的 audit/history/receipt 與 state 同 transaction；無法保存必要 evidence 時 rollback，不允許「audit 失敗但高敏感寫入照做」。外部 log/delivery 不是該 transaction authority，不因 telemetry outage 回滾已 commit 結果。

Denied-operation security logging 不能提升權限或將 deny 改 success；與 business-success audit 分開。未知結果用原 request/readback 查證，不把 log 缺失當作 rollback 證據。

## Privacy / access / retention

不記 access token、API key、secret、完整 provider payload、完整薪資 snapshot 或不必要 PII。必要 scope/source/version reference 可定位原資料，但讀原件仍需獨立授權。

Audit read 本身需 capability；`OrganizationOwner`／`EnterpriseOwner` 不自動讀任意 private audit。Retention、legal hold、export/delete 需產品/法規 owner 定案，不填假期限。

Immutable audit/history 一般 runtime 無任意 update/delete；Account link/lifecycle 或 data owner 名稱改變不改寫舊 actor/source。Old receipts/fingerprints 不為 Account rename 或 governance vocabulary cutover 重新計算。

## Validation / neighboring owners

需測真正 actor 與 scope 分離、operator evidence、RoleAssignment revoke、atomic state+audit、replay 不重複、failure 不洩 secret、audit read 與 source privilege 不互推、history 不被 rekey/刪除。

[Authorization](040-security-target.md)、[Persistence](030-data-target.md)、[Migration](../030-migrations/040-enterprise-organization-workforce-payroll.md) 各擁有 mechanism/gate；本文件只把 current governance audit 與仍未完成的 target coverage 分開，不等於所有 target audit 已通過驗收。

