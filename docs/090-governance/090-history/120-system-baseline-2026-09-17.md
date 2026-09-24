# Current system baseline

基準：2026-09-17 repository source。本文只摘要 current source／contract；具日期、revision、環境與結果的驗證證據由 `090-governance/060-acceptance/` 擁有。Target／gap 不因寫在本頁就視為已實作。

## Repository architecture

Repository 是 TypeScript + pnpm context-first modular monolith。Runtime consumer 使用 `packages/<owner>` public surface；`architecture/manifest.json` 是 package ownership／allowed dependency 的 machine-readable source。Horizontal `packages/contracts`、`packages/infrastructure`、`packages/domain`、`packages/application`、`packages/agents` 已全部退出 workspace owner 結構；owner-specific implementation 與 contracts 由真正 owner 承接，中立 runtime／persistence mechanism 由 `packages/platform` 承接。

Module Boundary、Bounded Context、Data Boundary 分開判斷。把 adapter 搬回 owner 不自動改 schema/RLS/transaction；新增 package 也不由分類圖推導。

## Current business ownership

- **Account/User**：current 人類 identity/lifecycle/qualification owner，狀態 `active | paused | suspended`。既有 `Member`、`members.*`、`membership_denied` 可作 wire/storage/history compatibility literal，不建立第二個 Membership Domain owner。
- **DailyCheckIn**：current 每日簽到 policy/use case/claim owner；消費 Account/User qualification，保留 Ledger V1 `membership/daily_checkin` immutable source tuple。
- **Enterprise / Organization**：已有受限 governance Domain/Application/contracts、persistence adapter/schema/runtime flow 與 scoped role assignments；完整 lifecycle surface、remote/release/device/business acceptance 仍需按各 slice 驗證。
- **Team / Tasks**：current Team 是 Organization-scoped collaboration owner，使用 TeamMembership 與 TeamManager RoleAssignment；Tasks 保持自己的 responsibility chain。`WorkGroup` 只作 legacy/history/protocol literal。
- **Attendance**：current clock/session/Workplace/reward owner。Human qualification 已由 User dependency 提供，但 actual attendance stream/Data Boundary 尚保留 Member-compatible contract；EmploymentId cutover 是後續明確 migration。
- **Asset / Wallet / Ledger**：current value definition、USER holder projection、append-only Coin value facts；Ledger 不是 accounting General Ledger。
- **Expense / Partners / Announcements / Assistant**：各自維持既有 current owner；confirmed Expense 不等於 approval/payment/accounting，Assistant draft 不直接形成 formal write。
- **Payroll**：已有 readiness foundation，只聚合 Workforce／AttendancePeriod／rule versions；沒有正式金額計算、PayrollRun/PayStatement persistence/approval/publication。

## Selected target not yet current

Workforce 擁有 Employment、EmploymentTerms、WorkPolicyVersion、Calendar、published Schedule；Attendance target 使用 EmploymentId、period finalization/correction；Payroll 使用 immutable versioned inputs。正式主鏈是：

```text
User + OrganizationAccount
        ↓
     Employment
        ↓
     Attendance
        ↓
      Payroll
        ↓
 Finance（只有真實 consumer 時）
```

Employee 是有效 Employment 下的 User 描述，不新增 global Employee identity。OrganizationMembership != Employment；TeamMembership != Position；DailyCheckIn != Attendance。

## Security and protocol boundaries

Authentication proof、User qualification、feature permission／scoped RoleAssignment、Data Boundary、Domain invariant 是不同檢查。Stable ID、URL、LINE group、provider role、RLS hit 或 elevated credential 都不能自行授權。

Wire/protocol literals為相容性可以晚於 Domain owner 收斂：`membership` route、`Member` field、`members.*` permission、`membership_denied`、Ledger source tuple 等只有在有版本化 consumer rollout／history readback 時才修改，不因文字整齊直接 rename。

## Non-claims

Current source／CI 不等於遠端 Supabase catalog、Vercel deployment、LINE Console、手機實機、HR/payroll/accounting acceptance。Workforce/Employment、法定工時、正式 Payroll、Finance posting、Bot autonomous delegation、Managed User、Billing 等未完成能力繼續由 target/gaps 管理，不以 mock／schema 名稱／UI 入口冒充完成。

## Canonical routing

- [Documentation entry](../../README.md)
- [Current Domain Design](../../000-core/020-domain-map.md)
- [Business modules](../../010-domain-owners/README.md)
- [Repository structure](../../020-architecture/010-repository-architecture.md)
- [Scope isolation](../../050-security/040-scope-and-data-isolation.md)
- [Migration plan](../030-migrations/040-enterprise-organization-workforce-payroll.md)
- [Gaps](../040-gaps/README.md)
- [Acceptance evidence](../060-acceptance/README.md)
