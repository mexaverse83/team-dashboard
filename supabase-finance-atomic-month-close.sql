-- Apply before deploying the updated recurring processor. No historical balances
-- are rewritten. Existing owner snapshots count as already processed.
-- Only the service role may close a month; browser roles get no new privileges.
BEGIN;
CREATE OR REPLACE FUNCTION public.finance_close_month(p_month date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner text;
  v_income numeric;
  v_expenses numeric;
  v_planned numeric;
  v_total_planned numeric;
  v_available numeric;
  v_share numeric;
  v_goal record;
  v_count integer := 0;
BEGIN
  IF p_month IS NULL OR p_month <> date_trunc('month', p_month)::date
     OR p_month >= date_trunc('month', now() AT TIME ZONE 'America/Mexico_City')::date THEN
    RAISE EXCEPTION 'Only completed calendar months may be closed';
  END IF;
  -- Serialize ALL closes, including adjacent months updating the same goal.
  PERFORM pg_advisory_xact_lock(724196310);
  SELECT coalesce(sum(greatest(0, monthly_contribution)), 0) INTO v_total_planned
    FROM finance_goals WHERE is_completed = false AND goal_type = 'savings';
  FOREACH v_owner IN ARRAY ARRAY['bernardo', 'laura', 'total'] LOOP
    IF EXISTS (SELECT 1 FROM finance_monthly_savings WHERE month = p_month AND owner = v_owner) THEN
      CONTINUE;
    END IF;
    SELECT coalesce(sum(amount_mxn) FILTER (WHERE type = 'income'), 0),
           coalesce(sum(amount_mxn) FILTER (WHERE type = 'expense'), 0)
      INTO v_income, v_expenses
      FROM finance_transactions
      WHERE transaction_date >= p_month AND transaction_date < p_month + interval '1 month'
        AND (v_owner = 'total' OR lower(trim(owner)) = v_owner);

    -- Lock eligible goals before calculating their allocation weights.
    PERFORM id FROM finance_goals
      WHERE is_completed = false AND goal_type = 'savings'
        AND (v_owner = 'total' OR lower(trim(owner)) = v_owner)
      ORDER BY id FOR UPDATE;
    SELECT coalesce(sum(greatest(0, monthly_contribution)), 0) INTO v_planned
      FROM finance_goals WHERE is_completed = false AND goal_type = 'savings'
        AND (v_owner = 'total' OR lower(trim(owner)) = v_owner);

    IF v_owner = 'total' THEN v_planned := v_total_planned; END IF;
    INSERT INTO finance_monthly_savings(month, owner, gross_income, total_expenses, planned_contribution)
      VALUES (p_month, v_owner, v_income, v_expenses, v_planned);

    -- A deficit is reported in the snapshot; it is not evidence that money was
    -- withdrawn from every goal. Positive net savings is allocated ONCE, in
    -- proportion to planned contributions. Capped/rounding residue stays free.
    v_available := greatest(0, v_income - v_expenses);
    IF v_owner <> 'total' AND v_available > 0 AND v_planned > 0 THEN
      FOR v_goal IN SELECT * FROM finance_goals
        WHERE is_completed = false AND goal_type = 'savings'
          AND lower(trim(owner)) = v_owner AND monthly_contribution > 0
        ORDER BY id
      LOOP
        v_share := least(greatest(0, v_goal.target_amount - v_goal.current_amount),
          floor(v_available * v_goal.monthly_contribution / v_planned * 100) / 100);
        IF v_share > 0 THEN
          UPDATE finance_goals SET
            current_amount = current_amount + v_share,
            is_completed = current_amount + v_share >= target_amount,
            last_contribution_date = (p_month + interval '1 month' - interval '1 day')::date,
            last_contribution_amount = v_share,
            updated_at = now()
          WHERE id = v_goal.id;
        END IF;
      END LOOP;
    END IF;
    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('month', p_month, 'snapshots_created', v_count);
END;
$$;
REVOKE ALL ON FUNCTION public.finance_close_month(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finance_close_month(date) TO service_role;
COMMIT;
