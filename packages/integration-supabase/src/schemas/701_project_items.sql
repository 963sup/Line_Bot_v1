-- Project-owned DraftIssue planning content and ProjectV2Item sum type.

create table app_private.project_draft_issues (
  id text not null,
  project_id text not null,
  creator text not null,
  title text not null,
  body text not null default '',
  deleted_at bigint,
  version integer not null,
  created_at bigint not null,
  updated_at bigint not null,
  constraint project_draft_issues_pkey primary key (id),
  constraint project_draft_issues_project_id_id_unique unique (project_id, id),
  constraint project_draft_issues_project_fkey
    foreign key (project_id) references app_private.projects(id),
  constraint project_draft_issues_creator_fkey
    foreign key (creator) references app_private.users(id),
  constraint project_draft_issues_title_check check (
    (deleted_at is null and length(btrim(title)) between 1 and 160)
    or (deleted_at is not null and title='[deleted]')
  ),
  constraint project_draft_issues_body_check check (
    (deleted_at is null and length(body) <= 20000)
    or (deleted_at is not null and body='')
  ),
  constraint project_draft_issues_version_check check (version > 0),
  constraint project_draft_issues_time_check check (created_at <= updated_at)
);

create table app_private.project_items (
  id text not null,
  project_id text not null,
  repository_id text,
  issue_id text,
  draft_issue_id text,
  source_version integer,
  position integer not null,
  archived boolean not null default false,
  version integer not null,
  created_at bigint not null default 0,
  updated_at bigint not null default 0,
  constraint project_items_pkey primary key (id),
  constraint project_items_project_id_id_unique unique (project_id, id),
  constraint project_items_project_fkey
    foreign key (project_id) references app_private.projects(id),
  constraint project_items_issue_fkey
    foreign key (repository_id, issue_id) references app_private.issues(repository_id, id),
  constraint project_items_draft_scope_fkey
    foreign key (project_id, draft_issue_id)
    references app_private.project_draft_issues(project_id, id),
  constraint project_items_content_variant_check check (
    (
      draft_issue_id is null
      and repository_id is not null
      and issue_id is not null
      and source_version is not null
    )
    or
    (
      draft_issue_id is not null
      and repository_id is null
      and issue_id is null
      and source_version is null
    )
  ),
  constraint project_items_source_version_check check (
    source_version is null or source_version > 0
  ),
  constraint project_items_position_check check (position >= 0),
  constraint project_items_version_check check (version > 0),
  constraint project_items_time_check check (created_at <= updated_at),
  constraint project_items_project_position_unique
    unique (project_id, position) deferrable initially deferred
);
create unique index project_items_issue_unique
  on app_private.project_items(project_id, repository_id, issue_id)
  where issue_id is not null;
create unique index project_items_draft_unique
  on app_private.project_items(project_id, draft_issue_id)
  where draft_issue_id is not null;
create index project_items_project_position
  on app_private.project_items(project_id, archived, position, id);

create table app_private.project_draft_issue_assignees (
  draft_issue_id text not null references app_private.project_draft_issues(id),
  user_id text not null references app_private.users(id),
  added_at bigint not null,
  primary key (draft_issue_id, user_id)
);

alter table app_private.project_draft_issues enable row level security;
alter table app_private.project_items enable row level security;
alter table app_private.project_draft_issue_assignees enable row level security;

revoke all on app_private.project_draft_issues from public, anon, authenticated, line_app;
revoke all on app_private.project_items from public, anon, authenticated, line_app;
revoke all on app_private.project_draft_issue_assignees from public, anon, authenticated, line_app;

grant select, insert, update on app_private.project_draft_issues to line_app;
grant select, insert, update, delete on app_private.project_items to line_app;
grant select, insert, delete on app_private.project_draft_issue_assignees to line_app;

create policy backend on app_private.project_draft_issues
  for all to line_app using (true) with check (true);
create policy backend on app_private.project_items
  for all to line_app using (true) with check (true);
create policy backend on app_private.project_draft_issue_assignees
  for all to line_app using (true) with check (true);
