-- Read-only cross-context projections; no mutation authority originates here.

-- Effective Organization membership can have one direct source and multiple Enterprise Team sources.
create view app_private.organization_membership_sources
with (security_invoker = true)
as
select
  d.organization_account_id,
  d.user_id,
  'direct'::text as source_kind,
  d.organization_account_id as source_id,
  d.version as source_version
from app_private.organization_direct_memberships d
where d.status = 'active'
union all
select
  eto.organization_account_id,
  etm.user_id,
  'enterprise-team'::text as source_kind,
  etm.team_id as source_id,
  greatest(etm.version, eto.version) as source_version
from app_private.enterprise_team_organizations eto
join app_private.enterprise_organizations eo
  on eo.enterprise_account_id=eto.enterprise_account_id
    and eo.organization_account_id=eto.organization_account_id
    and eo.status='active'
join app_private.enterprise_team_memberships etm
  on etm.team_id = eto.team_id
    and etm.enterprise_account_id = eto.enterprise_account_id
    and etm.status = 'active'
where eto.status = 'active';


-- Enterprise users are an effective population, not a synonym for direct affiliation.
-- A user can participate directly or through an attached Organization.
create view app_private.enterprise_user_affiliations
with (security_invoker = true)
as
select
  a.enterprise_account_id,
  a.user_id,
  'direct'::text as source_kind,
  a.enterprise_account_id as source_id,
  a.version as source_version
from app_private.enterprise_direct_affiliations a
where a.status = 'active'
union all
select
  eo.enterprise_account_id,
  om.user_id,
  'organization'::text as source_kind,
  eo.organization_account_id as source_id,
  om.version as source_version
from app_private.enterprise_organizations eo
join app_private.organizations o
  on o.account_id = eo.organization_account_id and o.status = 'active'
join app_private.organization_memberships om
  on om.organization_account_id = eo.organization_account_id and om.status = 'active'
where eo.status = 'active';


-- Repository grants remain owner-local facts. This projection resolves current effective
-- User access from a User-owned Repository, explicit User grants and Organization Team grants
-- without transferring TeamMembership authority into Repository.
create view app_private.repository_effective_access
with (security_invoker = true)
as
with candidate_access as (
  -- A User-owned Repository is always administrable by its current active owner.
  select
    r.id as repository_id,
    r.owner_account_id as user_id,
    4 as capability_rank
  from app_private.repositories r
  join app_private.users owner_user
    on owner_user.id = r.owner_account_id
      and owner_user.status = 'active'
  where r.owner_account_kind = 'USER'

  union all

  -- Direct grants remain valid only while the principal and owning scope are current.
  select
    a.repository_id,
    a.principal_id as user_id,
    case a.capability
      when 'read' then 1
      when 'triage' then 2
      when 'write' then 3
      when 'admin' then 4
    end as capability_rank
  from app_private.repository_access a
  join app_private.repositories r
    on r.id = a.repository_id
  join app_private.users principal
    on principal.id = a.principal_id
      and principal.status = 'active'
  left join app_private.users owner_user
    on r.owner_account_kind = 'USER'
      and owner_user.id = r.owner_account_id
  left join app_private.organizations owner_organization
    on r.owner_account_kind = 'ORGANIZATION'
      and owner_organization.account_id = r.owner_account_id
  left join app_private.organization_memberships om
    on r.owner_account_kind = 'ORGANIZATION'
      and om.organization_account_id = r.owner_account_id
      and om.user_id = a.principal_id
      and om.status = 'active'
  where
    (r.owner_account_kind = 'USER' and owner_user.status = 'active')
    or
    (
      r.owner_account_kind = 'ORGANIZATION'
      and owner_organization.status = 'active'
      and om.user_id is not null
    )

  union all

  -- Organization Team grants are valid only for Organization-owned repositories in the same scope.
  select
    a.repository_id,
    tm.user_id,
    case a.capability
      when 'read' then 1
      when 'triage' then 2
      when 'write' then 3
      when 'admin' then 4
    end as capability_rank
  from app_private.repository_team_access a
  join app_private.repositories r
    on r.id = a.repository_id
      and r.owner_account_kind = 'ORGANIZATION'
      and r.owner_account_id = a.organization_id
  join app_private.organizations o
    on o.account_id = a.organization_id
      and o.status = 'active'
  join app_private.teams t
    on t.id = a.team_id
      and t.organization_account_id = a.organization_id
  join app_private.team_memberships tm
    on tm.team_id = a.team_id
      and tm.status = 'active'
  join app_private.organization_memberships om
    on om.organization_account_id = a.organization_id
      and om.user_id = tm.user_id
      and om.status = 'active'
  join app_private.users u
    on u.id = tm.user_id
      and u.status = 'active'
)
select
  repository_id,
  user_id,
  case max(capability_rank)
    when 1 then 'read'::text
    when 2 then 'triage'::text
    when 3 then 'write'::text
    when 4 then 'admin'::text
  end as capability
from candidate_access
group by repository_id, user_id;


-- Attendance consumes current Account qualification through an explicit read-only projection.
create view app_private.attendance_identity_bindings
with (security_invoker = true)
as
select u.id as user_id,u.auth_user_id,i.provider,i.subject
from app_private.users u
join app_private.user_identities i on i.user_id=u.id
where u.status='active';


-- Identity/Access may display and validate Workplace-scoped permission targets,
-- but Attendance keeps Workplace authority.
create view app_private.permission_workplace_targets
with (security_invoker = true)
as
select id,name
from app_private.workplaces;


-- Account management displays operational blockers without acquiring Attendance or Repository authority.
create view app_private.user_management_activity
with (security_invoker = true)
as
select
  s.uid as user_id,
  'open-attendance'::text as activity_kind,
  s.id::text as item_id
from app_private.attendance_sessions s
where s.ended_at is null
union all
select
  i.assignee as user_id,
  'unfinished-issue'::text as activity_kind,
  i.id::text as item_id
from app_private.issues i
where i.status <> 'completed';


-- Identity/Access qualification read models. These expose only scope/membership/affiliation
-- facts required to validate RoleAssignment effectiveness; they own no authority.
create view app_private.identity_access_enterprise_scopes
with (security_invoker = true)
as
select account_id,status,version
from app_private.enterprises;

create view app_private.identity_access_enterprise_subjects
with (security_invoker = true)
as
select
  a.enterprise_account_id,
  a.user_id,
  a.status as affiliation_status,
  a.version as affiliation_version,
  u.status as user_status,
  u.status_version as user_status_version
from app_private.enterprise_direct_affiliations a
join app_private.users u on u.id=a.user_id;

create view app_private.identity_access_organization_scopes
with (security_invoker = true)
as
select account_id,status,version
from app_private.organizations;

create view app_private.identity_access_organization_subjects
with (security_invoker = true)
as
select
  m.organization_account_id,
  m.user_id,
  m.status as membership_status,
  m.version as membership_version,
  u.status as user_status,
  u.status_version as user_status_version
from app_private.organization_memberships m
join app_private.users u on u.id=m.user_id;

create view app_private.identity_access_team_subjects
with (security_invoker = true)
as
select
  t.id as team_id,
  t.organization_account_id,
  m.user_id,
  m.status as team_membership_status,
  m.version as team_membership_version,
  u.status as user_status,
  u.status_version as user_status_version,
  o.status as organization_status,
  om.status as organization_membership_status
from app_private.teams t
join app_private.team_memberships m on m.team_id=t.id
join app_private.users u on u.id=m.user_id
join app_private.organizations o on o.account_id=t.organization_account_id
join app_private.organization_memberships om
  on om.organization_account_id=t.organization_account_id
 and om.user_id=m.user_id;
