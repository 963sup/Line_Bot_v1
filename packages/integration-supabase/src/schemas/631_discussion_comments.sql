-- Discussion-owned comment objects and reply structure.

create table app_private."discussion_comments" (
  "id" text not null,
  "discussion_id" text not null,
  "author" text not null,
  "body" text not null,
  "reply_to_id" text,
  "deleted_at" bigint,
  "version" integer not null,
  "created_at" bigint not null,
  "updated_at" bigint,
  constraint "discussion_comments_pkey" primary key (id),
  constraint "discussion_comments_discussion_id_id_unique" unique (discussion_id, id),
  constraint "discussion_comments_body_check" check (
    (deleted_at is null and length(btrim(body)) between 1 and 20000)
    or (deleted_at is not null and body='')
  ),
  constraint "discussion_comments_no_self_reply" check (reply_to_id is null or reply_to_id <> id),
  constraint "discussion_comments_version_check" check (version > 0),
  constraint "discussion_comments_time_check" check (
    updated_at is null or created_at <= updated_at
  ),
  constraint "discussion_comments_discussion_fkey"
    foreign key (discussion_id) references app_private.discussions(id),
  constraint "discussion_comments_author_fkey"
    foreign key (author) references app_private.users(id)
);
alter table app_private.discussion_comments
  add constraint discussion_comments_reply_scope_fkey
  foreign key (discussion_id, reply_to_id)
  references app_private.discussion_comments(discussion_id, id);
create index discussion_comments_discussion_created
  on app_private.discussion_comments (discussion_id, created_at, id);
create index discussion_comments_reply
  on app_private.discussion_comments (discussion_id, reply_to_id, created_at, id);
alter table app_private."discussion_comments" enable row level security;
revoke all on app_private."discussion_comments" from public, anon, authenticated, line_app;
grant select, insert, update on app_private.discussion_comments to line_app;
create policy "backend_read" on app_private.discussion_comments
  for select to line_app using (true);
create policy "backend_insert" on app_private.discussion_comments
  for insert to line_app with check (true);
create policy "backend_update" on app_private.discussion_comments
  for update to line_app using (true) with check (true);
