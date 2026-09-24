-- Project-owned Work Breakdown Structure; structurally separate from ProjectItem references.

create table app_private."project_wbs" (
  "id" text not null,
  "project_id" text not null,
  "parent_id" text,
  "title" text not null,
  "position" integer not null,
  "version" integer not null,
  constraint "project_wbs_pkey" primary key (id),
  constraint "project_wbs_project_id_key" unique (project_id, id),
  constraint "project_wbs_project_fkey" foreign key (project_id) references app_private.projects(id),
  constraint "project_wbs_parent_fkey" foreign key (project_id, parent_id) references app_private.project_wbs(project_id, id)
);
alter table app_private."project_wbs" enable row level security;
revoke all on app_private."project_wbs" from public, anon, authenticated, line_app;
grant insert, select, update on app_private.project_wbs to line_app;
create policy "backend" on app_private.project_wbs as permissive for all to line_app using (true) with check (true);
