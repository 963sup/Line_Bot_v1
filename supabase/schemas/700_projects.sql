-- Project planning aggregate root; Project is not WBS.

-- Cross-repository planning: projects, WBS, milestones and issue references.
-- ProjectOwner is Account-owned User | Organization.

create table app_private."projects" (
  "id" text not null,
  "owner_account_id" text not null,
  "owner_account_kind" text not null,
  "name" text not null,
  "version" integer not null,
  constraint "projects_pkey" primary key (id),
  constraint "projects_owner_kind_check" check (owner_account_kind in ('USER', 'ORGANIZATION')),
  constraint "projects_name_check" check (length(btrim(name)) between 1 and 160),
  constraint "projects_version_check" check (version > 0),
  constraint "projects_owner_account_fkey" foreign key (owner_account_id, owner_account_kind)
    references app_private.accounts(id, kind)
);
alter table app_private."projects" enable row level security;
revoke all on app_private."projects" from public, anon, authenticated, line_app;
grant select on app_private.projects to line_app;
create policy "backend_read" on app_private.projects
  for select to line_app using (true);

-- Read-only runtime is active. Project commands remain disabled until command,
-- expected-version and replay contracts are explicitly implemented.
