-- Attendance state/session facts and Auth qualification boundary.

-- 打卡事實、事件、重播回執與可靠通知。依賴：membership；member_attendance 僅保留歷史相容。
-- Current attendance structure. Edit here; historical SQL is retained in Git (see supabase/README.md).

create table app_private."member_attendance" (
  "uid" text not null,
  "day" text not null,
  "action" text not null,
  "at" bigint not null,
  "latitude" double precision not null,
  "longitude" double precision not null,
  "accuracy" double precision not null,
  "distance" double precision not null,
  "site_latitude" double precision not null,
  "site_longitude" double precision not null,
  "radius" double precision not null,
  constraint "member_attendance_pkey" PRIMARY KEY (uid, day, action),
  constraint "member_attendance_action_check" CHECK ((action = ANY (ARRAY['clockIn'::text, 'clockOut'::text]))),
  constraint "member_attendance_uid_fkey" FOREIGN KEY (uid) REFERENCES app_private.users(id)
);
alter table app_private."member_attendance" enable row level security;
revoke all on app_private."member_attendance" from public, anon, authenticated, line_app;
grant delete, select on app_private."member_attendance" to line_app;
create policy "backend" on app_private."member_attendance" as permissive for all to "line_app" using (true) with check (true);

create table app_private."attendance_state" (
  "uid" text not null,
  "version" integer default 0 not null,
  constraint "attendance_state_pkey" PRIMARY KEY (uid),
  constraint "attendance_state_version_check" CHECK ((version >= 0)),
  constraint "attendance_state_uid_fkey" FOREIGN KEY (uid) REFERENCES app_private.users(id)
);
alter table app_private."attendance_state" enable row level security;
revoke all on app_private."attendance_state" from public, anon, authenticated, line_app;
grant insert, select, update on app_private."attendance_state" to line_app;
create policy "backend" on app_private."attendance_state" as permissive for all to "line_app" using (true) with check (true);

create table app_private."attendance_sessions" (
  "id" uuid not null,
  "uid" text not null,
  "day" text not null,
  "started_at" bigint not null,
  "ended_at" bigint,
  "rule_version" text not null,
  constraint "attendance_sessions_pkey" PRIMARY KEY (id),
  constraint "attendance_sessions_check" CHECK (((ended_at IS NULL) OR (ended_at >= started_at))),
  constraint "attendance_sessions_day_check" CHECK ((day ~ '^\d{4}-\d{2}-\d{2}$'::text)),
  constraint "attendance_sessions_rule_version_check" CHECK ((rule_version = 'taipei-window-v1'::text)),
  constraint "attendance_sessions_started_at_check" CHECK ((started_at >= 0)),
  constraint "attendance_sessions_uid_fkey" FOREIGN KEY (uid) REFERENCES app_private.users(id)
);
CREATE INDEX attendance_session_member_time ON app_private.attendance_sessions USING btree (uid, started_at);
CREATE UNIQUE INDEX attendance_session_one_open ON app_private.attendance_sessions USING btree (uid) WHERE (ended_at IS NULL);
alter table app_private."attendance_sessions" enable row level security;
revoke all on app_private."attendance_sessions" from public, anon, authenticated, line_app;
grant insert, select, update on app_private."attendance_sessions" to line_app;
create policy "backend" on app_private."attendance_sessions" as permissive for all to "line_app" using (true) with check (true);
CREATE OR REPLACE FUNCTION app_private.attendance_account_active(account_id uuid, at_ms bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = account_id AND deleted_at IS NULL
      AND (banned_until IS NULL OR banned_until <= pg_catalog.to_timestamp(at_ms / 1000.0))
      AND NOT COALESCE(is_anonymous, false)
  );
$function$;
revoke all on function app_private."attendance_account_active"(account_id uuid, at_ms bigint) from public, anon, authenticated, line_app;
grant execute on function app_private."attendance_account_active"(account_id uuid, at_ms bigint) to line_app;

CREATE OR REPLACE FUNCTION app_private.check_attendance_session()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'app_private', 'pg_catalog'
AS $function$
begin
 perform id from users where id=new.uid for update;
 if tg_op='UPDATE' and (old.id<>new.id or old.uid<>new.uid or old.day<>new.day
   or old.started_at<>new.started_at or old.rule_version<>new.rule_version
   or old.ended_at is not null or new.ended_at is null) then
   raise exception 'attendance_source_immutable' using errcode='23514';
 end if;
 if new.day<>to_char(to_timestamp(new.started_at/1000.0) at time zone 'Asia/Taipei','YYYY-MM-DD') then
   raise exception 'attendance_day_mismatch' using errcode='23514';
 end if;
 if exists(select 1 from attendance_sessions s where s.uid=new.uid and s.id<>new.id
   and (s.ended_at is null or s.ended_at>new.started_at)
   and (new.ended_at is null or new.ended_at>s.started_at)) then
   raise exception 'attendance_overlap' using errcode='23514';
 end if;
 return new;
end $function$;
revoke all on function app_private."check_attendance_session"() from public, anon, authenticated, line_app;
grant execute on function app_private."check_attendance_session"() to line_app;
CREATE TRIGGER attendance_session_guard BEFORE INSERT OR UPDATE ON app_private.attendance_sessions FOR EACH ROW EXECUTE FUNCTION app_private.check_attendance_session();
