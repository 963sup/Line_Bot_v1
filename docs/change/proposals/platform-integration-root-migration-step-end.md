# Platform integration root migration — Step End：唯一完成定義與交接

Status: ACCEPTANCE CONTRACT；PR #412 已完成 source/path cutover，但此文件仍保留尚未完成的 runtime、provider 與 release evidence gate，不能視為全部完成聲明。
前置：[Step 8 — 驗收與刪除](./platform-integration-root-migration-step-8.md)；總入口：[Step Start](./platform-integration-root-migration-step-start.md)。

## Done = 下列全部 true
| 確認項 | 必要證據 |
| --- | --- |
| **唯一平台模組** | `packages/integration-vercel`、`packages/integration-supabase` 各有明確 package exports、依賴圖、owner contracts、測試 |
| **根部完全退場** | tracked root `vercel/` 和 root `supabase/` **不存在**；原每個 tracked file 已搬移或依 consumer 證據移除 |
| **Schema 相依全部切換** | 原 root `supabase/config.toml`、109 份 `.sql`、Schema scope 文件與其他 Supabase 原生受追蹤檔已逐一處理；CLI workdir、schema loader、CI/release、`architecture/data-topology.json#schemaRoot/files[]` 均改為新的唯一檔案位置 |
| **原生工具位置合法** | `packages/integration-supabase/src/config.toml` 可由 CLI `--workdir packages/integration-supabase/src` 探索；schemaPaths、新路徑/Storage desired state 一致 |
| **109 份根部 `.sql` 完整遷移** | 原 `supabase/schemas/` 全 109 份 executable SQL 必須逐檔（同檔名、同 bytes SHA-256、同順序）移入 `packages/integration-supabase/src/schemas/`；每個舊 `files[].path` 對應新唯一位置、DDL/RLS/grants 不變，零遺漏、零重複、零根部 `.sql`。若 base SQL 數量變更，按最新盤點全量驗收，不以 109 作硬上限。 |
| **零 stale active refs** | application、scripts、CI、package metadata、architecture、current docs、test guards 無舊根部 provider 路徑 import／execute；無 symlink、shadow copy、fallback |
| **行為等價** | Web/LINE、Assistant、Expense、File、Intelligence Intake → Contract DRAFT、Storage、SQL 語意與安全負例都通過；AI 仍是 untrusted extraction |
| **發布安全** | `pnpm` frozen lockfile、全部 required GitHub CI、Vercel exact SHA Preview、Supabase local/read-only checks 綠燈；正式 main Release gate 不變 |
| **來源可審核** | 每步有 changed paths、consumer matrix、before/after proof、未決風險、完成時 SHA 與 owner 核對；沒有虛構遠端或 paid provider 驗證 |

## 綠燈後治理
- 提案採用：將 durable decisions 更新到 `docs/owners/*`、`docs/reference/platform/*`、`architecture/*`、原生 config、source/tests；只保留有未來取捨價值的 ADR，避免 RFC 和 current truth 平行維護。
- 歷史：以 Git commits/PR/CI job URL 記錄，不在 `docs/change/proposals` 建另一本 release ledger。
- #413 與 #412 的堆疊依賴必須保留：**#414 的 base 為 #413 head branch**，待上游變更合併或重定位，先重新檢查 base/head 與全量 CI。不可因本 proposal 調整其他 PR 的 Merge protection。
- **未通過任何一項 = Not Done**；可保留提案與已安全完成的獨立重構，但不能宣稱雙根目錄已完整遷移、也不能部署 production。
