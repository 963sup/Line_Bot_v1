-- Project planning aggregate root; Project is not WBS.

-- Legacy Projects may keep number/creator null until explicit adoption. New runtime creates
-- always allocate an owner-scoped number and record the creator.
create table app_private."projects" (
  "id" text not null,
  "owner_account_id" text not null,
  "owner_account_kind" text not null,
  "number" bigint,
  "creator" text,
  "name" text not null,
  "short_description" text not null default '',
  "readme" text not null default '',
  "is_public" boolean not null default false,
  "closed" boolean not null default false,
  "closed_at" bigint,
  "deleted_at" bigint,
  "version" integer not null,
  "created_at" bigint not null default 0,
  "updated_at" bigint not null default 0,
  constraint "projects_pkey" primary key (id),
  constraint "projects_owner_number_unique"
    unique (owner_account_id, owner_account_kind, number),
  constraint "projects_owner_kind_check" check (owner_account_kind in ('USER', 'ORGANIZATION')),
  constraint "projects_number_check" check (number is null or number > 0),
  constraint "projects_name_check" check (
    (deleted_at is null and length(btrim(name)) between 1 and 160)
    or (deleted_at is not null and name='[deleted]')
  ),
  constraint "projects_short_description_check" check (length(short_description) <= 500),
  constraint "projects_readme_check" check (length(readme) <= 20000),
  constraint "projects_closed_at_check" check (
    (closed and closed_at is not null)
    or (not closed and closed_at is null)
  ),
  constraint "projects_version_check" check (version > 0),
  constraint "projects_time_check" check (created_at <= updated_at),
  constraint "projects_owner_account_fkey" foreign key (owner_account_id, owner_account_kind)
    references app_private.accounts(id, kind),
  constraint "projects_creator_fkey" foreign key (creator)
    references app_private.users(id)
);
create index projects_owner_number
  on app_private.projects(owner_account_id, owner_account_kind, number);
create index projects_public on app_private.projects(is_public, deleted_at, id)
  where is_public and deleted_at is null;

alter table app_private."projects" enable row level security;
revoke all on app_private."projects" from public, anon, authenticated, line_app;
grant select on app_private.projects to line_app;
grant insert (
  id,
  owner_account_id,
  owner_account_kind,
  number,
  creator,
  name,
  short_description,
  readme,
  is_public,
  closed,
  closed_at,
  deleted_at,
  version,
  created_at,
  updated_at
) on app_private.projects to line_app;
grant update (
  number,
  name,
  short_description,
  readme,
  is_public,
  closed,
  closed_at,
  deleted_at,
  version,
  updated_at
) on app_private.projects to line_app;
create policy "backend_read" on app_private.projects
  for select to line_app using (true);
create policy "backend_insert" on app_private.projects
  for insert to line_app with check (true);
create policy "backend_update" on app_private.projects
  for update to line_app using (true) with check (true);
