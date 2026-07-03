# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server at http://localhost:3000
npm run build        # Production build
npm run lint         # ESLint (flat config, eslint-config-next)
npm run test         # Run Vitest once
npm run test:watch   # Vitest watch mode
npm run test:coverage
```

## Architecture

This is a **finance-only** app (the former AI-agent dashboard half was removed in June 2026). Deployed at `finance.autonomis.co` (single Vercel deployment).

### Routing

All pages live under `/finance/*`. The root `/` redirects to `/finance`. `src/middleware.ts` rewrites short paths (`/transactions` → `/finance/transactions`) for any host.

### Data Access Pattern

Server Components fetch directly via Supabase service role (`createSupabaseServer` in `src/lib/supabase-server.ts`). Interactive pages import a corresponding `*-client.tsx` Client Component from `src/components/finance/`, which queries with the anon browser client (`src/lib/supabase.ts`) and re-fetches on tab visibility change.

### Finance Concepts

- **Billing cycles**: `CYCLE_MONTHS` map (monthly=1, quarterly=3, annual=12, etc.) used to pro-rate recurring expenses and compare against budgets.
- **Coverage windows**: Transactions carry `coverage_start`/`coverage_end` for multi-month allocation.
- **Recurring processor**: `POST /api/finance/process-recurring` (Vercel cron, 12:00 UTC daily) auto-creates transactions for due subscriptions, income, and installments. Entry point for all scheduled finance automation.
- **Summary endpoint**: `GET /api/finance/summary` is the main aggregation — income, spending, budgets, subscriptions, debts, emergency fund, goals, crypto, cash flow projection.
- **Month keys**: use `monthKey(date)` from `finance-utils.ts` for `YYYY-MM` strings — never `toISOString().slice(0, 7)`, which shifts local midnights to the previous month in timezones behind UTC.
- **Owner casing**: canonical owner values are capitalized display names (`'Bernardo'`, `'Laura'` — see `src/lib/owners.ts`), but legacy rows and the processor's source tables hold lowercase. Always compare with `ownersEqual()` and canonicalize inserts with `canonicalOwner()`. Exception: `finance_recurring_income` and `finance_monthly_savings` deliberately use lowercase owners.
- **Big reads**: Supabase caps any single response at 1000 rows. For potentially-large tables (`finance_transactions`), fetch with `fetchAllRows()` from `src/lib/supabase-fetch-all.ts` — a bare `.select('*')` silently truncates.

Finance types live in `src/lib/finance-types.ts`; calculation utilities in `src/lib/finance-utils.ts`.

### API Auth

Finance API routes check (in order): `x-vercel-cron: 1`, `Authorization: Bearer {CRON_SECRET}`, `x-api-key` matching `FINANCE_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY`, or same-origin request (matching `Origin`/`Referer` headers).

### Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=     # server-side admin ops
FINANCE_API_KEY=               # external callers
CRON_SECRET=                   # custom cron auth
OPENAI_API_KEY=                # /api/finance/insights (preferred provider; OPENAI_MODEL overrides gpt-4o default)
ANTHROPIC_API_KEY=             # /api/finance/insights fallback when OPENAI_API_KEY is unset
```

### Testing

Vitest with jsdom. The Supabase client is mocked globally in `tests/setup.ts` with **generically chainable** query builders (any builder method returns the chain; awaiting resolves `{data: [], error: null, count: 0}`) plus a mocked `supabase.auth`. Framer Motion and `next/font/google` are also mocked globally. Page tests that re-mock `supabase.from` locally should use the same chainable pattern. Keep the suite green — update tests in the same change as the component.

### Database Migrations

SQL migration files are at repo root (`supabase-*.sql`). Run `supabase-run-all-pending-migrations.sql` to apply all pending ones against the Supabase project. The agent-dashboard tables (`agents`, `tickets`, `messages`, `agent_metrics`, `agent_costs`) may still exist in Supabase but are no longer used by the app.
