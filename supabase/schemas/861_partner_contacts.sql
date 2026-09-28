-- Partner contact relationship.

create table app_private."partner_contacts" (
  "id" uuid not null,
  "partner_id" uuid not null,
  "name" text not null,
  "responsibility" text not null,
  "status" text not null,
  "created_at" bigint not null,
  "created_by" text not null,
  "phone" text default ''::text not null,
  "email" text default ''::text not null,
  "line" text default ''::text not null,
  constraint "partner_contacts_pkey" PRIMARY KEY (id),
  constraint "contact_channel_required" CHECK ((((length(phone) + length(email)) + length(line)) > 0)),
  constraint "contact_channels_bounded" CHECK (((length(phone) <= 160) AND (length(email) <= 160) AND (length(line) <= 160))),
  constraint "partner_contacts_name_check" CHECK (((length(name) >= 1) AND (length(name) <= 80))),
  constraint "partner_contacts_responsibility_check" CHECK (((length(responsibility) >= 1) AND (length(responsibility) <= 160))),
  constraint "partner_contacts_status_check" CHECK ((status = ANY (ARRAY['published'::text, 'unlisted'::text]))),
  constraint "partner_contacts_created_by_fkey" FOREIGN KEY (created_by) REFERENCES app_private.users(id),
  constraint "partner_contacts_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES app_private.partners(id)
);
CREATE INDEX partner_contacts_public_lookup ON app_private.partner_contacts USING btree (status, partner_id, name, id);
alter table app_private."partner_contacts" enable row level security;
revoke all on app_private."partner_contacts" from public, anon, authenticated, line_app;
grant insert, select, update on app_private."partner_contacts" to line_app;
create policy "backend" on app_private."partner_contacts" as permissive for all to "line_app" using (true) with check (true);
