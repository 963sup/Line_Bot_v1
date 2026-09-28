# Vercel deployment scripts

本目錄是 Vercel production deployment adapter。只在 explicit live authorization、exact SHA/target 與 GitHub Release evidence 成立時執行 mutation，並在 mutation 後 poll/readback。

| Script | 用途 |
| --- | --- |
| `deploy-production.mjs` | `pnpm vercel:deploy:production --live --sha <sha>`：確認固定 Vercel project/team、current main/Release authorization，建立 production deployment 並驗證 READY/alias readback。 |
| `deploy-production.test.mjs` | 驗證 exact target/SHA、authorization、provider failure classification、poll/readback 與 production alias contract。 |

此 command 是 remote mutation，不屬於 local `check` / `validate`；成功 deployment 也不替代 application/browser/device evidence。
