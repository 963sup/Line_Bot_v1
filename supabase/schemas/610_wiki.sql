-- Wiki owns page heads, immutable revisions and exact command receipts.
create table app_private.wiki_pages (
  id uuid primary key,
  repository_id text not null references app_private.repositories(id),
  version integer not null check(version>0),
  head_revision_id uuid not null,
  unique(repository_id,id)
);
create table app_private.wiki_revisions (
  id uuid primary key,
  page_id uuid not null,
  repository_id text not null,
  version integer not null check(version>0),
  parent_revision_id uuid,
  actor_user_id text not null references app_private.users(id),
  at bigint not null,
  action text not null check(action in ('create','edit','rename','archive','restore')),
  title text not null check(length(trim(title)) between 1 and 200),
  body text not null,
  archived boolean not null,
  unique(repository_id,page_id,id),
  unique(repository_id,page_id,version,id),
  unique(page_id,version),
  foreign key(repository_id,page_id) references app_private.wiki_pages(repository_id,id),
  foreign key(repository_id,page_id,parent_revision_id) references app_private.wiki_revisions(repository_id,page_id,id),
  check((version=1 and parent_revision_id is null and action='create') or (version>1 and parent_revision_id is not null and action<>'create'))
);
alter table app_private.wiki_pages add constraint wiki_pages_head_fkey
  foreign key(repository_id,id,version,head_revision_id) references app_private.wiki_revisions(repository_id,page_id,version,id) deferrable initially deferred;
create table app_private.wiki_commands (
  actor_user_id text not null references app_private.users(id),
  request_id uuid not null,
  repository_id text not null,
  page_id uuid not null,
  fingerprint text not null,
  revision_id uuid not null,
  primary key(actor_user_id,request_id),
  foreign key(repository_id,page_id,revision_id) references app_private.wiki_revisions(repository_id,page_id,id)
);
create index wiki_pages_repository on app_private.wiki_pages(repository_id,id);
alter table app_private.wiki_pages enable row level security;
alter table app_private.wiki_revisions enable row level security;
alter table app_private.wiki_commands enable row level security;
revoke all on app_private.wiki_pages,app_private.wiki_revisions,app_private.wiki_commands from public,anon,authenticated,line_app;
grant select,insert,update on app_private.wiki_pages to line_app;
grant select,insert on app_private.wiki_revisions,app_private.wiki_commands to line_app;
create policy backend on app_private.wiki_pages for all to line_app using(true) with check(true);
create policy backend_read on app_private.wiki_revisions for select to line_app using(true);
create policy backend_insert on app_private.wiki_revisions for insert to line_app with check(true);
create policy backend_read on app_private.wiki_commands for select to line_app using(true);
create policy backend_insert on app_private.wiki_commands for insert to line_app with check(true);
