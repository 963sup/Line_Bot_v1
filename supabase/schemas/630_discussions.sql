-- Repository-owned Discussion objects.

-- Repository conversations. Discussion is distinct from notification delivery.

create table app_private."discussions" (
  "id" text not null,
  "repository_id" text not null,
  "author" text not null,
  "title" text not null,
  "body" text not null,
  "category" text not null,
  "version" integer not null,
  "created_at" bigint not null,
  "updated_at" bigint not null,
  constraint "discussions_pkey" primary key (id),
  constraint "discussions_title_check" check (length(btrim(title)) between 1 and 160),
  constraint "discussions_body_check" check (length(btrim(body)) between 1 and 20000),
  constraint "discussions_version_check" check (version > 0),
  constraint "discussions_repository_fkey" foreign key (repository_id) references app_private.repositories(id),
  constraint "discussions_author_fkey" foreign key (author) references app_private.users(id)
);
create index discussions_repository_created on app_private.discussions (repository_id, created_at, id);
alter table app_private."discussions" enable row level security;
revoke all on app_private."discussions" from public, anon, authenticated, line_app;
-- Discussion write management is data-only; current runtime is authorized read only.
grant select on app_private.discussions to line_app;
create policy "backend_read" on app_private.discussions
  for select to line_app using (true);
