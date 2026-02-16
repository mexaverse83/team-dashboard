-- Add owner field to finance tables
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS owner text;
ALTER TABLE finance_recurring ADD COLUMN IF NOT EXISTS owner text;
ALTER TABLE finance_installments ADD COLUMN IF NOT EXISTS owner text;
ALTER TABLE finance_budgets ADD COLUMN IF NOT EXISTS owner text;
ALTER TABLE finance_goals ADD COLUMN IF NOT EXISTS owner text;
ALTER TABLE finance_debts ADD COLUMN IF NOT EXISTS owner text;
