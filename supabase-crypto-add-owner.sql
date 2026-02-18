-- Add owner + cost_currency columns to existing finance_crypto_holdings table
-- Run this in Supabase SQL Editor

ALTER TABLE finance_crypto_holdings 
ADD COLUMN IF NOT EXISTS owner TEXT NOT NULL DEFAULT 'Bernardo';

ALTER TABLE finance_crypto_holdings 
ADD COLUMN IF NOT EXISTS cost_currency TEXT NOT NULL DEFAULT 'MXN';
