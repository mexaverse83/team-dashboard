# Frontend refinement — September 2026

The first review concentrated on financial accuracy and reliability. This follow-up changes the home screen's information hierarchy, layout, and interactions.

- Current savings and the month-end forecast are adjacent on desktop and consecutive on mobile. The forecast is no longer below the full assistant panel.
- A compact header combines the month, freshness, refresh, and transaction entry. Mobile uses the existing navigation's add button instead of showing another one.
- Daily spending gets a separate three-part control. Each amount opens its explanation; the weekly explanation distinguishes the category envelope from a tighter WEST target when relevant.
- Mona's briefing uses a shorter card, with additional commentary under an expandable section. Full-brief navigation and notification controls remain available.
- Suggested questions carry their text into chat. They are editable and are not sent automatically.
- Budget watch highlights up to three exceptions, their actual spending, and the projected excess, with a direct link to budgets. A household without budgets gets a setup action.
- The household snapshot shows net worth, the emergency buffer, and committed income. Each card opens its corresponding page. Owner spending remains in recent activity.
- The install prompt appears after the financial content instead of occupying the top of the page.
- Surfaces and colors are quieter: primary actions use mint, forecast numbers are distinct from actuals, and alerts retain amber emphasis.

Validation: 339 tests pass, including six new interaction tests. The production build passes. Lint completes with zero errors and 24 existing warnings. The browser check uses synthetic financial fixtures at 360, 390, 768, and 1440px; it also exercises spending explanations, expanded cash flow, mobile entry, and chat prefill. Screenshots are in `artifacts/finance-frontend-2026-09/`.

The final same-fixture comparison reduced the 390px page height from 2,392px to 1,970px (about 18%) while adding budget watch. The forecast also moved much earlier in the reading order. These are fixture-layout measurements, not production performance measurements; real briefs and family-plan cards vary in length.

No database migration or changes to the financial calculations are part of this frontend update.
