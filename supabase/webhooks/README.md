# Webhooks 開發規格

本目錄預置 webhook 整合設計；尚未新增 trigger、HTTP endpoint 或 provider subscription。外部事件仍由 [實際 Owner](../../docs/owners/README.md) 翻譯成 business command。

| 方向 | Transport | 責任 |
| --- | --- | --- |
| Inbound | provider → 既有 Web route 或必要 Edge endpoint | 驗證來源、durable acceptance、去重、Owner dispatch |
| Outbound | committed Owner event → 外部 endpoint | durable delivery identity、簽章、重試與 readback |
| Database webhook | PostgreSQL change → HTTP | 技術變更通知，不直接代表完整 business event |

## Inbound

在 body size／deadline 範圍內保留簽章所需 raw bytes，依 provider 官方協定驗證 signature、timestamp 與 secret rotation。只相信驗證後的 provider subject；payload 的使用者 ID 或 scope 不直接取得產品權限。

以 provider event identity 去重並持久保存必要接收結果，再依協定回覆。ACK 表示接受程度由 endpoint 契約明定；若 ACK 前沒有 durable handoff，crash 可能永久遺失事件。亂序依版本或 provider query 收斂，不以最後到達覆蓋正式狀態。

## Outbound / recovery

需要可靠通知時，Owner state 與 durable outbox 在同一 transaction 成立，worker 執行外部 I/O。不要在 business transaction 中等待 HTTP。傳送只包含必要資料，外部 endpoint 設定需有授權與目的地限制，避免任意 URL 成為 server-side request 能力。

對重試使用穩定 delivery identity；2xx、永久拒絕、限流、暫時失敗與 timeout 分開處理。pg_net／trigger 發出 HTTP 不等於接收方業務已完成；需要完成保證時增加接收方契約與 readback。

驗收：偽造／過期 signature、raw body 改動、secret rotation、duplicate、亂序、ACK 前後 crash、限流與未知外部結果。Worker 恢復見 [queues](../queues/README.md)，endpoint 接線見 [functions](../functions/README.md)。
