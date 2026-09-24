# Payroll target design

狀態：已選定的 target domain design，尚未完整實作／驗收。Payroll是第一階段Core target；具體法規/公司公式未定案，不以假公式冒充正式能力。

## Purpose

Payroll回答某 `OrganizationAccount + PayPeriod` 中，每個 Employment應產生什麼可追溯薪資結果、使用哪些input/rule versions、何時finalized。

```text
Workforce versioned facts + Attendance finalized facts
        ↓ EmploymentId
Payroll
        ↓
Finance when consumer exists
```

## Owned Model / Scope

Payroll擁有 PayPeriod、PayrollRun、PayStatement、Earning/Deduction/GrossPay/NetPay、PayrollInputVersion、publication/correction semantics。

PayrollRun scope固定 `OrganizationAccountId + PayPeriod + run version`；PayStatement scope固定 `EmploymentId + PayPeriod + calculation version`。User本人權限透過Employment relation解析，不用MemberId當永久Payroll identity。

## Invariants

- 缺必要 Workforce/Attendance/rule input不得FINALIZED。
- finalized result pin住input versions；上游correction不靜默改寫。
- money precision-safe。
- APPROVED/FINALIZED後correction走新version/adjustment/reversal。
- `calculated != approved != finalized != published != paid != posted`。
- Finance不自行重算PayStatement。

## Lifecycle

PayrollRun：DRAFT -> CALCULATING -> CALCULATED -> APPROVED -> FINALIZED。PayStatement publication：UNPUBLISHED -> PUBLISHED。

## Relationships / Authorization

Upstream Organization提供OrganizationAccount scope；Workforce提供Employment/versioned inputs；Attendance提供finalized period。一般User只讀透過本人Employment有權取得且已published的statement。OrganizationMembership/OrganizationAdmin/TeamManager/EnterpriseAdmin都不自動等於Payroll manager/approver。

Command/audit actor使用PrincipalId，不以OrganizationAccountId或EnterpriseAccountId冒充actor。

## Events / Integration

`PayrollRunFinalized`只有Finance async consumer存在時使用；`PayStatementPublished`供notification/projection consumer。Consumer不讀private Payroll tables。

## Failure / Replay / Persistence

至少區分scope/authz、missing input、rule unavailable、stale/replay conflict、partial calculation、lifecycle conflict、unknown result。有副作用command使用requestId/fingerprint/durable result；FINALIZED不接受last-write-wins。

PostgreSQL durable result與versioned input trace是authority；schema在implementation phase由Data owner定義。

## Known Drift / Open Questions

Current沒有正式Payroll runtime；Workforce/Attendance upstream尚未完整落地。正式calculation rule source、manager/approver representation、correction shape、Finance consumer、retention/audit來源仍待定。

## Acceptance Criteria

至少證明跨Organization不漏statement、missing input不能FINALIZED、replay不重複、finalized可重建source versions、correction不覆寫舊result、unpublished不進Personal Center、self read由User->Employment關係解析。
