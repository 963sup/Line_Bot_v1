# Presentation shared boundary

## 現行機制與 invariant

URL helpers 只擁有白名單 parsing/normalization：`entry-route`、`entry-destination`、`entry-navigation`、`view-route`；路徑清單以 [app](../../app/AGENTS.md) 的 local 契約核對，不建立自動掃描即授權的 route registry。

Shared presentation 不擁有任何 business capability vocabulary。Attendance operation validation 直接消費 `@line_bot_v1/attendance` public contract；不得在 shared 維護第二份 action / operation / label 清單。

FPT Node/locator 只能參考 identity 與關係；本層不建立通用 entity model。UI query/view state 與 backend cursor/input 是不同契約，不將 provider state 或私人 payload 傳入 URL。

- Shared presentation helpers may model navigation, access state and operation display; they do not decide business permission or success.
- Route/view state must distinguish loading, empty, forbidden, unavailable, not-implemented and unknown result.
- Stable IDs and selected scopes locate resources only; never serialize secrets, authorization decisions or durable version authority into presentation state.
