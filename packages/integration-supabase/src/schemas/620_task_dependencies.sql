-- Execution owns versioned prerequisite graphs for exact Content plan revisions.
alter table app_private.engineering_execution_revisions
  add constraint engineering_execution_revisions_content_plan_fkey
  foreign key(repository_id,plan_revision_id)
  references app_private.content_plan_revisions(repository_id,id);

create table app_private.execution_task_dependencies (
  repository_id text not null,
  plan_revision_id uuid not null,
  version integer not null check(version>0),
  head_revision_id uuid not null,
  primary key(repository_id,plan_revision_id),
  unique(repository_id,plan_revision_id,version,head_revision_id),
  foreign key(repository_id,plan_revision_id)
    references app_private.content_plan_revisions(repository_id,id)
);

create table app_private.execution_task_dependency_revisions (
  id uuid primary key,
  repository_id text not null,
  plan_revision_id uuid not null,
  version integer not null check(version>0),
  parent_revision_id uuid,
  actor_user_id text not null references app_private.users(id),
  at bigint not null,
  edges jsonb not null check(
    jsonb_typeof(edges)='array' and jsonb_array_length(edges)<=1000
  ),
  unique(repository_id,plan_revision_id,id),
  unique(repository_id,plan_revision_id,version,id),
  unique(repository_id,plan_revision_id,version),
  foreign key(repository_id,plan_revision_id)
    references app_private.execution_task_dependencies(repository_id,plan_revision_id),
  foreign key(repository_id,plan_revision_id,parent_revision_id)
    references app_private.execution_task_dependency_revisions(repository_id,plan_revision_id,id),
  check(
    (version=1 and parent_revision_id is null) or
    (version>1 and parent_revision_id is not null)
  )
);

alter table app_private.execution_task_dependencies
  add constraint execution_task_dependencies_head_fkey
  foreign key(repository_id,plan_revision_id,version,head_revision_id)
  references app_private.execution_task_dependency_revisions(
    repository_id,plan_revision_id,version,id
  ) deferrable initially deferred;

alter table app_private.engineering_execution_revisions
  add constraint engineering_execution_revisions_dependency_fkey
  foreign key(repository_id,plan_revision_id,dependency_revision_id)
  references app_private.execution_task_dependency_revisions(
    repository_id,plan_revision_id,id
  );

create table app_private.execution_task_dependency_commands (
  actor_user_id text not null references app_private.users(id),
  request_id uuid not null,
  repository_id text not null,
  plan_revision_id uuid not null,
  fingerprint text not null,
  revision_id uuid not null,
  primary key(actor_user_id,request_id),
  foreign key(repository_id,plan_revision_id,revision_id)
    references app_private.execution_task_dependency_revisions(repository_id,plan_revision_id,id)
);

create index execution_task_dependency_revisions_parent
  on app_private.execution_task_dependency_revisions(
    repository_id,plan_revision_id,parent_revision_id
  );
create index execution_task_dependency_commands_revision
  on app_private.execution_task_dependency_commands(
    repository_id,plan_revision_id,revision_id
  );

alter table app_private.execution_task_dependencies enable row level security;
alter table app_private.execution_task_dependency_revisions enable row level security;
alter table app_private.execution_task_dependency_commands enable row level security;
revoke all on app_private.execution_task_dependencies,
  app_private.execution_task_dependency_revisions,
  app_private.execution_task_dependency_commands
  from public,anon,authenticated,line_app;
grant select,insert,update on app_private.execution_task_dependencies to line_app;
grant select,insert on app_private.execution_task_dependency_revisions,
  app_private.execution_task_dependency_commands to line_app;
create policy backend on app_private.execution_task_dependencies
  for all to line_app using(true) with check(true);
create policy backend_read on app_private.execution_task_dependency_revisions
  for select to line_app using(true);
create policy backend_insert on app_private.execution_task_dependency_revisions
  for insert to line_app with check(true);
create policy backend_read on app_private.execution_task_dependency_commands
  for select to line_app using(true);
create policy backend_insert on app_private.execution_task_dependency_commands
  for insert to line_app with check(true);
