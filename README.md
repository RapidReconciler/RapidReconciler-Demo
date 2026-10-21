# RRV8 &mdash; RapidReconciler V8

Design-exploration HTML pages for the next-generation RapidReconciler app.
**Not production.**

These are visual proposals &mdash; modern reimaginings of the live
RapidReconciler SPA (currently AngularJS / Bootstrap 3, served at
`staging-rr-spa.azurewebsites.net` and `rapidreconciler.getgsi.com`). They
render as standalone HTML so anyone can open them in a browser without a
build step, but they have no data wiring, no auth, and no real behavior.
Click anything and you'll get a visual hover state, but nothing meaningful
happens.

Use them for:

- **Stakeholder review** &mdash; "what if the page looked like this?"
- **Customer demos** &mdash; preview the V8 UI before it ships
- **Engineering reference** &mdash; a target layout to build toward

## Pages

- `inventory-reconciliation.html` &mdash; Inventory > Reconciliation
  (mockup of the page customers land on after the data refresh: variance
  breakdown, drill-down chart, out-of-balance history)

More pages will land here as the V8 design proceeds.

## Data hygiene

All visible data in these pages is **fictional or sanitized**. The values
match the staging Acme test-instance numbers for visual verisimilitude
(`$13,203.53` out of balance, `(280.51)` transactions, etc.) but Acme is
the generic fictional placeholder used elsewhere in the repo. No real
customer account numbers, doc numbers, or personal names appear.

## Local preview

The repo's static server serves these pages too &mdash; if you've got
`localhost:8765` running, open
`http://localhost:8765/RRV8/inventory-reconciliation.html`.
