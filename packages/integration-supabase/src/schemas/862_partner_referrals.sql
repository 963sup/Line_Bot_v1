-- Partner referral aggregate.

create table app_private."partner_referrals" (
  "id" uuid not null,
  "submitter" text not null,
  "partner_name" text not null,
  "category" text not null,
  "region" text default ''::text not null,
  "contact_name" text not null,
  "responsibility" text not null,
  "method" text not null,
  "value" text not null,
  "reason" text not null,
  "status" text not null,
  "submitted_at" bigint not null,
  "reviewed_by" text,
  "reviewed_at" bigint,
  "review_note" text default ''::text not null,
  "partner_id" uuid,
  "contact_id" uuid,
  constraint "partner_referrals_pkey" PRIMARY KEY (id),
  constraint "partner_referrals_category_check" CHECK (((length(category) >= 1) AND (length(category) <= 80))),
  constraint "partner_referrals_check" CHECK ((((status = 'pending'::text) AND (reviewed_at IS NULL)) OR ((status <> 'pending'::text) AND (reviewed_at IS NOT NULL)))),
  constraint "partner_referrals_check1" CHECK (((status = 'successful'::text) = ((partner_id IS NOT NULL) AND (contact_id IS NOT NULL)))),
  constraint "partner_referrals_contact_name_check" CHECK (((length(contact_name) >= 1) AND (length(contact_name) <= 80))),
  constraint "partner_referrals_method_check" CHECK ((method = ANY (ARRAY['phone'::text, 'email'::text, 'line'::text]))),
  constraint "partner_referrals_partner_name_check" CHECK (((length(partner_name) >= 1) AND (length(partner_name) <= 120))),
  constraint "partner_referrals_reason_check" CHECK (((length(reason) >= 1) AND (length(reason) <= 500))),
  constraint "partner_referrals_region_check" CHECK ((length(region) <= 80)),
  constraint "partner_referrals_responsibility_check" CHECK (((length(responsibility) >= 1) AND (length(responsibility) <= 160))),
  constraint "partner_referrals_review_note_check" CHECK ((length(review_note) <= 500)),
  constraint "partner_referrals_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'successful'::text, 'rejected'::text, 'withdrawn'::text]))),
  constraint "partner_referrals_value_check" CHECK (((length(value) >= 1) AND (length(value) <= 160))),
  constraint "partner_referrals_contact_id_fkey" FOREIGN KEY (contact_id) REFERENCES app_private.partner_contacts(id),
  constraint "partner_referrals_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES app_private.partners(id),
  constraint "partner_referrals_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES app_private.users(id),
  constraint "partner_referrals_submitter_fkey" FOREIGN KEY (submitter) REFERENCES app_private.users(id)
);
CREATE INDEX partner_referrals_submitter_lookup ON app_private.partner_referrals USING btree (submitter, submitted_at DESC, id DESC);
CREATE INDEX partner_referrals_success_lookup ON app_private.partner_referrals USING btree (status, reviewed_at DESC, id DESC) WHERE (status = 'successful'::text);
alter table app_private."partner_referrals" enable row level security;
revoke all on app_private."partner_referrals" from public, anon, authenticated, line_app;
grant insert, select, update on app_private."partner_referrals" to line_app;
create policy "backend" on app_private."partner_referrals" as permissive for all to "line_app" using (true) with check (true);
