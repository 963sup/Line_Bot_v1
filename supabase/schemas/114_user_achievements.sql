-- User achievements are earned facts backed by source evidence.
-- Definitions are product configuration; awards are immutable recognition records.

create table app_private.achievement_definitions (
  id text primary key,
  name text not null,
  description text not null,
  icon_ref text,
  status text not null default 'active',
  version integer not null default 1,
  created_at bigint not null,
  constraint achievement_definitions_name_check check (length(btrim(name)) between 1 and 120),
  constraint achievement_definitions_description_check check (length(btrim(description)) between 1 and 2000),
  constraint achievement_definitions_status_check check (status in ('draft', 'active', 'retired')),
  constraint achievement_definitions_version_check check (version > 0)
);
alter table app_private.achievement_definitions enable row level security;
revoke all on app_private.achievement_definitions from public, anon, authenticated, line_app;
grant insert, select, update on app_private.achievement_definitions to line_app;
create policy "backend" on app_private.achievement_definitions as permissive for all to line_app using (true) with check (true);

create table app_private.user_achievements (
  user_id text not null references app_private.users(id),
  achievement_id text not null references app_private.achievement_definitions(id),
  source_kind text not null,
  source_id text not null,
  source_version integer not null,
  visibility text not null default 'public',
  awarded_at bigint not null,
  evidence jsonb not null default '{}'::jsonb,
  primary key (user_id, achievement_id),
  constraint user_achievements_source_kind_check check (source_kind in ('repository', 'issue', 'discussion', 'project', 'attendance', 'expense', 'system')),
  constraint user_achievements_source_version_check check (source_version > 0),
  constraint user_achievements_visibility_check check (visibility in ('private', 'organization', 'public')),
  constraint user_achievements_evidence_object_check check (jsonb_typeof(evidence) = 'object')
);
alter table app_private.user_achievements enable row level security;
revoke all on app_private.user_achievements from public, anon, authenticated, line_app;
grant insert, select, update on app_private.user_achievements to line_app;
create policy "backend" on app_private.user_achievements as permissive for all to line_app using (true) with check (true);
create index user_achievements_user_awarded on app_private.user_achievements(user_id, awarded_at desc);
create index user_achievements_source on app_private.user_achievements(source_kind, source_id, source_version);

create table app_private.user_contribution_days (
  user_id text not null references app_private.users(id),
  day text not null,
  contribution_count integer not null default 0,
  source_version integer not null,
  updated_at bigint not null,
  primary key (user_id, day),
  constraint user_contribution_days_day_check check (day ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  constraint user_contribution_days_count_check check (contribution_count >= 0),
  constraint user_contribution_days_version_check check (source_version > 0)
);
alter table app_private.user_contribution_days enable row level security;
revoke all on app_private.user_contribution_days from public, anon, authenticated, line_app;
grant insert, select, update on app_private.user_contribution_days to line_app;
create policy "backend" on app_private.user_contribution_days as permissive for all to line_app using (true) with check (true);
create index user_contribution_days_lookup on app_private.user_contribution_days(user_id, day desc);
