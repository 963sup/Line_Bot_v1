# Workforce target design

狀態：selected target decision；尚無完整 Workforce source/schema/runtime。Current Attendance 仍按 current contract 運作，本文件只保存「為何選這個邊界」，不重複 business rules、gap 或 migration 細節。

## Decision

- 以 `Employment(UserId, OrganizationAccountId)` 作為 period-scoped work relation identity；Account、OrganizationMembership 與 Employment 分責。
- `Employee` 只描述具有有效 Employment 的 User，不建立另一個 global human identity。
- Workforce 擁有 scheduled/applicable work facts；Attendance 擁有 actual work facts；Payroll 擁有 compensation result。
- 下游只消費 owner-approved、可追溯 versioned projection；現在變更政策不能重新解釋既有歷史輸入。

## Why

GitHub-like Account / Organization participation 解決「誰能參與與治理」，但不能代表僱傭／工作關係。把 Employment 獨立建模可避免從 Account hierarchy 推測歷史工作 scope，也讓 Attendance 與 Payroll 取得明確 working subject 與可重建的版本來源。

Organization、Workforce、Attendance、Payroll 的 authority、lifecycle 與歷史語意不同；共用資料庫或 UI 不構成合併 owner 的理由。

## Consequences

- Current User / Organization 可以先獨立演進；Workforce 未完成時不得把 Attendance / Payroll target 宣稱已交付。
- 不建立 `packages/employment`；只有 W1 有真實 consumer 且獨立 public/dependency boundary 有價值時，才建立 `packages/workforce`。
- Participation prerequisite、overlap policy、authority、replay/version、calendar/policy source 等尚未定案事項只留在 [Workforce gaps](../040-gaps/060-workforce.md)。
- 實作順序與 activation/rollback 只由 [Migration plan](../030-migrations/040-enterprise-organization-workforce-payroll.md#workforce--attendance--payroll-implementation-slices) 維護。

## Canonical contracts

- [Workforce business rules](../../010-domain-owners/040-workforce.md)
- [Target language](../020-proposals/010-domain-target.md)
- [Target consistency boundaries](../020-proposals/010-domain-target.md)
- [Target public contracts](../020-proposals/010-domain-target.md)
- [Target persistence](../020-proposals/030-data-target.md)
- [Target authorization](../020-proposals/040-security-target.md)
