-- Receipt intake intent owned by Expense.

create table app_private."receipt_intents" (
  "scope" text not null,
  "owner" text not null,
  "expires" bigint not null,
  constraint "receipt_intents_pkey" PRIMARY KEY (scope, owner),
  constraint "receipt_intents_owner_fkey" FOREIGN KEY (owner) REFERENCES app_private.users(id)
);
CREATE INDEX intents_expires ON app_private.receipt_intents USING btree (expires);
CREATE INDEX receipt_intents_owner_idx ON app_private.receipt_intents USING btree (owner);
alter table app_private."receipt_intents" enable row level security;
revoke all on app_private."receipt_intents" from public, anon, authenticated, line_app;
grant delete, insert, select, update on app_private."receipt_intents" to line_app;
create policy "backend" on app_private."receipt_intents" as permissive for all to "line_app" using (true) with check (true);
