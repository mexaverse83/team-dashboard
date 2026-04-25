-- ─── Auto-categorization & automation rules ─────────────────────────────────
-- Rules that automatically categorize transactions on insert based on merchant
-- patterns. Supports learned rules (from history) and manual rules.

create table if not exists finance_rules (
  id uuid primary key default gen_random_uuid(),
  -- Match config
  merchant_pattern text not null,           -- substring match (case-insensitive); supports * as wildcard
  match_mode text not null default 'contains' check (match_mode in ('contains', 'exact', 'starts_with')),
  amount_min numeric,                       -- optional: only match if amount >= this
  amount_max numeric,                       -- optional: only match if amount <= this
  owner text,                               -- optional: only match for this owner
  -- Action: assign category and tags
  category_id uuid references finance_categories(id) on delete set null,
  tags text[] default '{}',
  -- Bookkeeping
  priority integer not null default 100,    -- lower = checked first
  is_active boolean not null default true,
  learned boolean not null default false,   -- created automatically vs by user
  match_count integer not null default 0,
  last_matched_at timestamptz,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_finance_rules_active on finance_rules(is_active);
create index if not exists idx_finance_rules_pattern on finance_rules(merchant_pattern);

alter table finance_rules enable row level security;

-- Open access for the dashboard (matches other finance tables' RLS pattern)
drop policy if exists "finance_rules_all" on finance_rules;
create policy "finance_rules_all" on finance_rules for all using (true) with check (true);

-- ─── Anomaly / duplicate flags on transactions ───────────────────────────────
-- Mark transactions that price-changed vs subscription, or look like duplicates.
do $$
begin
  if not exists (select 1 from information_schema.columns
    where table_name = 'finance_transactions' and column_name = 'flags') then
    alter table finance_transactions add column flags text[] default '{}';
  end if;
end$$;

create index if not exists idx_finance_transactions_flags on finance_transactions using gin(flags);

-- ─── Net worth snapshots (daily) ─────────────────────────────────────────────
create table if not exists finance_net_worth_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null unique,
  total_assets numeric not null default 0,
  total_liabilities numeric not null default 0,
  net_worth numeric generated always as (total_assets - total_liabilities) stored,
  -- Breakdown by class for trend charts
  cash_amount numeric default 0,
  crypto_amount numeric default 0,
  stocks_amount numeric default 0,
  fixed_income_amount numeric default 0,
  real_estate_amount numeric default 0,
  retirement_amount numeric default 0,
  notes text,
  created_at timestamptz default now()
);

create index if not exists idx_nws_date on finance_net_worth_snapshots(snapshot_date desc);
alter table finance_net_worth_snapshots enable row level security;
drop policy if exists "finance_nws_all" on finance_net_worth_snapshots;
create policy "finance_nws_all" on finance_net_worth_snapshots for all using (true) with check (true);
