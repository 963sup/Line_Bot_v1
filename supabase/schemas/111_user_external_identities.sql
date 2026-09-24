-- External identity bindings owned by User identity mapping.

create table app_private."user_identities" (
  "provider" text not null,
  "subject" text not null,
  "user_id" text not null,
  "email" text,
  constraint "user_identities_pkey" PRIMARY KEY (provider, subject),
  constraint "user_identities_user_id_provider_key" UNIQUE (user_id, provider),
  constraint "user_identities_user_id_fkey" FOREIGN KEY (user_id) REFERENCES app_private.users(id)
);
alter table app_private."user_identities" enable row level security;
revoke all on app_private."user_identities" from public, anon, authenticated, line_app;
grant delete, insert, select, update on app_private."user_identities" to line_app;
create policy "backend" on app_private."user_identities" as permissive for all to "line_app" using (true) with check (true);

