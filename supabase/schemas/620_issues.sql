-- Repository-owned Issue objects.

-- Repository issue lifecycle, commands and immutable history.
-- Depends on 52_repository.sql; table names and constraints preserve the issue contract.

create table app_private."issues" (
  "id" text not null, "repository_id" text not null,
  "number" bigint not null,
  "publisher" text not null, "assignee" text not null,
  "title" text not null, "criteria" text not null, "status" text not null, "milestone_id" text, "version" integer not null,
  "created_at" bigint not null, "updated_at" bigint not null,
  constraint "issues_pkey" primary key (id),
  constraint "issues_repository_id_id_unique" unique (repository_id, id),
  constraint "issues_repository_id_number_unique" unique (repository_id, number),
  constraint "issues_number_check" check (number > 0),
  constraint "issues_check" check (publisher <> assignee),
  constraint "issues_criteria_check" check (length(btrim(criteria)) between 1 and 1000),
  constraint "issues_status_check" check (status = any (array['pending'::text, 'active'::text, 'review'::text, 'completed'::text])),
  constraint "issues_title_check" check (length(btrim(title)) between 1 and 80),
  constraint "issues_version_check" check (version > 0),
  constraint "issues_repository_id_fkey" foreign key (repository_id) references app_private.repositories(id),
  constraint "issues_publisher_fkey" foreign key (publisher) references app_private.users(id),
  constraint "issues_assignee_fkey" foreign key (assignee) references app_private.users(id),
  constraint "issues_milestone_scope_fkey" foreign key (repository_id, milestone_id)
    references app_private.repository_milestones(repository_id, id)
);
create index issues_assignee on app_private.issues (repository_id, assignee);
create index issues_repository on app_private.issues (repository_id, created_at, id);
create index issues_publisher on app_private.issues (repository_id, publisher);
alter table app_private."issues" enable row level security;
revoke all on app_private."issues" from public, anon, authenticated, line_app;
grant insert, select, update on app_private.issues to line_app;
create policy "backend" on app_private.issues as permissive for all to line_app using (true) with check (true);
