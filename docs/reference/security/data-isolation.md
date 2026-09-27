# Scope and data isolation

Data Boundary 是資料存取與隔離邊界，不等於 Bounded Context 或 Code Module。授權與查詢使用真正的 scope relationship，不以 UI、URL、外部群組或名稱相似推定。

## Current scopes

目前至少存在：

- User/self；既有 Member wire/storage 只作相容 protocol/private persistence。
- Enterprise/Organization governance participation 與 scoped admin relation；remote governance schema 已有指定環境 readback，完整 release/business acceptance 仍另驗。
- Enterprise Team／EnterpriseTeamMembership／Team → Organization assignment；Organization membership source/provenance 可區分 `direct` 與 `enterprise-team`。
- Organization Team / TeamMembership / `organization-team`-scoped TeamMaintainer。
- Attendance current Member-compatible working stream + Workplace eligibility/management scope。
- Partner directory management/review permissions。
- Announcement active-human audience + publish permission。
- Expense owner / stored scope。

Enterprise Team 與 Organization Team 是不同 scope。Enterprise Team assignment 只可指向同 Enterprise 的 active attached Organization，且只建立 `enterprise-team` Organization membership source；不因此取得 Organization Team identity、TeamMaintainer 或 OrganizationOwner。Employment → Attendance/Payroll 的工作 scope 尚未成為 current enforcement；見 [Target scope](../090-governance/020-proposals/040-security-target.md)。

## Rules

- LINE groupId 不等於 TeamMembership／OrganizationMembership。
- TeamMaintainer 只對指定 Organization Team 生效，不等於 global business administrator、OrganizationAdmin 或 Enterprise Team authority。
- Active User 不等於任意 Organization/Organization Team/Workplace/Project/Employment access。
- Entity ID 只定位，不授權。
- External provider identity 先映射 internal identity，再按 current participation/permission/scope 驗證。
- Cross-scope relation 驗證兩端真正屬於同一合法 scope；只確認 ID 存在不足。
- Enterprise Team assignment 必須驗證 Enterprise、Team、Organization 三者 scope relationship，不以同名或單一 foreign key 推定。
- Read/write authorization 可不同；Audit/history access 不授予原 private object access。

## Relationship separation

- EnterpriseOwner 不等於 OrganizationMembership。
- OrganizationMembership 不等於 Employment。
- Organization TeamMembership 不等於 TeamMaintainer 或 Organization-wide permission。
- EnterpriseTeam 不等於 Organization Team；兩者 membership、role 與 hierarchy invariant 不共用 generic Team authority。
- EnterpriseTeamMembership 不等於 OrganizationMembership；只有 active Team → Organization assignment 才形成 `enterprise-team` membership source。
- Employment 不等於 Payroll/HR administrator。
- Enterprise/Organization/Organization Team/Enterprise Team/Employment ID 只定位 scope，不自行授權。

## Revocation

撤銷 User qualification、feature permission、Organization/Organization Team participation、Enterprise Team participation/assignment 或 scoped role 後，下一次 protected operation 重驗；replay 是否需要 current authorization 由各 owner contract 明確規定，不能把舊 receipt 當永久 read/write permission。

Organization membership provenance 允許 direct source 與多個 Enterprise Team-derived sources 同時存在。撤銷 Enterprise Team membership 或 Team → Organization assignment 只能移除該 source；仍有其他 active source 時 effective OrganizationMembership 必須保留。沒有任何 source 時才可轉為 removed，且 source removal 不能繞過 OrganizationOwner 等 membership-bound authority invariant。

## Database boundary

Private tables 由受限 server/runtime role 存取；browser role 不因 API 存在就取得 table access。RLS/grants 與 application authorization 是互補防線，不互相取代。`organization_membership_sources` 是 security-invoker projection，不是新的 write authority；authoritative sources 仍是 direct membership 與 Enterprise Team relation tables。

## Adjacent owners

- Authentication：`../020-authentication/`
- Feature permissions：[Feature permissions](../050-security/030-authorization.md)
- Data model：[Core business data](../040-data/010-data-boundary-model.md)
- Target hierarchy isolation：[Target scope](../090-governance/020-proposals/040-security-target.md)
- Module-specific authorization：[Domain owners](../010-domain-owners/README.md)
