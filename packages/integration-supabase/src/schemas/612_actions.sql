-- Actions owns fixed business automation definitions and durable execution.
create table app_private.action_rules (
 id uuid primary key, repository_id text not null references app_private.repositories(id), version integer not null check(version>0),
 unique(repository_id,id)
);
create table app_private.action_rule_versions (
 rule_id uuid not null references app_private.action_rules(id), version integer not null check(version>0), snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
 primary key(rule_id,version)
);
create table app_private.action_events (
 id uuid primary key, repository_id text not null references app_private.repositories(id), at bigint not null
);
create table app_private.action_runs (
 id uuid primary key, repository_id text not null, rule_id uuid not null, rule_version integer not null,
 rule_snapshot jsonb not null check(jsonb_typeof(rule_snapshot)='object'), revision_id uuid not null, baseline_id uuid,
 source_event_id uuid references app_private.action_events(id),
 status text not null check(status in ('queued','running','waiting','succeeded','failed','cancelled')),
 version integer not null check(version>0), step integer not null check(step>=0), attempt integer not null check(attempt>=0),
 available_at bigint not null, created_at bigint not null, results jsonb not null check(jsonb_typeof(results)='array'),
 lease_token uuid, lease_until bigint,
 foreign key(repository_id,rule_id) references app_private.action_rules(repository_id,id),
 foreign key(rule_id,rule_version) references app_private.action_rule_versions(rule_id,version),
 foreign key(repository_id,revision_id) references app_private.repository_wbs_revisions(repository_id,id),
 foreign key(repository_id,baseline_id) references app_private.repository_wbs_baselines(repository_id,id),
 unique(rule_id,source_event_id), check((lease_token is null)=(lease_until is null))
);
create index action_runs_pending on app_private.action_runs(available_at,id) where status in ('queued','waiting','running');
create table app_private.action_attempts (
 run_id uuid not null references app_private.action_runs(id), number integer not null check(number>0), lease_token uuid not null unique,
 started_at bigint not null, finished_at bigint, result jsonb, primary key(run_id,number)
);
create table app_private.action_commands (
 actor text not null references app_private.users(id), request_id uuid not null, fingerprint text not null, result jsonb not null, at bigint not null,
 primary key(actor,request_id)
);
alter table app_private.action_rules enable row level security;
alter table app_private.action_rule_versions enable row level security;
alter table app_private.action_events enable row level security;
alter table app_private.action_runs enable row level security;
alter table app_private.action_attempts enable row level security;
alter table app_private.action_commands enable row level security;
revoke all on app_private.action_rules,app_private.action_rule_versions,app_private.action_events,app_private.action_runs,app_private.action_attempts,app_private.action_commands from public,anon,authenticated,line_app;
grant select,insert,update on app_private.action_rules,app_private.action_runs,app_private.action_attempts to line_app;
grant select,insert on app_private.action_rule_versions,app_private.action_events,app_private.action_commands to line_app;
create policy backend on app_private.action_rules to line_app
  using(not app_private.wbs_scope_transfer_blocks_repository(repository_id))
  with check(not app_private.wbs_scope_transfer_blocks_repository(repository_id));
create policy backend on app_private.action_rule_versions to line_app using(
  exists(
    select 1 from app_private.action_rules rule
    where rule.id=rule_id
      and not app_private.wbs_scope_transfer_blocks_repository(rule.repository_id)
  )
) with check(
  exists(
    select 1 from app_private.action_rules rule
    where rule.id=rule_id
      and not app_private.wbs_scope_transfer_blocks_repository(rule.repository_id)
  )
);
create policy backend on app_private.action_events to line_app
  using(not app_private.wbs_scope_transfer_blocks_repository(repository_id))
  with check(not app_private.wbs_scope_transfer_blocks_repository(repository_id));
create policy backend on app_private.action_runs to line_app
  using(not app_private.wbs_scope_transfer_blocks_repository(repository_id))
  with check(not app_private.wbs_scope_transfer_blocks_repository(repository_id));
create policy backend on app_private.action_attempts to line_app using(
  exists(
    select 1 from app_private.action_runs run
    where run.id=run_id
      and not app_private.wbs_scope_transfer_blocks_repository(run.repository_id)
  )
) with check(
  exists(
    select 1 from app_private.action_runs run
    where run.id=run_id
      and not app_private.wbs_scope_transfer_blocks_repository(run.repository_id)
  )
);
create policy backend on app_private.action_commands to line_app using(true) with check(true);

create or replace function app_private.reject_active_repository_action_write()
returns trigger
language plpgsql
security invoker
set search_path to 'pg_catalog'
as $function$
declare
  source_repository_id text;
begin
  if tg_table_name in ('action_rules','action_events','action_runs') then
    source_repository_id := coalesce(new.repository_id,old.repository_id);
  elsif tg_table_name='action_rule_versions' then
    select repository_id into source_repository_id
      from app_private.action_rules where id=coalesce(new.rule_id,old.rule_id);
  elsif tg_table_name='action_attempts' then
    select repository_id into source_repository_id
      from app_private.action_runs where id=coalesce(new.run_id,old.run_id);
  end if;
  if current_user='line_app'
     and source_repository_id is not null
     and app_private.wbs_scope_transfer_blocks_repository(source_repository_id) then
    raise exception 'repository_wbs_transferred' using errcode='55000';
  end if;
  return coalesce(new,old);
end
$function$;
revoke all on function app_private.reject_active_repository_action_write()
  from public,anon,authenticated,line_app;
grant execute on function app_private.reject_active_repository_action_write() to line_app;
create trigger action_rules_wbs_transfer_fence before insert or update or delete on app_private.action_rules for each row execute function app_private.reject_active_repository_action_write();
create trigger action_rule_versions_wbs_transfer_fence before insert or update or delete on app_private.action_rule_versions for each row execute function app_private.reject_active_repository_action_write();
create trigger action_events_wbs_transfer_fence before insert or update or delete on app_private.action_events for each row execute function app_private.reject_active_repository_action_write();
create trigger action_runs_wbs_transfer_fence before insert or update or delete on app_private.action_runs for each row execute function app_private.reject_active_repository_action_write();
create trigger action_attempts_wbs_transfer_fence before insert or update or delete on app_private.action_attempts for each row execute function app_private.reject_active_repository_action_write();
