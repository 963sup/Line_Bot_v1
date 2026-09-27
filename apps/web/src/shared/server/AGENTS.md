# Server shared boundary

## GitHub Mobile 目標（後續實作）

- 手機頁面所需的 response/error 機制保持小且中立；不得為少一次 request 就在 shared 拼跨 owner dashboard SQL，或以 Mobile cache 降低每次讀寫授權。
- 列表/detail 的失敗分類、pagination input 與 result receipt 依 owner contract；本層不得把來源失敗轉成 200 空資料來配合 UI。
- 預載、重試或 shell reuse 必須保持 server-only graph 與秘密隔離；不因 GitHub FPT 有 meta/rateLimit 就新增未定義的本地 API。

## 現行機制與 invariant

沒有自己的產品 URL；被 [API](../../app/api/AGENTS.md) 與 Server Component 使用。HTTP 大小限制、response 機制、runtime environment 可共用；owner error/permission/transaction 應留在 module/package。

`line-mini-app` 只提供 runtime configuration，`request-identity-error` 不得成為 Account lifecycle 判斷；修改要核對 caller 與秘密隔離。FPT meta 不授權新增 universal service/authorization facade。

- Shared server helpers may transport, parse, identify runtime or map errors; they must not become a horizontal business owner.
- Request identity, trusted Principal and environment/runtime guards must remain explicit inputs to owner application contracts.
- Do not hide authorization, transaction, retry or error semantics inside generic wrappers; keep owner-specific decisions at the owner boundary.
