-- Sub-peso coins (KAS, etc.) lost precision: prices and average cost were
-- stored with only 2 decimals. Widen to 8 and recover exact per-coin prices
-- from the stored totals (total_mxn was computed from the unrounded price).
ALTER TABLE crypto_transactions
  ALTER COLUMN price_per_coin_mxn TYPE NUMERIC(18,8);
ALTER TABLE finance_crypto_holdings
  ALTER COLUMN avg_cost_basis_usd TYPE NUMERIC(18,8);

UPDATE crypto_transactions
  SET price_per_coin_mxn = total_mxn / quantity
  WHERE quantity > 0 AND total_mxn IS NOT NULL;
