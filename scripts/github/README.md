# GitHub integration scripts

本目錄是 GitHub platform adapter 的 read-only evidence / release routing implementation。

| Script | 用途 |
| --- | --- |
| `api.mjs` | 共用 GitHub REST JSON readback 與 `owner/repo` target validation。 |
| `current-main.mjs` | `pnpm github:current-main --sha <sha>`：確認 exact SHA 仍是 GitHub `main`。 |
| `current-main.test.mjs` | 驗證 exact SHA/target/current-main failure semantics。 |
| `release-plan.mjs` | `pnpm github:release-plan --sha <sha>`：從成功 Release evidence 找 owner baseline，分類 Supabase/Web/Rich Menu/Scheduler affected source。 |
| `release-plan.test.mjs` | 驗證 source classification、baseline、affected build 與 release outputs。 |

GitHub workflow 擁有 event、permissions、secrets、job routing；provider mutation 仍由 Supabase/Vercel/LINE operation owner 執行。
