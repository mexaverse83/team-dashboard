# Mobile finance review — September 2026

This pass preserves the dashboard's visual identity and focuses on phone interactions, especially transaction entry.

## Fixed

- Transaction amounts accept decimal-point and decimal-comma keyboards, plus unambiguous grouped amounts. Malformed input is rejected instead of silently truncated; USD conversion must be finite and positive.
- A synchronous save guard prevents double submissions. New drafts keep the same database ID across retries, preventing a second insert if the first request committed but its response was lost. Ambiguous saves tell the user to check history.
- Rejected saves release the saving state and retain entered fields. Errors sit next to the pinned save control. Amount text reserves space for the currency label.
- New transactions use the date when the form opens, including after midnight. Rules and duplicate checks use converted MXN; expense/income duplicates are separated. Editing clears removed coverage dates correctly, and categories are validated against transaction type.
- Failed transaction refreshes preserve the previous list and expose a retry action. Pagination requests complete data in a stable order, and deleting the last item on a page no longer strands the list on an empty page. Failed deletes report an error.
- PDF parsing loads only when importing a PDF, rather than alongside everyday entry.
- Shared dialogs track the visual viewport as the keyboard opens or pans. Headers and footers do not shrink; the form body scrolls independently. Focus trapping excludes controls hidden by responsive ancestors and respects an already focused input.
- The mobile menu releases the page when using the dock, navigating to a different route, or rotating into desktop navigation.
- Phone form fields, including portaled investment dialogs and chat, avoid iPhone's small-input focus zoom.
- Subscription names and amounts have their own row; actions move below and edit/pause controls are accessible. Recurring income's header no longer squeezes its add button.
- Chat wraps long content and preserves a failed question for retry after a network exception.
- Goal date-only deadlines are parsed as local calendar dates, preventing first-of-month deadlines from displaying or calculating against the previous month.

## Validation

The browser harness in `scripts/finance-review-browser.mjs` intercepts every finance API/Supabase request and uses synthetic fixtures. Run with `MOBILE_REVIEW=1` against the development-only auth bypass. Screenshots are in `artifacts/finance-mobile-2026-09/`.

Coverage: overview at 360/390/768/1440 px; transaction entry and chat; all 16 remaining finance routes at 360 px; populated income, budget, subscription, installment, debt and goal cards; error-boundary detection; a simulated 380 px visual viewport; dock navigation with the menu open; rotation to 844 px.

Regression tests cover decimal parsing, malformed amounts, duplicate submission prevention, retained draft IDs and values after failure, menu unlocking, and calendar dates. Validation results: 354 tests passed across 35 files; the final focused rerun passed 86 tests. Lint has zero errors and 24 existing warnings. The production build passed.

## Limits

Keyboard behavior is browser-emulated, not a physical iPhone/Android keyboard test. Investment holdings and several specialist states use empty fixtures; this is not an exhaustive audit of every account-specific combination or native home-screen widget. No real financial records or automation were triggered during browser testing. Existing repository lint warnings remain.
