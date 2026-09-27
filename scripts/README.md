# 專案腳本

- 腳本按用途歸類；測試與被測腳本放在同一目錄。
- CLI 只負責操作流程，不承擔產品領域規則。
- 命令從專案根目錄執行；一般入口使用 `package.json` 的 pnpm scripts，完整驗證使用 `pnpm validate`。
- 外部探測、資料庫維運與發布須另行執行，不納入本地驗證。
- `probe:*` 命令都是明確 live probe，package script 已內建 `--live`；直接執行 `node scripts/probes/*.mjs` 時才需手動帶 `--live`。它們可能呼叫 Gemini、LINE、Redis 或 provider validation API，不屬於 `check`／`validate` 證據。
- 操作契約由對應 canonical doc 維護；本索引只標示責任與入口，不在 script 目錄複製第二份產品規格。
- 變更腳本時，同步修正受影響的命令、測試、驗證流程、部署清單與文件引用。

| 目錄 | 責任 |
| --- | --- |
| `runtime/` | 啟動與環境載入 |
| `tooling/` | 驗證 orchestration、工具與代理設定檢查 |
| `architecture/` | semantic compiler/type-policy/query/impact/plan/agent-context/diff/drift/runtime-feedback/view、implementation topology 與依賴邊界檢查 |
| `changes/` | 批次變更計畫 |
| `docs/` | 文件與連結檢查 |
| `probes/` | 外部服務與功能探測 |
| `supabase/` | Supabase schema/local/remote reconciliation 與 verification；資料結構 owner 見 [root supabase](../supabase/README.md) |
| `vercel/` | Vercel production deployment adapter；exact target/SHA、mutation、poll/readback 與 unknown-result handling |
| [browser/](browser/README.md) | 僅對本機 Web 的可重跑瀏覽器探測 |
| [`line/rich-menu/`](line/rich-menu) | LINE Rich Menu execution adapter（env／argv／輸出）；definition、desired state 與 publication transaction 由 Web Rich Menu module 擁有；契約見 [Rich Menu integration](../docs/030-platform/README.md) |
| [attendance/](attendance/README.md) | Attendance maintenance worker 與排程操作 |

正式 Rich Menu 圖片位於 `assets/line/rich-menu/`，不與 script 混放。`tooling/validate.mjs` 是 `pnpm check`／`pnpm validate` 的實作入口。
