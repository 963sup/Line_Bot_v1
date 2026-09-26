# Domain owners

這一層保存「一個 business responsibility → 一個 canonical current document」。Business boundary 先看 [Domain map](../000-core/020-domain-map.md)；跨 owner relationship、Boundary 與 Source of Truth 看 [Repository map](../000-core/030-repository-map.md)。

Subdomain、Bounded Context、Module Boundary、Data Boundary、Consistency Boundary 不要求一對一，也不能從 folder / package / table 名稱機械推導。

Owner 文件只寫真實存在的 Purpose / Language / Owns / Consumes / Does Not Own / Invariant / Policy / Consistency / Public Capability / Mapping / Security / Validation；沒有責任就不建立空 section。

- [Account](010-account.md)
- [Enterprise](020-enterprise.md)
- [Organization](030-organization.md)
- [Workforce](040-workforce.md)
- [Attendance](050-attendance.md)
- [Payroll](060-payroll.md)
- [Team](070-team.md)
- [Repository](080-repository.md)
- [Notifications](090-notifications.md)
- [Expense](100-expense.md)
- [Partners](110-partners.md)
- [Assistant](120-assistant.md)
- [Asset](130-asset.md)
- [Wallet](140-wallet.md)
- [Ledger](150-ledger.md)
- [DailyCheckIn](160-daily-check-in.md)
- [Project](180-project.md)
- [Namespace](190-namespace.md)

Policy、integration、support owners 不為了目錄對稱搬進本層：Identity/Access 與 Audit 由 Security docs routing；LINE / Google 由 Platform docs routing；Platform support 由 Architecture routing。精確 semantic owner registry 以 `architecture/semantic-model.json` 為準。

Selected future、cutover、未完成能力與 dated evidence 只由 [Governance](../090-governance/README.md) 保存；完成後仍成立的 truth 才蒸餾回 current owner。
