-- Add crypto goal support to finance_goals
-- Run in Supabase SQL Editor

ALTER TABLE finance_goals
ADD COLUMN IF NOT EXISTS goal_type TEXT NOT NULL DEFAULT 'savings'
CHECK (goal_type IN ('savings', 'crypto'));

ALTER TABLE finance_goals
ADD COLUMN IF NOT EXISTS crypto_symbol TEXT;
