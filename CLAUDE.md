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
npm run typecheck    # tsc --noEmit -p .
npm run test:widget  # widget harness (tests/widget-harness)
npm run widget:preview  # render the Scriptable widget against fixtures
npm run rls:check    # anon-key RLS probe (manual; talks to live Supabase)
```

CI (`.github/workflows/ci.yml`) runs on every push/PR: `npm ci` → `lint --max-warnings 27` (a ratchet: lower it as warnings are fixed) → `typecheck` → `npm test` → `knip` (report-only). The RLS check runs only from a manual dispatch.

## Architecture

This is a **finance-only** app (the former AI-agent dashboard half was removed in June 2026). Deployed at `finance.autonomis.co` (single Vercel deployment).

### Routing

All pages live under `/finance/*`. The root `/` redirects to `/finance`. `src/proxy.ts` (Next 16's name for middleware) rewrites short paths (`/transactions` → `/finance/transactions`) for any host; its matcher excludes `/api`, `/_next`, `/icons`, `/brand` and the PWA files, so it only runs for pages.

### Data Access Pattern

- **Pages** are thin server wrappers that render a `*-client.tsx` Client Component from `src/components/finance/`. Clients read either with the anon browser client (`src/lib/supabase.ts`, the user's session under RLS) or through `/api/finance/*`.
- **API routes** use `getAdminClient()` / `getAdminClientInfo()` from `src/lib/supabase-admin.ts` (service role). In production a missing `SUPABASE_SERVICE_ROLE_KEY` throws `ConfigError` → answer with `configErrorResponse()` (503). In dev the anon key is allowed only with `NEXT_PUBLIC_AUTH_BYPASS=1`, flagged `degraded` (`withDegradedHeader`). Never fall back to the anon key silently, and never return 200 + empty arrays on a read error: return 5xx with `{ error }` so the UI shows "couldn't load" instead of $0.
- `createSupabaseServer` (`src/lib/supabase-server.ts`) is the **anon + cookies** client used only to read the session in `finance-api-auth.ts`; it is not a service-role client.
- **Client fetching**: use `useFinanceData(key, fetcher)` (`src/hooks/use-finance-data.ts`: abort, out-of-order guard, last-good data, resume refresh) or `useResumeRefresh` instead of hand-rolled `visibilitychange` effects. Mutations dispatch `finance:data-changed` (`src/lib/finance-events.ts`).
- Server-side aggregations live in `src/lib/server/` (`buildSummary`, `getWestProjection`); call them in-process rather than self-fetching `/api/*` over HTTP.

### Finance Concepts

- **Billing cycles**: `CYCLE_MONTHS` map (monthly=1, quarterly=3, annual=12, etc.) used to pro-rate recurring expenses and compare against budgets.
- **Coverage windows**: Transactions carry `coverage_start`/`coverage_end` for multi-month allocation.
- **Recurring processor**: `POST /api/finance/process-recurring` (Vercel cron, 12:00 UTC daily) auto-creates transactions for due subscriptions, income, and installments. Entry point for all scheduled finance automation.
- **Summary endpoint**: `GET /api/finance/summary` is the main aggregation — income, spending, budgets, subscriptions, debts, emergency fund, goals, crypto, cash flow projection.
- **Month keys**: use `monthKey(date)` from `finance-utils.ts` for `YYYY-MM` strings — never `toISOString().slice(0, 7)`, which shifts local midnights to the previous month in timezones behind UTC.
- **Owner casing**: canonical owner values are capitalized display names (`'Bernardo'`, `'Laura'` — see `src/lib/owners.ts`), but legacy rows and the processor's source tables hold lowercase. Always compare with `ownersEqual()` and canonicalize inserts with `canonicalOwner()`. Exception: `finance_recurring_income` and `finance_monthly_savings` deliberately use lowercase owners.
- **Big reads**: Supabase caps any single response at 1000 rows. For potentially-large tables (`finance_transactions`), fetch with `fetchAllRows()` from `src/lib/supabase-fetch-all.ts` — a bare `.select('*')` silently truncates. Offset paging needs a total order: always add a unique tiebreaker (`.order('transaction_date').order('id')`) and prefer the options form `fetchAllRows(page, { orderKey: 'id' })`, which is strict by default and throws (outside production) when the tiebreaker is missing.
- **Dates**: never `toISOString().slice(...)` (UTC; after 18:00 in Mexico City it is already tomorrow). Use `src/lib/dates.ts` (`localDateKey`, `monthKey`, `mexicoCityToday`, `monthEndKey`, …). ESLint enforces this (`no-restricted-syntax`); the legacy-file allowlist in `eslint.config.mjs` only shrinks.
- **Formatting**: money, percentages, deltas, coin prices and dates go through `src/lib/format.ts` (`formatMoney`, `formatCompact`, `formatDelta`, `formatPct`, `formatCoinPrice`, `formatDateShort`, `formatMonthShort`). No local `fmt`/`fmtMXN`/`cn` copies (`cn` is in `src/lib/utils.ts`).

Finance types live in `src/lib/finance-types.ts`; calculation utilities in `src/lib/finance-utils.ts`; the `/api/finance/summary` response type is `SummaryResponse` in `src/lib/summary/types.ts`.

### UI, theme and charts

- The default theme is **dark** ("Wolff Midnight"); a Light theme and a System option exist via `ThemeToggle` (`src/lib/theme.ts`, stored under `mona:theme`). Style with the semantic tokens in `globals.css` (`bg-surface`, `text-fg-secondary`, `text-positive`, `*-owner-a`, `--cat-1..8`, …) so both themes work; no new raw hex/hsl literals in components and no `text-*-300/400` on light surfaces.
- Build pages from the primitives in `src/components/ui/` (`Page`/`PageHeader`, `Card`, `Stat`, `MoneyText`, `ProgressBar`, `StatusPill`, `OwnerAvatar`, `ErrorState`, `Button`, `Segmented`, `Tabs`, `Modal`). Money values carry `data-money` so the privacy toggle can blur them.
- Charts use the token-driven kit in `src/lib/chart-theme.ts` / `src/components/ui/finance-chart.tsx` (`chartTooltipProps`, `<ChartGrid/>`, `<ChartLegend/>`, `<ChartFigure summary>`).
- Investments (`/finance/investments`) is split per tab under `src/components/finance/investments/` (pure math in `portfolio.ts`, generic `HoldingFormModal`); tabs load with `next/dynamic`. `/finance/crypto` redirects to the Crypto tab.
- Design changes are judged on screenshots: dark and light at 390×844 and 1440×900, read-only (abort every non-GET request except GET preflights).

### PWA

`public/sw.js`: cache-first for `/_next/static`, `/icons`, the manifest; stale-while-revalidate for `/brand`; API calls and pages are network-only. New versions wait for the "Update ready — tap to reload" toast in `pwa-register.tsx` (no automatic `skipWaiting`). Bump `CACHE` when the strategy changes. Brand images stay ≤50KB (128px PNG + WebP; enforced by `tests/lib/pwa-assets.test.ts`).

### API Auth

`authorizeFinanceRequest()` in `src/lib/finance-api-auth.ts` checks, in order:
1. Dev bypass: `NODE_ENV=development` and `NEXT_PUBLIC_AUTH_BYPASS=1` (never true in a deployed build).
2. `x-api-key` matching `FINANCE_API_KEY` (or, for now, `SUPABASE_SERVICE_ROLE_KEY`; slated for removal).
3. Cron routes only (`allowCron`): `Authorization: Bearer {CRON_SECRET}` or `x-vercel-cron: 1`.
4. A Supabase session cookie whose email is in the allow-list (`isAllowedEmail` in `src/lib/auth.ts`).
Otherwise 401. There is no same-origin/Referer path: browser calls authenticate with the session cookie, so never ship a key in `NEXT_PUBLIC_*` (lint-enforced).

### Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=     # API routes (getAdminClient); required in production
NEXT_PUBLIC_AUTH_BYPASS=       # dev only: '1' skips login and lets API routes use the anon key (degraded)
FINANCE_API_KEY=               # external callers
CRON_SECRET=                   # custom cron auth
OPENAI_API_KEY=                # /api/finance/insights (preferred provider; OPENAI_MODEL overrides gpt-4o default)
ANTHROPIC_API_KEY=             # /api/finance/insights fallback when OPENAI_API_KEY is unset
VAPID_PRIVATE_KEY=             # web push sender (scripts/send-push.mjs); the public key is in src/lib/push-config.ts
WIDGET_READ_TOKENS=            # read-only tokens for the phone widget (optional; falls back to FINANCE_API_KEY)
```

### Testing

Vitest with jsdom. Seed fixtures live in `tests/fixtures/seed-finance.ts` (the `@/lib/seed-finance` import is a temporary alias in `vitest.config.ts`/`tsconfig.json`; new tests import the fixture path). The Supabase client is mocked globally in `tests/setup.ts` with **generically chainable** query builders (any builder method returns the chain; awaiting resolves `{data: [], error: null, count: 0}`) plus a mocked `supabase.auth`. Framer Motion and `next/font/google` are also mocked globally. Page tests that re-mock `supabase.from` locally should use the same chainable pattern. Keep the suite green — update tests in the same change as the component.

### Database Migrations

SQL migration files are at repo root (`supabase-*.sql`); new ones are named `supabase-YYYY-MM-<topic>.sql` and appended to `supabase-run-all-pending-migrations.sql`, which applies all pending ones against the Supabase project. Agent-dashboard docs and `rls-tighten.sql` are archived in `docs/archive/`. The agent-dashboard tables (`agents`, `tickets`, `messages`, `agent_metrics`, `agent_costs`) may still exist in Supabase but are no longer used by the app.
