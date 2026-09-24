# Account identity design decision

決策日期：2026-09-13；本頁保存設計理由與取捨。Current implementation 狀態隨 source 演進，見 [System baseline](../../000-core/010-system.md)；本 ADR 不以當時「尚未實作」敘述凍結後續 current 狀態。

## Problem

Legacy `Member` 曾同時承擔 human identity、command actor、permission subject、Team participant、Wallet/Ledger holder，造成 owner/relationship/value 語意耦合。核心需求是穩定 identity 與既有 ID/history/replay continuity，而不是全域 rename。

## Selected decision

使用單一 opaque `AccountId` namespace，Account root 只擁有 identity/kind。產品核心 account facet 的 Domain 名稱統一為 **User / Organization / Enterprise**；human product identity 的正式名稱是 `User`。Current source、public contract 與 declarative schema 已使用 `User` / `users`；舊 human identity naming 不保留 compatibility alias。

```text
accounts
├─ User
│  ├─ LINE identity
│  └─ Google identity
├─ Organization
└─ Enterprise
```

對應 identity invariant：

```text
Account
├─ kind = USER         → User
├─ kind = ORGANIZATION → Organization
└─ kind = ENTERPRISE   → Enterprise
```

`BOT` 若未來啟用，仍是獨立 gated automation facet，不屬於本次 LINE ↔ Google human identity flow，也不改變 User / Organization / Enterprise 的命名決策。

- PrincipalId／HolderAccountId 是 AccountId 的 consumer usage semantics，不建立第二 UUID/table。
- Human participant 使用 User identity；working relationship 使用 EmploymentId；Team 不是 Account。
- Existing text ID value 優先保留，不為格式整齊 rekey/cast UUID。
- DailyCheckIn 從 Account lifecycle 分離；Ledger V1 compatibility origin tuple 可繼續保存 `membership/daily_checkin` literal。
- 不建立 universal `AccountRelation`、generic IAM、第二 ledger 或為未發生需求預建 event bus。

## Current convergence

截至目前 source：`User` / `users` 是 human lifecycle/qualification 的 current model；Enterprise/Organization 有受限 governance source；Team 已是 Organization-scoped current model；USER holder 已接 Account identity。`Member`／membership／WorkGroup 可留在 wire/storage/history 或尚未切換的 Attendance stream，但不再是 current Account/Team Domain alias。Workforce/Employment、Attendance Employment cutover、正式 Payroll 等仍依各 owner gate；LINE receiving-bot identity 留在 integration boundary。

## Alternatives rejected

| Alternative | Why rejected |
| --- | --- |
| Global MemberId → AccountId search/replace | 混淆 human/actor/holder/scope/Employment，破壞 protocol/history |
| Account + role/status/parentId 吞全部 | 把 unrelated lifecycle/consistency/authorization 綁在同 writer |
| Universal AccountRelation(role) | OrganizationMembership、TeamMembership、Employment、delegation authority 不同 |
| Every subtype gets second ID | 增加 mapping/ownership drift，沒有 consumer value |
| Force all existing IDs to UUID | 破壞既有 FK/receipt/replay/history continuity |
| PostgreSQL table inheritance | 不符合本專案需要的明確 typed facets/FK/integrity strategy |

## GitHub semantic calibration

GitHub 只作產品語意 benchmark，不是本專案 schema／permission inheritance authority。

| GitHub observable concept | Local decision |
| --- | --- |
| User / Organization / Enterprise account separation | 採同一 Account root + typed User / Organization / Enterprise facets；User 是人類 actor identity，Organization/Enterprise 不偽裝登入者 |
| Organization teams | 採 Organization-scoped Team；TeamManager 不等於 Organization-wide admin |
| Enterprise teams | 與 Organization Team 分開 owner；team-derived grants/provisioning 未有需求前不引入 |
| Scoped roles/permissions | 採 typed RoleAssignment + owner eligibility；不照搬 GitHub 全角色集合 |
| Enterprise policies | 上層 constraint 與下層 owner policy 分離；Policy 不能自行產生 Permission |
| Invitation/outside collaborator | 只採「加入意圖 != active participation／resource collaboration != OrganizationMembership」語意，不照搬期限/產品流程 |
| Audit actor/action/target/time | 採可追溯語意；retention/search/export 按本地 owner/security policy |

Current LINE Bot `userId`／webhook `destination` 只保留為 signed provider context，不建立 Account-owned Bot identity 或 provider-binding lifecycle。人類 `source.userId` 對應的 User 仍是 human command actor，delivery identity 不換 actor。若未來 autonomous Bot actor 出現，stable product identity 必須由該真實 use case 重新定義，而不是從 transport metadata 預建。

## Deferred

Nested Team／permission inheritance、team-derived grant、EnterpriseTeam auto-provision、Managed User/SCIM、自訂 role editor、generic policy DSL、self-service Organization create、Bot autonomous delegation、non-USER Coin holder 都需要真實 use case/authority/revoke/recovery tests，不因 benchmark 有同名能力就預建。

## Canonical routing

- [Account current rules](../../010-domain-owners/010-account.md)
- [Domain target](../020-proposals/010-domain-target.md)
- [Organization](../../010-domain-owners/030-organization.md) · [Team](../../010-domain-owners/070-team.md)
- [Target authorization](../../090-governance/020-proposals/040-security-target.md)
- [Target data model](../../090-governance/020-proposals/030-data-target.md)
- [Migration plan](../030-migrations/040-enterprise-organization-workforce-payroll.md)
