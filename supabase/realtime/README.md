# Realtime 開發規格

本目錄預先設計 Broadcast、Presence、Postgres Changes 的使用邊界；目前沒有因此新增 subscription、publication 或 channel policy。啟用狀態以 [Platform](../../docs/reference/platform/supabase.md#free-plan-capability-ownership-and-activation) 與真實 consumer 為準。

| 能力 | 適合承載 | 不能作為權威 |
| --- | --- | --- |
| Broadcast | 已授權範圍的變更通知、重新查詢提示 | 正式狀態與 mutation approval |
| Presence | 暫時在線／協作提示 | Member qualification 或持久業務事實 |
| Postgres Changes | 經資料可見性評估的資料變更訂閱 | private business table 的直接 browser access |

## Subscription contract

實作時由資料 Owner 指定 scope、event visibility、最小 payload 與可靠補讀方式。Client 的 channel name 不授權；現有 LINE proof 不直接冒充 Supabase Realtime JWT。使用 private channel 前，先定義可被平台驗證的 credential 與撤權策略。

通知只在 authoritative transaction commit 後發布。接收端容忍 duplicate、遺漏與亂序，以 Owner query 重新取得事實；需要可靠補讀時必須有 durable cursor／version 或完整 snapshot，不能依賴 WebSocket 連線保證。

## 驗收

- 未授權訂閱、猜測其他 scope channel 與跨租戶 payload 不洩漏資料。
- 撤權、credential 過期與 reconnect 後重新驗證可見範圍。
- 重複／亂序通知、斷線後補讀得到與 Owner query 一致的狀態。
- 設定同時連線、消息量與 payload budget；高頻更新先合併通知，再依實測決定是否啟用。

相關 SQL 仍由 [schemas](../schemas/README.md) 與對應 Owner 管理；驗證接線見 [tests](../tests/README.md)。
