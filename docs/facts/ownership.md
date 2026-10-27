# Ownership facts

Use this file only for the stable cross-owner mental model. Exact owner/capability status remains in `architecture/registry.json#domain`. Complete DDD mapping see [Strategic Design](../reference/architecture/strategic-design.md).

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
→ shared physical Location / Equipment / Material identity and lifecycle

Contract
→ formal commitments with frozen Content Work/Task plan bases and agreed quantities

Execution
→ Task actuals, resource use, prerequisite DAG and internal review against fixed commitments

Content
→ Repository Subject / Object / SubObject / Work / Task content, hierarchy and coherent plan revisions

Project
→ planning authority
   └─ WBS = Project-owned decomposition
```

Key separations:

- Provider identity proof ≠ User lifecycle ≠ Membership / Employment ≠ Role / Permission。
- Repository ≠ Project；Project Item只是 planning reference，不取得 underlying work authority。
- Content 計畫量 ≠ Contract 約定量 ≠ Execution 申報／審查實績 ≠ Payroll 結算結果；Resources 身分不等於工作階層。
- Content 工作節點與實體 Resource 身分分別由其 Owner 管理；中立文字驗證由 Platform 擁有。
- Bounded Context ≠ Module Boundary ≠ Data Boundary ≠ Consistency Boundary。
- Accounting ≠ Billing/Charging ≠ Payment ≠ Settlement；沒有真實 owner/lifecycle/consumer時不預建 umbrella domain。

For a specific task, read only the affected owner contract under `docs/owners/`.
