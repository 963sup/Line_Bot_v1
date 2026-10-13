-- Repository-WBS content is separate from legacy Project-owned decomposition.
create table app_private.repository_wbs (
  repository_id text primary key references app_private.repositories(id),
  version integer not null check (version > 0),
  head_revision_id uuid not null
);
create table app_private.repository_wbs_revisions (
  id uuid primary key,
  repository_id text not null references app_private.repository_wbs(repository_id),
  version integer not null check (version > 0),
  parent_revision_id uuid,
  actor_user_id text not null references app_private.users(id),
  action text not null check (action in ('initialize','create-node','update-node','move-node','delete-subtree')),
  document jsonb not null check (jsonb_typeof(document)='object' and document ?& array['schemaVersion','nodes'] and document->>'schemaVersion'='1' and jsonb_typeof(document->'nodes')='array' and jsonb_array_length(document->'nodes')<=1000),
  at bigint not null,
  unique(repository_id,version),
  unique(repository_id,id),
  unique(repository_id,version,id),
  foreign key(repository_id,parent_revision_id) references app_private.repository_wbs_revisions(repository_id,id),
  check ((version=1 and parent_revision_id is null and action='initialize') or (version>1 and parent_revision_id is not null and action<>'initialize'))
);
alter table app_private.repository_wbs add constraint repository_wbs_head_fkey
  foreign key(repository_id,version,head_revision_id) references app_private.repository_wbs_revisions(repository_id,version,id) deferrable initially deferred;
create table app_private.repository_wbs_commands (
  actor_user_id text not null references app_private.users(id),
  request_id uuid not null,
  repository_id text not null,
  fingerprint text not null,
  revision_id uuid not null,
  primary key(actor_user_id,request_id),
  foreign key(repository_id,revision_id) references app_private.repository_wbs_revisions(repository_id,id)
);
create index repository_wbs_commands_source on app_private.repository_wbs_commands(repository_id,revision_id);
alter table app_private.repository_wbs enable row level security;
alter table app_private.repository_wbs_revisions enable row level security;
alter table app_private.repository_wbs_commands enable row level security;
revoke all on app_private.repository_wbs, app_private.repository_wbs_revisions, app_private.repository_wbs_commands from public, anon, authenticated, line_app;
grant select,insert,update on app_private.repository_wbs to line_app;
grant select,insert on app_private.repository_wbs_revisions, app_private.repository_wbs_commands to line_app;
create policy backend on app_private.repository_wbs for all to line_app using(true) with check(true);
create policy backend_read on app_private.repository_wbs_revisions for select to line_app using(true);
create policy backend_insert on app_private.repository_wbs_revisions for insert to line_app with check(true);
create policy backend_read on app_private.repository_wbs_commands for select to line_app using(true);
create policy backend_insert on app_private.repository_wbs_commands for insert to line_app with check(true);

-- Scope governance has its own version; content Revision numbers never change for reviews.
create table app_private.repository_wbs_policies (
  repository_id text not null references app_private.repository_wbs(repository_id),
  version integer not null check(version > 0),
  minimum_approvals integer not null check(minimum_approvals between 1 and 10),
  allow_self_approval boolean not null,
  actor_user_id text not null references app_private.users(id),
  at bigint not null,
  primary key(repository_id,version)
);
create table app_private.repository_wbs_governance (
  repository_id text primary key references app_private.repository_wbs(repository_id),
  version integer not null check(version >= 0),
  policy_version integer not null,
  published_baseline_id uuid,
  foreign key(repository_id,policy_version) references app_private.repository_wbs_policies(repository_id,version)
);
create table app_private.repository_wbs_proposals (
  id uuid primary key,
  repository_id text not null references app_private.repository_wbs_governance(repository_id),
  number integer not null check(number > 0),
  version integer not null check(version > 0),
  author_user_id text not null references app_private.users(id),
  created_at bigint not null,
  unique(repository_id,id),
  unique(repository_id,number)
);
create table app_private.repository_wbs_proposal_versions (
  repository_id text not null,
  proposal_id uuid not null,
  version integer not null check(version > 0),
  title text not null check(length(btrim(title)) between 1 and 200),
  reason text not null check(length(reason) <= 10000),
  status text not null check(status in ('OPEN','CLOSED','PUBLISHED')),
  candidate_revision_id uuid not null,
  base_baseline_id uuid,
  actor_user_id text not null references app_private.users(id),
  at bigint not null,
  primary key(repository_id,proposal_id,version),
  unique(repository_id,proposal_id,version,candidate_revision_id),
  foreign key(repository_id,proposal_id) references app_private.repository_wbs_proposals(repository_id,id),
  foreign key(repository_id,candidate_revision_id) references app_private.repository_wbs_revisions(repository_id,id)
);
alter table app_private.repository_wbs_proposals add constraint repository_wbs_proposal_head_fkey
  foreign key(repository_id,id,version) references app_private.repository_wbs_proposal_versions(repository_id,proposal_id,version) deferrable initially deferred;
create table app_private.repository_wbs_reviews (
  id uuid primary key,
  repository_id text not null,
  proposal_id uuid not null,
  proposal_version integer not null check(proposal_version > 0),
  candidate_revision_id uuid not null,
  policy_version integer not null,
  reviewer_user_id text not null references app_private.users(id),
  decision text not null check(decision in ('APPROVE','REQUEST_CHANGES')),
  note text not null check(length(note) <= 2000),
  sequence integer not null check(sequence > 0),
  at bigint not null,
  unique(repository_id,sequence),
  foreign key(repository_id,proposal_id,proposal_version,candidate_revision_id) references app_private.repository_wbs_proposal_versions(repository_id,proposal_id,version,candidate_revision_id),
  foreign key(repository_id,policy_version) references app_private.repository_wbs_policies(repository_id,version)
);
create index repository_wbs_reviews_proposal on app_private.repository_wbs_reviews(repository_id,proposal_id,proposal_version,reviewer_user_id,sequence desc);
create table app_private.repository_wbs_baselines (
  id uuid primary key,
  repository_id text not null,
  number integer not null check(number > 0),
  proposal_id uuid not null,
  proposal_version integer not null check(proposal_version > 0),
  revision_id uuid not null,
  previous_baseline_id uuid,
  policy_version integer not null,
  published_by text not null references app_private.users(id),
  approval_review_ids uuid[] not null check(cardinality(approval_review_ids)>0),
  at bigint not null,
  unique(repository_id,id),
  unique(repository_id,number),
  unique(repository_id,proposal_id),
  foreign key(repository_id,proposal_id,proposal_version,revision_id) references app_private.repository_wbs_proposal_versions(repository_id,proposal_id,version,candidate_revision_id),
  foreign key(repository_id,previous_baseline_id) references app_private.repository_wbs_baselines(repository_id,id),
  foreign key(repository_id,policy_version) references app_private.repository_wbs_policies(repository_id,version)
);
alter table app_private.repository_wbs_proposal_versions add constraint repository_wbs_proposal_base_fkey
  foreign key(repository_id,base_baseline_id) references app_private.repository_wbs_baselines(repository_id,id);
alter table app_private.repository_wbs_governance add constraint repository_wbs_published_baseline_fkey
  foreign key(repository_id,published_baseline_id) references app_private.repository_wbs_baselines(repository_id,id);
create table app_private.repository_wbs_governance_commands (
  actor_user_id text not null references app_private.users(id),
  request_id uuid not null,
  repository_id text not null references app_private.repository_wbs_governance(repository_id),
  fingerprint text not null,
  result jsonb not null check(jsonb_typeof(result)='object'),
  primary key(actor_user_id,request_id)
);
alter table app_private.repository_wbs_policies enable row level security;
alter table app_private.repository_wbs_governance enable row level security;
alter table app_private.repository_wbs_proposals enable row level security;
alter table app_private.repository_wbs_proposal_versions enable row level security;
alter table app_private.repository_wbs_reviews enable row level security;
alter table app_private.repository_wbs_baselines enable row level security;
alter table app_private.repository_wbs_governance_commands enable row level security;
revoke all on app_private.repository_wbs_policies,app_private.repository_wbs_governance,app_private.repository_wbs_proposals,app_private.repository_wbs_proposal_versions,app_private.repository_wbs_reviews,app_private.repository_wbs_baselines,app_private.repository_wbs_governance_commands from public,anon,authenticated,line_app;
grant select,insert,update on app_private.repository_wbs_governance,app_private.repository_wbs_proposals to line_app;
grant select,insert on app_private.repository_wbs_policies,app_private.repository_wbs_proposal_versions,app_private.repository_wbs_reviews,app_private.repository_wbs_baselines,app_private.repository_wbs_governance_commands to line_app;
create policy backend on app_private.repository_wbs_governance for all to line_app using(true) with check(true);
create policy backend on app_private.repository_wbs_proposals for all to line_app using(true) with check(true);
create policy backend_read on app_private.repository_wbs_proposal_versions for select to line_app using(true);
create policy backend_insert on app_private.repository_wbs_proposal_versions for insert to line_app with check(true);
create policy backend_read on app_private.repository_wbs_policies for select to line_app using(true);
create policy backend_insert on app_private.repository_wbs_policies for insert to line_app with check(true);
create policy backend_read on app_private.repository_wbs_reviews for select to line_app using(true);
create policy backend_insert on app_private.repository_wbs_reviews for insert to line_app with check(true);
create policy backend_read on app_private.repository_wbs_baselines for select to line_app using(true);
create policy backend_insert on app_private.repository_wbs_baselines for insert to line_app with check(true);
create policy backend_read on app_private.repository_wbs_governance_commands for select to line_app using(true);
create policy backend_insert on app_private.repository_wbs_governance_commands for insert to line_app with check(true);
