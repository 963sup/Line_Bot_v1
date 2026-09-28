# Architecture scripts

本目錄把 machine-readable architecture truth 編譯、查詢與驗證成可重現 evidence。產品 authority 仍位於 `architecture/*.json` 與實際 source/schema。

| Script | 用途 |
| --- | --- |
| `check-all.mjs` | `pnpm architecture` 聚合入口，執行所有 architecture/data/semantic checks。 |
| `check-architecture.mjs` | 驗證 repository source/package architecture constraints。 |
| `check-architecture.test.mjs` | 驗證 architecture checker fixtures。 |
| `check-convergence-guardrails.test.mjs` | 防止已移除的歷史 architecture/compatibility 模式重新出現。 |
| `check-data-access.mjs` | 將 runtime PostgreSQL adapter SQL access 與 canonical data topology 對照。 |
| `check-data-access.test.mjs` | 驗證跨 owner read/write data-access guard。 |
| `check-data-topology.mjs` | 驗證 data topology 與 declarative schema current state 一致。 |
| `check-data-topology.test.mjs` | 驗證 schema file/relation/owner topology。 |
| `check-implementation-topology.mjs` | 驗證 module path/kind/semantic owner/allowed dependencies。 |
| `check-semantic-architecture.mjs` | 驗證 product semantic model 與 benchmark/topology/data/command mapping。 |
| `check-semantic-architecture.test.mjs` | 驗證 semantic ownership/relationship/capability/evidence contracts。 |
| `check-semantic-benchmark.mjs` | 驗證 pinned external GitHub-like benchmark provenance/graph contract。 |
| `check-semantic-benchmark.test.mjs` | 驗證 benchmark projection/reference guardrails。 |
| `data-access-core.mjs` | 純函式 data-access policy engine。 |
| `data-topology-core.mjs` | 載入/解析 declarative SQL，編譯 relation-level data topology。 |
| `semantic-cli.mjs` | `pnpm semantic` 唯一 CLI namespace。 |
| `semantic-core.mjs` | 編譯 semantic model、benchmark、implementation/data topology 與 indexes。 |
| `semantic-diff.mjs` | 比較兩版 product semantic model，分類 breaking semantic changes。 |
| `semantic-drift.mjs` | 比較兩版 external benchmark，指出 adopted benchmark drift。 |
| `semantic-feedback.mjs` | 將 runtime observation bundle 與 capability expectation 對照。 |
| `semantic-planning.mjs` | 將 change intent resolve 到 owner/concept，建立 impact/boundary/context。 |
| `semantic-projection.mjs` | 產生 ownership/glossary/context/implementation projections。 |
| `semantic-query.mjs` | 執行 owner/concept/path/contracts/consumers/invariants/evidence 查詢。 |

一般入口使用 `pnpm architecture`、`pnpm boundaries`、`pnpm semantic <verb>`；修改前遵守同層 `AGENTS.md`。
