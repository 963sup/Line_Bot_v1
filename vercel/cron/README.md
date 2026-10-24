# Cron Jobs

本目錄只預置 Vercel Cron 開發入口，不在 [vercel.json](../../apps/web/vercel.json) 新增 schedule 或 endpoint。既有 Attendance scheduler 沿用 [Release](../../docs/reference/operations/release.md) 與 [Supabase Cron](../../supabase/cron/README.md)，不重複觸發。

Hobby Cron 有每日執行頻率與較粗觸發精度限制，且消耗 Functions 資源；啟用時依 [官方 Cron usage](https://vercel.com/docs/cron-jobs/usage-and-pricing) 重新確認，不將它當作準時或高頻 worker。

後續若有 consumer，先確定唯一 scheduler owner、technical credential、穩定 occurrence identity、重疊執行政策、timeout、漏跑補跑與 durable completion readback。排程憑證只允許觸發指定能力，不取代 Owner 授權。

驗收：缺少／錯誤 credential、重複或重疊觸發、漏跑恢復、執行失敗與未知結果；測試接線見 [Tests](../tests/README.md)。
