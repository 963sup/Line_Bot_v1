# Web shared 約束

責任見 [Module ownership](../../../../docs/020-architecture/030-module-boundaries.md)，資料生命週期見 [Data retention](../../../../docs/040-data/070-retention-and-lifecycle.md)，信任邊界見 [Access](../../../../docs/050-security/010-trust-boundaries.md)。

- 只收相同責任、契約與修改原因的跨功能機制或全站唯一責任；多處引用、純函式或小檔案不是充分理由。
- 不依賴 app、modules、application 或 agents；有業務 owner 就留在該 module。
- browser 只使用瀏覽器安全匯出；presentation 不讀環境／storage、不請求；server 不引用 browser，不混合 barrel。
- HTTP 機制只處理解析、大小限制與回應；不含業務錯誤、授權、store 或 composition。
- UI 可接 callback／children，但不決定業務流程；入口轉換不執行業務、不代替後端授權。
- 不保存跨請求私人狀態、複製 token 或新增業務快取；session 必須處理失效、換帳號及遲到回應。