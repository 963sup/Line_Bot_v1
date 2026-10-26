-- Issue-owned current assignee collection.

create table app_private.issue_assignees (
  issue_id text not null references app_private.issues(id) on delete cascade,
  user_id text not null references app_private.users(id),
  assigned_at bigint,
  constraint issue_assignees_pkey primary key (issue_id, user_id),
  constraint issue_assignees_assigned_at_check check (assigned_at is null or assigned_at >= 0)
);
create index issue_assignees_user_lookup
  on app_private.issue_assignees(user_id, issue_id);

alter table app_private.issue_assignees enable row level security;
revoke all on app_private.issue_assignees from public, anon, authenticated, line_app;
grant select, insert, delete on app_private.issue_assignees to line_app;
create policy backend on app_private.issue_assignees
  for all to line_app using (true) with check (true);
