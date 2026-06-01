-- Restore monthly salary auto-income rows
-- ---------------------------------------------------------------------------
-- Context: finance_recurring_income was emptied at some point after 2026-05-01.
-- This is the table the recurring processor reads to auto-post salaries
-- (source='recurring_income', tags=['auto-income','recurring-income']).
-- Both salaries posted from here in April & May, then the rows disappeared,
-- so June income never had anything to post.
--
-- Amounts use the most recent ACTUAL posted values:
--   Nexaminds Salary  120,000.00  (bernardo)  — matches Apr/May
--   Laura Salary       74,800.00  (laura)     — May actual (seed was 74,000)
--
-- NOTE: do NOT also reactivate "Bernardo Salario" / "Laura Salario" in
-- finance_income_sources. Those use different merchant names, so the dedup
-- guards would NOT catch them and you'd get DOUBLE salary income each month.
-- Keep them is_active=false; recurring_income is the source of truth.

INSERT INTO finance_recurring_income (name, amount, owner, category, recurrence, day_of_month, active)
VALUES
  ('Nexaminds Salary', 120000.00, 'bernardo', 'salary', 'monthly', 1, true),
  ('Laura Salary',      74800.00, 'laura',    'salary', 'monthly', 1, true)
ON CONFLICT DO NOTHING;

-- Verify
SELECT name, amount, owner, recurrence, day_of_month, active
FROM finance_recurring_income
ORDER BY name;
