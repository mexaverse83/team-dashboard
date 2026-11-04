-- Any coin in the crypto portfolio (Nov 2026).
--
-- finance_crypto_holdings.symbol was limited by a CHECK to seven tickers
-- (BTC, ETH, SOL, KAS, LIT, AERO, HYPE). Replace it with a format rule and
-- record which CoinGecko coin each ticker means, so any coin can be added
-- and priced. The app keeps working before this runs (it falls back to the
-- built-in map and refuses non-built-in coins with "database update pending").
-- Idempotent. NOT applied by agents.

-- 1. Drop every CHECK on the symbol column, whatever it was named.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'finance_crypto_holdings'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%symbol%'
  LOOP
    EXECUTE format('ALTER TABLE public.finance_crypto_holdings DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

-- 2. A sane ticker format instead: upper case, 1-15 of A-Z 0-9 . -
--    (same rule as SYMBOL_PATTERN in src/lib/crypto-coins.ts).
ALTER TABLE public.finance_crypto_holdings
  ADD CONSTRAINT finance_crypto_holdings_symbol_format
  CHECK (symbol ~ '^[A-Z0-9][A-Z0-9.-]{0,14}$');

-- 3. Which coin the ticker is (CoinGecko API id, e.g. 'bitcoin').
ALTER TABLE public.finance_crypto_holdings
  ADD COLUMN IF NOT EXISTS coingecko_id TEXT;

ALTER TABLE public.finance_crypto_holdings
  DROP CONSTRAINT IF EXISTS finance_crypto_holdings_coingecko_id_format;
ALTER TABLE public.finance_crypto_holdings
  ADD CONSTRAINT finance_crypto_holdings_coingecko_id_format
  CHECK (coingecko_id IS NULL OR coingecko_id ~ '^[a-z0-9][a-z0-9-]{0,99}$');

-- 4. Backfill the seven built-in coins.
UPDATE public.finance_crypto_holdings h
SET coingecko_id = m.id
FROM (VALUES
  ('BTC', 'bitcoin'),
  ('ETH', 'ethereum'),
  ('SOL', 'solana'),
  ('KAS', 'kaspa'),
  ('LIT', 'lighter'),
  ('AERO', 'aerodrome-finance'),
  ('HYPE', 'hyperliquid')
) AS m(symbol, id)
WHERE h.symbol = m.symbol AND h.coingecko_id IS NULL;

-- Ask PostgREST to pick up the new column right away.
NOTIFY pgrst, 'reload schema';
