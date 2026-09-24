# Web shared 約束

## Mobile support target

以 GitHub Mobile 的穩定導覽、內容層級及狀態連續性支援 app；具體視覺由 ui、瀏覽器生命週期由 browser、純導航意圖由 presentation 擁有。底部 tab 與 feature actions 由 caller 提供，不由 shared 掃描 FPT category 自動生成。

跨 tab「保留位置」只保留安全 UI intent；不可保留已失效的私人資料、token 或授權結果。樣式共用不意味 role/error/cache/retry 共用；語意不同就沿 owner contract。

## FPT 對照與 URL 邊界

FPT 的 meta/common 型別只提供共通契約的參考；本層不是 `schema-other` 收納區。User、Repository、Team、permission 或 business state machine 都有 owner，不能因跨頁使用就搬到 shared。

本層不擁有產品 URL；正式路徑依 [app](../app/AGENTS.md)。`entry-route`、`entry-destination`、`entry-navigation` 只解析白名單意圖與接續：新增／改名路由時，核對 LIFF state、login return、無效／重複參數、秘密清除與直接開啟，不能自動接受任意新路徑。

| 子範圍 | 可擁有的責任 |
| --- | --- |
| [browser](browser/AGENTS.md) | SDK/session/browser lifecycle 與安全接續 |
| [presentation](presentation/AGENTS.md) | 純顯示狀態、route/view intent 解析 |
| [server](server/AGENTS.md) | HTTP/runtime/environment 中立機制 |
| [observability](observability/AGENTS.md) | 技術錯誤、redaction 與 correlation |
| [ui](ui/AGENTS.md) | 視覺、可及性、children/callback composition |

Owner-specific helper 需要移動時，同時檢查既有 entry parser consumer；不能讓 shared 反向 import module 來修分類。除非 contract/修改原因確實相同，不擴建通用 auth/resource/state abstraction。

責任見 [Module ownership](../../../../docs/020-architecture/030-module-boundaries.md)，資料生命週期見 [Data retention](../../../../docs/040-data/070-retention-and-lifecycle.md)，信任邊界見 [Access](../../../../docs/050-security/010-trust-boundaries.md)。

- 只收相同責任、契約與修改原因的跨功能機制或全站唯一責任；多處引用、純函式或小檔案不是充分理由。
- 不依賴 app、modules、application 或 agents；有業務 owner 就留在該 module。
- browser 只使用瀏覽器安全匯出；presentation 不讀環境／storage、不請求；server 不引用 browser，不混合 barrel。
- HTTP 機制只處理解析、大小限制與回應；不含業務錯誤、授權、store 或 composition。
- UI 可接 callback／children，但不決定業務流程；入口轉換不執行業務、不代替後端授權。
- 不保存跨請求私人狀態、複製 token 或新增業務快取；session 必須處理失效、換帳號及遲到回應。
