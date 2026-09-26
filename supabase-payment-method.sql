-- Payment method on transactions (BBVA Infinite, Amex, cash, transfer).
-- Used to total each owner's BBVA Infinite statement (corte 9, pago 29).
ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT NULL;

ALTER TABLE finance_transactions
  DROP CONSTRAINT IF EXISTS finance_transactions_payment_method_check;
ALTER TABLE finance_transactions
  ADD CONSTRAINT finance_transactions_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('bbva_infinite', 'amex', 'cash', 'transfer'));

CREATE INDEX IF NOT EXISTS idx_transactions_payment_method
  ON finance_transactions(payment_method, transaction_date) WHERE payment_method IS NOT NULL;
