# Change lifecycle scripts

本目錄只處理 repository change 的 deterministic local operations；不擁有產品語意、不自動 merge、不執行 remote provider mutation。

| Script | 用途 |
| --- | --- |
| `state.mjs` | 讀取 branch、HEAD、upstream、origin/main、ahead/behind、dirty/conflict 與 changed-file state，提供 preflight policy。 |
| `state.test.mjs` | 驗證 ahead/behind 解析與 merge blocker 判斷。 |
| `status.mjs` | `pnpm change:status`：輸出目前 change branch 狀態，不修改 Git。 |
| `preflight.mjs` | `pnpm change:preflight`：確認 feature branch、upstream、origin/main 對齊、clean tree 與無 conflict。 |
| `finalize.mjs` | `pnpm change:finalize`：preflight 後執行 canonical `pnpm validate`，再確認 branch state。 |
| `patch-apply.mjs` | `pnpm patch:apply <plan.json> [--apply]`：以 SHA-256 + exact-before preflight 執行 declarative replacement。 |
| `patch-apply.test.mjs` | 驗證 patch path/hash/precondition/dry-run/apply/TOCTOU guards。 |

`pnpm change:impact "<intent>"` 直接委派 `pnpm semantic plan "<intent>"`。Merge preflight 前先明確執行 `git fetch origin main`；commands 不偷偷更新 refs。
