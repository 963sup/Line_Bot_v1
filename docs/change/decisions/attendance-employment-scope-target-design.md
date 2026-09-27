# Attendance employment-scope target design

本文保存 Attendance 導入 Employment scope 的 target decision 與理由；current Attendance behavior、Workforce activation、migration state 與 runtime evidence由各自 owner/source 擁有。

## Decision

Actual work fact 以 `EmploymentId` 定位特定 working relationship；同一 User 可有多個 Employment。不同 identity/scope role 不混用：

```text
PrincipalId            → actual actor
OrganizationAccountId  → business scope
UserId                 → human subject / recipient
EmploymentId           → working relationship
```

Workforce 提供 scheduled/applicable versioned facts；Attendance 擁有 actual facts、corrections 與 finalized attendance-period input；Payroll 只消費 immutable/versioned input。

沒有 open session 不代表 period complete；elapsed time 也不等於法定工時。

## Preserved invariants

- 同一 Employment 最多一個 open session；sessions 不重疊，end 不早於 start。
- Workplace / Employment / session / version 不跨 Organization 拼接。
- Correction 保留原 fact/version；下游已引用的舊 input 不被靜默改寫。
- Historical Employment 無法可信解析時保留 unresolved provenance，不以 current Team/Workplace/Organization 猜測。
- Existing Account ID、receipt/outbox/replay continuity 與 reward business-day semantics不得因 Employment cutover破壞。
- 多 Employment 不自動增加 per-human reward entitlement。
- Bot/Team role/Organization participation 不自動形成 attendance correction/delegation authority。

## Activation decisions

在 Employment-scoped Attendance 入口啟用前，owner 必須明確決定：

- 同一 User 有多個 active Employment 時如何選定 clock scope。
- correction/finalization 的最小 management use case 與 authority。
- legacy open-session 如何 mapping。
- unresolved history 的 read / downstream eligibility semantics。

UI preference 不能成為 authority。

## Migration constraints

先建立可信 Employment / Organization relation，再切 working stream；legacy writer 與 new writer 不得各產生一筆 session。Cutover 必須保留 replay/version、current qualification、Workplace、reward、outbox、correction/finalized-version 與 unknown-result semantics。

實作順序、rollback/data gate 由 [Migration plan](../migrations/enterprise-organization-workforce-payroll.md) 擁有。

## Deferred

完整法定工時計算、自動曠工/加班、generic correction DSL、clock event bus 沒有真實 consumer 前不預建。

## Current-state routing

- [Attendance owner](../../owners/attendance.md)
- [Workforce owner](../../owners/workforce.md)
- [Payroll owner](../../owners/payroll.md)
- [Semantic model](../../../architecture/semantic-model.json)
- [Domain target](../proposals/domain-target.md)
- [Security target](../proposals/security-target.md)
- [Data target](../proposals/data-target.md)
- [Migration plan](../migrations/enterprise-organization-workforce-payroll.md)
