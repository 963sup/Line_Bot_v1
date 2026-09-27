# Workforce

狀態：**current module foundation；Employment runtime remains selected target**。

`packages/workforce` 已建立 ownership/module boundary；Employment、terms/policy、calendar、schedule 的 runtime source、public export、persistence 與產品入口尚未啟用。

## Responsibility

Workforce 擁有：

- `Employment(UserId, OrganizationAccountId)` 與其 lifecycle/effective period。
- versioned `EmploymentTerms`。
- `WorkPolicyVersion`。
- Calendar / holiday arrangement。
- published Schedule / ScheduledInterval。

Account 擁有 User identity/qualification；Organization 擁有 participation/scope；Attendance 擁有 actual facts；Payroll 擁有 calculation/result；Identity/Access 擁有 authorization policy。

`Employee` 是有效 Employment 下的描述，不是 global identity 或 AccountKind。

## Lifecycle

```text
Employment: ACTIVE → SUSPENDED → ACTIVE
                  └──────────→ ENDED

Policy / Schedule: DRAFT → PUBLISHED → SUPERSEDED
```

Effective period 與 lifecycle 必須同時成立。ENDED 不原地改回 active；重聘建立新的工作關係或核定的新 lifecycle。

## Invariants

- User 不保存唯一 Organization；同一 User 可有多段、多 Organization Employment。
- OrganizationMembership 與 Employment 分離；移除 membership 不靜默終止 Employment。
- Account pause/restore 不改寫工作關係歷史。
- Published/confirmed terms、policy、schedule 保留 immutable version；correction 產生新 version + reason/source。
- Calendar、Schedule、Leave、actual Attendance 是不同 facts。
- Draft 不參與正式解析；ScheduledInterval 不重疊並保留跨日時間。
- 不由 current Team、Workplace、LINE group 推測 historical Employment。
- Unknown provenance 保持 unresolved，不自動推導缺勤、加班或薪資。
- Lifecycle change 不 cascade 刪除 Attendance/Payroll/Task historical reference。

## Activation gates

第一個 Employment runtime consumer 啟用前必須決定：

1. 建立 Employment 是否要求 current Organization participation。
2. 同一 User / Organization 是否允許 overlapping Employment。
3. public capability、authorization、expected version、request replay 與 transaction boundary。
4. Attendance / Payroll 所需的 versioned projection 與 missing/conflict semantics。

未完成前不建立 department/job-grade、generic HR、rules DSL、完整 leave entitlement 或 external calendar sync。

Machine owner / status：
[`architecture/semantic-model.json`](../../architecture/semantic-model.json) ·
[`architecture/implementation-topology.json`](../../architecture/implementation-topology.json)

Migration sequencing：
[Workforce / Attendance / Payroll slices](../090-governance/030-migrations/040-enterprise-organization-workforce-payroll.md#workforce--attendance--payroll-implementation-slices)
