-- Baby-plan checklist completion (OPP-04). The items live in code
-- (src/lib/baby-plan.ts BABY_CHECKLIST); this table only records which are
-- done. Signed-in household members may read and write; anon gets nothing.
-- Idempotent. NOT applied by agents.
CREATE TABLE IF NOT EXISTS finance_checklist_status (
  item_id    TEXT        PRIMARY KEY,
  done_at    TIMESTAMPTZ,
  done_by    TEXT,
  note       TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE finance_checklist_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated manage checklist status" ON finance_checklist_status;
CREATE POLICY "authenticated manage checklist status" ON finance_checklist_status
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

REVOKE ALL ON finance_checklist_status FROM anon;
