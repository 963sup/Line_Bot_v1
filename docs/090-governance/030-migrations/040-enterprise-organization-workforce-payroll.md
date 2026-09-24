# Account / Enterprise / Organization / Workforce / Attendance / Payroll convergence plan

狀態：Account/User、DailyCheckIn、Enterprise/Organization governance、Enterprise Team membership/Organization assignment provenance 與 Organization-scoped Team 已有 current owner/source；Workforce/Employment、Attendance Employment cutover、正式 Payroll、outside collaborator/resource access 與部分 release acceptance 尚未完成。本文件只擁有 migration/gate/rollback 順序，不重複各 business owner 規則。

## Stage gates

| Stage | 交付與放行條件 | 目前狀態 |
| --- | --- | --- |
| D — Design | owner、語言、consumer、security/data、failure/replay 與 acceptance condition 清楚 | Account/Enterprise/Organization/Team 與 Workforce/Payroll target 均有 owner；未決政策留 gaps |
| G — Documentation convergence | 該 slice 的 current/target/history、導航與 canonical owner 同步，不保留雙 owner／斷鏈 | current governance/Team/EnterpriseTeam provenance 已同步 canonical docs；歷史 evidence 原文保留 |
| I — Implementation | Domain/Application/contracts/adapters、consumer 與必要 unit/DB/concurrency/security tests | Account/User、governance、EnterpriseTeam provenance、Organization Team 已有 current source；Workforce/Payroll 尚按 W1–W6 推進 |
| S — Schema | current DDL、constraints/grants/functions、migration/rebuild/recovery evidence | Account/governance/EnterpriseTeam provenance/Organization Team 有 current schema；Workforce/Payroll tables 尚未建立 |
| R — Remote synchronization | 指定 project 的 backup/recovery、reviewed diff、apply/readback/reconcile | governance EnterpriseTeam/provenance schema 已 forward-sync 指定 project；後續 slice 仍需各自 evidence |
| V — Release / acceptance | 新 revision CI、deployment、API/LINE/device/business evidence | Source/remote sync 不代表 final release/device/business acceptance；以 final SHA 各層證據判定 |

這些是每個 slice 的證據層級，不是要求整個產品一次完成。純 Domain／contract/test 可以在不改 current writer 的前提先做；切 writer/schema/remote/release 時才要求該操作實際需要的 gate。

## Current convergence already reflected

以下 current 事實不再當成 future migration：

- Account/User 是人類 lifecycle/qualification owner；`Member`／membership route/permission/error/storage literal 只按 compatibility protocol 保留。
- DailyCheckIn 是每日簽到 policy/use case/claim owner；Ledger V1 `membership/daily_checkin` source tuple 不因 owner rename 改寫。
- Organization Team 是 Organization-scoped current source，使用 TeamMembership/TeamMaintainer；不再有開放的 WorkGroup→Team code/schema naming gap。
- Enterprise/Organization 有 current governance source；Enterprise direct affiliation、Organization invitation/direct membership source/effective membership 已分離。
- EnterpriseTeam、EnterpriseTeamMembership、Team → Organization assignment 與 direct + `enterprise-team` Organization membership provenance 已形成 current vertical slice；source removal 只撤自己的資格並保護 membership-bound Owner invariant。
- EnterpriseTeam extended GitHub semantics（outside collaborator、Enterprise roles/licensing/ruleset bypass、resource access）與完整 policy/release acceptance仍按 gaps。

Historical acceptance、migration evidence、immutable receipts/protocol literals 不機械改寫；完成的 migration 蒸餾到 current owner。

<a id="workforce--attendance--payroll-implementation-slices"></a>

## Workforce / Attendance / Payroll implementation slices

| Slice | 交付與範圍 | 接續／啟用門檻 |
| --- | --- | --- |
| W1 — Workforce / Employment | Employment lifecycle、UserId + OrganizationAccountId、effective period、consumer 所需 versioned projection/ports/tests；不新增 global Employee identity | current User/Organization scope 可權威解析；建立入口前定案 participation／overlap policy、authority、replay/version |
| W2 — Attendance Employment cutover | 分開 Principal、User、Employment subject；將 command/history 從 current Member-compatible stream 安全接到 EmploymentId | W1；歷史/open session mapping、receipt/request/version/reward/outbox/recovery；未知 provenance 不猜 scope |
| W3 — Versioned period inputs | Attendance correction、period finalize/re-finalize、immutable AttendancePeriodVersion；Workforce 只補真實 consumer 需要的 terms/policy/calendar/schedule projection | WC2、PY2/PY3；不能用「沒有 open session」或空資料推定完整工時 |
| W4 — Payroll calculation domain | 沿既有 readiness 接 versioned inputs；PayrollRun/PayStatement、calculation trace、deterministic tests | 純模型可先做；正式 calculate 仍須 production rule applicability/version/rounding 與 required inputs，不用假公式／零值通過 |
| W5 — Payroll persistence / approval / publication | Owner adapter/schema、transaction/replay/version、authorization、audit/correction、本人 published projection | PY4/PY5/PY6/PY8；schema/remote/release 各自過 S/R/V |
| W6 — Finance handoff | 只有存在真實 Finance consumer 時定 finalized result projection、posting idempotency/reconciliation | PY7；Payroll finalized、statement published、accounting posted、payment completed 分開 |

Workforce module foundation 已完成並由 `packages/workforce` 擁有；W1 現在只 gate 第一個 Employment runtime consumer。啟用時才新增必要 implementation、public exports、dependencies、tests 與 persistence；不得把 module existence 當 capability completion。`employment` 是 Workforce 語意，不平行建立 `packages/employment`；不為未發生需求預建 resource/policy/audit/billing/notifications 或 generic rules engine。

DailyCheckIn 不併入 Attendance，也不成為 Payroll input。Payroll lifecycle 以 Payroll owner 的 `FINALIZED` 與獨立 publication 語意為準，不把 accounting posted/payment completed 寫成 Payroll state。

## Account locator routing cutover

GitHub-like locator rollout 採 expand → cutover → contract：`account_logins` 是 User/Organization shared login namespace；new User registration、new Organization provisioning 與 new Enterprise provisioning 都在同一 transaction 建立 locator。既有 User 可由 Account self surface 明確 claim/change login；不得依 provider display name 推導。

Current declarative target 已完成 locator contract：Enterprise `name + slug`、Organization Team `slug`、Enterprise Team `slug` 都是 non-null current truth；所有 runtime writers 同步建立 locator。指定 remote 若仍有 pre-locator data，不得由 Agent 猜 name/slug。Preserve-data rollout 必須先以明確 operator/business input backfill並 readback；若環境被明確授權使用 destructive `Supabase Schema Replace`，則由 validated current schemas 重建 app-owned state，不建立 fabricated backfill或第二套 migration truth。

## Schema and persistence gate

逐份 migration 分類為 current DDL、transition DDL、一次性 DML/backfill、historical evidence。只有 current definitions 進 declarative schemas；歷史轉換不塞進每次 clean rebuild。移除 repository SQL 前要有可追溯 commit/checksum，並證明 current schemas 可獨立重建。

Adapter ownership 搬移不等於 Data Boundary 搬移。任何新 schema 必須伴隨 authority、constraints、RLS/grants、transaction/replay/version tests；PGlite 不取代 multi-connection concurrency 或遠端 catalog readback。本次 EnterpriseTeam/provenance schema 已維持 declarative source + remote forward sync，不另建 compatibility migration layer。

## Remote gate

指定 remote project 為 `nmssogphayjymjpbnrxv`。操作前重新以 live project metadata/catalog 確認環境、retention、backup/recovery 與 affected deployments；不能靠舊 chat 推定 production/development 或資料可刪。

預設 preserve-data：比較 catalog 與 validated schema、審查 DDL/data transform、在 incompatible cutover 前停止舊 writer、可恢復 apply/backfill、對帳 ID/state/version/receipt/outbox/history，再以新 runtime 做 authenticated positive/negative smoke tests。無法確認結果時停止，不盲目重跑。Auth/Storage 不在 app schema rebuild 刪除範圍。

## Acceptance matrix

| ID | Required evidence |
| --- | --- |
| A1 identity | stable ID/root/facet/kind/qualification 與 compatibility protocol 可解釋，無雙 identity writer |
| A2 authority | Principal/participation/scoped role/Employment/holder 不混用；revoke/concurrency/replay fail closed |
| A3 value/history | Coin denomination/source tuple、receipt/history 保留；immutable fact 不因 rename 改寫 |
| A4 scope | Enterprise/Organization/Enterprise Team/Organization Team/Employment relation可信；membership source provenance 可追溯；cross-scope拒絕；unknown provenance不猜 |
| A5 Workforce/Attendance | Employment versions、Attendance history/correction/finalization 可重建 |
| A6 Payroll | deterministic input/result、lifecycle/auth/privacy/audit/correction/publication tests |
| A7 repository | docs:check、schema:check、check/validate 與變更範圍 tests 綁實際 SHA |
| A8 remote/release | backup/readback/reconcile、deployment/API/LINE/device/business evidence 分層記錄 |

## Rollback and completion reporting

每 slice 明確唯一 writer、停寫條件、pre/post schema、資料轉換可逆性與 recovery owner。新 writer 產生資料後不能直接 rollback 舊 binary/schema；先停寫並 reconcile，必要 restore 後只重放合法 receipt/outbox，不重複 business effect。

完成後蒸餾回 current owner，關閉對應 gap，並以具日期/revision/environment 的 evidence 支持。**設計文件、CI 綠燈、SQL success、deployment READY、手機/business acceptance 各自只證明自己的層級。**
