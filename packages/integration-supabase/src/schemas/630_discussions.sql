-- Discussion-owned objects scoped to one Repository.

-- Legacy rows may retain category text with category_id/number null until an explicit
-- owner-authorized adoption command maps the category and allocates a stable number.
create table app_private."discussions" (
  "id" text not null,
  "repository_id" text not null,
  "number" bigint,
  "author" text not null,
  "title" text not null,
  "body" text not null,
  "category" text not null,
  "category_id" text,
  "state" text not null default 'OPEN',
  "state_reason" text,
  "closed_at" bigint,
  "deleted_at" bigint,
  "is_locked" boolean not null default false,
  "lock_reason" text,
  "version" integer not null,
  "created_at" bigint not null,
  "updated_at" bigint not null,
  constraint "discussions_pkey" primary key (id),
  constraint "discussions_repository_id_id_unique" unique (repository_id, id),
  constraint "discussions_repository_number_unique" unique (repository_id, number),
  constraint "discussions_number_check" check (number is null or number > 0),
  constraint "discussions_title_check" check (
    (deleted_at is null and length(btrim(title)) between 1 and 160)
    or (deleted_at is not null and title='[deleted]')
  ),
  constraint "discussions_body_check" check (
    (deleted_at is null and length(btrim(body)) between 1 and 20000)
    or (deleted_at is not null and body='')
  ),
  constraint "discussions_state_check" check (state in ('OPEN','CLOSED')),
  constraint "discussions_state_reason_check" check (
    (state='OPEN' and (state_reason is null or state_reason='REOPENED'))
    or (
      state='CLOSED'
      and (state_reason is null or state_reason in ('DUPLICATE','OUTDATED','RESOLVED'))
    )
  ),
  constraint "discussions_closed_at_check" check (
    (state='OPEN' and closed_at is null)
    or (state='CLOSED' and closed_at is not null)
  ),
  constraint "discussions_lock_check" check (
    (is_locked and lock_reason in ('OFF_TOPIC','RESOLVED','SPAM','TOO_HEATED'))
    or (not is_locked and lock_reason is null)
  ),
  constraint "discussions_version_check" check (version > 0),
  constraint "discussions_time_check" check (created_at <= updated_at),
  constraint "discussions_repository_fkey"
    foreign key (repository_id) references app_private.repositories(id),
  constraint "discussions_author_fkey"
    foreign key (author) references app_private.users(id)
);
create index discussions_repository_created on app_private.discussions (repository_id, created_at, id);
create index discussions_repository_number on app_private.discussions (repository_id, number);
alter table app_private."discussions" enable row level security;
revoke all on app_private."discussions" from public, anon, authenticated, line_app;
grant select, insert on app_private.discussions to line_app;
grant update (
  number,
  title,
  body,
  category,
  category_id,
  state,
  state_reason,
  closed_at,
  deleted_at,
  is_locked,
  lock_reason,
  version,
  updated_at
) on app_private.discussions to line_app;
create policy "backend_read" on app_private.discussions
  for select to line_app using (true);
create policy "backend_insert" on app_private.discussions
  for insert to line_app with check (true);
create policy "backend_update" on app_private.discussions
  for update to line_app using (true) with check (true);
