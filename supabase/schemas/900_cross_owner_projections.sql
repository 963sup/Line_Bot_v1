-- Read-only cross-context projections; no mutation authority originates here.

-- Account lifecycle plus Namespace locator and optional Google identity for Account-owned reads.
create view app_private.user_namespace_projection
with (security_invoker = true)
as
select
  u.id,
  u.status,
  u."createdAt" as "createdAt",
  l.login,
  g.email as google_email
from app_private.users u
join app_private.account_logins l
  on l.account_id=u.id and l.account_kind='USER'
left join app_private.user_identities g
  on g.user_id=u.id and g.provider='google';
revoke all on app_private.user_namespace_projection from public, anon, authenticated, line_app;
grant select on app_private.user_namespace_projection to line_app;

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


-- Team hierarchy derives effective membership without copying TeamMembership truth.
-- A direct membership is IMMEDIATE in its source Team and CHILD_TEAM in every ancestor Team.
-- source_team_id/depth preserve provenance when one User reaches an ancestor through multiple paths.
create view app_private.team_effective_memberships
with (security_invoker = true)
as
with recursive hierarchy(team_id, source_team_id, organization_account_id, depth) as (
  select t.id, t.id, t.organization_account_id, 0
  from app_private.teams t
  union all
  select parent.id, h.source_team_id, h.organization_account_id, h.depth + 1
  from hierarchy h
  join app_private.teams current_team
    on current_team.id = h.team_id
      and current_team.organization_account_id = h.organization_account_id
  join app_private.teams parent
    on parent.id = current_team.parent_team_id
      and parent.organization_account_id = h.organization_account_id
)
select
  h.team_id,
  tm.user_id,
  case when h.depth = 0 then 'IMMEDIATE'::text else 'CHILD_TEAM'::text end as membership_type,
  h.source_team_id,
  tm.version as source_membership_version,
  h.depth
from hierarchy h
join app_private.team_memberships tm
  on tm.team_id = h.source_team_id
    and tm.status = 'active';


-- Repository Team grants consume effective Team membership but retain both the grant Team and
-- the direct membership source. Revoking one hierarchy/membership source therefore removes only
-- that source row; any independent source remains available to the aggregate access projection.
create view app_private.repository_team_effective_access_sources
with (security_invoker = true)
as
select
  a.repository_id,
  em.user_id,
  a.team_id as grant_team_id,
  em.source_team_id,
  em.membership_type,
  em.depth,
  a.capability as permission,
  a.version as grant_version,
  em.source_membership_version
from app_private.repository_team_access a
join app_private.repositories r
  on r.id = a.repository_id
    and r.owner_account_kind = 'ORGANIZATION'
    and r.owner_account_id = a.organization_id
join app_private.organizations o
  on o.account_id = a.organization_id
    and o.status = 'active'
join app_private.teams grant_team
  on grant_team.id = a.team_id
    and grant_team.organization_account_id = a.organization_id
join app_private.team_effective_memberships em
  on em.team_id = a.team_id
join app_private.organization_memberships om
  on om.organization_account_id = a.organization_id
    and om.user_id = em.user_id
    and om.status = 'active'
join app_private.users u
  on u.id = em.user_id
    and u.status = 'active';


-- Repository grants remain owner-local facts. This projection resolves current effective
-- User access from a User-owned Repository, explicit User grants and Organization Team grants
-- without transferring TeamMembership authority into Repository.
create view app_private.repository_effective_access
with (security_invoker = true)
as
with candidate_permissions as (
  -- A User-owned Repository has implicit ADMIN permission for its current active owner.
  select
    r.id as repository_id,
    r.owner_account_id as user_id,
    'admin'::text as permission
  from app_private.repositories r
  join app_private.users owner_user
    on owner_user.id = r.owner_account_id
      and owner_user.status = 'active'
  where r.owner_account_kind = 'USER'

  union all

  -- Direct Repository grants retain their exact RepositoryPermission value. Organization
  -- membership may classify the collaborator, but never rewrites or ranks this permission.
  select
    a.repository_id,
    a.principal_id as user_id,
    a.capability as permission
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
  where
    (r.owner_account_kind = 'USER' and owner_user.status = 'active')
    or
    (
      r.owner_account_kind = 'ORGANIZATION'
      and owner_organization.status = 'active'
    )

  union all

  -- Team grants consume traceable effective membership sources; hierarchy alone never grants
  -- Repository access unless the ancestor Team itself has an explicit Repository grant.
  select
    s.repository_id,
    s.user_id,
    s.permission
  from app_private.repository_team_effective_access_sources s
)
select
  repository_id,
  user_id,
  array_agg(distinct permission order by permission) as permissions
from candidate_permissions
group by repository_id, user_id;


-- INTERNAL Repository visibility consumes the one active Enterprise attachment of the owner
-- Organization without transferring Enterprise authority into Repository.
create view app_private.repository_internal_scopes
with (security_invoker = true)
as
select
  eo.organization_account_id,
  eo.enterprise_account_id
from app_private.enterprise_organizations eo
join app_private.organizations o
  on o.account_id=eo.organization_account_id
 and o.status='active'
join app_private.enterprises e
  on e.account_id=eo.enterprise_account_id
 and e.status='active'
where eo.status='active';


-- Visibility is read authority, not RepositoryPermission. PUBLIC contributes one anonymous row;
-- INTERNAL contributes current active Users in the active Enterprise attached to the owner
-- Organization; EXPLICIT preserves existing grant-derived users. Consumers use EXISTS so
-- multiple independent read sources never duplicate Repository content.
create view app_private.repository_visibility_access
with (security_invoker = true)
as
select
  a.repository_id,
  a.user_id,
  'EXPLICIT'::text as source_kind
from app_private.repository_effective_access a

union all

select
  r.id as repository_id,
  null::text as user_id,
  'PUBLIC'::text as source_kind
from app_private.repositories r
left join app_private.users owner_user
  on r.owner_account_kind='USER'
 and owner_user.id=r.owner_account_id
left join app_private.organizations owner_organization
  on r.owner_account_kind='ORGANIZATION'
 and owner_organization.account_id=r.owner_account_id
where r.visibility='public'
  and (
    (r.owner_account_kind='USER' and owner_user.status='active')
    or
    (r.owner_account_kind='ORGANIZATION' and owner_organization.status='active')
  )

union all

select distinct
  r.id as repository_id,
  a.user_id,
  'INTERNAL'::text as source_kind
from app_private.repositories r
join app_private.repository_internal_scopes scope
  on r.owner_account_kind='ORGANIZATION'
 and scope.organization_account_id=r.owner_account_id
join app_private.enterprise_user_affiliations a
  on a.enterprise_account_id=scope.enterprise_account_id
join app_private.users u
  on u.id=a.user_id
 and u.status='active'
where r.visibility='internal';


-- Project keeps the authoritative Repository reference; this projection applies the referenced
-- Repository's current read visibility without copying Repository access into Project.
create view app_private.project_repository_visible_references
with (security_invoker = true)
as
select distinct
  ref.project_id,
  ref.repository_id,
  ref.position,
  ref.version,
  visibility.user_id
from app_private.project_repository_references ref
join app_private.repository_visibility_access visibility
  on visibility.repository_id=ref.repository_id;


-- Notifications references Issue/Discussion source facts but must recheck the source
-- Repository's current read visibility for the recipient. NULL user_id represents PUBLIC.
create view app_private.notification_repository_source_access
with (security_invoker = true)
as
select distinct
  'issue'::text as source_type,
  issue.id as source_id,
  visibility.user_id
from app_private.issues issue
join app_private.repository_visibility_access visibility
  on visibility.repository_id=issue.repository_id

union

select distinct
  'discussion'::text as source_type,
  discussion.id as source_id,
  visibility.user_id
from app_private.discussions discussion
join app_private.repository_visibility_access visibility
  on visibility.repository_id=discussion.repository_id;


-- Organization collaborator affiliation is a rebuildable projection over Repository-owned direct
-- grants plus current Account/Organization qualification. Every row has DIRECT grant provenance;
-- is_outside is the current membership classification, not a second authorization fact.
create view app_private.organization_repository_collaborators
with (security_invoker = true)
as
select
  r.owner_account_id as organization_account_id,
  a.repository_id,
  a.principal_id as user_id,
  'DIRECT'::text as grant_affiliation,
  (om.user_id is null) as is_outside,
  om.version as organization_membership_version,
  a.capability,
  a.version as grant_version
from app_private.repository_access a
join app_private.repositories r
  on r.id = a.repository_id
 and r.owner_account_kind = 'ORGANIZATION'
join app_private.organizations o
  on o.account_id = r.owner_account_id
 and o.status = 'active'
join app_private.users u
  on u.id = a.principal_id
 and u.status = 'active'
left join app_private.organization_memberships om
  on om.organization_account_id = r.owner_account_id
 and om.user_id = a.principal_id
 and om.status = 'active';


-- Enterprise outside-collaborator visibility is derived from active Enterprise→Organization
-- attachment plus the traceable Repository direct grant. It creates no Collaborator identity.
create view app_private.enterprise_repository_outside_collaborators
with (security_invoker = true)
as
select
  eo.enterprise_account_id,
  c.organization_account_id,
  c.repository_id,
  c.user_id,
  'OUTSIDE'::text as collaborator_affiliation,
  c.capability,
  c.grant_version
from app_private.organization_repository_collaborators c
join app_private.enterprise_organizations eo
  on eo.organization_account_id = c.organization_account_id
 and eo.status = 'active'
join app_private.enterprises e
  on e.account_id = eo.enterprise_account_id
 and e.status = 'active'
where c.is_outside;


-- Attendance consumes current Account qualification through an explicit read-only projection.
create view app_private.attendance_identity_bindings
with (security_invoker = true)
as
select u.id as user_id,u.auth_user_id,i.provider,i.subject
from app_private.users u
join app_private.user_identities i on i.user_id=u.id
where u.status='active';




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
  a.user_id,
  'unfinished-issue'::text as activity_kind,
  i.id::text as item_id
from app_private.issue_assignees a
join app_private.issues i on i.id=a.issue_id
where i.state='OPEN'
  and i.workflow_status <> 'completed';


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
