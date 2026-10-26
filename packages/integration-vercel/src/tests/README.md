# Vercel verification entrypoints

本目錄先放驗證導航與未來 smoke scenarios，不建立 test runner、fixture 或 CI job。測試與證據邊界沿 [Validation evidence](../../../../docs/rules/validation-evidence.md)，發布沿 [Release](../../../../docs/reference/operations/release.md)。

| 驗證範圍 | 現有入口／後續場景 |
| --- | --- |
| README / links | `pnpm docs:check` |
| Repository / build | exact-head `pnpm change:finalize` 執行完整 `pnpm validate` |
| Local Web | `pnpm test:browser`；只證明其 synthetic／local 範圍 |
| Deployment operator | 既有 `scripts/providers/vercel/deploy-production.test.mjs`，由 canonical validation routing 執行 |
| Provider deployment | exact project、target、Git SHA、READY、alias readback |
| Routing / security | callback、redirect、private request、provider protection 與真實 credential 邊界 |
| Cache / runtime | scope isolation、撤權、timeout、cold start 與資料庫連線壓力 |
| LINE / external providers | 真實裝置、callback 與外部結果；與 build／READY 分開驗收 |

未來測試加入既有 Owner／browser runner；只有需要跨能力獨立 runner 時才在此增加程式，並同步 pinned dependency、fixture 清理、環境隔離與 CI 接線。Production smoke 需 exact target 與已授權資料處置，不用 client／log 保存 secrets。
