# Observability

## Scope

Observability 用來判斷指定版本在目標環境是否正常運作，不把 log/metric 本身當成 business source of truth。

## Release signals

發布與切換期間至少觀察與本次變更直接相關的訊號，例如：

- login / identity mapping failures
- authorization rejection / unexpected denial
- transaction / version conflicts
- replay / duplicate request behavior
- database connection and pool pressure
- external result unknown / retry exhaustion
- worker / outbox lease and delivery result
- route / loading / runtime errors
- AI usage and failure when the changed flow actually uses AI

門檻必須先有可比較 baseline；沒有 baseline 時記錄 unknown，不用任意數字宣稱 healthy。

## Sensitive data

Log、metric、trace 不保存 token、secret、完整 external subject、精確定位、完整支出內容、原始聊天或其他非必要私人正文。需要追蹤時使用穩定但最小的 operation / record identifiers 與受控 result category。

## Evidence boundary

Monitoring dashboard、provider status 與 runtime log 只證明其觀察範圍。真正 business completion 仍以 durable record / receipt 為準；平台接受訊息也不等於終端使用者已看到。

具日期的量測與放行結果歸 `090-governance/060-acceptance/`。
