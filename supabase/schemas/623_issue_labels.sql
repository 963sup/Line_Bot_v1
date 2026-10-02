-- Issue → Repository Label relationship. Issue remains Issue-owned; Label remains Repository-owned; scope cannot cross Repository.

create table app_private.issue_labels (
  repository_id text not null,
  issue_id text not null,
  label_id text not null,
  added_by text not null references app_private.users(id),
  created_at bigint not null,
  primary key (issue_id, label_id),
  constraint issue_labels_issue_scope_fkey foreign key (repository_id, issue_id)
    references app_private.issues(repository_id, id),
  constraint issue_labels_label_scope_fkey foreign key (repository_id, label_id)
    references app_private.repository_labels(repository_id, id)
);
create index issue_labels_label on app_private.issue_labels(label_id, issue_id);
alter table app_private.issue_labels enable row level security;
revoke all on app_private.issue_labels from public, anon, authenticated, line_app;
grant select, insert, delete on app_private.issue_labels to line_app;
create policy backend on app_private.issue_labels
  for all to line_app using (true) with check (true);
