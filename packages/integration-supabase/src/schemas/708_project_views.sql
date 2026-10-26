-- Project-owned persisted view configuration.

create table app_private.project_views (
  id text not null,
  project_id text not null,
  number integer not null,
  name text not null,
  layout text not null,
  version integer not null,
  created_at bigint not null,
  updated_at bigint not null,
  primary key (id),
  constraint project_views_project_id_id_unique unique (project_id, id),
  constraint project_views_project_number_unique unique (project_id, number),
  constraint project_views_project_name_unique unique (project_id, name),
  constraint project_views_project_fkey
    foreign key (project_id) references app_private.projects(id),
  constraint project_views_number_check check (number > 0),
  constraint project_views_name_check check (length(btrim(name)) between 1 and 120),
  constraint project_views_layout_check check (
    layout in ('BOARD_LAYOUT','ROADMAP_LAYOUT','TABLE_LAYOUT')
  ),
  constraint project_views_version_check check (version > 0),
  constraint project_views_time_check check (created_at <= updated_at)
);

create table app_private.project_view_visible_fields (
  project_id text not null,
  view_id text not null,
  field_id text not null,
  position integer not null,
  primary key (view_id, field_id),
  constraint project_view_visible_fields_view_scope_fkey
    foreign key (project_id, view_id)
    references app_private.project_views(project_id, id),
  constraint project_view_visible_fields_field_scope_fkey
    foreign key (project_id, field_id)
    references app_private.project_fields(project_id, id),
  constraint project_view_visible_fields_position_unique unique (view_id, position),
  constraint project_view_visible_fields_position_check check (position >= 0)
);

alter table app_private.project_views enable row level security;
alter table app_private.project_view_visible_fields enable row level security;

revoke all on app_private.project_views from public, anon, authenticated, line_app;
revoke all on app_private.project_view_visible_fields from public, anon, authenticated, line_app;

grant select, insert, update, delete on app_private.project_views to line_app;
grant select, insert, update, delete on app_private.project_view_visible_fields to line_app;

create policy backend on app_private.project_views
  for all to line_app using (true) with check (true);
create policy backend on app_private.project_view_visible_fields
  for all to line_app using (true) with check (true);
