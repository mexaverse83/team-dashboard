-- Finance Tracker V2 — New Tables & Extensions
-- Run in Supabase SQL Editor AFTER finance-schema-clean.sql

-- ============================================================
-- 1. Income Sources (Budget Builder)
-- ============================================================
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

ALTER TABLE finance_income_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read income_sources" ON finance_income_sources FOR SELECT USING (true);
CREATE POLICY "anon insert income_sources" ON finance_income_sources FOR INSERT WITH CHECK (true);
CREATE POLICY "anon update income_sources" ON finance_income_sources FOR UPDATE USING (true);
CREATE POLICY "anon delete income_sources" ON finance_income_sources FOR DELETE USING (true);

-- ============================================================
-- 2. Debts (Debt Elimination)
-- ============================================================
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

ALTER TABLE finance_debts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read debts" ON finance_debts FOR SELECT USING (true);
CREATE POLICY "anon insert debts" ON finance_debts FOR INSERT WITH CHECK (true);
CREATE POLICY "anon update debts" ON finance_debts FOR UPDATE USING (true);
CREATE POLICY "anon delete debts" ON finance_debts FOR DELETE USING (true);

-- ============================================================
-- 3. Debt Payments (tracks each payment with principal/interest split)
-- ============================================================
CREATE TABLE IF NOT EXISTS finance_debt_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_id UUID NOT NULL REFERENCES finance_debts(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  principal_portion NUMERIC(12,2) NOT NULL DEFAULT 0,
  interest_portion NUMERIC(12,2) NOT NULL DEFAULT 0,
  remaining_balance NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_debt_payments_debt ON finance_debt_payments(debt_id);
CREATE INDEX idx_debt_payments_date ON finance_debt_payments(payment_date DESC);

ALTER TABLE finance_debt_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read debt_payments" ON finance_debt_payments FOR SELECT USING (true);
CREATE POLICY "anon insert debt_payments" ON finance_debt_payments FOR INSERT WITH CHECK (true);
CREATE POLICY "anon update debt_payments" ON finance_debt_payments FOR UPDATE USING (true);
CREATE POLICY "anon delete debt_payments" ON finance_debt_payments FOR DELETE USING (true);

-- ============================================================
-- 4. Emergency Fund
-- ============================================================
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

ALTER TABLE finance_emergency_fund ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read emergency_fund" ON finance_emergency_fund FOR SELECT USING (true);
CREATE POLICY "anon insert emergency_fund" ON finance_emergency_fund FOR INSERT WITH CHECK (true);
CREATE POLICY "anon update emergency_fund" ON finance_emergency_fund FOR UPDATE USING (true);

-- ============================================================
-- 5. Audit Reports (stored snapshots)
-- ============================================================
CREATE TABLE IF NOT EXISTS finance_audit_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  report_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE finance_audit_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read audit_reports" ON finance_audit_reports FOR SELECT USING (true);
CREATE POLICY "anon insert audit_reports" ON finance_audit_reports FOR INSERT WITH CHECK (true);

-- ============================================================
-- 6. Extend finance_goals with new columns
-- ============================================================
ALTER TABLE finance_goals ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;
ALTER TABLE finance_goals ADD COLUMN IF NOT EXISTS monthly_contribution NUMERIC(12,2) DEFAULT 0;
ALTER TABLE finance_goals ADD COLUMN IF NOT EXISTS investment_vehicle TEXT;
ALTER TABLE finance_goals ADD COLUMN IF NOT EXISTS milestones_json JSONB DEFAULT '[]'::jsonb;

-- ============================================================
-- 7. Extend finance_budgets with budget_type for 50/30/20
-- ============================================================
ALTER TABLE finance_budgets ADD COLUMN IF NOT EXISTS budget_type TEXT CHECK (budget_type IN ('needs', 'wants', 'savings'));

-- ============================================================
-- 8. Enable realtime on new tables
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE finance_income_sources;
ALTER PUBLICATION supabase_realtime ADD TABLE finance_debts;
ALTER PUBLICATION supabase_realtime ADD TABLE finance_debt_payments;
ALTER PUBLICATION supabase_realtime ADD TABLE finance_emergency_fund;
