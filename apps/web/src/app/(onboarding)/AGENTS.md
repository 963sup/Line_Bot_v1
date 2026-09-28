# Onboarding route group


## 現行 URL 與 invariant

Current URL：`/membership/register`、`/membership/restore`、`/complete`。

- Account/User 是本地 owner；FPT users 僅供 identity 語意對照，LINE 註冊與恢復流程不是 GitHub 同名功能。
- `membership` 是保留的產品 URL，不能因內部使用 User 而直接更名。current lifecycle 是 `active | paused | suspended`；註冊需合法 login，暫停與停權不能混用。
- `/complete` 只呈現已核驗流程結果，不擁有另一套 Account 狀態；改入口須同步 login continuation 與 membership browser fixtures。

- Onboarding routes collect explicit intent and invoke Account/Organization owner contracts; invitation, membership or restore UI does not itself create authority.
- Registration, restore, link and confirmation flows must preserve request identity, current session consistency, version/replay and cancel/account-change semantics.
- Never infer successful provisioning from navigation or a rendered success state; use the owner result and readback contract.
