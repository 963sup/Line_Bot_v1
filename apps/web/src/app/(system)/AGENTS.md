# System route group


## 現行 URL 與 invariant

Current URL：`/auth/callback`、`/google-link`、`/unavailable`。

- 這些是本地 provider protocol／結果入口，不因 FPT 有 apps/users 就搬入 Account resource tree。
- `/google-link` 為 Google 外部交接，依現行 session/一次性請求契約處理；不要為了共用 app shell 加入 LIFF 初始化或自動 business write。
- callback/return path 變更必須核對 provider 設定、allowlist、取消/失敗/過期接續測試；本機檔案修改不代表遠端 callback 已更新。

- System routes own protocol continuation and availability presentation only; Auth, Google link and provider sessions remain governed by their owners.
- Callback/session data is untrusted until validated against current session, state/nonce and owner contract; provider login is not business authorization.
- Preserve failure, cancellation, stale callback and unavailable-provider distinctions.
