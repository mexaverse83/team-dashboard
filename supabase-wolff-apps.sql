-- One-paste setup for Wolff chat + push notifications.
-- Run in Supabase Dashboard → SQL Editor → Run.

-- 1. Web push subscriptions (PWA daily-brief notifications)
CREATE TABLE IF NOT EXISTS finance_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT NOT NULL UNIQUE,
  subscription JSONB NOT NULL,
  owner TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE finance_push_subscriptions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='finance_push_subscriptions' AND policyname='all access push subs') THEN
    CREATE POLICY "all access push subs" ON finance_push_subscriptions FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 2. Ask-Wolff chat messages. role: 'user' | 'wolff'. status on user rows:
--    'pending' → picked up by the home-machine daemon → 'answered' | 'failed'.
CREATE TABLE IF NOT EXISTS finance_wolff_chat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL CHECK (role IN ('user', 'wolff')),
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'done',
  reply_to UUID REFERENCES finance_wolff_chat(id) ON DELETE SET NULL,
  asked_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wolff_chat_created ON finance_wolff_chat(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wolff_chat_pending ON finance_wolff_chat(status) WHERE status = 'pending';
ALTER TABLE finance_wolff_chat ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='finance_wolff_chat' AND policyname='all access wolff chat') THEN
    CREATE POLICY "all access wolff chat" ON finance_wolff_chat FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

SELECT 'wolff apps setup complete' AS result;
