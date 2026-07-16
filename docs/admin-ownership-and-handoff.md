# Admin ownership & the go-live handoff

The Administrator walk (`tour/administrator.html`) *sells* the idea — "this role
is yours to own." This doc is the operational backing: what has to actually
happen so ownership is real at go-live, not just said in a demo.

## The pattern we're breaking

GSI keeps doing customers' RapidReconciler administration. Not by design — it
happens because no one on the customer side is ever named to own it. The instance
gets stood up, nobody's assigned, a question comes in, GSI answers it, and from
then on GSI *is* the administrator by default. Support never exits because the
role it's covering was never handed over.

The fix isn't a feature. It's making the ownership explicit **before** go-live, so
the customer names a person and that person expects the role.

## What the Administrator owns

Three pillars, matching the walk (one source — don't restate them differently in
presenter copy):

1. **Users and their access** — who signs in, what each role can see and do,
   adding and removing people.
2. **Keeping the data current** — a refresh schedule (nightly is typical); the
   product keeps itself up to date from there.
3. **The health of the instance** — a quick check at sign-in. That's most of it.

The load is genuinely light. That's the point to make: owning it is not a burden,
which removes the excuse for leaving it to GSI.

## The go-live handoff

- **Name the Administrator before go-live**, not after. If the role is unassigned
  at cutover, GSI backfills it and the pattern above repeats.
- **The handoff moment:** GSI hands over the keys — the customer's Administrator
  runs the instance from day one. GSI **supports the software**; the customer
  **runs their instance**. That line is the boundary.
- **What transfers:** user administration, the refresh schedule, the health check.
- **What GSI keeps:** the software itself — fixes, upgrades, real support
  escalations. Not day-to-day operation.

## How the demo uses this

The Administrator walk surfaces ownership *gently* to the prospect, so the
expectation is set during the sales conversation rather than discovered at go-live.
A prospect who understands the role is theirs before they sign is a customer who
assigns someone to it.

## Where this goes next

Kept in the demo repo for now (product-first phase). When the product go-live /
handoff docs are written (GSIRRTech side), this lesson feeds them — it's the
customer-ownership half of the support-exit story, not a demo-only idea.
