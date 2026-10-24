# Vector 開發規格

本目錄預置 pgvector／語意檢索設計；尚未建立 extension、embedding table、index 或外部模型呼叫。Embedding 是來源資料的衍生 projection，業務內容仍由 [來源 Owner](../../docs/owners/README.md) 擁有。

## Embedding contract

接入前由 consumer 指定 source identity／revision、scope、模型與版本、dimensions、chunking version、content digest、產生時間、刪除與重建策略。不得只有 vector 而失去 provenance。外部 embedding provider 的資料處理與費用單獨確認，Supabase Free 不代表外部模型免費。

來源更新後以 revision 判定 projection 是否過期；舊結果不能覆蓋新版本。來源刪除或撤權後依 policy 清除或隔離 projection；索引遺失應能重建，不影響 authoritative business fact。

## Search contract

先由 Owner 限定可見候選集合，再依選定 distance metric 排序；回傳前重驗可見性與來源版本。Top-k 後才過濾權限可能導致結果不足，也不得把未授權內容交給模型或 client。

以小資料集量測 exact search baseline，再根據資料量、recall、latency、記憶體與更新成本決定是否增加 ANN index。實際 SQL 仍放在 [schemas](../schemas/README.md)，不在本目錄建立第二套 DDL。

驗收：跨 scope 隔離、更新／刪除同步、模型版本不符、dimensions 不符、provider timeout／限流、重複生成、完整重建，以及有標準答案的 recall 與 latency。品質與成本要有實測結果，不能由 index 建立成功推論。
