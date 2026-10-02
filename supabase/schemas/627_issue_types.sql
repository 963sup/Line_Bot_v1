-- Issue-owned Organization-scoped IssueType definitions, current assignments and history.

create table app_private.issue_types (
  id text not null,
  organization_account_id text not null,
  name text not null,
  description text,
  color text not null,
  is_enabled boolean not null,
  deleted_at bigint,
  version integer not null,
  created_at bigint not null,
  updated_at bigint not null,
  constraint issue_types_pkey primary key (id),
  constraint issue_types_organization_fkey
    foreign key (organization_account_id) references app_private.organizations(account_id),
  constraint issue_types_name_check check (
    name=btrim(name) and length(name) between 1 and 120
  ),
  constraint issue_types_description_check check (
    description is null or length(description) <= 2000
  ),
  constraint issue_types_color_check check (
    color in ('BLUE','GRAY','GREEN','ORANGE','PINK','PURPLE','RED','YELLOW')
  ),
  constraint issue_types_deleted_check check (deleted_at is null or is_enabled=false),
  constraint issue_types_version_check check (version > 0),
  constraint issue_types_time_check check (
    created_at <= updated_at
    and (deleted_at is null or (deleted_at >= created_at and deleted_at <= updated_at))
  )
);
create unique index issue_types_organization_name
  on app_private.issue_types(organization_account_id,lower(name))
  where deleted_at is null;
create index issue_types_organization_enabled
  on app_private.issue_types(organization_account_id,is_enabled,id)
  where deleted_at is null;

create table app_private.issue_type_assignments (
  issue_id text not null,
  issue_type_id text not null,
  assigned_by text not null,
  assigned_at bigint not null,
  constraint issue_type_assignments_pkey primary key (issue_id),
  constraint issue_type_assignments_issue_fkey
    foreign key (issue_id) references app_private.issues(id),
  constraint issue_type_assignments_type_fkey
    foreign key (issue_type_id) references app_private.issue_types(id),
  constraint issue_type_assignments_actor_fkey
    foreign key (assigned_by) references app_private.users(id),
  constraint issue_type_assignments_time_check check (assigned_at >= 0)
);
create index issue_type_assignments_type
  on app_private.issue_type_assignments(issue_type_id,issue_id);
create index issue_type_assignments_actor
  on app_private.issue_type_assignments(assigned_by,assigned_at);

create table app_private.issue_type_events (
  issue_type_id text not null,
  version integer not null,
  actor text not null,
  action text not null,
  data jsonb not null,
  at bigint not null,
  constraint issue_type_events_pkey primary key (issue_type_id,version),
  constraint issue_type_events_type_fkey
    foreign key (issue_type_id) references app_private.issue_types(id),
  constraint issue_type_events_actor_fkey
    foreign key (actor) references app_private.users(id),
  constraint issue_type_events_data_check check (jsonb_typeof(data)='object'),
  constraint issue_type_events_time_check check (at >= 0)
);
create index issue_type_events_actor on app_private.issue_type_events(actor,at);

alter table app_private.issue_types enable row level security;
alter table app_private.issue_type_assignments enable row level security;
alter table app_private.issue_type_events enable row level security;

revoke all on app_private.issue_types from public, anon, authenticated, line_app;
revoke all on app_private.issue_type_assignments from public, anon, authenticated, line_app;
revoke all on app_private.issue_type_events from public, anon, authenticated, line_app;

grant select on app_private.issue_types to line_app;
grant insert (
  id,
  organization_account_id,
  name,
  description,
  color,
  is_enabled,
  version,
  created_at,
  updated_at
) on app_private.issue_types to line_app;
grant update (
  name,
  description,
  color,
  is_enabled,
  deleted_at,
  version,
  updated_at
) on app_private.issue_types to line_app;

grant select on app_private.issue_type_assignments to line_app;
grant insert (
  issue_id,
  issue_type_id,
  assigned_by,
  assigned_at
) on app_private.issue_type_assignments to line_app;
grant update (
  issue_type_id,
  assigned_by,
  assigned_at
) on app_private.issue_type_assignments to line_app;
grant delete on app_private.issue_type_assignments to line_app;

grant select on app_private.issue_type_events to line_app;
grant insert (
  issue_type_id,
  version,
  actor,
  action,
  data,
  at
) on app_private.issue_type_events to line_app;

create policy backend on app_private.issue_types
  for all to line_app using (true) with check (true);
create policy backend on app_private.issue_type_assignments
  for all to line_app using (true) with check (true);
create policy backend on app_private.issue_type_events
  for all to line_app using (true) with check (true);

create function app_private.enforce_issue_type_assignment_state()
returns trigger
language plpgsql
security invoker
set search_path to 'app_private', 'pg_catalog'
as $function$
begin
  if not exists (
    select 1
    from app_private.issue_types t
    where t.id=new.issue_type_id and t.deleted_at is null and t.is_enabled
  ) then
    raise exception 'issue_type_assignment_type_unavailable' using errcode='23514';
  end if;
  return new;
end
$function$;
revoke all on function app_private.enforce_issue_type_assignment_state()
  from public, anon, authenticated, line_app;
grant execute on function app_private.enforce_issue_type_assignment_state() to line_app;
create trigger issue_type_assignment_state_guard
before insert or update on app_private.issue_type_assignments
for each row execute function app_private.enforce_issue_type_assignment_state();

create function app_private.protect_issue_type_tombstone()
returns trigger
language plpgsql
security invoker
set search_path to 'app_private', 'pg_catalog'
as $function$
begin
  if old.deleted_at is not null then
    raise exception 'issue_type_deleted_immutable' using errcode='23514';
  end if;
  if new.deleted_at is not null and exists (
    select 1 from app_private.issue_type_assignments a where a.issue_type_id=old.id
  ) then
    raise exception 'issue_type_still_assigned' using errcode='23514';
  end if;
  return new;
end
$function$;
revoke all on function app_private.protect_issue_type_tombstone()
  from public, anon, authenticated, line_app;
grant execute on function app_private.protect_issue_type_tombstone() to line_app;
create trigger issue_type_tombstone_guard
before update on app_private.issue_types
for each row execute function app_private.protect_issue_type_tombstone();
