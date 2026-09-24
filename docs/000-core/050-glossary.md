# Cross-context glossary

只收跨 Context、跨責任區或容易與 infrastructure / GitHub terminology 混淆的詞。Owner-local vocabulary 留在對應 [Domain owner](../010-domain-owners/README.md)。

`Ubiquitous Language` 是活的語言系統；本 Glossary 是它的 canonical lookup interface，不取代 owner-local state、invariant 或 lifecycle。

GitHub benchmark graph 中的 `Profile`、`Followers`、`Following`、`Repositories`、`Contribution`、`Achievement`、`WorkItemType`、`ProjectField`、`ProjectStatusUpdate`、`ProjectView` 只描述 external semantic benchmark；除非本表或 owner-local docs 另行定義，它們不因出現在 benchmark graph 就自動成為 Line_Bot_v1 的 product Ubiquitous Language 或 Bounded Context。Benchmark 中 relationship 的 `role` / `permission` 是 edge attribute，Invitation 是 pending relationship intent；兩者都不得反向建立第二套 product identity 或 authorization truth。

| Term | Canonical meaning | Owner / boundary | Not the same as |
| --- | --- | --- | --- |
| Repository | 可獨立擁有內容、權限、狀態與生命週期的工作容器 | Product semantic baseline | Source-code repository / Git repository / Project |
| Project | 可管理一個或多個 Repository／Work reference 的獨立規劃與管理邊界 | Project planning boundary | Repository / WBS / Repository child |
| Project Item | Project 對 underlying work/content 的 planning reference，可承載 project-local field／view／workflow metadata | Project planning boundary | underlying business truth / copied Work |
| Work Item | 一件可被 owner lifecycle 管理、也可被 Project 參照的工作；加入 Project 不轉移其原 owner authority | owning work context | Project Item / WBS node |
| WBS | Project 內核心 Work Breakdown Structure | Project | Project 本身 / arbitrary folder tree |
| Milestone | Project／Work 的目標節點或 checkpoint | Project / Work planning | WBS phase / status |
| Label | owner-defined classification metadata | owning work/container context | lifecycle state / Permission |
| Discussion | conversation thread，可有 category／comment／poll／answer 等 interaction | conversation owner | Announcement / Work Item / business command |
| Reaction | 對既有 content 的 interaction signal | content interaction boundary | approval / authorization / business vote unless explicitly modeled |
| Invitation | pending participation／access intent；接受前不形成 active participation | owning governance context | Membership / Affiliation / Permission |
| User | current human product identity / lifecycle owner | Account | Employment / Membership / provider identity |
| AccountId | provider-independent stable identity reference | Account | authentication proof / permission |
| Principal | 某次操作真正的可信 actor context | Identity / Access + Application security boundary | User / Employment / provider subject |
| Qualification | owner 對當次操作的 current eligibility 判斷 | owning business context | authentication / Permission |
| Enterprise | 跨 Organization governance scope | Enterprise | Organization / Team |
| Organization | business/data scope 與 participation owner | Organization | Enterprise / Team |
| Team | Organization-scoped collaboration responsibility | Team | EnterpriseTeam / Organization / global role |
| TeamMembership | User 與 Team 的 participation relation | Team | TeamMaintainer authorization / Employment |
| Employment | User 與 Organization 的具期間工作關係 | Workforce target | Account / OrganizationMembership |
| Attendance | actual clock / Workplace eligibility / Attendance facts owner | Attendance | schedule / Payroll input result |
| PayPeriod | 薪資計算涵蓋的明確期間概念 | Payroll | generic date range |
| Permission | 明確敏感 capability 的授權語意 | Identity / Access + business policy | provider role / Team membership |
| Asset | 系統承認的 value definition / denomination | Asset | physical fixed asset |
| Wallet | holder + Asset 的 holding / balance projection | Wallet | writable authoritative balance |
| Ledger | append-only value facts | Ledger | accounting General Ledger |
| Accounting | 會計 recognition / posting / reporting responsibility | Finance candidate when real consumer exists | Billing / Payment / Settlement |
| Billing / Charging | 計費：決定應收／費用如何產生 | future commercial billing owner when real use case exists | Accounting umbrella |
| Payment | 支付：價值實際移轉 / payment execution | payment owner when real use case exists | Billing / Accounting posting |
| Settlement | 結算：多方資金或帳務清算與結清 | settlement owner when real use case exists | Payment initiation / Billing |
| Member | compatibility wire/storage/部分 Attendance stream literal | legacy / compatibility only | second human Domain identity |
| WorkGroup | legacy/history literal | history / compatibility only | current Team Domain alias |

## Naming rule

```text
One concept
→ one canonical name
→ one authoritative definition
```

若同一詞在不同 Context 有不同 meaning，必須標示 Context 或使用更精確名稱；不要用 import/export alias 製造表面一致。

## Global vs local language

```text
Global ambiguity
→ 本 Glossary

Owner-local vocabulary
→ docs/010-domain-owners/<owner>.md
```

例如 AttendanceSession、ClockIn、ClockOut 屬 Attendance；PayrollRun、PayStatement 屬 Payroll。它們只有跨 Context 開始混淆時才升到本頁。
