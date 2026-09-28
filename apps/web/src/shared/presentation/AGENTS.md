# Presentation shared boundary


## 現行機制與 invariant

URL helpers 只擁有白名單 parsing/normalization：`entry-route`、`entry-destination`、`entry-navigation`、`view-route`；路徑清單以 [app](../../app/AGENTS.md) 的 local 契約核對，不建立自動掃描即授權的 route registry。

`attendance-operation` 目前同時服務 entry allowlist 與 Attendance 顯示；只識別明確 clock-in/clock-out，不決定可打卡、成功與否或狀態轉移。若收斂 owner，先處理 entry consumer，不能讓 shared 反向 import module。

FPT Node/locator 只能參考 identity 與關係；本層不建立通用 entity model。UI query/view state 與 backend cursor/input 是不同契約，不將 provider state 或私人 payload 傳入 URL。

- Shared presentation helpers may model navigation, access state and operation display; they do not decide business permission or success.
- Route/view state must distinguish loading, empty, forbidden, unavailable, not-implemented and unknown result.
- Stable IDs and selected scopes locate resources only; never serialize secrets, authorization decisions or durable version authority into presentation state.
