# Web observability boundary

## GitHub Mobile 目標（後續實作）

- 後續改版量測導覽失敗、載入/錯誤狀態與安全的 route family，區分直接開啟、tab 切換與 provider 接續；不收集 raw locator/query/token 或私人 body 作 UX 分析。
- 技術事件只能證明所量測的行為；截圖、browser trace、API result、部署及真機各有證據範圍。Mobile 動畫順暢不代表 command 成功或 audit 完整。
- FPT audit-log 的業務紀錄仍由 owner 管理，不能以新增 telemetry 取代。

## 現行機制與 invariant

URL 只作允許的技術分類，沿現有 redaction policy；不記錄 token、完整 query/provider payload 或私人 resource body。新增 route 同時核對 telemetry allowlist，但不能藉此建立產品 URL owner。

FPT audit-log 與本層技術 telemetry 是不同責任；business audit/history 依 owning package，不能用 Sentry event 取代 durable operation evidence。

- Observability records technical failure and safe correlation data; it must not become business audit authority or contain secrets/full provider payloads.
- Preserve redaction, request identity and failure classification without changing owner behavior or leaking cross-scope data.
- Sentry/telemetry success is operational evidence only, not proof of business completion.
