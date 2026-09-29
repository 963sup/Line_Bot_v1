# Web Notifications module
## 現行 surface 與 invariant
Current presentation name：Inbox。Current published URL：`/notifications`、`/notifications/{notificationId}`；API `/api/notifications`。URL/API 是 transport contract，不把 Inbox 升格成 Domain owner。

本地 recipient inbox/read-state 依 `@line_bot_v1/notifications`。GitHub-derived semantics 一律直接以 vendored FPT JSON 為 domain truth；若 FPT 沒有對應 Notification symbol/field，這份 inbox/read-state 就是明確的 Line_Bot_v1 local overlay，不得從 category 或 UI 猜出 GitHub 契約。URL 中 notificationId 只定位，不能指定或冒充 recipient。

改詳情／返回連結時保留 unread filter、直接開啟及身分切換清除；不得將通知投影當 Issue/Discussion 的新 source of truth。

- Owns notification inbox presentation and read-state transport only; source Issue/Discussion facts remain in their owners.
- Do not reintroduce announcement publishing, audit-publication or generic broadcast semantics through this module.
- Missing/unavailable source data is not an empty inbox; preserve explicit error states.
- Recipient identity comes from the verified request identity and is never accepted from URL or client payload.
