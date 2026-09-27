# Release
## Principle
Release 把已驗證 revision 的多個 external desired states 收斂到各自 provider。Repository validation、database convergence、Web deployment、LINE publication 與 real-client acceptance 是不同 evidence，也不是天然同一 transaction。

Release graph 只保留真實 dependency：

```text
Validate current main
        ↓
   release_plan
    ├─ Supabase
    ├─ Vercel
    ├─ Attendance scheduler
    └─ Rich Menu
```

若某 owner 的 change 真正依賴另一 owner 的新 state，才建立 dependency edge；同一個 Release event 不等於同一個 consistency boundary。
## Trigger and planning
Current GitHub `Release` 只接受同 repository、current `main` 的 successful push `Validate`。

`release_plan` 是 GitHub Actions adapter job；routing policy authority 在 GitHub integration，executable implementation 由 canonical `pnpm github:release-plan`（`scripts/github/release-plan.mjs`）擁有。Workflow 只提供 trigger、checkout/setup、permission 與 outputs wiring。

Planner 是 read-only router：

1. 確認 validated SHA 仍是 current `main`。
2. 對 Supabase、Vercel、Rich Menu 分別尋找「最近一次該 owner job 成功」且為 current SHA ancestor 的 baseline。
3. Supabase 以該 baseline 判斷 `supabase/schemas/*.sql` 是否有 pending change。
4. Vercel 以該 baseline配合 Turborepo affected graph判斷 `@line_bot_v1/web#build` 是否真正受影響。
5. Rich Menu 以該 baseline判斷 assets／definition／desired-state 是否有 pending change。
6. Rich Menu publication-only source本身不算 Web runtime change；只有同一 pending range 另有實際 Web runtime-affecting change時，才要求先完成 Vercel。

每個 owner有自己的 convergence cursor。某 owner failure不得阻止不依賴它的 owner收斂，也不得把其他 owner 已成功的 change 在下次誤判為 pending。
## Owner-specific convergence
### Supabase
每個 validated `main` 都執行 provider precondition與 current-contract verification：

1. `schema:remote repair` 只恢復 current-source-determined、metadata-free runtime compatibility。
2. owner baseline之後若 `supabase/schemas/*.sql` 有 change，執行 plain `schema:remote sync`。
3. schema unchanged 則執行 `schema:remote verify`。
4. target check、lock、transaction、second diff、security readback與 migration-history invariant由 [Supabase](../platform/supabase.md) 擁有。

Supabase migration history不是 deployment authority；reconciliation不得新增、replay或repair migration history，`supabase_migrations.schema_migrations` fingerprint before/after必須完全相同。
### Vercel
只有 `@line_bot_v1/web#build` 有 pending runtime-affecting change時才部署 Production。因 Web runtime依賴 database contract，Vercel deployment仍要求同一 Release的 Supabase convergence成功。

Canonical adapter只驗證 active current-main Release與 successful `release_plan`；跨 provider dependency由 GitHub Release graph擁有，不在 Vercel adapter複製第二份 release policy。每個 external mutation 前的 exact-SHA current-main readback由 canonical `pnpm github:current-main` 提供，workflow不重寫 GitHub API / branch判斷。
### Attendance scheduler

Attendance per-user Rich Menu reconciliation 需要 production background scheduler，但 scheduler 不是 Attendance business authority。Canonical `pnpm attendance:scheduler reconcile --live --sha <sha>` 只收斂 operational desired state：

1. 先以 authenticated GET 驗證 production `/api/internal/attendance-maintenance` 已部署且接受同一 worker credential；這一步不處理 outbox。
2. 使用 exact Supabase production target guard 與 non-pooling operator connection。
3. 收斂 `pg_cron`、`pg_net`、Supabase Vault worker credential binding 與 named `attendance-maintenance` cron job。
4. read back extension、Vault binding presence、job name/schedule/command/active state；不讀出或輸出 secret value。

Release graph只保留真實 dependency：Scheduler 一定等待 Supabase convergence；若 `web_affected=true`，還必須等待同 SHA Vercel Production成功，避免 cron先呼叫舊 Web contract。若 Web 未變，沿 current production runtime直接 reconcile。

`ATTENDANCE_WORKER_SECRET` 是跨 Vercel runtime 與 Supabase Vault 的同一 credential binding；兩邊保存 secret 是 trust-boundary necessity，不是兩份 business truth。缺少任何 binding或 readback不一致時 fail closed。

### Rich Menu
Rich Menu desired state changed時一定進 publication path，但分兩種：

- 沒有 pending Web runtime dependency：validated current `main` 直接 preview → publish → LINE readback，不等待 Supabase／Vercel。
- 同一 pending range有 Web runtime-affecting change：等待 exact validated SHA Vercel Production成功後再 publish。

因此圖片、label、layout、既有 intent target等 publication-only change不被 database failure阻塞；只有需要本 release 新 Web runtime的 navigation change才建立 Vercel → Rich Menu edge。
## Compatibility
Schema 與 Web若需要協調切換，必須維持 consumer compatibility：不能先讓新 Web依賴尚未存在的 relation，也不能讓舊 Web持續服務於已與其不相容的 schema。

Database convergence失敗時不得部署依賴該 database contract的新 Web runtime。但不依賴 database或 Web runtime的 LINE desired-state convergence可獨立完成。
## Authorization changes
Release不得自行產生 administrator，也不從第一位註冊者、LINE ID、email或 UI可見性推定 business資格。授權來源與變更命令由 [Authorization](../security/permissions.md) 擁有。
## Evidence
每個 external owner分開記錄：

- code / validated revision
- owner baseline與 affected decision
- database convergence result
- runtime / deployment result
- external platform publication/readback
- real-device / business acceptance evidence（如適用）

Workflow整體 success不取代 owner evidence；owner job success也不能冒充其他 owner完成。

具日期驗收證據放 [Acceptance](../../change/evidence/README.md)，不累積在本文件。

Provider機制見 [Supabase](../platform/supabase.md) 與 [Vercel](../platform/vercel.md)；Rich Menu見 [LINE rich-menu](../line/rich-menu.md)；schema語意見 [Schema model](../data/schema.md)；backup／restore見 [Recovery](recovery.md)。
