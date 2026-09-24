-- Project-scoped milestones, distinct from Repository milestones.

create table app_private."project_milestones" (
  "id" text not null,
  "project_id" text not null,
  "title" text not null,
  "due_at" bigint,
  "version" integer not null,
  constraint "project_milestones_pkey" primary key (id),
  constraint "project_milestones_project_fkey" foreign key (project_id) references app_private.projects(id)
);
alter table app_private."project_milestones" enable row level security;
revoke all on app_private."project_milestones" from public, anon, authenticated, line_app;
grant insert, select, update on app_private.project_milestones to line_app;
create policy "backend" on app_private.project_milestones as permissive for all to line_app using (true) with check (true);
