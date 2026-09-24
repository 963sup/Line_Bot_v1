# Enterprise / Organization / Workforce / Payroll implementation state

基準：2026-09-18 repository source。本文件只記 current source 與明確未完成項；舊 revision 的 static evidence 留在 `../060-acceptance/`，不在 current-state 文件複製第二份歷史驗收。

## Current source

### Account / User

Current human lifecycle/qualification 已由 Account/User owner 承接；stable Account root 與 `users` facet 共用 opaque text ID。Public User management 使用 `users.*`；legacy `members.*` 只允許存在於明確的 private persistence/history boundary，不再作為 governance domain vocabulary。

### Enterprise / Organization

Current source 已包含：

- `packages/enterprise`／`packages/organization` Domain、Application、contracts 與 PostgreSQL adapter。
- Enterprise direct affiliation 與 Organization-derived affiliation 組成的 effective Enterprise user population。
- Enterprise／Organization invitation 與既成 affiliation／membership 分離；`pending` 屬 invitation，不屬 membership/affiliation。
- Organization direct membership source 與 effective `OrganizationMembership` 分離；effective membership 可同時由 direct source 與一個以上 Enterprise Team source維持。
- `EnterpriseOwner` 與 `OrganizationOwner` 都是 Identity/Access scoped RoleAssignment；`EnterpriseOwner` current qualification 要求 active direct Enterprise affiliation，`OrganizationOwner` 只可指派給有效 individual Organization member，不可由 Organization Team 或 Enterprise Team 整體持有。
- EnterpriseOrganization active/detached relation、governance receipt/audit、expected-version、replay protection。
- Enterprise Team、Enterprise Team membership、Enterprise Team → Organization assignment，以及 source-aware Organization membership refresh。
- `supabase/schemas/20_enterprises.sql`、`21_organizations.sql`、`23_enterprise_teams.sql`、`24_enterprise_invitations.sql`、`25_organization_invitations.sql`、`30_authorization.sql`、`80_audit.sql`、`84_cross_context_views.sql`、`85_cross_context_constraints.sql`、`86_transaction_functions.sql`、`90_access.sql` 共同構成 current governance schema source。

Current effective Enterprise user 可以來自 active direct affiliation 或 attached active Organization 的 active member；direct affiliation 不等於 Enterprise membership。Enterprise Team current member 必須先是 active effective Enterprise user。當 Enterprise Team 被 assign 到同 Enterprise 的 attached Organization，active Team members 取得 `enterprise-team` Organization membership source；移除 Team member／assignment 只撤銷該 source，存在其他 direct 或 Enterprise Team source 時不得誤刪 effective membership。

GitHub current benchmark 還包含 outside collaborator、enterprise role/licensing/ruleset bypass 等較完整語意；本專案尚未建立對應 resource/access owner，所以不以放寬 current membership gate 或 generic facade 模擬。

### Team

Current Team 是 Organization-scoped Organization Team：Team 保存 immutable OrganizationAccountId，TeamMembership 使用 UserId，`TeamMaintainer` 由 Identity/Access scoped RoleAssignment 決定；schema 使用 `22_organization_teams.sql`。

Team membership write 與 TeamMaintainer role write 已分離。TeamMaintainer 只能是有效 Organization Team member，membership 本身不直接授權。Organization Team 不可承接 `OrganizationOwner` membership-level role。Nested Organization Team 尚未宣稱 current runtime capability。

Enterprise Team 是另一個 Enterprise-owned model，由 `packages/enterprise` 與 governance schema 擁有；它不使用 Organization Team hierarchy、TeamMaintainer 或 Organization Team storage。

### Attendance

Attendance Domain/Application 已由 `@line-work/attendance` 擁有；PostgreSQL adapter 仍在 compatibility Infrastructure。Account/User 提供 current human qualification，但 actual attendance state/history 的 Data Boundary 尚維持 Member-compatible stream。EmploymentId cutover、history/open-session reconciliation、correction/finalization 仍未完成。

### Payroll readiness

`@line-work/payroll` 已有 readiness Domain/Application/ports/tests：要求 `workforceVersion`、`attendancePeriodVersion` 與 required `PayrollRuleVersion`，missing input fail closed。這個 foundation 不計算正式薪資、不寫 PayrollRun/PayStatement、不授予 payroll permission。

## Still not implemented / not accepted

- Outside collaborator 與 resource-level access model。
- Enterprise Team 的 GitHub 完整 administration surface，例如 enterprise role/licensing/ruleset bypass；current slice只承接 Team membership、Organization assignment 與 membership provenance。
- additive Organization roles（如 Team principal 可持有的 non-owner role）與 custom roles；current Organization governance 只實作 membership-level `OrganizationOwner`。
- Nested Organization Team。
- Workforce／Employment Domain/Application/persistence 與 versioned terms/policy/calendar/schedule。
- Attendance Employment-scoped command/history cutover 與 finalized AttendancePeriodVersion。
- PayrollRun/PayStatement calculation/persistence/approval/finalize/publication/correction。
- 正式 Taiwan payroll applicability、rounding、business/legal/accounting sign-off。
- 完整 recovery、release/device/business acceptance。
- Bot delegation、Managed User、Billing 與需要真實 consumer 才成立的其他 target capability。

## Open work routing

本文件到此只描述 current source 與明確未完成能力，不再維護 future implementation sequence。

- Workforce target contract：[Workforce rules](../../010-domain-owners/040-workforce.md)
- Workforce open completion conditions：[Workforce gaps](../040-gaps/060-workforce.md)
- Workforce → Attendance → Payroll 實作、activation 與 rollback：[Migration plan](../030-migrations/040-enterprise-organization-workforce-payroll.md#workforce--attendance--payroll-implementation-slices)
- Payroll open completion conditions：[Payroll gaps](../040-gaps/090-payroll.md)
- 具日期/revision/environment 的結果：[Acceptance](../060-acceptance/README.md)

Target 文件、migration plan 與 gap 不構成 current runtime 或 acceptance evidence。
