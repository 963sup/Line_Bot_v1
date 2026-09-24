# Web notifications module

## GitHub Mobile current slice / remaining target

- Inbox current 已以 recipient-scoped list/detail/read state 為核心，並使用既有 `notificationView=all|unread` / `unreadOnly` contract 提供 All / Unread filter；resource context 等額外欄位只有 owner contract 真實提供時才顯示。
- 詳情／來源連結先驗可讀，再回到保留 filter 的 inbox；通知存在不代表來源仍可存取，不能用通知內容繞過 revoke。
- 上游的 Focused、Done、Saved、snooze、swipe/bulk actions 不自動成為本地能力；只展示已有 command 的操作。全域 badge 只顯示可靠 count，未知不顯示 0。

## 現行 surface 與 invariant

Current URL：`/notifications`、`/notifications/{notificationId}`；API `/api/notifications`。

本地 recipient inbox/read-state 依 `@line-work/notifications`；FPT category 本身不足以證明 Notification 契約，補充來源依 canonical benchmark 的明確註記。URL 中 notificationId 只定位，不能指定或冒充 recipient。

改詳情／返回連結時保留 unread filter、直接開啟及身分切換清除；不得將通知投影當 Issue/Discussion 的新 source of truth。

- Owns notification inbox presentation and read-state transport only; source Issue/Discussion facts remain in their owners.
- Do not reintroduce announcement publishing, audit-publication or generic broadcast semantics through this module.
- Missing/unavailable source data is not an empty inbox; preserve explicit error states.
- Recipient identity comes from the verified request identity and is never accepted from URL or client payload.
