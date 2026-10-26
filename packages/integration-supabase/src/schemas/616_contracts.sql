-- Contract owns engineering agreement heads, immutable revisions and exact command receipts.
create table app_private.engineering_contracts (
  id uuid primary key,
  repository_id text not null references app_private.repositories(id),
  version integer not null check(version > 0),
  head_revision_id uuid not null,
  unique(repository_id,id)
);

create table app_private.engineering_contract_revisions (
  id uuid primary key,
  contract_id uuid not null,
  repository_id text not null,
  version integer not null check(version > 0),
  parent_revision_id uuid,
  actor_user_id text not null references app_private.users(id),
  at bigint not null,
  action text not null check(action in ('create','edit','activate','close')),
  state text not null check(state in ('DRAFT','ACTIVE','CLOSED')),
  title text not null check(length(trim(title)) between 1 and 200),
  body text not null check(length(body) <= 262144),
  lines jsonb not null check(jsonb_typeof(lines)='array' and jsonb_array_length(lines) between 1 and 100),
  unique(repository_id,contract_id,id),
  unique(repository_id,contract_id,version,id),
  unique(repository_id,contract_id,id,state),
  unique(contract_id,version),
  foreign key(repository_id,contract_id) references app_private.engineering_contracts(repository_id,id),
  foreign key(repository_id,contract_id,parent_revision_id)
    references app_private.engineering_contract_revisions(repository_id,contract_id,id),
  check(
    (version=1 and parent_revision_id is null and action='create' and state='DRAFT')
    or
    (version>1 and parent_revision_id is not null and action<>'create')
  ),
  check(
    (action in ('create','edit') and state='DRAFT')
    or (action='activate' and state='ACTIVE')
    or (action='close' and state='CLOSED')
  )
);

alter table app_private.engineering_contracts add constraint engineering_contracts_head_fkey
  foreign key(repository_id,id,version,head_revision_id)
  references app_private.engineering_contract_revisions(repository_id,contract_id,version,id)
  deferrable initially deferred;

create table app_private.engineering_contract_commands (
  actor_user_id text not null references app_private.users(id),
  request_id uuid not null,
  repository_id text not null,
  contract_id uuid not null,
  fingerprint text not null,
  revision_id uuid not null,
  primary key(actor_user_id,request_id),
  foreign key(repository_id,contract_id,revision_id)
    references app_private.engineering_contract_revisions(repository_id,contract_id,id)
);

create index engineering_contracts_repository
  on app_private.engineering_contracts(repository_id,id);

alter table app_private.engineering_contracts enable row level security;
alter table app_private.engineering_contract_revisions enable row level security;
alter table app_private.engineering_contract_commands enable row level security;

revoke all on app_private.engineering_contracts,
  app_private.engineering_contract_revisions,
  app_private.engineering_contract_commands
  from public,anon,authenticated,line_app;

grant select,insert,update on app_private.engineering_contracts to line_app;
grant select,insert on app_private.engineering_contract_revisions,
  app_private.engineering_contract_commands to line_app;

create policy backend on app_private.engineering_contracts
  for all to line_app using(true) with check(true);
create policy backend_read on app_private.engineering_contract_revisions
  for select to line_app using(true);
create policy backend_insert on app_private.engineering_contract_revisions
  for insert to line_app with check(true);
create policy backend_read on app_private.engineering_contract_commands
  for select to line_app using(true);
create policy backend_insert on app_private.engineering_contract_commands
  for insert to line_app with check(true);
