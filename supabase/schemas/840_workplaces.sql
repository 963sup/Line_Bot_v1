-- Workplace aggregate root.

-- 工作地點、允許人員與聊天建立流程。依賴：membership。
-- Current workplaces structure. Edit here; historical SQL is retained in Git (see supabase/README.md).

create table app_private."workplaces" (
  "id" uuid not null,
  "name" text not null,
  "description" text not null,
  "latitude" double precision not null,
  "longitude" double precision not null,
  "radius" double precision not null,
  "enabled" boolean not null,
  "version" integer not null,
  constraint "workplaces_pkey" PRIMARY KEY (id),
  constraint "workplaces_description_check" CHECK ((length(description) <= 500)),
  constraint "workplaces_latitude_check" CHECK (((latitude >= ('-90'::integer)::double precision) AND (latitude <= (90)::double precision))),
  constraint "workplaces_longitude_check" CHECK (((longitude >= ('-180'::integer)::double precision) AND (longitude <= (180)::double precision))),
  constraint "workplaces_name_check" CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 100))),
  constraint "workplaces_radius_check" CHECK (((radius > (0)::double precision) AND (radius <= (10000)::double precision))),
  constraint "workplaces_version_check" CHECK ((version > 0))
);
alter table app_private."workplaces" enable row level security;
revoke all on app_private."workplaces" from public, anon, authenticated, line_app;
grant insert, select, update on app_private."workplaces" to line_app;
create policy "backend" on app_private."workplaces" as permissive for all to "line_app" using (true) with check (true);
