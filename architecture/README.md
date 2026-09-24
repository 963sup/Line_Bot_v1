# Architecture

從產品意思與責任開始，沿外部證據、產品決策、實作與資料邊界查到可驗證的 consumer。目錄內 JSON 是各自範圍的 machine-readable authority；本頁只提供入口。

| 問題 | 唯一來源 | 查核入口 |
| --- | --- | --- |
| GitHub FPT 實際提供什麼、哪些分類適用？ | [Semantic benchmark](semantic-benchmark.json) | `pnpm architecture` |
| 產品採用什麼語意、誰負責、能力與 locator 是什麼狀態？ | [Semantic model](semantic-model.json) | `pnpm semantic check`、`pnpm semantic explain repository` |
| 哪個 module 實作 owner、允許依賴誰？ | [Implementation topology](implementation-topology.json) | `pnpm boundaries` |
| 哪個 owner 擁有資料、誰只參照或投影？ | [Data topology](data-topology.json) | `pnpm architecture` |
| 實際 SQL、constraint、RLS 是什麼？ | [Declarative schemas](../supabase/schemas/README.md) | `pnpm schema:check` |
| 實際 runtime 與公開 contract 是什麼？ | [Owner packages](../packages/AGENTS.md)、[Web runtime](../docs/020-architecture/050-runtime-architecture.md) | Owner source、manifest、consumer 與 tests |
| 有哪些已執行的驗收證據？ | [Acceptance evidence](../docs/090-governance/060-acceptance/010-acceptance-evidence.md) | 具日期、環境與範圍的紀錄 |

可讀投影由 `pnpm semantic view docs` 產生；變更影響用 `pnpm semantic plan "<intent>"` 與 `pnpm semantic context "<intent>"` 查詢，不手工保存第二套 owner／能力清單。

外部分類、產品 owner、module、data boundary、頁面路由是不同維度。FPT 的檔案分片不直接決定 package；benchmark 存在不代表產品採用，資料或 module 存在也不代表 runtime、部署與實機驗收已完成。

結構與命令契約見 [Repository architecture](../docs/020-architecture/010-repository-architecture.md)；官方來源與 pipeline 對照見 [FPT benchmark](../docs/000-core/080-github-graphql-fpt-benchmark.md)。
