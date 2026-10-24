# GitHub integration scripts

本目錄是 GitHub platform adapter 的 read-only evidence / release routing implementation。

| Script | 用途 |
| --- | --- |
| `api.mjs` | 共用 GitHub REST JSON readback 與 `owner/repo` target validation。 |
| `current-main.mjs` | `pnpm github:current-main --sha <sha>`：確認 exact SHA 仍是 GitHub `main`。 |
| `current-main.test.mjs` | 驗證 exact SHA/target/current-main failure semantics。 |
| `release-plan.mjs` | `pnpm github:release-plan --sha <sha>`：從成功 Release evidence 找 owner baseline，分類 Supabase/Web/Rich Menu/Scheduler affected source。 |
| `release-plan.test.mjs` | 驗證 source classification、baseline、affected build 與 release outputs。 |
| `rich-menu-ready.mjs` | `pnpm github:rich-menu-ready --sha <sha>`：必要時等待同一 Release 的 Web deployment 與 identifier activation exact-run 成功後才允許 Menu mutation（只讀）。 |
| `rich-menu-ready.test.mjs` | 驗證錯誤 run/SHA、pending、failed/skipped/cancelled、partial rerun 和 current-main 漂移皆 fail closed。 |
| `validation-result.mjs` | GitHub matrix aggregate gate，只接受 success；不載入套件或機密。 |
| `validation-result.test.mjs` | 驗證 failure/cancelled/skipped/缺值一律拒絕發布。 |

GitHub workflow 擁有 event、permissions、secrets、job routing；provider mutation 仍由 Supabase/Vercel/LINE operation owner 執行。
