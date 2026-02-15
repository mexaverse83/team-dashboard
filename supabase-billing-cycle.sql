-- Add billing_cycle to finance_categories
-- Run this in Supabase SQL Editor

ALTER TABLE finance_categories
ADD COLUMN IF NOT EXISTS billing_cycle text NOT NULL DEFAULT 'monthly';

-- Add check constraint
ALTER TABLE finance_categories
ADD CONSTRAINT finance_categories_billing_cycle_check
CHECK (billing_cycle IN ('monthly', 'bimonthly', 'quarterly', 'semi-annual', 'annual'));

-- Set known non-monthly categories
UPDATE finance_categories SET billing_cycle = 'bimonthly' WHERE name ILIKE '%electric%' OR name ILIKE '%luz%';
UPDATE finance_categories SET billing_cycle = 'bimonthly' WHERE name ILIKE '%water%' OR name ILIKE '%agua%';
