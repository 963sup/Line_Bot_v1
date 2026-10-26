# Web Analytics / Speed Insights

本目錄提供流量分析與瀏覽器實測效能的開發入口。Web 已安裝 Analytics／Speed Insights SDK，由 [VercelObservability](../../../../apps/web/src/shared/browser/vercel-observability.tsx) 在 [Root layout](../../../../apps/web/src/app/layout.tsx) 全域掛載；目標 project 是否實際收集、用量與資料可見性仍需 provider readback，權益以 [Hobby](https://vercel.com/docs/plans/hobby) 為準。

- Web Analytics 回答流量／行為問題；Speed Insights 回答實際瀏覽器效能問題，兩者不作 business completion 或授權證據。
- 擴充前指定實際問題、event schema、sampling、隱私與保留政策；沿用 [telemetry sanitizer](../../../../apps/web/src/shared/browser/telemetry.ts) 與 [既有 tests](../../../../apps/web/test/telemetry.test.ts)，不送 token、provider subject、私人正文或可洩漏資料的 URL／query。
- SDK 與 client instrumentation 留在既有 Web composition，不從此文件目錄匯入產品程式。

後續驗收：事件去重、資料最小化、版本與環境區分、採樣及用量；LINE 裝置體驗仍需獨立實測。錯誤追蹤見 [Observability](../observability/README.md)。
