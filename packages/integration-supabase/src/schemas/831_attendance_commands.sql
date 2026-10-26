-- Attendance replay command receipts.

create table app_private."attendance_commands" (
  "uid" text not null,
  "request_id" uuid not null,
  "fingerprint" text not null,
  "result" jsonb not null,
  "at" bigint not null,
  constraint "attendance_commands_pkey" PRIMARY KEY (uid, request_id),
  constraint "attendance_commands_uid_fkey" FOREIGN KEY (uid) REFERENCES app_private.users(id)
);
alter table app_private."attendance_commands" enable row level security;
revoke all on app_private."attendance_commands" from public, anon, authenticated, line_app;
grant insert, select on app_private."attendance_commands" to line_app;
create policy "backend" on app_private."attendance_commands" as permissive for all to "line_app" using (true) with check (true);
