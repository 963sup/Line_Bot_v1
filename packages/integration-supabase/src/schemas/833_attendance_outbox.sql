-- Attendance delivery outboxes.

create table app_private."attendance_menu_outbox" (
  "uid" text not null,
  "state" text not null,
  "revision" integer not null,
  "synced_revision" integer default '-1'::integer not null,
  "available_at" bigint not null,
  "attempts" integer default 0 not null,
  "lease_token" text,
  "lease_until" bigint,
  constraint "attendance_menu_outbox_pkey" PRIMARY KEY (uid),
  constraint "attendance_menu_outbox_check" CHECK (((lease_token IS NULL) = (lease_until IS NULL))),
  constraint "attendance_menu_outbox_revision_check" CHECK ((revision >= 0)),
  constraint "attendance_menu_outbox_state_check" CHECK ((state = ANY (ARRAY['ready'::text, 'working'::text]))),
  constraint "attendance_menu_outbox_uid_fkey" FOREIGN KEY (uid) REFERENCES app_private.users(id)
);
alter table app_private."attendance_menu_outbox" enable row level security;
revoke all on app_private."attendance_menu_outbox" from public, anon, authenticated, line_app;
grant insert, select, update on app_private."attendance_menu_outbox" to line_app;
create policy "backend" on app_private."attendance_menu_outbox" as permissive for all to "line_app" using (true) with check (true);

create table app_private."attendance_notification_outbox" (
  "id" uuid not null,
  "uid" text not null,
  "provider" text not null,
  "subject" text not null,
  "revision" integer not null,
  "payload" jsonb not null,
  "created_at" bigint not null,
  "status" text default 'pending'::text not null,
  "first_attempt_at" bigint,
  "available_at" bigint not null,
  "attempts" integer default 0 not null,
  "lease_token" uuid,
  "lease_until" bigint,
  constraint "attendance_notification_outbox_pkey" PRIMARY KEY (id),
  constraint "attendance_notification_outbox_uid_revision_key" UNIQUE (uid, revision),
  constraint "attendance_notification_outbox_check" CHECK (((lease_token IS NULL) = (lease_until IS NULL))),
  constraint "attendance_notification_outbox_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'failed'::text, 'expired'::text]))),
  constraint "attendance_notification_outbox_subject_check" CHECK ((subject ~ '^U[0-9a-fA-F]{32}$'::text)),
  constraint "attendance_notification_outbox_uid_fkey" FOREIGN KEY (uid) REFERENCES app_private.users(id)
);
CREATE INDEX attendance_notification_pending ON app_private.attendance_notification_outbox USING btree (available_at, uid, revision) WHERE (status = 'pending'::text);
alter table app_private."attendance_notification_outbox" enable row level security;
revoke all on app_private."attendance_notification_outbox" from public, anon, authenticated, line_app;
grant insert, select, update on app_private."attendance_notification_outbox" to line_app;
create policy "backend" on app_private."attendance_notification_outbox" as permissive for all to "line_app" using (true) with check (true);

-- Cross-boundary Auth read is encapsulated behind an app-owned SECURITY DEFINER function.
-- line_app receives EXECUTE only and never direct auth schema/table privileges.
