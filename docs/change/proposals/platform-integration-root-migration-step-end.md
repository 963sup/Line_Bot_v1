# Platform integration root migration — Step End：唯一完成定義與交接

Status: PROPOSED ACCEPTANCE CONTRACT；此處是**未來 cutover 的驗收條件**，非目前完成聲明。
前置：[Step 8 — 驗收與刪除](./platform-integration-root-migration-step-8.md)；總入口：[Step Start](./platform-integration-root-migration-step-start.md)。

## Done = 下列全部 true
| 確認項 | 必要證據 |
| --- | --- |
| **唯一平台模組** | `packages/integration-vercel`、`packages/integration-supabase` 各有明確 package exports、依賴圖、owner contracts、測試 |
| **根部完全退場** | tracked root `vercel/` 和 root `supabase/` **不存在**；原每個 tracked file 已搬移或依 consumer 證據移除 |
| **原生工具位置合法** | `packages/integration-supabase/supabase/config.toml` 可由 CLI `--workdir packages/integration-supabase` 探索；schemaPaths、新路徑/Storage desired state 一致 |
| **權威 SQL 只剩一套** | 原 109 executable SQL schema 的 source identity、ordered hashes、DDL/RLS/grants 語意不變；`architecture/data-topology.json` 精確對新 canonical SQL 檔映射 |
| **零 stale active refs** | application、scripts、CI、package metadata、architecture、current docs、test guards 無舊根部 provider 路徑 import／execute；無 symlink、shadow copy、fallback |
| **行為等價** | Web/LINE、Assistant、Expense、File、Intelligence Intake → Contract DRAFT、Storage、SQL 語意與安全負例都通過；AI 仍是 untrusted extraction |
| **發布安全** | `pnpm` frozen lockfile、全部 required GitHub CI、Vercel exact SHA Preview、Supabase local/read-only checks 綠燈；正式 main Release gate 不變 |
| **來源可審核** | 每步有 changed paths、consumer matrix、before/after proof、未決風險、完成時 SHA 與 owner 核對；沒有虛構遠端或 paid provider 驗證 |

## 綠燈後治理
- 提案採用：將 durable decisions 更新到 `docs/owners/*`、`docs/reference/platform/*`、`architecture/*`、原生 config、source/tests；只保留有未來取捨價值的 ADR，避免 RFC 和 current truth 平行維護。
- 歷史：以 Git commits/PR/CI job URL 記錄，不在 `docs/change/proposals` 建另一本 release ledger。
- #413 與 #412 的堆疊依賴必須保留：**#414 的 base 為 #413 head branch**，待上游變更合併或重定位，先重新檢查 base/head 與全量 CI。不可因本 proposal 調整其他 PR 的 Merge protection。
- **未通過任何一項 = Not Done**；可保留提案與已安全完成的獨立重構，但不能宣稱雙根目錄已完整遷移、也不能部署 production。
