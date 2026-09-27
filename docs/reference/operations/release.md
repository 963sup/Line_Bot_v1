# Release

## Principle

Release讓同一 validated revision 的 external desired states各自收斂。Repository validation、database convergence、Web deployment、LINE publication與 real-client acceptance是不同 evidence，不是同一 transaction。

```text
Validate current main
        ↓
   release_plan
    ├─ Supabase
    ├─ Vercel
    ├─ Attendance scheduler
    └─ Rich Menu
```

Dependency edge只在 consumer 真正需要另一 owner 的新 state時存在。

## Planning

GitHub `Release` 只接受 same-repository current-`main` successful push `Validate`。Canonical `pnpm github:release-plan`：
1. 驗 validated SHA仍是 current `main`。
2. 為 Supabase、Vercel、Rich Menu各找最近 successful owner-job ancestor作獨立 baseline。
3. Supabase依 baseline判斷 schema change；Vercel用 Turborepo affected graph判斷 `@line_bot_v1/web#build`；Rich Menu只看其 assets/definition/desired-state。
4. Publication-only Rich Menu source不算 Web runtime change。

Owner cursor互不冒充；failure只阻塞有真實 dependency的 consumer。

## Convergence

### Supabase

每個 validated `main`：
- `schema:remote repair` 恢復 current-source-determined compatibility。
- schema changed → `schema:remote sync`；unchanged → `schema:remote verify`。
- target、lock、transaction、second diff、security readback與 migration-history invariant由 [Supabase](../platform/supabase.md) 擁有。
- `supabase_migrations.schema_migrations` before/after fingerprint必須相同。

### Vercel

只有 Web build有 pending runtime change才部署 Production。Web依賴 database contract時，deployment等待同 Release Supabase成功。Provider mutation前由 `pnpm github:current-main` 驗 exact SHA；Vercel adapter只處理 exact target/deployment/readback，不複製 release policy。

### Attendance scheduler

Scheduler只承載 Attendance background reconciliation，不擁有 Attendance state。Canonical `pnpm attendance:scheduler reconcile --live --sha <sha>`：
1. authenticated GET preflight production `/api/internal/attendance-maintenance`，只驗 deployed runtime與 worker credential，不處理 outbox。
2. 驗 exact Supabase target，以 non-pooling operator connection收斂 `pg_cron`、`pg_net`、Vault credential binding與 named `attendance-maintenance` job。
3. read back extension、Vault binding presence及 exact job name/schedule/command/active state；不讀出/輸出 secret。

Scheduler一定等待 Supabase；`web_affected=true` 時再等待同 SHA Vercel Production，否則沿 current production runtime reconcile。相同 `ATTENDANCE_WORKER_SECRET` 分別存在 Vercel runtime與Supabase Vault是跨 trust-boundary binding，不是第二份 business truth；缺任一 binding或 readback drift即 fail closed。

### Rich Menu

Desired state changed必 publication：
- 不需要新 Web runtime：current-main preview → publish → LINE readback，不等待 Supabase/Vercel。
- 需要本 release Web runtime：等待 exact validated SHA Vercel Production後 publish。

圖片/layout/既有 intent target等 publication-only change不被 database failure阻塞。

## Compatibility / authorization

Schema/Web協調切換必須維持 consumer compatibility；database convergence失敗時不得部署依賴新 contract的 Web。Release不產生 administrator，也不由 LINE ID、email、UI可見性推定資格；授權由 [Authorization](../security/permissions.md) 擁有。

## Evidence

分開記錄 validated revision、owner baseline/affected decision、database result、deployment result、provider publication/readback及 real-device/business acceptance。Workflow success或單一 owner success不替代其他 evidence。

具日期證據見 [Acceptance](../../change/evidence/README.md)。Provider細節見 [Supabase](../platform/supabase.md)、[Vercel](../platform/vercel.md)、[LINE rich-menu](../line/rich-menu.md)；schema見 [Schema model](../data/schema.md)，recovery見 [Recovery](recovery.md)。
