-- Public stocks with a transaction ledger (Nov 2026).
--
-- The household started buying US stocks through GBM (fractional shares, USD
-- prices, a 0.25% commission). Each buy and sell is logged in
-- finance_stock_transactions; the holding's shares and average cost are
-- replayed from it (src/lib/stock-ledger.ts), the same way crypto works.
--
--   1. finance_stock_holdings.shares → NUMERIC(18,8) (GBM sells 0.34692423
--      shares) and avg_cost_basis → NUMERIC(18,6) (cost per share in the
--      holding's currency, commission included).
--   2. finance_stock_transactions: one row per buy/sell. price and commission
--      are in price_currency ('USD' or 'MXN'); total is what was paid (buy:
--      shares × price + commission) or received (sell: shares × price −
--      commission). fx_usd_mxn is the USD/MXN rate on the day, for MXN reporting.
--   3. RLS on with no anon policy: only the API (service role) reads and writes
--      it. When the household lock-down's is_household() exists, signed-in
--      household members get the same policy as the other finance tables.
--
-- The app keeps working before this runs: holdings can still be added as a
-- balance, edited and removed; logging a transaction answers 409 "database
-- update pending". Private equity rows (Nexaminds) are untouched.
-- Idempotent. NOT applied by agents.

-- 1. Wider share and cost columns (widening keeps every existing value).
ALTER TABLE public.finance_stock_holdings
  ALTER COLUMN shares TYPE NUMERIC(18,8);
ALTER TABLE public.finance_stock_holdings
  ALTER COLUMN avg_cost_basis TYPE NUMERIC(18,6);

-- 2. The ledger.
CREATE TABLE IF NOT EXISTS public.finance_stock_transactions (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id       UUID          NOT NULL REFERENCES public.finance_stock_holdings(id) ON DELETE CASCADE,
  type             TEXT          NOT NULL CHECK (type IN ('buy', 'sell')),
  shares           NUMERIC(18,8) NOT NULL CHECK (shares > 0),
  price            NUMERIC(18,6) NOT NULL CHECK (price >= 0),
  price_currency   TEXT          NOT NULL DEFAULT 'USD' CHECK (price_currency IN ('USD', 'MXN')),
  fx_usd_mxn       NUMERIC(12,6) CHECK (fx_usd_mxn IS NULL OR fx_usd_mxn > 0),
  commission       NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (commission >= 0),
  total            NUMERIC(18,4) NOT NULL,
  broker           TEXT,
  notes            TEXT,
  transaction_date DATE          NOT NULL DEFAULT CURRENT_DATE,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_transactions_holding
  ON public.finance_stock_transactions(holding_id, transaction_date, created_at);

-- 3. Locked like the other finance tables: no anon access.
ALTER TABLE public.finance_stock_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_stock_transactions FROM anon;

DO $$
BEGIN
  IF to_regprocedure('public.is_household()') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'finance_stock_transactions' AND policyname = 'household_all'
     ) THEN
    EXECUTE 'CREATE POLICY household_all ON public.finance_stock_transactions FOR ALL TO authenticated USING (public.is_household()) WITH CHECK (public.is_household())';
  END IF;
END $$;

-- Ask PostgREST to pick up the new table right away.
NOTIFY pgrst, 'reload schema';
