-- Execution owns engineering report heads, immutable revisions and exact command receipts.
create table app_private.engineering_executions (
  id uuid primary key,
  repository_id text not null references app_private.repositories(id),
  contract_id uuid not null,
  version integer not null check(version>0),
  head_revision_id uuid not null,
  unique(repository_id,id),
  unique(repository_id,id,contract_id)
);

create table app_private.engineering_execution_revisions (
  id uuid primary key,
  execution_id uuid not null,
  repository_id text not null,
  version integer not null check(version>0),
  parent_revision_id uuid,
  actor_user_id text not null references app_private.users(id),
  at bigint not null,
  action text not null check(action in ('submit','accept','reject','void')),
  state text not null check(state in ('SUBMITTED','ACCEPTED','REJECTED','VOIDED')),
  contract_id uuid not null,
  contract_revision_id uuid not null,
  contract_revision_state text not null check(contract_revision_state='ACTIVE'),
  line_id uuid not null,
  basis jsonb not null check(jsonb_typeof(basis)='object'),
  quantity text not null check(
    quantity ~ '^(0|[1-9][0-9]{0,14})(\.[0-9]{1,3})?$' and quantity::numeric>0
  ),
  note text not null check(length(note)<=2000),
  reason text check(
    reason is null or (reason=trim(reason) and length(reason) between 1 and 2000)
  ),
  unique(repository_id,execution_id,id),
  unique(repository_id,execution_id,version,id),
  unique(execution_id,version),
  foreign key(repository_id,execution_id,contract_id)
    references app_private.engineering_executions(repository_id,id,contract_id),
  foreign key(repository_id,execution_id,parent_revision_id)
    references app_private.engineering_execution_revisions(repository_id,execution_id,id),
  foreign key(repository_id,contract_id,contract_revision_id,contract_revision_state)
    references app_private.engineering_contract_revisions(repository_id,contract_id,id,state),
  check(
    (version=1 and parent_revision_id is null and action='submit' and state='SUBMITTED' and reason is null) or
    (version>1 and parent_revision_id is not null and (
      (action='accept' and state='ACCEPTED' and reason is null) or
      (action='reject' and state='REJECTED' and reason is not null) or
      (action='void' and state='VOIDED' and reason is not null)
    ))
  ),
  check((
    basis->>'contractId'=contract_id::text and
    basis->>'contractRevisionId'=contract_revision_id::text and
    basis->>'lineId'=line_id::text
  ) is true)
);

alter table app_private.engineering_executions add constraint engineering_executions_head_fkey
  foreign key(repository_id,id,version,head_revision_id)
  references app_private.engineering_execution_revisions(repository_id,execution_id,version,id)
  deferrable initially deferred;

create table app_private.engineering_execution_commands (
  actor_user_id text not null references app_private.users(id),
  request_id uuid not null,
  repository_id text not null,
  execution_id uuid not null,
  fingerprint text not null,
  revision_id uuid not null,
  primary key(actor_user_id,request_id),
  foreign key(repository_id,execution_id,revision_id)
    references app_private.engineering_execution_revisions(repository_id,execution_id,id)
);

create index engineering_executions_repository_contract
  on app_private.engineering_executions(repository_id,contract_id,id);
create index engineering_execution_revisions_source
  on app_private.engineering_execution_revisions(repository_id,contract_id,contract_revision_id,contract_revision_state);
create index engineering_execution_revisions_parent
  on app_private.engineering_execution_revisions(repository_id,execution_id,parent_revision_id);
create index engineering_execution_commands_revision
  on app_private.engineering_execution_commands(repository_id,execution_id,revision_id);

alter table app_private.engineering_executions enable row level security;
alter table app_private.engineering_execution_revisions enable row level security;
alter table app_private.engineering_execution_commands enable row level security;
revoke all on app_private.engineering_executions,app_private.engineering_execution_revisions,app_private.engineering_execution_commands from public,anon,authenticated,line_app;
grant select,insert,update on app_private.engineering_executions to line_app;
grant select,insert on app_private.engineering_execution_revisions,app_private.engineering_execution_commands to line_app;
create policy backend on app_private.engineering_executions for all to line_app using(true) with check(true);
create policy backend_read on app_private.engineering_execution_revisions for select to line_app using(true);
create policy backend_insert on app_private.engineering_execution_revisions for insert to line_app with check(true);
create policy backend_read on app_private.engineering_execution_commands for select to line_app using(true);
create policy backend_insert on app_private.engineering_execution_commands for insert to line_app with check(true);
