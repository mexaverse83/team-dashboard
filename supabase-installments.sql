-- MSI (Meses Sin Intereses) Installment Tracker
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS finance_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  merchant text,
  total_amount numeric(12,2) NOT NULL,
  installment_count integer NOT NULL CHECK (installment_count > 0),
  installment_amount numeric(12,2) NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  payments_made integer DEFAULT 0 CHECK (payments_made >= 0),
  credit_card text,
  category_id uuid REFERENCES finance_categories(id),
  is_active boolean DEFAULT true,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_installments_active ON finance_installments(is_active) WHERE is_active = true;
CREATE INDEX idx_installments_end_date ON finance_installments(end_date);
CREATE INDEX idx_installments_category ON finance_installments(category_id);

-- RLS
ALTER TABLE finance_installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to installments" ON finance_installments FOR ALL USING (true) WITH CHECK (true);

-- Updated_at trigger
CREATE TRIGGER finance_installments_updated_at
  BEFORE UPDATE ON finance_installments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
