# Widget previews

`npm run widget:preview` renders `src/widget/finance-widget.js` through the
Scriptable mock in `tests/widget-harness/` and writes one PNG (plus the HTML it
was rendered from) per family, appearance and edge case into this folder, with
`report.json` listing clipped text, tap targets and the smallest font per render.
The command exits non-zero when anything is clipped or under 11pt.

    npm run widget:preview                              # everything, 46 renders
    npm run widget:preview -- --only medium,large       # a subset
    npm run widget:preview -- --fixture saved.json      # a saved GET /api/finance/widget
    npm run widget:preview -- --out /tmp/shots

The renders are build output: don't commit them. Known fidelity limits: SF fonts
are substituted (Inter), and spacing differs from iOS by about 1–2pt.
