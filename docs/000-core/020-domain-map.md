# Domain map

本頁是 current business semantics 的 human-readable projection。Structured semantic authority 是 [`architecture/semantic-model.json`](../../architecture/semantic-model.json)；owner-local rules 回 [Domain owners](../010-domain-owners/README.md)。Target、migration 與 gap 不在本頁冒充 current。

## Business reality

產品處理的是 Enterprise Workforce & Operations Management：身份與治理、Organization/Team participation、Repository work collaboration、Project planning、Employment/Attendance/Payroll、value/expense/notification 等責任需要可授權、可追溯、可版本化與可恢復。

GitHub 只作 general-management semantic benchmark：吸收成熟的 owner、relationship、lifecycle、locator 與 planning boundary；Git、SCM、code hosting、branch、commit、pull request 等語意明確排除。

## Semantic anchors

```text
Repository = 可獨立擁有 content / permission / state / lifecycle 的工作容器
Project    = 可管理一個或多個 Repository / Work reference 的 planning boundary
WBS        = Project-owned work decomposition
Project ≠ Repository
Project ≠ WBS
Project Item = planning reference，不取得 underlying Work authority
```

Identity、participation、employment 與 authorization 也必須分開：

```text
Provider identity proof
≠ User lifecycle
≠ Membership / Employment
≠ Role / Permission
≠ current Principal authorization
```

Financial language 不使用模糊 `Billing` umbrella：Accounting、Billing/Charging、Payment、Settlement 只在各自出現真實 authority / lifecycle / consumer 時建模。

## Strategic boundaries

以下概念不能機械等號：

| Boundary | 回答的問題 |
| --- | --- |
| Subdomain | 現實業務問題怎麼拆？ |
| Bounded Context | 哪套 model / language / authority 在哪裡成立？ |
| Module Boundary | 哪個 source owner / public surface 實作責任？ |
| Data Boundary | 哪些 persisted facts / access / isolation 由誰擁有？ |
| Consistency Boundary | 哪些 invariant 必須同一 atomic transition 成立？ |

Package、route、table 或 provider 的存在都不能反向證明新的 business boundary。

## Current responsibility map

精確 owner kind、lifecycle、Bounded Context selection state 與 mapping 讀 `architecture/semantic-model.json`。Human routing 目前集中成：

| Responsibility | Canonical owner |
| --- | --- |
| User lifecycle / qualification / external identity link | [Account](../010-domain-owners/010-account.md) |
| Enterprise governance | [Enterprise](../010-domain-owners/020-enterprise.md) |
| Organization lifecycle / participation | [Organization](../010-domain-owners/030-organization.md) |
| Employment / terms / schedule foundation | [Workforce](../010-domain-owners/040-workforce.md) |
| Attendance / Workplace facts | [Attendance](../010-domain-owners/050-attendance.md) |
| Payroll foundation / future formal payroll result | [Payroll](../010-domain-owners/060-payroll.md) |
| Organization Team participation | [Team](../010-domain-owners/070-team.md) |
| Repository / Issue / Discussion / Label / Repository Milestone | [Repository](../010-domain-owners/080-repository.md) |
| Notification inbox / read-state / delivery projection | [Notifications](../010-domain-owners/090-notifications.md) |
| Expense intake | [Expense](../010-domain-owners/100-expense.md) |
| Partner / Contact / Referral | [Partners](../010-domain-owners/110-partners.md) |
| AI/application draft orchestration | [Assistant](../010-domain-owners/120-assistant.md) |
| Asset definition / Wallet projection / Ledger facts | [Asset](../010-domain-owners/130-asset.md) · [Wallet](../010-domain-owners/140-wallet.md) · [Ledger](../010-domain-owners/150-ledger.md) |
| Daily check-in / reward decision | [DailyCheckIn](../010-domain-owners/160-daily-check-in.md) |
| Project / Project Item / WBS / Project Milestone data authority | [Project](../010-domain-owners/180-project.md) |
| Cross-owner namespace reservation / collision policy | [Namespace](../010-domain-owners/190-namespace.md) |
| Authorization policy | [Authorization](../050-security/030-authorization.md) |
| Audit foundation | [Audit](../050-security/060-audit.md) |
| LINE / Google integration | [Platform integrations](../030-platform/README.md) |

Module existence 不等於 capability fully active；例如 Workforce、Project、Payroll、Audit 的 activation state 仍依 machine lifecycle 與 Governance evidence 判斷。

## Current vs future

Current semantic authority只能由 current source / schema / tests / machine model 支持。Selected future direction、未完成 Employment cutover、formal Payroll、Finance 等只讀 [Governance](../090-governance/README.md)。

若繼續拆解不會改變 owner、boundary、contract 或 validation decision，就停止。
