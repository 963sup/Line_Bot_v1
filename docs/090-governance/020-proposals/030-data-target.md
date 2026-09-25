# Selected data target

狀態：selected future data design，不是 current database truth。Current desired PostgreSQL structure 只由 `supabase/schemas/` 擁有；current data contract 回 [Data](../../040-data/README.md)。

## Target scope

本文件只描述尚未成為 current persistence 的 Workforce / Attendance Employment handoff / Payroll data delta。Account/User、Enterprise/Organization、Team、Repository/Issue、Attendance current stream、Expense、Notifications、Partners、DailyCheckIn、Asset/Wallet/Ledger 等既有 relation 不在此重建第二套 model。

## Identity continuity

- Existing AccountId/UserId/EnterpriseAccountId/OrganizationAccountId/TeamId/RepositoryId 都保留 stable identity。
- 不因新 target 使用 UUID 或不同 provider 就 rekey/cast/prefix/trim existing IDs。
- Provider subject、Supabase Auth user、LINE identity 與 product Account/User identity 分開。
- PrincipalId、subject ID、scope ID、holder ID 是 consumer semantics，不建立第二 identity root。

## Target relations

```text
UserId ── EmploymentId ── OrganizationAccountId
             │
             ├─ EmploymentTermsVersion
             ├─ WorkPolicyVersion
             ├─ CalendarVersion
             └─ PublishedScheduleVersion

EmploymentId ── Attendance actual facts
                     ↓
             AttendancePeriodVersion
                     ↓
               PayrollInputVersion
                     ↓
          PayrollRun ── PayStatement
```

責任：

- Workforce owns Employment、terms、policy、calendar、schedule facts。
- Attendance owns actual clock/session/correction/finalized period facts。
- Payroll owns calculation input binding、result lifecycle、PayStatement。
- Cross-owner reference 不複製上游 truth；只保存 stable reference + required source version/provenance。

## Data invariants

- OrganizationMembership != Employment。
- Employment lifecycle/version 與 User lifecycle/version 分開。
- Attendance historical fact 不因目前 policy/schedule 改變而重寫。
- Finalized AttendancePeriodVersion immutable；correction 建新 version。
- PayrollInputVersion 必須 pin 所有 required Workforce/Attendance/rule versions。
- Finalized Payroll result 不因上游後續修改而變動；correction/recalculation 產生新 result/version。
- Missing/unresolved provenance 不用 default Organization/Employment 補值。
- Audit/receipt/outbox 是 evidence/coordination，不取得 business truth ownership。

## Transaction / replay

Side effect 必須以 owner stable request identity、fingerprint、expectedVersion 與 durable result 保證 exact retry。Unknown result 先 readback 原 request，不換 requestId 重送。

Cross-owner atomic invariant 只有真實 consistency requirement 時才使用 transaction coordinator；不能因共用 PostgreSQL 就讓 package 直接讀寫其他 owner private relation。

## Schema activation

Target relation 只有在第一個真實 runtime consumer 具備 owner contract、authorization、transaction/recovery 與 tests 後才進 `supabase/schemas/`。Reserved target file 不代表 persistence 已啟用。

每個 activation slice：

```text
owner/domain contract
→ application command/query
→ persistence/public export
→ declarative schema
→ clean schema validation
→ preserve-data remote plan
→ apply/readback
→ deployment/device/business evidence as required
```

Remote write 不使用 migration history 當 current truth；current repository contract 與 remote catalog 必須以 repository-owned reconciliation 驗證。

## Recovery / cutover

- 不 reset 有正式資料的 remote 只為取得表面一致。
- 先停止 incompatible old writer，再做可恢復 expansion/backfill/cutover。
- 需要不可推導 business metadata 時由 operator 明確提供，不從 UUID/display text/provider state 猜值。
- Cutover 後不得保留永久 dual writer、alias 或 compatibility table 掩蓋 owner ambiguity。
- Auth/Storage/provider-owned schema 不屬 application rebuild boundary。

## Routing

- Current schema：[Schema model](../../040-data/030-schema-model.md)
- Transaction/replay：[Transaction and idempotency](../../040-data/040-transaction-and-idempotency.md)
- Identity mapping：[Identity mapping](../../040-data/050-identity-mapping.md)
- Target domain：[Selected domain target](010-domain-target.md)
- Target security：[Selected security target](040-security-target.md)
- Active migration：[Migration](../030-migrations/040-enterprise-organization-workforce-payroll.md)
