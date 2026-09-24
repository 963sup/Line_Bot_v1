-- Partner referral/management command receipts.

create table app_private."partner_referral_commands" (
  "actor" text not null,
  "request_id" uuid not null,
  "fingerprint" text not null,
  "result" jsonb not null,
  "action" text not null,
  "created_at" bigint not null,
  constraint "partner_referral_commands_pkey" PRIMARY KEY (actor, request_id),
  constraint "partner_referral_commands_action_check" CHECK ((action = ANY (ARRAY['refer'::text, 'review'::text, 'withdraw'::text]))),
  constraint "partner_referral_commands_actor_fkey" FOREIGN KEY (actor) REFERENCES app_private.users(id)
);
alter table app_private."partner_referral_commands" enable row level security;
revoke all on app_private."partner_referral_commands" from public, anon, authenticated, line_app;
grant insert, select on app_private."partner_referral_commands" to line_app;
create policy "backend" on app_private."partner_referral_commands" as permissive for all to "line_app" using (true) with check (true);

create table app_private."partner_management_commands" (
  "actor" text not null,
  "request_id" uuid not null,
  "fingerprint" text not null,
  "partner_id" uuid not null,
  "previous_version" integer not null,
  "version" integer not null,
  "reason" text not null,
  "consent_confirmed" boolean not null,
  "result" jsonb not null,
  "created_at" bigint not null,
  constraint "partner_management_commands_pkey" PRIMARY KEY (actor, request_id),
  constraint "partner_management_commands_consent_confirmed_check" CHECK (consent_confirmed),
  constraint "partner_management_commands_reason_check" CHECK (((length(reason) >= 1) AND (length(reason) <= 500))),
  constraint "partner_management_commands_actor_fkey" FOREIGN KEY (actor) REFERENCES app_private.users(id),
  constraint "partner_management_commands_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES app_private.partners(id)
);
alter table app_private."partner_management_commands" enable row level security;
revoke all on app_private."partner_management_commands" from public, anon, authenticated, line_app;
grant insert, select on app_private."partner_management_commands" to line_app;
create policy "backend_insert" on app_private."partner_management_commands" as permissive for insert to "line_app" with check (true);
create policy "backend_read" on app_private."partner_management_commands" as permissive for select to "line_app" using (true);
