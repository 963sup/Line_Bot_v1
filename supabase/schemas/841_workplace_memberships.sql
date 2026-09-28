-- Workplace membership relationship.

create table app_private."workplace_members" (
  "workplace_id" uuid not null,
  "member_id" text not null,
  constraint "workplace_members_pkey" PRIMARY KEY (workplace_id, member_id),
  constraint "workplace_members_member_id_fkey" FOREIGN KEY (member_id) REFERENCES app_private.users(id),
  constraint "workplace_members_workplace_id_fkey" FOREIGN KEY (workplace_id) REFERENCES app_private.workplaces(id)
);
CREATE INDEX workplace_members_member ON app_private.workplace_members USING btree (member_id, workplace_id);
alter table app_private."workplace_members" enable row level security;
revoke all on app_private."workplace_members" from public, anon, authenticated, line_app;
grant delete, insert, select on app_private."workplace_members" to line_app;
create policy "backend" on app_private."workplace_members" as permissive for all to "line_app" using (true) with check (true);
