# Ownership facts

Use this file only for the stable cross-owner mental model. Exact owner/capability status remains in `architecture/semantic-model.json`. Complete DDD mapping see [Strategic Design](../reference/architecture/strategic-design.md).

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
→ actual attendance plus User-submitted supplement requests and Repository ADMIN decisions

Payroll
→ payroll authority when activated

Repository
→ work/content container authority

Resources
→ Repository-scoped resource identity, content revisions, classification and engineering graph

Contract
→ Repository-scoped engineering agreements with frozen Resource revision quantity bases

Execution
→ quantity declarations and internal review against fixed active Contract lines

Content
→ shared bounded title/body values; no aggregate or persisted data authority

Project
→ planning authority
   └─ WBS = Project-owned decomposition
```

Key separations:

- Provider identity proof ≠ User lifecycle ≠ Membership / Employment ≠ Role / Permission。
- Repository ≠ Project；Project Item只是 planning reference，不取得 underlying work authority。
- Resource 基準數量 ≠ Contract 約定數量 ≠ Execution 申報／審查實績 ≠ Payroll 結算結果。
- Bounded Context ≠ Module Boundary ≠ Data Boundary ≠ Consistency Boundary。
- Accounting ≠ Billing/Charging ≠ Payment ≠ Settlement；沒有真實 owner/lifecycle/consumer時不預建 umbrella domain。

For a specific task, read only the affected owner contract under `docs/owners/`.
