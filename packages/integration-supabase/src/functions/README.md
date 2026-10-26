# Edge Functions 開發規格

本目錄預先定義 Edge runtime 的接線方式；目前未建立或發布 Edge endpoint。平台與發布權威見 [Supabase](../../../../docs/reference/platform/supabase.md) 與 [Release](../../../../docs/reference/operations/release.md)。

## Runtime boundary

每個實際 endpoint 使用 `<function-name>/index.ts` 作 transport adapter：解析有界輸入、驗證 credential、轉為 Owner command、映射結果。業務判斷由 [既有 Owner](../../../../docs/owners/README.md) 擁有。選擇 Edge 前先比較既有 Next.js／worker 入口；現有 Node.js package 不假設可直接在 Edge 執行。

| 預留入口 | 實作時的責任 | 必須先確定 |
| --- | --- | --- |
| external-command | 外部 command transport | 真實 consumer、actor proof、scope、request identity、Owner public contract |
| webhook-receiver | provider event 接收 adapter | [Webhook 驗證與 durable acceptance](../webhooks/README.md) |
| queue-worker | 有界 queue consumer adapter | [claim、lease、ack 與 recovery](../queues/README.md) |

上述名稱是接線候選，尚未成為可呼叫路由。`_shared/` 僅在出現兩個以上真正共用且語意相同的技術實作時建立；不預建 auth、env 或 response wrapper。

## 失敗與發布

- JWT、webhook signature 與 scheduler credential 分別驗證；持有 provider key 不授予 business permission。
- 設定 request/body 上限、deadline 與外部呼叫 timeout。輸入錯誤、未授權、衝突、暫時失敗及未知外部結果分開回傳。
- 外部副作用使用 durable request identity；timeout 先 readback，再決定重試。
- secrets 僅由受控 runtime 注入；日誌記錄必要 correlation 與錯誤分類，不記錄 token 或 payload。
- 新 endpoint 必須另接 dependency pin、local runner、CI、current-main Release、exact project readback；現有 schema Release 不會發布本目錄。

驗收：缺少／過期 credential、錯誤 scope、重播、超大輸入、timeout、未知結果恢復，以及發布後以預期身分呼叫真實 endpoint。
