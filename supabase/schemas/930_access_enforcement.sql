-- Cross-governance RLS, grants and executable surface. Owner-local access remains owner-local.

do $governance_security$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'enterprises','organizations','enterprise_direct_affiliations','enterprise_invitations',
    'organization_memberships','organization_direct_memberships','organization_invitations',
    'enterprise_role_assignments',
    'organization_role_assignments','governance_bootstrap_receipts'
  ] loop
    execute format('alter table app_private.%I enable row level security', relation_name);
    execute format('revoke all on app_private.%I from public, anon, authenticated, line_app', relation_name);
  end loop;
end
$governance_security$;


do $governance_runtime_security$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'enterprise_organizations','enterprise_teams','enterprise_team_memberships',
    'enterprise_team_organizations','governance_command_receipts','governance_audit_events'
  ] loop
    execute format('alter table app_private.%I enable row level security', relation_name);
    execute format('revoke all on app_private.%I from public, anon, authenticated, line_app', relation_name);
  end loop;
end
$governance_runtime_security$;


grant select, update on app_private.enterprises to line_app;
grant select, update on app_private.organizations to line_app;
grant select, insert, update on app_private.enterprise_direct_affiliations to line_app;
grant select, insert, update on app_private.enterprise_invitations to line_app;
grant select, insert, update on app_private.organization_memberships to line_app;
grant select, insert, update on app_private.organization_direct_memberships to line_app;
grant select, insert, update on app_private.organization_invitations to line_app;
grant select, insert, update on app_private.enterprise_role_assignments to line_app;
grant select, insert, update on app_private.organization_role_assignments to line_app;
grant select, insert, update on app_private.enterprise_organizations to line_app;
grant select, insert, update on app_private.enterprise_teams to line_app;
grant select, insert, update on app_private.enterprise_team_memberships to line_app;
grant select, insert, update on app_private.enterprise_team_organizations to line_app;
grant select, insert on app_private.governance_command_receipts to line_app;
grant select, insert on app_private.governance_audit_events to line_app;
grant select, update, usage on sequence app_private.governance_audit_events_id_seq to line_app;


create policy enterprise_runtime on app_private.enterprises
  for select to line_app using (true);
create policy enterprise_runtime_update on app_private.enterprises
  for update to line_app using (true) with check (true);
create policy organization_runtime on app_private.organizations
  for select to line_app using (true);
create policy organization_runtime_update on app_private.organizations
  for update to line_app using (true) with check (true);
create policy enterprise_direct_affiliation_runtime on app_private.enterprise_direct_affiliations
  for all to line_app using (true) with check (true);
create policy enterprise_invitation_runtime on app_private.enterprise_invitations
  for all to line_app using (true) with check (true);
create policy organization_membership_runtime on app_private.organization_memberships
  for all to line_app using (true) with check (true);
create policy organization_direct_membership_runtime on app_private.organization_direct_memberships
  for all to line_app using (true) with check (true);
create policy organization_invitation_runtime on app_private.organization_invitations
  for all to line_app using (true) with check (true);
create policy enterprise_assignment_runtime on app_private.enterprise_role_assignments
  for all to line_app using (true) with check (true);
create policy organization_assignment_runtime on app_private.organization_role_assignments
  for all to line_app using (true) with check (true);
create policy enterprise_organization_runtime on app_private.enterprise_organizations
  for all to line_app using (true) with check (true);
create policy enterprise_team_runtime on app_private.enterprise_teams
  for all to line_app using (true) with check (true);
create policy enterprise_team_membership_runtime on app_private.enterprise_team_memberships
  for all to line_app using (true) with check (true);
create policy enterprise_team_organization_runtime on app_private.enterprise_team_organizations
  for all to line_app using (true) with check (true);
create policy governance_receipt_read on app_private.governance_command_receipts
  for select to line_app using (true);
create policy governance_receipt_insert on app_private.governance_command_receipts
  for insert to line_app with check (true);
create policy governance_audit_read on app_private.governance_audit_events
  for select to line_app using (true);
create policy governance_audit_insert on app_private.governance_audit_events
  for insert to line_app with check (true);


revoke all on app_private.organization_membership_sources from public, anon, authenticated, line_app;
grant select on app_private.organization_membership_sources to line_app;


revoke all on app_private.enterprise_user_affiliations from public, anon, authenticated, line_app;
grant select on app_private.enterprise_user_affiliations to line_app;


revoke all on app_private.repository_effective_access from public, anon, authenticated, line_app;
grant select on app_private.repository_effective_access to line_app;


revoke all on function app_private.reject_governance_history_mutation() from public, anon, authenticated, line_app;
revoke all on function app_private.protect_governance_account_identity() from public, anon, authenticated, line_app;
revoke all on function app_private.bootstrap_enterprise(text,text,text,text,text,text,text,uuid,bigint) from public, anon, authenticated, line_app;
revoke all on function app_private.bootstrap_organization(text,text,text,text,text,text,text,uuid,bigint) from public, anon, authenticated, line_app;
revoke all on function app_private.provision_enterprise_scope(text,text,text,text,bigint) from public, anon, authenticated, line_app;
grant execute on function app_private.provision_enterprise_scope(text,text,text,text,bigint) to line_app;
revoke all on function app_private.provision_organization_scope(text,text,text,text,bigint) from public, anon, authenticated, line_app;
grant execute on function app_private.provision_organization_scope(text,text,text,text,bigint) to line_app;
revoke all on function app_private.enforce_account_facet() from public, anon, authenticated, line_app;

revoke all on function app_private.protect_enterprise_organization_identity()
  from public, anon, authenticated, line_app;
grant execute on function app_private.protect_enterprise_organization_identity() to line_app;
revoke all on function app_private.protect_enterprise_team_identity()
  from public, anon, authenticated, line_app;
grant execute on function app_private.protect_enterprise_team_identity() to line_app;
revoke all on function app_private.refresh_organization_membership(text,text,bigint)
  from public, anon, authenticated, line_app;
grant execute on function app_private.refresh_organization_membership(text,text,bigint) to line_app;


revoke all on app_private.attendance_identity_bindings from public, anon, authenticated, line_app;
grant select on app_private.attendance_identity_bindings to line_app;


revoke all on app_private.permission_workplace_targets
  from public, anon, authenticated, line_app;
grant select on app_private.permission_workplace_targets to line_app;


revoke all on app_private.user_management_activity
  from public, anon, authenticated, line_app;
grant select on app_private.user_management_activity to line_app;


do $identity_access_projection_grants$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'identity_access_enterprise_scopes',
    'identity_access_enterprise_subjects',
    'identity_access_organization_scopes',
    'identity_access_organization_subjects',
    'identity_access_team_subjects'
  ] loop
    execute format('revoke all on app_private.%I from public, anon, authenticated, line_app', relation_name);
    execute format('grant select on app_private.%I to line_app', relation_name);
  end loop;
end
$identity_access_projection_grants$;

revoke all on function app_private.provision_repository(text,text,text,text,text)
  from public, anon, authenticated, line_app;
grant execute on function app_private.provision_repository(text,text,text,text,text) to line_app;
