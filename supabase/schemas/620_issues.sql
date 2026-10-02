-- Issue-owned objects scoped to a Repository.

-- Canonical Issue state/content live here. Local work acceptance progress is a separate
-- workflow_status axis; assignees are owned by the issue_assignees relation.
--
-- Rollout compatibility: assignee/status are retained only for pre-parity rows. A row is either
-- legacy (old columns populated, new representation null) or canonical (new representation
-- populated, legacy columns null). Runtime reads old rows without mutation and atomically
-- materializes their exact assignment/workflow facts on the first Issue mutation.
create table app_private."issues" (
  "id" text not null,
  "repository_id" text not null,
  "number" bigint not null,
  "publisher" text not null,
  "assignee" text,
  "title" text not null,
  "body" text,
  "criteria" text not null,
  "status" text,
  "state" text,
  "state_reason" text,
  "workflow_status" text,
  "milestone_id" text,
  "version" integer not null,
  "created_at" bigint not null,
  "updated_at" bigint not null,
  constraint "issues_pkey" primary key (id),
  constraint "issues_repository_id_id_unique" unique (repository_id, id),
  constraint "issues_repository_id_number_unique" unique (repository_id, number),
  constraint "issues_number_check" check (number > 0),
  constraint "issues_check" check (publisher <> assignee),
  constraint "issues_title_check" check (length(btrim(title)) between 1 and 80),
  constraint "issues_body_check" check (body is null or length(body) <= 10000),
  constraint "issues_criteria_check" check (length(criteria) <= 1000),
  constraint "issues_status_check" check (
    status is null
    or status in ('pending','active','review','completed')
  ),
  constraint "issues_state_check" check (
    state is null
    or state in ('OPEN','CLOSED')
  ),
  constraint "issues_state_reason_check" check (
    (state is null and state_reason is null)
    or (state='OPEN' and (state_reason is null or state_reason='REOPENED'))
    or
    (
      state='CLOSED'
      and (
        state_reason is null
        or state_reason in ('COMPLETED','DUPLICATE','NOT_PLANNED')
      )
    )
  ),
  constraint "issues_workflow_status_check" check (
    workflow_status is null
    or workflow_status in ('pending','active','review','completed')
  ),
  constraint "issues_representation_check" check (
    (
      assignee is not null
      and status is not null
      and body is null
      and state is null
      and state_reason is null
      and workflow_status is null
    )
    or
    (
      assignee is null
      and status is null
      and body is not null
      and state is not null
      and workflow_status is not null
    )
  ),
  constraint "issues_version_check" check (version > 0),
  constraint "issues_repository_id_fkey"
    foreign key (repository_id) references app_private.repositories(id),
  constraint "issues_publisher_fkey"
    foreign key (publisher) references app_private.users(id),
  constraint "issues_assignee_fkey"
    foreign key (assignee) references app_private.users(id),
  constraint "issues_milestone_scope_fkey"
    foreign key (repository_id, milestone_id)
    references app_private.repository_milestones(repository_id, id)
);
create index issues_assignee on app_private.issues (repository_id, assignee);
create index issues_repository on app_private.issues (repository_id, created_at, id);
create index issues_publisher on app_private.issues (repository_id, publisher);
create index issues_state on app_private.issues (repository_id, state, created_at, id);
create index issues_workflow_status
  on app_private.issues (repository_id, workflow_status, created_at, id);

alter table app_private."issues" enable row level security;
revoke all on app_private."issues" from public, anon, authenticated, line_app;
grant select on app_private.issues to line_app;
grant insert (
  id,
  repository_id,
  number,
  publisher,
  title,
  body,
  criteria,
  state,
  state_reason,
  workflow_status,
  version,
  created_at,
  updated_at
) on app_private.issues to line_app;
grant update (
  assignee,
  title,
  body,
  criteria,
  status,
  state,
  state_reason,
  workflow_status,
  version,
  updated_at
) on app_private.issues to line_app;
create policy "backend_read" on app_private.issues
  for select to line_app using (true);
create policy "backend_insert" on app_private.issues
  for insert to line_app with check (true);
create policy "backend_update" on app_private.issues
  for update to line_app using (true) with check (true);
