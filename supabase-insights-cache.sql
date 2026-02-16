-- Finance Insights Cache
CREATE TABLE IF NOT EXISTS finance_insights_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insights_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  data_snapshot JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE finance_insights_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read insights" ON finance_insights_cache FOR SELECT USING (true);
CREATE POLICY "service insert insights" ON finance_insights_cache FOR INSERT WITH CHECK (true);

-- Keep only last 30 entries (cleanup old cache)
-- Run manually or via pg_cron if available
