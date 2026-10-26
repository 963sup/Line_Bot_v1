-- Project-owned typed field definitions and item values.

create table app_private.project_fields (
  id text not null,
  project_id text not null,
  name text not null,
  data_type text not null,
  version integer not null,
  created_at bigint not null,
  updated_at bigint not null,
  primary key (id),
  constraint project_fields_project_id_id_unique unique (project_id, id),
  constraint project_fields_project_name_unique unique (project_id, name),
  constraint project_fields_project_fkey
    foreign key (project_id) references app_private.projects(id),
  constraint project_fields_name_check check (length(btrim(name)) between 1 and 120),
  constraint project_fields_data_type_check check (
    data_type in ('DATE','ITERATION','MULTI_SELECT','NUMBER','SINGLE_SELECT','TEXT')
  ),
  constraint project_fields_version_check check (version > 0),
  constraint project_fields_time_check check (created_at <= updated_at)
);

create table app_private.project_field_options (
  id text not null,
  field_id text not null references app_private.project_fields(id),
  option_kind text not null,
  name text not null,
  color text not null,
  description text not null default '',
  position integer not null,
  version integer not null,
  primary key (id),
  constraint project_field_options_field_id_id_unique unique (field_id, id),
  constraint project_field_options_field_name_unique unique (field_id, name),
  constraint project_field_options_field_position_unique unique (field_id, position),
  constraint project_field_options_kind_check check (
    option_kind in ('SINGLE_SELECT','MULTI_SELECT')
  ),
  constraint project_field_options_name_check check (length(btrim(name)) between 1 and 120),
  constraint project_field_options_color_check check (
    color in ('BLUE','GRAY','GREEN','ORANGE','PINK','PURPLE','RED','YELLOW')
  ),
  constraint project_field_options_description_check check (length(description) <= 500),
  constraint project_field_options_position_check check (position >= 0),
  constraint project_field_options_version_check check (version > 0)
);

create table app_private.project_field_iterations (
  id text not null,
  field_id text not null references app_private.project_fields(id),
  title text not null,
  start_date text not null,
  duration integer not null,
  position integer not null,
  version integer not null,
  primary key (id),
  constraint project_field_iterations_field_id_id_unique unique (field_id, id),
  constraint project_field_iterations_field_position_unique unique (field_id, position),
  constraint project_field_iterations_title_check check (length(btrim(title)) between 1 and 120),
  constraint project_field_iterations_start_date_check check (
    start_date ~ '^\d{4}-\d{2}-\d{2}$'
  ),
  constraint project_field_iterations_duration_check check (duration > 0 and duration <= 3650),
  constraint project_field_iterations_position_check check (position >= 0),
  constraint project_field_iterations_version_check check (version > 0)
);

create table app_private.project_item_field_values (
  project_id text not null,
  item_id text not null,
  field_id text not null,
  value_type text not null,
  date_value text,
  iteration_id text,
  number_value double precision,
  single_select_option_id text,
  text_value text,
  version integer not null,
  updated_at bigint not null,
  primary key (item_id, field_id),
  constraint project_item_field_values_item_scope_fkey
    foreign key (project_id, item_id)
    references app_private.project_items(project_id, id),
  constraint project_item_field_values_field_scope_fkey
    foreign key (project_id, field_id)
    references app_private.project_fields(project_id, id),
  constraint project_item_field_values_iteration_fkey
    foreign key (field_id, iteration_id)
    references app_private.project_field_iterations(field_id, id),
  constraint project_item_field_values_single_option_fkey
    foreign key (field_id, single_select_option_id)
    references app_private.project_field_options(field_id, id),
  constraint project_item_field_values_type_check check (
    value_type in ('DATE','ITERATION','MULTI_SELECT','NUMBER','SINGLE_SELECT','TEXT')
  ),
  constraint project_item_field_values_shape_check check (
    (
      value_type='DATE'
      and date_value is not null
      and iteration_id is null
      and number_value is null
      and single_select_option_id is null
      and text_value is null
    )
    or (
      value_type='ITERATION'
      and date_value is null
      and iteration_id is not null
      and number_value is null
      and single_select_option_id is null
      and text_value is null
    )
    or (
      value_type='MULTI_SELECT'
      and date_value is null
      and iteration_id is null
      and number_value is null
      and single_select_option_id is null
      and text_value is null
    )
    or (
      value_type='NUMBER'
      and date_value is null
      and iteration_id is null
      and number_value is not null
      and single_select_option_id is null
      and text_value is null
    )
    or (
      value_type='SINGLE_SELECT'
      and date_value is null
      and iteration_id is null
      and number_value is null
      and single_select_option_id is not null
      and text_value is null
    )
    or (
      value_type='TEXT'
      and date_value is null
      and iteration_id is null
      and number_value is null
      and single_select_option_id is null
      and text_value is not null
    )
  ),
  constraint project_item_field_values_date_check check (
    date_value is null or date_value ~ '^\d{4}-\d{2}-\d{2}$'
  ),
  constraint project_item_field_values_text_check check (
    text_value is null or length(text_value) <= 10000
  ),
  constraint project_item_field_values_version_check check (version > 0)
);

create table app_private.project_item_multi_select_values (
  project_id text not null,
  item_id text not null,
  field_id text not null,
  option_id text not null,
  added_at bigint not null,
  primary key (item_id, field_id, option_id),
  constraint project_item_multi_select_item_scope_fkey
    foreign key (project_id, item_id)
    references app_private.project_items(project_id, id),
  constraint project_item_multi_select_field_scope_fkey
    foreign key (project_id, field_id)
    references app_private.project_fields(project_id, id),
  constraint project_item_multi_select_option_fkey
    foreign key (field_id, option_id)
    references app_private.project_field_options(field_id, id)
);

alter table app_private.project_fields enable row level security;
alter table app_private.project_field_options enable row level security;
alter table app_private.project_field_iterations enable row level security;
alter table app_private.project_item_field_values enable row level security;
alter table app_private.project_item_multi_select_values enable row level security;

revoke all on app_private.project_fields from public, anon, authenticated, line_app;
revoke all on app_private.project_field_options from public, anon, authenticated, line_app;
revoke all on app_private.project_field_iterations from public, anon, authenticated, line_app;
revoke all on app_private.project_item_field_values from public, anon, authenticated, line_app;
revoke all on app_private.project_item_multi_select_values from public, anon, authenticated, line_app;

grant select, insert, update, delete on app_private.project_fields to line_app;
grant select, insert, update, delete on app_private.project_field_options to line_app;
grant select, insert, update, delete on app_private.project_field_iterations to line_app;
grant select, insert, update, delete on app_private.project_item_field_values to line_app;
grant select, insert, delete on app_private.project_item_multi_select_values to line_app;

create policy backend on app_private.project_fields
  for all to line_app using (true) with check (true);
create policy backend on app_private.project_field_options
  for all to line_app using (true) with check (true);
create policy backend on app_private.project_field_iterations
  for all to line_app using (true) with check (true);
create policy backend on app_private.project_item_field_values
  for all to line_app using (true) with check (true);
create policy backend on app_private.project_item_multi_select_values
  for all to line_app using (true) with check (true);
