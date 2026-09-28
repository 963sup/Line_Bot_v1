# Server shared boundary


## 現行機制與 invariant

沒有自己的產品 URL；被 [API](../../app/api/AGENTS.md) 與 Server Component 使用。HTTP 大小限制、response 機制、runtime environment 可共用；owner error/permission/transaction 應留在 module/package。

`line-mini-app` 只提供 runtime configuration，`request-identity-error` 不得成為 Account lifecycle 判斷；修改要核對 caller 與秘密隔離。FPT meta 不授權新增 universal service/authorization facade。

- Shared server helpers may transport, parse, identify runtime or map errors; they must not become a horizontal business owner.
- Request identity, trusted Principal and environment/runtime guards must remain explicit inputs to owner application contracts.
- Do not hide authorization, transaction, retry or error semantics inside generic wrappers; keep owner-specific decisions at the owner boundary.
