# Management permission cutover

狀態：User permission current contract 已收斂；2026-09-18 的 data-preserving remote cutover 已完成並 readback，證據見 [Atomic schema remote convergence](../060-acceptance/080-atomic-schema-remote-convergence.md)。該證據屬 retired Supabase environment；current operational target 由 [Supabase 開發入口](../../../supabase/README.md) 與 release workflow 擁有。本文只保存仍有操作價值的 migration/cutover 條件；完成結果歸 acceptance，不建立第二份 current contract。

## Permission migration

Permission storage 不保留 `members.*`、`member_id` 或 adapter compatibility。從舊 remote 切到 current schema 時必須協調 application 與 database：

1. 讀回並核對 `permission_administrators`、`permission_grants`、`permission_commands` row count、permission distribution、constraints 與 User FK。
2. 停止不相容舊 application 接受 permission／User management 業務請求；不得讓舊 source 在 schema cutover 後繼續寫入。
3. 在單一 transaction 內把 permission-owned storage 改為 `user_id` / `user_version`，把 `members.read` / `members.suspend` data transform 為 `users.read` / `users.suspend`，同步 constraints 與 administrator protection functions。
4. 部署只使用 current User names/literals 的 application；不建立 compatibility view、alias、dual-write 或雙份 grants。
5. 讀回 columns、constraints、functions、RLS/grants、row counts 與 permission distribution，再執行 authorized / unauthorized / revoke / last-administrator protection 驗證後才視為完成。

Cutover 已套用後若出現問題，優先向前修復；不得只 rollback application 造成 schema incompatibility。`supabase/schemas/30_authorization.sql` 是 permission current schema owner；其跨 Workplace FK 由 `85_cross_context_constraints.sql` 在 lexical dependency 完整後宣告，temporary remote transform 不寫成第二份 migration truth。

## Permission administrator

第一位 administrator 不由第一位註冊者自動取得。可信操作者必須明確核對指定 active User 與目前 status version，受控寫入 `permission_administrators` 並 readback。

Permission administrator 身分不自動得到全部 business permissions。後續 business grants 仍需明確配置；User 狀態變更後失效的 grant 不自動恢復。

最後一位有效 permission administrator 的撤換需先存在另一位有效 administrator，不能為恢復登入而開匿名 bypass。

## User management

User management 使用 `users.read` 與獨立的 `users.suspend`。Rollout 要驗證 reader、suspender、unauthorized actor、revocation、suspend/restore、Coin/history preservation 與未結束工作提示；不能自動下班或移轉任務。

## Partner management

Partner directory management 以 `partners.manage` 控制整份名錄維護，與 `partners.review` 分離。涉及 contact schema migration 時必須先停止不相容 writer、備份並核對 partner/contact/referral relationship，完成 migration + compatible Web 後再重開入口。

## Evidence

本地 PGlite、unit/browser test 不代表 remote cutover 或 real administrator assignment 已完成。具日期 rollout/readback 證據歸 `../060-acceptance/`；未完成的 production gate 歸 `../040-gaps/`。
