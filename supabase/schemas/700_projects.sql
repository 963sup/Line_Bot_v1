-- Project planning aggregate root; Project is not WBS.

-- Cross-repository planning: projects, WBS, milestones and issue references.

create table app_private."projects" (
  "id" text not null,
  "organization_id" text not null,
  "name" text not null,
  "version" integer not null,
  constraint "projects_pkey" primary key (id),
  constraint "projects_name_check" check (length(btrim(name)) between 1 and 160),
  constraint "projects_version_check" check (version > 0),
  constraint "projects_organization_fkey" foreign key (organization_id) references app_private.organizations(account_id)
);
alter table app_private."projects" enable row level security;
-- Project is current-data-only. Runtime DML stays disabled until a real consumer
-- defines Project authorization, version/replay semantics and a public contract.
revoke all on app_private."projects" from public, anon, authenticated, line_app;
