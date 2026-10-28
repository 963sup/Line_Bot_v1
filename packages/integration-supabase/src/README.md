# Supabase 開發入口

本 README 只提供導航；不維護第二套 schema、release、recovery 或 remote reconciliation truth。

## Source of Truth

| Concern | Owner |
| --- | --- |
| Current PostgreSQL structure | [`schemas/`](schemas/) |
| Private File Bucket desired state | [`config.toml`](config.toml) (`[storage.buckets.repository-files]`) |
| Schema semantics / DDL vs data transform | [Schema model](../../../docs/reference/data/schema.md) |
| Persisted relation ownership | [Data topology](../../../architecture/registry.json#data) |
| Supabase provider / remote reconciliation | [Supabase platform](../../../docs/reference/platform/supabase.md) |
| Publication ordering | [Release](../../../docs/reference/operations/release.md) |
| Backup / restore / recovery | [Recovery](../../../docs/reference/operations/recovery.md) |
| Historical schema extraction | [History extraction](../../../docs/change/evidence/schema-history-extraction.md) |
| Object / relationship navigation | [Schema tree](schemas/README.md) |

`packages/integration-supabase/src/migrations/` 不參與 current schema contract 或 remote deployment；不要把 migration history 當成 current schema authority。

## Capability routing / prepared layout

各能力目錄已預置具體開發與驗證規格，供後續功能直接沿既有 Owner 接線。Executable 表示有真實 consumer 後實作、測試及發布；不預建空 handler、`.gitkeep` 或第二套設定。架構規格已建立不代表 capability 已部署或通過 runtime 驗收。

```text
supabase/
├── AGENTS.md       # Local ownership / security / change rules
├── README.md       # Capability routing / navigation
├── config.toml     # Native CLI configuration / Bucket desired state
├── schemas/        # Current application SQL；本專案已需要
├── functions/      # Edge entrypoint、依賴、安全與發布規格
├── storage/        # Upload / Finalize / recovery 整合規格
├── auth/           # Provider proof / identity flow 驗證規格
├── realtime/       # Channel、可見性、撤權與補讀規格
├── cron/           # Job、重播、重疊執行與補跑規格
├── queues/         # Message、lease、retry / dead-letter 規格
├── vector/         # Provenance、版本、隔離與重建規格
├── webhooks/       # Inbound / outbound、signature 與冪等規格
└── tests/          # 跨能力 scenario、runner / CI 接線規格
```

除 CLI 原生路徑外，這些是 repository 資產分類，不會被 Supabase 自動載入或發布。產品程式呼叫既有 Owner 的 public contract；不從資產目錄匯入 business service。

### 各能力開發規格

- [Edge Functions](functions/README.md)：入口、runtime boundary、secrets 與發布接線。
- [Storage](storage/README.md)：私有物件存取、Upload Intent、Finalize 與清理。
- [Auth](auth/README.md)：LINE／外部 provider proof 與 identity lifecycle 驗證。
- [Realtime](realtime/README.md)：Broadcast、Presence、Postgres Changes 與補讀。
- [Cron](cron/README.md)：排程時區、occurrence identity、重疊與失敗恢復。
- [Queues](queues/README.md)：claim／lease、ack、retry 與 dead-letter。
- [Vector](vector/README.md)：embedding provenance、search isolation 與品質驗收。
- [Webhooks](webhooks/README.md)：來源驗證、durable handoff 與外部結果恢復。
- [Tests](tests/README.md)：各能力驗收案例、環境與 runner 接線要求。

| 路徑 | 後續實作資產的加入條件與責任邊界 | Canonical authority |
| --- | --- | --- |
| `schemas/` | 真實 persisted relation；DDL、index、application grants/RLS 跟隨 relation owner，不按 capability 複製 SQL | [Schema tree](schemas/README.md) |
| `functions/` | 已證明需要 Edge runtime 的實際 endpoint；entrypoint 只作 adapter，不複製 Next.js／Owner use case。建立前補齊依賴、測試、secrets 與獨立發布／readback contract | [Platform capability activation](../../../docs/reference/platform/supabase.md#free-plan-capability-ownership-and-activation) |
| `storage/` | 有可重現的 upload/download/rollback 驗證資產時建立；Bucket desired state 仍只在 `config.toml`，File lifecycle 由 File 擁有 | [File](../../../docs/owners/file.md) |
| `auth/` | 有 provider proof、callback、失效／重播測試資產時建立；不取代 Account-owned User identity mapping 與 business authorization | [Account](../../../docs/owners/account.md) |
| `realtime/` | 有真實 private subscription consumer，並定義 scope、撤權、斷線補讀與事件可見性後加入驗證資產 | [Platform capability activation](../../../docs/reference/platform/supabase.md#free-plan-capability-ownership-and-activation) |
| `cron/` | 既有 scheduler 需要 diagnostics／fixtures 時建立；排程定義沿用既有 owner 與部署入口，不增加第二個 scheduler | [Platform capability activation](../../../docs/reference/platform/supabase.md#free-plan-capability-ownership-and-activation) |
| `queues/` | 真實 durable consumer 需要 claim、lease、retry、dead-letter／recovery 驗證時建立 | [Platform capability activation](../../../docs/reference/platform/supabase.md#free-plan-capability-ownership-and-activation) |
| `vector/` | 已確定 embedding owner、來源、版本、重建及資料隔離契約，再加入檢索驗證資產；實際 application SQL 仍在 `schemas/` | [Platform capability activation](../../../docs/reference/platform/supabase.md#free-plan-capability-ownership-and-activation) |
| `webhooks/` | 真實 provider webhook 需要 signature、duplicate、順序與重試驗證資產時建立；接收／處理程式留在實際 runtime 與 owner | [Owner routing](../../../docs/owners/README.md) |
| `tests/` | 真實跨 Supabase capability 整合情境無法由既有 owner tests 表達時建立；先明定 runner、fixture 清理與 CI 接線，不搬移現有測試 | [Validation evidence](../../../docs/rules/validation-evidence.md) |

### Free 開發起點

先使用已存在的 PostgreSQL、必要 Auth proof 與 File private Bucket contract。其他能力依上表逐項啟用；Free 可用不代表需要啟用，也不會因目錄預置而取得授權。

Free 容量、休眠、上傳與備份限制集中查 [Platform Free plan](../../../docs/reference/platform/supabase.md#free-plan-capability-ownership-and-activation) 及 [官方價格與配額](https://supabase.com/pricing)。發布前重新確認目標 Organization／project 的實際方案與用量；local `config.toml` 不宣告 hosted plan，也不代表所有 remote settings 已同步。

新增 capability 的最小交付：實際 consumer／Owner → public contract 與安全／失敗條件 → 必要資產及 runner → local 驗證 → 對應 Release 與 provider readback。單一 Owner 測試仍留在其 package；共用目錄不取得業務決策權。

## Common commands

```sh
pnpm schema:check
pnpm --filter @line_bot_v1/platform schema:check
pnpm exec supabase status
```

- `schema:check`：驗 declarative schemas 與核心 database boundary。
- `supabase status`：讀取目前 Docker stack 狀態。
- Remote application-schema mutation 使用受信任 Supabase MCP 或官方 non-pooling operator connection，且只能收斂已核准的 current `main` canonical schemas；本 package 沒有 `schema:remote` 或 `storage:remote` operator command，也不使用 migration history。

## Change routing

一般 schema change：

```text
edit packages/integration-supabase/src/schemas/*.sql
→ pnpm schema:check
→ pnpm lint && pnpm typecheck && pnpm test
→ validated main
→ current-main Supabase operator reconciliation + readback
```

若 change 還需要不可由 schema 決定的 business metadata 或 data transform，另外依 owner 建立 data-cutover procedure；不要把 backfill truth 藏進 declarative DDL。

Remote mutation、publication 與 recovery 的完整規則只在上表 canonical owner 維護。
