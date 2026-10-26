-- Issue-owned comment identity and lifecycle. Issue events remain audit evidence.

create table app_private.issue_comments (
  id text primary key,
  issue_id text not null references app_private.issues(id),
  author text not null references app_private.users(id),
  body text not null,
  deleted_at bigint,
  version integer not null,
  created_at bigint not null,
  updated_at bigint not null,
  constraint issue_comments_body_check check (
    (deleted_at is null and length(btrim(body)) between 1 and 10000)
    or (deleted_at is not null and body = '')
  ),
  constraint issue_comments_version_check check (version > 0),
  constraint issue_comments_time_check check (created_at <= updated_at)
);
create index issue_comments_issue_created
  on app_private.issue_comments(issue_id, created_at, id);

alter table app_private.issue_comments enable row level security;
revoke all on app_private.issue_comments from public, anon, authenticated, line_app;
grant select, insert, update on app_private.issue_comments to line_app;
create policy backend on app_private.issue_comments
  for all to line_app using (true) with check (true);
