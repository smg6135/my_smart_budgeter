# Mobile refinement

Stopped at the user's request on 2026-11-17. Current implementation and remaining work are saved for the next session. Do not treat the validation/release step as complete.

1. Fix native safe-area/bottom spacing, clipped amounts and narrow-screen layout.
2. Make Overview statistics-first: horizontal income/spent/saved, prominent month calendar, past summaries, active-plan allocation, minimal actions.
3. Open receipt uploads in the photo gallery with multiple selection; retain camera and batch review.
4. Simplify entries: horizontal sign/amount/currency, wheel selectors, today's date for new manual entries, preferred currencies, category. Preserve receipt dates and existing transaction dates.
5. Replace activity search/chips with standard filters and Apply filters.
6. Rebuild Settings: consistent full-width controls; separate currency preferences, region list and explained AI options; account action is Sign out.
7. Replace the plan landing page with a list and clickable details. Support draft, activate and deactivate; preserve existing budgets and historical plan snapshots.
8. Verify financial migration/lifecycle/history, filters, gallery batches, currency preferences and phone layouts. Run lint, typecheck, unit/browser tests and native release checks; deliver a new TestFlight build.

Assumptions: one active plan at a time. Expenses stay in the shared ledger; plans define income, allocation, bills and goals. Historical summaries use the plan recorded for the selected date. Service region controls API location only and does not change currencies.

Steps 1–7 are implemented in commit `030ae33`. Lint, typecheck, Expo dependency compatibility and 40 unit tests pass.

Migration keeps the existing ledger and budget. Older months use the migrated budget because previous versions did not retain past plan settings. New plan changes are dated snapshots. Deactivating or drafting a plan keeps its bills and goals; payments already recorded stay in the shared ledger.

## Handoff

- Native Release compilation, Apple Vision tests and startup through sign-in passed: [iOS CI](https://github.com/smg6135/my_smart_budgeter/actions/runs/43897584825).
- Backend and infrastructure CI passed. Browser CI passed 76/78 checks: [MVP CI](https://github.com/smg6135/my_smart_budgeter/actions/runs/43897585017).
- Two Safari checks failed: rapid amount input after closing the sign selector, and entering a manual exchange rate. Traces suggest popup focus restoration during animation. The follow-up disables modal animations on web while preserving native animations; this change is saved but its full verification is unfinished.
- Local browser runs were interrupted by machine sleep and then stopped at the user's request. Do not report them as a full pass.
- Signed iOS build **1.0.0 (3)** finished: [EAS build](https://expo.dev/accounts/mgsong19/projects/pocket-budget/builds/7be55b1f-fe16-43b9-9bbe-afe88211ac1d). It contains the redesign from `030ae33`; it has **not** been submitted to TestFlight. The later web animation change is not in that build.
- Existing Expo project linkage and App Store Connect app ID are committed. Provider keys, environment files, signed binaries, crash reports and scratch artifacts stay ignored.

Next session:

1. Run `npm run lint`, `npm run typecheck` and `npm test` in `apps/mobile`.
2. Recheck the two Safari cases, then run all 78 browser checks with `npm run test:e2e`; inspect any failure before release.
3. Verify Photos opens the native multi-select gallery, the iOS sign/currency wheels work, and bottom spacing/daily allowance fit a physical iPhone.
4. Build again if native behavior changes; submit the chosen verified build to the existing TestFlight app. Preserve the installed app and its device-local budgets.
