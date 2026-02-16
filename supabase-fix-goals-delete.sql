-- Fix: missing DELETE policies (goals already run)
-- CREATE POLICY "anon delete goals" ON finance_goals FOR DELETE USING (true);
CREATE POLICY "anon delete installments" ON finance_installments FOR DELETE USING (true);
CREATE POLICY "anon delete categories" ON finance_categories FOR DELETE USING (true);
