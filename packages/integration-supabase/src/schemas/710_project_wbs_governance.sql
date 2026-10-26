-- Project WBS governance has its own version; content Revision numbers never change for reviews.
create table app_private.project_wbs_policies (
  project_id text not null references app_private.project_wbs(project_id),
  version integer not null check(version > 0),
  minimum_approvals integer not null check(minimum_approvals between 1 and 10),
  allow_self_approval boolean not null,
  actor_user_id text not null references app_private.users(id),
  at bigint not null,
  primary key(project_id,version)
);
create table app_private.project_wbs_governance (
  project_id text primary key references app_private.project_wbs(project_id),
  version integer not null check(version >= 0),
  policy_version integer not null,
  published_baseline_id uuid,
  foreign key(project_id,policy_version) references app_private.project_wbs_policies(project_id,version)
);
create table app_private.project_wbs_proposals (
  id uuid primary key,
  project_id text not null references app_private.project_wbs_governance(project_id),
  number integer not null check(number > 0),
  version integer not null check(version > 0),
  author_user_id text not null references app_private.users(id),
  created_at bigint not null,
  unique(project_id,id),
  unique(project_id,number)
);
create table app_private.project_wbs_proposal_versions (
  project_id text not null,
  proposal_id uuid not null,
  version integer not null check(version > 0),
  title text not null check(length(btrim(title)) between 1 and 200),
  reason text not null check(length(reason) <= 10000),
  status text not null check(status in ('OPEN','CLOSED','PUBLISHED')),
  candidate_revision_id uuid not null,
  base_baseline_id uuid,
  actor_user_id text not null references app_private.users(id),
  at bigint not null,
  primary key(project_id,proposal_id,version),
  unique(project_id,proposal_id,version,candidate_revision_id),
  foreign key(project_id,proposal_id) references app_private.project_wbs_proposals(project_id,id),
  foreign key(project_id,candidate_revision_id) references app_private.project_wbs_revisions(project_id,id)
);
alter table app_private.project_wbs_proposals add constraint project_wbs_proposal_head_fkey
  foreign key(project_id,id,version) references app_private.project_wbs_proposal_versions(project_id,proposal_id,version) deferrable initially deferred;
create table app_private.project_wbs_reviews (
  id uuid primary key,
  project_id text not null,
  proposal_id uuid not null,
  proposal_version integer not null check(proposal_version > 0),
  candidate_revision_id uuid not null,
  policy_version integer not null,
  reviewer_user_id text not null references app_private.users(id),
  decision text not null check(decision in ('APPROVE','REQUEST_CHANGES')),
  note text not null check(length(note) <= 2000),
  sequence integer not null check(sequence > 0),
  at bigint not null,
  unique(project_id,sequence),
  foreign key(project_id,proposal_id,proposal_version,candidate_revision_id) references app_private.project_wbs_proposal_versions(project_id,proposal_id,version,candidate_revision_id),
  foreign key(project_id,policy_version) references app_private.project_wbs_policies(project_id,version)
);
create index project_wbs_reviews_proposal on app_private.project_wbs_reviews(project_id,proposal_id,proposal_version,reviewer_user_id,sequence desc);
create table app_private.project_wbs_baselines (
  id uuid primary key,
  project_id text not null,
  number integer not null check(number > 0),
  proposal_id uuid not null,
  proposal_version integer not null check(proposal_version > 0),
  revision_id uuid not null,
  previous_baseline_id uuid,
  policy_version integer not null,
  published_by text not null references app_private.users(id),
  approval_review_ids uuid[] not null check(cardinality(approval_review_ids)>0),
  at bigint not null,
  unique(project_id,id),
  unique(project_id,number),
  unique(project_id,proposal_id),
  foreign key(project_id,proposal_id,proposal_version,revision_id) references app_private.project_wbs_proposal_versions(project_id,proposal_id,version,candidate_revision_id),
  foreign key(project_id,previous_baseline_id) references app_private.project_wbs_baselines(project_id,id),
  foreign key(project_id,policy_version) references app_private.project_wbs_policies(project_id,version)
);
alter table app_private.project_wbs_proposal_versions add constraint project_wbs_proposal_base_fkey
  foreign key(project_id,base_baseline_id) references app_private.project_wbs_baselines(project_id,id);
alter table app_private.project_wbs_governance add constraint project_wbs_published_baseline_fkey
  foreign key(project_id,published_baseline_id) references app_private.project_wbs_baselines(project_id,id);
create table app_private.project_wbs_governance_commands (
  actor_user_id text not null references app_private.users(id),
  request_id uuid not null,
  project_id text not null references app_private.project_wbs_governance(project_id),
  fingerprint text not null,
  result jsonb not null check(jsonb_typeof(result)='object'),
  primary key(actor_user_id,request_id)
);
alter table app_private.project_wbs_policies enable row level security;
alter table app_private.project_wbs_governance enable row level security;
alter table app_private.project_wbs_proposals enable row level security;
alter table app_private.project_wbs_proposal_versions enable row level security;
alter table app_private.project_wbs_reviews enable row level security;
alter table app_private.project_wbs_baselines enable row level security;
alter table app_private.project_wbs_governance_commands enable row level security;
revoke all on app_private.project_wbs_policies,app_private.project_wbs_governance,app_private.project_wbs_proposals,app_private.project_wbs_proposal_versions,app_private.project_wbs_reviews,app_private.project_wbs_baselines,app_private.project_wbs_governance_commands from public,anon,authenticated,line_app;
grant select,insert,update on app_private.project_wbs_governance,app_private.project_wbs_proposals to line_app;
grant select,insert on app_private.project_wbs_policies,app_private.project_wbs_proposal_versions,app_private.project_wbs_reviews,app_private.project_wbs_baselines,app_private.project_wbs_governance_commands to line_app;
create policy backend on app_private.project_wbs_governance for all to line_app using(true) with check(true);
create policy backend on app_private.project_wbs_proposals for all to line_app using(true) with check(true);
create policy backend_read on app_private.project_wbs_proposal_versions for select to line_app using(true);
create policy backend_insert on app_private.project_wbs_proposal_versions for insert to line_app with check(true);
create policy backend_read on app_private.project_wbs_policies for select to line_app using(true);
create policy backend_insert on app_private.project_wbs_policies for insert to line_app with check(true);
create policy backend_read on app_private.project_wbs_reviews for select to line_app using(true);
create policy backend_insert on app_private.project_wbs_reviews for insert to line_app with check(true);
create policy backend_read on app_private.project_wbs_baselines for select to line_app using(true);
create policy backend_insert on app_private.project_wbs_baselines for insert to line_app with check(true);
create policy backend_read on app_private.project_wbs_governance_commands for select to line_app using(true);
create policy backend_insert on app_private.project_wbs_governance_commands for insert to line_app with check(true);
