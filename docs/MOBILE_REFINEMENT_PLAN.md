# Mobile refinement

Mobile refinement and the chat keyboard correction are implemented. Build 1.0.0 (5) is uploaded to TestFlight. Browser checks pass; the new native startup CI and physical iPhone acceptance are still pending.

1. Fix native safe-area/bottom spacing, clipped amounts and narrow-screen layout.
2. Make Overview statistics-first: horizontal income/spent/saved, prominent month calendar, past summaries, active-plan allocation, minimal actions.
3. Open receipt uploads in the photo gallery with multiple selection; retain camera and batch review.
4. Simplify entries: horizontal sign/amount/currency, wheel selectors, today's date for new manual entries, preferred currencies, category. Preserve receipt dates and existing transaction dates.
5. Replace activity search/chips with standard filters and Apply filters.
6. Rebuild Settings: consistent full-width controls; separate currency preferences, region list and explained AI options; account action is Sign out.
7. Replace the plan landing page with a list and clickable details. Support draft, activate and deactivate; preserve existing budgets and historical plan snapshots.
8. Verify financial migration/lifecycle/history, filters, gallery batches, currency preferences and phone layouts. Run lint, typecheck, unit/browser tests and native release checks; deliver a new TestFlight build.

Assumptions: one active plan at a time. Expenses stay in the shared ledger; plans define income, allocation, bills and goals. Historical summaries use the plan recorded for the selected date. Service region controls API location only and does not change currencies.

Steps 1–7 are implemented in commit `030ae33`, with the Safari fix in `77d2ee7` and SDK patch alignment in `049e7a8`. Lint, typecheck, Expo dependency compatibility and 40 unit tests pass.

Migration keeps the existing ledger and budget. Older months use the migrated budget because previous versions did not retain past plan settings. New plan changes are dated snapshots. Deactivating or drafting a plan keeps its bills and goals; payments already recorded stay in the shared ledger.

## Validation

- Native Release compilation, three real Apple Vision tests and startup through sign-in passed after SDK patch alignment: [iOS CI](https://github.com/smg6135/my_smart_budgeter/actions/runs/44862193891).
- Backend, infrastructure and all **84 browser checks** passed with the chat keyboard correction: [MVP CI](https://github.com/smg6135/my_smart_budgeter/actions/runs/44872215657).
- The Safari focus fix disables modal animations on web while preserving native animations. Both previously failing cases passed three additional repeat runs on 2026-11-21.
- Expo SDK 58 patch packages are aligned on 2026-11-21. Dependency compatibility, local lint/typecheck and all **40 unit tests** pass after the update.
- Signed iOS build **1.0.0 (5)** finished: [EAS build](https://expo.dev/accounts/mgsong19/projects/pocket-budget/builds/f0fed36b-86b4-46b6-b565-25453d09eb46). Its bundle ID/version, keyboard-fix JavaScript bundle and required React Native startup symbol were verified. Its [TestFlight upload](https://expo.dev/accounts/mgsong19/projects/pocket-budget/submissions/65c8bb84-8862-4790-bcd4-aa8ca5109609) finished successfully.
- US and Singapore API health checks returned 200; protected FX endpoints returned 401 without authentication.
- Existing Expo project linkage and App Store Connect app ID are committed. Provider keys, environment files, signed binaries, crash reports and scratch artifacts stay ignored.

Remaining device acceptance:

1. Update the existing installation to build 5 through TestFlight when Apple processing finishes; keep device-local budgets.
2. Verify Photos opens the native multi-select gallery and HEIC batches scan on-device. Check camera and receipt review.
3. Verify the iOS sign/currency wheels, bottom spacing and daily allowance on the physical phone.
4. Activate another plan and navigate to past calendar dates. Confirm allocation, summaries and saved data after reopening.
5. In chat, open the keyboard and type/edit a long multiline draft. Verify input/caret/Send stay above the keyboard, history scrolls independently, and dismissal restores navigation.

## Chat keyboard correction

Build 4's chat composer was inside a long page scroll view with no native keyboard avoidance. The correction gives chat a bounded viewport, independently scrollable messages/proposals and a pinned multiline composer. Native keyboard padding moves the composer above the keyboard; header/tab chrome hides while typing and a dismiss control restores it. Input height is capped against available space, drafts survive viewport changes, and chat errors appear within the visible message area.

Implemented in `e28c9e4`. New regression checks cover shrinking/restoring phone viewport height, scrolling long history while typing, and long AI proposals. Local and CI runs pass all 84 browser checks; lint, typecheck and 40 unit tests also pass. Signed build 5 is uploaded. [Native startup CI](https://github.com/smg6135/my_smart_budgeter/actions/runs/44872215407) remains in progress. Browser viewport tests do not operate the real iOS keyboard, and the native startup check only verifies sign-in; confirm keyboard appearance/dismissal, caret visibility and Send on build 5 on a physical iPhone.
