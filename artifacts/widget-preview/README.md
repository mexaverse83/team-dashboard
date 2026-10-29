# Widget previews

`npm run widget:preview` renders `src/widget/finance-widget.js` through the
Scriptable mock in `tests/widget-harness/` and writes one PNG (plus the HTML it
was rendered from) per family, appearance and edge case into
`$TMPDIR/widget-preview/` (outside the repo), with `report.json` listing clipped
text, tap targets and the smallest rendered font per render (including text
drawn into images). The command exits non-zero when anything is clipped or under 11pt.
It also refreshes `src/widget/finance-widget.source.ts`, the bundled copy the
`/api/finance/widget-code` route serves (or run `node src/widget/sync-source.mjs`).

    npm run widget:preview                              # everything
    npm run widget:preview -- --only medium,large       # a subset
    npm run widget:preview -- --fixture saved.json      # a saved GET /api/finance/widget
    npm run widget:preview -- --out artifacts/widget-preview

If you do pass `--out` into this folder, don't commit the renders. Known
fidelity limits: SF fonts are substituted (Inter), and spacing differs from iOS
by about 1–2pt.
