-- Partner aggregate root.

-- 夥伴名錄、聯繫窗口、推薦與管理回執。依賴：membership。
-- Current partners structure. Edit here; historical SQL is retained in Git (see supabase/README.md).

create table app_private."partners" (
  "id" uuid not null,
  "name" text not null,
  "category" text not null,
  "region" text default ''::text not null,
  "status" text not null,
  "created_at" bigint not null,
  "created_by" text not null,
  "version" integer default 1 not null,
  constraint "partners_pkey" PRIMARY KEY (id),
  constraint "partners_category_check" CHECK (((length(category) >= 1) AND (length(category) <= 80))),
  constraint "partners_name_check" CHECK (((length(name) >= 1) AND (length(name) <= 120))),
  constraint "partners_region_check" CHECK ((length(region) <= 80)),
  constraint "partners_status_check" CHECK ((status = ANY (ARRAY['published'::text, 'unlisted'::text]))),
  constraint "partners_version_check" CHECK ((version > 0)),
  constraint "partners_created_by_fkey" FOREIGN KEY (created_by) REFERENCES app_private.users(id)
);
CREATE INDEX partners_public_lookup ON app_private.partners USING btree (status, name, id);
alter table app_private."partners" enable row level security;
revoke all on app_private."partners" from public, anon, authenticated, line_app;
grant insert, select, update on app_private."partners" to line_app;
create policy "backend" on app_private."partners" as permissive for all to "line_app" using (true) with check (true);
