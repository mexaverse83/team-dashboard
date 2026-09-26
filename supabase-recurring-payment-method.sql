-- Payment method on subscriptions, copied onto the transactions the
-- recurring processor creates (so BBVA-charged subscriptions hit the card).
ALTER TABLE finance_recurring
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT NULL;

ALTER TABLE finance_recurring
  DROP CONSTRAINT IF EXISTS finance_recurring_payment_method_check;
ALTER TABLE finance_recurring
  ADD CONSTRAINT finance_recurring_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('bbva_infinite', 'amex', 'cash', 'transfer'));
