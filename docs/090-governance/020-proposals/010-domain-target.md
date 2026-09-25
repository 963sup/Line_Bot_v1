# Selected domain target

狀態：selected future design，不是 current implementation、schema、remote state、deployment 或 device acceptance。Current truth 回 [Domain owners](../../010-domain-owners/README.md)、[Domain map](../../000-core/020-domain-map.md) 與實際 source/schema/tests。

## Target focus

目前唯一已選定、仍需要 target-level 設計的主鏈是：

```text
User + Organization
        ↓
    Employment
        ↓
     Attendance
        ↓
      Payroll
```

Account/User、Enterprise/Organization governance、Organization-scoped Team、Repository/Issue、Attendance current stream、Expense、Notifications、Partners、DailyCheckIn、Asset/Wallet/Ledger 與 Assistant 已有 current owner；target 文件不得把它們重新變成 future model。

Workforce/Employment、Attendance Employment cutover、versioned Payroll input/result 是後續實作焦點。Accounting、Billing / Charging、Payment、Settlement 只保留 canonical vocabulary boundary；沒有真實 consumer 時不建立 context/package/schema。其他 ERP 類候選能力不列入 selected target。

## Boundary invariants

- Account 是 identity foundation，不是 universal business model。
- User != Employment；OrganizationMembership != Employment；TeamMembership != Position。
- Enterprise != Organization != Team != Employment。
- Project 是 planning boundary，Project != WBS；Project reference 不取得 Repository content/permission/lifecycle authority。
- Attendance 保存 actual work facts；Workforce 保存 applicable employment/terms/policy/calendar/schedule。
- Payroll 消費 versioned Workforce + Attendance facts，不覆寫上游事實。
- Asset 是 value definition；Wallet 是 holding/balance projection；Ledger 是 append-only value facts，不等於 accounting General Ledger。
- Assistant/Agent 只能產生 draft/orchestration；模型輸出不是正式 authority。
- Principal、subject、scope、holder 分開；scope 或 provider identity 不冒充 actor。
- Accounting、Billing / Charging、Payment、Settlement 的責任定義只由 [Glossary](../../000-core/050-glossary.md) 維護。

## Target owner deltas

| Owner | Target delta | 不建立 |
| --- | --- | --- |
| Workforce | Employment、EmploymentTerms、WorkPolicyVersion、Calendar、published Schedule | 第二個 User identity、actual attendance |
| Attendance | 以 EmploymentId 建立 actual stream / finalized period / correction handoff | Employment lifecycle、Payroll calculation |
| Payroll | versioned input、deterministic calculation、PayrollRun、PayStatement、approval/finalize/publication/correction | bank payment、Accounting posting、上游事實 writer |

其餘 owner 只有在出現第二個真實 consumer、implementation、variation、external technology boundary、policy/transaction/recovery/isolation responsibility 時才新增 abstraction。

## Relationship rules

```text
User ── Employment ── Organization
             │
             ├─ EmploymentTerms
             ├─ WorkPolicyVersion
             ├─ Calendar / Schedule
             │
             └─ Attendance facts
                      ↓
              AttendancePeriodVersion
                      ↓
                 PayrollInputVersion
                      ↓
              PayrollRun / PayStatement
```

- Employment 必須有 explicit Organization scope 與 lifecycle/version。
- Employment 的 eligibility 不從 Team、LINE group、profile、provider role 或 UI selection 推導。
- Attendance cutover 前的 historical provenance 若不能證明，必須表示 unresolved，不猜 default Employment。
- Payroll finalized result pin 所有 input/rule versions；後續 correction 產生新 version/result，不改寫舊 result。

## Event rule

只有「已 committed fact + 真實 consumer」才建立 event。Target 目前只允許以下事件方向：

- AttendancePeriodFinalized：Attendance → Payroll。
- PayrollRunFinalized：Payroll → downstream approved consumer。
- PayStatementPublished：Payroll → authorized self-read / notification projection。

沒有 consumer 的 event、generic workflow bus、tool registry、approval engine 不預建。

## Public contract rule

跨 owner 只公開 consumer 真正需要的 capability：

- Workforce：resolve Employment / applicable versioned facts。
- Attendance：Employment-scoped command/query 與 finalized period projection。
- Payroll：run state/version、missing/conflict、published statement、必要 finalized projection。

Public contract 不序列化 private Entity/repository，也不因 provider SDK、SQL table 或 UI route 形狀決定。

## Activation gate

每個 target slice 啟用前必須同時有：

1. 真實 consumer 與 business result。
2. owner / Source of Truth / Data Boundary。
3. authorization / scope / lifecycle / version。
4. transaction / replay / unknown-result / recovery。
5. current schema/public contract 與 consumer。
6. negative tests + repository validation。
7. 需要 remote/deployment/device/business evidence 的項目各自驗證。

不滿足時維持 gap/target，不建立空 page、package、table、event、wrapper 或 compatibility facade。

## Routing

- Current owner：[Domain owners](../../010-domain-owners/README.md)
- Current relationships：[Repository map](../../000-core/030-repository-map.md)
- Target data：[Selected data target](030-data-target.md)
- Target security：[Selected security target](040-security-target.md)
- Workforce / Attendance / Payroll cutover：[Migration](../030-migrations/040-enterprise-organization-workforce-payroll.md)
- Open completion conditions：[Gaps](../040-gaps/README.md)
