# Ownership facts

Use this file only for the stable cross-owner mental model. Exact owner/capability status remains in `architecture/semantic-model.json`.

```text
Account/User
→ identity lifecycle / qualification

Enterprise
→ cross-Organization governance

Organization
→ business/data participation scope

Team
→ Organization-scoped collaboration

Workforce
→ Employment / work-policy foundation

Attendance
→ actual attendance / workplace facts

Payroll
→ payroll authority when activated

Repository
→ work/content container authority

Project
→ planning authority
   └─ WBS = Project-owned decomposition
```

Key separations:

- Provider identity proof ≠ User lifecycle ≠ Membership / Employment ≠ Role / Permission。
- Repository ≠ Project；Project Item只是 planning reference，不取得 underlying work authority。
- Bounded Context ≠ Module Boundary ≠ Data Boundary ≠ Consistency Boundary。
- Accounting ≠ Billing/Charging ≠ Payment ≠ Settlement；沒有真實 owner/lifecycle/consumer時不預建 umbrella domain。

For a specific task, read only the affected owner contract under `docs/owners/`.
