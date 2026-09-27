# Enterprise target design

本文保存 Enterprise target decision 與理由；current capability/source/schema 狀態由 [Enterprise owner](../../owners/enterprise.md)、machine semantic/data truth 與 runtime evidence 擁有。

## Decision

Enterprise 是 cross-Organization governance boundary，不是 Organization 的大型版本、legal entity、tenant database 或 external provider。它擁有 Enterprise lifecycle、Enterprise-level participation/affiliation、EnterpriseOrganization、EnterpriseTeam、EnterprisePolicy 與跨 Organization governance；不擁有 Workforce、Attendance、Payroll private model。

Direct participation、pending invitation 與 effective Enterprise user 是不同事實：

```text
EnterpriseInvitation
≠ EnterpriseDirectAffiliation
≠ Effective Enterprise User
```

Effective population 可以由 direct affiliation 與 attached Organization participation 推導；root governance authority 不因 indirect participation自動成立。

## Enterprise Team decision

`EnterpriseTeam` 與 Organization-scoped `Team` 是不同 entity，不建立 generic Team aggregate/flag：

- EnterpriseTeam：Enterprise-level grouping，可跨 Organizations。
- Organization Team：單一 Organization collaboration owner。
- EnterpriseTeam assignment 不自動授予 EnterpriseOwner、OrganizationOwner 或 TeamMaintainer。
- Team membership 與 RoleAssignment 保持不同 fact/writer。

## Organization assignment semantics

EnterpriseTeam → Organization assignment 可以形成 Organization participation source，但 source 必須保留 provenance。Direct source 與一個以上 EnterpriseTeam-derived source 可以共存，移除單一 source 不得誤刪其他有效 qualification。

若 source removal 會破壞 membership-bound authority/recovery invariant，mutation 必須 fail closed，而不是 destructive cascade。

## Authority

- EnterpriseOwner 由 Identity/Access 決策，需符合 Enterprise owner qualification。
- OrganizationOwner 屬 Organization scope，不由 EnterpriseTeam membership 推導。
- TeamMaintainer 只屬 Organization Team。
- Membership/Affiliation 是 qualification fact，不直接等於 Permission。
- 未來 additive/custom role 若接受 Team principal，必須由該 RoleDefinition 明確定義。

## Deferred

Outside collaborator、resource-level access、EnterpriseTeam 作 role principal、Enterprise role/license/ruleset bypass、SCIM/IdP sync、generic policy DSL、跨 Enterprise data sharing 都需真實 consumer、authority/revoke/recovery evidence 才能實作。

## Current-state routing

- [Enterprise owner](../../owners/enterprise.md)
- [Organization owner](../../owners/organization.md)
- [Team owner](../../owners/team.md)
- [Semantic model](../../../architecture/semantic-model.json)
- [Security target](../proposals/security-target.md)
- [Data target](../proposals/data-target.md)
- [Migration plan](../migrations/enterprise-organization-workforce-payroll.md)
