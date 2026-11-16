# Mobile refinement

1. Fix native safe-area/bottom spacing, clipped amounts and narrow-screen layout.
2. Make Overview statistics-first: horizontal income/spent/saved, prominent month calendar, past summaries, active-plan allocation, minimal actions.
3. Open receipt uploads in the photo gallery with multiple selection; retain camera and batch review.
4. Simplify entries: horizontal sign/amount/currency, wheel selectors, today's date for new manual entries, preferred currencies, category. Preserve receipt dates and existing transaction dates.
5. Replace activity search/chips with standard filters and Apply filters.
6. Rebuild Settings: consistent full-width controls; separate currency preferences, region list and explained AI options; account action is Sign out.
7. Replace the plan landing page with a list and clickable details. Support draft, activate and deactivate; preserve existing budgets and historical plan snapshots.
8. Verify financial migration/lifecycle/history, filters, gallery batches, currency preferences and phone layouts. Run lint, typecheck, unit/browser tests and native release checks; deliver a new TestFlight build.

Assumptions: one active plan at a time. Expenses stay in the shared ledger; plans define income, allocation, bills and goals. Historical summaries use the plan recorded for the selected date. Service region controls API location only and does not change currencies.

Steps 1–7 are implemented. Lint, typecheck, Expo dependency compatibility and 40 unit tests pass. Browser and native release validation are in progress.

Migration keeps the existing ledger and budget. Older months use the migrated budget because previous versions did not retain past plan settings. New plan changes are dated snapshots. Deactivating or drafting a plan keeps its bills and goals; payments already recorded stay in the shared ledger.
