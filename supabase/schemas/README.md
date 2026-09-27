# Object / Relationship schema tree

`supabase/schemas/` 的可執行 SQL 是 application-owned PostgreSQL current desired state。此目錄不是 migration history，也不是按照 package 資料夾鏡像；它依 **Object / Relationship authority** 與 lexical dependency 排序。`870–891` 是純註解 reserved target namespace，尚不定義 current PostgreSQL structure。

Authority chain：

```text
semantic-model.json
  → concept / relationship owner
data-topology.json
  → persisted relation authority / role / physical file
supabase/schemas/*.sql
  → actual PostgreSQL definition
packages/<owner>
  → runtime writer / public contract when runtime exists
```

## Tree

```text
000_foundation.sql

100_accounts.sql
101_account_logins.sql
110_users.sql
111_user_external_identities.sql
112_user_provisioning.sql
113_user_profiles.sql
114_user_achievements.sql
115_user_follows.sql

200_enterprises.sql
201_enterprise_affiliations.sql
202_enterprise_organizations.sql
210_enterprise_teams.sql
211_enterprise_team_memberships.sql
212_enterprise_team_organization_assignments.sql
220_enterprise_invitations.sql

300_organizations.sql
301_organization_memberships.sql
302_organization_invitations.sql

400_teams.sql
401_team_memberships.sql
402_team_commands.sql

500_enterprise_role_assignments.sql
501_organization_role_assignments.sql
502_team_role_assignments.sql
510_permission_definitions.sql
511_permission_grants.sql
512_permission_administration.sql
520_governance_evidence.sql

600_repositories.sql
601_repository_user_access.sql
602_repository_team_access.sql
603_repository_stars.sql
604_repository_commands.sql
610_repository_labels.sql
611_repository_milestones.sql
620_issues.sql
621_issue_commands.sql
622_issue_events.sql
623_issue_labels.sql
630_discussions.sql
631_discussion_comments.sql

700_projects.sql
701_project_items.sql
702_project_wbs.sql
703_project_milestones.sql
704_project_repository_references.sql

800_asset_definitions.sql
805_daily_check_in_claims.sql
810_ledger_entries.sql

820_expenses.sql
821_expense_events.sql
822_receipt_intents.sql

830_attendance.sql
831_attendance_commands.sql
832_attendance_events.sql
833_attendance_outbox.sql
840_workplaces.sql
841_workplace_memberships.sql
842_workplace_commands.sql
843_workplace_chat.sql

850_notifications.sql
851_notification_deliveries.sql

860_partners.sql
861_partner_contacts.sql
862_partner_referrals.sql
863_partner_commands.sql

870_employments.sql                  # reserved: Workforce target
871_employment_terms.sql             # reserved: Workforce target
872_work_policy_versions.sql         # reserved: Workforce target
873_workforce_calendars.sql          # reserved: Workforce target
874_workforce_schedules.sql          # reserved: Workforce target
875_scheduled_intervals.sql          # reserved: Workforce target
880_pay_periods.sql                  # reserved: Payroll target
881_payroll_runs.sql                 # reserved: Payroll target
882_pay_statements.sql               # reserved: Payroll target
883_payroll_input_versions.sql       # reserved: Payroll target
890_audit_events.sql                 # reserved: Audit target
891_audit_logs.sql                   # reserved: Audit target

900_cross_owner_projections.sql
910_cross_owner_constraints.sql
920_transaction_coordinators.sql
930_access_enforcement.sql
```

## Reserved target files

`870–891` currently reserve selected target names only. They are pure `--` comment files registered in `architecture/data-topology.json` with `role = "reserved"` and a `targetOwner`; they do not define tables, views, functions, grants, policies or runtime capability.

Reserved files are allowed only to prevent future naming drift for targets already selected in canonical docs:

- Workforce: Employment, EmploymentTerms, WorkPolicyVersion, Calendar, Schedule and ScheduledInterval.
- Payroll: PayPeriod, PayrollRun, PayStatement and PayrollInputVersion.
- Audit: AuditEvent and AuditLog/query projection.

Activating any reserved file requires removing the reserved marker and updating the actual SQL, data topology relation mapping, current owner docs, consumer contract, tests and validation evidence in the same change. A reserved SQL file is not remote Supabase evidence, deployment evidence or business acceptance.

## Object boundaries

- Account/User owns global account identity, User lifecycle, login namespace, external identities, profile/achievement facts and User→User follow.
- Enterprise owns Enterprise, direct affiliation, Enterprise↔Organization attachment, EnterpriseTeam, EnterpriseTeamMembership, Team→Organization assignment and Enterprise invitations.
- Organization owns Organization membership and invitation facts. Organization does not own Enterprise attachment.
- Team owns Organization-scoped Team, TeamMembership and Team command receipts. TeamMaintainer RoleAssignment belongs to Identity/Access.
- Identity/Access owns typed RoleAssignment, feature permission grants/administration and governance evidence.
- Repository owns Repository identity/access/star, Label, Repository Milestone, Issue/IssueLabel and Discussion objects.
- Project owns Project, ProjectItem references, WBS, Project Milestone and explicit Project→Repository reference. Referenced Issue remains Repository authority.
- Asset owns denomination definition; DailyCheckIn owns durable reward outcomes; Ledger owns append-only value facts; Wallet remains derived and has no writable balance table.
- Attendance owns attendance/workplace facts and outbox; Notifications and Partner Directory own their own durable relations.
- Workforce, Payroll and Audit `870–891` are reserved target namespaces until their activation gates are met; they do not yet own current persisted relations in this directory.

## Cross-owner mechanisms

`900–930` are mechanisms, not domains:

- `900`: rebuildable read-only projections.
- `910`: invariants impossible to declare before all participating relations exist.
- `920`: database-atomic coordinators where one transaction is essential.
- `930`: cross-owner RLS/grants/function/view executable surface.

No table representing new business truth belongs in these files.

## Validation

`pnpm architecture` parses every `CREATE TABLE/VIEW app_private.*` from this directory and compares it with `architecture/data-topology.json`. A clean result requires:

1. every SQL file declared;
2. every persisted table/view mapped exactly once;
3. authoritative relation owner resolves to a semantic owner;
4. relation owner agrees with mapped semantic concept;
5. concepts requiring relation persistence have an authoritative relation;
6. authoritative files do not mix semantic owners;
7. reserved files contain only matching line-comment markers and no current relation mapping;
8. cross-owner mechanisms do not claim business authority.

Database execution is separately proven by `pnpm schema:check`; remote Supabase is separately proven by `schema:remote plan/sync/verify`.
