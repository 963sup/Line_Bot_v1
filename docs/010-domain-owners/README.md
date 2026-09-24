# Domain owners

這一層讓 Agent 以「一個 business responsibility → 一個 canonical current document」理解產品。Strategic classification 先看 [Domain map](../000-core/020-domain-map.md)；跨 owner relationship、integration semantics 與 Boundary mapping 看 [Repository map](../000-core/030-repository-map.md)。

Subdomain、Bounded Context、Module Boundary、Data Boundary、Consistency Boundary 不要求一對一，也不能從 folder / package / table 名稱機械推導。

每份 owner 文件逐步收斂到同一個可掃描結構：

```text
Purpose / Strategic position
Ubiquitous Language
Owns
Consumes
Does Not Own
Business Invariants
Policy / Decision Ownership
Consistency Boundaries
Public Capabilities
Module / Data Mapping
Security constraints
Validation
```

不要求為了格式建立空 section；只有真實 responsibility 存在時才記錄。

- [Account](010-account.md)
- [Enterprise](020-enterprise.md)
- [Organization](030-organization.md)
- [Workforce](040-workforce.md)
- [Attendance](050-attendance.md)
- [Payroll](060-payroll.md)
- [Team](070-team.md)
- [Repository](080-repository.md)
- [Notifications](090-notifications.md)
- [Project](180-project.md)
- [Expense](100-expense.md)
- [Partners](110-partners.md)
- [Assistant](120-assistant.md)
- [Asset](130-asset.md)
- [Wallet](140-wallet.md)
- [Ledger](150-ledger.md)
- [DailyCheckIn](160-daily-check-in.md)

Selected future、cutover、未完成能力與 dated evidence 只由 [Governance](../090-governance/README.md) 保存；完成 migration 後仍成立的 current truth 才蒸餾回 owner 文件。
