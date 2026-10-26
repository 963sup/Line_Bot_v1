-- Discussion-owned collaboration relations. Repository Label definitions remain Repository-owned.

create table app_private.discussion_answers (
  discussion_id text primary key references app_private.discussions(id),
  comment_id text not null,
  chosen_by text not null references app_private.users(id),
  chosen_at bigint not null,
  constraint discussion_answers_comment_scope_fkey
    foreign key (discussion_id, comment_id)
    references app_private.discussion_comments(discussion_id, id)
);

create table app_private.discussion_labels (
  repository_id text not null,
  discussion_id text not null,
  label_id text not null,
  added_by text not null references app_private.users(id),
  created_at bigint not null,
  primary key (discussion_id, label_id),
  constraint discussion_labels_discussion_scope_fkey
    foreign key (repository_id, discussion_id)
    references app_private.discussions(repository_id, id),
  constraint discussion_labels_label_scope_fkey
    foreign key (repository_id, label_id)
    references app_private.repository_labels(repository_id, id)
);
create index discussion_labels_label on app_private.discussion_labels(label_id, discussion_id);

create table app_private.discussion_upvotes (
  discussion_id text not null references app_private.discussions(id),
  user_id text not null references app_private.users(id),
  created_at bigint not null,
  primary key (discussion_id, user_id)
);

create table app_private.discussion_comment_upvotes (
  comment_id text not null references app_private.discussion_comments(id),
  user_id text not null references app_private.users(id),
  created_at bigint not null,
  primary key (comment_id, user_id)
);

create table app_private.discussion_polls (
  id text primary key,
  discussion_id text not null unique references app_private.discussions(id),
  question text not null,
  version integer not null,
  created_at bigint not null,
  updated_at bigint not null,
  constraint discussion_polls_question_check check (length(btrim(question)) between 1 and 500),
  constraint discussion_polls_version_check check (version > 0),
  constraint discussion_polls_time_check check (created_at <= updated_at)
);

create table app_private.discussion_poll_options (
  id text not null,
  poll_id text not null references app_private.discussion_polls(id),
  option text not null,
  position integer not null,
  version integer not null,
  primary key (id),
  constraint discussion_poll_options_poll_id_id_unique unique (poll_id, id),
  constraint discussion_poll_options_poll_position_unique unique (poll_id, position),
  constraint discussion_poll_options_text_check check (length(btrim(option)) between 1 and 200),
  constraint discussion_poll_options_position_check check (position >= 0),
  constraint discussion_poll_options_version_check check (version > 0)
);

create table app_private.discussion_poll_votes (
  poll_id text not null,
  option_id text not null,
  user_id text not null references app_private.users(id),
  created_at bigint not null,
  primary key (option_id, user_id),
  constraint discussion_poll_votes_option_scope_fkey
    foreign key (poll_id, option_id)
    references app_private.discussion_poll_options(poll_id, id)
);
create index discussion_poll_votes_poll_user
  on app_private.discussion_poll_votes(poll_id, user_id, option_id);

alter table app_private.discussion_answers enable row level security;
alter table app_private.discussion_labels enable row level security;
alter table app_private.discussion_upvotes enable row level security;
alter table app_private.discussion_comment_upvotes enable row level security;
alter table app_private.discussion_polls enable row level security;
alter table app_private.discussion_poll_options enable row level security;
alter table app_private.discussion_poll_votes enable row level security;

revoke all on app_private.discussion_answers from public, anon, authenticated, line_app;
revoke all on app_private.discussion_labels from public, anon, authenticated, line_app;
revoke all on app_private.discussion_upvotes from public, anon, authenticated, line_app;
revoke all on app_private.discussion_comment_upvotes from public, anon, authenticated, line_app;
revoke all on app_private.discussion_polls from public, anon, authenticated, line_app;
revoke all on app_private.discussion_poll_options from public, anon, authenticated, line_app;
revoke all on app_private.discussion_poll_votes from public, anon, authenticated, line_app;

grant select, insert, update, delete on app_private.discussion_answers to line_app;
grant select, insert, delete on app_private.discussion_labels to line_app;
grant select, insert, delete on app_private.discussion_upvotes to line_app;
grant select, insert, delete on app_private.discussion_comment_upvotes to line_app;
grant select, insert, update on app_private.discussion_polls to line_app;
grant select, insert, update, delete on app_private.discussion_poll_options to line_app;
grant select, insert, delete on app_private.discussion_poll_votes to line_app;

create policy backend on app_private.discussion_answers
  for all to line_app using (true) with check (true);
create policy backend on app_private.discussion_labels
  for all to line_app using (true) with check (true);
create policy backend on app_private.discussion_upvotes
  for all to line_app using (true) with check (true);
create policy backend on app_private.discussion_comment_upvotes
  for all to line_app using (true) with check (true);
create policy backend on app_private.discussion_polls
  for all to line_app using (true) with check (true);
create policy backend on app_private.discussion_poll_options
  for all to line_app using (true) with check (true);
create policy backend on app_private.discussion_poll_votes
  for all to line_app using (true) with check (true);
