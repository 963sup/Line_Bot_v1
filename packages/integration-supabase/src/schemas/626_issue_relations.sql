-- Issue-owned hierarchy and relation facts. These relations never transfer Repository access.

create table app_private.issue_sub_issues (
  parent_issue_id text not null references app_private.issues(id),
  child_issue_id text not null references app_private.issues(id),
  position integer not null,
  created_by text not null references app_private.users(id),
  created_at bigint not null,
  constraint issue_sub_issues_pkey primary key (parent_issue_id, child_issue_id),
  constraint issue_sub_issues_child_unique unique (child_issue_id),
  constraint issue_sub_issues_parent_position_unique
    unique (parent_issue_id, position) deferrable initially deferred,
  constraint issue_sub_issues_no_self check (parent_issue_id <> child_issue_id),
  constraint issue_sub_issues_position_check check (position >= 0)
);
create index issue_sub_issues_child on app_private.issue_sub_issues(child_issue_id);

create table app_private.issue_dependencies (
  blocked_issue_id text not null references app_private.issues(id),
  blocking_issue_id text not null references app_private.issues(id),
  created_by text not null references app_private.users(id),
  created_at bigint not null,
  constraint issue_dependencies_pkey primary key (blocked_issue_id, blocking_issue_id),
  constraint issue_dependencies_no_self check (blocked_issue_id <> blocking_issue_id)
);
create index issue_dependencies_blocking
  on app_private.issue_dependencies(blocking_issue_id, blocked_issue_id);

create table app_private.issue_related (
  left_issue_id text not null references app_private.issues(id),
  right_issue_id text not null references app_private.issues(id),
  created_by text not null references app_private.users(id),
  created_at bigint not null,
  constraint issue_related_pkey primary key (left_issue_id, right_issue_id),
  constraint issue_related_canonical_order check (left_issue_id < right_issue_id)
);
create index issue_related_right on app_private.issue_related(right_issue_id, left_issue_id);

alter table app_private.issue_sub_issues enable row level security;
alter table app_private.issue_dependencies enable row level security;
alter table app_private.issue_related enable row level security;

revoke all on app_private.issue_sub_issues from public, anon, authenticated, line_app;
revoke all on app_private.issue_dependencies from public, anon, authenticated, line_app;
revoke all on app_private.issue_related from public, anon, authenticated, line_app;

grant select, insert, update, delete on app_private.issue_sub_issues to line_app;
grant select, insert, delete on app_private.issue_dependencies to line_app;
grant select, insert, delete on app_private.issue_related to line_app;

create policy backend on app_private.issue_sub_issues
  for all to line_app using (true) with check (true);
create policy backend on app_private.issue_dependencies
  for all to line_app using (true) with check (true);
create policy backend on app_private.issue_related
  for all to line_app using (true) with check (true);
