# Demo clone — Mario & Karla

A fully separate deployment of the finance dashboard with 100% synthetic data.
Nothing connects to the real household's database or keys.

## One-time setup (~10 minutes)

### 1. New Supabase project
1. supabase.com → **New project** (name it e.g. `finance-demo`, any region/password)
2. SQL Editor → paste all of **`demo/schema.sql`** → Run
   (should end with "demo schema complete — 25+ tables")
3. Project Settings → API: copy the **Project URL**, **anon key**, and **service_role key**

### 2. Seed Mario & Karla
From this repo on any machine with Node:

```bash
node demo/seed-demo.mjs --url https://YOURPROJECT.supabase.co --key SERVICE_ROLE_KEY --fresh
```

Re-run any time with `--fresh` to reset the world.

### 3. New Vercel project (same repo)
1. vercel.com → **Add New → Project** → import this same GitHub repo
   (a second project alongside the real one; name it e.g. `finance-demo`)
2. Environment variables:

```
NEXT_PUBLIC_SUPABASE_URL=        (demo project URL)
NEXT_PUBLIC_SUPABASE_ANON_KEY=   (demo anon key)
SUPABASE_SERVICE_ROLE_KEY=       (demo service_role key)
FINANCE_API_KEY=                 (any new random string, e.g. demo_sk_...)
NEXT_PUBLIC_DEMO_MODE=1
NEXT_PUBLIC_OWNER_A_NAME=Mario
NEXT_PUBLIC_OWNER_B_NAME=Karla
NEXT_PUBLIC_OWNER_A_EMAIL=mario@example.com
NEXT_PUBLIC_OWNER_B_EMAIL=karla@example.com
NEXT_PUBLIC_ALLOWED_EMAILS=friend1@gmail.com,friend2@gmail.com
NEXT_PUBLIC_APP_ORIGIN=https://finance-demo.vercel.app   (or custom domain)
```

3. Deploy. Share the URL — the couple logs in with any email on
   `NEXT_PUBLIC_ALLOWED_EMAILS` (Google sign-in, same flow as the real app).

## What demo mode changes
- Owner names/colors everywhere: Mario (blue) & Karla (pink)
- No fertility plan (env-gated out of summaries and plans)
- Ask Wolff replies instantly with a canned demo note (no daemon needed)
- A pre-seeded Wolff brief so Insights/widget/projection surfaces populate
- Their own fictional condo purchase: **Torre MIRA 12-B** ($4.85M, delivery Jun 2027)

## Never do
- Point `seed-demo.mjs --fresh` at the real project (it deletes rows).
- Reuse any real key (Supabase, FINANCE_API_KEY, VAPID) in the demo env.
