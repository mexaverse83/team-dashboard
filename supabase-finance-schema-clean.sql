-- Finance Tracker Schema (Clean — no sample data)
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

-- 5. Goals
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

-- Default Categories (only useful structural data)
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
