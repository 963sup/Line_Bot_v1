# Queues 開發規格

本目錄預置 pgmq 整合設計；尚未建立 queue 或 consumer。先檢查既有 Owner 的 outbox、worker 與 request lifecycle；pgmq 只在確有 durable delivery 缺口時接入。資料與 Release 權威見 [Supabase](../../docs/reference/platform/supabase.md)。

## Message / consumer contract

每種 message 由實際業務 Owner 定義版本、message identity、command request identity、scope reference、來源版本與最小 payload。訊息中的 actor/scope 只是輸入，worker 執行時重新驗證當下授權或明確的受託處理契約。

`pending → claimed → completed` 是處理流程的設計語彙，不是新增的業務狀態表。Claim 必須有 bounded lease／visibility 與 worker identity；過期後可能重新投遞，consumer 不能假設外部副作用 exactly-once。

1. 有界 claim，記錄 attempt 與 lease。
2. 以穩定 request identity 呼叫 Owner command。
3. Transaction 成功後才 ack；crash 後重投由 Owner replay contract 收斂。
4. 外部 unknown outcome 先 readback，不直接重送。
5. 暫時失敗依有上限的 backoff 與 jitter 重試；永久失敗進入可診斷的隔離處理。

## Retry / dead-letter

實作時必須具體設定最大 attempts、最大 age、batch、lease、timeout 與 payload retention。Dead-letter 由 Owner／operator 授權後 replay，沿用原 command identity；不得藉換 identity 重複正式副作用。保存錯誤分類與 correlation，不保存 secrets。

驗收：claim 競爭、lease 過期、業務 commit 後 ack 前 crash、poison message、重複 delivery、撤權、人工 replay 及積壓恢復。Queue lag、oldest age、retry 與 dead-letter 數分別觀察。Consumer runtime 的未來接線見 [functions](../functions/README.md)。
