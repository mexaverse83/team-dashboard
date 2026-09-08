# Finance dashboard review — September 2026

This review focused on truthful financial numbers, repeatable automation, a responsive home screen, mobile entry, and the phone widget. Changes are local; no production data, goal balances, cron schedules, or deployments were modified.

## Implemented

| Area | Finding | Change |
| --- | --- | --- |
| Home totals | Only the latest 200 transactions contributed to the headline and owner totals. | Fetch every current-month transaction with deterministic pagination; exclude future-dated transactions and use the Mexico City calendar. |
| Data failures | An unsuccessful summary could render a plausible empty dashboard. | Explicit initial error/retry screen, retained last successful data on refresh failure, visible update time, request timeouts, and no overlapping home refreshes. |
| Summary | Query failures and partial pages silently reduced financial aggregates. Future-dated income counted as received. | Reject incomplete critical queries with 503; strict pagination for history aggregates; income received stops at today. |
| Forecast | A weekly payment was annualized to a monthly amount, then repeated weekly. Quarterly amounts had the opposite problem. | Schedule the actual payment amount at each frequency. Regression tests cover weekly payments. |
| Forecast dates | UTC day boundaries, month overflow, and ignored salary start dates distorted events. | Mexico City dates, clamped month-end recurrence, original subscription day retained within forecast/catch-up, and start-date filtering. |
| Spending room | Extra spending used a baseline income figure and could omit larger upcoming forecast commitments. | Shared calculation uses expected month income and reserves the larger of remaining budgets or forecast spending before goals. This is planning room, not a bank balance. |
| Widget | “Net this month” used expected income, rather than money received. | Received income minus spending for actual net; dashboard and phone share the same daily-plan calculations. |
| Performance | The daily brief called the widget endpoint, which called summary, WEST and insights again. | Home brief consumes the existing summary; zero widget-endpoint requests in the browser review. Hidden-tab polling stops, visible polling slows to once per minute, and overlapping brief requests are suppressed. |
| WEST consistency | Independently refreshed targets could diverge on a long-open page. | The home page owns one WEST target, refreshes it with the summary, and passes it to both the brief and projection card. |
| Chart loading | Collapsed forecast code was eagerly imported. | Dynamic import loads the forecast component when its section opens. |
| Month close | Every goal received the owner's entire surplus; retries could credit again after partial failure. | One PostgreSQL transaction serializes month close, snapshots and goal updates. Positive surplus is divided by planned contribution weights, capped at goal targets, rounded down to cents. Existing snapshots are not re-credited. |
| Deficits | Each goal could be reduced by the full monthly deficit and become negative. | Deficits remain in the savings snapshot; a deficit alone does not prove a withdrawal from a specific savings goal. |
| Automation failures | Duplicate-check failures could still allow inserts; some failures returned HTTP success. | Failed duplicate checks stop the affected insertion; failed budget checks stop rollover; processing errors defer month close and return 503 with structured results. |
| Currency | A USD recurring amount could be copied directly into `amount_mxn`. | Such postings are deferred with an explicit conversion-required error instead of recording a false exchange rate. |
| Mobile entry | Home “New transaction” only opened the transaction list. Dialogs could compete with fixed navigation. | Link opens the entry form directly; dialogs render in a body portal above navigation, with larger close controls. |
| Accessibility | Dialog focus escaped to the page and did not reliably return. | Initial dialog focus, Tab containment, Escape handling, focus restoration, and a skip-to-content link. |
| PWA | A network failure produced a browser error despite the claimed offline fallback. | Generic cached offline page containing no financial data. APIs and private HTML remain uncached. Push clicks navigate to their same-origin destination. |
| Widget recovery | Failed widget loads returned before scheduling a retry. | Retry scheduled even for errors; clear tap-to-open message and response-shape validation. |
| Rendering stability | Skeleton widths and chart gradient IDs used randomness during render. | Deterministic skeletons and React-generated unique gradient IDs. |

## Required migration and rollout

Apply `supabase-finance-atomic-month-close.sql` before deploying the new recurring processor. It creates `finance_close_month(date)` and grants execution only to `service_role`; it does not open RLS policies to browser roles. The server must have its existing `SUPABASE_SERVICE_ROLE_KEY` configured. No new environment variables are required.

The migration assumes the existing `finance_monthly_savings` and goal contribution columns are installed. It does not run the separate, pre-existing untracked SQL files or repair historical balances. If missing, month-close reports an explicit error and stops; it does not fall back to the unsafe previous goal-credit loop. Other successful recurring writes may already have happened before that error, so inspect the response's results before retrying.

Allocation example: an owner with $800 actual net savings and goal contribution weights of $300 and $100 receives $600 and $200 of goal progress, not $800 twice. A completed goal's unused share and cent-rounding residue remain unallocated. An owner's goals with no positive planned contributions receive no inferred allocation. These remain bookkeeping allocations, not bank transfers.

## Remaining findings and limits

- **Subscription/debt/MSI concurrency:** month close is serialized, but other recurring operations still use application-level duplicate lookups and separate writes. Run one processor at a time. A later migration should atomically insert each recurring transaction and update its linked debt/installment; existing historical rows need a duplicate audit before introducing uniqueness constraints. This review does not claim the entire recurring processor is atomic.
- **Historical goal accuracy:** earlier runs may already have multiplied savings or advanced goals after snapshot failures. Existing snapshots deliberately prevent automatic re-crediting. Reconcile past allocations with account balances before correcting history; this review did not inspect or rewrite live household data.
- **Payment scheduling:** the legacy income-source table lacks an explicit payment-date anchor. Its forecast assumes cycle boundaries; weekly cadence and monthly recurring-income posting still need a durable schedule model. `finance_recurring_income` posting currently uses the existing monthly policy, rather than enforcing its day-of-month field. Nonmonthly recurring income is still skipped by that processor.
- **Month-end recurrence anchors:** the new helper prevents February from skipping a month and preserves the original day within a single catch-up/forecast. Persisting the original billing day across separate processor runs needs a schema field; a stored February 28 alone cannot distinguish a 28th-day bill from a clamped 31st-day bill.
- **Currency coverage:** automatic foreign-currency posting is now blocked rather than guessed. Summary/forecast models still need a consistent dated FX source before claiming full multicurrency support.
- **Other pages:** older reporting clients retain their existing best-effort query behavior. The new strict loading path covers the home screen and summary aggregates, not every report. The broader lint backlog remains outside this patch.
- **Real devices and production:** Chromium tests use synthetic fixtures, not production credentials. iOS Scriptable and an installed-device offline/notification lifecycle require device verification. No claim of measured production speedup is made; the browser check verifies removed requests and deferred rendering.

## Validation

- Unit/component/API tests cover complete pagination, failed-refresh retention, direct transaction entry, shared widget figures, correct forecast payment amounts/dates, automation guards, focus management, and PWA privacy.
- The migration runs against an isolated PostgreSQL-compatible PGlite instance. Tests exercise retries, partial failures/rollback, historical owner snapshots, proportional allocation, cent rounding, deficits, goal caps, and denied browser-role execution.
- `scripts/finance-review-browser.mjs` intercepts financial API/database traffic with synthetic fixtures. It checks 360/390/768/1440px viewports, expanded forecast rendering, and the mobile entry dialog. Screenshots are in `artifacts/finance-review-2026-09/`.
- Final regression run: 333 tests across 34 files passed. Lint completed with zero errors and 26 existing warnings (down from 29). Browser checks reported zero page errors and zero widget-endpoint requests across five home loads. The production build passed, including TypeScript and generation of 48 pages. Existing Next.js warnings about workspace-root inference and the middleware convention remain.
