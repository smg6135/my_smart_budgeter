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

1. Update the existing installation to build 7 through TestFlight when Apple processing finishes; keep device-local budgets.
2. Verify Photos opens the native multi-select gallery and HEIC batches scan on-device. Check camera and receipt review.
3. Verify the iOS sign/currency wheels, bottom spacing and daily allowance on the physical phone.
4. Activate another plan and navigate to past calendar dates. Confirm allocation, summaries and saved data after reopening.
5. In chat, open the keyboard and type/edit a long multiline draft. Verify input/caret/Send stay above the keyboard, history scrolls independently, and dismissal restores navigation.

## Chat keyboard correction

Build 4's chat composer was inside a long page scroll view with no native keyboard avoidance. The correction gives chat a bounded viewport, independently scrollable messages/proposals and a pinned multiline composer. Native keyboard padding moves the composer above the keyboard; header/tab chrome hides while typing and a dismiss control restores it. Input height is capped against available space, drafts survive viewport changes, and chat errors appear within the visible message area.

Implemented in `e28c9e4`. New regression checks cover shrinking/restoring phone viewport height, scrolling long history while typing, and long AI proposals. Local and CI runs pass all 84 browser checks; lint, typecheck and 40 unit tests also pass. Signed build 5 is uploaded. The subsequent [native startup CI](https://github.com/smg6135/my_smart_budgeter/actions/runs/44872215407) was cancelled; the last completed native launch check is linked above. Browser viewport tests do not operate the real iOS keyboard, and the native startup check only verifies sign-in; confirm keyboard appearance/dismissal, caret visibility and Send on build 5 on a physical iPhone.


## Automatic receipt import

Implemented in `121402e`: selecting Photos/Camera starts analysis immediately. Clear receipts auto-add with Undo and exact-photo duplicate detection. Uncertain receipts open one editable batch screen; Retry/manual entry and optional confirmed cloud analysis resolve failures. There are no queue/process/save-ready actions. Apple Foundation Models reviews and categorizes OCR text locally on eligible iOS 26+ devices; unavailable models fall back to deterministic Vision parsing. The model cannot rewrite financial fields.

Local verification passes: 45 unit tests, 90 browser checks and three real Vision tests, lint/typecheck and Expo compatibility. [MVP CI](https://github.com/smg6135/my_smart_budgeter/actions/runs/44882703239) passes backend, infrastructure and all 90 browser checks. Signed build 7 compiles the new native modules; [native simulator launch](https://github.com/smg6135/my_smart_budgeter/actions/runs/44880406672) and [TestFlight submission](https://expo.dev/accounts/mgsong19/projects/pocket-budget/submissions/8813b38e-731e-4136-9e07-f5905a2ddcca) both pass. Actual on-device model inference requires an eligible physical phone, with Apple Intelligence enabled and disabled to test both paths.

Build 7 also keeps Undo from reopening correction and labels cloud analysis accurately (`e9d9629`). CI exposed browser timing races in the earlier chat checks; `152f6a6` waits for layout/focus before asserting the same behavior. Twelve targeted repeat checks pass locally. Authenticated cloud OCR checks need renewed operator GCP credentials; this does not affect customer sign-in or the GitHub deployment identity.


Web chat focus correction (`cf9b80a`): React Native Web's `on-drag` setting dismisses the keyboard for programmatic scroll events too. The web message history now uses `none`; native dismissal behavior is unchanged. The browser check waits for layout, taps the field and verifies focus after the scroll-end callback. The old app fails that focus assertion; the corrected app passes 20 targeted mobile/Safari repeat checks. This web-only correction does not require another native binary after build 7.

Final [MVP CI](https://github.com/smg6135/my_smart_budgeter/actions/runs/44882703239) passes all 90 browser checks, 45 mobile unit tests, 48 API tests and infrastructure validation after the web focus correction. Native build 7 has separate completed Release launch validation; a further native CI run for the web-only commit may still be running. [API release #4](https://github.com/smg6135/my_smart_budgeter/pull/4) is merged. Both API health checks return 200 and anonymous FX calls return 401. Operator reauthentication is still required to inspect Argo/pod image state and run authenticated live OCR.
