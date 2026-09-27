# Presentation shared boundary

## GitHub Mobile 目標（後續實作）

- 分開全域 tab、resource subnav、list filter、detail/command state；active indicator 是顯示投影，不能以字串 prefix 將 User/Organization/Repository 混為同一 scope。
- 返回 intent 使用既有安全 route/view 契約；沒有合法歷史時回 owner collection，不保存任意 URL 或私人草稿。tab 位置記憶與 command recovery 是不同責任。
- FPT 的 connection/pageInfo 只供分頁語意參考；本地 after/next 契約照 owner 定義。loading/empty/denied/missing/unavailable/unimplemented/unknown 必須可區分，不能用空列表統一。
- 文案與 badge 由 feature 提供；共用 presentation 不推導「已完成」「已授權」或精確數量。

## 現行機制與 invariant

URL helpers 只擁有白名單 parsing/normalization：`entry-route`、`entry-destination`、`entry-navigation`、`view-route`；路徑清單以 [app](../../app/AGENTS.md) 的 local 契約核對，不建立自動掃描即授權的 route registry。

`attendance-operation` 目前同時服務 entry allowlist 與 Attendance 顯示；只識別明確 clock-in/clock-out，不決定可打卡、成功與否或狀態轉移。若收斂 owner，先處理 entry consumer，不能讓 shared 反向 import module。

FPT Node/locator 只能參考 identity 與關係；本層不建立通用 entity model。UI query/view state 與 backend cursor/input 是不同契約，不將 provider state 或私人 payload 傳入 URL。

- Shared presentation helpers may model navigation, access state and operation display; they do not decide business permission or success.
- Route/view state must distinguish loading, empty, forbidden, unavailable, not-implemented and unknown result.
- Stable IDs and selected scopes locate resources only; never serialize secrets, authorization decisions or durable version authority into presentation state.
