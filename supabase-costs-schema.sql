-- Agent Cost Tracking table
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS agent_costs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_name TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  model TEXT NOT NULL,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  cache_read INTEGER NOT NULL DEFAULT 0,
  cache_write INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
  session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_agent_costs_agent ON agent_costs(agent_name);
CREATE INDEX idx_agent_costs_timestamp ON agent_costs(timestamp DESC);
CREATE INDEX idx_agent_costs_agent_timestamp ON agent_costs(agent_name, timestamp DESC);

-- Enable RLS
ALTER TABLE agent_costs ENABLE ROW LEVEL SECURITY;

-- Allow anon read access (dashboard is read-only for now)
CREATE POLICY "Allow anon read" ON agent_costs FOR SELECT USING (true);

-- Allow anon insert (agents log their own usage)
CREATE POLICY "Allow anon insert" ON agent_costs FOR INSERT WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE agent_costs;

-- ============================================================
-- SEED DATA: 14 days of realistic usage for all 7 agents
-- Claude Opus 4.6 pricing: $15/MTok in, $75/MTok out, $3.75/MTok cache read, $3.75/MTok cache write
-- Gemini pricing (Murph): ~$1.25/MTok in, ~$5/MTok out
-- ============================================================

INSERT INTO agent_costs (agent_name, timestamp, model, tokens_in, tokens_out, cache_read, cache_write, cost_usd, session_id)
SELECT
  agent,
  ts,
  CASE WHEN agent = 'murph' THEN 'gemini-2.5-pro' ELSE 'claude-opus-4-6' END,
  tokens_in,
  tokens_out,
  cache_read,
  cache_write,
  CASE
    WHEN agent = 'murph' THEN
      ROUND((tokens_in * 1.25 + tokens_out * 5.0 + cache_read * 0.3) / 1000000.0, 6)
    ELSE
      ROUND((tokens_in * 15.0 + tokens_out * 75.0 + cache_read * 3.75 + cache_write * 3.75) / 1000000.0, 6)
  END,
  'seed-' || agent || '-' || EXTRACT(DOY FROM ts)::TEXT
FROM (
  SELECT
    a.agent,
    -- 3-5 sessions per agent per day over 14 days
    d.ts + (s.session_offset || ' hours')::INTERVAL AS ts,
    -- Tokens vary by agent role
    CASE a.agent
      WHEN 'tars' THEN 2000 + (random() * 3000)::INT
      WHEN 'cooper' THEN 4000 + (random() * 6000)::INT
      WHEN 'murph' THEN 5000 + (random() * 8000)::INT
      WHEN 'brand' THEN 1500 + (random() * 2500)::INT
      WHEN 'mann' THEN 3000 + (random() * 4000)::INT
      WHEN 'tom' THEN 2000 + (random() * 3000)::INT
      WHEN 'hashimoto' THEN 2500 + (random() * 3500)::INT
    END AS tokens_in,
    CASE a.agent
      WHEN 'tars' THEN 800 + (random() * 1200)::INT
      WHEN 'cooper' THEN 2000 + (random() * 4000)::INT
      WHEN 'murph' THEN 1500 + (random() * 3000)::INT
      WHEN 'brand' THEN 600 + (random() * 1000)::INT
      WHEN 'mann' THEN 1500 + (random() * 2500)::INT
      WHEN 'tom' THEN 1000 + (random() * 2000)::INT
      WHEN 'hashimoto' THEN 1200 + (random() * 2000)::INT
    END AS tokens_out,
    (random() * 5000)::INT AS cache_read,
    (random() * 2000)::INT AS cache_write
  FROM
    (VALUES ('tars'), ('cooper'), ('murph'), ('brand'), ('mann'), ('tom'), ('hashimoto')) AS a(agent),
    generate_series(now() - INTERVAL '14 days', now(), INTERVAL '1 day') AS d(ts),
    (VALUES (1), (4), (8), (11), (15)) AS s(session_offset)
) sub;
