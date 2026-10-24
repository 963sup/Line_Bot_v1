# Observability

Runtime logs、errors、request／function latency、database pressure 與 usage 的 canonical 契約見 [Observability](../../docs/reference/operations/observability.md)。本目錄不新增 logger、SDK、Log Drain 或監控服務。

- 使用 exact deployment／Git SHA、必要 operation identity 與有界錯誤分類關聯證據。
- 不記錄 credential、原始私人 payload 或非必要個資；log 不取代 durable business receipt。
- 先建立 baseline，再判斷錯誤率、latency、timeout 與流量異常；未量測不宣稱 healthy。
- Log retention、可用查詢、alerts 與外部匯出受方案限制，查 [Hobby](https://vercel.com/docs/plans/hobby)，不預設付費監控權益可用。

後續驗收：錯誤可定位至版本與操作、redaction、保存期限、配額耗用及監控缺資料時的判讀。使用行為與瀏覽器效能見 [Analytics](../analytics/README.md)。
