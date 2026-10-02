-- Repository aggregate root. RepositoryOwner is Account-owned User | Organization.

-- Repository identity, visibility and access boundary.
-- Current declarative schema source; no migration history is created here.

create table app_private."repositories" (
  "id" text not null,
  "owner_account_id" text not null,
  "owner_account_kind" text not null,
  "name" text not null,
  "visibility" text not null,
  "is_archived" boolean not null default false,
  "next_issue_number" bigint not null default 1,
  "version" integer not null,
  "address" jsonb,
  constraint "repositories_pkey" primary key (id),
  constraint "repositories_id_owner_account_id_key" unique (id, owner_account_id),
  constraint "repositories_owner_kind_check" check (owner_account_kind in ('USER', 'ORGANIZATION')),
  constraint "repositories_name_check" check (length(btrim(name)) between 1 and 100),
  constraint "repositories_visibility_check" check (visibility = any (array['private'::text, 'internal'::text, 'public'::text])),
  constraint "repositories_internal_owner_check" check (
    visibility <> 'internal' or owner_account_kind = 'ORGANIZATION'
  ),
  constraint "repositories_next_issue_number_check" check (next_issue_number > 0),
  constraint "repositories_version_check" check (version > 0),
  constraint "repositories_address_check" check (
    address is null
    or
    (
      jsonb_typeof(address) = 'object'
      and address ?& array['address','latitude','longitude','radius']
      and address - array['address','latitude','longitude','radius'] = '{}'::jsonb
      and jsonb_typeof(address->'address') = 'string'
      and (address->>'address') = btrim(address->>'address')
      and length(address->>'address') between 1 and 500
      and jsonb_typeof(address->'latitude') = 'number'
      and (address->>'latitude')::double precision between -90 and 90
      and jsonb_typeof(address->'longitude') = 'number'
      and (address->>'longitude')::double precision between -180 and 180
      and jsonb_typeof(address->'radius') = 'number'
      and (address->>'radius')::double precision > 0
      and (address->>'radius')::double precision <= 10000
    )
  ),
  constraint "repositories_owner_account_fkey" foreign key (owner_account_id, owner_account_kind)
    references app_private.accounts(id, kind)
);
create unique index repositories_owner_name on app_private.repositories (owner_account_id, lower(name));
alter table app_private."repositories" enable row level security;
revoke all on app_private."repositories" from public, anon, authenticated, line_app;
grant select on app_private.repositories to line_app;
grant update (name,visibility,is_archived,next_issue_number,address,version)
  on app_private.repositories to line_app;
create policy "backend_read" on app_private.repositories
  for select to line_app using (true);
create policy "backend_issue_number" on app_private.repositories
  for update to line_app using (true) with check (true);

-- Direct User grant. Team-derived access is stored separately and combined only by the
-- read-only effective-access projection after current qualification is rechecked.
