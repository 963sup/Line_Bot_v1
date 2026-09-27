# Web assistant module

## GitHub Mobile 目標（後續實作）

- Assistant 在既有 LINE 對話呈現清楚的草稿、確認、執行結果與失敗；採資源上下文與短摘要，不把生成文字當正式 Issue/Expense 狀態。
- 上游 Mobile 已有 Copilot tab，但本產品沒有對等 Web 聊天/session contract；不為布局新增第五個 AI tab、`/assistant` 空頁或假對話。
- 後續若有正式 Assistant UI 需求，先定義可信 tool/use case、draft-to-command 邊界及 URL，再調整本檔。

## 現行 surface 與 invariant

Current entry：`/api/line/webhook` 由 app composition 接到 event-router／answer／command presentation；沒有獨立 `/assistant` page 或 API。FPT 只可提供被操作資源的語意，不能把 Assistant 當 Repository/Issue writer。

Rich Menu 的 local 契約見 [rich-menu](rich-menu/AGENTS.md)。改產品 URL 時核對 menu URI/entry intent；本地 definition 更新與遠端發布分開，不因改 AGENTS 自動發布。

- Owns assistant presentation and draft interaction; Assistant output is untrusted input and never direct business authority.
- Issue draft, receipt or answer flows must hand off to the owning package for deterministic validation, authorization and persistence.
- Preserve provider unavailable, cooldown, cancellation and bounded-input/output semantics.
