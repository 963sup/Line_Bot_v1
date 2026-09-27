# Onboarding route group

## GitHub Mobile 目標（後續實作）

- 以單一明確步驟、身分摘要、必填欄位、主要確認與取消/返回構成；不展示完整工作底部 tab 或假完成度。
- 註冊 login 的輸入/錯誤就地呈現；恢復與停權是不同狀態，不能為簡化畫面合併成「開始使用」。
- 鍵盤出現時仍可看到主要欄位與錯誤；完成須使用 owner result，再安全接續原任務。

## 現行 URL 與 invariant

Current URL：`/membership/register`、`/membership/restore`、`/complete`。

- Account/User 是本地 owner；FPT users 僅供 identity 語意對照，LINE 註冊與恢復流程不是 GitHub 同名功能。
- `membership` 是保留的產品 URL，不能因內部使用 User 而直接更名。current lifecycle 是 `active | paused | suspended`；註冊需合法 login，暫停與停權不能混用。
- `/complete` 只呈現已核驗流程結果，不擁有另一套 Account 狀態；改入口須同步 login continuation 與 membership browser fixtures。

- Onboarding routes collect explicit intent and invoke Account/Organization owner contracts; invitation, membership or restore UI does not itself create authority.
- Registration, restore, link and confirmation flows must preserve request identity, current session consistency, version/replay and cancel/account-change semantics.
- Never infer successful provisioning from navigation or a rendered success state; use the owner result and readback contract.
