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
| `check-semantic-architecture.mjs` | 驗證 product overlay 與 FPT/topology/data/command mapping。 |
| `check-semantic-architecture.test.mjs` | 驗證 semantic ownership/relationship/capability/evidence contracts。 |
| `check-fpt-domain-truth.mjs` | 驗證 vendored GitHub FPT JSON file set、blob integrity 與 provenance。 |
| `check-fpt-domain-truth.test.mjs` | 驗證 exact FPT mirror、tamper detection 與 direct symbol/field resolution。 |
| `data-access-core.mjs` | 純函式 data-access policy engine。 |
| `data-topology-core.mjs` | 載入/解析 declarative SQL，編譯 relation-level data topology。 |
| `semantic-cli.mjs` | `pnpm semantic` 唯一 CLI namespace。 |
| `semantic-core.mjs` | 編譯 FPT domain truth、product overlay、implementation/data topology 與 indexes。 |
| `semantic-diff.mjs` | 比較兩版 product semantic model，分類 breaking semantic changes。 |
| `semantic-drift.mjs` | 比較兩版 FPT provenance，標示被本地 overlay 直接引用之 truth file drift。 |
| `semantic-feedback.mjs` | 將 runtime observation bundle 與 capability expectation 對照。 |
| `semantic-planning.mjs` | 將 change intent resolve 到 owner/concept/capability，建立 impact/boundary/context。 |
| `semantic-projection.mjs` | 產生 ownership/subdomain/context evidence/glossary/implementation projections 與 package SEMANTICS。 |
| `semantic-query.mjs` | 執行 owner/concept/path/contracts/consumers/invariants/evidence 查詢。 |

一般入口使用 `pnpm architecture`、`pnpm boundaries`、`pnpm semantic <verb>`；FPT references 只允許 exact `file` / `symbol` / optional `field`，不得在 overlay 再保存 category/adoption 摘要。修改前遵守同層 `AGENTS.md`。

子域分類使用 `pnpm semantic view subdomains`，context status 與證據使用 `pnpm semantic view contexts`。`plan` / `context` / `explain` 從相同 canonical model 取得相關分類與邊界證據；`pnpm semantic package-docs` 更新各 package 的 generated projection。

`resolve` / `plan` / `context` 共用 intent resolver：完整 Owner／Concept／Capability ID 優先，也可使用 `owner:<id>`、`concept:<id>`、`capability:<id>` 明確指定。一般文字只匹配完整名稱／字詞；`application`、`mapping` 不代表 App。輸出區分 `resolved`、`ambiguous`、`candidate`、`no-match`，每個命中附 term/source/reason；歧義與前綴候選不自動成為 primary owner。`currentOwners` 與 `targetOwners` 分開；明確查詢 `app` 仍回傳 selected-target，不代表啟用 runtime module。跨 Owner 的既有 review/security dependency 繼續展開，沒有匹配不能被解讀為沒有治理約束。
