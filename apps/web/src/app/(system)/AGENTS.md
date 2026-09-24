# System route group

## GitHub Mobile 目標（後續實作）

- provider 交接採任務頁：正在驗證、成功、取消、過期或服務不可用各有清楚下一步；不套複雜資源列表或主要工作 tab。
- 從 LINE 到外部 Google 再返回的 context 以原有一次性契約維持，不能以模仿原生 tab 行為建立新 window/token cache。
- 返回目的地須通過 allowlist；重試不產生第二次綁定或重複 business command。

## 現行 URL 與 invariant

Current URL：`/auth/callback`、`/google-link`、`/unavailable`。

- 這些是本地 provider protocol／結果入口，不因 FPT 有 apps/users 就搬入 Account resource tree。
- `/google-link` 為 Google 外部交接，依現行 session/一次性請求契約處理；不要為了共用 app shell 加入 LIFF 初始化或自動 business write。
- callback/return path 變更必須核對 provider 設定、allowlist、取消/失敗/過期接續測試；本機檔案修改不代表遠端 callback 已更新。

- System routes own protocol continuation and availability presentation only; Auth, Google link and provider sessions remain governed by their owners.
- Callback/session data is untrusted until validated against current session, state/nonce and owner contract; provider login is not business authorization.
- Preserve failure, cancellation, stale callback and unavailable-provider distinctions.
