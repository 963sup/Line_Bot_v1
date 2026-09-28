# Cross-context glossary

只收跨 owner 容易造成錯誤決策的詞。Owner-local vocabulary留在 owner contract / reference。

| Term | Meaning | Not the same as |
| --- | --- | --- |
| User | provider-independent human product identity / lifecycle | Employment / Membership / provider identity |
| AccountId | stable product identity reference | authentication proof / permission |
| Principal | current trusted actor context for one operation | User / provider subject |
| Qualification | owner對 current eligibility 的 decision | authentication / permission |
| Enterprise | cross-Organization governance scope | Organization / Team |
| Organization | business/data scope + participation authority | Enterprise / Team |
| Team | Organization-scoped collaboration group | EnterpriseTeam / role |
| Employment | User 與 Organization 的具期間工作關係 | Account / OrganizationMembership |
| Repository | 獨立擁有 content / permission / state / lifecycle 的工作容器 | Git repository / Project |
| Project | 跨 Repository / Work reference 的 planning boundary | Repository / WBS |
| Project Item | planning reference to underlying work | copied work truth |
| WBS | Project-owned Work Breakdown Structure | Project / arbitrary folder tree |
| Permission | capability authorization semantic | membership / provider role |
| Locator | mutable resolvable key | stable identity / authorization |
| Asset | value definition / denomination | physical fixed asset |
| Wallet | holding / balance projection | authoritative writable balance |
| Ledger | append-only value facts | accounting General Ledger |
| Accounting | accounting recognition / posting / reporting | Billing / Payment / Settlement |
| Billing / Charging | fee / receivable generation | Accounting umbrella |
| Payment | value-transfer execution | Billing / accounting posting |
| Settlement | clearing / settlement between parties | Payment initiation |

一個 concept維持一個 canonical name；storage/protocol legacy literal 不因此取得 current Domain authority。
