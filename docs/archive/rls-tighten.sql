-- =============================================
-- RLS Policy Tightening
-- Run in Supabase SQL Editor (Dashboard → SQL Editor)
-- =============================================
-- Before: USING (true) WITH CHECK (true) on all tables (wide open)
-- After: SELECT for anyone, INSERT/UPDATE/DELETE for service_role only
-- =============================================

-- Drop old wide-open policies
DROP POLICY IF EXISTS "Allow all" ON agents;
DROP POLICY IF EXISTS "Allow all" ON tickets;
DROP POLICY IF EXISTS "Allow all" ON comments;
DROP POLICY IF EXISTS "Allow all" ON messages;
DROP POLICY IF EXISTS "Allow all" ON agent_metrics;

-- Agents
CREATE POLICY "Read agents" ON agents FOR SELECT USING (true);
CREATE POLICY "Service write agents" ON agents FOR INSERT WITH CHECK ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');
CREATE POLICY "Service update agents" ON agents FOR UPDATE USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');
CREATE POLICY "Service delete agents" ON agents FOR DELETE USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- Tickets
CREATE POLICY "Read tickets" ON tickets FOR SELECT USING (true);
CREATE POLICY "Service write tickets" ON tickets FOR INSERT WITH CHECK ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');
CREATE POLICY "Service update tickets" ON tickets FOR UPDATE USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');
CREATE POLICY "Service delete tickets" ON tickets FOR DELETE USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- Comments
CREATE POLICY "Read comments" ON comments FOR SELECT USING (true);
CREATE POLICY "Service write comments" ON comments FOR INSERT WITH CHECK ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');
CREATE POLICY "Service update comments" ON comments FOR UPDATE USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');
CREATE POLICY "Service delete comments" ON comments FOR DELETE USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- Messages
CREATE POLICY "Read messages" ON messages FOR SELECT USING (true);
CREATE POLICY "Service write messages" ON messages FOR INSERT WITH CHECK ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');
CREATE POLICY "Service update messages" ON messages FOR UPDATE USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');
CREATE POLICY "Service delete messages" ON messages FOR DELETE USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- Agent Metrics
CREATE POLICY "Read agent_metrics" ON agent_metrics FOR SELECT USING (true);
CREATE POLICY "Service write agent_metrics" ON agent_metrics FOR INSERT WITH CHECK ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');
CREATE POLICY "Service update agent_metrics" ON agent_metrics FOR UPDATE USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');
CREATE POLICY "Service delete agent_metrics" ON agent_metrics FOR DELETE USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');
