-- Add scope column to finance_goals (personal vs shared)
ALTER TABLE finance_goals ADD COLUMN IF NOT EXISTS scope text DEFAULT 'shared';
-- owner column was already added by supabase-owners.sql
