# Workforce / Attendance / Payroll convergence plan

狀態：只保存仍未完成的 Workforce/Employment、Attendance Employment cutover 與 Payroll activation/cutover。Account/User、Enterprise/Organization、Enterprise Team provenance、Organization-scoped Team、locator naming 等已完成 convergence 不再留在 migration 文件。

## Gate model

每個 slice 只需要完成自己實際觸及的證據層：

| Gate | Required result |
| --- | --- |
| D — Design | business result、owner、consumer、invariant、failure/replay、acceptance condition 清楚 |
| I — Implementation | Domain/Application/public contract/adapter 與必要 tests |
| S — Schema | authority、constraints、RLS/grants、transaction/replay/version 與 clean rebuild |
| R — Remote | preserve-data plan、backup/recovery、apply/readback/reconcile |
| V — Release | exact revision repository validation、deployment、API/device/business evidence as required |

純 Domain/contract/test 不需要假裝 remote 已完成；切 writer/schema/remote 時才要求相應 gate。

<a id="workforce--attendance--payroll-implementation-slices"></a>

## Workforce / Attendance / Payroll implementation slices

| Slice | 交付與範圍 | 啟用門檻 |
| --- | --- | --- |
| W1 — Employment runtime | Employment lifecycle、UserId + OrganizationAccountId、effective period、consumer 所需 versioned projection | current User/Organization scope 可權威解析；建立入口前定 participation/overlap、authority、replay/version |
| W2 — Attendance Employment cutover | command/history 由 current compatibility stream 安全接到 EmploymentId；Principal/User/Employment subject 分離 | W1；歷史/open-session mapping、receipt/request/version/reward/outbox/recovery；unknown provenance 不猜 scope |
| W3 — Versioned period inputs | Attendance correction/finalize/re-finalize、immutable AttendancePeriodVersion；Workforce 補 consumer 真正需要的 terms/policy/calendar/schedule version | WC2、PY2/PY3；不能用空資料或「沒有 open session」推定完整工時 |
| W4 — Payroll calculation | 既有 readiness 接 versioned inputs；PayrollRun/PayStatement、trace、deterministic tests | production rule applicability/version/rounding 與 required inputs 明確；不用假公式/零值過關 |
| W5 — Payroll persistence / approval / publication | owner adapter/schema、transaction/replay/version、authorization、audit/correction、authorized published self-read | PY4/PY5/PY6/PY8；S/R/V 各自完成 |
| W6 — Downstream handoff | 只有存在真實 Accounting/Payment consumer 時定 finalized projection、posting/payment idempotency與reconciliation | PY7；Payroll finalized、statement published、accounting posted、payment completed 分開 |

Workforce package existence不代表 Employment runtime 已啟用；只在第一個真實 consumer 出現時新增必要 exports/dependencies/persistence。Employment 是 Workforce owner 內語意，不建立平行 `packages/employment`。

DailyCheckIn 不併入 Attendance，也不成 Payroll input。Payroll 不把 Accounting posted 或 Payment completed 寫成自己的 lifecycle state。

## Schema / data cutover

任何新 persistent slice 都必須：

1. 明確 relation authority / Data Boundary。
2. 保留 stable existing IDs 與 historical facts。
3. 新舊 writer 不並行成永久 dual writer。
4. migration/backfill 不能猜 business metadata。
5. current DDL 進 `supabase/schemas/`；一次性 transition 不成 clean rebuild dependency。
6. PGlite/local validation 不取代 multi-connection / remote PostgreSQL evidence。

Adapter ownership 搬移不等於 Data Boundary 搬移；跨 owner relation 使用 reference/projection/transaction coordinator，而不是 direct private-table dependency。

## Remote gate

Current remote target 由 operations/release configuration 與 live readback共同確認；目前 explicit project ref 是 `nmssogphayjymjpbnrxv`。操作前仍必須重新 readback metadata/catalog，不靠文件日期、舊 chat 或 retired evidence 推定 environment/data 可刪。

預設 preserve-data：

```text
validated desired schema
→ live catalog/data preflight
→ reviewed diff / explicit business backfill
→ stop incompatible writer
→ bounded transaction/apply
→ catalog/security/data readback
→ runtime negative/positive smoke
```

Unknown、destructive、data-sensitive 或敏感 privilege transition 只走 manual reconciliation：先 `prepare-plan` 產生 exact plan + SHA-256，review 後以相同 fingerprint、recovery-readiness attestation 與 explicit apply authorization 執行。Auth/Storage/provider-owned state 不在 app schema rebuild boundary。External write 結果未知時先 readback，不盲目重跑。

## Acceptance matrix

| Concern | Required evidence |
| --- | --- |
| Identity | stable User/Employment/Organization identity；無第二 writer |
| Authority | Principal/subject/scope/holder 分離；revoke、wrong-scope、stale/replay fail closed |
| Attendance | history/correction/finalized period 可重建；unknown provenance 不猜 |
| Payroll | deterministic versioned input/result、lifecycle、auth/privacy、audit/correction/publication |
| Repository | docs/schema/check/validate 與受影響 tests 綁 exact revision |
| Remote/release | backup/readback/reconcile、deployment/API/device/business evidence 分層 |

## Rollback / completion

每個 slice 必須知道唯一 writer、停寫條件、pre/post schema、資料轉換可逆性與 recovery owner。新 writer 已產生資料後不能直接切回 incompatible old binary/schema；先停止寫入並 reconcile，restore 後只重放合法 receipt/outbox，不重複 business effect。

完成 slice 後：

- current truth 回 owning Domain/schema/public contract；
- gap 刪除或縮小；
- migration 中已完成段落刪除；
- dated evidence 只在仍有 recovery/regression/release價值時保留。

設計文件、CI、SQL success、deployment READY、device/business acceptance 各自只證明自己的層級。
