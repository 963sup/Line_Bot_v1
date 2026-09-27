-- Repository-owned Discussion comment objects.

create table app_private."discussion_comments" (
  "id" text not null,
  "discussion_id" text not null,
  "author" text not null,
  "body" text not null,
  "version" integer not null,
  "created_at" bigint not null,
  constraint "discussion_comments_pkey" primary key (id),
  constraint "discussion_comments_body_check" check (length(btrim(body)) between 1 and 20000),
  constraint "discussion_comments_version_check" check (version > 0),
  constraint "discussion_comments_discussion_fkey" foreign key (discussion_id) references app_private.discussions(id),
  constraint "discussion_comments_author_fkey" foreign key (author) references app_private.users(id)
);
create index discussion_comments_discussion_created on app_private.discussion_comments (discussion_id, created_at, id);
alter table app_private."discussion_comments" enable row level security;
revoke all on app_private."discussion_comments" from public, anon, authenticated, line_app;
-- DiscussionComment write management is data-only; current runtime is authorized read only.
grant select on app_private.discussion_comments to line_app;
create policy "backend_read" on app_private.discussion_comments
  for select to line_app using (true);
