# GitHub-like governance schema sync evidence

日期：2026-09-18

本文件只記錄本次 GitHub-like governance people semantics 的 repository／remote database evidence。Domain benchmark 由 GitHub Docs 與 canonical governance design 文件承接；本頁不是第二份 business-rule owner，也不把 migration execution、CI、deployment 或 LINE 實機驗證混成同一種證據。

## Scope

本次根因修正聚焦四個 primitive：

```text
Invitation ≠ Membership/Affiliation ≠ RoleAssignment

Enterprise direct participation = EnterpriseDirectAffiliation
Organization participation = OrganizationMembership
OrganizationOwner = active individual Organization member only
TeamMembership ≠ TeamMaintainer
```

Enterprise effective user population由 active direct affiliation 與 attached active Organization 的 active OrganizationMembership 組成。Current Team 明確是 Organization Team；EnterpriseTeam 仍需 Organization membership source/provenance 後才可安全落地。

## Repository source of truth

Development database structure 仍以 `supabase/schemas/` 為唯一 current desired state。本次同步修改：

- `12_governance_bootstrap.sql`：新增 Enterprise direct affiliation、Enterprise/Organization invitation；OrganizationMembership 收斂為 `active | removed`；Owner roles 使用 current naming；bootstrap 建立 root affiliation/membership + Owner。
- `13_governance_runtime.sql`：effective Enterprise user view、new relation grants/RLS/policies。
- `40_teams.sql`：Team command 將 membership 與 maintainer write 分開。
- 移除 `45_governance_team_roles.sql`：不再允許 Organization Team 整體取得 `OrganizationOwner`。
- 新增三個 user-side FK lookup indexes，避免本次新 relation 引入額外 unindexed-FK advisor debt。

沒有新增 repository migration file。這是 project 既定 development declarative-schema workflow；remote forward-sync DDL 不取代 `supabase/schemas` current contract，也不改寫既有 migration history。

## Pre-sync remote evidence

Retired Supabase production environment 的 provider project identifier 已移除。同步前 readback 顯示 governance / Team runtime 相關 relation 均為 0 rows，包括 Enterprise、Organization、role assignments、memberships、teams、commands、receipts/audit 與舊 `organization_team_role_assignments`。

因此本次可直接替換錯誤的 governance people schema，不需要 legacy data backfill 或 compatibility table。同步範圍只碰 governance／Team owner relations/functions/constraints，不重建整個 `app_private`，也不碰其他 domain data。

## Remote forward-sync

已套用 reviewed development forward-sync：

1. `align_github_governance_people_semantics`
   - 移除舊 `enterprise_memberships`。
   - 移除舊 `organization_team_role_assignments`。
   - 建立 `enterprise_direct_affiliations`、`enterprise_invitations`、`organization_invitations`。
   - Organization membership status 收斂為 `active | removed`。
   - Enterprise role assignment 移除舊 membership-version coupling。
   - Team command action 收斂為 `create-team | join | membership | maintainer`。
   - 重建 `enterprise_user_affiliations` security-invoker view。
   - 同步 bootstrap functions、RLS、grants、policies。
2. `index_governance_people_foreign_keys`
   - `enterprise_direct_affiliation_user_lookup`
   - `enterprise_invitation_user_lookup`
   - `organization_invitation_user_lookup`

## Post-sync readback

Remote catalog readback確認：

- 舊 `enterprise_memberships` 不存在。
- 舊 `organization_team_role_assignments` 不存在。
- 三個新 people relations存在且 RLS enabled。
- `enterprise_user_affiliations` 是 `security_invoker=true` view。
- `line_app` 只有 declarative schema 指定的 relation privileges；bootstrap functions 仍未授權 public/anon/authenticated/line_app。
- Enterprise/Organization role constraints 分別只接受 `EnterpriseOwner` / `OrganizationOwner`；OrganizationOwner 不再有 Team-principal persistence path。
- Team command constraint 已是 `create-team | join | membership | maintainer`。
- Bootstrap function readback使用 `enterprise_direct_affiliations` 與 current Owner semantics。
- 新增的三個 user-side FK indexes 已同步到 remote。

## Advisor evidence

Security advisor 的 governance 相關提示只剩 `governance_bootstrap_receipts` 啟用 RLS 但沒有 runtime policy；這是刻意的 operator-only boundary，不應為了消除警告而新增 runtime access。另一項 leaked-password protection 是 Supabase Auth project setting，與本次 governance DDL 無關。

Performance advisor 在 index sync 後不再回報本次新增的 Enterprise direct affiliation / Enterprise invitation / Organization invitation user-side FK 為 unindexed。其他既有 relation 的 advisor 建議屬既有 backlog，不在本次 governance people semantic cutover 中順手重構。

## Validation boundary

Remote SQL/migration success 不是 application validation。Repository 的 lint/typecheck/test/schema/build 以 Draft PR `#46` 最終 squash SHA 的 `Validate` workflow 為準；Vercel 也只採同一 final SHA 的 Preview/build result。中間 commit 或較早 READY Preview 不作 final acceptance evidence。

本次沒有宣稱 EnterpriseTeam、outside collaborator、resource-level access、additive/custom Organization roles、Workforce/Employment 或 Payroll 已完整實作；這些能力仍由 current-state/gap/target owner 文件明確列為未完成。
