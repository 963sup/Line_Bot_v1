-- Issue-owned references pin an exact Object revision without transferring Object authority.

create table app_private.issue_object_references (
  repository_id text not null,
  issue_id text not null,
  object_id uuid not null,
  revision_id uuid not null,
  pinned_by text not null,
  pinned_at bigint not null,
  constraint issue_object_references_pkey primary key (issue_id, object_id),
  constraint issue_object_references_issue_scope_fkey
    foreign key (repository_id, issue_id)
    references app_private.issues(repository_id, id),
  constraint issue_object_references_revision_scope_fkey
    foreign key (repository_id, object_id, revision_id)
    references app_private.object_revisions(repository_id, object_id, id),
  constraint issue_object_references_actor_fkey
    foreign key (pinned_by) references app_private.users(id),
  constraint issue_object_references_time_check check (pinned_at >= 0)
);
create index issue_object_references_object
  on app_private.issue_object_references(repository_id, object_id, issue_id);
create index issue_object_references_revision
  on app_private.issue_object_references(revision_id, issue_id);
create index issue_object_references_actor
  on app_private.issue_object_references(pinned_by, pinned_at);

alter table app_private.issue_object_references enable row level security;
revoke all on app_private.issue_object_references from public, anon, authenticated, line_app;
grant select, insert, update, delete on app_private.issue_object_references to line_app;
create policy backend on app_private.issue_object_references
  for all to line_app using (true) with check (true);
