-- DailyCheckIn owns the durable reward outcome; Ledger owns the value fact.
-- The claim row and Ledger credit are committed by the runtime in one transaction.

create table app_private.daily_check_in_claims (
  user_id text not null,
  business_day text not null,
  prize_code text not null,
  reward_asset_code app_private.asset_code not null,
  reward_amount_units integer not null,
  policy_version text not null,
  decided_at bigint not null,
  constraint daily_check_in_claims_pkey primary key (user_id, business_day),
  constraint daily_check_in_claims_user_id_fkey foreign key (user_id) references app_private.users(id),
  constraint daily_check_in_claims_business_day_check check (business_day ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  constraint daily_check_in_claims_reward_amount_units_check check (reward_amount_units > 0),
  constraint daily_check_in_claims_decided_at_check check (decided_at >= 0),
  constraint daily_check_in_claims_policy_check check (
    policy_version = 'wheel-v1'
    and reward_asset_code = 'coin'::app_private.asset_code
    and (
      (prize_code = 'coin-half' and reward_amount_units = 1)
      or (prize_code = 'coin-one' and reward_amount_units = 2)
      or (prize_code = 'coin-four' and reward_amount_units = 8)
    )
  )
);
alter table app_private.daily_check_in_claims enable row level security;
revoke all on app_private.daily_check_in_claims from public, anon, authenticated, line_app;
grant select, insert on app_private.daily_check_in_claims to line_app;
create policy backend_read on app_private.daily_check_in_claims
  for select to line_app using (true);
create policy backend_insert on app_private.daily_check_in_claims
  for insert to line_app with check (true);
