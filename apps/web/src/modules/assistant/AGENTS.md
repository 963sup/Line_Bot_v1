# Web assistant module

## Current Web surface

- Bottom Navigation 的 AI 目的地是 `/home/assistant`；選用既有 `/home` namespace 避免建立會與 public `/{login}` 衝突的新 top-level locator。
- `/home/assistant` 提供 Ask / Generate / Review 三個 one-shot Web modes。Ask 使用既有 answer use case；Generate 只產生 Issue draft；Review 只產生文字建議。三者都不建立 durable chat/session，也不直接形成 formal business write。
- `/api/assistant` 只負責 HTTP transport、LINE identity 與 current User qualification，再委派既有 Assistant application/provider capability；不得把 client-selected mode 當 business authorization。
- Assistant output 仍是 untrusted draft/advice。Issue、Expense、Repository 或其他 owner 的正式 mutation 必須經各自 deterministic validation、authorization、version/replay 與 persistence contract。
- Web surface 保留 input/output bound、cooldown、provider unavailable、換帳號清除與遲到回應隔離；不得因 AI tab 存在宣稱 Copilot session、tool registry、自主 writer 或 durable agent memory 已完成。

## Existing LINE surface

`/api/line/webhook` 仍由 app composition 接到 event-router／answer／command presentation。1:1 與 group/room activation、Rich Menu 及 explicit command 依既有 LINE contract；Web AI page 不改 webhook semantics。

Rich Menu 的 local 契約見 [rich-menu](rich-menu/AGENTS.md)。改產品 URL 時核對 menu URI/entry intent；本地 definition 更新與遠端發布分開，不因改 AGENTS 自動發布。

- Owns assistant presentation and draft interaction; Assistant output is untrusted input and never direct business authority.
- Issue draft, receipt or answer flows must hand off to the owning package for deterministic validation, authorization and persistence.
- Preserve provider unavailable, cooldown, cancellation and bounded-input/output semantics.
