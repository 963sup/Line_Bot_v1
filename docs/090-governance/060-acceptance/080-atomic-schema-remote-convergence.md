# Atomic declarative schema / remote convergence evidence

日期：2026-09-18

本文件記錄 `supabase/schemas/` owner-based 原子化重排與指定 development/live Supabase catalog convergence 的驗證證據。它不是第二份 schema contract；current desired state 仍只由 `supabase/schemas/` 擁有。

## Repository scope

本次把既有 declarative SQL 依 owner 與 lexical dependency 重排為 Account/User/External identity、Enterprise/Organization/Organization Team/Enterprise Team、Invitation、Authorization、既有 product data owners，以及 `80/84/85/86/90` cross-owner tail。沒有為尚無 current persistence owner 的 Bot、generic Resource、Notification、Achievement 或 Billing 建立空殼 schema。

既有 Attendance、Ledger、Expense、Workplace、Task、Announcement、Partner 等 relation 只改 schema source 檔名，不改 table contract。跨 owner 的 `permission_grants_workplace_id_fkey` 延後到 `85_cross_context_constraints.sql` 宣告；constraint name 與語意不變。

PR #51 revision `30eaa741048799b62a2704da163334e2f5297ef8` 的 GitHub Actions Validate run #842 完整通過 `pnpm validate`，包含 docs、clean declarative schema build、architecture、lint、typecheck、tests 與 production build。

## Remote project and preflight

Supabase project：`clbpdzaprfcqtfwtaasg` (`line-bot-963sup`, ap-southeast-1)。

原子化重排本身不要求 remote drop/rebuild；remote 已有 UserAccount、Ledger、Attendance、Permission、Workplace 等非零資料，因此禁止以 reset/recreate 取得表面一致。

Readback 另發現一項先前已存在的 Permission drift：

- `permission_administrators` 仍使用 `member_id/member_version`。
- `permission_grants` 仍使用 `member_id/member_version`。
- `members.read/members.suspend` 仍存在於 remote permission rows/constraint。
- production deployment `dpl_8SF8soR3b9CLDcciHK7JGSECuFXJ` 的 Git SHA `5a883fd83726ded0d063065be2f9bca3a930edab` 已使用 current `user_account_id/user_account_version` 與 `user-accounts.*` contract，因此 remote 是落後的一側。

Cutover preflight：1 位 permission administrator、6 筆 grants、0 筆 permission commands；所有 UserAccount FK 均可解析、stored version 均與 UserAccount status version 一致，literal mapping 無 unique collision。

## Remote forward-sync

以 data-preserving transaction 套用：

1. `sync_permission_user_account_contract`
   - rename Permission columns/constraints 到 current UserAccount naming。
   - `members.read` → `user-accounts.read`。
   - `members.suspend` → `user-accounts.suspend`。
   - 重建 permission literal CHECK。
   - 同步 last-administrator protection functions 到 current column contract。
2. `normalize_google_link_user_account_constraints`
   - 只 rename 已指向 `user_account_id` 的 legacy Google link UNIQUE/FK object names；不修改資料。

沒有 compatibility view、alias、dual-write，也沒有放寬 RLS/grants/authorization。

## Post-sync readback

Remote readback 確認：

- Permission row counts 維持 1 administrator / 6 grants / 0 commands。
- 六種 current permission 各一筆；legacy `members.read/members.suspend` row count 為 0。
- `permission_administrators` 與 `permission_grants` columns、FK/UNIQUE/CHECK constraint names/definitions 已使用 current UserAccount contract。
- Permission protection functions 已使用 `user_account_id/user_account_version`。
- 「definition 已是 `user_account_id` 但 object name 仍含 legacy `member_id`」的 constraint/index count 均為 0。
- 以真正 `line_app` role 執行 read-only smoke：1 administrator、6 grants 可見且 6 grants 全部 effective；`organization_membership_sources` 與 `enterprise_user_affiliations` 仍可依既有 grants 查詢。

## Advisors and validation boundary

Security advisor 沒有出現本次 cutover 新增的 warning。既有項目仍為 operator-only `governance_bootstrap_receipts` 啟用 RLS 但無 runtime policy，以及 Supabase Auth leaked-password protection project setting；本次不為消警告放寬 private evidence boundary。

Performance advisor 的既有 unindexed-FK / no-primary-key / unused-index 建議不屬本次 schema source 重排，沒有順手擴 scope。Enterprise Team 前次新增的 covering indexes 仍存在。

本次不把 database readback、repository Validate、Vercel deployment 或 LINE device/business acceptance 混為同一證據。LINE 實機與 business acceptance 未在本頁宣稱完成。
