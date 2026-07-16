# tour/ — the presenter layer

The demo-specific content we author. This is the only hand-written part of the
demo; `bundle/` is generated and `publish/` is tooling.

## Flow

1. **Intro + archetype picker.** The prospect (or the presenter, from the
   discovery call) reads three short business descriptions and picks the closest
   fit. See `company-archetypes.md`. The choice sets which demo dataset the tour
   runs against.
2. **Role tours.** Each archetype branches into the same three role tours:
   - **Analyst** — find a variance, validate against JDE, decide the fix. Cardex
     and transaction variance.
   - **Accountant** — the suggested JE, per-company disposition, close.
   - **Admin** — light; the setup surfaces.
3. **Presenter script per role.** Bud drives. Each step carries what to click, what
   it proves to the prospect, and the one value line to say. Written so a presenter
   with little RapidReconciler depth can run it cold and identically every time.

## Design notes

- The tour is presenter-driven, not self-serve, unless we later decide it needs to
  survive a prospect clicking through unattended (a leave-behind). That decision
  changes how much the script hand-holds.
- The role-tour talking points are close cousins of the analyst training spine
  (UI-40 in the product backlog): same knowledge, framed to present to a buyer
  rather than to teach a user. Draw from one source; do not author twice.
- Keep the tour definition and the publish capture list as one thing, so a screen
  the tour visits always has a captured fixture.
