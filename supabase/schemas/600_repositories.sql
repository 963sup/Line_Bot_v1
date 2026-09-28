-- Repository aggregate root. RepositoryOwner is Account-owned User | Organization.

-- Repository identity, visibility and access boundary.
-- Current declarative schema source; no migration history is created here.

create table app_private."repositories" (
  "id" text not null,
  "owner_account_id" text not null,
  "owner_account_kind" text not null,
  "name" text not null,
  "visibility" text not null,
  "next_issue_number" bigint not null default 1,
  "version" integer not null,
  constraint "repositories_pkey" primary key (id),
  constraint "repositories_id_owner_account_id_key" unique (id, owner_account_id),
  constraint "repositories_owner_kind_check" check (owner_account_kind in ('USER', 'ORGANIZATION')),
  constraint "repositories_name_check" check (length(btrim(name)) between 1 and 100),
  constraint "repositories_visibility_check" check (visibility = any (array['private'::text, 'internal'::text, 'public'::text])),
  constraint "repositories_next_issue_number_check" check (next_issue_number > 0),
  constraint "repositories_version_check" check (version > 0),
  constraint "repositories_owner_account_fkey" foreign key (owner_account_id, owner_account_kind)
    references app_private.accounts(id, kind)
);
create unique index repositories_owner_name on app_private.repositories (owner_account_id, lower(name));
alter table app_private."repositories" enable row level security;
revoke all on app_private."repositories" from public, anon, authenticated, line_app;
grant select on app_private.repositories to line_app;
grant update (next_issue_number) on app_private.repositories to line_app;
create policy "backend_read" on app_private.repositories
  for select to line_app using (true);
create policy "backend_issue_number" on app_private.repositories
  for update to line_app using (true) with check (true);

-- Direct User grant. Team-derived access is stored separately and combined only by the
-- read-only effective-access projection after current qualification is rechecked.
