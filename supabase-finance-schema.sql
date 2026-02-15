-- Finance Tracker Schema
-- Run in Supabase SQL Editor

-- 1. Categories
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

ALTER TABLE finance_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read categories" ON finance_categories FOR SELECT USING (true);
CREATE POLICY "anon insert categories" ON finance_categories FOR INSERT WITH CHECK (true);
CREATE POLICY "anon update categories" ON finance_categories FOR UPDATE USING (true);

-- 2. Recurring definitions
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

ALTER TABLE finance_recurring ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read recurring" ON finance_recurring FOR SELECT USING (true);
CREATE POLICY "anon insert recurring" ON finance_recurring FOR INSERT WITH CHECK (true);
CREATE POLICY "anon update recurring" ON finance_recurring FOR UPDATE USING (true);
CREATE POLICY "anon delete recurring" ON finance_recurring FOR DELETE USING (true);

-- 3. Transactions
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

CREATE INDEX idx_fin_tx_date ON finance_transactions(transaction_date DESC);
CREATE INDEX idx_fin_tx_category ON finance_transactions(category_id);
CREATE INDEX idx_fin_tx_type ON finance_transactions(type);
CREATE INDEX idx_fin_tx_merchant ON finance_transactions(merchant);
CREATE INDEX idx_fin_tx_tags ON finance_transactions USING GIN(tags);

ALTER TABLE finance_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read transactions" ON finance_transactions FOR SELECT USING (true);
CREATE POLICY "anon insert transactions" ON finance_transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "anon update transactions" ON finance_transactions FOR UPDATE USING (true);
CREATE POLICY "anon delete transactions" ON finance_transactions FOR DELETE USING (true);

-- 4. Budgets
CREATE TABLE IF NOT EXISTS finance_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES finance_categories(id),
  month DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(category_id, month)
);

ALTER TABLE finance_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read budgets" ON finance_budgets FOR SELECT USING (true);
CREATE POLICY "anon insert budgets" ON finance_budgets FOR INSERT WITH CHECK (true);
CREATE POLICY "anon update budgets" ON finance_budgets FOR UPDATE USING (true);
CREATE POLICY "anon delete budgets" ON finance_budgets FOR DELETE USING (true);

-- 5. Goals (future use)
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

ALTER TABLE finance_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read goals" ON finance_goals FOR SELECT USING (true);
CREATE POLICY "anon insert goals" ON finance_goals FOR INSERT WITH CHECK (true);
CREATE POLICY "anon update goals" ON finance_goals FOR UPDATE USING (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE finance_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE finance_budgets;
ALTER PUBLICATION supabase_realtime ADD TABLE finance_recurring;

-- ============================================================
-- SEED: Default Categories
-- ============================================================
INSERT INTO finance_categories (name, icon, color, type, is_default, sort_order) VALUES
  ('Rent/Mortgage', '🏠', '#8B5CF6', 'expense', true, 1),
  ('Groceries', '🛒', '#10B981', 'expense', true, 2),
  ('Dining Out', '🍽️', '#F59E0B', 'expense', true, 3),
  ('Transport', '🚗', '#3B82F6', 'expense', true, 4),
  ('Utilities', '⚡', '#EF4444', 'expense', true, 5),
  ('Subscriptions', '📱', '#EC4899', 'expense', true, 6),
  ('Entertainment', '🎬', '#F97316', 'expense', true, 7),
  ('Health', '🏥', '#14B8A6', 'expense', true, 8),
  ('Shopping', '🛍️', '#A855F7', 'expense', true, 9),
  ('Travel', '✈️', '#06B6D4', 'expense', true, 10),
  ('Business', '💼', '#6366F1', 'expense', true, 11),
  ('Education', '📚', '#84CC16', 'expense', true, 12),
  ('Gifts', '🎁', '#E11D48', 'expense', true, 13),
  ('Maintenance', '🔧', '#78716C', 'expense', true, 14),
  ('Other', '📦', '#6B7280', 'expense', true, 15),
  ('Salary', '💰', '#10B981', 'income', true, 1),
  ('Freelance', '💻', '#3B82F6', 'income', true, 2),
  ('Investments', '📈', '#F59E0B', 'income', true, 3),
  ('Other Income', '🏦', '#6B7280', 'income', true, 4)
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- SEED: Sample transactions (2 months of realistic data)
-- ============================================================
DO $$
DECLARE
  cat_rent UUID; cat_groc UUID; cat_dining UUID; cat_transport UUID;
  cat_util UUID; cat_subs UUID; cat_ent UUID; cat_health UUID;
  cat_shop UUID; cat_biz UUID; cat_salary UUID; cat_free UUID;
BEGIN
  SELECT id INTO cat_rent FROM finance_categories WHERE name = 'Rent/Mortgage';
  SELECT id INTO cat_groc FROM finance_categories WHERE name = 'Groceries';
  SELECT id INTO cat_dining FROM finance_categories WHERE name = 'Dining Out';
  SELECT id INTO cat_transport FROM finance_categories WHERE name = 'Transport';
  SELECT id INTO cat_util FROM finance_categories WHERE name = 'Utilities';
  SELECT id INTO cat_subs FROM finance_categories WHERE name = 'Subscriptions';
  SELECT id INTO cat_ent FROM finance_categories WHERE name = 'Entertainment';
  SELECT id INTO cat_health FROM finance_categories WHERE name = 'Health';
  SELECT id INTO cat_shop FROM finance_categories WHERE name = 'Shopping';
  SELECT id INTO cat_biz FROM finance_categories WHERE name = 'Business';
  SELECT id INTO cat_salary FROM finance_categories WHERE name = 'Salary';
  SELECT id INTO cat_free FROM finance_categories WHERE name = 'Freelance';

  -- January 2026
  INSERT INTO finance_transactions (type, amount, currency, amount_mxn, category_id, merchant, transaction_date, description) VALUES
    ('income', 55000, 'MXN', 55000, cat_salary, 'Nexaminds', '2026-01-01', 'Monthly salary'),
    ('income', 8000, 'MXN', 8000, cat_free, 'Client A', '2026-01-10', 'Freelance project'),
    ('expense', 15000, 'MXN', 15000, cat_rent, 'Landlord', '2026-01-01', 'Monthly rent'),
    ('expense', 4200, 'MXN', 4200, cat_groc, 'Walmart', '2026-01-03', 'Weekly groceries'),
    ('expense', 3800, 'MXN', 3800, cat_groc, 'HEB', '2026-01-10', 'Weekly groceries'),
    ('expense', 4100, 'MXN', 4100, cat_groc, 'Walmart', '2026-01-17', 'Weekly groceries'),
    ('expense', 3600, 'MXN', 3600, cat_groc, 'Soriana', '2026-01-24', 'Weekly groceries'),
    ('expense', 1200, 'MXN', 1200, cat_dining, 'La Carreta', '2026-01-05', 'Dinner'),
    ('expense', 850, 'MXN', 850, cat_dining, 'Starbucks', '2026-01-08', 'Coffee + lunch'),
    ('expense', 1500, 'MXN', 1500, cat_dining, 'Sushi Roll', '2026-01-15', 'Dinner with friends'),
    ('expense', 680, 'MXN', 680, cat_dining, 'McDonalds', '2026-01-22', 'Quick lunch'),
    ('expense', 2500, 'MXN', 2500, cat_transport, 'Uber', '2026-01-01', 'Monthly rides'),
    ('expense', 1800, 'MXN', 1800, cat_transport, 'Gas station', '2026-01-15', 'Fuel'),
    ('expense', 2200, 'MXN', 2200, cat_util, 'CFE', '2026-01-05', 'Electricity'),
    ('expense', 800, 'MXN', 800, cat_util, 'Izzi', '2026-01-05', 'Internet'),
    ('expense', 400, 'MXN', 400, cat_util, 'Agua y Drenaje', '2026-01-05', 'Water'),
    ('expense', 399, 'MXN', 399, cat_subs, 'Claude', '2026-01-01', 'Claude Pro'),
    ('expense', 199, 'MXN', 199, cat_subs, 'Spotify', '2026-01-01', 'Premium family'),
    ('expense', 279, 'MXN', 279, cat_subs, 'Netflix', '2026-01-01', 'Standard plan'),
    ('expense', 2000, 'MXN', 2000, cat_ent, 'Cinepolis', '2026-01-12', 'Movies + snacks'),
    ('expense', 1500, 'MXN', 1500, cat_health, 'Pharmacy', '2026-01-20', 'Medications'),
    ('expense', 3500, 'MXN', 3500, cat_shop, 'Amazon', '2026-01-18', 'Electronics');

  -- February 2026
  INSERT INTO finance_transactions (type, amount, currency, amount_mxn, category_id, merchant, transaction_date, description) VALUES
    ('income', 55000, 'MXN', 55000, cat_salary, 'Nexaminds', '2026-02-01', 'Monthly salary'),
    ('income', 12000, 'MXN', 12000, cat_free, 'Client B', '2026-02-05', 'Consulting gig'),
    ('expense', 15000, 'MXN', 15000, cat_rent, 'Landlord', '2026-02-01', 'Monthly rent'),
    ('expense', 4500, 'MXN', 4500, cat_groc, 'Walmart', '2026-02-01', 'Weekly groceries'),
    ('expense', 3900, 'MXN', 3900, cat_groc, 'HEB', '2026-02-07', 'Weekly groceries'),
    ('expense', 4200, 'MXN', 4200, cat_groc, 'Walmart', '2026-02-14', 'Weekly groceries'),
    ('expense', 950, 'MXN', 950, cat_dining, 'La Carreta', '2026-02-02', 'Dinner'),
    ('expense', 1100, 'MXN', 1100, cat_dining, 'Sonora Grill', '2026-02-08', 'Business dinner'),
    ('expense', 750, 'MXN', 750, cat_dining, 'Starbucks', '2026-02-12', 'Coffee'),
    ('expense', 2800, 'MXN', 2800, cat_transport, 'Uber', '2026-02-01', 'Monthly rides'),
    ('expense', 2000, 'MXN', 2000, cat_transport, 'Gas station', '2026-02-10', 'Fuel'),
    ('expense', 2200, 'MXN', 2200, cat_util, 'CFE', '2026-02-05', 'Electricity'),
    ('expense', 800, 'MXN', 800, cat_util, 'Izzi', '2026-02-05', 'Internet'),
    ('expense', 400, 'MXN', 400, cat_util, 'Agua y Drenaje', '2026-02-05', 'Water'),
    ('expense', 399, 'MXN', 399, cat_subs, 'Claude', '2026-02-01', 'Claude Pro'),
    ('expense', 199, 'MXN', 199, cat_subs, 'Spotify', '2026-02-01', 'Premium family'),
    ('expense', 279, 'MXN', 279, cat_subs, 'Netflix', '2026-02-01', 'Standard plan'),
    ('expense', 850, 'MXN', 850, cat_subs, 'AWS', '2026-02-01', 'Cloud hosting'),
    ('expense', 1800, 'MXN', 1800, cat_ent, 'Concert', '2026-02-14', 'Valentine concert'),
    ('expense', 2500, 'MXN', 2500, cat_shop, 'Liverpool', '2026-02-14', 'Valentine gift'),
    ('expense', 5000, 'MXN', 5000, cat_biz, 'OpenClaw', '2026-02-10', 'API credits');

  -- Budgets for Feb 2026
  INSERT INTO finance_budgets (category_id, month, amount) VALUES
    (cat_rent, '2026-02-01', 15000),
    (cat_groc, '2026-02-01', 18000),
    (cat_dining, '2026-02-01', 5000),
    (cat_transport, '2026-02-01', 6000),
    (cat_util, '2026-02-01', 4000),
    (cat_subs, '2026-02-01', 2500),
    (cat_ent, '2026-02-01', 3000),
    (cat_health, '2026-02-01', 2000),
    (cat_shop, '2026-02-01', 5000),
    (cat_biz, '2026-02-01', 8000);

  -- Recurring subscriptions
  INSERT INTO finance_recurring (name, amount, currency, category_id, frequency, next_due_date, is_active, merchant) VALUES
    ('Claude Pro', 399, 'MXN', cat_subs, 'monthly', '2026-03-01', true, 'Claude'),
    ('Spotify Premium', 199, 'MXN', cat_subs, 'monthly', '2026-03-01', true, 'Spotify'),
    ('Netflix', 279, 'MXN', cat_subs, 'monthly', '2026-03-01', true, 'Netflix'),
    ('AWS Hosting', 850, 'MXN', cat_subs, 'monthly', '2026-03-01', true, 'AWS'),
    ('Izzi Internet', 800, 'MXN', cat_util, 'monthly', '2026-03-05', true, 'Izzi'),
    ('CFE Electricity', 2200, 'MXN', cat_util, 'monthly', '2026-03-05', true, 'CFE'),
    ('GitHub Pro', 100, 'USD', cat_subs, 'yearly', '2026-06-01', true, 'GitHub');
END $$;
