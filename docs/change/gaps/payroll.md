# Payroll gaps

本文只保存 Payroll 尚未完成的 activation gaps 與 completion condition。模型、lifecycle、authorization/invariant 由 [Payroll owner](../../owners/payroll.md) 擁有；readiness foundation 不等於正式算薪能力。

## Activation matrix

| Capability | Completion condition |
| --- | --- |
| calculate / recalculate | production rule source/effective/applicability/version/rounding、Workforce/Attendance versioned inputs、operation lifecycle/version/replay、authority/scope、trace/audit |
| approve / finalize / correct | 上述條件 + review/approval separation、immutable result/correction、persistence/concurrency negative cases |
| publish / self-read | lifecycle-valid result、self-read privacy、publication audit、authorized projection |
| Finance posting / payment | 各自 owner、consumer、source idempotency/reconciliation；Payroll finalized 不等於 posted/paid |

每個入口只在其必要條件完成後啟用；不得為解除文件阻礙縮減 required inputs、跳過 authorization 或建立第二個正式 writer。

## Open gaps

| ID | Gap | Completion condition |
| --- | --- | --- |
| PY1 | Production calculation rule version未建立 | canonical source/effective/applicability/version/rounding/positive-negative cases |
| PY2 | Workforce inputs未正式可引用 | Employment/terms/policy/schedule versioned projection可重建 |
| PY3 | Attendance period finalization未實作 | EmploymentId + PayPeriod immutable/versioned input；correction 建新 version |
| PY4 | PayrollRun/PayStatement lifecycle未正式實作 | calculate/approve/finalize/publish/correct/replay/version tests |
| PY5 | Payroll auth/privacy未實作 | User self-read經Employment relation；management/approval分離；cross-Organization拒絕 |
| PY6 | Audit/correction未實作 | PrincipalId/reason/version evidence；finalized 不覆寫 |
| PY7 | Finance/payment boundary未定案 | 明確 Finance consumer contract；Payment 另判 owner |
| PY8 | Personal Center projection未實作 | unpublished 不可讀；published 只對合法 User/Principal 可見；partial failure 可辨識 |

## Open business decisions

首版薪資規則範圍、Earning/Deduction、approval segregation、publication vs payment owner、Finance sync/async contract仍待真實 business decision。

Current owner/status： [Payroll owner](../../owners/payroll.md) · [Semantic model](../../../architecture/semantic-model.json)。Implementation sequencing： [Migration slices](../migrations/enterprise-organization-workforce-payroll.md#workforce--attendance--payroll-implementation-slices)。
