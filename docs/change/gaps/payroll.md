# Payroll gaps

Payroll target 已定義並有 readiness foundation，但尚無可宣稱正式算薪的完整 PayrollRun/PayStatement runtime、deployable schema 或 business acceptance。模型與 lifecycle 由 [Payroll rules](../../010-domain-owners/060-payroll.md) 擁有。

Current [readiness source](../../../packages/payroll/src/domain/readiness.ts) 只檢查 versioned input 是否齊備並拒絕重複／空 rule version/source；它不計算金額、不寫資料或授權。`ready: true` 不代表 rule applicability、來源事實、scope、部署或業務驗收已完成。這是 foundation 的責任，不是禁止 Payroll owner 新增後續能力。

## Implementation versus activation

依 [Migration slices](../030-migrations/040-enterprise-organization-workforce-payroll.md#workforce--attendance--payroll-implementation-slices) 可先交付純模型、versioned input contract 與 deterministic tests，不必先完成 payment、Finance、所有 HR UI 或全域 compatibility 清理。合成 fixture 必須標示為測試資料，不進正式 rules registry、不掛可用算薪入口、不作驗收依據。

| 待啟用能力 | 必須完成的相關條件 |
| --- | --- |
| 正式 calculate/recalculate | PY1–PY3 的實際適用規則／來源與完整版本輸入、PY4 的該操作 lifecycle/version/replay、PY5 的該操作 authority/scope、PY6 的 trace/audit |
| approve/finalize/correct | 上述條件加上相應 review/approval、immutable result/correction 與持久化／並行負例 |
| publish / 本人讀取 | 已符合 lifecycle 的結果、PY5 的 self-read privacy、PY6 publication audit，以及所啟用 surface 的授權 projection；Personal Center 對應 PY8 |
| Finance posting / payment | PY7 的各自 owner、consumer、source idempotency 與 reconciliation；不以 Payroll finalized 代替 posted/paid |

每個入口只在其必要條件完成後啟用；不為解除文件阻礙縮減 required inputs、跳過 authorization 或保留第二個正式 writer。

## Known drift

- Current Attendance尚無EmploymentId+PayPeriod finalized AttendancePeriodVersion。
- Current Workforce尚未落地EmploymentTerms/WorkPolicy/Schedule versioned inputs。
- OrganizationAccount scope與User->Employment self-read chain尚未完整落地。
- Taiwan payroll有source registry但applicability/table versions/rounding/test set尚未完成。
- Payroll management/approval authorization未實作。
- Personal Center尚未published PayStatement target projection。
- Finance/payment downstream尚未正式化。

## Open questions

首版薪資規則範圍、Earning/Deduction、approval segregation、publication vs payment owner、Finance sync/async contract仍待真實business decision。

## Gaps

| ID | Gap | Completion condition |
| --- | --- | --- |
| PY1 | Production calculation rule version未建立 | canonical source/effective/applicability/version/rounding/positive-negative cases |
| PY2 | Workforce inputs未正式可引用 | Employment/terms/policy/schedule versioned projection可重建 |
| PY3 | Attendance period finalization未實作 | EmploymentId+PayPeriod immutable/versioned input；correction新version |
| PY4 | PayrollRun/PayStatement lifecycle未正式實作 | calculate/approve/finalize/publish/correct/replay/version tests |
| PY5 | Payroll auth/privacy未實作 | User self-read經Employment relation；management/approval分離；cross-Organization拒絕 |
| PY6 | Audit/correction未實作 | PrincipalId/reason/version evidence；finalized不覆寫 |
| PY7 | Finance/payment boundary未定案 | 明確Finance consumer contract；payment另判owner |
| PY8 | Personal Center projection未實作 | unpublished不可讀；published只對合法User/Principal可見；partial failure可辨識 |

## Acceptance criteria

- 相同PayrollInputVersion+rule version deterministic。
- 缺required input不能FINALIZED。
- stale/replay不產生第二份正式result。
- OrganizationAccount+PayPeriod lifecycle不跳state。
- finalized後upstream變更不改舊PayStatement。
- 一般User只讀透過本人Employment有權取得的published statement；EnterpriseAdmin/OrganizationMembership/TeamManager不自動授權。
- cross-Organization read/write/source reference拒絕。
- delivery failure不回滾已commit publication。

完整證據進 `090-governance/060-acceptance/`；foundation evidence不關閉上述gaps。
