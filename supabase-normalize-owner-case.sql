-- Normalize owner casing to canonical display names ('Bernardo', 'Laura').
-- ---------------------------------------------------------------------------
-- Manual entry forms write capitalized owners, but the recurring processor
-- copied lowercase owners from finance_recurring_income / finance_recurring
-- into finance_transactions, so per-owner filters (owner = 'Bernardo')
-- silently missed auto-created rows (salaries!). The processor now
-- canonicalizes at insert; this fixes existing rows. Idempotent.
--
-- finance_recurring_income and finance_monthly_savings deliberately KEEP
-- lowercase owners — the processor's snapshot logic lowercases for those.

UPDATE finance_transactions  SET owner = 'Bernardo' WHERE owner = 'bernardo';
UPDATE finance_transactions  SET owner = 'Laura'    WHERE owner = 'laura';
UPDATE finance_recurring     SET owner = 'Bernardo' WHERE owner = 'bernardo';
UPDATE finance_recurring     SET owner = 'Laura'    WHERE owner = 'laura';
UPDATE finance_installments  SET owner = 'Bernardo' WHERE owner = 'bernardo';
UPDATE finance_installments  SET owner = 'Laura'    WHERE owner = 'laura';
UPDATE finance_budgets       SET owner = 'Bernardo' WHERE owner = 'bernardo';
UPDATE finance_budgets       SET owner = 'Laura'    WHERE owner = 'laura';
UPDATE finance_debts         SET owner = 'Bernardo' WHERE owner = 'bernardo';
UPDATE finance_debts         SET owner = 'Laura'    WHERE owner = 'laura';

-- Goals: only personal-scope rows carry owners
UPDATE finance_goals         SET owner = 'Bernardo' WHERE owner = 'bernardo';
UPDATE finance_goals         SET owner = 'Laura'    WHERE owner = 'laura';

-- Confirm: should return zero rows
SELECT 'finance_transactions' AS t, owner, COUNT(*) FROM finance_transactions
WHERE owner IN ('bernardo', 'laura') GROUP BY owner;
