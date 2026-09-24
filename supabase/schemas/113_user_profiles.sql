-- User-owned profile projection. Provider profile data remains in identity integrations;
-- this table stores only product-authored profile content.

create table app_private.user_profiles (
  user_id text primary key references app_private.users(id),
  display_name text,
  bio text,
  avatar_ref text,
  visibility text not null default 'private',
  version integer not null default 1,
  created_at bigint not null,
  updated_at bigint not null,
  constraint user_profiles_display_name_check check (display_name is null or length(btrim(display_name)) between 1 and 120),
  constraint user_profiles_bio_check check (bio is null or length(btrim(bio)) <= 2000),
  constraint user_profiles_visibility_check check (visibility in ('private', 'organization', 'public')),
  constraint user_profiles_version_check check (version > 0)
);
alter table app_private.user_profiles enable row level security;
revoke all on app_private.user_profiles from public, anon, authenticated, line_app;
grant insert, select, update on app_private.user_profiles to line_app;
create policy "backend" on app_private.user_profiles as permissive for all to line_app using (true) with check (true);

create index user_profiles_visibility on app_private.user_profiles(visibility, updated_at desc);
