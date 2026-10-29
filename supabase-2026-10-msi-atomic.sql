-- Atomic MSI posting (AUTO-10, AUTO-13). Inserting the payment and advancing
-- payments_made used to be two statements; a crash in between left the plan a
-- month long. This function does both in one transaction, under a row lock.
-- Requires supabase-2026-10-recurring-idempotency.sql (installment_number).
-- Service role only. NOT applied by agents.
CREATE OR REPLACE FUNCTION public.finance_post_msi_payment(
  p_installment_id uuid,
  p_number integer,
  p_tx jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_msi finance_installments%ROWTYPE;
  v_id uuid;
BEGIN
  SELECT * INTO v_msi FROM finance_installments WHERE id = p_installment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'installment % not found', p_installment_id;
  END IF;
  IF p_number IS NULL OR p_number < 1 OR p_number > v_msi.installment_count THEN
    RAISE EXCEPTION 'payment % is outside 1..%', p_number, v_msi.installment_count;
  END IF;

  -- Already posted (by number, or a legacy row whose description says "(n/N)"):
  -- repair a lagging payments_made and report "nothing new".
  IF coalesce(v_msi.payments_made, 0) >= p_number OR EXISTS (
    SELECT 1 FROM finance_transactions
     WHERE installment_id = p_installment_id
       AND (installment_number = p_number
            OR (installment_number IS NULL AND description LIKE '%(' || p_number || '/' || v_msi.installment_count || ')%'))
  ) THEN
    UPDATE finance_installments
       SET payments_made = greatest(coalesce(payments_made, 0), p_number),
           is_active = greatest(coalesce(payments_made, 0), p_number) < installment_count,
           updated_at = now()
     WHERE id = p_installment_id;
    RETURN NULL;
  END IF;
  IF coalesce(v_msi.payments_made, 0) + 1 <> p_number THEN
    RAISE EXCEPTION 'payment % cannot post before payment %', p_number, coalesce(v_msi.payments_made, 0) + 1;
  END IF;

  INSERT INTO finance_transactions (
    type, amount, currency, amount_mxn, category_id, merchant, description,
    transaction_date, is_recurring, tags, owner, payment_method,
    installment_id, installment_number
  ) VALUES (
    'expense',
    (p_tx->>'amount')::numeric,
    coalesce(p_tx->>'currency', 'MXN'),
    coalesce((p_tx->>'amount_mxn')::numeric, (p_tx->>'amount')::numeric),
    nullif(p_tx->>'category_id', '')::uuid,
    p_tx->>'merchant',
    p_tx->>'description',
    (p_tx->>'transaction_date')::date,
    true,
    coalesce(ARRAY(SELECT jsonb_array_elements_text(p_tx->'tags')), ARRAY['auto-msi']),
    p_tx->>'owner',
    p_tx->>'payment_method',
    p_installment_id,
    p_number
  )
  RETURNING id INTO v_id;

  UPDATE finance_installments
     SET payments_made = p_number,
         is_active = p_number < installment_count,
         updated_at = now()
   WHERE id = p_installment_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_post_msi_payment(uuid, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finance_post_msi_payment(uuid, integer, jsonb) TO service_role;
