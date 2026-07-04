-- Web push subscriptions for the PWA (one row per browser/device).
-- Endpoints are capability URLs but unusable without the VAPID private key,
-- which never leaves the home machine.
CREATE TABLE IF NOT EXISTS finance_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT NOT NULL UNIQUE,
  subscription JSONB NOT NULL,
  owner TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE finance_push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all read push subs" ON finance_push_subscriptions FOR SELECT USING (true);
CREATE POLICY "all insert push subs" ON finance_push_subscriptions FOR INSERT WITH CHECK (true);
CREATE POLICY "all update push subs" ON finance_push_subscriptions FOR UPDATE USING (true);
CREATE POLICY "all delete push subs" ON finance_push_subscriptions FOR DELETE USING (true);
