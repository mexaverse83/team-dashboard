-- Add owner column to existing finance_crypto_holdings table
-- Run this in Supabase SQL Editor

ALTER TABLE finance_crypto_holdings 
ADD COLUMN IF NOT EXISTS owner TEXT NOT NULL DEFAULT 'Bernardo';
