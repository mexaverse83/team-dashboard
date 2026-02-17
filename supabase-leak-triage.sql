-- Leak Triage: Add status columns to finance_recurring
-- Run in Supabase SQL Editor

ALTER TABLE finance_recurring 
ADD COLUMN IF NOT EXISTS leak_status text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS leak_reviewed_at timestamptz DEFAULT NULL;

-- Verify
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'finance_recurring' AND column_name IN ('leak_status', 'leak_reviewed_at');
