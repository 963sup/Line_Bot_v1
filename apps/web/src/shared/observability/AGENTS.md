# Web observability boundary


## 現行機制與 invariant

URL 只作允許的技術分類，沿現有 redaction policy；不記錄 token、完整 query/provider payload 或私人 resource body。新增 route 同時核對 telemetry allowlist，但不能藉此建立產品 URL owner。

FPT audit-log 與本層技術 telemetry 是不同責任；business audit/history 依 owning package，不能用 Sentry event 取代 durable operation evidence。

- Observability records technical failure and safe correlation data; it must not become business audit authority or contain secrets/full provider payloads.
- Preserve redaction, request identity and failure classification without changing owner behavior or leaking cross-scope data.
- Sentry/telemetry success is operational evidence only, not proof of business completion.
