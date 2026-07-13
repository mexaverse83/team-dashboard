-- Consolidated schema for a FRESH demo Supabase project (Mario & Karla clone).
-- Generated from the repo migration files; contains NO data.
-- Run once in the new project: SQL Editor → paste all → Run.

CREATE TABLE IF NOT EXISTS crypto_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id UUID NOT NULL REFERENCES finance_crypto_holdings(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('buy', 'sell')),
  quantity NUMERIC(18,8) NOT NULL,
  price_per_coin_mxn NUMERIC(14,2) NOT NULL,
  total_mxn NUMERIC(14,2) NOT NULL,
  fee_mxn NUMERIC(10,2) DEFAULT 0,
  exchange TEXT,
  notes TEXT,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_audit_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  report_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES finance_categories(id),
  month DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(category_id, month)
);

CREATE TABLE IF NOT EXISTS finance_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  icon TEXT,
  color TEXT,
  type TEXT NOT NULL CHECK (type IN ('expense', 'income', 'both')),
  is_default BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_crypto_holdings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  symbol TEXT NOT NULL CHECK (symbol IN ('BTC', 'ETH', 'SOL')),
  name TEXT NOT NULL,
  quantity NUMERIC(18,8) NOT NULL DEFAULT 0,
  avg_cost_basis_usd NUMERIC(12,2),
  wallet_address TEXT,
  owner TEXT NOT NULL DEFAULT 'Bernardo',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_debt_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_id uuid REFERENCES finance_debts(id) ON DELETE CASCADE,
  payment_date date NOT NULL,
  amount numeric(12,2) NOT NULL,
  principal_portion numeric(12,2) NOT NULL,
  interest_portion numeric(12,2) NOT NULL,
  remaining_balance numeric(12,2) NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  creditor TEXT,
  balance NUMERIC(12,2) NOT NULL,
  interest_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  minimum_payment NUMERIC(12,2) NOT NULL DEFAULT 0,
  type TEXT NOT NULL CHECK (type IN ('credit_card', 'personal_loan', 'auto_loan', 'mortgage', 'student_loan', 'medical', 'other')),
  start_date DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_emergency_fund (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_months INTEGER NOT NULL DEFAULT 6,
  target_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  current_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  risk_score INTEGER CHECK (risk_score BETWEEN 1 AND 10),
  account_allocation_json JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_fixed_income (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  instrument_type TEXT NOT NULL,
  name TEXT NOT NULL,
  institution TEXT NOT NULL,
  principal NUMERIC(14,2) NOT NULL,
  annual_rate NUMERIC(6,4),
  term_days INT,
  maturity_date DATE,
  is_liquid BOOLEAN DEFAULT false,
  auto_renew BOOLEAN DEFAULT false,
  owner TEXT DEFAULT 'bernardo',
  tier INT DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  target_amount NUMERIC(12,2) NOT NULL,
  current_amount NUMERIC(12,2) DEFAULT 0,
  target_date DATE,
  is_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_income_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('salary', 'freelance', 'passive', 'side_hustle', 'investment', 'other')),
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'MXN',
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  merchant text,
  total_amount numeric(12,2) NOT NULL,
  installment_count integer NOT NULL CHECK (installment_count > 0),
  installment_amount numeric(12,2) NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  payments_made integer DEFAULT 0 CHECK (payments_made >= 0),
  credit_card text,
  category_id uuid REFERENCES finance_categories(id),
  is_active boolean DEFAULT true,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_monthly_savings (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  month                DATE          NOT NULL,
  owner                TEXT          NOT NULL,
  gross_income         NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_expenses       NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_savings          NUMERIC(12,2) GENERATED ALWAYS AS (gross_income - total_expenses) STORED,
  savings_rate         NUMERIC(5,2)  GENERATED ALWAYS AS (
    CASE WHEN gross_income > 0
      THEN ROUND((gross_income - total_expenses) / gross_income * 100, 2)
      ELSE 0 END
  ) STORED,
  planned_contribution NUMERIC(12,2) DEFAULT 0,
  variance             NUMERIC(12,2) GENERATED ALWAYS AS
                       (gross_income - total_expenses - planned_contribution) STORED,
  notes                TEXT,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(month, owner)
);

CREATE TABLE IF NOT EXISTS finance_net_worth_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL UNIQUE,
  total_assets numeric NOT NULL DEFAULT 0,
  total_liabilities numeric NOT NULL DEFAULT 0,
  net_worth numeric GENERATED ALWAYS AS (total_assets - total_liabilities) STORED,
  cash_amount numeric DEFAULT 0,
  crypto_amount numeric DEFAULT 0,
  stocks_amount numeric DEFAULT 0,
  fixed_income_amount numeric DEFAULT 0,
  real_estate_amount numeric DEFAULT 0,
  retirement_amount numeric DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_portfolio_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  snapshot_date DATE NOT NULL,
  crypto_value_mxn NUMERIC(14,2) DEFAULT 0,
  stocks_value_mxn NUMERIC(14,2) DEFAULT 0,
  fixed_income_value_mxn NUMERIC(14,2) DEFAULT 0,
  real_estate_equity_mxn NUMERIC(14,2) DEFAULT 0,
  total_value_mxn NUMERIC(14,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, snapshot_date)
);

CREATE TABLE IF NOT EXISTS finance_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT NOT NULL UNIQUE,
  subscription JSONB NOT NULL,
  owner TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_real_estate (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  property_type TEXT DEFAULT 'apartment',
  purchase_price NUMERIC(14,2),
  purchase_date DATE,
  current_value NUMERIC(14,2),
  last_valuation_date DATE,
  mortgage_balance NUMERIC(14,2),
  monthly_mortgage NUMERIC(12,2),
  mortgage_rate NUMERIC(6,4),
  mortgage_bank TEXT,
  rental_income NUMERIC(12,2),
  monthly_expenses NUMERIC(12,2),
  address TEXT,
  owner TEXT DEFAULT 'bernardo',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_real_estate_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  target_amount NUMERIC(14,2) NOT NULL,
  delivery_date DATE NOT NULL,

  -- Payments made
  amount_paid NUMERIC(14,2) DEFAULT 0,

  -- Scheduled payments
  monthly_payment NUMERIC(12,2),
  monthly_payment_end DATE,
  lump_sum_amount NUMERIC(12,2),
  lump_sum_date DATE,

  -- Apartment sale funding
  sale_price NUMERIC(14,2),
  sale_deposit_received NUMERIC(14,2),
  sale_remaining_date DATE,
  debt_ids_to_payoff UUID[],

  -- Investment assumptions
  investment_annual_return NUMERIC(6,4),

  -- Property appreciation tracking
  purchase_date DATE,
  current_market_value NUMERIC(14,2),
  last_valuation_date DATE,
  appreciation_rate_annual NUMERIC(6,4),

  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_recurring (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'MXN',
  category_id UUID REFERENCES finance_categories(id),
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
  next_due_date DATE,
  is_active BOOLEAN DEFAULT true,
  merchant TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_recurring_income (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  amount        NUMERIC(12,2) NOT NULL,
  owner         TEXT        NOT NULL DEFAULT 'bernardo',   -- bernardo | laura | joint
  category      TEXT        NOT NULL DEFAULT 'salary',     -- salary | freelance | passive | bonus | other
  recurrence    TEXT        NOT NULL DEFAULT 'monthly',    -- monthly | bimonthly | annual
  day_of_month  INTEGER     NOT NULL DEFAULT 1 CHECK (day_of_month BETWEEN 1 AND 28),
  active        BOOLEAN     NOT NULL DEFAULT true,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_pattern text NOT NULL,
  match_mode text NOT NULL DEFAULT 'contains' CHECK (match_mode IN ('contains', 'exact', 'starts_with')),
  amount_min numeric,
  amount_max numeric,
  owner text,
  category_id uuid REFERENCES finance_categories(id) ON DELETE SET NULL,
  tags text[] DEFAULT '{}',
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  learned boolean NOT NULL DEFAULT false,
  match_count integer NOT NULL DEFAULT 0,
  last_matched_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_stock_holdings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  ticker TEXT NOT NULL,
  name TEXT NOT NULL,
  exchange TEXT DEFAULT 'US',
  asset_type TEXT DEFAULT 'stock',
  shares NUMERIC(12,6) NOT NULL DEFAULT 0,
  avg_cost_basis NUMERIC(12,2),
  currency TEXT DEFAULT 'MXN',
  broker TEXT,
  owner TEXT DEFAULT 'bernardo',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'MXN',
  amount_mxn NUMERIC(12,2) NOT NULL,
  category_id UUID REFERENCES finance_categories(id),
  merchant TEXT,
  description TEXT,
  transaction_date DATE NOT NULL,
  is_recurring BOOLEAN DEFAULT false,
  recurring_id UUID REFERENCES finance_recurring(id),
  tags TEXT[] DEFAULT '{}',
  receipt_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_wolff_chat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL CHECK (role IN ('user', 'wolff')),
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'done',
  reply_to UUID REFERENCES finance_wolff_chat(id) ON DELETE SET NULL,
  asked_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Live-shape insights cache (the app reads generated_at/period_month/expires_at)
CREATE TABLE IF NOT EXISTS finance_insights_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insights_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  period_month DATE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

-- Column additions from later migrations
ALTER TABLE finance_real_estate_targets ADD COLUMN IF NOT EXISTS laura_infonavit_mxn NUMERIC(12,2);
ALTER TABLE finance_real_estate_targets ADD COLUMN IF NOT EXISTS last_valuation_date DATE;
ALTER TABLE finance_categories
ADD COLUMN IF NOT EXISTS billing_cycle text NOT NULL DEFAULT 'monthly';
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS coverage_start date;
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS coverage_end date;
ALTER TABLE finance_crypto_holdings 
ADD COLUMN IF NOT EXISTS owner TEXT NOT NULL DEFAULT 'Bernardo';
ALTER TABLE finance_crypto_holdings 
ADD COLUMN IF NOT EXISTS cost_currency TEXT NOT NULL DEFAULT 'MXN';
ALTER TABLE finance_goals
ADD COLUMN IF NOT EXISTS goal_type TEXT NOT NULL DEFAULT 'savings'
CHECK (goal_type IN ('savings', 'crypto'));
ALTER TABLE finance_goals
ADD COLUMN IF NOT EXISTS crypto_symbol TEXT;
ALTER TABLE finance_recurring 
ADD COLUMN IF NOT EXISTS debt_id uuid REFERENCES finance_debts(id) ON DELETE SET NULL;
ALTER TABLE finance_goals ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;
ALTER TABLE finance_goals ADD COLUMN IF NOT EXISTS monthly_contribution NUMERIC(12,2) DEFAULT 0;
ALTER TABLE finance_goals ADD COLUMN IF NOT EXISTS investment_vehicle TEXT;
ALTER TABLE finance_goals ADD COLUMN IF NOT EXISTS milestones_json JSONB DEFAULT '[]'::jsonb;
ALTER TABLE finance_budgets ADD COLUMN IF NOT EXISTS budget_type TEXT CHECK (budget_type IN ('needs', 'wants', 'savings'));
ALTER TABLE finance_goals ADD COLUMN IF NOT EXISTS scope text DEFAULT 'shared';
ALTER TABLE finance_recurring 
ADD COLUMN IF NOT EXISTS leak_status text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS leak_reviewed_at timestamptz DEFAULT NULL;
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS owner text;
ALTER TABLE finance_recurring ADD COLUMN IF NOT EXISTS owner text;
ALTER TABLE finance_installments ADD COLUMN IF NOT EXISTS owner text;
ALTER TABLE finance_budgets ADD COLUMN IF NOT EXISTS owner text;
ALTER TABLE finance_goals ADD COLUMN IF NOT EXISTS owner text;
ALTER TABLE finance_debts ADD COLUMN IF NOT EXISTS owner text;
ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT NULL;
ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS installment_id UUID REFERENCES finance_installments(id) ON DELETE SET NULL;
ALTER TABLE finance_goals
  ADD COLUMN IF NOT EXISTS last_contribution_date DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_contribution_amount NUMERIC(12,2) DEFAULT NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_debt_payments_debt ON finance_debt_payments(debt_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_source
  ON finance_transactions(source) WHERE source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recurring_income_active
  ON finance_recurring_income(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_transactions_installment_id
  ON finance_transactions(installment_id)
  WHERE installment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_debts_active ON finance_debts(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_transactions_date ON finance_transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_owner ON finance_transactions(owner);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON finance_transactions(type);
CREATE INDEX IF NOT EXISTS idx_finance_rules_active ON finance_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_finance_rules_pattern ON finance_rules(merchant_pattern);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_flags
  ON finance_transactions USING gin(flags);
CREATE INDEX IF NOT EXISTS idx_nws_date ON finance_net_worth_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_wolff_chat_created ON finance_wolff_chat(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wolff_chat_pending ON finance_wolff_chat(status) WHERE status = 'pending';

-- Permissive RLS (demo project: anon key is the app key, same model as prod)
ALTER TABLE crypto_transactions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='crypto_transactions' AND policyname='demo all') THEN CREATE POLICY "demo all" ON crypto_transactions FOR ALL USING (true) WITH CHECK (true); END IF; END $$;
ALTER TABLE finance_audit_reports ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='finance_audit_reports' AND policyname='demo all') THEN CREATE POLICY "demo all" ON finance_audit_reports FOR ALL USING (true) WITH CHECK (true); END IF; END $$;
ALTER TABLE finance_budgets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='finance_budgets' AND policyname='demo all') THEN CREATE POLICY "demo all" ON finance_budgets FOR ALL USING (true) WITH CHECK (true); END IF; END $$;
ALTER TABLE finance_categories ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='finance_categories' AND policyname='demo all') THEN CREATE POLICY "demo all" ON finance_categories FOR ALL USING (true) WITH CHECK (true); END IF; END $$;
ALTER TABLE finance_crypto_holdings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='finance_crypto_holdings' AND policyname='demo all') THEN CREATE POLICY "demo all" ON finance_crypto_holdings FOR ALL USING (true) WITH CHECK (true); END IF; END $$;
ALTER TABLE finance_debt_payments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='finance_debt_payments' AND policyname='demo all') THEN CREATE POLICY "demo all" ON finance_debt_payments FOR ALL USING (true) WITH CHECK (true); END IF; END $$;
ALTER TABLE finance_debts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='finance_debts' AND policyname='demo all') THEN CREATE POLICY "demo all" ON finance_debts FOR ALL USING (true) WITH CHECK (true); END IF; END $$;
ALTER TABLE finance_emergency_fund ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='finance_emergency_fund' AND policyname='demo all') THEN CREATE POLICY "demo all" ON finance_emergency_fund FOR ALL USING (true) WITH CHECK (true); END IF; END $$;
ALTER TABLE finance_fixed_income ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='finance_fixed_income' AND policyname='demo all') THEN CREATE POLICY "demo all" ON finance_fixed_income FOR ALL USING (true) WITH CHECK (true); END IF; END $$;
ALTER TABLE finance_goals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='finance_goals' AND policyname='demo all') THEN CREATE POLICY "demo all" ON finance_goals FOR ALL USING (true) WITH CHECK (true); END IF; END $$;
ALTER TABLE finance_income_sources ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='finance_income_sources' AND policyname='demo all') THEN CREATE POLICY "demo all" ON finance_income_sources FOR ALL USING (true) WITH CHECK (true); END IF; END $$;
ALTER TABLE finance_insights_cache ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='finance_insights_cache' AND policyname='demo all') THEN CREATE POLICY "demo all" ON finance_insights_cache FOR ALL USING (true) WITH CHECK (true); END IF; END $$;
ALTER TABLE finance_installments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='finance_installments' AND policyname='demo all') THEN CREATE POLICY "demo all" ON finance_installments FOR ALL USING (true) WITH CHECK (true); END IF; END $$;
ALTER TABLE finance_monthly_savings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='finance_monthly_savings' AND policyname='demo all') THEN CREATE POLICY "demo all" ON finance_monthly_savings FOR ALL USING (true) WITH CHECK (true); END IF; END $$;
ALTER TABLE finance_net_worth_snapshots ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='finance_net_worth_snapshots' AND policyname='demo all') THEN CREATE POLICY "demo all" ON finance_net_worth_snapshots FOR ALL USING (true) WITH CHECK (true); END IF; END $$;
ALTER TABLE finance_portfolio_snapshots ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='finance_portfolio_snapshots' AND policyname='demo all') THEN CREATE POLICY "demo all" ON finance_portfolio_snapshots FOR ALL USING (true) WITH CHECK (true); END IF; END $$;
ALTER TABLE finance_push_subscriptions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='finance_push_subscriptions' AND policyname='demo all') THEN CREATE POLICY "demo all" ON finance_push_subscriptions FOR ALL USING (true) WITH CHECK (true); END IF; END $$;
ALTER TABLE finance_real_estate ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='finance_real_estate' AND policyname='demo all') THEN CREATE POLICY "demo all" ON finance_real_estate FOR ALL USING (true) WITH CHECK (true); END IF; END $$;
ALTER TABLE finance_real_estate_targets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='finance_real_estate_targets' AND policyname='demo all') THEN CREATE POLICY "demo all" ON finance_real_estate_targets FOR ALL USING (true) WITH CHECK (true); END IF; END $$;
ALTER TABLE finance_recurring ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='finance_recurring' AND policyname='demo all') THEN CREATE POLICY "demo all" ON finance_recurring FOR ALL USING (true) WITH CHECK (true); END IF; END $$;
ALTER TABLE finance_recurring_income ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='finance_recurring_income' AND policyname='demo all') THEN CREATE POLICY "demo all" ON finance_recurring_income FOR ALL USING (true) WITH CHECK (true); END IF; END $$;
ALTER TABLE finance_rules ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='finance_rules' AND policyname='demo all') THEN CREATE POLICY "demo all" ON finance_rules FOR ALL USING (true) WITH CHECK (true); END IF; END $$;
ALTER TABLE finance_stock_holdings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='finance_stock_holdings' AND policyname='demo all') THEN CREATE POLICY "demo all" ON finance_stock_holdings FOR ALL USING (true) WITH CHECK (true); END IF; END $$;
ALTER TABLE finance_transactions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='finance_transactions' AND policyname='demo all') THEN CREATE POLICY "demo all" ON finance_transactions FOR ALL USING (true) WITH CHECK (true); END IF; END $$;
ALTER TABLE finance_wolff_chat ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='finance_wolff_chat' AND policyname='demo all') THEN CREATE POLICY "demo all" ON finance_wolff_chat FOR ALL USING (true) WITH CHECK (true); END IF; END $$;

SELECT 'demo schema complete — ' || count(*) || ' tables' AS result FROM pg_tables WHERE schemaname='public';