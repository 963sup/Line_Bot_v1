# Cross-context glossary

只收跨 Context、跨責任區或容易與 provider / GitHub terminology 混淆的詞。Owner-local vocabulary 留在對應 [Domain owner](../010-domain-owners/README.md)。

| Term | Canonical meaning | Owner / boundary | Not the same as |
| --- | --- | --- | --- |
| Namespace | 在明確 scope 內讓 locator key 可唯一解析；shared namespace另含 reservation/collision policy | Namespace policy + owning Domain | stable identity / URL / authorization |
| Locator | 可解析名稱或複合鍵；可隨 rename 改變 | owning Domain | stable ID / permission |
| User | current human product identity / lifecycle | Account | Employment / Membership / provider identity |
| AccountId | provider-independent stable identity reference | Account | authentication proof / permission |
| Principal | 某次操作的可信 actor context | Identity/Access + application boundary | User / Employment / provider subject |
| Qualification | owner 對當次操作的 current eligibility decision | owning business context | authentication / permission |
| Enterprise | 跨 Organization governance scope | Enterprise | Organization / Team |
| Organization | business/data scope 與 participation owner | Organization | Enterprise / Team |
| Team | Organization-scoped collaboration responsibility | Team | Enterprise Team / Organization / role |
| TeamMembership | User 與 Team 的 participation relation | Team | Employment / authorization role |
| Employment | User 與 Organization 的具期間工作關係 | Workforce | Account / OrganizationMembership |
| Repository | 可獨立擁有 content、permission、state、lifecycle 的工作容器 | Repository | Git repository / Project |
| Project | 可管理一個或多個 Repository／Work reference 的 planning boundary | Project | Repository / WBS / Repository child |
| Project Item | Project 對 underlying work/content 的 planning reference | Project | copied underlying truth |
| Work Item | 由原 owner lifecycle 管理、可被 Project 參照的工作 | owning work context | Project Item / WBS node |
| WBS | Project-owned Work Breakdown Structure | Project | Project itself / arbitrary folder tree |
| Milestone | Project／Work 的 goal/checkpoint | Project or Work owner | WBS phase / status |
| Label | owner-defined classification metadata | owning work/container | lifecycle state / permission |
| Discussion | conversation thread / interaction resource | Repository current owner | Work Item / business command |
| Reaction | 對既有 content 的 interaction signal | content interaction | approval / authorization |
| Attendance | actual attendance / workplace eligibility / attendance facts | Attendance | schedule / payroll result |
| PayPeriod | Payroll calculation period | Payroll | generic date range |
| Permission | 對特定 capability 的 authorization semantic | Identity/Access + business policy | provider role / membership |
| Asset | 系統承認的 value definition / denomination | Asset | physical fixed asset |
| Wallet | holder + Asset 的 holding / balance projection | Wallet | writable authoritative balance |
| Ledger | append-only value facts | Ledger | accounting General Ledger |
| Accounting | accounting recognition / posting / reporting responsibility | only when real owner exists | Billing / Payment / Settlement |
| Billing / Charging | 決定費用／應收如何產生 | only when real owner exists | Accounting umbrella |
| Payment | value-transfer execution | only when real owner exists | Billing / accounting posting |
| Settlement | multi-party clearing / settlement | only when real owner exists | Payment initiation |

Legacy/storage/protocol literals不因仍存在就取得 current Domain authority；若需要解讀，回 owner migration/compatibility evidence，不新增同義 business term。

```text
One concept
→ one canonical name
→ one authoritative definition
```

同一詞在不同 Context 有不同 meaning 時，標示 Context 或使用更精確名稱；不要靠 import/export alias 製造表面一致。
