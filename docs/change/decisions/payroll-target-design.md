# Payroll target design

本文保存 Payroll target domain decision；current foundation/runtime status、未完成 gap 與 acceptance evidence 由 Payroll owner、semantic model 與 change/evidence sources 擁有。未核定法規/公司公式不得以假公式冒充正式能力。

## Decision

Payroll 回答某 `OrganizationAccount + PayPeriod` 中，每個 Employment 應產生什麼可追溯薪資結果、使用哪些 input/rule versions，以及何時 finalized / published。

```text
Workforce versioned facts
+ Attendance finalized facts
        ↓ EmploymentId
      Payroll
        ↓
Finance only when a real consumer exists
```

Payroll 擁有 PayPeriod、PayrollRun、PayStatement、Earning/Deduction/GrossPay/NetPay、PayrollInputVersion，以及 publication/correction semantics。

## Scope / identity

- PayrollRun scope = `OrganizationAccountId + PayPeriod + run version`。
- PayStatement scope = `EmploymentId + PayPeriod + calculation version`。
- User self-read 透過 User → Employment 關係解析，不以 legacy Member identity 作永久 Payroll key。
- Command/audit actor 使用 PrincipalId；resource/scope identifier不冒充 actor。

## Invariants

- 缺必要 Workforce / Attendance / rule input 不得 FINALIZED。
- Finalized result pin住 input versions；上游 correction 不靜默改寫既有結果。
- Money representation 必須 precision-safe。
- Approved/finalized 後的 correction 走新 version / adjustment / reversal。
- `calculated ≠ approved ≠ finalized ≠ published ≠ paid ≠ posted`。
- Finance 不重新計算 PayStatement。
- Replay/stale/unknown-result 不得造成重複或 silent last-write-wins。

## Lifecycle / authority

PayrollRun target lifecycle：

```text
DRAFT → CALCULATING → CALCULATED → APPROVED → FINALIZED
```

PayStatement publication：

```text
UNPUBLISHED → PUBLISHED
```

Organization participation、Team role、Enterprise role 都不自動等於 Payroll manager/approver。Payroll management/calculate/approve/finalize 必須由 explicit policy owner決定。

## Integration

`PayrollRunFinalized` 只有真實 Finance async consumer存在時才需要；`PayStatementPublished` 只在 notification/projection consumer 真實存在時建立。Consumer 不讀 Payroll private tables。

## Open decisions / deferred

正式 calculation rule source、manager/approver representation、correction shape、Finance consumer、retention/audit policy仍需 owner evidence。台灣稅/勞健保/勞退/加班費公式、bank payment、generic formula DSL、多國 Payroll abstraction都不得提前假定。

## Current-state routing

- [Payroll owner](../../owners/payroll.md)
- [Workforce owner](../../owners/workforce.md)
- [Attendance owner](../../owners/attendance.md)
- [Semantic model](../../../architecture/semantic-model.json)
- [Domain target](../proposals/domain-target.md)
- [Security target](../proposals/security-target.md)
- [Data target](../proposals/data-target.md)
