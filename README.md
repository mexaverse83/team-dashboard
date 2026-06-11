# 💰 Finance Dashboard

Personal finance dashboard for Bernardo & Laura — budgets, transactions, investments, debt payoff, and AI-powered insights. Deployed at **finance.autonomis.co**.

## Pages

**Track** — Overview (command center), Transactions, Budgets, Subscriptions, Income, Investments
**Plan** — Budget Builder, MSI Tracker, Debt Planner, Emergency Fund, Goals
**Analyze** — Insights (AI), Audit, Reports, Auto Rules

## Key Features

- **Recurring processor** — daily Vercel cron auto-creates transactions for subscriptions, salaries, and MSI installments; rolls budgets over month to month; snapshots savings and advances goals
- **Billing cycles & coverage windows** — non-monthly categories (bimonthly utilities, annual fees) pro-rated correctly against budgets
- **BBVA statement import** — client-side PDF parsing
- **AI insights** — Claude-generated monthly analysis with 24h cache
- **Investments hub** — GBM funds, crypto, private equity, WEST real-estate projection, retirement (AFORE)

## Tech Stack

- **Framework:** Next.js 16 + React 19 + TypeScript
- **Styling:** Tailwind CSS 4 + Radix primitives
- **Backend:** Supabase (PostgreSQL)
- **Deployment:** Vercel (single app, crons at 12:00/12:30 UTC)

## Development

```bash
npm install
npm run dev    # http://localhost:3000
npm run build  # production build
npm run test   # Vitest
npm run lint   # ESLint
```

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
FINANCE_API_KEY=
CRON_SECRET=
ANTHROPIC_API_KEY=
```
