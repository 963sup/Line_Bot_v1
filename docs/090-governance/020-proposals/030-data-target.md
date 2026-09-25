# Selected data target

狀態：selected future data design，不是 current database truth。Current schema authority remains `supabase/schemas/`; current human-readable data contract 見 [Data](../../040-data/README.md)。

## Target data model

狀態：Account/User、Enterprise/Organization governance、Enterprise Team + Organization membership provenance、Organization-scoped Team 與 USER holder 的部分 target 已成 current source；Workforce/Employment、Attendance Employment cutover、Bot/Managed User/Billing/Payroll data 與 outside collaborator/resource access 仍按 target gate。Current desired schema 以 `supabase/schemas/` 為準；本文不以 source existence 代替 remote/deployment acceptance。

## Stable identity and relationship graph

```text
AccountId
├─ USER         UserId          [current]
├─ ENTERPRISE   EnterpriseAccountId    [current]
├─ ORGANIZATION OrganizationAccountId  [current]
└─ BOT          BotId           [target]

UserId ─ EnterpriseInvitation ─┐
                                     ├─ EnterpriseDirectAffiliation ─ EnterpriseAccountId [current]
OrganizationMembership ──────────────┘

EnterpriseAccountId ─ EnterpriseTeam ─ EnterpriseTeamMembership ─ UserId [current]
EnterpriseTeam ─ EnterpriseTeamOrganizationAssignment ─ OrganizationAccountId   [current]

UserId ─ OrganizationInvitation ─┐
                                        ├─ OrganizationDirectMembership ─┐
EnterpriseTeamMembership + assignment ──┤                                  ├─ OrganizationMembership [current]
                                        └─ membership source/provenance ───┘

OrganizationAccountId ─ OrganizationTeam ─ TeamMembership ─ UserId [current]

UserId ─ EmploymentId ─ OrganizationAccountId         [target]
EmploymentId ─ Attendance / Payroll                          [target]
```

PrincipalId/HolderAccountId 是 AccountId 的 consumer usage semantics，不建立第二 identity root。EnterpriseTeam、Organization Team、Employment、Project、Workplace 有自己的 stable identity；Account namespace 不包住所有 entity。

## Identity continuity

Existing human IDs 是 opaque text；既有值逐值保留，不因新資料可用 UUID 就 rekey/cast/prefix/trim。Account root/facet 使用同值，kind immutable。`Member`／`member_id` 只允許保留在明確 private persistence/history compatibility boundary；current governance Domain/public contract 不再把 User、Enterprise user、Organization member、Team member 混成 generic Member。

Provider subject、optional Supabase Auth user ID 與 AccountId 分開；external identity mapping 有 namespace/issuer/channel 與 uniqueness。`auth.uid()` 不是產品 AccountId，也不建立 OrganizationMembership/Employment/role。

## Owned relations and scope

`EnterpriseInvitation`、`EnterpriseDirectAffiliation`、`EnterpriseTeamMembership`、`EnterpriseTeamOrganizationAssignment`、`OrganizationInvitation`、`OrganizationDirectMembership`、effective `OrganizationMembership`、Organization `TeamMembership`、Employment、RoleAssignment 各有 typed owner/lifecycle；不使用 universal Membership/AccountRelation table 取代。

```text
Invitation ≠ Membership/Affiliation source ≠ Effective Membership ≠ RoleAssignment
```

- Enterprise direct participation 是 affiliation，不是 Enterprise membership；accepted direct invitation 可以形成尚未加入任何 Organization 的 unaffiliated Enterprise user。
- Effective Enterprise user population 由 active direct affiliation 與 attached Organization 的 active OrganizationMembership 聚合。
- Current Enterprise Team member 必須是 active effective Enterprise user；Enterprise Team 與 Organization Team 不共用 storage、hierarchy 或 TeamMaintainer。
- Enterprise Team 只可 assign 到同 Enterprise 的 active attached Organization。
- `OrganizationDirectMembership` 是 direct source；Enterprise Team membership + active assignment 是 `enterprise-team` source；`organization_membership_sources` 只作 source projection。
- Effective `OrganizationMembership` 由 current sources 刷新。direct source 與多個 Enterprise Team-derived sources 可同時存在；撤銷單一 source 不得誤刪其他資格，沒有任何 source 時才轉為 removed。
- Organization invitation 只表示 pending request；Enterprise Team assignment 可以在沒有 invitation 的情況建立 indirect membership source，runtime 會清理同 user/scope 的 pending invitation。
- Organization TeamMembership 與 TeamMaintainer RoleAssignment 分離；current Organization Team 仍由 Team owner維護。
- `OrganizationOwner` 只可由 active individual effective Organization member持有；Organization Team 或 Enterprise Team 不可整體成為 Owner，source removal 不得繞過 membership-bound owner invariant。
- OrganizationMembership != Employment；RoleAssignment 不自動建立 participation。

Current Organization Team 保存 immutable OrganizationAccountId。Other resource/history（Workplace/Project/Attendance 等）只有在 owner slice 提供 authoritative mapping 時才升為 Organization/Employment scoped；unknown provenance 留 unresolved，不用 current Team/LINE group 猜。

GitHub benchmark 的 outside collaborator/resource access 還沒有本地 authoritative owner；不得把 external collaborator 硬塞成 OrganizationMembership 或為了 Enterprise Team compatibility 放寬 current User/affiliation invariants。

## Consumer semantics

| Consumer | Stable semantic | 必須保留 |
| --- | --- | --- |
| Account/User | UserId | lifecycle/status version、identity binding、existing ID、receipts |
| Enterprise governance | effective Enterprise user + direct affiliation / Organization-derived affiliation | invitation、affiliation source、Owner RoleAssignment、version/replay/audit |
| Enterprise Team | EnterpriseTeam + membership + Organization assignment | Enterprise scope、membership version、assignment version、source refresh、receipt/audit |
| Organization governance | OrganizationInvitation + direct membership source + effective OrganizationMembership | invitation acceptance、source provenance、membership version、individual Owner eligibility |
| Permission / governance command | actor=PrincipalId；target/scope typed | current authorization、reason、expectedVersion、replay/revoke |
| Repository / Issues | participant/responsibility=UserId；RepositoryId | Repository access、Issue expectedVersion/replay、Issue history |
| Attendance current | human qualification=User；actual stream 仍 Member-compatible | open session/version/reward/outbox/receipt；Employment cutover另做 |
| Attendance target | working subject=EmploymentId；recipient=UserId | history/provenance、finalized period、correction |
| Expense / Partners / Notifications | owner/participant/recipient/actor 分開 | current scope/history 不因 Organization exists 自動搬家；Notification 只引用 source fact |
| Wallet/Ledger | holder=HolderAccountId；actor 若存在另記 PrincipalId | denomination、origin tuple、append-only、exact retry；Coin holder current USER-only |
| Payroll | EmploymentId + PayPeriod + immutable input versions | deterministic result/history、authorization/privacy/correction/publication |

Requested subject/owner 不等於 authenticated actor；不能把所有 `uid/member_id/actor/owner/created_by` 全域換成 generic `account_id`。

## Integrity rules

- Root/facet kind 對齊，human-only FK 指 User facet；錯 kind/missing facet fail closed。
- Invitation 不授權，也不計為 Membership/Affiliation；接受才建立對應 direct participation fact。
- Enterprise/Organization-scoped relation 驗 scope；FK existence 不等於 authorization。
- Enterprise Team membership/assignment 與 effective OrganizationMembership refresh 必須在同一 transaction 保持 source consistency；不能只更新 projection。
- Enterprise Team → Organization assignment 只能指向同 Enterprise 的 active relation；Organization detach 前必須先解除 active Enterprise Team assignments。
- OrganizationOwner 必須綁 active individual OrganizationMembership；Team principal 只能由 role-specific definition 額外允許；source removal 需先保護 last-effective-owner invariant。
- Employment/person/scope/effective period 與 OrganizationMembership 分離。
- Lifecycle/removal 不 cascade 刪仍需追溯的 Ledger/Payroll/Attendance/Task/receipt/audit/history。
- Wallet key 是 HolderAccountId + AssetCode；Coin current holder 僅 USER。Non-USER holder 需要另行 product/security tests。
- Immutable receipt/source tuple/history 不因 owner/欄位 rename 改寫；需要 protocol migration 時保留 one-to-one mapping/readback。

## Adjacent owners

- [Schema](030-data-target.md)
- [Persistence](030-data-target.md)
- [Target scope isolation](040-security-target.md)
- [Migration plan](../030-migrations/040-enterprise-organization-workforce-payroll.md)


## Target persistence

狀態：Account/User、Enterprise/Organization bootstrap/runtime、Team 與既有 value/Attendance persistence 已有 current source；Workforce/Employment、Attendance Employment period、正式 Payroll persistence 尚未實作。Adapter 是否仍在 compatibility Infrastructure 是 Module Boundary，不改 Data Boundary；remote 狀態另驗。

## Source of truth

PostgreSQL 保存 authoritative durable state；`supabase/schemas/` 是 repository current desired structure。Historical migrations/evidence 不成第二 current schema，但保留 recovery/traceability 價值。

## Current governance persistence

Current schema/source 已有 Enterprise/Organization typed memberships、scoped admin assignments、receipt/audit/version/replay，以及 active User runtime provisioning + operator recovery bootstrap。兩者共用 private DB provisioning coordinator；`accounts` direct INSERT 仍只允許 USER，line_app 只能 EXECUTE narrow Enterprise/Organization provision functions。LINE/browser identity、input operator string 或 elevated DB credential 都不自行授權 business command。

Current Team persistence 使用 TeamId + immutable OrganizationAccountId、TeamMembership(UserId) 與 scoped TeamManager assignment；不再有待完成的 WorkGroup manager writer migration。

## Transaction authority

| Operation | Atomic/consistency responsibility |
| --- | --- |
| User registration/transition/link | root/facet/identity binding、status/version、revocation linkage、audit/receipt |
| DailyCheckIn | User qualification + unique day claim/protocol evidence + Ledger credit |
| Enterprise/Organization governance | lifecycle/participation/scoped assignment/revoke/version/audit/receipt |
| Team mutation | Team/membership/version + last-effective-manager/Task responsibility checks |
| Employment/terms/policy/schedule | target effective/version/published invariant |
| Attendance current | Member-compatible state/session/version/event/reward/receipt/outbox + current User qualification |
| Attendance target | Employment stream + correction/finalized period/version + preserved history |
| Payroll | run/statement consistency + immutable input/result versions; 不把整公司所有 statements 拉成一 Aggregate |

跨 owner 同 DB transaction 不等於合併 Aggregate；每個 state 仍有唯一 writer，external API 不包進長 transaction。

## Identity, idempotency and revocation

AccountId 保留 text value；PrincipalId/HolderAccountId 不建立新 mapping。Human-only FK 指 User。Command 使用 owner-defined durable request key/fingerprint/result；same key/same command 回原結果，不同 payload conflict。Immutable receipt/fingerprint/source tuple 不因 rename 改寫。

Sensitive mutation 重新核驗 current User qualification、participation/RoleAssignment/Employment/scope、expected version。Revoke 與 mutation 需 locking/version 防 TOCTOU；cache/JWT/projection/舊 receipt 不成永久 permission。

## Immutable history and projections

Published policy/schedule、Attendance correction/finalized period、Payroll input/result、Ledger、receipt、audit 不原地覆寫；更正產生新 version/adjustment/reference。Wallet balance 從 Ledger facts 投影；read model/cache 沒有 write authority。

## Cutover / recovery

Preserve-data environment 在 incompatible cutover 前停止舊 writer，review transform，apply/backfill 可 rollback/reconcile，再由新 runtime 接寫。未知結果先 readback，不能換 request ID 盲目重送。新 writer 已產生資料後也不能直接 rollback 舊 binary/schema；先停寫並 reconcile receipts/outbox/ledger/history。

Disable/removal/end 不 cascade 刪 Account、participation、Employment、Attendance、Payroll、Task、Ledger、receipt/audit 歷史。Auth/Storage/application schema 是不同 Data Boundary。

## Adjacent owners

- [Schema foundation](030-data-target.md)
- [Transaction/idempotency](../../040-data/040-transaction-and-idempotency.md)
- [Migration plan](../030-migrations/040-enterprise-organization-workforce-payroll.md)
- [Target authorization](040-security-target.md)


## Target schema foundation

狀態：`accounts/users`、Enterprise/Organization governance、Organization Team、Enterprise Team 與 USER holder 已有 current declarative schema slice；BotAccount、Workforce/Employment、Payroll 等仍是 non-deployable target until their slice gates pass。Current database truth 以 `supabase/schemas/` 與實際 deployed catalog 分層判定；2026-09-18 的 retired Supabase environment readback 證據見 [Atomic schema remote convergence](../060-acceptance/080-atomic-schema-remote-convergence.md)，不推廣到其他環境，也不得用來推導 current operational target。

## Representation

採 relational root + typed facets/relations，不用 PostgreSQL table inheritance 或一張 nullable JSON/profile 吞所有責任。Current Domain vocabulary 統一為 **User / Organization / Enterprise**；`Account` 是共同 identity root，三個 facet 對齊同一命名層級。

```text
accounts
├─ users
│  ├─ LINE identity
│  └─ Google identity
├─ organizations
└─ enterprises
```

SQL relation 使用複數名；Domain entity 使用單數 `User` / `Organization` / `Enterprise`。Supabase Auth 的 `auth.users` 是 provider-managed technical principal table，與 product-owned `app_private.users` 語意不同，所有 SQL 必須 schema-qualified 以避免混淆。

Current declarative schema 已使用 `app_private.users`；Supabase Auth 的 `auth.users` 仍是不同 Data Boundary。所有跨 schema SQL 必須明確 schema-qualified。

| Relation | Current/target | Responsibility |
| --- | --- | --- |
| `accounts` | current root | global identity + immutable kind |
| `users` | current source | User facet / lifecycle / qualification；LINE/Google identities 皆映射到同一 `UserId`（同值 `AccountId`） |
| `enterprises` / `organizations` + typed memberships/role assignments | current source | controlled governance |
| `teams` / `team_memberships` | current source | Organization-scoped collaboration |
| `enterprise_teams` / memberships / Organization assignments | current source | Enterprise-level grouping 與 source-aware Organization membership provenance |
| BotAccount | target gated | 只有 owner use case/authority 存在才部署 |
| Employment/terms/policy/calendar/schedule | target gated | Workforce versioned facts |
| Attendance Employment period/correction | target gated | actual versioned Payroll input |
| PayrollRun/PayStatement | target gated | compensation result/history |

AccountId 保留 opaque text；kind immutable。UserId / OrganizationId / EnterpriseId 都是各自 typed facet 對同一 AccountId 的 Domain 語意，不建立第二 ID。舊 IDs 不 rekey/cast；provider binding 與 product identity 分開。

## Integrity

- Root/facet 同 key且 kind-aware；human-only relation 只能指 User。
- Typed membership/RoleAssignment scope 有 FK/constraint + transaction validation；不做 universal Membership table 或 unchecked `scope_type/scope_id` fallback。
- Team 保存 immutable OrganizationAccountId；TeamMembership 指 User。
- Employment 保存 EmploymentId + UserId + OrganizationAccountId；與 OrganizationMembership 分離。
- Attendance/Payroll 使用 EmploymentId/versioned inputs，不換 generic account_id。
- Lifecycle/removal 不 cascade 清歷史。

## Wallet / Ledger

Current internal holder 已接 Account identity，Coin holder 仍僅 USER；不因此新增 transfer/debit/enterprise pool/Bot wallet。Asset definition/denomination 與 append-only Ledger single posting/idempotency contract 保留。Compatibility source literal 不改 immutable historical row。

## Schema-first / migration rule

`supabase/schemas/` 保存 current desired DDL；歷史 migration 的一次性 DML/backfill/recovery evidence 不複製進每次 clean rebuild。需要 preserve-data 的 remote 使用 reviewed forward transform，不為「乾淨 history」rewrite applied migration metadata。

新 Workforce/Payroll relation 只有在同 slice 已有 owner Domain/Application/public contract/authorization、DB constraints/RLS/grants、unit/DB/concurrency tests 時才加入 declarative schema。Adapter 搬 package 不等於 schema/Data Boundary 搬移。

## Security verification

Private business schema 不因 API 存在授予 browser direct access。RLS/grants、function security mode/search_path/execute、view `security_invoker`、role ownership 都是 catalog verification 範圍；elevated technical credential 不取代 business authorization。

## Gates

1. Current owner/consumer/public contract 已定義。
2. Source/tests 完成且沒有第二 writer。
3. Schema clean-build／`schema:check` 通過，negative kind/scope/concurrency cases 覆蓋。
4. Preserve ID/history/receipt/source tuple/replay/recovery。
5. Remote apply 前 backup/reviewed diff/write quiescence；後續 catalog/data readback。
6. Deployment/API/LINE/device/business acceptance 另列，不由 schema success 代替。

