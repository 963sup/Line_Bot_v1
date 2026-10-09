-- Attendance-owned requests to append or close a proposed historical session.

create table app_private."attendance_supplement_requests" (
  "id" uuid not null,
  "uid" text not null,
  "repository_id" text not null,
  "kind" text not null,
  "session_id" uuid,
  "started_at" bigint,
  "ended_at" bigint not null,
  "site_snapshot" jsonb,
  "reason" text not null,
  "submitted_at" bigint not null,
  "status" text default 'PENDING' not null,
  "version" integer default 0 not null,
  "reviewer_uid" text,
  "reviewed_at" bigint,
  "review_reason" text,
  constraint "attendance_supplement_requests_pkey" PRIMARY KEY (id),
  constraint "attendance_supplement_requests_uid_fkey" FOREIGN KEY (uid) REFERENCES app_private.users(id),
  constraint "attendance_supplement_requests_repository_fkey" FOREIGN KEY (repository_id) REFERENCES app_private.repositories(id),
  constraint "attendance_supplement_requests_session_fkey" FOREIGN KEY (session_id) REFERENCES app_private.attendance_sessions(id),
  constraint "attendance_supplement_requests_reviewer_fkey" FOREIGN KEY (reviewer_uid) REFERENCES app_private.users(id),
  constraint "attendance_supplement_requests_kind_check" CHECK (kind = ANY (ARRAY['new-session'::text, 'close-session'::text])),
  constraint "attendance_supplement_requests_time_check" CHECK (
    ended_at >= 0 AND submitted_at >= 0 AND
    ((kind = 'new-session' AND session_id IS NULL AND started_at IS NOT NULL
      AND started_at >= 0 AND ended_at > started_at
      AND site_snapshot IS NOT NULL AND jsonb_typeof(site_snapshot) = 'object'
      AND site_snapshot ?& array['repositoryId','id','name','address','latitude','longitude','radius','version']
      AND (site_snapshot->>'repositoryId') IS NOT DISTINCT FROM repository_id
      AND (site_snapshot->>'id') IS NOT DISTINCT FROM repository_id)
     OR (kind = 'close-session' AND session_id IS NOT NULL AND started_at IS NULL
       AND site_snapshot IS NOT NULL AND jsonb_typeof(site_snapshot) = 'object'
       AND site_snapshot ?& array['repositoryId','id','name','address','latitude','longitude','radius','version']
       AND (site_snapshot->>'repositoryId') IS NOT DISTINCT FROM repository_id
       AND (site_snapshot->>'id') IS NOT DISTINCT FROM repository_id))
  ),
  constraint "attendance_supplement_requests_reason_check" CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  constraint "attendance_supplement_requests_status_check" CHECK (status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'REJECTED'::text])),
  constraint "attendance_supplement_requests_version_check" CHECK (version >= 0),
  constraint "attendance_supplement_requests_review_check" CHECK (
    (status = 'PENDING' AND reviewer_uid IS NULL AND reviewed_at IS NULL AND review_reason IS NULL)
    OR (status IN ('APPROVED','REJECTED') AND reviewer_uid IS NOT NULL
      AND reviewer_uid <> uid AND reviewed_at IS NOT NULL AND reviewed_at >= 0
      AND (status <> 'REJECTED' OR length(btrim(review_reason)) BETWEEN 1 AND 500))
  )
);
create index attendance_supplement_member_time
  ON app_private.attendance_supplement_requests USING btree (uid, submitted_at DESC, id);
create index attendance_supplement_pending_repository
  ON app_private.attendance_supplement_requests USING btree (repository_id, submitted_at, id)
  WHERE status = 'PENDING';
alter table app_private."attendance_supplement_requests" enable row level security;
revoke all on app_private."attendance_supplement_requests" from public, anon, authenticated, line_app;
grant insert, select, update on app_private."attendance_supplement_requests" to line_app;
create policy "backend" on app_private."attendance_supplement_requests" as permissive for all to "line_app" using (true) with check (true);

CREATE OR REPLACE FUNCTION app_private.check_attendance_supplement_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'app_private', 'pg_catalog'
AS $function$
begin
 if tg_op='INSERT' then
   if new.status<>'PENDING' or new.version<>0 or new.reviewer_uid is not null
     or new.reviewed_at is not null or new.review_reason is not null then
     raise exception 'attendance_supplement_initial_state_invalid' using errcode='23514';
   end if;
   return new;
 end if;

 if old.id<>new.id or old.uid<>new.uid or old.repository_id<>new.repository_id
   or old.kind<>new.kind or old.session_id is distinct from new.session_id
   or old.started_at is distinct from new.started_at or old.ended_at<>new.ended_at
   or old.site_snapshot is distinct from new.site_snapshot or old.reason<>new.reason
   or old.submitted_at<>new.submitted_at or old.status<>'PENDING'
   or new.status='PENDING' or new.version<>old.version+1 then
   raise exception 'attendance_supplement_source_immutable' using errcode='23514';
 end if;
 return new;
end $function$;
revoke all on function app_private."check_attendance_supplement_request"() from public, anon, authenticated, line_app;
grant execute on function app_private."check_attendance_supplement_request"() to line_app;
CREATE TRIGGER attendance_supplement_request_guard
  BEFORE INSERT OR UPDATE ON app_private.attendance_supplement_requests
  FOR EACH ROW EXECUTE FUNCTION app_private.check_attendance_supplement_request();
